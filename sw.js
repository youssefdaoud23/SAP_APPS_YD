const CACHE = 'invarture-app-studio-v13';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './lib/platformModel.js',
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
  './manifest.webmanifest'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request).then(r => r || caches.match('./index.html'))));
});
