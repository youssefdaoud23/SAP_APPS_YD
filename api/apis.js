'use strict';

const crypto = require('crypto');
const database = require('../lib/database');
const { hasPermission } = require('../lib/securityModel');

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const STATUSES = new Set(['draft', 'published', 'disabled']);
const MODES = new Set(['sap-proxy']);

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('Request body is not valid JSON.'), { statusCode: 400 }); }
}

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validateSlug(value) {
  const slug = clean(value, 64).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) throw Object.assign(new Error('API slug must start with a letter and contain only lowercase letters, numbers and hyphens.'), { statusCode: 400 });
  return slug;
}

function validatePath(value, label = 'Path') {
  const path = clean(value || '/', 500);
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\') || /[\r\n]/.test(path)) {
    throw Object.assign(new Error(`${label} must be an absolute relative path without traversal segments.`), { statusCode: 400 });
  }
  return path.replace(/\/+/g, '/');
}

function expectedRevision(req, input = {}) {
  const header = String(req.headers['if-match'] || '');
  const match = header.match(/api-(\d+)/);
  const value = match ? Number(match[1]) : Number(input.revision);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function etag(revision) {
  return `W/"api-${Number(revision)}"`;
}

function requireManage(req, res) {
  if (!hasPermission(req.principal, 'api.manage')) {
    send(res, 403, { error: 'Permission api.manage is required.' });
    return false;
  }
  if (!database.enabled()) {
    send(res, 503, { error: 'PostgreSQL is required for API Designer.' });
    return false;
  }
  return true;
}

async function listApis() {
  const result = await database.getPool().query(`
    SELECT a.api_id AS "id", a.name, a.slug, a.description, a.base_path AS "basePath", a.status,
           a.revision::int, a.created_by AS "createdBy", a.updated_by AS "updatedBy",
           a.created_at AS "createdAt", a.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM platform_api_operations o WHERE o.api_id=a.api_id) AS "operationCount"
    FROM platform_api_definitions a
    ORDER BY lower(a.name)
  `);
  return result.rows;
}

async function getApi(id) {
  const apiResult = await database.getPool().query(`
    SELECT api_id AS "id", name, slug, description, base_path AS "basePath", status,
           revision::int, created_by AS "createdBy", updated_by AS "updatedBy",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM platform_api_definitions WHERE api_id=$1
  `, [id]);
  const api = apiResult.rows[0];
  if (!api) throw Object.assign(new Error('API definition not found.'), { statusCode: 404 });
  const operations = await database.getPool().query(`
    SELECT operation_id AS "id", api_id AS "apiId", method, path, summary, description, mode,
           connection_id AS "connectionId", upstream_path AS "upstreamPath",
           request_mapping AS "requestMapping", response_mapping AS "responseMapping", headers,
           timeout_ms AS "timeoutMs", enabled, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM platform_api_operations
    WHERE api_id=$1
    ORDER BY path, method
  `, [id]);
  return { ...api, operations: operations.rows };
}

async function createApi(req, input) {
  const id = crypto.randomUUID();
  const name = clean(input.name, 160);
  if (name.length < 2) throw Object.assign(new Error('API name must be at least 2 characters.'), { statusCode: 400 });
  const slug = validateSlug(input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const description = clean(input.description, 2000);
  const basePath = validatePath(input.basePath || `/api/${slug}`, 'Base path');
  const status = STATUSES.has(input.status) ? input.status : 'draft';
  try {
    await database.getPool().query(`
      INSERT INTO platform_api_definitions(api_id,name,slug,description,base_path,status,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
    `, [id, name, slug, description, basePath, status, req.principal.username]);
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('An API with that slug already exists.'), { statusCode: 409 });
    throw error;
  }
  await database.audit('api.created', req.principal.username, 'api', id, { name, slug });
  return getApi(id);
}

async function updateApi(req, id, input) {
  const expected = expectedRevision(req, input);
  if (!expected) throw Object.assign(new Error('If-Match or revision is required when updating an API.'), { statusCode: 428 });
  const existing = await getApi(id);
  const name = input.name == null ? existing.name : clean(input.name, 160);
  const slug = input.slug == null ? existing.slug : validateSlug(input.slug);
  const description = input.description == null ? existing.description : clean(input.description, 2000);
  const basePath = input.basePath == null ? existing.basePath : validatePath(input.basePath, 'Base path');
  const status = input.status == null ? existing.status : clean(input.status, 30);
  if (!STATUSES.has(status)) throw Object.assign(new Error('API status must be draft, published or disabled.'), { statusCode: 400 });
  let result;
  try {
    result = await database.getPool().query(`
      UPDATE platform_api_definitions
      SET name=$2, slug=$3, description=$4, base_path=$5, status=$6,
          revision=revision+1, updated_by=$7, updated_at=NOW()
      WHERE api_id=$1 AND revision=$8
      RETURNING revision::int
    `, [id, name, slug, description, basePath, status, req.principal.username, expected]);
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('An API with that slug already exists.'), { statusCode: 409 });
    throw error;
  }
  if (!result.rowCount) throw Object.assign(new Error('API changed on the server. Reload it before saving again.'), { statusCode: 409 });
  await database.audit('api.updated', req.principal.username, 'api', id, { revision: result.rows[0].revision });
  return getApi(id);
}

