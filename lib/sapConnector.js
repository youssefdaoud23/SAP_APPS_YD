'use strict';

const tokenCache = new Map();

function parseConnections() {
  const raw = process.env.SAP_CONNECTIONS_JSON || '[]';
  let list;
  try { list = JSON.parse(raw); }
  catch (err) { throw new Error(`SAP_CONNECTIONS_JSON is not valid JSON: ${err.message}`); }
  if (!Array.isArray(list)) throw new Error('SAP_CONNECTIONS_JSON must be a JSON array');
  const seen = new Set();
  return list.map(c => {
    const validated = validateConnection(c);
    if (seen.has(validated.id)) throw new Error(`Duplicate connection id: ${validated.id}`);
    seen.add(validated.id);
    return validated;
  });
}

function validateConnection(c) {
  if (!c || typeof c !== 'object') throw new Error('Each connection must be an object');
  for (const key of ['id','name','type','baseUrl']) if (!c[key]) throw new Error(`Connection is missing ${key}`);
  if (!/^[A-Za-z0-9._-]+$/.test(c.id)) throw new Error(`Connection id contains unsupported characters: ${c.id}`);
  const u = new URL(c.baseUrl);
  const allowHttp = String(process.env.SAP_ALLOW_HTTP).toLowerCase() === 'true';
  const local = ['localhost','127.0.0.1','::1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (allowHttp || local))) {
    throw new Error(`Connection ${c.id} must use HTTPS. Set SAP_ALLOW_HTTP=true only for a trusted lab endpoint.`);
  }
  if (c.defaultQuery != null && (typeof c.defaultQuery !== 'object' || Array.isArray(c.defaultQuery))) {
    throw new Error(`Connection ${c.id} defaultQuery must be an object`);
  }
  return { ...c, baseUrl: ensureSlash(u.toString()), auth: c.auth || 'none' };
}

function ensureSlash(s) { return s.endsWith('/') ? s : `${s}/`; }

function publicConnection(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    baseUrl: c.baseUrl,
    auth: c.auth,
    sapClient: c.sapClient || '',
    sapLanguage: c.sapLanguage || '',
    status: 'server-configured'
  };
}

function getConnection(id) {
  const c = parseConnections().find(x => x.id === id);
  if (!c) {
    const err = new Error(`Unknown connection: ${id}`);
    err.statusCode = 404;
    throw err;
  }
  return c;
}

function applyDefaultQuery(c, target) {
  const defaults = { ...(c.defaultQuery || {}) };
  if (c.sapClient != null && c.sapClient !== '') defaults['sap-client'] = c.sapClient;
  if (c.sapLanguage != null && c.sapLanguage !== '') defaults['sap-language'] = c.sapLanguage;
  for (const [key, value] of Object.entries(defaults)) {
    if (value == null || value === '' || target.searchParams.has(key)) continue;
    target.searchParams.set(key, String(value));
  }
  return target;
}

function safeUrl(c, relativePath = '') {
  if (/^https?:\/\//i.test(relativePath)) throw Object.assign(new Error('Absolute request URLs are not allowed'), { statusCode: 400 });
  const base = new URL(c.baseUrl);
  const cleaned = String(relativePath || '').replace(/^\/+/, '');
  const target = new URL(cleaned, c.baseUrl);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw Object.assign(new Error('Request path escapes the configured base URL'), { statusCode: 400 });
  }
  return applyDefaultQuery(c, target);
}

