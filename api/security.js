'use strict';

const crypto = require('crypto');
const database = require('../lib/database');
const { ROLES, hasPermission, roleByKey } = require('../lib/securityModel');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function body(req) {
  if (req.body != null) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function requireAdmin(req, res) {
  if (!hasPermission(req.principal, 'users.manage')) {
    send(res, 403, { error: 'Permission users.manage is required.' });
    return false;
  }
  if (!database.enabled()) {
    send(res, 503, { error: 'PostgreSQL is required for persistent identity administration.' });
    return false;
  }
  return true;
}

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validateUsername(username) {
  if (!/^[A-Za-z0-9._@-]{2,120}$/.test(username)) {
    const error = new Error('Username must be 2-120 characters and use letters, numbers, dot, underscore, @ or hyphen.');
    error.statusCode = 400;
    throw error;
  }
}

async function listUsers() {
  await database.ensureDatabase();
  const result = await database.getPool().query(`
    SELECT u.user_id AS "id", u.username, u.display_name AS "displayName", u.email, u.status,
           u.identity_provider AS "identityProvider", u.external_subject AS "externalSubject",
           u.created_at AS "createdAt", u.updated_at AS "updatedAt",
           COALESCE(array_agg(ur.role_key ORDER BY ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL), '{}') AS roles
    FROM platform_users u
    LEFT JOIN platform_user_roles ur ON ur.user_id=u.user_id
    GROUP BY u.user_id
    ORDER BY lower(u.username)
  `);
  return result.rows;
}

async function createUser(req) {
  const input = await body(req);
  const username = clean(input.username, 120);
  validateUsername(username);
  const displayName = clean(input.displayName || username, 160);
  const email = clean(input.email, 240) || null;
  const status = ['active', 'disabled'].includes(input.status) ? input.status : 'active';
  const identityProvider = clean(input.identityProvider || 'local', 80) || 'local';
  const externalSubject = clean(input.externalSubject, 240) || null;
  const roleKeys = Array.isArray(input.roles) ? Array.from(new Set(input.roles.map(String))).filter(roleByKey) : ['viewer'];
  const userId = crypto.randomUUID();
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO platform_users(user_id,username,display_name,email,status,identity_provider,external_subject) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, username, displayName, email, status, identityProvider, externalSubject]
    );
    for (const roleKey of roleKeys) {
      await client.query('INSERT INTO platform_user_roles(user_id,role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleKey]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('A user with that username already exists.'), { statusCode: 409 });
    throw error;
  } finally {
    client.release();
  }
  await database.audit('security.user.created', req.principal?.username, 'user', userId, { username, roles: roleKeys });
  return userId;
}

async function deleteUser(req, id) {
  const result = await database.getPool().query('DELETE FROM platform_users WHERE user_id=$1 RETURNING username', [id]);
  if (!result.rowCount) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
  await database.audit('security.user.deleted', req.principal?.username, 'user', id, { username: result.rows[0].username });
}

