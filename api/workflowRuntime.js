'use strict';

const workflowStore = require('../lib/workflowStore');
const workflowEngine = require('../lib/workflowEngine');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
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

function segment(value, max = 100) {
  return decodeURIComponent(String(value || '')).trim().slice(0, max);
}

module.exports = async function workflowRuntimeHandler(req, res) {
  if (!hasPermission(req.principal, 'apps.view')) return send(res, 403, { error: 'Permission apps.view is required.' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[1] === 'tasks') {
      if (req.method === 'GET' && parts.length === 2) {
        const includeCompleted = url.searchParams.get('includeCompleted') === 'true';
        return send(res, 200, { tasks: await workflowStore.listTasks(req.principal, includeCompleted) });
      }
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'complete') {
        const input = await readBody(req);
        const result = await workflowEngine.completeTask(segment(parts[2], 100), req.principal, input.resolution, input.payload || {});
        return send(res, 200, result);
      }
      return send(res, 405, { error: 'Unsupported task action.' });
    }

    if (parts[1] === 'workflow-instances' && req.method === 'GET' && parts[2]) {
      const instance = await workflowStore.getInstance(segment(parts[2], 100));
      const elevated = hasPermission(req.principal, 'workflows.manage');
      if (!elevated && instance.startedBy !== req.principal.username) {
        const tasks = await workflowStore.listTasks(req.principal, true);
        if (!tasks.some(task => task.instanceId === instance.id)) return send(res, 403, { error: 'You do not have access to this workflow instance.' });
      }
      return send(res, 200, instance);
    }

    if (parts[1] === 'workflows' && parts[2] && parts[3] === 'start' && req.method === 'POST') {
      const workflow = await workflowStore.getPublishedBySlug(segment(parts[2], 64));
      if (!workflow) return send(res, 404, { error: 'Published workflow not found.' });
      const input = await readBody(req);
      const result = await workflowEngine.start(workflow, input, req.principal);
      return send(res, 201, result);
    }

    return send(res, 404, { error: 'Workflow runtime route not found.' });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Workflow runtime request failed.' });
  }
};
