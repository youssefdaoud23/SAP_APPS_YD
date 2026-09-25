'use strict';

const deployments = require('./deployments');
const governance = require('../lib/releaseGovernance');

async function readBody(req, maxBytes = 6 * 1024 * 1024) {
  if (req.body != null) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Deployment payload exceeds 6 MB.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('Deployment payload is not valid JSON.'), { statusCode: 400 }); }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function deploymentGateway(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const action = String(url.searchParams.get('action') || '').trim().toLowerCase();
    if (req.method !== 'POST' || !governance.ACTIONS.has(action)) return deployments(req, res);

    const input = await readBody(req);
    req.body = input;
    const result = await governance.validateForDeployment(input.approvalId, action, input, req.principal);
    if (!result.required) return deployments(req, res);

    await governance.consume(result.approval.id, req.principal);
    const originalEnd = res.end.bind(res);
    let restored = false;
    res.end = function guardedEnd(chunk, ...args) {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      if (ok) return originalEnd(chunk, ...args);
      if (restored) return originalEnd(chunk, ...args);
      restored = true;
      governance.restore(result.approval.id, req.principal, `Deployment action ${action} returned HTTP ${res.statusCode}`).catch(error => {
        console.error('Failed to restore release approval after deployment failure:', error.message);
      }).finally(() => originalEnd(chunk, ...args));
      return res;
    };
    return deployments(req, res);
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Deployment governance check failed.' });
  }
};
