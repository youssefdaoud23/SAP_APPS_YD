'use strict';

const assert = require('assert');
const { ROLES, PERMISSIONS, permissionsForRoles, principal, hasPermission } = require('../lib/securityModel');

assert(ROLES.some(role => role.key === 'platform-admin'));
assert(ROLES.some(role => role.key === 'developer'));
assert(PERMISSIONS.some(permission => permission.key === 'apps.edit'));
assert(PERMISSIONS.some(permission => permission.key === 'users.manage'));

const developer = principal('dev-user', ['developer'], 'test');
assert.strictEqual(developer.username, 'dev-user');
assert.strictEqual(hasPermission(developer, 'apps.edit'), true);
assert.strictEqual(hasPermission(developer, 'users.manage'), false);

const adminPermissions = permissionsForRoles(['platform-admin']);
assert(adminPermissions.includes('platform.admin'));
assert(adminPermissions.includes('production.write'));

console.log('securityModel tests passed');
