'use strict';

const crypto = require('crypto');
const database = require('./database');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function ttlSeconds() {
  const configured = Number(process.env.OIDC_SESSION_TTL_SECONDS || 28800);
  if (!Number.isFinite(configured)) return 28800;
  return Math.min(Math.max(Math.floor(configured), 300), 86400 * 7);
}

async function createSession(principal, metadata = {}) {
  if (!database.enabled()) throw new Error('PostgreSQL is required for persistent authentication sessions.');
  await database.ensureDatabase();
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000);
  await database.getPool().query(`
    INSERT INTO platform_auth_sessions(session_hash,user_id,username,principal,provider,subject,metadata,expires_at)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8)
  `, [
    sessionHash,
    principal.userId || null,
    principal.username,
    JSON.stringify(principal),
    principal.authMode || 'oidc',
    principal.subject || null,
    JSON.stringify(metadata || {}),
    expiresAt
  ]);
  await cleanupExpired();
  return { token, expiresAt, maxAge: ttlSeconds() };
}

async function readSession(token) {
  const value = String(token || '');
  if (!value || !database.enabled()) return null;
  await database.ensureDatabase();
  const sessionHash = hashToken(value);
  const result = await database.getPool().query(`
    SELECT principal, last_seen_at AS "lastSeenAt", expires_at AS "expiresAt"
    FROM platform_auth_sessions
    WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `, [sessionHash]);
  const row = result.rows[0];
  if (!row) return null;
  const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    database.getPool().query('UPDATE platform_auth_sessions SET last_seen_at=NOW() WHERE session_hash=$1', [sessionHash]).catch(() => {});
  }
  return row.principal || null;
}

async function revokeSession(token, actor = null) {
  const value = String(token || '');
  if (!value || !database.enabled()) return false;
  await database.ensureDatabase();
  const sessionHash = hashToken(value);
  const result = await database.getPool().query(`
    UPDATE platform_auth_sessions SET revoked_at=NOW()
    WHERE session_hash=$1 AND revoked_at IS NULL
    RETURNING username
  `, [sessionHash]);
  if (result.rowCount) {
    await database.audit('security.session.revoked', actor || result.rows[0].username, 'session', sessionHash.slice(0, 12), {});
  }
  return Boolean(result.rowCount);
}

async function revokeUserSessions(userId, actor = null) {
  if (!userId || !database.enabled()) return 0;
  await database.ensureDatabase();
  const result = await database.getPool().query(`
    UPDATE platform_auth_sessions SET revoked_at=NOW()
    WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > NOW()
  `, [userId]);
  if (result.rowCount) await database.audit('security.sessions.revoked', actor, 'user', userId, { count: result.rowCount });
  return result.rowCount;
}

async function cleanupExpired() {
  if (!database.enabled()) return 0;
  const result = await database.getPool().query(`
    DELETE FROM platform_auth_sessions
    WHERE expires_at < NOW() - INTERVAL '7 days'
       OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')
  `);
  return result.rowCount;
}

module.exports = { createSession, readSession, revokeSession, revokeUserSessions, cleanupExpired, hashToken, ttlSeconds };
