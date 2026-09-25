'use strict';

const crypto = require('crypto');
const database = require('./database');

let schemaPromise = null;
const STATUSES = new Set(['draft', 'published', 'disabled']);
const INSTANCE_STATUSES = new Set(['running', 'waiting', 'completed', 'cancelled', 'failed']);
const STEP_TYPES = new Set(['start', 'set', 'condition', 'user-task', 'approval', 'end']);

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function error(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function validateSlug(value) {
  const slug = clean(value, 64).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) throw error('Workflow slug must start with a letter and contain only lowercase letters, numbers and hyphens.');
  return slug;
}

function jsonObject(value, label) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw error(`${label} must be a JSON object.`);
  return value;
}

function validateSteps(value) {
  if (!Array.isArray(value)) throw error('steps must be an array.');
  if (!value.length) throw error('A workflow must contain at least one step.');
  if (value.length > 50) throw error('A workflow can contain at most 50 steps.');
  const ids = new Set();
  let starts = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error('Each workflow step must be an object.');
    const id = clean(raw.id, 80);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id)) throw error(`Invalid workflow step id: ${id || '(empty)'}.`);
    if (ids.has(id)) throw error(`Duplicate workflow step id: ${id}.`);
    ids.add(id);
    const type = clean(raw.type, 30);
    if (!STEP_TYPES.has(type)) throw error(`Unsupported workflow step type: ${type || '(empty)'}.`);
    if (type === 'start') starts += 1;
  }
  if (starts !== 1) throw error('A workflow must contain exactly one start step.');
  const refs = [];
  for (const step of value) {
    for (const key of ['next', 'then', 'else', 'approveNext', 'rejectNext']) {
      if (step[key]) refs.push([step.id, key, clean(step[key], 80)]);
    }
  }
  for (const [source, key, target] of refs) if (!ids.has(target)) throw error(`Step ${source} references missing ${key} step ${target}.`);
  return value;
}

async function ensureSchema() {
  if (!database.enabled()) throw error('PostgreSQL is required for Workflows.', 503);
  await database.ensureDatabase();
  if (schemaPromise) return schemaPromise;
  schemaPromise = database.getPool().query(`
    CREATE TABLE IF NOT EXISTS platform_workflows (
      workflow_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      revision BIGINT NOT NULL DEFAULT 1,
      input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS platform_workflow_instances (
      instance_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES platform_workflows(workflow_id) ON DELETE RESTRICT,
      workflow_revision BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      current_step_id TEXT,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_by TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS platform_workflow_tasks (
      task_id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES platform_workflow_instances(instance_id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT,
      assigned_role TEXT,
      choices JSONB NOT NULL DEFAULT '[]'::jsonb,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      resolution TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_platform_workflows_status ON platform_workflows(status, slug);
    CREATE INDEX IF NOT EXISTS idx_platform_workflow_instances_workflow ON platform_workflow_instances(workflow_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_workflow_instances_status ON platform_workflow_instances(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_workflow_tasks_status ON platform_workflow_tasks(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_workflow_tasks_assignee ON platform_workflow_tasks(assigned_to, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_workflow_tasks_role ON platform_workflow_tasks(assigned_role, status, created_at DESC);
  `).catch(err => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

function rowToWorkflow(row) {
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
    createdBy: row.createdBy || null,
    updatedBy: row.updatedBy || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function rowToInstance(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowRevision: Number(row.workflowRevision),
    workflowName: row.workflowName || null,
    workflowSlug: row.workflowSlug || null,
    status: row.status,
    currentStepId: row.currentStepId || null,
    context: row.context || {},
    startedBy: row.startedBy || null,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt || null
  };
}

function rowToTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    instanceId: row.instanceId,
    workflowId: row.workflowId || null,
    workflowName: row.workflowName || null,
    stepId: row.stepId,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assignedTo || null,
    assignedRole: row.assignedRole || null,
    choices: row.choices || [],
    payload: row.payload || {},
    dueAt: row.dueAt || null,
    createdAt: row.createdAt,
    completedAt: row.completedAt || null,
    completedBy: row.completedBy || null,
    resolution: row.resolution || null
  };
}

