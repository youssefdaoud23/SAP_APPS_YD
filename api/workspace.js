'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024;

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extraHeaders).forEach(([k,v]) => res.setHeader(k,v));
  res.end(JSON.stringify(body));
}

function configuredFile() {
  const raw = process.env.WORKSPACE_FILE;
  if (!raw) return null;
  return path.resolve(raw);
}

function etag(text) {
  return `"${crypto.createHash('sha256').update(text).digest('hex')}"`;
}

function readCurrent(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return { text, data: JSON.parse(text), etag: etag(text), stat: fs.statSync(file) };
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
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('Workspace exceeds 5 MB limit'), { statusCode: 413 });
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async function workspaceHandler(req, res) {
  try {
    const file = configuredFile();
    if (!file) return json(res, 200, { enabled: false, reason: 'WORKSPACE_FILE is not configured' });

    if (req.method === 'GET') {
      const current = readCurrent(file);
      if (!current) return json(res, 200, { enabled: true, exists: false, workspace: null });
      return json(res, 200, {
        enabled: true,
        exists: true,
        workspace: current.data,
        updatedAt: current.stat.mtime.toISOString(),
        etag: current.etag
      }, { ETag: current.etag });
    }

    if (req.method === 'PUT') {
      const current = readCurrent(file);
      const expected = req.headers['if-match'];
      if (expected && expected !== '*' && current && expected !== current.etag) {
        return json(res, 409, { error: 'Workspace changed on the server. Pull the latest version before overwriting it.', currentEtag: current.etag });
      }
      const text = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error('Request body is not valid JSON'), { statusCode: 400 }); }
      validateWorkspace(parsed);
      const canonical = JSON.stringify(parsed, null, 2) + '\n';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, canonical, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temp, file);
      const tag = etag(canonical);
      return json(res, 200, { enabled: true, saved: true, etag: tag, updatedAt: new Date().toISOString() }, { ETag: tag });
    }

    return json(res, 405, { error: 'Only GET and PUT are supported' }, { Allow: 'GET, PUT' });
  } catch (err) {
    return json(res, Number(err.statusCode) || 500, { error: err.message || 'Workspace storage error' });
  }
};
