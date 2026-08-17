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

  /* Photos come out of IndexedDB asynchronously; draw the shelf again
     once they are in memory so ornaments appear. */
  Photos.loadAll().then(function () { UI.renderAll(); });

  try {
    UI.setView(localStorage.getItem('bookshelf.view') === 'list' ? 'list' : 'shelf');
    UI.setLayout(localStorage.getItem('bookshelf.layout') === 'list' ? 'list' : 'grid');
    UI.setShelfMode(localStorage.getItem('bookshelf.shelfMode') === 'covers' ? 'covers' : 'spines');
    UI.setCollection(localStorage.getItem('bookshelf.collection') === 'wishlist' ? 'wishlist' : 'owned');
  } catch (e) {
    UI.setView('shelf');
  }

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
      var h = vv && vv.height > 0 ? vv.height : window.innerHeight;
      var top = vv && vv.offsetTop >= 0 ? vv.offsetTop : 0;

      /* A backgrounded or not-yet-painted page can report a height of
         zero, and writing that into the layout collapses every dialog
         to nothing — which silently sends taps to whatever is behind
         them. Refuse anything that isn't a plausible screen. */
      if (!(h > 120)) return;

      var keyboard = Math.max(0, (window.innerHeight || h) - h - top);
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
  el('coll-owned').addEventListener('click', function () { UI.setCollection('owned'); });
  el('coll-wishlist').addEventListener('click', function () { UI.setCollection('wishlist'); });
  el('btn-layout').addEventListener('click', UI.toggleLayout);
  el('btn-shelf-mode').addEventListener('click', UI.toggleShelfMode);

  el('shelf-wrap').addEventListener('click', function (e) {
    var b = e.target.closest('.book');
    if (b) { UI.openDetail(b.dataset.id); return; }
    var d = e.target.closest('.decor');
    if (d) openDecorItem(d.dataset.decor);
  });

  el('catalog').addEventListener('click', function (e) {
    var b = e.target.closest('.entry') || e.target.closest('.card');
    if (b) UI.openDetail(b.dataset.id);
  });

  el('search').addEventListener('input', UI.renderCatalog);
  el('sort').addEventListener('change', UI.renderCatalog);
  el('sheet-backdrop').addEventListener('click', UI.closeSheet);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!el('scanner').hidden) closeScanner();
    else if (!el('modal-manual').hidden) el('modal-manual').hidden = true;
    else if (!el('modal-decor-item').hidden) el('modal-decor-item').hidden = true;
    else if (!el('modal-decor').hidden) el('modal-decor').hidden = true;
    else if (!el('modal-menu').hidden) el('modal-menu').hidden = true;
    else if (!el('sheet').hidden) UI.closeSheet();
  });

  /* ── decorating ─────────────────────────────────────────────── */

  var decorItemId = null;

  el('btn-decorate').addEventListener('click', openDecorPicker);
  el('btn-decor-close').addEventListener('click', function () { el('modal-decor').hidden = true; });
  el('decor-done').addEventListener('click', function () { el('modal-decor-item').hidden = true; });

  function openDecorPicker() {
    el('decor-grid').innerHTML = Decor.KINDS.map(function (k) {
      return '<button class="decor-option" data-kind="' + k.id + '">' +
               '<span class="decor-art">' + k.svg + '</span>' +
               '<span class="decor-label">' + UI.esc(k.label) + '</span>' +
             '</button>';
    }).join('');
    el('modal-decor').hidden = false;
  }

  el('decor-grid').addEventListener('click', function (e) {
    var opt = e.target.closest('.decor-option');
    if (!opt) return;
    Store.decorAdd(opt.dataset.kind, UI.getCollection());
    UI.renderAll();
    UI.toast(Decor.get(opt.dataset.kind).label + ' added');
  });

  function openDecorItem(id) {
    var item = Store.decorGet(id);
    if (!item) return;
    decorItemId = id;

    if (item.kind === 'photo') {
      el('decor-item-name').textContent = 'Your photo';
      el('decor-preview').innerHTML = '<img src="' + Photos.get(item.photoId) + '" alt="" style="height:110px">';
      el('decor-size').value = item.sizePx || 110;
      el('decor-size-row').hidden = false;
    } else {
      var kind = Decor.get(item.kind);
      el('decor-item-name').textContent = kind ? kind.label : 'Ornament';
      el('decor-preview').innerHTML = kind ? kind.svg : '';
      el('decor-size-row').hidden = true;
    }
    el('modal-decor-item').hidden = false;
  }

  el('decor-left').addEventListener('click', function () {
    if (Store.shift(decorItemId, -1)) UI.renderAll();
  });
  el('decor-right').addEventListener('click', function () {
    if (Store.shift(decorItemId, 1)) UI.renderAll();
  });
  el('decor-remove').addEventListener('click', function () {
    var item = Store.decorGet(decorItemId);
    if (item && item.photoId) Photos.del(item.photoId);
    Store.decorRemove(decorItemId);
    el('modal-decor-item').hidden = true;
    UI.renderAll();
    UI.toast('Removed');
  });

  el('decor-size').addEventListener('input', function () {
    Store.decorUpdate(decorItemId, { sizePx: +this.value });
    UI.renderAll();
  });

  /* ── your own photos ────────────────────────────────────────── */

  var incoming = null;        // the File being previewed

  el('btn-photo-pick').addEventListener('click', function () { el('photo-file').click(); });
  el('btn-photo-cancel').addEventListener('click', function () {
    el('modal-photo').hidden = true;
    incoming = null;
  });

  el('photo-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (file) startPhoto(file);
  });

  /* Pasting or dragging in works too, which is how this will be used
     on a desktop. */
  document.addEventListener('paste', function (e) {
    if (!e.clipboardData) return;
    var items = e.clipboardData.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var file = items[i].getAsFile();
        if (file) { e.preventDefault(); startPhoto(file); return; }
      }
    }
  });

  ['dragover', 'drop'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      if (type !== 'drop') return;
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && /^image\//.test(file.type)) startPhoto(file);
    });
  });

  function startPhoto(file) {
    if (!/^image\//.test(file.type || '')) { UI.toast('That is not an image'); return; }
    incoming = file;
    el('modal-decor').hidden = true;
    el('modal-photo').hidden = false;
    el('photo-preview').removeAttribute('src');
    el('photo-note').textContent = 'Working…';
    el('btn-photo-add').disabled = true;
    renderPhotoPreview();
  }

  var processed = null;

  function renderPhotoPreview() {
    if (!incoming) return;
    var cutout = el('photo-cutout').checked;
    el('photo-note').textContent = 'Working…';
    el('btn-photo-add').disabled = true;

    Photos.process(incoming, { cutout: cutout })
      .then(function (result) {
        processed = result;
        var img = el('photo-preview');
        img.src = result.dataUrl;
        applyPreviewSize();
        var kb = Math.round(result.dataUrl.length * 0.75 / 1024);
        el('photo-note').textContent = cutout
          ? 'Background removed · ' + kb + ' KB'
          : 'Kept as photographed · ' + kb + ' KB';
        el('btn-photo-add').disabled = false;
      })
      .catch(function (err) {
        el('photo-note').textContent = err.message || 'Could not read that image';
      });
  }

  function applyPreviewSize() {
    var h = +el('photo-size').value;
    el('photo-preview').style.height = h + 'px';
    el('photo-preview').style.width = 'auto';
  }

  el('photo-cutout').addEventListener('change', renderPhotoPreview);
  el('photo-size').addEventListener('input', applyPreviewSize);

  el('btn-photo-add').addEventListener('click', function () {
    if (!processed) return;
    var id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var aspect = processed.width / processed.height;

    Photos.put(id, processed.dataUrl)
      .then(function () {
        Store.decorAdd('photo', UI.getCollection(), {
          photoId: id,
          aspect: aspect,
          sizePx: +el('photo-size').value,
          label: 'Photo'
        });
        el('modal-photo').hidden = true;
        incoming = null; processed = null;
        UI.renderAll();
        UI.toast('Added to the shelf');
      })
      .catch(function () {
        el('photo-note').textContent = 'There was no room to save that image.';
      });
  });

  /* ── scanning ───────────────────────────────────────────────── */

  el('btn-scan').addEventListener('click', openScanner);
  el('btn-close-scan').addEventListener('click', closeScanner);
  el('btn-scan-again').addEventListener('click', scanAgain);
  el('btn-add').addEventListener('click', function () { addPending('owned'); });
  el('btn-add-wish').addEventListener('click', function () { addPending('wishlist'); });

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
          showResult(existing ? 'Already in your library' : 'Found', pending.title,
                     [UI.authorsOf(pending), pending.year, pending.pages ? pending.pages + ' pp.' : '']
                       .filter(Boolean).join(' · '),
                     Store.color(pending));
        } else {
          pending = Store.make({ isbn: isbn, title: 'Unknown title', authors: [] });
          showResult('Not in the catalogue', 'ISBN ' + isbn,
                     'Nobody has this one listed. Add it and fill in the details yourself.',
                     Store.color(pending));
        }
      })
      .catch(function () {
        pending = Store.make({ isbn: isbn, title: 'Unknown title', authors: [] });
        showResult('No connection', 'ISBN ' + isbn,
                   'Saved without details — reconnect and use Edit details to fetch them.',
                   Store.color(pending));
      });
  }

  function showResult(kicker, title, meta, color) {
    el('result-kicker').textContent = kicker;
    el('result-title').textContent = title;
    el('result-meta').textContent = meta;
    el('result-spine').style.setProperty('--c', color);
    el('result-card').hidden = false;
    el('scan-hint').textContent = '';
  }

  /* Which pile it goes on is asked at the moment of scanning — that is
     when you know whether the book is in your hand or on a shop shelf. */
  function addPending(list) {
    if (!pending) return;
    pending.list = list;
    Store.add(pending);
    UI.renderAll();
    UI.toast('“' + trim(pending.title, 24) + '”' +
             (list === 'wishlist' ? ' added to Want to Read' : ' shelved'));
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
      fields.list = UI.getCollection();      // lands in whichever collection you are looking at
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

  /* Books added before the lookup got better — or added while offline —
     are missing covers and details. Go back over them. */
  el('btn-refresh').addEventListener('click', function () {
    el('modal-menu').hidden = true;

    var stale = Store.all().filter(function (b) {
      return b.isbn && (!b.cover || !b.pages || !b.authors.length || b.title === 'Unknown title');
    });
    if (!stale.length) { UI.toast('Everything already has its details'); return; }

    UI.toast('Looking up ' + stale.length + (stale.length === 1 ? ' book…' : ' books…'));
    var found = 0, done = 0;

    /* One at a time, with a breath between: this is someone else's
       free service and a shelf of 200 books shouldn't hammer it. */
    (function next(i) {
      if (i >= stale.length) {
        UI.renderAll();
        UI.toast(found ? 'Updated ' + found + ' of ' + stale.length : 'No new details found');
        return;
      }
      var book = stale[i];
      Lookup.byISBN(book.isbn)
        .then(function (data) {
          if (data && data.title) {
            var patch = { cover: data.cover || book.cover };
            if (book.title === 'Unknown title' && data.title) patch.title = data.title;
            if (!book.authors.length && data.authors.length) patch.authors = data.authors;
            if (!book.pages && data.pages) patch.pages = data.pages;
            if (!book.year && data.year) patch.year = data.year;
            if (!book.publisher && data.publisher) patch.publisher = data.publisher;
            if (!book.subjects.length && data.subjects.length) patch.subjects = data.subjects.slice(0, 6);
            if (patch.pages || patch.title) {
              var size = Store.dimensions(patch.title || book.title,
                                          patch.authors || book.authors,
                                          patch.pages || book.pages);
              patch.widthPx = size.widthPx;
              patch.heightPx = size.heightPx;
            }
            Store.update(book.id, patch);
            if (patch.cover && patch.cover !== book.cover) found++;
            else if (patch.title || patch.authors) found++;
          }
        })
        .catch(function () { /* offline or unreachable: try the rest anyway */ })
        .then(function () {
          done++;
          if (done % 5 === 0) { UI.renderAll(); UI.toast('Looked up ' + done + ' of ' + stale.length + '…'); }
          setTimeout(function () { next(i + 1); }, 220);
        });
    })(0);
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