function normalizedInput(input, existing = null) {
  const name = input.name == null && existing ? existing.name : clean(input.name, 160);
  if (name.length < 2) throw error('Workflow name must be at least 2 characters.');
  const defaultSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = input.slug == null && existing ? existing.slug : validateSlug(input.slug || defaultSlug);
  const status = input.status == null && existing ? existing.status : clean(input.status || 'draft', 30);
  if (!STATUSES.has(status)) throw error('Workflow status must be draft, published or disabled.');
  return {
    name,
    slug,
    description: input.description == null && existing ? existing.description : clean(input.description, 3000),
    status,
    inputSchema: input.inputSchema == null && existing ? existing.inputSchema : jsonObject(input.inputSchema, 'inputSchema'),
    steps: input.steps == null && existing ? existing.steps : validateSteps(input.steps || [])
  };
}

async function list() {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT workflow_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_workflows ORDER BY lower(name)
  `);
  return result.rows.map(rowToWorkflow);
}

async function get(id) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT workflow_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_workflows WHERE workflow_id=$1
  `, [id]);
  const workflow = rowToWorkflow(result.rows[0]);
  if (!workflow) throw error('Workflow not found.', 404);
  return workflow;
}

async function getPublishedBySlug(slug) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT workflow_id AS id,name,slug,description,status,revision::int,
           input_schema AS "inputSchema",steps,created_by AS "createdBy",updated_by AS "updatedBy",
           created_at AS "createdAt",updated_at AS "updatedAt"
    FROM platform_workflows WHERE slug=$1 AND status='published'
  `, [slug]);
  return rowToWorkflow(result.rows[0]);
}

async function create(input, actor) {
  await ensureSchema();
  const id = crypto.randomUUID();
  const workflow = normalizedInput(input);
  try {
    await database.getPool().query(`
      INSERT INTO platform_workflows(workflow_id,name,slug,description,status,input_schema,steps,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$8)
    `, [id, workflow.name, workflow.slug, workflow.description, workflow.status, JSON.stringify(workflow.inputSchema), JSON.stringify(workflow.steps), actor]);
  } catch (err) {
    if (err.code === '23505') throw error('A workflow with that slug already exists.', 409);
    throw err;
  }
  await database.audit('workflow.created', actor, 'workflow', id, { name: workflow.name, slug: workflow.slug });
  return get(id);
}

async function update(id, input, expectedRevision, actor) {
  await ensureSchema();
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw error('If-Match or revision is required when updating a workflow.', 428);
  const existing = await get(id);
  const workflow = normalizedInput(input, existing);
  let result;
  try {
    result = await database.getPool().query(`
      UPDATE platform_workflows
      SET name=$2,slug=$3,description=$4,status=$5,input_schema=$6::jsonb,steps=$7::jsonb,
          revision=revision+1,updated_by=$8,updated_at=NOW()
      WHERE workflow_id=$1 AND revision=$9
      RETURNING revision::int
    `, [id, workflow.name, workflow.slug, workflow.description, workflow.status, JSON.stringify(workflow.inputSchema), JSON.stringify(workflow.steps), actor, expectedRevision]);
  } catch (err) {
    if (err.code === '23505') throw error('A workflow with that slug already exists.', 409);
    throw err;
  }
  if (!result.rowCount) throw error('Workflow changed on the server. Reload it before saving again.', 409);
  await database.audit('workflow.updated', actor, 'workflow', id, { revision: result.rows[0].revision, status: workflow.status });
  return get(id);
}

async function remove(id, actor) {
  await ensureSchema();
  const active = await database.getPool().query("SELECT COUNT(*)::int AS count FROM platform_workflow_instances WHERE workflow_id=$1 AND status IN ('running','waiting')", [id]);
  if (active.rows[0].count > 0) throw error('Workflow has active instances and cannot be deleted.', 409);
  const result = await database.getPool().query('DELETE FROM platform_workflows WHERE workflow_id=$1 RETURNING name,slug', [id]);
  if (!result.rowCount) throw error('Workflow not found.', 404);
  await database.audit('workflow.deleted', actor, 'workflow', id, result.rows[0]);
  return true;
}

async function createInstance(workflow, input, actor) {
  await ensureSchema();
  const id = crypto.randomUUID();
  const start = workflow.steps.find(step => step.type === 'start');
  const context = { input: jsonObject(input || {}, 'input'), data: {}, history: [], actor };
  await database.getPool().query(`
    INSERT INTO platform_workflow_instances(instance_id,workflow_id,workflow_revision,status,current_step_id,context,started_by)
    VALUES ($1,$2,$3,'running',$4,$5::jsonb,$6)
  `, [id, workflow.id, workflow.revision, start.id, JSON.stringify(context), actor]);
  await database.audit('workflow.instance.started', actor, 'workflow-instance', id, { workflowId: workflow.id, workflowSlug: workflow.slug, revision: workflow.revision });
  return getInstance(id);
}

async function getInstance(id) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT i.instance_id AS id,i.workflow_id AS "workflowId",i.workflow_revision AS "workflowRevision",
           i.status,i.current_step_id AS "currentStepId",i.context,i.started_by AS "startedBy",
           i.started_at AS "startedAt",i.updated_at AS "updatedAt",i.completed_at AS "completedAt",
           w.name AS "workflowName",w.slug AS "workflowSlug"
    FROM platform_workflow_instances i JOIN platform_workflows w ON w.workflow_id=i.workflow_id
    WHERE i.instance_id=$1
  `, [id]);
  const instance = rowToInstance(result.rows[0]);
  if (!instance) throw error('Workflow instance not found.', 404);
  return instance;
}

