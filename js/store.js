/* ============================================================
   store.js — the library itself.

   Everything lives in localStorage on this device. The shape of a
   record is deliberately plain JSON so it survives export/import and
   can be moved to a real database later without a migration headache.

   Two collections: 'owned' (books you have) and 'wishlist' (books you
   want). Each has its own shelf, its own catalogue and its own
   ornaments.
   ============================================================ */

var Store = (function () {
  var KEY = 'bookshelf.v1';
  var DECOR_KEY = 'bookshelf.decor.v1';

  /* Book-cloth colours. Index is stored on the record, not the hex,
     so a future palette tweak restyles every existing book. */
  var PALETTE = [
    '#8C2F39', '#B24C3B', '#C97B3A', '#D9A441',
    '#6F7F4F', '#3F6B5B', '#2F6070', '#35507A',
    '#4A3F7A', '#6D3F6B', '#8A4A5E', '#5A4632',
    '#4A4E57', '#7A6A4F', '#2E4636', '#A34E2F'
  ];

  var books = [];
  var decor = [];

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      books = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(books)) books = [];
    } catch (e) {
      books = [];
    }
    try {
      var d = localStorage.getItem(DECOR_KEY);
      decor = d ? JSON.parse(d) : [];
      if (!Array.isArray(decor)) decor = [];
    } catch (e) {
      decor = [];
    }
    migrate();
    return books;
  }

  /* Records written by earlier versions predate collections and shelf
     ordering; fill those in rather than making the user start over. */
  function migrate() {
    var changed = false;
    books.forEach(function (b, i) {
      if (!b.list) { b.list = 'owned'; changed = true; }
      if (typeof b.order !== 'number') { b.order = i; changed = true; }
    });
    if (changed) save();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(books));
      localStorage.setItem(DECOR_KEY, JSON.stringify(decor));
    } catch (e) {
      return false;   // quota; nothing to do but tell the caller
    }
    return true;
  }

  /* Physical size of the spine, derived from page count when we know
     it and from the title hash when we don't, so a shelf of unknown
     books still looks like a shelf and not a comb. */
  function dimensions(title, authors, pages) {
    var seed = hash((title || '') + '|' + (authors || []).join(','));
    var n = parseInt(pages, 10);
    if (!isFinite(n) || n <= 0) n = 0;
    return { widthPx: spineWidth(n, seed), heightPx: spineHeight(n, seed) };
  }

  /* Turn whatever the lookup gave us into a full shelf record. */
  function make(data) {
    var seed = hash((data.title || '') + '|' + (data.authors || []).join(','));
    var pages = parseInt(data.pages, 10);
    if (!isFinite(pages) || pages <= 0) pages = 0;

    return {
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      isbn: data.isbn || '',
      title: (data.title || 'Untitled').trim(),
      subtitle: (data.subtitle || '').trim(),
      authors: (data.authors || []).filter(Boolean),
      publisher: data.publisher || '',
      year: data.year || '',
      pages: pages,
      subjects: (data.subjects || []).slice(0, 6),
      cover: data.cover || '',
      source: data.source || 'manual',
      list: data.list === 'wishlist' ? 'wishlist' : 'owned',
      colorIndex: seed % PALETTE.length,
      widthPx: spineWidth(pages, seed),
      heightPx: spineHeight(pages, seed),
      status: data.list === 'wishlist' ? 'unread' : 'unread',
      rating: 0,
      notes: '',
      order: nextOrder(),
      addedAt: Date.now()
    };
  }

  function spineWidth(pages, seed) {
    if (pages > 0) return Math.max(22, Math.min(52, Math.round(20 + pages / 22)));
    return 26 + (seed % 14);
  }

  function spineHeight(pages, seed) {
    var jitter = (seed >> 8) % 22;
    if (pages > 0) {
      return Math.max(112, Math.min(158, 116 + Math.round(pages / 14) + (jitter % 8)));
    }
    return 122 + jitter;
  }

  /* Books and ornaments share one ordering so an ornament can stand
     between two books rather than only at the end. */
  function nextOrder() {
    var max = -1;
    books.forEach(function (b) { if (b.order > max) max = b.order; });
    decor.forEach(function (d) { if (d.order > max) max = d.order; });
    return max + 1;
  }

  function all(list) {
    if (!list) return books;
    return books.filter(function (b) { return b.list === list; });
  }

  function count(list) { return all(list).length; }

  function add(book) {
    books.push(book);
    save();
    return book;
  }

  function get(id) {
    for (var i = 0; i < books.length; i++) if (books[i].id === id) return books[i];
    return null;
  }

  function update(id, patch) {
    var b = get(id);
    if (!b) return null;
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) b[k] = patch[k];
    save();
    return b;
  }

  function remove(id) {
    books = books.filter(function (b) { return b.id !== id; });
    save();
  }

  function clear() {
    books = [];
    decor = [];
    save();
  }

  function findByIsbn(isbn) {
    if (!isbn) return null;
    for (var i = 0; i < books.length; i++) if (books[i].isbn === isbn) return books[i];
    return null;
  }

  function color(book) { return PALETTE[book.colorIndex % PALETTE.length]; }

  /* Pale cloth needs dark lettering. Rough relative luminance is plenty. */
  function isPale(hex) {
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  }

  /* Open Library serves cover art straight off the ISBN. default=false
     makes a missing cover a 404 instead of a blank placeholder image,
     which is what lets the drawn fallback take over. */
  function coverUrl(book) {
    if (book.cover) return book.cover;
    if (book.isbn) return 'https://covers.openlibrary.org/b/isbn/' + book.isbn + '-M.jpg?default=false';
    return '';
  }

  function totalPages(list) {
    return all(list).reduce(function (n, b) { return n + (b.pages || 0); }, 0);
  }

  /* ── ornaments ──────────────────────────────────────────────── */

  function decorAll(list) {
    return decor.filter(function (d) { return (d.list || 'owned') === list; });
  }

  function decorAdd(kind, list, extra) {
    var item = {
      id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: kind,
      list: list || 'owned',
      order: nextOrder()
    };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) item[k] = extra[k];
    }
    decor.push(item);
    save();
    return item;
  }

  function decorUpdate(id, patch) {
    var d = decorGet(id);
    if (!d) return null;
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) d[k] = patch[k];
    save();
    return d;
  }

  function decorGet(id) {
    for (var i = 0; i < decor.length; i++) if (decor[i].id === id) return decor[i];
    return null;
  }

  function decorRemove(id) {
    decor = decor.filter(function (d) { return d.id !== id; });
    save();
  }

  /* Everything on one shelf, books and ornaments together, in order. */
  function shelfItems(list) {
    var items = all(list).map(function (b) { return { kind: 'book', order: b.order, book: b }; })
      .concat(decorAll(list).map(function (d) { return { kind: 'decor', order: d.order, decor: d }; }));
    items.sort(function (a, b) { return a.order - b.order; });
    return items;
  }

  /* Shuffle one item along the shelf by swapping order with its
     neighbour — enough to arrange a shelf without drag and drop. */
  function shift(id, direction) {
    var list = null;
    var self = get(id) || decorGet(id);
    if (!self) return false;
    list = self.list || 'owned';

    var items = shelfItems(list);
    var idx = -1;
    items.forEach(function (it, i) {
      var itemId = it.kind === 'book' ? it.book.id : it.decor.id;
      if (itemId === id) idx = i;
    });
    var swapWith = idx + (direction < 0 ? -1 : 1);
    if (idx < 0 || swapWith < 0 || swapWith >= items.length) return false;

    var other = items[swapWith];
    var otherRec = other.kind === 'book' ? other.book : other.decor;
    var tmp = self.order;
    self.order = otherRec.order;
    otherRec.order = tmp;
    save();
    return true;
  }

  /* ── backup ─────────────────────────────────────────────────── */

  function toJSON() {
    return JSON.stringify({
      app: 'bookshelf', version: 2,
      exported: new Date().toISOString(),
      books: books, decor: decor
    }, null, 2);
  }

  /* Import merges rather than replaces, skipping ISBNs already held. */
  function fromJSON(text) {
    var data = JSON.parse(text);
    var incoming = Array.isArray(data) ? data : data.books;
    if (!Array.isArray(incoming)) throw new Error('Not a Bookshelf export');

    var added = 0;
    incoming.forEach(function (raw) {
      if (!raw || !raw.title) return;
      if (raw.isbn && findByIsbn(raw.isbn)) return;
      var b = make(raw);
      /* Preserve the parts a user curated by hand. */
      if (typeof raw.colorIndex === 'number') b.colorIndex = raw.colorIndex;
      if (raw.status) b.status = raw.status;
      if (raw.list) b.list = raw.list;
      if (raw.rating) b.rating = raw.rating;
      if (raw.notes) b.notes = raw.notes;
      if (raw.addedAt) b.addedAt = raw.addedAt;
      books.push(b);
      added++;
    });

    if (data && Array.isArray(data.decor)) {
      data.decor.forEach(function (d) {
        if (d && d.kind) decorAdd(d.kind, d.list);
      });
    }
    save();
    return added;
  }

  return {
    PALETTE: PALETTE,
    load: load, save: save, make: make, dimensions: dimensions,
    all: all, count: count, add: add, get: get, update: update,
    remove: remove, clear: clear, findByIsbn: findByIsbn,
    color: color, isPale: isPale, coverUrl: coverUrl, totalPages: totalPages,
    decorAll: decorAll, decorAdd: decorAdd, decorGet: decorGet,
    decorUpdate: decorUpdate, decorRemove: decorRemove,
    shelfItems: shelfItems, shift: shift,
    toJSON: toJSON, fromJSON: fromJSON
  };
})();
