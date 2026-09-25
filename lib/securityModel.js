'use strict';

const PERMISSIONS = Object.freeze([
  { key: 'platform.admin', description: 'Full platform administration' },
  { key: 'apps.view', description: 'View applications' },
  { key: 'apps.create', description: 'Create applications' },
  { key: 'apps.edit', description: 'Edit applications and workspace state' },
  { key: 'apps.publish', description: 'Publish application versions' },
  { key: 'apps.deploy', description: 'Promote application versions between environments' },
  { key: 'connections.view', description: 'View safe connection descriptors' },
  { key: 'connections.manage', description: 'Manage connection configuration' },
  { key: 'workflows.manage', description: 'Create and administer workflows' },
  { key: 'api.manage', description: 'Create and administer reusable APIs' },
  { key: 'users.manage', description: 'Manage users, groups and roles' },
  { key: 'audit.view', description: 'View audit history and diagnostics' },
  { key: 'production.write', description: 'Execute authorized production writes' }
]);

const ALL_PERMISSION_KEYS = Object.freeze(PERMISSIONS.map(item => item.key));

const ROLES = Object.freeze([
  { key: 'platform-admin', name: 'Platform Admin', description: 'Full platform administration.', permissions: ALL_PERMISSION_KEYS },
  { key: 'developer', name: 'Developer', description: 'Build and test applications and reusable APIs.', permissions: ['apps.view', 'apps.create', 'apps.edit', 'connections.view', 'api.manage', 'audit.view'] },
  { key: 'publisher', name: 'Publisher', description: 'Review, publish and promote approved versions.', permissions: ['apps.view', 'apps.publish', 'apps.deploy', 'connections.view', 'audit.view'] },
  { key: 'viewer', name: 'Viewer', description: 'Read-only platform access.', permissions: ['apps.view', 'connections.view'] }
]);

function roleByKey(key) {
  return ROLES.find(role => role.key === key) || null;
}

function permissionsForRoles(roleKeys = []) {
  const result = new Set();
  for (const key of roleKeys) {
    const role = roleByKey(key);
    if (!role) continue;
    for (const permission of role.permissions) result.add(permission);
  }
  return Array.from(result).sort();
}

function principal(username, roleKeys = ['viewer'], authMode = 'unknown') {
  const roles = Array.from(new Set(roleKeys.filter(Boolean)));
  return Object.freeze({ username: username || 'anonymous', authMode, roles, permissions: permissionsForRoles(roles) });
}

function hasPermission(subject, permission) {
  if (!subject || !Array.isArray(subject.permissions)) return false;
  return subject.permissions.includes('platform.admin') || subject.permissions.includes(permission);
}

module.exports = { PERMISSIONS, ROLES, ALL_PERMISSION_KEYS, roleByKey, permissionsForRoles, principal, hasPermission };