async function updateInstance(id, patch) {
  await ensureSchema();
  const status = patch.status || 'running';
  if (!INSTANCE_STATUSES.has(status)) throw error('Invalid workflow instance status.');
  const completedAt = status === 'completed' || status === 'cancelled' || status === 'failed' ? new Date() : null;
  const result = await database.getPool().query(`
    UPDATE platform_workflow_instances
    SET status=$2,current_step_id=$3,context=$4::jsonb,updated_at=NOW(),completed_at=$5
    WHERE instance_id=$1
    RETURNING instance_id
  `, [id, status, patch.currentStepId || null, JSON.stringify(patch.context || {}), completedAt]);
  if (!result.rowCount) throw error('Workflow instance not found.', 404);
  return getInstance(id);
}

async function listInstances(limit = 100) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT i.instance_id AS id,i.workflow_id AS "workflowId",i.workflow_revision AS "workflowRevision",
           i.status,i.current_step_id AS "currentStepId",i.context,i.started_by AS "startedBy",
           i.started_at AS "startedAt",i.updated_at AS "updatedAt",i.completed_at AS "completedAt",
           w.name AS "workflowName",w.slug AS "workflowSlug"
    FROM platform_workflow_instances i JOIN platform_workflows w ON w.workflow_id=i.workflow_id
    ORDER BY i.started_at DESC LIMIT $1
  `, [Math.max(1, Math.min(Number(limit) || 100, 500))]);
  return result.rows.map(rowToInstance);
}

async function createTask(instanceId, step, rendered, payload = {}) {
  await ensureSchema();
  const existing = await database.getPool().query("SELECT task_id FROM platform_workflow_tasks WHERE instance_id=$1 AND step_id=$2 AND status='open' LIMIT 1", [instanceId, step.id]);
  if (existing.rowCount) return getTask(existing.rows[0].task_id);
  const id = crypto.randomUUID();
  const dueAt = step.dueHours ? new Date(Date.now() + Math.max(1, Math.min(Number(step.dueHours), 24 * 365)) * 3600000) : null;
  await database.getPool().query(`
    INSERT INTO platform_workflow_tasks(task_id,instance_id,step_id,title,description,status,assigned_to,assigned_role,choices,payload,due_at)
    VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8::jsonb,$9::jsonb,$10)
  `, [id, instanceId, step.id, clean(rendered.title || step.title || 'Workflow task', 300), clean(rendered.description || step.description || '', 3000), clean(rendered.assignedTo || step.assignedTo || '', 300) || null, clean(rendered.assignedRole || step.assignedRole || '', 100) || null, JSON.stringify(Array.isArray(step.choices) ? step.choices.slice(0, 20) : []), JSON.stringify(payload || {}), dueAt]);
  return getTask(id);
}

async function getTask(id) {
  await ensureSchema();
  const result = await database.getPool().query(`
    SELECT t.task_id AS id,t.instance_id AS "instanceId",i.workflow_id AS "workflowId",w.name AS "workflowName",
           t.step_id AS "stepId",t.title,t.description,t.status,t.assigned_to AS "assignedTo",t.assigned_role AS "assignedRole",
           t.choices,t.payload,t.due_at AS "dueAt",t.created_at AS "createdAt",t.completed_at AS "completedAt",
           t.completed_by AS "completedBy",t.resolution
    FROM platform_workflow_tasks t
    JOIN platform_workflow_instances i ON i.instance_id=t.instance_id
    JOIN platform_workflows w ON w.workflow_id=i.workflow_id
    WHERE t.task_id=$1
  `, [id]);
  const task = rowToTask(result.rows[0]);
  if (!task) throw error('Workflow task not found.', 404);
  return task;
}

function taskAllowed(task, principal) {
  if (!principal) return false;
  if (principal.permissions?.includes('platform.admin') || principal.permissions?.includes('workflows.manage')) return true;
  if (task.assignedTo && task.assignedTo === principal.username) return true;
  if (task.assignedRole && Array.isArray(principal.roles) && principal.roles.includes(task.assignedRole)) return true;
  return !task.assignedTo && !task.assignedRole;
}

async function listTasks(principal, includeCompleted = false) {
  await ensureSchema();
  const params = [principal?.username || '', principal?.roles || []];
  let statusFilter = "AND t.status='open'";
  if (includeCompleted) statusFilter = '';
  const elevated = principal?.permissions?.includes('platform.admin') || principal?.permissions?.includes('workflows.manage');
  const access = elevated ? 'TRUE' : `(t.assigned_to=$1 OR (t.assigned_role IS NOT NULL AND t.assigned_role = ANY($2::text[])) OR (t.assigned_to IS NULL AND t.assigned_role IS NULL))`;
  const result = await database.getPool().query(`
    SELECT t.task_id AS id,t.instance_id AS "instanceId",i.workflow_id AS "workflowId",w.name AS "workflowName",
           t.step_id AS "stepId",t.title,t.description,t.status,t.assigned_to AS "assignedTo",t.assigned_role AS "assignedRole",
           t.choices,t.payload,t.due_at AS "dueAt",t.created_at AS "createdAt",t.completed_at AS "completedAt",
           t.completed_by AS "completedBy",t.resolution
    FROM platform_workflow_tasks t
    JOIN platform_workflow_instances i ON i.instance_id=t.instance_id
    JOIN platform_workflows w ON w.workflow_id=i.workflow_id
    WHERE ${access} ${statusFilter}
    ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at,t.created_at DESC
    LIMIT 300
  `, params);
  return result.rows.map(rowToTask);
}

async function completeTask(id, principal, resolution, payload = {}) {
  await ensureSchema();
  const task = await getTask(id);
  if (task.status !== 'open') throw error('Workflow task is already completed.', 409);
  if (!taskAllowed(task, principal)) throw error('You are not assigned to this workflow task.', 403);
  const value = clean(resolution || 'complete', 80);
  if (task.choices.length && !task.choices.includes(value)) throw error('Resolution is not one of the allowed task choices.');
  const result = await database.getPool().query(`
    UPDATE platform_workflow_tasks
    SET status='completed',completed_at=NOW(),completed_by=$2,resolution=$3,payload=payload || $4::jsonb
    WHERE task_id=$1 AND status='open'
    RETURNING task_id
  `, [id, principal.username, value, JSON.stringify(jsonObject(payload || {}, 'payload'))]);
  if (!result.rowCount) throw error('Workflow task changed before it could be completed.', 409);
  await database.audit('workflow.task.completed', principal.username, 'workflow-task', id, { instanceId: task.instanceId, resolution: value });
  return getTask(id);
}

module.exports = {
  STEP_TYPES,
  ensureSchema,
  validateSteps,
  list,
  get,
  getPublishedBySlug,
  create,
  update,
  remove,
  createInstance,
  getInstance,
  updateInstance,
  listInstances,
  createTask,
  getTask,
  listTasks,
  completeTask,
  taskAllowed
};
