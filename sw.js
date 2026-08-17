/* ============================================================
   sw.js — offline shell.

   The app itself is cached so it opens with no signal; only the ISBN
   lookups need the network, and those are always fetched live.
   Bump CACHE when you change any file in SHELL.
   ============================================================ */

var CACHE = 'bookshelf-v8';

/* Cover art lives in its own cache, kept across app updates: it is
   expensive to fetch (~750ms each, cold) and never changes once
   published. Without this every launch re-fetches every cover from the
   network, and each one shows its drawn placeholder until it lands —
   which reads as flickering. */
var COVER_CACHE = 'bookshelf-covers-v1';
var COVER_HOSTS = /^(covers\.openlibrary\.org|books\.google\.com|books\.googleusercontent\.com)$/;
var COVER_LIMIT = 400;

var SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/store.js',
  './js/photos.js',
  './js/decor.js',
  './js/lookup.js',
  './js/ean13.js',
  './js/scanner.js',
  './js/ui.js',
  './js/app.js',
  './img/stars.svg',
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
          /* The cover cache deliberately survives app updates. */
          return (k === CACHE || k === COVER_CACHE) ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function coverFirst(req) {
  return caches.open(COVER_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        /* An opaque response (no-cors) reports status 0; it is still
           worth keeping. A 404 is not. */
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).then(function () { trimCovers(cache); });
        }
        return res;
      }).catch(function () {
        return hit || Response.error();
      });
    });
  });
}

/* Oldest-first eviction. Cache Storage keeps insertion order, so the
   front of the key list is the least recently added. */
function trimCovers(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= COVER_LIMIT) return;
    var excess = keys.slice(0, keys.length - COVER_LIMIT);
    return Promise.all(excess.map(function (k) { return cache.delete(k); }));
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* Covers: cache first, forever. A 404 is never cached, so a book
     whose art appears later will still pick it up. */
  if (COVER_HOSTS.test(url.hostname)) {
    e.respondWith(coverFirst(req));
    return;
  }

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
