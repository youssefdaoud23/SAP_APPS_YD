'use strict';

const database = require('../lib/database');
const releaseDiff = require('../lib/releaseDiff');
const { hasPermission } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function deployment(id) {
  const result = await database.getPool().query(`
    SELECT deployment_id AS id,app_id AS "appId",app_name AS "appName",environment_key AS "environmentKey",
           version_label AS "versionLabel",checksum,application_snapshot AS application,
           deployed_at AS "deployedAt",deployed_by AS "deployedBy"
    FROM platform_deployments WHERE deployment_id=$1
  `, [id]);
  if (!result.rowCount) throw Object.assign(new Error(`Deployment ${id} was not found.`), { statusCode: 404 });
  return result.rows[0];
}

module.exports = async function releasesHandler(req, res) {
  if (!database.enabled()) return send(res, 503, { error: 'PostgreSQL is required for release comparison.' });
  if (!hasPermission(req.principal, 'apps.deploy') && !hasPermission(req.principal, 'apps.publish')) {
    return send(res, 403, { error: 'Permission apps.deploy or apps.publish is required.' });
  }
  try {
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'compare';
    if (req.method !== 'GET' || action !== 'compare') return send(res, 405, { error: 'Only GET action=compare is supported.' });
    const fromId = String(url.searchParams.get('from') || '').trim().slice(0, 100);
    const toId = String(url.searchParams.get('to') || '').trim().slice(0, 100);
    if (!fromId || !toId) return send(res, 400, { error: 'from and to deployment ids are required.' });
    const [from, to] = await Promise.all([deployment(fromId), deployment(toId)]);
    if (from.appId !== to.appId) return send(res, 409, { error: 'Deployments belong to different applications.' });
    const diff = releaseDiff.compare(from.application, to.application, Math.min(2000, Math.max(50, Number(url.searchParams.get('limit')) || 1000)));
    return send(res, 200, {
      appId: from.appId,
      appName: to.appName || from.appName,
      from: { id: from.id, environmentKey: from.environmentKey, versionLabel: from.versionLabel, checksum: from.checksum, deployedAt: from.deployedAt, deployedBy: from.deployedBy },
      to: { id: to.id, environmentKey: to.environmentKey, versionLabel: to.versionLabel, checksum: to.checksum, deployedAt: to.deployedAt, deployedBy: to.deployedBy },
      diff
    });
  } catch (error) {
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Release comparison failed.' });
  }
};
