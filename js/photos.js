/* ============================================================
   photos.js — your own pictures as shelf ornaments.

   Images go in IndexedDB, not localStorage: localStorage holds maybe
   5MB of text for the whole origin, and a couple of photos would
   evict the library itself. Everything is loaded into memory once at
   startup so rendering stays synchronous.

   Product photos come on a white background, which looks like a paper
   card taped to the shelf. removeBackground() floods in from the
   edges and knocks that out, leaving the object.
   ============================================================ */

var Photos = (function () {

  var DB = 'bookshelf-photos';
  var STORE = 'images';
  var cache = {};          // id -> data URL, filled by loadAll()
  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      if (!window.indexedDB) return reject(new Error('no indexeddb'));
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function put(id, dataUrl) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(dataUrl, id);
        tx.oncomplete = function () { cache[id] = dataUrl; resolve(id); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function del(id) {
    delete cache[id];
    return open().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }).catch(function () {});
  }

  function loadAll() {
    return open().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, 'readonly');
        var store = tx.objectStore(STORE);
        var req = store.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) return resolve(cache);
          cache[cur.key] = cur.value;
          cur.continue();
        };
        req.onerror = function () { resolve(cache); };
      });
    }).catch(function () { return cache; });
  }

  function get(id) { return cache[id] || ''; }

  /* ── image processing ───────────────────────────────────────── */

  var MAX_EDGE = 460;      // plenty for a 165px-tall ornament on a 3x screen

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Could not read that file')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That does not look like an image')); };
      img.src = src;
    });
  }

  /* Flood in from every edge pixel, clearing anything close enough in
     colour to what the border is made of. Starting at the border (as
     opposed to keying out a colour everywhere) means white *inside*
     the object — a highlight on the globe, say — survives. */
  function removeBackground(ctx, w, h, tolerance) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;

    /* What colour is the background? Take the median-ish of the four
       corners rather than a single pixel, which might be a stray. */
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    var br = 0, bg = 0, bb = 0;
    corners.forEach(function (i) { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; });
    br /= 4; bg /= 4; bb /= 4;

    var tol2 = tolerance * tolerance;
    var visited = new Uint8Array(w * h);
    var queue = new Int32Array(w * h);
    var head = 0, tail = 0;
    var x, y, p;

    function consider(px) {
      if (visited[px]) return;
      var i = px * 4;
      var dr = d[i] - br, dg = d[i + 1] - bg, dbl = d[i + 2] - bb;
      if (dr * dr + dg * dg + dbl * dbl > tol2) return;
      visited[px] = 1;
      queue[tail++] = px;
    }

    for (x = 0; x < w; x++) { consider(x); consider((h - 1) * w + x); }
    for (y = 0; y < h; y++) { consider(y * w); consider(y * w + w - 1); }

    while (head < tail) {
      p = queue[head++];
      x = p % w; y = (p / w) | 0;
      if (x > 0) consider(p - 1);
      if (x < w - 1) consider(p + 1);
      if (y > 0) consider(p - w);
      if (y < h - 1) consider(p + w);
    }

    for (p = 0; p < w * h; p++) if (visited[p]) d[p * 4 + 3] = 0;

    /* A hard cut leaves a jagged, haloed edge. One box pass over the
       alpha channel alone softens it without touching colour. */
    var alpha = new Uint8ClampedArray(w * h);
    for (p = 0; p < w * h; p++) alpha[p] = d[p * 4 + 3];
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        p = y * w + x;
        var sum = alpha[p] + alpha[p - 1] + alpha[p + 1] + alpha[p - w] + alpha[p + w];
        d[p * 4 + 3] = sum / 5;
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  /* Trim fully transparent margins so the ornament sits on the shelf
     rather than floating above it. */
  function trim(canvas) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var d = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return canvas;                 // nothing left; keep as is

    var tw = maxX - minX + 1, th = maxY - minY + 1;
    if (tw === w && th === h) return canvas;

    var out = document.createElement('canvas');
    out.width = tw; out.height = th;
    out.getContext('2d').drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
    return out;
  }

  /* file -> { dataUrl, width, height }, scaled down and optionally
     cut out. Resolves with a PNG when transparent, JPEG when not —
     a JPEG of a photo is a fraction of the size. */
  function process(file, opts) {
    opts = opts || {};
    return readFile(file).then(loadImage).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('That image is empty');

      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);

      if (opts.cutout !== false) {
        removeBackground(ctx, cw, ch, opts.tolerance || 60);
        canvas = trim(canvas);
      }

      var dataUrl = opts.cutout !== false
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.82);

      return { dataUrl: dataUrl, width: canvas.width, height: canvas.height };
    });
  }

  return {
    loadAll: loadAll, get: get, put: put, del: del, process: process
  };
})();
