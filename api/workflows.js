'use strict';

const workflowStore = require('../lib/workflowStore');
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
  return `W/"workflow-${Number(revision)}"`;
}

function expectedRevision(req, input = {}) {
  const header = String(req.headers['if-match'] || '');
  const match = header.match(/workflow-(\d+)/);
  const value = match ? Number(match[1]) : Number(input.revision);
  return Number.isInteger(value) && value > 0 ? value : null;
}

module.exports = async function workflowsHandler(req, res) {
  if (!hasPermission(req.principal, 'workflows.manage')) return send(res, 403, { error: 'Permission workflows.manage is required.' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const id = clean(url.searchParams.get('id'), 80);
    const instances = url.searchParams.get('instances') === 'true';

    if (req.method === 'GET' && instances) return send(res, 200, { instances: await workflowStore.listInstances(url.searchParams.get('limit')) });
    if (req.method === 'GET' && !id) return send(res, 200, { workflows: await workflowStore.list() });
    if (req.method === 'GET' && id) {
      const workflow = await workflowStore.get(id);
      return send(res, 200, workflow, { ETag: etag(workflow.revision) });
    }
    if (req.method === 'POST') {
      const workflow = await workflowStore.create(await readBody(req), req.principal.username);
      return send(res, 201, workflow, { ETag: etag(workflow.revision) });
    }
    if (req.method === 'PUT' && id) {
      const input = await readBody(req);
      const workflow = await workflowStore.update(id, input, expectedRevision(req, input), req.principal.username);
      return send(res, 200, workflow, { ETag: etag(workflow.revision) });
    }
    if (req.method === 'DELETE' && id) {
      await workflowStore.remove(id, req.principal.username);
      return send(res, 200, { deleted: true });
    }
    return send(res, 405, { error: 'Unsupported workflow administration action.' });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Workflow request failed.' });
  }
};
