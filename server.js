'use strict';

const { loadEnvFile } = require('./lib/loadEnv');
loadEnvFile();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sapApi = require('./api/sap');
const workspaceApi = require('./api/workspace');
const versionApi = require('./api/version');
const platformApi = require('./api/platform');
const database = require('./lib/database');
const workspaceStore = require('./lib/workspaceStore');
const { principal } = require('./lib/securityModel');
const { getBuildInfo } = require('./lib/buildInfo');

const PORT = Number(process.env.PORT || 8081);
const ROOT = __dirname;
const BUILD_INFO = getBuildInfo(ROOT);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Invarture-Version', BUILD_INFO.version);
  res.setHeader('X-Invarture-Commit', BUILD_INFO.shortCommit || 'unavailable');
}

function authRequired() {
  return Boolean(process.env.APP_STUDIO_USER && process.env.APP_STUDIO_PASSWORD);
}

function authorized(req) {
  if (!authRequired()) return true;
  const supplied = String(req.headers.authorization || '');
  const expected = `Basic ${Buffer.from(`${process.env.APP_STUDIO_USER}:${process.env.APP_STUDIO_PASSWORD}`).toString('base64')}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestPrincipal() {
  if (authRequired()) return principal(process.env.APP_STUDIO_USER, ['platform-admin'], 'basic');
  return principal('local-development', ['platform-admin'], 'none');
}

function demandAuth(res) {
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="Invarture App Studio", charset="UTF-8"');
  res.setHeader('Cache-Control', 'no-store');
  res.end('Authentication required');
}

function health(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, version: BUILD_INFO.version, commit: BUILD_INFO.shortCommit || null }));
}

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.statusCode = 400; return res.end('Bad request'); }
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.normalize(pathname).replace(/^[/\\]+/, '').replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, normalized);
  if (!filePath.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (['.html', '.js', '.css', '.webmanifest'].includes(ext) || path.basename(filePath) === 'sw.js') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  if (req.url === '/healthz' || req.url.startsWith('/healthz?')) return health(res);
  if (!authorized(req)) return demandAuth(res);
  req.principal = requestPrincipal();
  if (req.url.startsWith('/api/version')) return versionApi(req, res);
  if (req.url.startsWith('/api/platform')) return platformApi(req, res);
  if (req.url.startsWith('/api/sap')) return sapApi(req, res);
  if (req.url.startsWith('/api/workspace')) return workspaceApi(req, res);
  return serveStatic(req, res);
});

async function start() {
  try {
    if (database.enabled()) await database.ensureDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
    return;
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Invarture App Studio ${BUILD_INFO.fingerprint} listening on http://0.0.0.0:${PORT}`);
    if (BUILD_INFO.commit) console.log(`Running Git commit: ${BUILD_INFO.commit}`);
    else console.log('Git commit metadata is unavailable for this runtime.');
    console.log(`Workspace storage: ${workspaceStore.storageMode()}`);
    console.log(authRequired() ? 'HTTP Basic protection is enabled.' : 'HTTP Basic protection is disabled. Local development receives the transitional platform-admin role.');
    if (!process.env.SAP_CONNECTIONS_JSON) console.log('SAP_CONNECTIONS_JSON is not set: Connection Center will show no server-side SAP connections.');
  });
}

start();
