'use strict';

const database = require('../lib/database');
const functionStore = require('../lib/functionStore');
const functionEngine = require('../lib/functionEngine');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Server function input exceeds the 1 MB limit.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed;
  } catch {
    throw Object.assign(new Error('Server function input must be a JSON object.'), { statusCode: 400 });
  }
}

module.exports = async function functionRuntimeHandler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Published server functions are invoked with POST.' });
  if (!hasPermission(req.principal, 'apps.view')) return send(res, 403, { error: 'Permission apps.view is required.' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const prefix = '/runtime/functions/';
    if (!url.pathname.startsWith(prefix)) return send(res, 404, { error: 'Server function route not found.' });
    const slug = decodeURIComponent(url.pathname.slice(prefix.length)).trim();
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) return send(res, 404, { error: 'Published server function not found.' });
    const fn = await functionStore.getPublishedBySlug(slug);
    if (!fn) return send(res, 404, { error: 'Published server function not found.' });

    const input = await readJson(req);
    const started = Date.now();
    try {
      const output = await functionEngine.execute(fn, input, req.principal);
      const serialized = JSON.stringify({ ok: true, function: fn.slug, revision: fn.revision, durationMs: Date.now() - started, data: output });
      if (Buffer.byteLength(serialized) > 2 * 1024 * 1024) throw Object.assign(new Error('Server function output exceeds the 2 MB limit.'), { statusCode: 413 });
      database.audit('function.executed', req.principal.username, 'server-function', fn.id, {
        slug: fn.slug,
        revision: fn.revision,
        durationMs: Date.now() - started,
        success: true
      }).catch(() => {});
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(serialized);
    } catch (error) {
      database.audit('function.executed', req.principal.username, 'server-function', fn.id, {
        slug: fn.slug,
        revision: fn.revision,
        durationMs: Date.now() - started,
        success: false,
        error: String(error.message || 'Function execution failed').slice(0, 300)
      }).catch(() => {});
      throw error;
    }
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Server function execution failed.' });
  }
};
