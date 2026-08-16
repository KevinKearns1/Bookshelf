/* ============================================================
   sw.js — offline shell.

   The app itself is cached so it opens with no signal; only the ISBN
   lookups need the network, and those are always fetched live.
   Bump CACHE when you change any file in SHELL.
   ============================================================ */

var CACHE = 'bookshelf-v2';

var SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/store.js',
  './js/lookup.js',
  './js/ean13.js',
  './js/scanner.js',
  './js/ui.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // let lookups go to the network

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        /* Serve from cache, then quietly refresh it for next launch. */
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).catch(function () { return caches.match('./index.html'); });
    })
  );
});
