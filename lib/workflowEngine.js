'use strict';

const workflowStore = require('./workflowStore');
const database = require('./database');

function error(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function getPath(source, path) {
  if (!path) return source;
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], source);
}

function interpolate(value, context) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const resolved = getPath(context, path);
    if (resolved == null) return '';
    return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  });
}

function renderObject(value, context) {
  if (Array.isArray(value)) return value.map(item => renderObject(item, context));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = renderObject(item, context);
    return output;
  }
  return interpolate(value, context);
}

function stepMap(workflow) {
  return new Map((workflow.steps || []).map(step => [step.id, step]));
}

function nextForCondition(step, context) {
  const left = step.path ? getPath(context, step.path) : interpolate(step.left, context);
  const right = step.value;
  const operator = step.operator || 'equals';
  let result = false;
  if (operator === 'equals') result = String(left ?? '') === String(right ?? '');
  else if (operator === 'not-equals') result = String(left ?? '') !== String(right ?? '');
  else if (operator === 'truthy') result = Boolean(left);
  else if (operator === 'falsy') result = !left;
  else if (operator === 'contains') result = String(left ?? '').includes(String(right ?? ''));
  else if (operator === 'gt') result = Number(left) > Number(right);
  else if (operator === 'gte') result = Number(left) >= Number(right);
  else if (operator === 'lt') result = Number(left) < Number(right);
  else if (operator === 'lte') result = Number(left) <= Number(right);
  else throw error(`Unsupported workflow condition operator: ${operator}.`);
  return result ? step.then : step.else;
}

function appendHistory(context, entry) {
  const history = Array.isArray(context.history) ? context.history : [];
  history.push({ at: new Date().toISOString(), ...entry });
  context.history = history.slice(-250);
}

async function advance(instanceId, workflow, principal, startingStepId = null) {
  const map = stepMap(workflow);
  let instance = await workflowStore.getInstance(instanceId);
  let context = instance.context || {};
  let currentStepId = startingStepId || instance.currentStepId;
  const actor = principal?.username || instance.startedBy || 'system';

  for (let guard = 0; guard < 100; guard += 1) {
    const step = map.get(currentStepId);
    if (!step) {
      context.error = `Workflow step ${currentStepId || '(none)'} was not found.`;
      appendHistory(context, { stepId: currentStepId || null, type: 'error', message: context.error });
      await workflowStore.updateInstance(instanceId, { status: 'failed', currentStepId, context });
      throw error(context.error, 500);
    }

    appendHistory(context, { stepId: step.id, type: step.type, actor });

    if (step.type === 'start') {
      currentStepId = step.next;
      if (!currentStepId) throw error(`Start step ${step.id} has no next step.`);
      instance = await workflowStore.updateInstance(instanceId, { status: 'running', currentStepId, context });
      continue;
    }

    if (step.type === 'set') {
      const values = renderObject(step.values || {}, context);
      context.data = { ...(context.data || {}), ...values };
      currentStepId = step.next;
      if (!currentStepId) throw error(`Set step ${step.id} has no next step.`);
      instance = await workflowStore.updateInstance(instanceId, { status: 'running', currentStepId, context });
      continue;
    }

    if (step.type === 'condition') {
      currentStepId = nextForCondition(step, context);
      if (!currentStepId) throw error(`Condition step ${step.id} does not define a valid branch.`);
      instance = await workflowStore.updateInstance(instanceId, { status: 'running', currentStepId, context });
      continue;
    }

    if (step.type === 'user-task' || step.type === 'approval') {
      const rendered = {
        title: interpolate(step.title || (step.type === 'approval' ? 'Approval required' : 'Workflow task'), context),
        description: interpolate(step.description || '', context),
        assignedTo: interpolate(step.assignedTo || '', context),
        assignedRole: interpolate(step.assignedRole || '', context)
      };
      const taskStep = step.type === 'approval' && !Array.isArray(step.choices)
        ? { ...step, choices: ['approve', 'reject'] }
        : step;
      const task = await workflowStore.createTask(instanceId, taskStep, rendered, { workflowContext: context.data || {} });
      await workflowStore.updateInstance(instanceId, { status: 'waiting', currentStepId: step.id, context });
      await database.audit('workflow.task.created', actor, 'workflow-task', task.id, { instanceId, stepId: step.id, assignedTo: task.assignedTo, assignedRole: task.assignedRole });
      return { instance: await workflowStore.getInstance(instanceId), task };
    }

    if (step.type === 'end') {
      if (step.result && typeof step.result === 'object') context.result = renderObject(step.result, context);
      await workflowStore.updateInstance(instanceId, { status: 'completed', currentStepId: step.id, context });
      await database.audit('workflow.instance.completed', actor, 'workflow-instance', instanceId, { workflowId: workflow.id, result: context.result || null });
      return { instance: await workflowStore.getInstance(instanceId), task: null };
    }
  }

  context.error = 'Workflow exceeded the maximum automatic step count.';
  appendHistory(context, { type: 'error', message: context.error });
  await workflowStore.updateInstance(instanceId, { status: 'failed', currentStepId, context });
  throw error(context.error, 500);
}

async function start(workflow, input, principal) {
  if (!workflow || workflow.status !== 'published') throw error('Workflow is not published.', 409);
  const instance = await workflowStore.createInstance(workflow, input, principal.username);
  return advance(instance.id, workflow, principal, instance.currentStepId);
}

async function completeTask(taskId, principal, resolution, payload = {}) {
  const task = await workflowStore.completeTask(taskId, principal, resolution, payload);
  const instance = await workflowStore.getInstance(task.instanceId);
  const workflow = await workflowStore.get(instance.workflowId);
  const step = (workflow.steps || []).find(item => item.id === task.stepId);
  if (!step) throw error('The workflow step for this task no longer exists.', 409);

  const context = instance.context || {};
  context.task = { id: task.id, resolution: task.resolution, payload: task.payload || {}, completedBy: task.completedBy };
  context.data = { ...(context.data || {}), lastTaskResolution: task.resolution, lastTaskPayload: task.payload || {} };
  appendHistory(context, { stepId: step.id, type: 'task-completed', actor: principal.username, resolution: task.resolution });

  let next = step.next;
  if (step.type === 'approval') next = task.resolution === 'approve' ? step.approveNext : step.rejectNext;
  if (!next) throw error(`Task step ${step.id} has no continuation for resolution ${task.resolution}.`);
  await workflowStore.updateInstance(instance.id, { status: 'running', currentStepId: next, context });
  return advance(instance.id, workflow, principal, next);
}

module.exports = { interpolate, renderObject, nextForCondition, advance, start, completeTask };
