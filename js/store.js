/* ============================================================
   store.js — the library itself.

   Everything lives in localStorage on this device. The shape of a
   record is deliberately plain JSON so it survives export/import and
   can be moved to a real database later without a migration headache.
   ============================================================ */

var Store = (function () {
  var KEY = 'bookshelf.v1';

  /* Book-cloth colours. Index is stored on the record, not the hex,
     so a future palette tweak restyles every existing book. */
  var PALETTE = [
    '#8C2F39', '#B24C3B', '#C97B3A', '#D9A441',
    '#6F7F4F', '#3F6B5B', '#2F6070', '#35507A',
    '#4A3F7A', '#6D3F6B', '#8A4A5E', '#5A4632',
    '#4A4E57', '#7A6A4F', '#2E4636', '#A34E2F'
  ];

  var books = [];

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
    return books;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(books));
    } catch (e) {
      /* Quota is the only realistic failure here; nothing to do but
         tell the caller so it can warn. */
      return false;
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
      source: data.source || 'manual',
      colorIndex: seed % PALETTE.length,
      widthPx: spineWidth(pages, seed),
      heightPx: spineHeight(pages, seed),
      status: 'unread',
      rating: 0,
      notes: '',
      addedAt: Date.now()
    };
  }

  function spineWidth(pages, seed) {
    if (pages > 0) return Math.max(22, Math.min(52, Math.round(20 + pages / 22)));
    return 26 + (seed % 14);
  }

  function spineHeight(pages, seed) {
    var jitter = (seed >> 8) % 22;          // 0..21
    if (pages > 0) {
      return Math.max(112, Math.min(158, 116 + Math.round(pages / 14) + (jitter % 8)));
    }
    return 122 + jitter;
  }

  function all() { return books; }

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

  function totalPages() {
    return books.reduce(function (n, b) { return n + (b.pages || 0); }, 0);
  }

  function toJSON() {
    return JSON.stringify({ app: 'bookshelf', version: 1, exported: new Date().toISOString(), books: books }, null, 2);
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
      if (raw.rating) b.rating = raw.rating;
      if (raw.notes) b.notes = raw.notes;
      if (raw.addedAt) b.addedAt = raw.addedAt;
      books.push(b);
      added++;
    });
    save();
    return added;
  }

  return {
    PALETTE: PALETTE,
    load: load, save: save, make: make, dimensions: dimensions,
    all: all, add: add, get: get,
    update: update, remove: remove, clear: clear, findByIsbn: findByIsbn,
    color: color, isPale: isPale, totalPages: totalPages,
    toJSON: toJSON, fromJSON: fromJSON
  };
})();
