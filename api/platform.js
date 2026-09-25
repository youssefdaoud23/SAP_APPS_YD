'use strict';

const workspaceStore = require('../lib/workspaceStore');
const database = require('../lib/database');
const auth = require('../lib/auth');
const oidc = require('../lib/oidc');
const releaseGovernance = require('../lib/releaseGovernance');
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
    const [storage, workspace, db, security] = await Promise.all([
      workspaceStore.status(),
      workspaceStore.get(),
      database.status(),
      database.securitySummary()
    ]);
    const build = getBuildInfo(process.cwd());
    return send(res, 200, {
      product: build.product,
      version: build.version,
      commit: build.shortCommit || null,
      storage: {
        ...storage,
        workspaceExists: workspace.exists,
        revision: workspace.revision,
        updatedAt: workspace.updatedAt
      },
      database: db,
      security: {
        authMode: auth.mode(),
        principal: req.principal || null,
        counts: security,
        roles: ROLES.map(role => ({ key: role.key, name: role.name, description: role.description, permissions: role.permissions })),
        permissions: PERMISSIONS
      },
      governance: {
        protectedReleaseApprovals: releaseGovernance.enabled(),
        selfApprovalAllowed: releaseGovernance.selfApprovalAllowed()
      },
      capabilities: {
        optimisticLocking: true,
        workspaceRevisions: storage.mode === 'postgres',
        auditEvents: db.connected === true,
        persistentIdentityMappings: db.connected === true,
        persistentSessions: db.connected === true,
        groupsAndRolesSchema: db.connected === true,
        oidc: oidc.enabled(),
        apiDesigner: db.connected === true,
        reusableApiRuntime: db.connected === true,
        openApi31: db.connected === true,
        declarativeApiMappings: db.connected === true,
        serverFunctions: db.connected === true,
        serverFunctionMode: 'declarative-pipeline',
        workflows: db.connected === true,
        workflowTasks: db.connected === true,
        workflowMode: 'durable-declarative',
        roleAwareLaunchpad: true,
        enterpriseComponentCatalog: true,
        rfcBapiBridge: Boolean(String(process.env.SAP_RFC_CONNECTIONS_JSON || '').trim() && String(process.env.SAP_RFC_CONNECTIONS_JSON || '').trim() !== '[]'),
        rfcAdapter: 'optional-http-json-bridge',
        releaseApprovals: db.connected === true,
        releaseComparison: db.connected === true,
        backupRestoreScripts: true
      }
    });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Platform status unavailable' });
  }
};
