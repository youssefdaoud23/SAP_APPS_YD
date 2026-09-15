'use strict';

const crypto = require('crypto');
const database = require('../lib/database');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body != null) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 6 * 1024 * 1024) throw Object.assign(new Error('Deployment payload exceeds 6 MB.'), { statusCode: 413 });
    chunks.push(part);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function clean(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
  return result;
}

function snapshotInfo(application) {
  if (!application || typeof application !== 'object' || Array.isArray(application)) throw Object.assign(new Error('application must be an object.'), { statusCode: 400 });
  const appId = clean(application.id, 160);
  const appName = clean(application.name || application.title, 240);
  if (!appId) throw Object.assign(new Error('application.id is required.'), { statusCode: 400 });
  if (!appName) throw Object.assign(new Error('application.name is required.'), { statusCode: 400 });
  if (!Array.isArray(application.pages)) throw Object.assign(new Error('application.pages must be an array.'), { statusCode: 400 });
  const snapshot = stableValue(application);
  const serialized = JSON.stringify(snapshot);
  return {
    appId,
    appName,
    snapshot,
    checksum: crypto.createHash('sha256').update(serialized).digest('hex')
  };
}

function requireDatabase(res) {
  if (database.enabled()) return true;
  send(res, 503, { error: 'PostgreSQL is required for deployment management.' });
  return false;
}

function requirePermission(req, res, permission) {
  if (hasPermission(req.principal, permission)) return true;
  send(res, 403, { error: `Permission ${permission} is required.` });
  return false;
}

async function getEnvironment(key, client = database.getPool()) {
  const result = await client.query(`
    SELECT environment_key AS "key", name, stage, sort_order AS "sortOrder", protected,
           connection_aliases AS "connectionAliases", builtin,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM platform_environments WHERE environment_key=$1
  `, [key]);
  if (!result.rowCount) throw Object.assign(new Error(`Environment ${key} was not found.`), { statusCode: 404 });
  return result.rows[0];
}

async function listEnvironments() {
  const result = await database.getPool().query(`
    SELECT e.environment_key AS "key", e.name, e.stage, e.sort_order AS "sortOrder", e.protected,
           e.connection_aliases AS "connectionAliases", e.builtin,
           e.created_at AS "createdAt", e.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM platform_deployments d WHERE d.environment_key=e.environment_key) AS "deploymentCount"
    FROM platform_environments e
    ORDER BY e.sort_order, e.environment_key
  `);
  return result.rows;
}

async function saveEnvironment(req) {
  const input = await readBody(req);
  const key = clean(input.key, 40).toUpperCase();
  const name = clean(input.name, 160);
  const stage = clean(input.stage || 'custom', 40).toLowerCase();
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100;
  const protectedEnvironment = Boolean(input.protected);
  const aliases = input.connectionAliases && typeof input.connectionAliases === 'object' && !Array.isArray(input.connectionAliases) ? input.connectionAliases : {};
  if (!/^[A-Z0-9_-]{2,40}$/.test(key)) throw Object.assign(new Error('Environment key must use 2-40 uppercase letters, numbers, underscore or hyphen.'), { statusCode: 400 });
  if (!name) throw Object.assign(new Error('Environment name is required.'), { statusCode: 400 });
  if (!['development', 'test', 'production', 'custom'].includes(stage)) throw Object.assign(new Error('Invalid environment stage.'), { statusCode: 400 });

  await database.getPool().query(`
    INSERT INTO platform_environments(environment_key,name,stage,sort_order,protected,connection_aliases,builtin)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,false)
    ON CONFLICT (environment_key) DO UPDATE SET
      name=EXCLUDED.name,
      stage=EXCLUDED.stage,
      sort_order=EXCLUDED.sort_order,
      protected=EXCLUDED.protected,
      connection_aliases=EXCLUDED.connection_aliases,
      updated_at=NOW()
  `, [key, name, stage, sortOrder, protectedEnvironment, JSON.stringify(aliases)]);
  await database.audit('environment.saved', req.principal?.username, 'environment', key, { name, stage, protected: protectedEnvironment, aliases: Object.keys(aliases) });
  return getEnvironment(key);
}

async function deleteEnvironment(req, key) {
  const environment = await getEnvironment(key);
  if (environment.builtin) throw Object.assign(new Error('Built-in environments cannot be deleted.'), { statusCode: 409 });
  const count = await database.getPool().query('SELECT COUNT(*)::int AS count FROM platform_deployments WHERE environment_key=$1 OR source_environment_key=$1', [key]);
  if (count.rows[0].count > 0) throw Object.assign(new Error('Environment has deployment history and cannot be deleted.'), { statusCode: 409 });
  await database.getPool().query('DELETE FROM platform_environments WHERE environment_key=$1', [key]);
  await database.audit('environment.deleted', req.principal?.username, 'environment', key, { name: environment.name });
}

