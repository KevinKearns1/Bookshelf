/* ============================================================
   lookup.js — turn an ISBN into book details and a cover.

   Open Library holds the same book in three places that don't agree
   with each other:

     /api/books      rich edition data, but often no cover
     /search.json    work-level; has a cover id when the edition doesn't
     /isbn/{n}.json  the canonical edition record, with its own cover ids

   Asking only the first — which is what this used to do — loses covers
   that Open Library plainly has, and loses books whose exact printing
   isn't catalogued as an edition. So all three are asked at once and
   the answers merged, best field wins.

   Google Books is tried last and only when the others come up empty:
   without an API key it answers 429 (daily quota exhausted) often
   enough that it cannot be relied on.

   Only the ISBN is ever sent. Nothing about the user goes anywhere.
   ============================================================ */

var Lookup = (function () {

  var TIMEOUT = 8000;
  var COVERS = 'https://covers.openlibrary.org/b/';

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
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }

  /* Any of these may fail; a failure must not sink the others. */
  function soft(promise) {
    return promise.then(function (v) { return v; }, function () { return null; });
  }

  function yearOf(text) {
    var m = String(text || '').match(/\d{4}/);
    return m ? m[0] : '';
  }

  function coverById(id) {
    return id && id > 0 ? COVERS + 'id/' + id + '-L.jpg' : '';
  }

  /* ── the three Open Library endpoints ───────────────────────── */

  function booksApi(isbn) {
    return soft(fetchJSON('https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn +
                          '&format=json&jscmd=data'))
      .then(function (data) {
        var rec = data && data['ISBN:' + isbn];
        if (!rec || !rec.title) return null;
        return {
          title: rec.title,
          subtitle: rec.subtitle || '',
          authors: (rec.authors || []).map(function (a) { return a.name; }),
          publisher: (rec.publishers || []).map(function (p) { return p.name; })[0] || '',
          year: yearOf(rec.publish_date),
          pages: rec.number_of_pages || 0,
          subjects: (rec.subjects || []).map(function (s) { return s.name; }),
          cover: (rec.cover && (rec.cover.large || rec.cover.medium)) || ''
        };
      });
  }

  function searchApi(isbn) {
    var fields = 'title,author_name,cover_i,first_publish_year,number_of_pages_median,publisher,subject';
    return soft(fetchJSON('https://openlibrary.org/search.json?isbn=' + isbn +
                          '&fields=' + fields + '&limit=1'))
      .then(function (data) {
        var doc = data && data.docs && data.docs[0];
        if (!doc || !doc.title) return null;
        return {
          title: doc.title,
          authors: doc.author_name || [],
          publisher: (doc.publisher || [])[0] || '',
          year: doc.first_publish_year ? String(doc.first_publish_year) : '',
          pages: doc.number_of_pages_median || 0,
          subjects: (doc.subject || []).slice(0, 6),
          cover: coverById(doc.cover_i)
        };
      });
  }

  function editionApi(isbn) {
    return soft(fetchJSON('https://openlibrary.org/isbn/' + isbn + '.json'))
      .then(function (ed) {
        if (!ed || !ed.title) return null;
        /* `covers` can contain -1 for "known to have none". */
        var id = (ed.covers || []).filter(function (c) { return c > 0; })[0];
        return {
          title: ed.title,
          subtitle: ed.subtitle || '',
          authors: [],                     // only refs here; search gives names
          publisher: (ed.publishers || [])[0] || '',
          year: yearOf(ed.publish_date),
          pages: ed.number_of_pages || 0,
          subjects: (ed.subjects || []).slice(0, 6),
          cover: coverById(id)
        };
      });
  }

  function googleBooks(isbn) {
    return soft(fetchJSON('https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn))
      .then(function (data) {
        var item = data && data.items && data.items[0];
        var v = item && item.volumeInfo;
        if (!v || !v.title) return null;
        return {
          title: v.title,
          subtitle: v.subtitle || '',
          authors: v.authors || [],
          publisher: v.publisher || '',
          year: yearOf(v.publishedDate),
          pages: v.pageCount || 0,
          subjects: v.categories || [],
          /* served over http, which an https page refuses to load, and
             the curl edge makes it look like a sticker */
          cover: ((v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '')
            .replace(/^http:/, 'https:').replace(/&edge=curl/, '')
        };
      });
  }

  /* Best non-empty value across the sources, in order of trust. */
  function merge(sources) {
    var live = sources.filter(Boolean);
    if (!live.length) return null;

    function pick(field, empty) {
      for (var i = 0; i < live.length; i++) {
        var v = live[i][field];
        if (v && v !== empty && !(Array.isArray(v) && !v.length)) return v;
      }
      return empty;
    }

    return {
      title: pick('title', ''),
      subtitle: pick('subtitle', ''),
      authors: pick('authors', []),
      publisher: pick('publisher', ''),
      year: pick('year', ''),
      pages: pick('pages', 0),
      subjects: pick('subjects', []),
      cover: pick('cover', '')
    };
  }

  /* Resolves with book data, or null when nobody has heard of it.
     Rejects only when every service is unreachable. */
  function byISBN(rawIsbn) {
    var isbn = canonical(rawIsbn) || normalize(rawIsbn);
    if (!isbn) return Promise.reject(new Error('That does not look like an ISBN'));

    return Promise.all([booksApi(isbn), searchApi(isbn), editionApi(isbn)])
      .then(function (results) {
        /* Edition data is the most specific, but search is the one that
           reliably carries a cover and author names, so it sits between. */
        var merged = merge([results[0], results[1], results[2]]);
        if (merged && merged.title) {
          merged.isbn = isbn;
          merged.source = 'openlibrary';
          return merged;
        }
        return googleBooks(isbn).then(function (g) {
          if (!g) return null;
          g.isbn = isbn;
          g.source = 'googlebooks';
          return g;
        });
      });
  }

  return { byISBN: byISBN, canonical: canonical, normalize: normalize, coverById: coverById };
})();
