'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const database = require('./database');

const WORKSPACE_KEY = 'default';

function canonical(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

function makeEtag(text) {
  return `"${crypto.createHash('sha256').update(text).digest('hex')}"`;
}

function storageMode() {
  const configured = String(process.env.WORKSPACE_STORAGE || '').trim().toLowerCase();
  if (configured === 'postgres' || configured === 'file') return configured;
  return database.enabled() ? 'postgres' : 'file';
}

function workspaceFile() {
  const raw = String(process.env.WORKSPACE_FILE || '').trim();
  return raw ? path.resolve(raw) : null;
}

function conflict(currentEtag) {
  const error = new Error('Workspace changed on the server. Pull the latest version before overwriting it.');
  error.statusCode = 409;
  error.currentEtag = currentEtag || null;
  return error;
}

async function fileGet() {
  const file = workspaceFile();
  if (!file || !fs.existsSync(file)) {
    return { enabled: Boolean(file), exists: false, workspace: null, etag: null, revision: null, updatedAt: null, mode: 'file' };
  }
  const text = fs.readFileSync(file, 'utf8');
  const stat = fs.statSync(file);
  return {
    enabled: true,
    exists: true,
    workspace: JSON.parse(text),
    etag: makeEtag(text),
    revision: null,
    updatedAt: stat.mtime.toISOString(),
    mode: 'file'
  };
}

async function filePut(workspace, expectedEtag) {
  const file = workspaceFile();
  if (!file) {
    const error = new Error('WORKSPACE_FILE is not configured');
    error.statusCode = 503;
    throw error;
  }
  const current = await fileGet();
  if (expectedEtag && expectedEtag !== '*' && current.exists && expectedEtag !== current.etag) throw conflict(current.etag);
  if (expectedEtag && expectedEtag !== '*' && !current.exists) throw conflict(null);

  const text = canonical(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
  return { enabled: true, saved: true, etag: makeEtag(text), revision: null, updatedAt: new Date().toISOString(), mode: 'file' };
}

async function postgresGet() {
  await database.ensureDatabase();
  const result = await database.getPool().query(
    'SELECT document, etag, revision, updated_at FROM platform_workspace WHERE workspace_key=$1',
    [WORKSPACE_KEY]
  );
  if (!result.rowCount) {
    return { enabled: true, exists: false, workspace: null, etag: null, revision: 0, updatedAt: null, mode: 'postgres' };
  }
  const row = result.rows[0];
  return {
    enabled: true,
    exists: true,
    workspace: row.document,
    etag: row.etag,
    revision: Number(row.revision),
    updatedAt: row.updated_at,
    mode: 'postgres'
  };
}

async function postgresPut(workspace, expectedEtag, actor) {
  await database.ensureDatabase();
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT etag, revision FROM platform_workspace WHERE workspace_key=$1 FOR UPDATE',
      [WORKSPACE_KEY]
    );
    const current = existing.rows[0] || null;
    if (expectedEtag && expectedEtag !== '*' && current && expectedEtag !== current.etag) throw conflict(current.etag);
    if (expectedEtag && expectedEtag !== '*' && !current) throw conflict(null);

    const text = canonical(workspace);
    const tag = makeEtag(text);
    const nextRevision = current ? Number(current.revision) + 1 : 1;
    await client.query(`
      INSERT INTO platform_workspace(workspace_key, document, etag, revision, updated_at, updated_by)
      VALUES ($1,$2::jsonb,$3,$4,NOW(),$5)
      ON CONFLICT (workspace_key) DO UPDATE SET
        document=EXCLUDED.document,
        etag=EXCLUDED.etag,
        revision=EXCLUDED.revision,
        updated_at=NOW(),
        updated_by=EXCLUDED.updated_by
    `, [WORKSPACE_KEY, text, tag, nextRevision, actor || null]);
    await client.query('COMMIT');
    return {
      enabled: true,
      saved: true,
      etag: tag,
      revision: nextRevision,
      updatedAt: new Date().toISOString(),
      mode: 'postgres'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function get() {
  return storageMode() === 'postgres' ? postgresGet() : fileGet();
}

async function put(workspace, expectedEtag, actor) {
  const result = storageMode() === 'postgres'
    ? await postgresPut(workspace, expectedEtag, actor)
    : await filePut(workspace, expectedEtag);
  await database.audit('workspace.updated', actor, 'workspace', WORKSPACE_KEY, { storage: result.mode, revision: result.revision });
  return result;
}

async function status() {
  const mode = storageMode();
  if (mode === 'postgres') {
    const db = await database.status();
    return { mode, enabled: true, connected: db.connected, database: db.database || null, error: db.error || null };
  }
  const file = workspaceFile();
  return { mode, enabled: Boolean(file), connected: Boolean(file), file: file || null };
}

module.exports = { get, put, status, storageMode, makeEtag, canonical };
