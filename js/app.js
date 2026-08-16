/* ============================================================
   app.js — wiring: scanning flow, manual entry, import/export.
   ============================================================ */

(function () {
  var el = UI.el;
  var pending = null;      // book built from a scan, not yet shelved
  var editingId = null;    // set while the manual dialog is editing

  /* ── boot ───────────────────────────────────────────────────── */

  Store.load();
  UI.renderAll();

  try {
    UI.setView(localStorage.getItem('bookshelf.view') === 'list' ? 'list' : 'shelf');
  } catch (e) { UI.setView('shelf'); }

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    });
  }

  /* Track the visible viewport so dialogs stay clear of the on-screen
     keyboard. Without this the Add button hides behind it. */
  (function trackViewport() {
    var vv = window.visualViewport;
    var root = document.documentElement;

    function apply() {
      var h = vv ? vv.height : window.innerHeight;
      var top = vv ? vv.offsetTop : 0;
      var keyboard = Math.max(0, window.innerHeight - h - top);
      root.style.setProperty('--vvh', h + 'px');
      root.style.setProperty('--vvtop', top + 'px');
      root.style.setProperty('--kb', keyboard + 'px');
    }

    apply();
    if (vv) {
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
    }
    window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });
    window.addEventListener('resize', apply);
  })();

  UI.hooks.edit = function (id) {
    UI.closeSheet();
    openManual(Store.get(id), id);
  };

  /* ── navigation ─────────────────────────────────────────────── */

  el('tab-shelf').addEventListener('click', function () { UI.setView('shelf'); });
  el('tab-list').addEventListener('click', function () { UI.setView('list'); });

  el('shelf-wrap').addEventListener('click', function (e) {
    var b = e.target.closest('.book');
    if (b) UI.openDetail(b.dataset.id);
  });

  el('catalog').addEventListener('click', function (e) {
    var b = e.target.closest('.entry');
    if (b) UI.openDetail(b.dataset.id);
  });

  el('search').addEventListener('input', UI.renderCatalog);
  el('sort').addEventListener('change', UI.renderCatalog);
  el('sheet-backdrop').addEventListener('click', UI.closeSheet);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!el('scanner').hidden) closeScanner();
    else if (!el('modal-manual').hidden) el('modal-manual').hidden = true;
    else if (!el('modal-menu').hidden) el('modal-menu').hidden = true;
    else if (!el('sheet').hidden) UI.closeSheet();
  });

  /* ── scanning ───────────────────────────────────────────────── */

  el('btn-scan').addEventListener('click', openScanner);
  el('btn-close-scan').addEventListener('click', closeScanner);
  el('btn-scan-again').addEventListener('click', scanAgain);
  el('btn-add').addEventListener('click', addPending);

  el('btn-manual').addEventListener('click', function () {
    closeScanner();
    openManual(null, null);
  });

  el('btn-torch').addEventListener('click', function () {
    var on = !this.classList.contains('is-on');
    var btn = this;
    Scanner.setTorch(on).then(function (state) { btn.classList.toggle('is-on', state); });
  });

  function openScanner() {
    el('result-card').hidden = true;
    el('reticle').classList.remove('is-hit');
    el('scan-hint').textContent = 'Line up the barcode on the back cover';
    el('scanner').hidden = false;
    el('btn-torch').hidden = true;
    el('btn-torch').classList.remove('is-on');

    Scanner.start({
      video: el('video'),
      onCode: handleCode
    }).then(function (info) {
      el('btn-torch').hidden = !info.torch;
    }).catch(function (err) {
      closeScanner();
      UI.toast(err.message);
      setTimeout(function () { openManual(null, null); }, 900);
    });
  }

  function closeScanner() {
    Scanner.stop();
    el('scanner').hidden = true;
    el('result-card').hidden = true;
    pending = null;
  }

  function scanAgain() {
    el('result-card').hidden = true;
    el('reticle').classList.remove('is-hit');
    el('scan-hint').textContent = 'Line up the barcode on the back cover';
    pending = null;
    if (!Scanner.resume()) openScanner();
  }

  function handleCode(isbn) {
    el('reticle').classList.add('is-hit');
    el('scan-hint').textContent = 'Looking up ' + isbn + '…';

    var existing = Store.findByIsbn(isbn);

    Lookup.byISBN(isbn)
      .then(function (data) {
        if (data) {
          pending = Store.make(data);
          showResult(existing ? 'Already on your shelf' : 'Found', pending.title,
                     [UI.authorsOf(pending), pending.year, pending.pages ? pending.pages + ' pp.' : '']
                       .filter(Boolean).join(' · '),
                     Store.color(pending), existing ? 'Add a copy' : 'Add to shelf');
        } else {
          pending = Store.make({ isbn: isbn, title: 'Unknown title', authors: [] });
          showResult('Not in the catalogue', 'ISBN ' + isbn,
                     'Nobody has this one listed. Add it and fill in the details yourself.',
                     Store.color(pending), 'Add anyway');
        }
      })
      .catch(function () {
        pending = Store.make({ isbn: isbn, title: 'Unknown title', authors: [] });
        showResult('No connection', 'ISBN ' + isbn,
                   'Saved without details — reconnect and use Edit details to fetch them.',
                   Store.color(pending), 'Add anyway');
      });
  }

  function showResult(kicker, title, meta, color, action) {
    el('result-kicker').textContent = kicker;
    el('result-title').textContent = title;
    el('result-meta').textContent = meta;
    el('result-spine').style.setProperty('--c', color);
    el('btn-add').textContent = action;
    el('result-card').hidden = false;
    el('scan-hint').textContent = '';
  }

  function addPending() {
    if (!pending) return;
    Store.add(pending);
    UI.renderAll();
    UI.toast('“' + trim(pending.title, 28) + '” shelved');
    scanAgain();
  }

  function trim(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ── manual entry / editing ─────────────────────────────────── */

  el('btn-manual-cancel').addEventListener('click', function () { el('modal-manual').hidden = true; });
  el('btn-manual-lookup').addEventListener('click', manualLookup);
  el('form-manual').addEventListener('submit', submitManual);

  function openManual(book, id) {
    editingId = id || null;
    el('modal-manual').querySelector('h3').textContent = id ? 'Edit details' : 'Add a book';
    el('m-isbn').value = book ? (book.isbn || '') : '';
    el('m-title').value = book ? (book.title === 'Unknown title' ? '' : book.title) : '';
    el('m-author').value = book ? UI.authorsOf(book) : '';
    el('m-year').value = book ? (book.year || '') : '';
    el('m-pages').value = book && book.pages ? book.pages : '';
    el('m-lookup-note').textContent = '';
    el('modal-manual').hidden = false;
    setTimeout(function () { el(book && book.isbn ? 'm-title' : 'm-isbn').focus(); }, 60);
  }

  function manualLookup() {
    var raw = el('m-isbn').value.trim();
    if (!raw) { el('m-lookup-note').textContent = 'Type an ISBN first.'; return; }
    el('m-lookup-note').textContent = 'Looking…';

    Lookup.byISBN(raw)
      .then(function (data) {
        if (!data) { el('m-lookup-note').textContent = 'No record found — fill it in by hand.'; return; }
        el('m-title').value = data.title;
        el('m-author').value = (data.authors || []).join(', ');
        el('m-year').value = data.year || '';
        el('m-pages').value = data.pages || '';
        el('m-lookup-note').textContent = 'Found it.';
      })
      .catch(function (e) {
        el('m-lookup-note').textContent = e.message === 'offline'
          ? 'Could not reach the catalogue.' : 'That does not look like an ISBN.';
      });
  }

  function submitManual(e) {
    e.preventDefault();
    var title = el('m-title').value.trim();
    if (!title) { el('m-lookup-note').textContent = 'A title, at least.'; return; }

    var authors = el('m-author').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var fields = {
      isbn: Lookup.canonical(el('m-isbn').value) || Lookup.normalize(el('m-isbn').value),
      title: title,
      authors: authors,
      year: el('m-year').value.trim(),
      pages: parseInt(el('m-pages').value, 10) || 0
    };

    if (editingId) {
      /* A page count filled in after the fact should resize the spine. */
      var size = Store.dimensions(fields.title, fields.authors, fields.pages);
      fields.widthPx = size.widthPx;
      fields.heightPx = size.heightPx;
      Store.update(editingId, fields);
      UI.toast('Updated');
    } else {
      Store.add(Store.make(fields));
      UI.toast('“' + trim(title, 28) + '” shelved');
    }
    editingId = null;
    el('modal-manual').hidden = true;
    UI.renderAll();
  }

  /* ── menu: export, import, wipe ─────────────────────────────── */

  el('btn-menu').addEventListener('click', function () { el('modal-menu').hidden = false; });
  el('btn-menu-close').addEventListener('click', function () { el('modal-menu').hidden = true; });

  el('btn-add-manual').addEventListener('click', function () {
    el('modal-menu').hidden = true;
    openManual(null, null);
  });

  el('btn-export').addEventListener('click', function () {
    var blob = new Blob([Store.toJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bookshelf-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    el('modal-menu').hidden = true;
  });

  el('btn-import').addEventListener('click', function () { el('import-file').click(); });

  el('import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = Store.fromJSON(String(reader.result));
        UI.renderAll();
        UI.toast(n ? n + (n === 1 ? ' book added' : ' books added') : 'Nothing new to add');
      } catch (err) {
        UI.toast('That file is not a Bookshelf export');
      }
      el('modal-menu').hidden = true;
    };
    reader.readAsText(file);
    this.value = '';
  });

  el('btn-clear').addEventListener('click', function () {
    var n = Store.all().length;
    if (!n) { UI.toast('Nothing to delete'); return; }
    if (!confirm('Delete all ' + n + ' books? This cannot be undone — export first if you want a copy.')) return;
    Store.clear();
    UI.renderAll();
    el('modal-menu').hidden = true;
    UI.toast('Shelf cleared');
  });
})();
