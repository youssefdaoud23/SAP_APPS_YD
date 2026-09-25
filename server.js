'use strict';

const { loadEnvFile } = require('./lib/loadEnv');
loadEnvFile();

const http = require('http');
const fs = require('fs');
const path = require('path');
const sapApi = require('./api/sap');
const rfcApi = require('./api/rfc');
const workspaceApi = require('./api/workspace');
const versionApi = require('./api/version');
const platformApi = require('./api/platform');
const securityApi = require('./api/security');
const auditApi = require('./api/audit');
const deploymentGateway = require('./api/deploymentGateway');
const releaseApprovalsApi = require('./api/releaseApprovals');
const releasesApi = require('./api/releases');
const apisApi = require('./api/apis');
const openApi = require('./api/openapi');
const apiRuntime = require('./api/apiRuntime');
const functionsApi = require('./api/functions');
const functionRuntime = require('./api/functionRuntime');
const workflowsApi = require('./api/workflows');
const workflowRuntime = require('./api/workflowRuntime');
const authApi = require('./api/auth');
const auth = require('./lib/auth');
const oidc = require('./lib/oidc');
const database = require('./lib/database');
const workspaceStore = require('./lib/workspaceStore');
const releaseGovernance = require('./lib/releaseGovernance');
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
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Invarture-Version', BUILD_INFO.version);
  res.setHeader('X-Invarture-Commit', BUILD_INFO.shortCommit || 'unavailable');
}

function health(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, version: BUILD_INFO.version, commit: BUILD_INFO.shortCommit || null, authMode: auth.mode() }));
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
  try {
    if (req.url === '/healthz' || req.url.startsWith('/healthz?')) return health(res);
    if (req.url.startsWith('/auth/')) return authApi(req, res);

    req.principal = await auth.resolvePrincipal(req);
    if (!req.principal) return auth.unauthorized(req, res);

    if (req.url.startsWith('/runtime/openapi/')) return openApi(req, res);
    if (req.url.startsWith('/runtime/api/')) return apiRuntime(req, res);
    if (req.url.startsWith('/runtime/functions/')) return functionRuntime(req, res);
    if (req.url.startsWith('/runtime/workflows/') || req.url.startsWith('/runtime/tasks') || req.url.startsWith('/runtime/workflow-instances/')) return workflowRuntime(req, res);
    if (req.url.startsWith('/api/version')) return versionApi(req, res);
    if (req.url.startsWith('/api/platform')) return platformApi(req, res);
    if (req.url.startsWith('/api/security')) return securityApi(req, res);
    if (req.url.startsWith('/api/audit')) return auditApi(req, res);
    if (req.url.startsWith('/api/release-approvals')) return releaseApprovalsApi(req, res);
    if (req.url.startsWith('/api/releases')) return releasesApi(req, res);
    if (req.url.startsWith('/api/deployments')) return deploymentGateway(req, res);
    if (req.url.startsWith('/api/openapi')) return openApi(req, res);
    if (req.url.startsWith('/api/apis')) return apisApi(req, res);
    if (req.url.startsWith('/api/functions')) return functionsApi(req, res);
    if (req.url.startsWith('/api/workflows')) return workflowsApi(req, res);
    if (req.url.startsWith('/api/rfc')) return rfcApi(req, res);
    if (req.url.startsWith('/api/sap')) return sapApi(req, res);
    if (req.url.startsWith('/api/workspace')) return workspaceApi(req, res);
    return serveStatic(req, res);
  } catch (error) {
    console.error('Request handling error:', error.message);
    if (res.headersSent) return res.end();
    res.statusCode = Number(error.statusCode) || 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: error.message || 'Request failed.' }));
  }
});

async function start() {
  try {
    if (database.enabled()) await database.ensureDatabase();
    if (oidc.enabled()) {
      oidc.validateConfig();
      if (!database.enabled()) throw new Error('PostgreSQL/DATABASE_URL is required when OIDC authentication is enabled.');
    }
    if (database.enabled() && releaseGovernance.enabled()) await releaseGovernance.ensureSchema();
  } catch (error) {
    console.error('Platform initialization failed:', error.message);
    process.exitCode = 1;
    return;
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Invarture App Studio ${BUILD_INFO.fingerprint} listening on http://0.0.0.0:${PORT}`);
    if (BUILD_INFO.commit) console.log(`Running Git commit: ${BUILD_INFO.commit}`);
    else console.log('Git commit metadata is unavailable for this runtime.');
    console.log(`Workspace storage: ${workspaceStore.storageMode()}`);
    console.log(`Authentication mode: ${auth.mode()}`);
    console.log(`Protected release approvals: ${releaseGovernance.enabled() ? 'enabled' : 'disabled'}`);
    if (auth.mode() === 'local') console.log('Local development receives the transitional platform-admin role.');
    if (!process.env.SAP_CONNECTIONS_JSON) console.log('SAP_CONNECTIONS_JSON is not set: Connection Center will show no server-side SAP connections.');
    if (!process.env.SAP_RFC_CONNECTIONS_JSON) console.log('SAP_RFC_CONNECTIONS_JSON is not set: RFC/BAPI Center will show no bridge connections.');
  });
}

start();