async function authHeaders(c) {
  const headers = { Accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8' };
  if (c.auth === 'basic') {
    const user = process.env[c.usernameEnv || ''];
    const pass = process.env[c.passwordEnv || ''];
    if (user == null || pass == null) throw new Error(`Missing Basic Auth environment variables for ${c.id}`);
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  } else if (c.auth === 'bearer') {
    const token = process.env[c.tokenEnv || ''];
    if (!token) throw new Error(`Missing bearer token environment variable for ${c.id}`);
    headers.Authorization = `Bearer ${token}`;
  } else if (c.auth === 'oauth2-client-credentials') {
    headers.Authorization = `Bearer ${await getOAuthToken(c)}`;
  } else if (c.auth === 'api-key') {
    const value = process.env[c.apiKeyEnv || ''];
    if (!value) throw new Error(`Missing API-key environment variable for ${c.id}`);
    const header = c.apiKeyHeader || 'X-API-Key';
    if (!/^[A-Za-z0-9-]+$/.test(header)) throw new Error(`Invalid API-key header name for ${c.id}`);
    headers[header] = value;
  } else if (!['none','anonymous'].includes(c.auth)) {
    throw new Error(`Unsupported auth mode: ${c.auth}`);
  }
  return headers;
}

async function getOAuthToken(c) {
  const cached = tokenCache.get(c.id);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;
  if (!c.tokenUrl || !c.clientIdEnv || !c.clientSecretEnv) throw new Error(`OAuth2 settings are incomplete for ${c.id}`);
  const clientId = process.env[c.clientIdEnv];
  const clientSecret = process.env[c.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`OAuth2 environment variables are missing for ${c.id}`);
  const tokenUrl = new URL(c.tokenUrl);
  if (tokenUrl.protocol !== 'https:' && !['localhost','127.0.0.1','::1'].includes(tokenUrl.hostname) && String(process.env.SAP_ALLOW_HTTP).toLowerCase() !== 'true') {
    throw new Error(`OAuth2 token URL for ${c.id} must use HTTPS`);
  }
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (c.scope) body.set('scope', c.scope);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body,
    redirect: 'manual'
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OAuth2 token request failed (${response.status}): ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('OAuth2 token endpoint did not return JSON'); }
  if (!data.access_token) throw new Error('OAuth2 response did not contain access_token');
  tokenCache.set(c.id, { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in || 300) * 1000) });
  return data.access_token;
}

async function requestConnection(id, relativePath = '', options = {}) {
  const c = getConnection(id);
  const url = safeUrl(c, relativePath);
  const headers = { ...(await authHeaders(c)), ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  const mutating = ['POST','PUT','PATCH','DELETE'].includes(method);
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || 30000), 1000), 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (mutating && c.csrf !== false) {
      const tokenResult = await fetchCsrf(c, headers, controller.signal);
      if (tokenResult.token) headers['x-csrf-token'] = tokenResult.token;
      if (tokenResult.cookie) headers.Cookie = tokenResult.cookie;
    }
    return await fetch(url, {
      method,
      headers,
      body: mutating && options.body != null ? options.body : undefined,
      redirect: 'manual',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCsrf(c, baseHeaders, signal) {
  const response = await fetch(safeUrl(c, ''), {
    method: 'GET',
    headers: { ...baseHeaders, 'x-csrf-token': 'Fetch' },
    redirect: 'manual',
    signal
  });
  const token = response.headers.get('x-csrf-token') || '';
  let cookie = '';
  if (typeof response.headers.getSetCookie === 'function') cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  else cookie = response.headers.get('set-cookie') || '';
  return { token, cookie };
}

async function health(id) {
  const started = Date.now();
  const response = await requestConnection(id, '$metadata', { method: 'GET', headers: { Accept: 'application/xml,text/xml,*/*' } });
  const sample = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    latencyMs: Date.now() - started,
    contentType: response.headers.get('content-type') || '',
    sample: response.ok ? '' : sample.slice(0, 500)
  };
}

async function metadata(id) {
  const response = await requestConnection(id, '$metadata', { method: 'GET', headers: { Accept: 'application/xml,text/xml,*/*' } });
  const xml = await response.text();
  if (!response.ok) {
    const err = new Error(`Metadata request failed (${response.status}): ${xml.slice(0, 500)}`);
    err.statusCode = response.status;
    throw err;
  }
  return { xml, contentType: response.headers.get('content-type') || 'application/xml' };
}

module.exports = {
  parseConnections,
  publicConnection,
  getConnection,
  requestConnection,
  health,
  metadata
};
