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
const { getBuildInfo } = require('./lib/buildInfo');

const PORT = Number(process.env.PORT || 8080);
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
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function demandAuth(res) {
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="Invarture App Studio", charset="UTF-8"');
  res.setHeader('Cache-Control', 'no-store');
  res.end('Authentication required');
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
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    if (path.basename(filePath) === 'sw.js' || path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  if (!authorized(req)) return demandAuth(res);
  if (req.url.startsWith('/api/version')) return versionApi(req, res);
  if (req.url.startsWith('/api/sap')) return sapApi(req, res);
  if (req.url.startsWith('/api/workspace')) return workspaceApi(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Invarture App Studio ${BUILD_INFO.fingerprint} listening on http://0.0.0.0:${PORT}`);
  if (BUILD_INFO.commit) console.log(`Running Git commit: ${BUILD_INFO.commit}`);
  else console.log('Git commit metadata is unavailable for this runtime.');
  console.log(authRequired() ? 'HTTP Basic protection is enabled.' : 'HTTP Basic protection is disabled. Set APP_STUDIO_USER and APP_STUDIO_PASSWORD before exposing the service.');
  if (!process.env.SAP_CONNECTIONS_JSON) console.log('SAP_CONNECTIONS_JSON is not set: Connection Center will show no server-side SAP connections.');
  if (!process.env.WORKSPACE_FILE) console.log('WORKSPACE_FILE is not set: server workspace sync is disabled.');
});
