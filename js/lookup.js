/* ============================================================
   lookup.js — turn an ISBN into book details.

   Open Library first (open data, generous CORS, no key), Google Books
   as the fallback for anything it doesn't hold. Both are read-only
   GETs of a single ISBN; nothing about the user is sent.
   ============================================================ */

var Lookup = (function () {

  var TIMEOUT = 8000;

  function normalize(raw) {
    return String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  }

  function isbn10to13(isbn10) {
    var core = '978' + isbn10.slice(0, 9);
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += (+core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }

  function validate10(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += (+s[i]) * (10 - i);
    sum += (s[9] === 'X' ? 10 : +s[9]);
    return sum % 11 === 0;
  }

  function validate13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += (+s[i]) * (i % 2 ? 3 : 1);
    return ((10 - (sum % 10)) % 10) === +s[12];
  }

  /* Returns a canonical 13-digit ISBN, or '' if it isn't one. */
  function canonical(raw) {
    var s = normalize(raw);
    if (validate13(s)) return s;
    if (validate10(s)) return isbn10to13(s);
    return '';
  }

  function fetchJSON(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, opts)
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }

  function yearOf(text) {
    var m = String(text || '').match(/\d{4}/);
    return m ? m[0] : '';
  }

  function fromOpenLibrary(isbn) {
    var url = 'https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn + '&format=json&jscmd=data';
    return fetchJSON(url).then(function (data) {
      var rec = data['ISBN:' + isbn];
      if (!rec || !rec.title) return null;
      return {
        isbn: isbn,
        title: rec.title,
        subtitle: rec.subtitle || '',
        authors: (rec.authors || []).map(function (a) { return a.name; }),
        publisher: (rec.publishers || []).map(function (p) { return p.name; })[0] || '',
        year: yearOf(rec.publish_date),
        pages: rec.number_of_pages || 0,
        subjects: (rec.subjects || []).map(function (s) { return s.name; }),
        cover: (rec.cover && (rec.cover.medium || rec.cover.large || rec.cover.small)) || '',
        source: 'openlibrary'
      };
    });
  }

  function fromGoogleBooks(isbn) {
    var url = 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn;
    return fetchJSON(url).then(function (data) {
      if (!data.items || !data.items.length) return null;
      var v = data.items[0].volumeInfo || {};
      if (!v.title) return null;
      return {
        isbn: isbn,
        title: v.title,
        subtitle: v.subtitle || '',
        authors: v.authors || [],
        publisher: v.publisher || '',
        year: yearOf(v.publishedDate),
        pages: v.pageCount || 0,
        subjects: v.categories || [],
        /* Google hands these out over http, which a page served on
           https will refuse to load. */
        cover: ((v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '')
          .replace(/^http:/, 'https:'),
        source: 'googlebooks'
      };
    });
  }

  /* Resolves with book data, or null when nobody has heard of it.
     Rejects only when the device is offline / both services fail. */
  function byISBN(rawIsbn) {
    var isbn = canonical(rawIsbn) || normalize(rawIsbn);
    if (!isbn) return Promise.reject(new Error('That does not look like an ISBN'));

    var networkFailures = 0;

    return fromOpenLibrary(isbn)
      .catch(function () { networkFailures++; return null; })
      .then(function (found) {
        if (found) return found;
        return fromGoogleBooks(isbn)
          .catch(function () { networkFailures++; return null; })
          .then(function (g) {
            if (g) return g;
            if (networkFailures === 2) throw new Error('offline');
            return null;
          });
      });
  }

  return { byISBN: byISBN, canonical: canonical, normalize: normalize };
})();
