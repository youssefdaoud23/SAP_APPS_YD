'use strict';

const { hasPermission } = require('./securityModel');

function isProductionConnection(connection) {
  if (!connection || typeof connection !== 'object') return false;
  if (connection.production === true) return true;
  const environment = String(connection.environment || connection.stage || '').trim().toLowerCase();
  return ['prd', 'prod', 'production'].includes(environment);
}

function requiredPermissionForMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase()) ? 'apps.edit' : 'apps.view';
}

function authorizeConnectionRequest(principal, connection, method) {
  if (!hasPermission(principal, 'connections.view')) {
    return { ok: false, status: 403, error: 'Permission connections.view is required.' };
  }
  const permission = requiredPermissionForMethod(method);
  if (!hasPermission(principal, permission)) {
    return { ok: false, status: 403, error: `Permission ${permission} is required.` };
  }
  if (isProductionConnection(connection) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase()) && !hasPermission(principal, 'production.write')) {
    return { ok: false, status: 403, error: 'Permission production.write is required for writes to a production connection.' };
  }
  return { ok: true };
}

module.exports = { isProductionConnection, requiredPermissionForMethod, authorizeConnectionRequest };
