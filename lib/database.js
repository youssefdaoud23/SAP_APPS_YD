'use strict';

const { PERMISSIONS, ROLES } = require('./securityModel');

let pool = null;
let initPromise = null;

function databaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function enabled() {
  return Boolean(databaseUrl());
}

function getPool() {
  if (!enabled()) return null;
  if (pool) return pool;
  const { Pool } = require('pg');
  const ssl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : undefined;
  pool = new Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5000),
    ssl
  });
  pool.on('error', error => console.error('PostgreSQL pool error:', error.message));
  return pool;
}

async function seedSecurity(client) {
  for (const permission of PERMISSIONS) {
    await client.query(
      'INSERT INTO platform_permissions(permission_key, description) VALUES ($1,$2) ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description',
      [permission.key, permission.description]
    );
  }
  for (const role of ROLES) {
    await client.query(
      'INSERT INTO platform_roles(role_key, name, description, builtin) VALUES ($1,$2,$3,true) ON CONFLICT (role_key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, builtin=true',
      [role.key, role.name, role.description]
    );
    await client.query('DELETE FROM platform_role_permissions WHERE role_key=$1', [role.key]);
    for (const permission of role.permissions) {
      await client.query(
        'INSERT INTO platform_role_permissions(role_key, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [role.key, permission]
      );
    }
  }
}

async function seedEnvironments(client) {
  const environments = [
    ['DEV', 'Development', 'development', 10, false],
    ['QAS', 'Quality Assurance', 'test', 20, false],
    ['PRD', 'Production', 'production', 30, true]
  ];
  for (const [key, name, stage, sortOrder, protectedEnvironment] of environments) {
    await client.query(`
      INSERT INTO platform_environments(environment_key,name,stage,sort_order,protected,connection_aliases,builtin)
      VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,true)
      ON CONFLICT (environment_key) DO UPDATE SET
        name=EXCLUDED.name,
        stage=EXCLUDED.stage,
        sort_order=EXCLUDED.sort_order,
        protected=EXCLUDED.protected,
        builtin=true,
        updated_at=NOW()
    `, [key, name, stage, sortOrder, protectedEnvironment]);
  }
}

