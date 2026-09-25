'use strict';

const governance = require('../lib/releaseGovernance');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = 1024 * 1024) {
  if (req.body != null) return req.body;
  const chunks = []; let size = 0;
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

function allowedToView(principal) {
  return hasPermission(principal, 'apps.deploy') || hasPermission(principal, 'apps.publish');
}

module.exports = async function releaseApprovalsHandler(req, res) {
  try {
    if (!governance.enabled() && String(process.env.RELEASE_APPROVALS_ENABLED || '').toLowerCase() !== 'true') {
      // Administration remains visible in local mode, but approvals are not enforced there by default.
    }
    await governance.ensureSchema();
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'list';

    if (req.method === 'GET' && action === 'status') {
      if (!allowedToView(req.principal)) return send(res, 403, { error: 'Permission apps.deploy or apps.publish is required.' });
      return send(res, 200, { enabled: governance.enabled(), selfApprovalAllowed: governance.selfApprovalAllowed() });
    }

    if (req.method === 'GET' && action === 'list') {
      if (!allowedToView(req.principal)) return send(res, 403, { error: 'Permission apps.deploy or apps.publish is required.' });
      return send(res, 200, { approvals: await governance.list({
        status: url.searchParams.get('status'),
        appId: url.searchParams.get('appId'),
        environmentKey: url.searchParams.get('environmentKey'),
        limit: url.searchParams.get('limit')
      }) });
    }

    if (req.method === 'GET' && action === 'get') {
      if (!allowedToView(req.principal)) return send(res, 403, { error: 'Permission apps.deploy or apps.publish is required.' });
      return send(res, 200, { approval: await governance.get(String(url.searchParams.get('id') || '').trim()) });
    }

    if (req.method === 'POST' && action === 'request') {
      if (!hasPermission(req.principal, 'apps.deploy')) return send(res, 403, { error: 'Permission apps.deploy is required.' });
      const input = await readBody(req);
      const deploymentAction = String(input.action || '').trim().toLowerCase();
      if (!governance.ACTIONS.has(deploymentAction)) return send(res, 400, { error: 'action must be deploy, promote or rollback.' });
      return send(res, 201, { approval: await governance.requestApproval(deploymentAction, input, req.principal) });
    }

    if (req.method === 'POST' && ['approve', 'reject'].includes(action)) {
      if (!hasPermission(req.principal, 'apps.publish')) return send(res, 403, { error: 'Permission apps.publish is required to decide release approvals.' });
      const input = await readBody(req);
      const id = String(input.id || url.searchParams.get('id') || '').trim();
      const decision = action === 'approve' ? 'approved' : 'rejected';
      return send(res, 200, { approval: await governance.decide(id, decision, req.principal, input.note || '') });
    }

    if (req.method === 'POST' && action === 'cancel') {
      if (!hasPermission(req.principal, 'apps.deploy')) return send(res, 403, { error: 'Permission apps.deploy is required.' });
      const input = await readBody(req);
      const id = String(input.id || url.searchParams.get('id') || '').trim();
      return send(res, 200, { approval: await governance.cancel(id, req.principal) });
    }

    return send(res, 404, { error: 'Unknown release approval action.' });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Release approval request failed.' });
  }
};
