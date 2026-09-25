'use strict';

const { Readable } = require('stream');
const database = require('../lib/database');
const sapConnector = require('../lib/sapConnector');
const { hasPermission } = require('../lib/securityModel');
const { authorizeConnectionRequest } = require('../lib/connectionPolicy');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cleanPath(value) {
  const path = String(value || '/');
  return path.startsWith('/') ? path : `/${path}`;
}

function matchPath(template, actual) {
  const expected = cleanPath(template).split('/').filter(Boolean);
  const received = cleanPath(actual).split('/').filter(Boolean);
  if (expected.length !== received.length) return null;
  const params = {};
  for (let i = 0; i < expected.length; i += 1) {
    const segment = expected[i];
    const match = segment.match(/^\{([A-Za-z][A-Za-z0-9_]*)\}$/);
    if (match) params[match[1]] = decodeURIComponent(received[i]);
    else if (segment !== received[i]) return null;
  }
  return params;
}

function applyParams(value, params) {
  return String(value || '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, key) => {
    if (!(key in params)) throw Object.assign(new Error(`Missing route parameter ${key}.`), { statusCode: 400 });
    return encodeURIComponent(params[key]);
  });
}

function safeHeaders(configured = {}, requestHeaders = {}) {
  const blocked = new Set(['authorization', 'cookie', 'host', 'x-csrf-token', 'content-length', 'connection']);
  const output = {};
  for (const [key, value] of Object.entries(configured || {})) {
    const name = String(key).trim();
    if (!name || blocked.has(name.toLowerCase()) || /[\r\n]/.test(name) || /[\r\n]/.test(String(value))) continue;
    output[name] = String(value);
  }
  const contentType = requestHeaders['content-type'];
  if (contentType) output['Content-Type'] = contentType;
  const accept = requestHeaders.accept;
  if (accept) output.Accept = accept;
  return output;
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  if (['GET', 'HEAD'].includes(String(req.method || '').toUpperCase())) return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Runtime API request body is too large.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function findRuntimeOperation(slug, method, runtimePath) {
  const result = await database.getPool().query(`
    SELECT a.api_id AS "apiId", a.name AS "apiName", a.slug, a.status,
           o.operation_id AS "operationId", o.method, o.path, o.mode,
           o.connection_id AS "connectionId", o.upstream_path AS "upstreamPath",
           o.headers, o.timeout_ms AS "timeoutMs", o.enabled
    FROM platform_api_definitions a
    JOIN platform_api_operations o ON o.api_id=a.api_id
    WHERE a.slug=$1 AND a.status='published' AND o.method=$2 AND o.enabled=true
    ORDER BY length(o.path) DESC
  `, [slug, method]);
  for (const row of result.rows) {
    const params = matchPath(row.path, runtimePath);
    if (params) return { ...row, params };
  }
  return null;
}

module.exports = async function apiRuntimeHandler(req, res) {
  if (!hasPermission(req.principal, 'apps.view')) return send(res, 403, { error: 'Permission apps.view is required.' });
  if (!database.enabled()) return send(res, 503, { error: 'PostgreSQL is required for reusable API runtime.' });
  try {
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const prefix = '/runtime/api/';
    if (!url.pathname.startsWith(prefix)) return send(res, 404, { error: 'Runtime API route not found.' });
    const rest = url.pathname.slice(prefix.length);
    const slash = rest.indexOf('/');
    const slug = decodeURIComponent(slash < 0 ? rest : rest.slice(0, slash));
    const runtimePath = slash < 0 ? '/' : rest.slice(slash);
    if (!slug) return send(res, 404, { error: 'API slug is required.' });
    const method = String(req.method || 'GET').toUpperCase();
    const operation = await findRuntimeOperation(slug, method, runtimePath);
    if (!operation) return send(res, 404, { error: 'No published API operation matches this method and path.' });
    if (operation.mode !== 'sap-proxy') return send(res, 501, { error: `Runtime mode ${operation.mode} is not implemented.` });

    const connection = sapConnector.getConnection(operation.connectionId);
    const decision = authorizeConnectionRequest(req.principal, connection, method);
    if (!decision.ok) return send(res, decision.status, { error: decision.error });

    let upstreamPath = applyParams(operation.upstreamPath, operation.params).replace(/^\/+/, '');
    const incomingQuery = url.searchParams.toString();
    if (incomingQuery) upstreamPath += `${upstreamPath.includes('?') ? '&' : '?'}${incomingQuery}`;
    const body = await readBody(req);
    const response = await sapConnector.requestConnection(operation.connectionId, upstreamPath, {
      method,
      headers: safeHeaders(operation.headers, req.headers),
      body,
      timeoutMs: operation.timeoutMs
    });

    res.statusCode = response.status;
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const etag = response.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      database.audit('api.runtime.write', req.principal.username, 'api-operation', operation.operationId, {
        apiId: operation.apiId,
        slug,
        method,
        path: runtimePath,
        connectionId: operation.connectionId,
        status: response.status
      }).catch(() => {});
    }
    if (!response.body) return res.end();
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    if (error.name === 'AbortError') return send(res, 504, { error: 'Upstream API request timed out.' });
    return send(res, Number(error.statusCode) || 502, { error: error.message || 'Reusable API runtime request failed.' });
  }
};
