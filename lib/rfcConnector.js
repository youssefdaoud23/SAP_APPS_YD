'use strict';

function ensureSlash(value) { return value.endsWith('/') ? value : `${value}/`; }

function cleanId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`RFC connection id contains unsupported characters: ${id || '(empty)'}`);
  return id;
}

function functionName(value) {
  const name = String(value || '').trim().toUpperCase();
  if (!name || name.length > 128 || !/^[A-Z0-9_/.]+$/.test(name)) {
    throw Object.assign(new Error('RFC/BAPI function name contains unsupported characters.'), { statusCode: 400 });
  }
  return name;
}

function parseConnections() {
  const raw = process.env.SAP_RFC_CONNECTIONS_JSON || '[]';
  let list;
  try { list = JSON.parse(raw); }
  catch (error) { throw new Error(`SAP_RFC_CONNECTIONS_JSON is not valid JSON: ${error.message}`); }
  if (!Array.isArray(list)) throw new Error('SAP_RFC_CONNECTIONS_JSON must be a JSON array.');
  const seen = new Set();
  return list.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Each RFC connection must be an object.');
    const id = cleanId(item.id);
    if (!item.name || !item.baseUrl) throw new Error(`RFC connection ${id} requires name and baseUrl.`);
    if (seen.has(id)) throw new Error(`Duplicate RFC connection id: ${id}`);
    seen.add(id);
    const url = new URL(item.baseUrl);
    const allowHttp = String(process.env.SAP_ALLOW_HTTP || '').toLowerCase() === 'true';
    const local = ['localhost','127.0.0.1','::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (allowHttp || local))) {
      throw new Error(`RFC bridge ${id} must use HTTPS. SAP_ALLOW_HTTP=true is intended only for trusted lab endpoints.`);
    }
    const invokePath = String(item.invokePath || 'invoke').replace(/^\/+/, '');
    if (invokePath.includes('..') || invokePath.includes('\\')) throw new Error(`RFC connection ${id} has an invalid invokePath.`);
    const allowedFunctions = Array.isArray(item.allowedFunctions) ? item.allowedFunctions.map(functionName) : [];
    const readOnlyFunctions = Array.isArray(item.readOnlyFunctions) ? item.readOnlyFunctions.map(functionName) : [];
    return {
      ...item,
      id,
      name: String(item.name),
      type: 'RFC/BAPI bridge',
      baseUrl: ensureSlash(url.toString()),
      invokePath,
      auth: item.auth || 'none',
      production: item.production === true || ['prd','prod','production'].includes(String(item.environment || item.stage || '').toLowerCase()),
      allowedFunctions,
      readOnlyFunctions,
      timeoutMs: Math.min(Math.max(Number(item.timeoutMs || 30000), 1000), 120000)
    };
  });
}

function publicConnection(connection) {
  return {
    id: connection.id,
    name: connection.name,
    type: connection.type,
    baseUrl: connection.baseUrl,
    auth: connection.auth,
    environment: connection.environment || connection.stage || '',
    production: connection.production,
    adapter: 'http-json-bridge',
    allowedFunctionCount: connection.allowedFunctions.length,
    readOnlyFunctionCount: connection.readOnlyFunctions.length,
    status: 'server-configured'
  };
}

function getConnection(id) {
  const connection = parseConnections().find(item => item.id === id);
  if (!connection) throw Object.assign(new Error(`Unknown RFC connection: ${id}`), { statusCode: 404 });
  return connection;
}

async function authHeaders(connection) {
  const headers = { Accept:'application/json', 'Content-Type':'application/json; charset=utf-8' };
  if (connection.auth === 'basic') {
    const username = process.env[connection.usernameEnv || ''];
    const password = process.env[connection.passwordEnv || ''];
    if (username == null || password == null) throw new Error(`Missing RFC Basic Auth environment variables for ${connection.id}.`);
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (connection.auth === 'bearer') {
    const token = process.env[connection.tokenEnv || ''];
    if (!token) throw new Error(`Missing RFC bearer token environment variable for ${connection.id}.`);
    headers.Authorization = `Bearer ${token}`;
  } else if (connection.auth === 'api-key') {
    const value = process.env[connection.apiKeyEnv || ''];
    if (!value) throw new Error(`Missing RFC API-key environment variable for ${connection.id}.`);
    const header = String(connection.apiKeyHeader || 'X-API-Key');
    if (!/^[A-Za-z0-9-]+$/.test(header)) throw new Error(`Invalid RFC API-key header name for ${connection.id}.`);
    headers[header] = value;
  } else if (!['none','anonymous'].includes(connection.auth)) {
    throw new Error(`Unsupported RFC bridge auth mode: ${connection.auth}`);
  }
  return headers;
}

function invocationUrl(connection, name) {
  const encoded = encodeURIComponent(name);
  const relative = connection.invokePath.replace(/\{function\}/g, encoded);
  const target = new URL(relative, connection.baseUrl);
  const base = new URL(connection.baseUrl);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw Object.assign(new Error('RFC invoke path escapes the configured base URL.'), { statusCode: 400 });
  }
  return target;
}

function isReadOnly(connection, name) {
  return connection.readOnlyFunctions.includes(name);
}

function assertAllowed(connection, name) {
  if (connection.allowedFunctions.length && !connection.allowedFunctions.includes(name)) {
    throw Object.assign(new Error(`RFC/BAPI function ${name} is not allow-listed for ${connection.id}.`), { statusCode: 403 });
  }
}

async function invoke(id, requestedFunction, parameters = {}, options = {}) {
  const connection = getConnection(id);
  const name = functionName(requestedFunction);
  assertAllowed(connection, name);
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw Object.assign(new Error('RFC/BAPI parameters must be a JSON object.'), { statusCode: 400 });
  }
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || connection.timeoutMs), 1000), 120000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(invocationUrl(connection, name), {
      method:'POST',
      headers: await authHeaders(connection),
      body: JSON.stringify({ function: name, parameters }),
      redirect:'manual',
      signal:controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = { raw:text }; }
    if (!response.ok) {
      const err = new Error(`RFC bridge request failed (${response.status}): ${typeof data === 'object' ? JSON.stringify(data).slice(0,800) : String(data).slice(0,800)}`);
      err.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      throw err;
    }
    return { ok:true, function:name, data, latencyMs:Date.now()-started, readOnly:isReadOnly(connection,name) };
  } finally { clearTimeout(timer); }
}

async function health(id) {
  const connection = getConnection(id);
  const healthPath = String(connection.healthPath || '').replace(/^\/+/, '');
  if (!healthPath) return { ok:true, configured:true, adapter:'http-json-bridge', note:'No healthPath configured; connection configuration is structurally valid.' };
  const target = new URL(healthPath, connection.baseUrl);
  const base = new URL(connection.baseUrl);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw Object.assign(new Error('RFC health path escapes the configured base URL.'), { statusCode:400 });
  const started = Date.now();
  const response = await fetch(target, { method:'GET', headers:await authHeaders(connection), redirect:'manual' });
  return { ok:response.ok, status:response.status, latencyMs:Date.now()-started, adapter:'http-json-bridge' };
}

module.exports = { parseConnections, publicConnection, getConnection, functionName, isReadOnly, invoke, health };