async function ensureDatabase() {
  if (!enabled()) return { enabled: false, mode: 'file' };
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS platform_workspace (
          workspace_key TEXT PRIMARY KEY,
          document JSONB NOT NULL,
          etag TEXT NOT NULL,
          revision BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by TEXT
        );

        CREATE TABLE IF NOT EXISTS platform_permissions (
          permission_key TEXT PRIMARY KEY,
          description TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS platform_roles (
          role_key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          builtin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_role_permissions (
          role_key TEXT NOT NULL REFERENCES platform_roles(role_key) ON DELETE CASCADE,
          permission_key TEXT NOT NULL REFERENCES platform_permissions(permission_key) ON DELETE CASCADE,
          PRIMARY KEY(role_key, permission_key)
        );

        CREATE TABLE IF NOT EXISTS platform_users (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL DEFAULT '',
          email TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          identity_provider TEXT NOT NULL DEFAULT 'local',
          external_subject TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_user_roles (
          user_id TEXT NOT NULL REFERENCES platform_users(user_id) ON DELETE CASCADE,
          role_key TEXT NOT NULL REFERENCES platform_roles(role_key) ON DELETE CASCADE,
          PRIMARY KEY(user_id, role_key)
        );

        CREATE TABLE IF NOT EXISTS platform_groups (
          group_id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          external_group_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_group_members (
          group_id TEXT NOT NULL REFERENCES platform_groups(group_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES platform_users(user_id) ON DELETE CASCADE,
          PRIMARY KEY(group_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS platform_group_roles (
          group_id TEXT NOT NULL REFERENCES platform_groups(group_id) ON DELETE CASCADE,
          role_key TEXT NOT NULL REFERENCES platform_roles(role_key) ON DELETE CASCADE,
          PRIMARY KEY(group_id, role_key)
        );

        CREATE TABLE IF NOT EXISTS platform_auth_sessions (
          session_hash TEXT PRIMARY KEY,
          user_id TEXT REFERENCES platform_users(user_id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          principal JSONB NOT NULL,
          provider TEXT NOT NULL DEFAULT 'oidc',
          subject TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS platform_audit_events (
          event_id BIGSERIAL PRIMARY KEY,
          event_type TEXT NOT NULL,
          actor TEXT,
          target_type TEXT,
          target_id TEXT,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_environments (
          environment_key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          stage TEXT NOT NULL DEFAULT 'custom',
          sort_order INTEGER NOT NULL DEFAULT 100,
          protected BOOLEAN NOT NULL DEFAULT FALSE,
          connection_aliases JSONB NOT NULL DEFAULT '{}'::jsonb,
          builtin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS platform_deployments (
          deployment_id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          app_name TEXT NOT NULL,
          version_id TEXT,
          version_label TEXT,
          environment_key TEXT NOT NULL REFERENCES platform_environments(environment_key),
          source_environment_key TEXT REFERENCES platform_environments(environment_key),
          status TEXT NOT NULL DEFAULT 'deployed',
          action TEXT NOT NULL DEFAULT 'deploy',
          application_snapshot JSONB NOT NULL,
          checksum TEXT NOT NULL,
          release_notes TEXT NOT NULL DEFAULT '',
          parent_deployment_id TEXT REFERENCES platform_deployments(deployment_id),
          deployed_by TEXT,
          deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_platform_auth_sessions_expires ON platform_auth_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_platform_auth_sessions_user ON platform_auth_sessions(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_created_at ON platform_audit_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_event_type ON platform_audit_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_platform_deployments_app ON platform_deployments(app_id, deployed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_platform_deployments_environment ON platform_deployments(environment_key, deployed_at DESC);
      `);
      await seedSecurity(client);
      await seedEnvironments(client);
      await client.query('COMMIT');
      return { enabled: true, mode: 'postgres' };
    } catch (error) {
      await client.query('ROLLBACK');
      initPromise = null;
      throw error;
    } finally {
      client.release();
    }
  })();
  return initPromise;
}

async function status() {
  if (!enabled()) return { enabled: false, connected: false, mode: 'file' };
  try {
    await ensureDatabase();
    const result = await getPool().query('SELECT NOW() AS server_time, current_database() AS database_name');
    return {
      enabled: true,
      connected: true,
      mode: 'postgres',
      database: result.rows[0]?.database_name || null,
      serverTime: result.rows[0]?.server_time || null
    };
  } catch (error) {
    return { enabled: true, connected: false, mode: 'postgres', error: error.message };
  }
}

async function securitySummary() {
  if (!enabled()) return { persistent: false, users: 0, groups: 0, roles: ROLES.length, permissions: PERMISSIONS.length, sessions: 0 };
  await ensureDatabase();
  const result = await getPool().query(`
    SELECT
      (SELECT COUNT(*)::int FROM platform_users) AS users,
      (SELECT COUNT(*)::int FROM platform_groups) AS groups,
      (SELECT COUNT(*)::int FROM platform_roles) AS roles,
      (SELECT COUNT(*)::int FROM platform_permissions) AS permissions,
      (SELECT COUNT(*)::int FROM platform_auth_sessions WHERE revoked_at IS NULL AND expires_at > NOW()) AS sessions
  `);
  return { persistent: true, ...result.rows[0] };
}

async function audit(eventType, actor, targetType, targetId, details = {}) {
  if (!enabled()) return false;
  await ensureDatabase();
  await getPool().query(
    'INSERT INTO platform_audit_events(event_type, actor, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [eventType, actor || null, targetType || null, targetId || null, JSON.stringify(details || {})]
  );
  return true;
}

module.exports = { enabled, getPool, ensureDatabase, status, securitySummary, audit };
