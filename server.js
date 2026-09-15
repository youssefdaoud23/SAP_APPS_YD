'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const sapApi = require('./api/sap');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
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
}

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.statusCode = 400; return res.end('Bad request'); }
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, normalized);
  if (!filePath.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    if (path.basename(filePath) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  if (req.url.startsWith('/api/sap')) return sapApi(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Invarture App Studio listening on http://0.0.0.0:${PORT}`);
  if (!process.env.SAP_CONNECTIONS_JSON) console.log('SAP_CONNECTIONS_JSON is not set: Connection Center will show no server-side SAP connections.');
});
