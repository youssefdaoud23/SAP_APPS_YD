'use strict';

const workspaceStore = require('../lib/workspaceStore');
const database = require('../lib/database');
const { PERMISSIONS, ROLES } = require('../lib/securityModel');
const { getBuildInfo } = require('../lib/buildInfo');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function platformHandler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Only GET is supported' });
  try {
    const [storage, db, security] = await Promise.all([
      workspaceStore.status(),
      database.status(),
      database.securitySummary()
    ]);
    const build = getBuildInfo(process.cwd());
    return send(res, 200, {
      product: build.product,
      version: build.version,
      commit: build.shortCommit || null,
      storage,
      database: db,
      security: {
        authMode: req.principal?.authMode || 'unknown',
        principal: req.principal || null,
        counts: security,
        roles: ROLES.map(role => ({ key: role.key, name: role.name, description: role.description, permissions: role.permissions })),
        permissions: PERMISSIONS
      },
      capabilities: {
        optimisticLocking: true,
        workspaceRevisions: storage.mode === 'postgres',
        auditEvents: db.connected === true,
        groupsAndRolesSchema: db.connected === true,
        oidc: false
      }
    });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Platform status unavailable' });
  }
};
