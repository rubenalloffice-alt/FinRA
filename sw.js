/**
 * Service worker: keeps the app files on the phone so the app opens
 * without internet. Strategy for the app's own files: network first
 * (so a fresh deploy shows up at once when online), cache as the
 * fallback (so it still opens offline or on a bad connection).
 * It NEVER touches the server API (a different site, and POST).
 * Bump CACHE_NAME when the file list changes.
 */
const CACHE_NAME = 'my-finance-v2';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'css/settings.css',
  'css/offline.css',
  'js/config.js',
  'js/api.js',
  'js/ui.js',
  'js/queue.js',
  'js/sync.js',
  'js/entry-form.js',
  'js/pending.js',
  'js/entries.js',
  'js/reports.js',
  'js/settings.js',
  'js/pwa.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

/** Saves every shell file; one missing file never blocks the install. */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* skip a file that cannot be fetched */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/** Removes caches of older versions and takes control of open pages. */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/**
 * Answers a request: network first with a time limit, cache as fallback.
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    clearTimeout(timer);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    throw err;
  }
}

/** Only this site's own GET requests are handled; everything else goes straight through. */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});