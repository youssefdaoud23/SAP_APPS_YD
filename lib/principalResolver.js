'use strict';

const crypto = require('crypto');
const database = require('./database');
const { principal, roleByKey } = require('./securityModel');

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

function bootstrapValues() {
  return new Set(String(process.env.OIDC_BOOTSTRAP_ADMINS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
}

function isBootstrapIdentity(identity) {
  const allowed = bootstrapValues();
  if (!allowed.size) return false;
  return [identity.subject, identity.username, identity.email]
    .map(value => normalize(value).toLowerCase())
    .some(value => value && allowed.has(value));
}

async function findMappedUser(identity) {
  const provider = normalize(identity.issuer || 'oidc');
  const subject = normalize(identity.subject);
  const username = normalize(identity.username);
  const email = normalize(identity.email);
  const result = await database.getPool().query(`
    SELECT user_id AS "id", username, display_name AS "displayName", email, status,
           identity_provider AS "identityProvider", external_subject AS "externalSubject"
    FROM platform_users
    WHERE (external_subject=$1 AND identity_provider=$2)
       OR ($3 <> '' AND lower(username)=lower($3) AND identity_provider IN ('oidc',$2) AND (external_subject IS NULL OR external_subject=''))
       OR ($4 <> '' AND lower(COALESCE(email,''))=lower($4) AND identity_provider IN ('oidc',$2) AND (external_subject IS NULL OR external_subject=''))
    ORDER BY CASE WHEN external_subject=$1 AND identity_provider=$2 THEN 0 ELSE 1 END
    LIMIT 1
  `, [subject, provider, username, email]);
  return result.rows[0] || null;
}

async function bindSubject(userId, identity) {
  await database.getPool().query(`
    UPDATE platform_users
    SET identity_provider=$2, external_subject=$3,
        display_name=CASE WHEN display_name='' THEN $4 ELSE display_name END,
        email=COALESCE(email,$5), updated_at=NOW()
    WHERE user_id=$1
  `, [userId, normalize(identity.issuer || 'oidc'), normalize(identity.subject), normalize(identity.displayName || identity.username), normalize(identity.email) || null]);
}

async function createMappedUser(identity, roleKey) {
  const userId = crypto.randomUUID();
  const username = normalize(identity.username || identity.email || identity.subject).slice(0, 120);
  if (!username) throw Object.assign(new Error('OIDC identity does not contain a usable username.'), { statusCode: 403 });
  const displayName = normalize(identity.displayName || username).slice(0, 160);
  const email = normalize(identity.email).slice(0, 240) || null;
  const provider = normalize(identity.issuer || 'oidc').slice(0, 240);
  const subject = normalize(identity.subject).slice(0, 240);
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO platform_users(user_id,username,display_name,email,status,identity_provider,external_subject)
      VALUES ($1,$2,$3,$4,'active',$5,$6)
    `, [userId, username, displayName, email, provider, subject]);
    if (roleKey && roleByKey(roleKey)) {
      await client.query('INSERT INTO platform_user_roles(user_id,role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleKey]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await database.audit('security.user.autoprovisioned', username, 'user', userId, { provider, role: roleKey || null });
  return findMappedUser(identity);
}

async function resolveRoles(userId, externalGroups = []) {
  const groups = Array.from(new Set((externalGroups || []).map(value => String(value)).filter(Boolean)));
  const result = await database.getPool().query(`
    SELECT DISTINCT role_key FROM (
      SELECT ur.role_key
      FROM platform_user_roles ur
      WHERE ur.user_id=$1
      UNION ALL
      SELECT gr.role_key
      FROM platform_group_members gm
      JOIN platform_group_roles gr ON gr.group_id=gm.group_id
      WHERE gm.user_id=$1
      UNION ALL
      SELECT gr.role_key
      FROM platform_groups g
      JOIN platform_group_roles gr ON gr.group_id=g.group_id
      WHERE cardinality($2::text[]) > 0 AND g.external_group_id = ANY($2::text[])
    ) roles
    ORDER BY role_key
  `, [userId, groups]);
  return result.rows.map(row => row.role_key);
}

async function resolveOidcPrincipal(identity) {
  if (!database.enabled()) throw Object.assign(new Error('PostgreSQL is required for OIDC identity mapping.'), { statusCode: 503 });
  await database.ensureDatabase();

  const bootstrap = isBootstrapIdentity(identity);
  let user = await findMappedUser(identity);

  if (!user && bootstrap) {
    user = await createMappedUser(identity, 'platform-admin');
  } else if (!user && String(process.env.OIDC_AUTO_PROVISION || '').toLowerCase() === 'true') {
    const requested = normalize(process.env.OIDC_DEFAULT_ROLE || 'viewer');
    user = await createMappedUser(identity, roleByKey(requested) ? requested : 'viewer');
  }

  if (!user) throw Object.assign(new Error('This identity has no Invarture platform access mapping.'), { statusCode: 403 });
  if (user.status !== 'active') throw Object.assign(new Error('This Invarture platform user is disabled.'), { statusCode: 403 });

  if (!user.externalSubject) await bindSubject(user.id, identity);
  const roles = await resolveRoles(user.id, identity.groups || []);
  if (bootstrap && !roles.includes('platform-admin')) roles.push('platform-admin');
  if (!roles.length) throw Object.assign(new Error('This identity has no assigned Invarture platform role.'), { statusCode: 403 });

  const base = principal(user.username, roles, 'oidc');
  return Object.freeze({
    ...base,
    userId: user.id,
    displayName: user.displayName || identity.displayName || user.username,
    email: user.email || identity.email || null,
    subject: identity.subject,
    issuer: identity.issuer,
    externalGroups: Array.from(new Set(identity.groups || []))
  });
}

module.exports = { resolveOidcPrincipal, resolveRoles, isBootstrapIdentity };
