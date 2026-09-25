'use strict';

const auth = require('../lib/auth');
const oidc = require('../lib/oidc');
const sessionStore = require('../lib/sessionStore');
const database = require('../lib/database');
const { resolveOidcPrincipal } = require('../lib/principalResolver');
const { seal, open, parseCookies, serializeCookie } = require('../lib/secureCookie');

const TRANSACTION_COOKIE = 'invarture_oidc_tx';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function setCookies(res, values) {
  res.setHeader('Set-Cookie', values.filter(Boolean));
}

function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) setCookies(res, cookies);
  res.end();
}

function clearCookie(name, secure) {
  return serializeCookie(name, '', { maxAge: 0, secure, sameSite: 'Lax', httpOnly: true });
}

async function login(req, res, url) {
  if (!oidc.enabled()) return sendJson(res, 400, { error: 'OIDC authentication is not enabled.', authMode: auth.mode() });
  const cfg = oidc.validateConfig();
  const { url: authorizationUrl, transaction } = await oidc.createAuthorization(url.searchParams.get('returnTo') || '/');
  const transactionCookie = seal(transaction, cfg.sessionSecret, 'oidc-transaction');
  redirect(res, authorizationUrl, [serializeCookie(TRANSACTION_COOKIE, transactionCookie, {
    maxAge: cfg.transactionTtlSeconds,
    secure: cfg.secureCookies,
    sameSite: 'Lax',
    httpOnly: true
  })]);
}

async function callback(req, res, url) {
  if (!oidc.enabled()) return sendJson(res, 400, { error: 'OIDC authentication is not enabled.' });
  const cfg = oidc.validateConfig();
  const providerError = url.searchParams.get('error');
  if (providerError) {
    return sendJson(res, 401, {
      error: 'OIDC provider returned an authentication error.',
      providerError,
      description: String(url.searchParams.get('error_description') || '').slice(0, 500)
    });
  }

  const code = String(url.searchParams.get('code') || '');
  const state = String(url.searchParams.get('state') || '');
  const cookies = parseCookies(req.headers.cookie);
  if (!code || !state || !cookies[TRANSACTION_COOKIE]) return sendJson(res, 400, { error: 'OIDC callback is missing the code, state or login transaction.' });

  let transaction;
  try {
    transaction = open(cookies[TRANSACTION_COOKIE], cfg.sessionSecret, 'oidc-transaction');
  } catch {
    return sendJson(res, 400, { error: 'OIDC login transaction is invalid or has been tampered with.' });
  }

  if (!transaction.createdAt || Date.now() - Number(transaction.createdAt) > cfg.transactionTtlSeconds * 1000) {
    return sendJson(res, 400, { error: 'OIDC login transaction has expired.' });
  }
  if (!oidc.sameSecret(state, transaction.state)) return sendJson(res, 400, { error: 'OIDC state does not match the login transaction.' });

  const tokens = await oidc.exchangeCode(code, transaction.verifier);
  const claims = await oidc.verifyIdToken(tokens.id_token, transaction.nonce);
  const identity = oidc.identityFromClaims(claims);
  const principal = await resolveOidcPrincipal(identity);
  const session = await sessionStore.createSession(principal, {
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    groupsOverage: identity.groupsOverage
  });
  await database.audit('security.login', principal.username, 'user', principal.userId || null, {
    authMode: 'oidc',
    issuer: identity.issuer,
    groupsOverage: identity.groupsOverage
  });

  redirect(res, oidc.safeReturnTo(transaction.returnTo), [
    serializeCookie(auth.SESSION_COOKIE, session.token, {
      maxAge: session.maxAge,
      secure: cfg.secureCookies,
      sameSite: 'Lax',
      httpOnly: true
    }),
    clearCookie(TRANSACTION_COOKIE, cfg.secureCookies)
  ]);
}

async function logout(req, res, url) {
  const cfg = oidc.enabled() ? oidc.validateConfig() : { secureCookies: false, baseUrl: '' };
  const cookies = parseCookies(req.headers.cookie);
  const current = await auth.resolvePrincipal(req).catch(() => null);
  await sessionStore.revokeSession(cookies[auth.SESSION_COOKIE], current?.username || null).catch(() => {});
  const returnTo = oidc.safeReturnTo(url.searchParams.get('returnTo') || '/');
  redirect(res, returnTo, [
    clearCookie(auth.SESSION_COOKIE, cfg.secureCookies),
    clearCookie(TRANSACTION_COOKIE, cfg.secureCookies)
  ]);
}

async function me(req, res) {
  const principal = await auth.resolvePrincipal(req).catch(() => null);
  return sendJson(res, 200, {
    authMode: auth.mode(),
    authenticated: Boolean(principal),
    principal: principal ? {
      username: principal.username,
      displayName: principal.displayName || principal.username,
      email: principal.email || null,
      roles: principal.roles || [],
      permissions: principal.permissions || []
    } : null
  });
}

module.exports = async function authHandler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/auth/login') return login(req, res, url);
    if (req.method === 'GET' && url.pathname === '/auth/callback') return callback(req, res, url);
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/auth/logout') return logout(req, res, url);
    if (req.method === 'GET' && url.pathname === '/auth/me') return me(req, res);
    return sendJson(res, 404, { error: 'Unknown authentication route.' });
  } catch (error) {
    console.error('Authentication error:', error.message);
    return sendJson(res, Number(error.statusCode) || 500, { error: error.message || 'Authentication failed.' });
  }
};
