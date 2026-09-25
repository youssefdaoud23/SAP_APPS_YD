const CACHE = 'invarture-app-studio-v24';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './lib/platformModel.js',
  './lib/componentCatalogV09.js',
  './history-preload.js',
  './v05-preload.js',
  './developer-tools.js',
  './app.js',
  './v05-bootstrap.js',
  './connection-center.js',
  './runtime-data-v05.js',
  './workspace-sync.js',
  './action-designer-v05.js',
  './platform-version.js',
  './experience-settings.js',
  './app-advanced.js',
  './v05-studio.js',
  './platform-admin-v06.js',
  './audit-viewer-v06.js',
  './group-members-v06.js',
  './deployment-manager-v07.js',
  './api-designer-v08.js',
  './server-functions-v08.js',
  './component-library-v09.js',
  './workflow-designer-v09.js',
  './launchpad-v09.js',
  './api-designer-v09.js',
  './rfc-center-v09.js',
  './release-center-v09.js',
  './manifest.webmanifest'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/runtime/api/') ||
    url.pathname.startsWith('/runtime/openapi/') ||
    url.pathname.startsWith('/runtime/functions/') ||
    url.pathname.startsWith('/runtime/workflows/') ||
    url.pathname.startsWith('/runtime/tasks') ||
    url.pathname.startsWith('/runtime/workflow-instances/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/healthz'
  ) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request).then(r => r || caches.match('./index.html'))));
});
