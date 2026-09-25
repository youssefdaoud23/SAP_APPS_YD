'use strict';

const functionStore = require('../lib/functionStore');
const { hasPermission } = require('../lib/securityModel');

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

function clean(value, max = 100) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function etag(revision) {
  return `W/"function-${Number(revision)}"`;
}

function expectedRevision(req, input = {}) {
  const header = String(req.headers['if-match'] || '');
  const match = header.match(/function-(\d+)/);
  const value = match ? Number(match[1]) : Number(input.revision);
  return Number.isInteger(value) && value > 0 ? value : null;
}

module.exports = async function functionsHandler(req, res) {
  if (!hasPermission(req.principal, 'functions.manage')) return send(res, 403, { error: 'Permission functions.manage is required.' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const id = clean(url.searchParams.get('id'), 80);

    if (req.method === 'GET' && !id) return send(res, 200, { functions: await functionStore.list() });
    if (req.method === 'GET' && id) {
      const fn = await functionStore.get(id);
      return send(res, 200, fn, { ETag: etag(fn.revision) });
    }
    if (req.method === 'POST') {
      const fn = await functionStore.create(await readBody(req), req.principal.username);
      return send(res, 201, fn, { ETag: etag(fn.revision) });
    }
    if (req.method === 'PUT' && id) {
      const input = await readBody(req);
      const fn = await functionStore.update(id, input, expectedRevision(req, input), req.principal.username);
      return send(res, 200, fn, { ETag: etag(fn.revision) });
    }
    if (req.method === 'DELETE' && id) {
      await functionStore.remove(id, req.principal.username);
      return send(res, 200, { deleted: true });
    }
    return send(res, 405, { error: 'Unsupported Server Functions action.' });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Server Functions request failed.' });
  }
};