async function deleteApi(req, id) {
  const result = await database.getPool().query('DELETE FROM platform_api_definitions WHERE api_id=$1 RETURNING name,slug', [id]);
  if (!result.rowCount) throw Object.assign(new Error('API definition not found.'), { statusCode: 404 });
  await database.audit('api.deleted', req.principal.username, 'api', id, result.rows[0]);
}

function jsonObject(value, label) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${label} must be a JSON object.`), { statusCode: 400 });
  return value;
}

function operationInput(input) {
  const method = clean(input.method, 10).toUpperCase();
  if (!METHODS.has(method)) throw Object.assign(new Error('Operation method must be GET, POST, PUT, PATCH or DELETE.'), { statusCode: 400 });
  const mode = clean(input.mode || 'sap-proxy', 40);
  if (!MODES.has(mode)) throw Object.assign(new Error('Unsupported API operation mode.'), { statusCode: 400 });
  const connectionId = clean(input.connectionId, 120);
  if (mode === 'sap-proxy' && !connectionId) throw Object.assign(new Error('SAP proxy operations require a connectionId.'), { statusCode: 400 });
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 1000), 120000);
  return {
    method,
    path: validatePath(input.path || '/', 'Operation path'),
    summary: clean(input.summary, 300),
    description: clean(input.description, 2000),
    mode,
    connectionId,
    upstreamPath: clean(input.upstreamPath, 1000),
    requestMapping: jsonObject(input.requestMapping, 'requestMapping'),
    responseMapping: jsonObject(input.responseMapping, 'responseMapping'),
    headers: jsonObject(input.headers, 'headers'),
    timeoutMs,
    enabled: input.enabled !== false
  };
}

async function bumpApi(client, apiId, actor) {
  const result = await client.query(`
    UPDATE platform_api_definitions SET revision=revision+1, updated_by=$2, updated_at=NOW()
    WHERE api_id=$1 RETURNING revision::int
  `, [apiId, actor]);
  if (!result.rowCount) throw Object.assign(new Error('API definition not found.'), { statusCode: 404 });
  return result.rows[0].revision;
}

async function createOperation(req, apiId, input) {
  const operation = operationInput(input);
  const id = crypto.randomUUID();
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO platform_api_operations(operation_id,api_id,method,path,summary,description,mode,connection_id,upstream_path,request_mapping,response_mapping,headers,timeout_ms,enabled)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)
    `, [id, apiId, operation.method, operation.path, operation.summary, operation.description, operation.mode, operation.connectionId, operation.upstreamPath, JSON.stringify(operation.requestMapping), JSON.stringify(operation.responseMapping), JSON.stringify(operation.headers), operation.timeoutMs, operation.enabled]);
    await bumpApi(client, apiId, req.principal.username);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('An operation with that method and path already exists in this API.'), { statusCode: 409 });
    throw error;
  } finally { client.release(); }
  await database.audit('api.operation.created', req.principal.username, 'api-operation', id, { apiId, method: operation.method, path: operation.path });
  return getApi(apiId);
}

