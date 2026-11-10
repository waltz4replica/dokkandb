// Service worker: makes the app open offline and caches card images.
// Must match APP_VERSION in js/version.js, so phones pick up each new version.
const VERSION = '2.8.0-beta.4';
// The beta copy (/dokkandb/beta/) shares this site's cache storage, so its caches get their own prefix.
const PREFIX = /\/beta\/$/.test(new URL(self.registration.scope).pathname) ? 'beta-shell-' : 'shell-';
const SHELL = `${PREFIX}${VERSION}`;
const IMAGES = 'images-v1';
const MAX_IMAGES = 3000;
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/sync.js', 'js/wiki.js', 'js/db.js','js/version.js', 'js/teams.js', 'js/effects.js', 'js/advice.js','manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Old wiki API requests (if any) always go to the network.
  if (url.pathname.endsWith('/api.php')) return;

  // Images: serve from cache, fetch once otherwise.
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMAGES).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cache); }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    }));
    return;
  }

  // App files: network first (to get updates), cache as fallback when offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
  }
});

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await cache.delete(keys[i]);
  trimming = false;
}
