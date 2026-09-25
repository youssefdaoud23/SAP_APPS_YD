'use strict';

const crypto = require('crypto');
const oidc = require('./oidc');
const sessionStore = require('./sessionStore');
const { parseCookies } = require('./secureCookie');
const { principal } = require('./securityModel');

const SESSION_COOKIE = 'invarture_session';

function mode() {
  if (oidc.enabled()) return 'oidc';
  if (process.env.APP_STUDIO_USER && process.env.APP_STUDIO_PASSWORD) return 'basic';
  return 'local';
}

function basicPrincipal(req) {
  const supplied = String(req.headers.authorization || '');
  const expected = `Basic ${Buffer.from(`${process.env.APP_STUDIO_USER}:${process.env.APP_STUDIO_PASSWORD}`).toString('base64')}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return principal(process.env.APP_STUDIO_USER, ['platform-admin'], 'basic');
}

async function resolvePrincipal(req) {
  const current = mode();
  if (current === 'local') return principal('local-development', ['platform-admin'], 'none');
  if (current === 'basic') return basicPrincipal(req);
  const cookies = parseCookies(req.headers.cookie);
  return sessionStore.readSession(cookies[SESSION_COOKIE]);
}

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html') || (!req.url.startsWith('/api/') && accept === '*/*');
}

function unauthorized(req, res) {
  const current = mode();
  res.setHeader('Cache-Control', 'no-store');
  if (current === 'basic') {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Invarture App Studio", charset="UTF-8"');
    res.end('Authentication required');
    return;
  }
  if (current === 'oidc' && wantsHtml(req)) {
    const returnTo = encodeURIComponent(req.url || '/');
    res.statusCode = 302;
    res.setHeader('Location', `/auth/login?returnTo=${returnTo}`);
    res.end();
    return;
  }
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Authentication required', authMode: current }));
}

module.exports = { SESSION_COOKIE, mode, resolvePrincipal, unauthorized, wantsHtml };
