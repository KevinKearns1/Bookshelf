/* ============================================================
   ui.js — rendering the shelf, the catalog and the detail sheet.
   ============================================================ */

var UI = (function () {

  var hooks = {};                    // filled in by app.js
  var toastTimer = null;
  var openId = null;

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function authorsOf(b) { return (b.authors || []).join(', '); }

  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ── views ──────────────────────────────────────────────────── */

  function setView(name) {
    var shelf = name !== 'list';
    el('view-shelf').classList.toggle('is-active', shelf);
    el('view-list').classList.toggle('is-active', !shelf);
    el('view-shelf').hidden = !shelf;
    el('view-list').hidden = shelf;
    el('tab-shelf').classList.toggle('is-active', shelf);
    el('tab-list').classList.toggle('is-active', !shelf);
    el('tab-shelf').setAttribute('aria-selected', String(shelf));
    el('tab-list').setAttribute('aria-selected', String(!shelf));
    document.querySelector('.segmented').dataset.view = shelf ? 'shelf' : 'list';
    try { localStorage.setItem('bookshelf.view', shelf ? 'shelf' : 'list'); } catch (e) {}
  }

  function renderStats() {
    var books = Store.all();
    var pages = Store.totalPages();
    var s = el('stats');
    if (!books.length) { s.textContent = 'No books yet'; return; }
    var bits = [books.length + (books.length === 1 ? ' book' : ' books')];
    if (pages > 0) bits.push(pages.toLocaleString() + ' pages');
    var read = books.filter(function (b) { return b.status === 'read'; }).length;
    if (read) bits.push(read + ' read');
    s.textContent = bits.join('  ·  ');
  }

  function renderShelf() {
    var wrap = el('shelf-wrap');
    var books = Store.all();
    el('empty-shelf').hidden = books.length > 0;
    el('shelf-wrap').parentNode.hidden = books.length === 0;

    wrap.innerHTML = books.map(function (b) {
      var c = Store.color(b);
      var pale = Store.isPale(c) ? ' is-pale' : '';
      var ribbon = b.status === 'reading' ? '<span class="ribbon"></span>' : '';
      var lay = spineText(b);
      return '<button class="book" data-id="' + b.id + '" style="--w:' + b.widthPx + 'px;--h:' + b.heightPx + 'px;--c:' + c + '"' +
             ' aria-label="' + esc(b.title + (lay.fullAuthor ? ', ' + lay.fullAuthor : '')) + '">' +
               '<span class="spine' + pale + '">' + ribbon +
                 '<span class="spine-text">' +
                   '<span class="spine-title" style="font-size:' + lay.size + 'px">' + esc(lay.title) + '</span>' +
                   (lay.author ? '<span class="spine-author" style="font-size:' + lay.authorSize + 'px">' + esc(lay.author) + '</span>' : '') +
                 '</span>' +
               '</span>' +
             '</button>';
    }).join('');
  }

  /* Measure the actual type rather than guessing at character widths.
     The lettering is rotated 90° on the spine, so a string's rendered
     width is exactly the length it needs down the spine. */
  var gauge = document.createElement('canvas').getContext('2d');

  function textWidth(text, px, weight) {
    gauge.font = weight + ' ' + px + 'px "Iowan Old Style", Palatino, Georgia, serif';
    /* The canvas knows nothing of the stylesheet's letter-spacing, and
       forgetting it overflows the spine, which clips the title at both
       ends because the text is centred. */
    return gauge.measureText(text).width + text.length * px * 0.015 + 2;
  }

  /* Longest prefix of `text` that fits `room`, with an ellipsis. */
  function fitText(text, px, weight, room) {
    if (textWidth(text, px, weight) <= room) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (textWidth(text.slice(0, mid) + '…', px, weight) <= room) lo = mid; else hi = mid - 1;
    }
    if (lo < 2) return '';
    return text.slice(0, lo).replace(/[\s,;:.-]+$/, '') + '…';
  }

  /* Shrink the type before abbreviating: a smaller whole title beats a
     larger truncated one. */
  function spineText(b) {
    var room = b.heightPx - 26;
    var full = authorsOf(b);

    var size = 12;
    while (size > 8 && textWidth(b.title, size, '600') > room) size--;

    var title = fitText(b.title, size, '600', room);
    var used = textWidth(title, size, '600');

    /* The author gets its own column beside the title, so it needs
       width on the spine as well as length left over. */
    var author = '', authorSize = 9;
    if (full && b.widthPx >= 34 && room - used > 34) {
      author = fitText(full, authorSize, '400', room - 4);
    }

    return { title: title, size: size, author: author, authorSize: authorSize, fullAuthor: full };
  }

  function sortBooks(list, mode) {
    var out = list.slice();
    if (mode === 'title') {
      out.sort(function (a, b) { return stripArticle(a.title).localeCompare(stripArticle(b.title)); });
    } else if (mode === 'author') {
      out.sort(function (a, b) { return surname(a).localeCompare(surname(b)); });
    } else if (mode === 'year') {
      out.sort(function (a, b) { return (+b.year || 0) - (+a.year || 0); });
    } else if (mode === 'pages') {
      out.sort(function (a, b) { return (b.pages || 0) - (a.pages || 0); });
    } else {
      out.sort(function (a, b) { return b.addedAt - a.addedAt; });
    }
    return out;
  }

  function stripArticle(t) { return String(t || '').replace(/^(the|a|an)\s+/i, '').toLowerCase(); }

  function surname(b) {
    var a = (b.authors && b.authors[0]) || '￿';   // unknown authors sort last
    var parts = a.trim().split(/\s+/);
    return (parts.length > 1 ? parts[parts.length - 1] + ', ' + parts[0] : a).toLowerCase();
  }

  function renderCatalog() {
    var q = el('search').value.trim().toLowerCase();
    var mode = el('sort').value;
    var books = Store.all();

    var shown = books.filter(function (b) {
      if (!q) return true;
      var hay = [b.title, b.subtitle, authorsOf(b), b.publisher, b.isbn, (b.subjects || []).join(' ')]
        .join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    shown = sortBooks(shown, mode);

    el('empty-list').hidden = shown.length > 0 || books.length === 0;
    if (!books.length) {
      el('catalog').innerHTML = '';
      el('empty-list').hidden = false;
      el('empty-list').innerHTML = '<h2>Nothing catalogued</h2><p>Scan a book and it will appear here.</p>';
      return;
    }
    el('empty-list').innerHTML = '<h2>Nothing here</h2><p>No books match that search.</p>';

    el('catalog').innerHTML = shown.map(function (b) {
      var meta = [];
      if (b.year) meta.push(b.year);
      if (b.publisher) meta.push(b.publisher);
      if (b.pages) meta.push(b.pages + ' pp.');
      var pill = b.status === 'read' ? '<span class="pill read">Read</span>'
               : b.status === 'reading' ? '<span class="pill reading">Reading</span>' : '';
      return '<li><button class="entry" data-id="' + b.id + '" style="--c:' + Store.color(b) + '">' +
               '<span class="entry-chip"></span>' +
               '<span class="entry-main">' +
                 '<span class="entry-title">' + esc(b.title) + '</span>' +
                 '<span class="entry-author">' + esc(authorsOf(b) || 'Unknown author') + '</span>' +
                 (meta.length ? '<span class="entry-meta">' + esc(meta.join(' · ')) + '</span>' : '') +
               '</span>' + pill +
             '</button></li>';
    }).join('');
  }

  function renderAll() {
    renderStats();
    renderShelf();
    renderCatalog();
  }

  /* ── detail sheet ───────────────────────────────────────────── */

  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5 6.2 20.5l1.1-6.5-4.7-4.6 6.5-.95z"/></svg>';

  function fact(k, v) {
    return v ? '<li><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></li>' : '';
  }

  function openDetail(id) {
    var b = Store.get(id);
    if (!b) return;
    openId = id;

    var subjects = (b.subjects || []).slice(0, 4).join(', ');
    var added = new Date(b.addedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    var html =
      '<div class="detail-head">' +
        '<div class="detail-spine" style="--c:' + Store.color(b) + '"></div>' +
        '<div>' +
          '<h2 class="detail-title">' + esc(b.title) + '</h2>' +
          (b.subtitle ? '<p class="detail-sub">' + esc(b.subtitle) + '</p>' : '') +
          '<p class="detail-sub">' + esc(authorsOf(b) || 'Unknown author') + '</p>' +
        '</div>' +
      '</div>' +

      '<ul class="facts">' +
        fact('Published', [b.publisher, b.year].filter(Boolean).join(', ')) +
        fact('Pages', b.pages || '') +
        fact('ISBN', b.isbn) +
        fact('Subjects', subjects) +
        fact('Added', added) +
      '</ul>' +

      '<p class="sec-label">Status</p>' +
      '<div class="chips" id="d-status">' +
        chip('unread', 'Unread', b.status) +
        chip('reading', 'Reading', b.status) +
        chip('read', 'Read', b.status) +
      '</div>' +

      '<p class="sec-label">Rating</p>' +
      '<div class="stars" id="d-stars">' +
        [1, 2, 3, 4, 5].map(function (n) {
          return '<button class="star' + (n <= (b.rating || 0) ? ' is-on' : '') + '" data-n="' + n +
                 '" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">' + STAR + '</button>';
        }).join('') +
      '</div>' +

      '<p class="sec-label">Spine colour</p>' +
      '<div class="swatches" id="d-swatches">' +
        Store.PALETTE.map(function (c, i) {
          return '<button class="swatch' + (i === b.colorIndex ? ' is-on' : '') + '" data-i="' + i +
                 '" style="--c:' + c + '" aria-label="Colour ' + (i + 1) + '"></button>';
        }).join('') +
      '</div>' +

      '<p class="sec-label">Notes</p>' +
      '<textarea class="notes" id="d-notes" placeholder="What did you make of it?">' + esc(b.notes || '') + '</textarea>';

    el('sheet-body').innerHTML = html;
    /* The buttons live outside the scrolling area so they are always
       on screen, however much detail a book has. */
    el('sheet-actions').innerHTML =
      '<button class="btn danger" id="d-delete">Remove</button>' +
      '<button class="btn" id="d-edit">Edit details</button>' +
      '<button class="btn primary" id="d-close">Done</button>';
    el('sheet').hidden = false;
    el('sheet-backdrop').hidden = false;
    el('sheet-body').scrollTop = 0;
    wireDetail(b);
  }

  function chip(value, label, current) {
    return '<button class="chip' + (value === current ? ' is-on' : '') + '" data-v="' + value + '">' + label + '</button>';
  }

  function wireDetail(b) {
    el('d-status').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      Store.update(b.id, { status: btn.dataset.v });
      [].forEach.call(this.children, function (c) { c.classList.toggle('is-on', c === btn); });
      renderAll();
    });

    el('d-stars').addEventListener('click', function (e) {
      var btn = e.target.closest('.star');
      if (!btn) return;
      var n = +btn.dataset.n;
      if (n === b.rating) n = 0;                 // tapping the same star clears it
      Store.update(b.id, { rating: n });
      b.rating = n;
      [].forEach.call(this.children, function (c, i) { c.classList.toggle('is-on', i < n); });
    });

    el('d-swatches').addEventListener('click', function (e) {
      var btn = e.target.closest('.swatch');
      if (!btn) return;
      var i = +btn.dataset.i;
      Store.update(b.id, { colorIndex: i });
      [].forEach.call(this.children, function (c) { c.classList.toggle('is-on', c === btn); });
      el('sheet-body').querySelector('.detail-spine').style.setProperty('--c', Store.PALETTE[i]);
      renderAll();
    });

    var notes = el('d-notes');
    notes.addEventListener('change', function () { Store.update(b.id, { notes: notes.value }); });

    el('d-delete').addEventListener('click', function () {
      if (!confirm('Remove “' + b.title + '” from your shelf?')) return;
      Store.remove(b.id);
      closeSheet();
      renderAll();
      toast('Removed');
    });

    el('d-edit').addEventListener('click', function () {
      if (hooks.edit) hooks.edit(b.id);
    });

    el('d-close').addEventListener('click', closeSheet);
  }

  function closeSheet() {
    var notes = el('d-notes');
    if (notes && openId) Store.update(openId, { notes: notes.value });
    el('sheet').hidden = true;
    el('sheet-backdrop').hidden = true;
    openId = null;
  }

  return {
    hooks: hooks, el: el, esc: esc, toast: toast, setView: setView,
    renderAll: renderAll, renderCatalog: renderCatalog,
    openDetail: openDetail, closeSheet: closeSheet, authorsOf: authorsOf
  };
})();
