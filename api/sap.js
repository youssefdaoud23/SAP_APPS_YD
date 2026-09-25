'use strict';

const {
  parseConnections,
  publicConnection,
  getConnection,
  requestConnection,
  health,
  metadata
} = require('../lib/sapConnector');
const { hasPermission } = require('../lib/securityModel');
const { authorizeConnectionRequest } = require('../lib/connectionPolicy');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'connections';
    const id = url.searchParams.get('id') || '';

    if (action === 'connections') {
      if (!hasPermission(req.principal, 'connections.view')) return json(res, 403, { error: 'Permission connections.view is required.' });
      return json(res, 200, { connections: parseConnections().map(publicConnection) });
    }

    if (!id) return json(res, 400, { error: 'Connection id is required' });
    const connection = getConnection(id);

    if (action === 'health') {
      if (!hasPermission(req.principal, 'connections.view')) return json(res, 403, { error: 'Permission connections.view is required.' });
      return json(res, 200, await health(id));
    }

    if (action === 'metadata') {
      if (!hasPermission(req.principal, 'connections.view')) return json(res, 403, { error: 'Permission connections.view is required.' });
      const result = await metadata(id);
      return json(res, 200, result);
    }

    if (action === 'request') {
      const path = url.searchParams.get('path') || '';
      const method = String(req.method || 'GET').toUpperCase();
      const allowed = ['GET','POST','PUT','PATCH','DELETE'];
      if (!allowed.includes(method)) return json(res, 405, { error: `Method ${method} is not allowed` });
      const decision = authorizeConnectionRequest(req.principal, connection, method);
      if (!decision.ok) return json(res, decision.status, { error: decision.error });
      const body = ['GET','HEAD'].includes(method) ? undefined : await readBody(req);
      const headers = {};
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      if (req.headers['if-match']) headers['If-Match'] = req.headers['if-match'];
      const upstream = await requestConnection(id, path, { method, headers, body });
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      if (upstream.headers.get('etag')) res.setHeader('ETag', upstream.headers.get('etag'));
      return res.end(text);
    }

    return json(res, 400, { error: `Unknown action: ${action}` });
  } catch (err) {
    const status = Number(err.statusCode) || 500;
    return json(res, status, { error: err.message || 'Unexpected connector error' });
  }
};
