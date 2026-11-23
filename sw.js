/* Service worker: network first (so published updates show immediately), cache as offline fallback. */
var CACHE = 'pp-v1';
var SHELL = ['./', 'index.html', 'admin.html', 'app.css', 'designs.css', 'app.js', 'designs.js', 'store.js', 'photos.js', 'studio.js', 'dev.js', 'logos.js', 'config.js',
  'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/fonts/TheSeasons-Light.ttf', 'assets/fonts/Montserrat-Light.otf'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () { /* partial is fine */ }); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.github.com') return;               // never cache API / cloud data
  var cdn = /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (url.origin !== location.origin && !cdn) return;
  if (cdn) {                                                   // versioned libs + fonts: cache first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return res; });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var cp = res.clone(); var key = url.pathname.endsWith('config.js') ? new Request(url.origin + url.pathname) : req; caches.open(CACHE).then(function (c) { c.put(key, cp); }); }
    return res;
  }).catch(function () {
    var key = url.pathname.endsWith('config.js') ? new Request(url.origin + url.pathname) : req;
    return caches.match(key, { ignoreSearch: true });
  }));
});