async function insertDeployment(client, req, params) {
  const id = crypto.randomUUID();
  await client.query(`
    INSERT INTO platform_deployments(
      deployment_id, app_id, app_name, version_id, version_label,
      environment_key, source_environment_key, status, action,
      application_snapshot, checksum, release_notes, parent_deployment_id,
      deployed_by, deployed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'deployed',$8,$9::jsonb,$10,$11,$12,$13,NOW())
  `, [
    id,
    params.appId,
    params.appName,
    params.versionId || null,
    params.versionLabel || null,
    params.environmentKey,
    params.sourceEnvironmentKey || null,
    params.action || 'deploy',
    JSON.stringify(params.snapshot),
    params.checksum,
    params.releaseNotes || '',
    params.parentDeploymentId || null,
    req.principal?.username || null
  ]);
  return id;
}

async function deploymentById(id, client = database.getPool()) {
  const result = await client.query(`
    SELECT d.deployment_id AS "id", d.app_id AS "appId", d.app_name AS "appName",
           d.version_id AS "versionId", d.version_label AS "versionLabel",
           d.environment_key AS "environmentKey", e.name AS "environmentName", e.stage AS "environmentStage",
           d.source_environment_key AS "sourceEnvironmentKey", d.status, d.action,
           d.application_snapshot AS "application", d.checksum,
           d.release_notes AS "releaseNotes", d.parent_deployment_id AS "parentDeploymentId",
           d.deployed_by AS "deployedBy", d.deployed_at AS "deployedAt"
    FROM platform_deployments d
    JOIN platform_environments e ON e.environment_key=d.environment_key
    WHERE d.deployment_id=$1
  `, [id]);
  if (!result.rowCount) throw Object.assign(new Error('Deployment not found.'), { statusCode: 404 });
  return result.rows[0];
}

function assertProductionReady(environment, application) {
  if (environment.stage !== 'production') return;
  if (String(application.status || '').toLowerCase() !== 'published') {
    throw Object.assign(new Error('Production deployment requires a published application snapshot.'), { statusCode: 409 });
  }
}

async function createDeployment(req) {
  const input = await readBody(req);
  const environmentKey = clean(input.environmentKey, 40).toUpperCase();
  const environment = await getEnvironment(environmentKey);
  const info = snapshotInfo(input.application);
  assertProductionReady(environment, info.snapshot);
  const id = await insertDeployment(database.getPool(), req, {
    ...info,
    environmentKey,
    versionId: clean(input.versionId, 160) || null,
    versionLabel: clean(input.versionLabel, 160) || null,
    releaseNotes: clean(input.releaseNotes, 4000),
    sourceEnvironmentKey: clean(input.sourceEnvironmentKey, 40).toUpperCase() || null,
    action: 'deploy'
  });
  await database.audit('deployment.created', req.principal?.username, 'deployment', id, { appId: info.appId, environmentKey, checksum: info.checksum });
  return deploymentById(id);
}

async function promoteDeployment(req) {
  const input = await readBody(req);
  const sourceId = clean(input.deploymentId, 80);
  const targetKey = clean(input.targetEnvironmentKey, 40).toUpperCase();
  const source = await deploymentById(sourceId);
  const sourceEnvironment = await getEnvironment(source.environmentKey);
  const target = await getEnvironment(targetKey);
  if (source.environmentKey === target.key) throw Object.assign(new Error('Target environment must be different from the source environment.'), { statusCode: 400 });
  if (Number(target.sortOrder) <= Number(sourceEnvironment.sortOrder)) throw Object.assign(new Error('Promotion target must be later in the environment sequence.'), { statusCode: 409 });
  assertProductionReady(target, source.application);
  const id = await insertDeployment(database.getPool(), req, {
    appId: source.appId,
    appName: source.appName,
    snapshot: source.application,
    checksum: source.checksum,
    environmentKey: target.key,
    sourceEnvironmentKey: source.environmentKey,
    versionId: source.versionId,
    versionLabel: source.versionLabel,
    releaseNotes: clean(input.releaseNotes || `Promoted from ${source.environmentKey}`, 4000),
    parentDeploymentId: source.id,
    action: 'promote'
  });
  await database.audit('deployment.promoted', req.principal?.username, 'deployment', id, { sourceDeploymentId: source.id, from: source.environmentKey, to: target.key, appId: source.appId });
  return deploymentById(id);
}

