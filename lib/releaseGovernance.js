'use strict';

const crypto = require('crypto');
const database = require('./database');
const auth = require('./auth');

let schemaPromise = null;
const ACTIONS = new Set(['deploy', 'promote', 'rollback']);
const STATUSES = new Set(['requested', 'approved', 'rejected', 'consumed', 'cancelled']);

function error(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function enabled() {
  const explicit = String(process.env.RELEASE_APPROVALS_ENABLED || '').trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return auth.mode() !== 'local';
}

function selfApprovalAllowed() {
  return String(process.env.RELEASE_SELF_APPROVAL || '').trim().toLowerCase() === 'true';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
  return result;
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

async function ensureSchema() {
  if (!database.enabled()) throw error('PostgreSQL is required for release approvals.', 503);
  await database.ensureDatabase();
  if (schemaPromise) return schemaPromise;
  schemaPromise = database.getPool().query(`
    CREATE TABLE IF NOT EXISTS platform_release_approvals (
      approval_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_name TEXT,
      target_environment_key TEXT NOT NULL REFERENCES platform_environments(environment_key),
      source_deployment_id TEXT REFERENCES platform_deployments(deployment_id),
      snapshot_checksum TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      reason TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      decision_note TEXT NOT NULL DEFAULT '',
      consumed_by TEXT,
      consumed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_release_approvals_status ON platform_release_approvals(status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_release_approvals_target ON platform_release_approvals(target_environment_key, app_id, status);
  `).catch(err => { schemaPromise = null; throw err; });
  return schemaPromise;
}

function row(row) {
  if (!row) return null;
  return {
    id: row.id,
    action: row.action,
    appId: row.appId,
    appName: row.appName || null,
    targetEnvironmentKey: row.targetEnvironmentKey,
    sourceDeploymentId: row.sourceDeploymentId || null,
    snapshotChecksum: row.snapshotChecksum || null,
    status: row.status,
    reason: row.reason || '',
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    decidedBy: row.decidedBy || null,
    decidedAt: row.decidedAt || null,
    decisionNote: row.decisionNote || '',
    consumedBy: row.consumedBy || null,
    consumedAt: row.consumedAt || null,
    expiresAt: row.expiresAt || null
  };
}

const SELECT = `
  SELECT approval_id AS id,action,app_id AS "appId",app_name AS "appName",
         target_environment_key AS "targetEnvironmentKey",source_deployment_id AS "sourceDeploymentId",
         snapshot_checksum AS "snapshotChecksum",status,reason,requested_by AS "requestedBy",
         requested_at AS "requestedAt",decided_by AS "decidedBy",decided_at AS "decidedAt",
         decision_note AS "decisionNote",consumed_by AS "consumedBy",consumed_at AS "consumedAt",
         expires_at AS "expiresAt"
  FROM platform_release_approvals`;

async function get(id, client = database.getPool()) {
  await ensureSchema();
  const result = await client.query(`${SELECT} WHERE approval_id=$1`, [id]);
  const value = row(result.rows[0]);
  if (!value) throw error('Release approval not found.', 404);
  return value;
}

async function list(options = {}) {
  await ensureSchema();
  const values = [];
  const where = [];
  const add = value => { values.push(value); return `$${values.length}`; };
  if (options.status) where.push(`status=${add(clean(options.status, 30))}`);
  if (options.appId) where.push(`app_id=${add(clean(options.appId, 160))}`);
  if (options.environmentKey) where.push(`target_environment_key=${add(clean(options.environmentKey, 40).toUpperCase())}`);
  const limit = Math.min(300, Math.max(1, Number(options.limit) || 100));
  values.push(limit);
  const result = await database.getPool().query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY requested_at DESC LIMIT $${values.length}`, values);
  return result.rows.map(row);
}

async function environment(key, client = database.getPool()) {
  const result = await client.query('SELECT environment_key AS key,name,stage,protected FROM platform_environments WHERE environment_key=$1', [clean(key, 40).toUpperCase()]);
  if (!result.rowCount) throw error('Target environment was not found.', 404);
  return result.rows[0];
}

async function sourceDeployment(id, client = database.getPool()) {
  const result = await client.query(`SELECT deployment_id AS id,app_id AS "appId",app_name AS "appName",environment_key AS "environmentKey",checksum,application_snapshot AS application FROM platform_deployments WHERE deployment_id=$1`, [id]);
  if (!result.rowCount) throw error('Source deployment was not found.', 404);
  return result.rows[0];
}

async function targetFor(action, input, client = database.getPool()) {
  if (!ACTIONS.has(action)) throw error('Unsupported release action.');
  if (action === 'deploy') {
    const application = input.application;
    if (!application || typeof application !== 'object' || Array.isArray(application)) throw error('application is required for deployment approval.');
    const appId = clean(application.id, 160);
    if (!appId) throw error('application.id is required.');
    return {
      action,
      appId,
      appName: clean(application.name || application.title, 240),
      targetEnvironmentKey: clean(input.environmentKey, 40).toUpperCase(),
      sourceDeploymentId: null,
      snapshotChecksum: checksum(application)
    };
  }
  const sourceId = clean(input.deploymentId, 100);
  const source = await sourceDeployment(sourceId, client);
  return {
    action,
    appId: source.appId,
    appName: source.appName,
    targetEnvironmentKey: action === 'promote' ? clean(input.targetEnvironmentKey, 40).toUpperCase() : source.environmentKey,
    sourceDeploymentId: source.id,
    snapshotChecksum: source.checksum
  };
}

async function requestApproval(action, input, principal) {
  await ensureSchema();
  const target = await targetFor(action, input);
  const env = await environment(target.targetEnvironmentKey);
  const id = crypto.randomUUID();
  const ttlHours = Math.min(24 * 30, Math.max(1, Number(input.expiresInHours) || 72));
  const expiresAt = new Date(Date.now() + ttlHours * 3600000);
  await database.getPool().query(`
    INSERT INTO platform_release_approvals(
      approval_id,action,app_id,app_name,target_environment_key,source_deployment_id,
      snapshot_checksum,status,reason,requested_by,expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'requested',$8,$9,$10)
  `, [id,target.action,target.appId,target.appName,target.targetEnvironmentKey,target.sourceDeploymentId,target.snapshotChecksum,clean(input.reason,3000),principal.username,expiresAt]);
  await database.audit('release.approval.requested', principal.username, 'release-approval', id, { ...target, protected: env.protected, expiresAt });
  return get(id);
}

async function decide(id, decision, principal, note = '') {
  await ensureSchema();
  if (!['approved','rejected'].includes(decision)) throw error('Decision must be approved or rejected.');
  const current = await get(id);
  if (current.status !== 'requested') throw error(`Release approval is already ${current.status}.`, 409);
  if (!selfApprovalAllowed() && current.requestedBy === principal.username) throw error('Four-eyes approval requires a different user to approve or reject this release.', 409);
  const result = await database.getPool().query(`
    UPDATE platform_release_approvals SET status=$2,decided_by=$3,decided_at=NOW(),decision_note=$4
    WHERE approval_id=$1 AND status='requested' AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING approval_id
  `, [id, decision, principal.username, clean(note,3000)]);
  if (!result.rowCount) throw error('Release approval expired or changed before the decision was recorded.', 409);
  await database.audit(`release.approval.${decision}`, principal.username, 'release-approval', id, { requestedBy: current.requestedBy, targetEnvironmentKey: current.targetEnvironmentKey });
  return get(id);
}

async function cancel(id, principal) {
  await ensureSchema();
  const current = await get(id);
  if (current.status !== 'requested') throw error(`Only requested approvals can be cancelled.`, 409);
  const elevated = principal.permissions?.includes('platform.admin');
  if (!elevated && current.requestedBy !== principal.username) throw error('Only the requester or a platform administrator can cancel this approval.', 403);
  await database.getPool().query("UPDATE platform_release_approvals SET status='cancelled',decided_by=$2,decided_at=NOW(),decision_note='Cancelled by requester' WHERE approval_id=$1 AND status='requested'", [id,principal.username]);
  await database.audit('release.approval.cancelled', principal.username, 'release-approval', id, {});
  return get(id);
}

async function validateForDeployment(approvalId, action, input, principal) {
  await ensureSchema();
  const target = await targetFor(action, input);
  const env = await environment(target.targetEnvironmentKey);
  if (!enabled() || !env.protected) return { required: false, environment: env, target };
  const id = clean(approvalId, 100);
  if (!id) throw error(`Environment ${env.key} is protected and requires an approved release request.`, 428);
  const approval = await get(id);
  if (approval.status !== 'approved') throw error(`Release approval ${id} is ${approval.status}, not approved.`, 409);
  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= Date.now()) throw error('Release approval has expired.', 409);
  const mismatches = [];
  for (const [field, expected] of Object.entries(target)) {
    const actual = approval[field];
    if ((actual || null) !== (expected || null)) mismatches.push(field);
  }
  if (mismatches.length) throw error(`Release approval does not match the deployment request: ${mismatches.join(', ')}.`, 409);
  return { required: true, environment: env, target, approval };
}

async function consume(id, principal) {
  if (!id) return null;
  const result = await database.getPool().query(`
    UPDATE platform_release_approvals SET status='consumed',consumed_by=$2,consumed_at=NOW()
    WHERE approval_id=$1 AND status='approved' AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING approval_id
  `, [id, principal.username]);
  if (!result.rowCount) throw error('Release approval could not be consumed.', 409);
  await database.audit('release.approval.consumed', principal.username, 'release-approval', id, {});
  return get(id);
}

async function restore(id, principal, reason = '') {
  if (!id) return;
  await database.getPool().query(`UPDATE platform_release_approvals SET status='approved',consumed_by=NULL,consumed_at=NULL WHERE approval_id=$1 AND status='consumed' AND consumed_by=$2`, [id,principal.username]);
  await database.audit('release.approval.restored', principal.username, 'release-approval', id, { reason: clean(reason,1000) });
}

module.exports = {
  ACTIONS, STATUSES, enabled, selfApprovalAllowed, ensureSchema, checksum, get, list, requestApproval, decide, cancel,
  validateForDeployment, consume, restore, targetFor, environment
};