async function setUserRole(req) {
  const input = await body(req);
  const userId = clean(input.userId, 80);
  const roleKey = clean(input.roleKey, 80);
  if (!roleByKey(roleKey)) throw Object.assign(new Error('Unknown role.'), { statusCode: 400 });
  const enabled = input.enabled !== false;
  if (enabled) {
    await database.getPool().query('INSERT INTO platform_user_roles(user_id,role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleKey]);
  } else {
    await database.getPool().query('DELETE FROM platform_user_roles WHERE user_id=$1 AND role_key=$2', [userId, roleKey]);
  }
  await database.audit('security.user.role', req.principal?.username, 'user', userId, { roleKey, enabled });
}

async function listGroups() {
  const result = await database.getPool().query(`
    SELECT g.group_id AS "id", g.name, g.description, g.external_group_id AS "externalGroupId",
           g.created_at AS "createdAt", g.updated_at AS "updatedAt",
           COALESCE((SELECT array_agg(gr.role_key ORDER BY gr.role_key) FROM platform_group_roles gr WHERE gr.group_id=g.group_id), '{}') AS roles,
           (SELECT COUNT(*)::int FROM platform_group_members gm WHERE gm.group_id=g.group_id) AS "memberCount"
    FROM platform_groups g
    ORDER BY lower(g.name)
  `);
  return result.rows;
}

async function createGroup(req) {
  const input = await body(req);
  const name = clean(input.name, 160);
  if (name.length < 2) throw Object.assign(new Error('Group name must be at least 2 characters.'), { statusCode: 400 });
  const groupId = crypto.randomUUID();
  const description = clean(input.description, 500);
  const externalGroupId = clean(input.externalGroupId, 240) || null;
  const roleKeys = Array.isArray(input.roles) ? Array.from(new Set(input.roles.map(String))).filter(roleByKey) : [];
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO platform_groups(group_id,name,description,external_group_id) VALUES ($1,$2,$3,$4)', [groupId, name, description, externalGroupId]);
    for (const roleKey of roleKeys) {
      await client.query('INSERT INTO platform_group_roles(group_id,role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, roleKey]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('A group with that name already exists.'), { statusCode: 409 });
    throw error;
  } finally {
    client.release();
  }
  await database.audit('security.group.created', req.principal?.username, 'group', groupId, { name, roles: roleKeys });
  return groupId;
}

async function deleteGroup(req, id) {
  const result = await database.getPool().query('DELETE FROM platform_groups WHERE group_id=$1 RETURNING name', [id]);
  if (!result.rowCount) throw Object.assign(new Error('Group not found.'), { statusCode: 404 });
  await database.audit('security.group.deleted', req.principal?.username, 'group', id, { name: result.rows[0].name });
}

async function setGroupRole(req) {
  const input = await body(req);
  const groupId = clean(input.groupId, 80);
  const roleKey = clean(input.roleKey, 80);
  if (!roleByKey(roleKey)) throw Object.assign(new Error('Unknown role.'), { statusCode: 400 });
  const enabled = input.enabled !== false;
  if (enabled) {
    await database.getPool().query('INSERT INTO platform_group_roles(group_id,role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, roleKey]);
  } else {
    await database.getPool().query('DELETE FROM platform_group_roles WHERE group_id=$1 AND role_key=$2', [groupId, roleKey]);
  }
  await database.audit('security.group.role', req.principal?.username, 'group', groupId, { roleKey, enabled });
}

async function setGroupMember(req) {
  const input = await body(req);
  const groupId = clean(input.groupId, 80);
  const userId = clean(input.userId, 80);
  const enabled = input.enabled !== false;
  if (enabled) {
    await database.getPool().query('INSERT INTO platform_group_members(group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);
  } else {
    await database.getPool().query('DELETE FROM platform_group_members WHERE group_id=$1 AND user_id=$2', [groupId, userId]);
  }
  await database.audit('security.group.member', req.principal?.username, 'group', groupId, { userId, enabled });
}

module.exports = async function securityHandler(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    await database.ensureDatabase();
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'summary';

    if (req.method === 'GET' && action === 'summary') {
      return send(res, 200, { roles: ROLES, users: await listUsers(), groups: await listGroups() });
    }
    if (req.method === 'GET' && action === 'users') return send(res, 200, { users: await listUsers() });
    if (req.method === 'GET' && action === 'groups') return send(res, 200, { groups: await listGroups() });
    if (req.method === 'POST' && action === 'user') return send(res, 201, { created: true, id: await createUser(req) });
    if (req.method === 'POST' && action === 'user-role') { await setUserRole(req); return send(res, 200, { saved: true }); }
    if (req.method === 'DELETE' && action === 'user') { await deleteUser(req, clean(url.searchParams.get('id'), 80)); return send(res, 200, { deleted: true }); }
    if (req.method === 'POST' && action === 'group') return send(res, 201, { created: true, id: await createGroup(req) });
    if (req.method === 'POST' && action === 'group-role') { await setGroupRole(req); return send(res, 200, { saved: true }); }
    if (req.method === 'POST' && action === 'group-member') { await setGroupMember(req); return send(res, 200, { saved: true }); }
    if (req.method === 'DELETE' && action === 'group') { await deleteGroup(req, clean(url.searchParams.get('id'), 80)); return send(res, 200, { deleted: true }); }

    return send(res, 404, { error: 'Unknown security action.' });
  } catch (error) {
    if (error instanceof SyntaxError) return send(res, 400, { error: 'Request body is not valid JSON.' });
    return send(res, Number(error.statusCode) || 500, { error: error.message || 'Security administration error' });
  }
};
