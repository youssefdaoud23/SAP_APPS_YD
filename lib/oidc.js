'use strict';

const crypto = require('crypto');

let discoveryCache = null;
let discoveryExpiresAt = 0;
let jwksCache = null;
let jwksExpiresAt = 0;

function text(value) {
  return String(value == null ? '' : value).trim();
}

function boolEnv(name, fallback = false) {
  const raw = text(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function enabled() {
  const mode = text(process.env.AUTH_MODE).toLowerCase();
  return mode === 'oidc' || boolEnv('OIDC_ENABLED', false);
}

function normalizeIssuer(value) {
  return text(value).replace(/\/+$/, '');
}

function config() {
  const issuer = normalizeIssuer(process.env.OIDC_ISSUER);
  const clientId = text(process.env.OIDC_CLIENT_ID);
  const clientSecret = text(process.env.OIDC_CLIENT_SECRET);
  const sessionSecret = text(process.env.OIDC_SESSION_SECRET);
  const baseUrl = text(process.env.APP_BASE_URL).replace(/\/+$/, '');
  const redirectUri = text(process.env.OIDC_REDIRECT_URI) || (baseUrl ? `${baseUrl}/auth/callback` : '');
  const scope = text(process.env.OIDC_SCOPES) || 'openid profile email';
  const groupClaim = text(process.env.OIDC_GROUPS_CLAIM) || 'groups';
  const usernameClaim = text(process.env.OIDC_USERNAME_CLAIM) || 'preferred_username';
  const displayNameClaim = text(process.env.OIDC_DISPLAY_NAME_CLAIM) || 'name';
  const emailClaim = text(process.env.OIDC_EMAIL_CLAIM) || 'email';
  const allowedAlgs = (text(process.env.OIDC_ALLOWED_ALGS) || 'RS256').split(',').map(v => v.trim()).filter(Boolean);
  return {
    issuer,
    clientId,
    clientSecret,
    sessionSecret,
    baseUrl,
    redirectUri,
    scope,
    groupClaim,
    usernameClaim,
    displayNameClaim,
    emailClaim,
    allowedAlgs,
    allowHttp: boolEnv('OIDC_ALLOW_HTTP', false),
    secureCookies: boolEnv('OIDC_COOKIE_SECURE', baseUrl.startsWith('https://')),
    transactionTtlSeconds: 600,
    clockSkewSeconds: Math.min(Math.max(Number(process.env.OIDC_CLOCK_SKEW_SECONDS || 60), 0), 300)
  };
}

function validateConfig(cfg = config()) {
  const missing = [];
  for (const key of ['issuer', 'clientId', 'sessionSecret', 'redirectUri']) if (!cfg[key]) missing.push(key);
  if (missing.length) throw new Error(`OIDC configuration is incomplete: ${missing.join(', ')}`);
  if (cfg.sessionSecret.length < 32) throw new Error('OIDC_SESSION_SECRET must be at least 32 characters.');
  for (const [label, value] of [['OIDC_ISSUER', cfg.issuer], ['OIDC_REDIRECT_URI', cfg.redirectUri]]) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label} must be an absolute URL.`); }
    if (!cfg.allowHttp && url.protocol !== 'https:') throw new Error(`${label} must use HTTPS unless OIDC_ALLOW_HTTP=true.`);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return cfg;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error' });
  if (!response.ok) throw new Error(`OIDC endpoint ${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function discovery(force = false) {
  const cfg = validateConfig();
  if (!force && discoveryCache && Date.now() < discoveryExpiresAt) return discoveryCache;
  const url = `${cfg.issuer}/.well-known/openid-configuration`;
  const document = await fetchJson(url, { headers: { Accept: 'application/json' } });
  if (normalizeIssuer(document.issuer) !== cfg.issuer) throw new Error('OIDC discovery issuer does not match OIDC_ISSUER.');
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!document[key]) throw new Error(`OIDC discovery document is missing ${key}.`);
    const endpoint = new URL(document[key]);
    if (!cfg.allowHttp && endpoint.protocol !== 'https:') throw new Error(`OIDC ${key} must use HTTPS.`);
  }
  discoveryCache = document;
  discoveryExpiresAt = Date.now() + 10 * 60 * 1000;
  return document;
}

async function jwks(force = false) {
  if (!force && jwksCache && Date.now() < jwksExpiresAt) return jwksCache;
  const document = await discovery();
  const payload = await fetchJson(document.jwks_uri, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(payload.keys)) throw new Error('OIDC JWKS response does not contain keys.');
  jwksCache = payload.keys;
  jwksExpiresAt = Date.now() + 10 * 60 * 1000;
  return jwksCache;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function safeReturnTo(value) {
  const candidate = text(value);
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  if (candidate.includes('\r') || candidate.includes('\n')) return '/';
  return candidate.slice(0, 1000);
}

async function createAuthorization(returnTo = '/') {
  const cfg = validateConfig();
  const document = await discovery();
  const transaction = {
    state: randomToken(24),
    nonce: randomToken(24),
    verifier: randomToken(48),
    returnTo: safeReturnTo(returnTo),
    createdAt: Date.now()
  };
  const url = new URL(document.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  url.searchParams.set('code_challenge', pkceChallenge(transaction.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (text(process.env.OIDC_PROMPT)) url.searchParams.set('prompt', text(process.env.OIDC_PROMPT));
  return { url: url.toString(), transaction };
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('OIDC ID token is not a valid JWT.');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('OIDC ID token contains invalid JSON.');
  }
  return { header, claims, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url') };
}

function verifyAlgorithm(alg, cfg) {
  if (!cfg.allowedAlgs.includes(alg)) throw new Error(`OIDC ID token algorithm ${alg || 'unknown'} is not allowed.`);
  const map = { RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512' };
  if (!map[alg]) throw new Error(`OIDC ID token algorithm ${alg} is not supported by this build.`);
  return map[alg];
}

async function verificationKey(header) {
  if (!header.kid) throw new Error('OIDC ID token does not contain a kid header.');
  let keys = await jwks();
  let key = keys.find(item => item.kid === header.kid && (!item.use || item.use === 'sig'));
  if (!key) {
    keys = await jwks(true);
    key = keys.find(item => item.kid === header.kid && (!item.use || item.use === 'sig'));
  }
  if (!key) throw new Error('OIDC signing key was not found in JWKS.');
  return crypto.createPublicKey({ key, format: 'jwk' });
}

function validateClaims(claims, expectedNonce, cfg) {
  const now = Math.floor(Date.now() / 1000);
  const skew = cfg.clockSkewSeconds;
  if (normalizeIssuer(claims.iss) !== cfg.issuer) throw new Error('OIDC ID token issuer is invalid.');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(cfg.clientId)) throw new Error('OIDC ID token audience is invalid.');
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now - skew) throw new Error('OIDC ID token has expired.');
  if (claims.nbf != null && Number(claims.nbf) > now + skew) throw new Error('OIDC ID token is not valid yet.');
  if (claims.iat != null && Number(claims.iat) > now + skew) throw new Error('OIDC ID token issued-at time is in the future.');
  if (!claims.sub) throw new Error('OIDC ID token does not contain a subject.');
  if (!sameSecret(claims.nonce, expectedNonce)) throw new Error('OIDC ID token nonce does not match the login transaction.');
}

async function verifyIdToken(token, expectedNonce) {
  const cfg = validateConfig();
  const parsed = parseJwt(token);
  const algorithm = verifyAlgorithm(parsed.header.alg, cfg);
  const key = await verificationKey(parsed.header);
  const valid = crypto.verify(algorithm, Buffer.from(parsed.signingInput), key, parsed.signature);
  if (!valid) throw new Error('OIDC ID token signature is invalid.');
  validateClaims(parsed.claims, expectedNonce, cfg);
  return parsed.claims;
}

async function exchangeCode(code, verifier) {
  const cfg = validateConfig();
  const document = await discovery();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: text(code),
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: text(verifier)
  });
  if (cfg.clientSecret) form.set('client_secret', cfg.clientSecret);
  const response = await fetch(document.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
    redirect: 'error'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}: ${text(payload.error_description || payload.error || 'unknown error')}`);
  if (!payload.id_token) throw new Error('OIDC token response does not contain an ID token.');
  return payload;
}

function claimValue(claims, name) {
  if (!name) return '';
  return claims[name];
}

function identityFromClaims(claims) {
  const cfg = validateConfig();
  const groupValue = claimValue(claims, cfg.groupClaim);
  const groups = Array.isArray(groupValue) ? groupValue.map(String).filter(Boolean) : [];
  return {
    issuer: normalizeIssuer(claims.iss),
    subject: text(claims.sub),
    username: text(claimValue(claims, cfg.usernameClaim) || claims.upn || claims.email || claims.sub),
    displayName: text(claimValue(claims, cfg.displayNameClaim) || claims.name || claims.preferred_username || claims.sub),
    email: text(claimValue(claims, cfg.emailClaim) || claims.email || claims.preferred_username),
    groups,
    groupsOverage: Boolean(claims.hasgroups || claims._claim_names?.[cfg.groupClaim])
  };
}

module.exports = {
  enabled,
  config,
  validateConfig,
  discovery,
  jwks,
  randomToken,
  pkceChallenge,
  safeReturnTo,
  createAuthorization,
  parseJwt,
  verifyIdToken,
  exchangeCode,
  identityFromClaims,
  sameSecret
};