async function rollbackDeployment(req) {
  const input = await readBody(req);
  const sourceId = clean(input.deploymentId, 80);
  const source = await deploymentById(sourceId);
  const environment = await getEnvironment(source.environmentKey);
  assertProductionReady(environment, source.application);
  const id = await insertDeployment(database.getPool(), req, {
    appId: source.appId,
    appName: source.appName,
    snapshot: source.application,
    checksum: source.checksum,
    environmentKey: source.environmentKey,
    sourceEnvironmentKey: source.environmentKey,
    versionId: source.versionId,
    versionLabel: source.versionLabel ? `Rollback to ${source.versionLabel}` : `Rollback ${source.id.slice(0, 8)}`,
    releaseNotes: clean(input.releaseNotes || `Rollback to deployment ${source.id}`, 4000),
    parentDeploymentId: source.id,
    action: 'rollback'
  });
  await database.audit('deployment.rollback', req.principal?.username, 'deployment', id, { sourceDeploymentId: source.id, environmentKey: source.environmentKey, appId: source.appId });
  return deploymentById(id);
}

async function history(url) {
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  const appId = clean(url.searchParams.get('appId'), 160);
  const environmentKey = clean(url.searchParams.get('environmentKey'), 40).toUpperCase();
  const values = [];
  const where = [];
  const add = value => { values.push(value); return `$${values.length}`; };
  if (appId) where.push(`d.app_id=${add(appId)}`);
  if (environmentKey) where.push(`d.environment_key=${add(environmentKey)}`);
  const limitRef = add(limit);
  const result = await database.getPool().query(`
    SELECT d.deployment_id AS "id", d.app_id AS "appId", d.app_name AS "appName",
           d.version_id AS "versionId", d.version_label AS "versionLabel",
           d.environment_key AS "environmentKey", e.name AS "environmentName", e.stage AS "environmentStage",
           d.source_environment_key AS "sourceEnvironmentKey", d.status, d.action,
           d.checksum, d.release_notes AS "releaseNotes", d.parent_deployment_id AS "parentDeploymentId",
           d.deployed_by AS "deployedBy", d.deployed_at AS "deployedAt"
    FROM platform_deployments d
    JOIN platform_environments e ON e.environment_key=d.environment_key
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY d.deployed_at DESC
    LIMIT ${limitRef}
  `, values);
  return result.rows;
}

async function latest(url) {
  const appId = clean(url.searchParams.get('appId'), 160);
  if (!appId) throw Object.assign(new Error('appId is required.'), { statusCode: 400 });
  const result = await database.getPool().query(`
    SELECT DISTINCT ON (d.environment_key)
      d.deployment_id AS "id", d.app_id AS "appId", d.app_name AS "appName",
      d.version_label AS "versionLabel", d.environment_key AS "environmentKey",
      e.name AS "environmentName", e.stage AS "environmentStage",
      d.action, d.checksum, d.deployed_by AS "deployedBy", d.deployed_at AS "deployedAt"
    FROM platform_deployments d
    JOIN platform_environments e ON e.environment_key=d.environment_key
    WHERE d.app_id=$1
    ORDER BY d.environment_key, d.deployed_at DESC
  `, [appId]);
  return result.rows;
}

module.exports = async function deploymentsHandler(req, res) {
  try {
    if (!requireDatabase(res)) return;
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'history';

    if (req.method === 'GET' && action === 'environments') return send(res, 200, { environments: await listEnvironments() });
    if (req.method === 'GET' && action === 'history') return send(res, 200, { deployments: await history(url) });
    if (req.method === 'GET' && action === 'latest') return send(res, 200, { deployments: await latest(url) });
    if (req.method === 'GET' && action === 'deployment') return send(res, 200, { deployment: await deploymentById(clean(url.searchParams.get('id'), 80)) });

    if (req.method === 'POST' && action === 'environment') {
      if (!requirePermission(req, res, 'platform.admin')) return;
      return send(res, 200, { environment: await saveEnvironment(req) });
    }
    if (req.method === 'DELETE' && action === 'environment') {
      if (!requirePermission(req, res, 'platform.admin')) return;
      await deleteEnvironment(req, clean(url.searchParams.get('key'), 40).toUpperCase());
      return send(res, 200, { deleted: true });
    }
    if (req.method === 'POST' && action === 'deploy') {
      if (!requirePermission(req, res, 'apps.deploy')) return;
      return send(res, 201, { deployment: await createDeployment(req) });
    }
    if (req.method === 'POST' && action === 'promote') {
      if (!requirePermission(req, res, 'apps.deploy')) return;
      return send(res, 201, { deployment: await promoteDeployment(req) });
    }
    if (req.method === 'POST' && action === 'rollback') {
      if (!requirePermission(req, res, 'apps.deploy')) return;
      return send(res, 201, { deployment: await rollbackDeployment(req) });
    }

    return send(res, 404, { error: 'Unknown deployment action.' });
  } catch (error) {
    if (error instanceof SyntaxError) return send(res, 400, { error: 'Request body is not valid JSON.' });
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Deployment operation failed.' });
  }
};
