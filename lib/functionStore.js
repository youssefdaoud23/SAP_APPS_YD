'use strict';

const crypto = require('crypto');
const database = require('./database');

let schemaPromise = null;
const STATUSES = new Set(['draft', 'published', 'disabled']);

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validateSlug(value) {
  const slug = clean(value, 64).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) throw Object.assign(new Error('Function slug must start with a letter and contain only lowercase letters, numbers and hyphens.'), { statusCode: 400 });
  return slug;
}

function jsonObject(value, label) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${label} must be a JSON object.`), { statusCode: 400 });
  return value;
}

function validateSteps(value) {
  if (!Array.isArray(value)) throw Object.assign(new Error('steps must be an array.'), { statusCode: 400 });
  if (value.length > 20) throw Object.assign(new Error('A server function can contain at most 20 steps.'), { statusCode: 400 });
  return value;
}

async function ensureSchema() {
  if (!database.enabled()) throw Object.assign(new Error('PostgreSQL is required for Server Functions.'), { statusCode: 503 });
  await database.ensureDatabase();
  if (schemaPromise) return schemaPromise;
  schemaPromise = database.getPool().query(`
    CREATE TABLE IF NOT EXISTS platform_server_functions (
      function_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      revision BIGINT NOT NULL DEFAULT 1,
      input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      timeout_ms INTEGER NOT NULL DEFAULT 30000,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_server_functions_status ON platform_server_functions(status, slug);
  `).catch(error => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function rowToFunction(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    revision: Number(row.revision),
    inputSchema: row.inputSchema || {},
    steps: row.steps || [],
    timeoutMs: Number(row.timeoutMs || 30000),
    createdBy: row.createdBy || null,
    updatedBy: row.updatedBy || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function list() {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT function_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,timeout_ms AS "timeoutMs",
           created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_server_functions ORDER BY lower(name)
  `);
  return result.rows.map(rowToFunction);
}

async function get(id) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT function_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,timeout_ms AS "timeoutMs",
           created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_server_functions WHERE function_id=$1
  `, [id]);
  const fn = rowToFunction(result.rows[0]);
  if (!fn) throw Object.assign(new Error('Server function not found.'), { statusCode: 404 });
  return fn;
}

async function getPublishedBySlug(slug) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT function_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,timeout_ms AS "timeoutMs",
           created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_server_functions WHERE slug=$1 AND status='published'
  `, [slug]);
  return rowToFunction(result.rows[0]);
}

function normalizedInput(input, existing = null) {
  const name = input.name == null && existing ? existing.name : clean(input.name, 160);
  if (name.length < 2) throw Object.assign(new Error('Function name must be at least 2 characters.'), { statusCode: 400 });
  const defaultSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = input.slug == null && existing ? existing.slug : validateSlug(input.slug || defaultSlug);
  const status = input.status == null && existing ? existing.status : clean(input.status || 'draft', 30);
  if (!STATUSES.has(status)) throw Object.assign(new Error('Function status must be draft, published or disabled.'), { statusCode: 400 });
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs == null && existing ? existing.timeoutMs : input.timeoutMs || 30000), 1000), 120000);
  return {
    name,
    slug,
    description: input.description == null && existing ? existing.description : clean(input.description, 2000),
    status,
    inputSchema: input.inputSchema == null && existing ? existing.inputSchema : jsonObject(input.inputSchema, 'inputSchema'),
    steps: input.steps == null && existing ? existing.steps : validateSteps(input.steps || []),
    timeoutMs
  };
}

async function create(input, actor) {
  await ensureSchema();
  const id = crypto.randomUUID();
  const fn = normalizedInput(input);
  try {
    await database.getPool().query(`
      INSERT INTO platform_server_functions(function_id,name,slug,description,status,input_schema,steps,timeout_ms,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$9)
    `, [id, fn.name, fn.slug, fn.description, fn.status, JSON.stringify(fn.inputSchema), JSON.stringify(fn.steps), fn.timeoutMs, actor]);
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('A server function with that slug already exists.'), { statusCode: 409 });
    throw error;
  }
  await database.audit('function.created', actor, 'server-function', id, { name: fn.name, slug: fn.slug });
  return get(id);
}

async function update(id, input, expectedRevision, actor) {
  await ensureSchema();
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw Object.assign(new Error('If-Match or revision is required when updating a server function.'), { statusCode: 428 });
  const existing = await get(id);
  const fn = normalizedInput(input, existing);
  let result;
  try {
    result = await database.getPool().query(`
      UPDATE platform_server_functions
      SET name=$2,slug=$3,description=$4,status=$5,input_schema=$6::jsonb,steps=$7::jsonb,
          timeout_ms=$8,revision=revision+1,updated_by=$9,updated_at=NOW()
      WHERE function_id=$1 AND revision=$10
      RETURNING revision::int
    `, [id, fn.name, fn.slug, fn.description, fn.status, JSON.stringify(fn.inputSchema), JSON.stringify(fn.steps), fn.timeoutMs, actor, expectedRevision]);
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('A server function with that slug already exists.'), { statusCode: 409 });
    throw error;
  }
  if (!result.rowCount) throw Object.assign(new Error('Server function changed on the server. Reload it before saving again.'), { statusCode: 409 });
  await database.audit('function.updated', actor, 'server-function', id, { revision: result.rows[0].revision, status: fn.status });
  return get(id);
}

async function remove(id, actor) {
  await ensureSchema();
  const result = await database.getPool().query('DELETE FROM platform_server_functions WHERE function_id=$1 RETURNING name,slug', [id]);
  if (!result.rowCount) throw Object.assign(new Error('Server function not found.'), { statusCode: 404 });
  await database.audit('function.deleted', actor, 'server-function', id, result.rows[0]);
  return true;
}

module.exports = { ensureSchema, list, get, getPublishedBySlug, create, update, remove, validateSteps };