async function updateOperation(req, id, input) {
  const currentResult = await database.getPool().query('SELECT api_id AS "apiId" FROM platform_api_operations WHERE operation_id=$1', [id]);
  if (!currentResult.rowCount) throw Object.assign(new Error('API operation not found.'), { statusCode: 404 });
  const apiId = currentResult.rows[0].apiId;
  const operation = operationInput(input);
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE platform_api_operations
      SET method=$2,path=$3,summary=$4,description=$5,mode=$6,connection_id=$7,upstream_path=$8,
          request_mapping=$9::jsonb,response_mapping=$10::jsonb,headers=$11::jsonb,timeout_ms=$12,enabled=$13,updated_at=NOW()
      WHERE operation_id=$1
    `, [id, operation.method, operation.path, operation.summary, operation.description, operation.mode, operation.connectionId, operation.upstreamPath, JSON.stringify(operation.requestMapping), JSON.stringify(operation.responseMapping), JSON.stringify(operation.headers), operation.timeoutMs, operation.enabled]);
    await bumpApi(client, apiId, req.principal.username);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('An operation with that method and path already exists in this API.'), { statusCode: 409 });
    throw error;
  } finally { client.release(); }
  await database.audit('api.operation.updated', req.principal.username, 'api-operation', id, { apiId, method: operation.method, path: operation.path });
  return getApi(apiId);
}

async function deleteOperation(req, id) {
  const client = await database.getPool().connect();
  let apiId;
  try {
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM platform_api_operations WHERE operation_id=$1 RETURNING api_id AS "apiId",method,path', [id]);
    if (!result.rowCount) throw Object.assign(new Error('API operation not found.'), { statusCode: 404 });
    apiId = result.rows[0].apiId;
    await bumpApi(client, apiId, req.principal.username);
    await client.query('COMMIT');
    await database.audit('api.operation.deleted', req.principal.username, 'api-operation', id, result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return getApi(apiId);
}

module.exports = async function apisHandler(req, res) {
  if (!requireManage(req, res)) return;
  try {
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'api';
    const id = clean(url.searchParams.get('id'), 80);
    const apiId = clean(url.searchParams.get('apiId'), 80);

    if (action === 'api' && req.method === 'GET' && !id) return send(res, 200, { apis: await listApis() });
    if (action === 'api' && req.method === 'GET' && id) {
      const api = await getApi(id);
      return send(res, 200, api, { ETag: etag(api.revision) });
    }
    if (action === 'api' && req.method === 'POST') {
      const api = await createApi(req, await readBody(req));
      return send(res, 201, api, { ETag: etag(api.revision) });
    }
    if (action === 'api' && req.method === 'PUT' && id) {
      const api = await updateApi(req, id, await readBody(req));
      return send(res, 200, api, { ETag: etag(api.revision) });
    }
    if (action === 'api' && req.method === 'DELETE' && id) {
      await deleteApi(req, id);
      return send(res, 200, { deleted: true });
    }
    if (action === 'operation' && req.method === 'POST' && apiId) {
      const api = await createOperation(req, apiId, await readBody(req));
      return send(res, 201, api, { ETag: etag(api.revision) });
    }
    if (action === 'operation' && req.method === 'PUT' && id) {
      const api = await updateOperation(req, id, await readBody(req));
      return send(res, 200, api, { ETag: etag(api.revision) });
    }
    if (action === 'operation' && req.method === 'DELETE' && id) {
      const api = await deleteOperation(req, id);
      return send(res, 200, api, { ETag: etag(api.revision) });
    }
    return send(res, 404, { error: 'Unknown API Designer action.' });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'API Designer request failed.' });
  }
};
