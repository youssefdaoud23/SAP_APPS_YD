'use strict';

const sapConnector = require('./sapConnector');
const { authorizeConnectionRequest } = require('./connectionPolicy');

const STEP_TYPES = new Set(['require', 'set', 'sap-request', 'respond']);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function cleanKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) throw Object.assign(new Error('Step key must start with a letter and contain only letters, numbers and underscores.'), { statusCode: 400 });
  return key;
}

function safeSegments(path) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length || parts.length > 20) return [];
  for (const part of parts) {
    if (!/^(?:[A-Za-z][A-Za-z0-9_]*|\d+)$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part)) return [];
  }
  return parts;
}

function getPath(context, path) {
  const parts = safeSegments(path);
  if (!parts.length) return undefined;
  let current = context;
  for (const part of parts) {
    if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) return undefined;
    current = current[part];
  }
  return current;
}

function interpolateString(value, context) {
  const exact = String(value).match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
  if (exact) return clone(getPath(context, exact[1]));
  return String(value).replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, path) => {
    const resolved = getPath(context, path);
    if (resolved == null) return '';
    if (typeof resolved === 'object') return JSON.stringify(resolved);
    return String(resolved);
  });
}

function interpolate(value, context, depth = 0) {
  if (depth > 12) throw Object.assign(new Error('Server function template nesting is too deep.'), { statusCode: 400 });
  if (typeof value === 'string') return interpolateString(value, context);
  if (Array.isArray(value)) return value.map(item => interpolate(item, context, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      out[key] = interpolate(item, context, depth + 1);
    }
    return out;
  }
  return value;
}

function validateInputSchema(input, schema = {}) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] == null || input[key] === '') {
      throw Object.assign(new Error(`Required input field ${key} is missing.`), { statusCode: 400 });
    }
  }
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  for (const [key, definition] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] == null || !definition || typeof definition !== 'object') continue;
    const value = input[key];
    const type = definition.type;
    const valid = type === 'string' ? typeof value === 'string'
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : type === 'integer' ? Number.isInteger(value)
      : type === 'boolean' ? typeof value === 'boolean'
      : type === 'object' ? value && typeof value === 'object' && !Array.isArray(value)
      : type === 'array' ? Array.isArray(value)
      : true;
    if (!valid) throw Object.assign(new Error(`Input field ${key} must be of type ${type}.`), { statusCode: 400 });
  }
}

async function responseBody(response, maxBytes = 2 * 1024 * 1024) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw Object.assign(new Error('SAP response exceeds the 2 MB Server Functions limit.'), { statusCode: 502 });
  const text = buffer.toString('utf8');
  const contentType = response.headers.get('content-type') || '';
  if (/json/i.test(contentType)) {
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }
  return text;
}

function checkDeadline(deadline) {
  if (Date.now() > deadline) throw Object.assign(new Error('Server function execution timed out.'), { statusCode: 504 });
}

async function executeSapStep(step, context, principal, deadline) {
  const connectionId = String(step.connectionId || '').trim();
  if (!connectionId) throw Object.assign(new Error('sap-request step requires connectionId.'), { statusCode: 400 });
  const method = String(step.method || 'GET').toUpperCase();
  if (!METHODS.has(method)) throw Object.assign(new Error(`Unsupported SAP method ${method}.`), { statusCode: 400 });
  const connection = sapConnector.getConnection(connectionId);
  const decision = authorizeConnectionRequest(principal, connection, method);
  if (!decision.ok) throw Object.assign(new Error(decision.error), { statusCode: decision.status });
  const path = String(interpolate(step.path || '', context) || '').replace(/^\/+/, '');
  if (!path) throw Object.assign(new Error('sap-request step requires a path.'), { statusCode: 400 });

  const configuredHeaders = interpolate(step.headers || {}, context);
  const headers = {};
  const blocked = new Set(['authorization', 'cookie', 'host', 'x-csrf-token', 'content-length', 'connection']);
  for (const [key, value] of Object.entries(configuredHeaders || {})) {
    const name = String(key).trim();
    if (!name || blocked.has(name.toLowerCase()) || /[\r\n]/.test(name) || /[\r\n]/.test(String(value))) continue;
    headers[name] = String(value);
  }

  let body;
  if (!['GET', 'HEAD'].includes(method) && step.body !== undefined) {
    const materialized = interpolate(step.body, context);
    body = Buffer.from(typeof materialized === 'string' ? materialized : JSON.stringify(materialized));
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  const remaining = Math.max(1000, deadline - Date.now());
  const response = await sapConnector.requestConnection(connectionId, path, {
    method,
    headers,
    body,
    timeoutMs: Math.min(remaining, Number(step.timeoutMs || remaining))
  });
  const data = await responseBody(response);
  if (!response.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500);
    throw Object.assign(new Error(`SAP step failed with HTTP ${response.status}: ${detail}`), { statusCode: 502 });
  }
  return { status: response.status, data, etag: response.headers.get('etag') || null };
}

async function execute(fn, input, principal) {
  const normalizedInput = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};
  validateInputSchema(normalizedInput, fn.inputSchema || {});
  if (!Array.isArray(fn.steps) || fn.steps.length > 20) throw Object.assign(new Error('Server function has an invalid step definition.'), { statusCode: 500 });
  const deadline = Date.now() + Math.min(Math.max(Number(fn.timeoutMs || 30000), 1000), 120000);
  const context = {
    input: normalizedInput,
    vars: {},
    steps: {},
    principal: { username: principal.username, roles: principal.roles || [] }
  };
  let responseValue;

  for (let index = 0; index < fn.steps.length; index += 1) {
    checkDeadline(deadline);
    const step = fn.steps[index];
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw Object.assign(new Error(`Step ${index + 1} must be an object.`), { statusCode: 400 });
    const type = String(step.type || '').trim();
    if (!STEP_TYPES.has(type)) throw Object.assign(new Error(`Unsupported server function step type ${type || '(empty)'}.`), { statusCode: 400 });

    if (type === 'require') {
      const path = String(step.path || '').trim();
      const value = getPath(context, path);
      if (value == null || value === '') throw Object.assign(new Error(step.message || `Required value ${path} is missing.`), { statusCode: 400 });
      continue;
    }

    if (type === 'set') {
      const key = cleanKey(step.key);
      context.vars[key] = interpolate(step.value, context);
      continue;
    }

    if (type === 'sap-request') {
      const key = cleanKey(step.key || `step${index + 1}`);
      context.steps[key] = await executeSapStep(step, context, principal, deadline);
      continue;
    }

    if (type === 'respond') {
      responseValue = interpolate(step.value === undefined ? { input: '{{input}}', vars: '{{vars}}', steps: '{{steps}}' } : step.value, context);
      break;
    }
  }

  checkDeadline(deadline);
  if (responseValue === undefined) responseValue = { input: context.input, vars: context.vars, steps: context.steps };
  return responseValue;
}

module.exports = { execute, interpolate, getPath, validateInputSchema, STEP_TYPES };
