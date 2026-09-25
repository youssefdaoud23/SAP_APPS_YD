'use strict';

const workspaceStore = require('../lib/workspaceStore');
const { hasPermission } = require('../lib/securityModel');

const MAX_BYTES = 5 * 1024 * 1024;

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value != null) res.setHeader(key, String(value));
  });
  res.end(JSON.stringify(body));
}

function validateWorkspace(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('Workspace must be a JSON object'), { statusCode: 400 });
  if (!Array.isArray(data.apps)) throw Object.assign(new Error('Workspace must contain an apps array'), { statusCode: 400 });
  if (data.connections != null && !Array.isArray(data.connections)) throw Object.assign(new Error('connections must be an array'), { statusCode: 400 });
  return data;
}

async function readBody(req) {
  if (req.body != null) {
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(text) > MAX_BYTES) throw Object.assign(new Error('Workspace exceeds 5 MB limit'), { statusCode: 413 });
    return text;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('Workspace exceeds 5 MB limit'), { statusCode: 413 });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function revisionHeaders(result) {
  const headers = {};
  if (result.etag) headers.ETag = result.etag;
  if (result.revision != null) headers['X-Workspace-Revision'] = result.revision;
  return headers;
}

module.exports = async function workspaceHandler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.principal && !hasPermission(req.principal, 'apps.view')) {
        return json(res, 403, { error: 'Permission apps.view is required to read the shared workspace.' });
      }
      const current = await workspaceStore.get();
      if (!current.enabled) return json(res, 200, { enabled: false, reason: 'Workspace storage is not configured', storage: current.mode });
      if (!current.exists) {
        return json(res, 200, {
          enabled: true,
          exists: false,
          workspace: null,
          storage: current.mode,
          revision: current.revision
        });
      }
      return json(res, 200, {
        enabled: true,
        exists: true,
        workspace: current.workspace,
        updatedAt: current.updatedAt,
        etag: current.etag,
        revision: current.revision,
        storage: current.mode
      }, revisionHeaders(current));
    }

    if (req.method === 'PUT') {
      if (req.principal && !hasPermission(req.principal, 'apps.edit')) {
        return json(res, 403, { error: 'Permission apps.edit is required to update the shared workspace.' });
      }
      const text = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { throw Object.assign(new Error('Request body is not valid JSON'), { statusCode: 400 }); }
      validateWorkspace(parsed);
      const saved = await workspaceStore.put(parsed, req.headers['if-match'], req.principal?.username || null);
      return json(res, 200, {
        enabled: true,
        saved: true,
        etag: saved.etag,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        storage: saved.mode
      }, revisionHeaders(saved));
    }

    return json(res, 405, { error: 'Only GET and PUT are supported' }, { Allow: 'GET, PUT' });
  } catch (error) {
    const body = { error: error.message || 'Workspace storage error' };
    if (error.currentEtag) body.currentEtag = error.currentEtag;
    return json(res, Number(error.statusCode) || 500, body);
  }
};
