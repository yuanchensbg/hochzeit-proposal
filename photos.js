/* UI helpers + photo library (local IndexedDB + private cloud repo) + photo editor. */
(function () {
  'use strict';
  var S = window.Store;

  /* ---------------- UI helpers ---------------- */
  var UI = {};
  UI.$ = function (sel, root) { return (root || document).querySelector(sel); };
  UI.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  UI.esc = function (s) { return window.PP.esc(s); };
  var toastT = null;
  UI.toast = function (msg, ms) {
    var t = UI.$('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
  };
  UI.modal = function (html, opt) {
    opt = opt || {};
    var m = UI.$('#modal'), b = UI.$('#modalBox');
    b.className = 'modal-box' + (opt.wide ? ' wide' : '');
    b.innerHTML = html;
    m.classList.remove('hide');
    m.onclick = function (e) { if (e.target === m && !opt.sticky) UI.close(); };
    UI._onClose = opt.onClose || null;
    return b;
  };
  UI.close = function () {
    UI.$('#modal').classList.add('hide'); UI.$('#modalBox').innerHTML = '';
    var f = UI._onClose; UI._onClose = null; if (f) f();
  };
  UI.busy = function (msg) {
    var d = document.createElement('div'); d.className = 'busy'; d.textContent = msg || 'Einen Moment …';
    document.body.appendChild(d);
    return { set: function (m) { d.textContent = m; }, done: function () { d.remove(); } };
  };
  UI.confirm = function (msg) { return window.confirm(msg); };
  window.UI = UI;

  /* ---------------- image helpers ---------------- */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Bild konnte nicht geladen werden')); };
      i.src = src;
    });
  }
  function blobImg(blob) {
    var u = URL.createObjectURL(blob);
    return loadImg(u).then(function (i) { URL.revokeObjectURL(u); return i; });
  }
  function scaleCanvas(img, max) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, r = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function canvasBlob(c, q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q || .88); }); }

  /* ---------------- editing ---------------- */
  var PRESETS = [
    { id: 'none',    name: 'Original',        v: {} },
    { id: 'natural', name: 'Natürlich',       v: { auto: 1, c: 4, s: 4 } },
    { id: 'bright',  name: 'Hell & luftig',   v: { auto: 1, b: 12, c: -8, s: -8, f: 8, w: 4 } },
    { id: 'warm',    name: 'Warm & soft',     v: { auto: 1, b: 5, c: -4, s: -4, w: 14, f: 6 } },
    { id: 'fineart', name: 'Fine Art',        v: { auto: 1, b: 8, c: -14, s: -24, w: 8, f: 16 } },
    { id: 'bw',      name: 'Schwarz-Weiß',    v: { auto: 1, s: -100, c: 12 } }
  ];
  var SLIDERS = [['b', 'Helligkeit'], ['c', 'Kontrast'], ['s', 'Sättigung'], ['w', 'Wärme'], ['f', 'Matt']];
  function presetOf(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || PRESETS[0]; }
  function defaultEdit(auto) { return { preset: auto ? 'natural' : 'none', b: 0, c: 0, s: 0, w: 0, f: 0 }; }
  function isNeutral(e) { return !e || ((e.preset || 'none') === 'none' && !e.b && !e.c && !e.s && !e.w && !e.f); }
  function hasGeo(e) { return !!(e && ((e.rot || 0) % 360 || (e.crop && (e.crop.w < .999 || e.crop.h < .999)))); }
  // Rotate (90 degree steps) and crop (fractions of the rotated image) -> canvas.
  function geo(img, e) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, rot = ((e && e.rot) || 0) % 360;
    var rc = document.createElement('canvas'), sw = rot % 180 ? h : w, shh = rot % 180 ? w : h;
    rc.width = sw; rc.height = shh;
    var x = rc.getContext('2d'); x.translate(sw / 2, shh / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -w / 2, -h / 2);
    var c = e && e.crop;
    if (!c || (c.w >= .999 && c.h >= .999)) return rc;
    var out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * c.w)); out.height = Math.max(1, Math.round(shh * c.h));
    out.getContext('2d').drawImage(rc, Math.round(sw * c.x), Math.round(shh * c.y), out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function applyEdit(canvas, e) {
    if (isNeutral(e)) return canvas;
    var p = presetOf(e.preset).v;
    var b = (p.b || 0) + (+e.b || 0), c = (p.c || 0) + (+e.c || 0), s = (p.s || 0) + (+e.s || 0), w = (p.w || 0) + (+e.w || 0), f = (p.f || 0) + (+e.f || 0);
    var ctx = canvas.getContext('2d'), im = ctx.getImageData(0, 0, canvas.width, canvas.height), d = im.data, n = d.length, i;
    var lo = 0, hi = 255;
    if (p.auto) {
      var hist = new Uint32Array(256), cnt = 0;
      for (i = 0; i < n; i += 16) { hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++; cnt++; }
      var acc = 0, a = cnt * .005, z = cnt * .995;
      for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= a) { lo = i; break; } }
      acc = 0; for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= z) { hi = i; break; } }
      lo = Math.min(lo, 40); hi = Math.max(hi, 215); if (hi - lo < 60) { lo = 0; hi = 255; }
    }
    var cf = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
    var lut = new Uint8ClampedArray(256), fade = f / 100 * 45;
    for (i = 0; i < 256; i++) {
      var v = (i - lo) * 255 / (hi - lo);
      v = v + b * 1.6;
      v = cf * (v - 128) + 128;
      v = fade + v * (1 - fade / 255);
      lut[i] = v;
    }
    var sat = 1 + s / 100, wr = w * .55, wb = -w * .55;
    for (i = 0; i < n; i += 4) {
      var r = lut[d[i]], g = lut[d[i + 1]], bl = lut[d[i + 2]];
      if (sat !== 1) { var l = r * .299 + g * .587 + bl * .114; r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat; }
      d[i] = r + wr; d[i + 1] = g + wr * .25; d[i + 2] = bl + wb;
    }
    ctx.putImageData(im, 0, 0);
    return canvas;
  }

  /* ---------------- library ---------------- */
  var urlCache = {};   // key -> objectURL
  var thumbCache = {};
  var Photos = { PRESETS: PRESETS, defaultEdit: defaultEdit, onChange: null };

  Photos.list = function () {
    return S.IDB.all('photos').then(function (l) { return l.sort(function (a, b) { return (b.added || 0) - (a.added || 0); }); });
  };
  Photos.get = function (id) { return S.IDB.get('photos', id); };

  function ensureBlob(rec) {
    if (!rec) return Promise.reject(new Error('Foto fehlt'));
    if (rec.blob) return Promise.resolve(rec);
    if (!S.Cloud.enabled()) return Promise.reject(new Error('Foto liegt nur in der Cloud'));
    return S.Cloud.fetchPhotoBlob(rec.id).then(function (blob) {
      return blobImg(blob).then(function (img) {
        return canvasBlob(scaleCanvas(img, 420), .8).then(function (th) {
          rec.blob = blob; rec.thumb = th; rec.w = img.naturalWidth; rec.h = img.naturalHeight;
          return S.IDB.put('photos', rec).then(function () { return rec; });
        });
      });
    });
  }
  Photos.ensureBlob = ensureBlob;

  Photos.importFiles = function (files, onProgress) {
    var arr = Array.prototype.slice.call(files || []), ids = [];
    return arr.reduce(function (p, file, k) {
      return p.then(function () {
        if (onProgress) onProgress(k + 1, arr.length);
        return blobImg(file).then(function (img) {
          var big = scaleCanvas(img, 2400);
          return Promise.all([canvasBlob(big, .88), canvasBlob(scaleCanvas(img, 420), .8)]).then(function (bl) {
            var rec = { id: S.uid('p'), name: (file.name || 'Foto').replace(/\.[^.]+$/, ''), added: Date.now(), w: big.width, h: big.height,
              fav: false, tags: [], blob: bl[0], thumb: bl[1], cloud: false };
            ids.push(rec.id);
            return S.IDB.put('photos', rec).then(function () { if (S.Cloud.enabled()) Photos.upload(rec); });
          });
        }).catch(function (e) { UI.toast('„' + file.name + '“ konnte nicht gelesen werden'); console.warn(e); });
      });
    }, Promise.resolve()).then(function () { if (Photos.onChange) Photos.onChange(); return ids; });
  };

  Photos.upload = function (rec) {
    return S.Cloud.pushPhoto(rec).then(function (sha) {
      rec.cloud = true; rec.cloudSha = sha;
      return S.IDB.put('photos', rec);
    }).then(function () { if (Photos.onChange) Photos.onChange(); }).catch(function (e) { console.warn('cloud upload', e); UI.toast('Cloud-Upload fehlgeschlagen: ' + e.message); });
  };

  Photos.update = function (rec, patch) {
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    return S.IDB.put('photos', rec).then(function () {
      if (rec.cloud && S.Cloud.enabled()) S.Cloud.updatePhotoMeta(rec).catch(function (e) { console.warn(e); });
      if (Photos.onChange) Photos.onChange();
    });
  };

  Photos.remove = function (rec, alsoCloud) {
    return S.IDB.del('photos', rec.id).then(function () {
      if (alsoCloud && rec.cloud && S.Cloud.enabled()) return S.Cloud.deletePhoto(rec);
    }).then(function () { if (Photos.onChange) Photos.onChange(); });
  };

  // Pull cloud photo list; add missing entries (blob downloaded lazily); push local-only photos.
  Photos.sync = function () {
    if (!S.Cloud.enabled()) return Promise.resolve(0);
    return Promise.all([S.Cloud.listPhotos(), Photos.list()]).then(function (r) {
      var remote = r[0], local = r[1], byId = {};
      local.forEach(function (p) { byId[p.id] = p; });
      var adds = remote.filter(function (m) { return !byId[m.id]; }).map(function (m) {
        m.cloud = true; m.blob = null; m.thumb = null; return S.IDB.put('photos', m);
      });
      remote.forEach(function (m) {
        var l = byId[m.id];
        if (l && (l.fav !== m.fav || JSON.stringify(l.tags || []) !== JSON.stringify(m.tags || []))) { l.fav = m.fav; l.tags = m.tags; l.cloud = true; adds.push(S.IDB.put('photos', l)); }
      });
      var ups = local.filter(function (p) { return !p.cloud && p.blob; });
      return Promise.all(adds).then(function () {
        return ups.reduce(function (p, rec) { return p.then(function () { return Photos.upload(rec); }); }, Promise.resolve());
      }).then(function () { if (Photos.onChange) Photos.onChange(); return remote.length; });
    });
  };

  Photos.thumbUrl = function (rec) {
    if (thumbCache[rec.id]) return Promise.resolve(thumbCache[rec.id]);
    return ensureBlob(rec).then(function (r) { return (thumbCache[rec.id] = URL.createObjectURL(r.thumb || r.blob)); });
  };

  // Processed URL for a photo + edit (cached).
  Photos.url = function (id, edit, max) {
    var key = id + '|' + JSON.stringify(edit || {}) + '|' + (max || 1800);
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return Photos.get(id).then(function (rec) {
      // photo used in a proposal from another device, not yet listed locally -> fetch it from the cloud
      return rec || (S.Cloud.enabled() ? { id: id, name: 'Foto', added: Date.now(), cloud: true, fav: false, tags: [] } : null);
    }).then(ensureBlob).then(function (rec) {
      if (isNeutral(edit) && !hasGeo(edit) && !max) return URL.createObjectURL(rec.blob);
      return blobImg(rec.blob).then(function (img) {
        var src = hasGeo(edit) ? geo(img, edit) : img;
        return canvasBlob(applyEdit(scaleCanvas(src, max || 1800), edit), .9).then(function (b) { return URL.createObjectURL(b); });
      });
    }).then(function (u) { return (urlCache[key] = u); });
  };

  /* ---------------- picker / library UI ---------------- */
  // opt: { title, onPick(id) } — without onPick it is the library manager.
  Photos.open = function (opt) {
    opt = opt || {};
    var filter = 'all', q = '';
    var box = UI.modal(
      '<h2>' + UI.esc(opt.title || 'Foto-Datenbank') + '</h2>' +
      '<p class="hint">' + (S.Cloud.enabled() ? 'Fotos werden in deiner privaten Cloud gespeichert und sind auf allen Geräten verfügbar.' : 'Fotos werden auf diesem Gerät gespeichert. Mit Cloud-Zugang sind sie auf allen Geräten verfügbar.') + '</p>' +
      '<div class="row"><label class="btn" style="margin:0;color:#fff">Fotos hochladen<input type="file" accept="image/*" multiple hidden id="libFile"></label>' +
      (S.Cloud.enabled() ? '<button class="btn ghost" id="libSync" type="button">Mit Cloud abgleichen</button>' : '') +
      '<button class="btn ghost" id="libClose" type="button">Schließen</button></div>' +
      '<div class="row lib-filter"><button type="button" class="chip on" data-f="all">Alle</button><button type="button" class="chip" data-f="fav">★ Auswahl</button>' +
      '<input id="libQ" placeholder="Suchen / Tag …" style="flex:1;min-width:120px"></div>' +
      '<div class="lib" id="lib"></div>', { wide: true, onClose: function () { Photos.onChange = prevOnChange; } });
    var prevOnChange = Photos.onChange;
    function draw() {
      Photos.list().then(function (l) {
        if (filter === 'fav') l = l.filter(function (p) { return p.fav; });
        if (q) l = l.filter(function (p) { return ((p.name || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0; });
        var g = UI.$('#lib', box); if (!g) return;
        if (!l.length) { g.innerHTML = '<p class="hint">Noch keine Fotos. Tippe auf „Fotos hochladen“.</p>'; return; }
        g.innerHTML = l.map(function (p) {
          return '<div class="lib-it" data-id="' + p.id + '"><div class="lib-img"></div>' +
            '<button type="button" class="lib-fav' + (p.fav ? ' on' : '') + '" data-act="fav" title="Zur Auswahl">★</button>' +
            (p.cloud ? '<span class="lib-cloud" title="In der Cloud">☁</span>' : '') +
            '<div class="lib-name">' + UI.esc(p.name || '') + (p.tags && p.tags.length ? ' · ' + UI.esc(p.tags.join(', ')) : '') + '</div>' +
            '<div class="lib-acts">' + (opt.onPick ? '<button type="button" class="btn mini" data-act="pick">Wählen</button>' : '') +
            '<button type="button" class="btn mini" data-act="tag" title="Tags">#</button><button type="button" class="btn mini" data-act="del" title="Löschen">✕</button></div></div>';
        }).join('');
        l.forEach(function (p) {
          var el = g.querySelector('[data-id="' + p.id + '"] .lib-img');
          Photos.thumbUrl(p).then(function (u) { el.style.backgroundImage = 'url(' + u + ')'; }).catch(function () { el.textContent = '☁'; });
        });
      });
    }
    Photos.onChange = function () { draw(); if (prevOnChange) prevOnChange(); };
    UI.$('#libClose', box).onclick = UI.close;
    UI.$('#libFile', box).onchange = function (e) {
      var b = UI.busy('Fotos werden vorbereitet …');
      Photos.importFiles(e.target.files, function (k, n) { b.set('Foto ' + k + ' von ' + n + ' …'); }).then(function (ids) {
        b.done(); e.target.value = '';
        if (opt.onPick && ids.length === 1) { var f = opt.onPick; UI.close(); f(ids[0]); }
      });
    };
    var sy = UI.$('#libSync', box);
    if (sy) sy.onclick = function () {
      var b = UI.busy('Abgleich mit der Cloud …');
      Photos.sync().then(function (n) { b.done(); UI.toast(n + ' Fotos in der Cloud'); }).catch(function (e) { b.done(); UI.toast(e.message); });
    };
    UI.$$('.lib-filter .chip', box).forEach(function (c) {
      c.onclick = function () { UI.$$('.lib-filter .chip', box).forEach(function (x) { x.classList.remove('on'); }); c.classList.add('on'); filter = c.dataset.f; draw(); };
    });
    UI.$('#libQ', box).oninput = function (e) { q = e.target.value.trim().toLowerCase(); draw(); };
    UI.$('#lib', box).onclick = function (e) {
      var it = e.target.closest('.lib-it'); if (!it) return;
      var act = (e.target.closest('[data-act]') || {}).dataset; act = act ? act.act : (opt.onPick ? 'pick' : null);
      Photos.get(it.dataset.id).then(function (p) {
        if (!p) return;
        if (act === 'pick' && opt.onPick) { var f = opt.onPick; UI.close(); f(p.id); }
        else if (act === 'fav') Photos.update(p, { fav: !p.fav });
        else if (act === 'tag') {
          var t = window.prompt('Tags (mit Komma getrennt), z. B. Paar, Trauung, Location:', (p.tags || []).join(', '));
          if (t !== null) Photos.update(p, { tags: t.split(',').map(function (x) { return x.trim(); }).filter(Boolean) });
        } else if (act === 'del') {
          if (UI.confirm('Foto „' + (p.name || '') + '“ löschen?' + (p.cloud ? ' Es wird auch aus der Cloud entfernt.' : ''))) Photos.remove(p, true);
        }
      });
    };
    draw();
    if (S.Cloud.enabled()) Photos.sync().catch(function (e) { console.warn(e); });
  };

  /* ---------------- editor ---------------- */
  // slot: { photoId, edit: {preset,b,c,s,w,f, rot, crop:{x,y,w,h}}, focus }  -> onSave(slot)
  var RATIOS = [['frei', 'Frei', 0], ['45', '4:5', 4 / 5], ['23', '2:3', 2 / 3], ['11', '1:1', 1], ['32', '3:2', 3 / 2], ['169', '16:9', 16 / 9]];
  Photos.edit = function (slot, onSave) {
    var e = JSON.parse(JSON.stringify(slot.edit || defaultEdit(false)));
    e.rot = e.rot || 0; e.crop = e.crop || { x: 0, y: 0, w: 1, h: 1 };
    var focus = slot.focus ? { x: slot.focus.x, y: slot.focus.y } : { x: 50, y: 50 };
    var mode = 'filter', ratio = 0;
    var box = UI.modal(
      '<h2>Foto bearbeiten</h2>' +
      '<div class="presets ed-tabs"><button type="button" data-m="filter" class="on">Filter &amp; Licht</button><button type="button" data-m="crop">Zuschneiden &amp; Drehen</button><button type="button" data-m="focus">Bildausschnitt</button></div>' +
      '<p class="hint" id="edHint"></p>' +
      '<div class="ed-img" id="edWrap"><canvas id="edCv"></canvas><div class="ed-focus" id="edF"></div><div class="ed-crop hide" id="edC"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div>' +
      '<div data-for="filter"><div class="presets" id="edP">' + PRESETS.map(function (p) { return '<button type="button" data-p="' + p.id + '">' + p.name + '</button>'; }).join('') + '</div>' +
      SLIDERS.map(function (s) { return '<div class="sl"><span>' + s[1] + '</span><input type="range" min="-50" max="50" step="1" data-s="' + s[0] + '"><b data-v="' + s[0] + '">0</b></div>'; }).join('') + '</div>' +
      '<div data-for="crop" class="hide"><div class="presets" id="edR">' + RATIOS.map(function (r) { return '<button type="button" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn ghost" type="button" id="edRotL">⟲ 90°</button><button class="btn ghost" type="button" id="edRotR">⟳ 90°</button><button class="btn ghost" type="button" id="edCropReset">Ganzes Bild</button></div></div>' +
      '<div class="row"><button class="btn" id="edOk" type="button">Übernehmen</button><button class="btn ghost" id="edReset" type="button">Alles zurücksetzen</button><button class="btn ghost" id="edCancel" type="button">Abbrechen</button></div>', { wide: true });
    var cv = UI.$('#edCv', box), wrap = UI.$('#edWrap', box), cbox = UI.$('#edC', box), img0 = null, base = null, T = null;
    var HINTS = {
      filter: 'Wähle einen Look und passe Licht und Farbe an.',
      crop: 'Ziehe den Rahmen oder seine Ecken. Mit einem Format oben rastet er ein.',
      focus: 'Tippe auf den wichtigsten Punkt (z. B. Gesichter) – das Design richtet den Ausschnitt danach aus.'
    };
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function buildBase() {
      if (!img0) return;
      var g = mode === 'crop' ? geo(img0, { rot: e.rot }) : geo(img0, e);   // crop mode shows the whole (rotated) image
      base = scaleCanvas(g, 900); paint();
    }
    function paint() {
      if (!base) return;
      var c = document.createElement('canvas'); c.width = base.width; c.height = base.height; c.getContext('2d').drawImage(base, 0, 0);
      applyEdit(c, e);
      cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
      place();
    }
    function rect() { var r = cv.getBoundingClientRect(), pr = wrap.getBoundingClientRect(); return { l: r.left - pr.left, t: r.top - pr.top, w: r.width, h: r.height, ax: r.left, ay: r.top }; }
    function place() {
      var r = rect(), f = UI.$('#edF', box);
      f.classList.toggle('hide', mode !== 'focus');
      f.style.left = (r.l + r.w * focus.x / 100) + 'px'; f.style.top = (r.t + r.h * focus.y / 100) + 'px';
      cbox.classList.toggle('hide', mode !== 'crop');
      if (mode === 'crop') {
        var c = e.crop;
        cbox.style.left = (r.l + r.w * c.x) + 'px'; cbox.style.top = (r.t + r.h * c.y) + 'px';
        cbox.style.width = (r.w * c.w) + 'px'; cbox.style.height = (r.h * c.h) + 'px';
      }
    }
    function setMode(m) {
      mode = m;
      UI.$$('.ed-tabs button', box).forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
      UI.$$('[data-for]', box).forEach(function (d) { d.classList.toggle('hide', d.dataset.for !== m); });
      UI.$('#edHint', box).textContent = HINTS[m];
      buildBase();
    }
    function sync() {
      UI.$$('#edP button', box).forEach(function (b) { b.classList.toggle('on', b.dataset.p === (e.preset || 'none')); });
      UI.$$('#edR button', box).forEach(function (b) { var r = RATIOS.filter(function (x) { return x[0] === b.dataset.r; })[0]; b.classList.toggle('on', r[2] === ratio); });
      SLIDERS.forEach(function (s) { UI.$('[data-s=' + s[0] + ']', box).value = e[s[0]] || 0; UI.$('[data-v=' + s[0] + ']', box).textContent = e[s[0]] || 0; });
    }
    function later() { clearTimeout(T); T = setTimeout(paint, 60); }
    // ratio = width/height in pixels; crop is stored in fractions -> convert with the image aspect
    function applyRatio(rt) {
      ratio = rt;
      if (!rt || !base) { sync(); place(); return; }
      var ia = base.width / base.height, c = e.crop, fw = c.w, fh = fw * ia / rt;
      if (fh > 1) { fh = 1; fw = rt / ia; }
      if (fw > 1) { fw = 1; fh = ia / rt; }
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      e.crop = { x: clamp(cx - fw / 2, 0, 1 - fw), y: clamp(cy - fh / 2, 0, 1 - fh), w: fw, h: fh };
      sync(); place();
    }
    blobImgFor(slot.photoId).then(function (img) { img0 = img; buildBase(); }).catch(function (err) { UI.toast(err.message); });
    UI.$$('.ed-tabs button', box).forEach(function (b) { b.onclick = function () { setMode(b.dataset.m); }; });
    UI.$('#edP', box).onclick = function (ev) { var b = ev.target.closest('button'); if (!b) return; e.preset = b.dataset.p; sync(); later(); };
    UI.$$('[data-s]', box).forEach(function (r) { r.oninput = function () { e[r.dataset.s] = +r.value; UI.$('[data-v=' + r.dataset.s + ']', box).textContent = r.value; later(); }; });
    UI.$('#edR', box).onclick = function (ev) { var b = ev.target.closest('button'); if (!b) return; applyRatio(RATIOS.filter(function (x) { return x[0] === b.dataset.r; })[0][2]); };
    function rotate(d) { e.rot = ((e.rot || 0) + d + 360) % 360; e.crop = { x: 0, y: 0, w: 1, h: 1 }; buildBase(); if (ratio) applyRatio(ratio); }
    UI.$('#edRotL', box).onclick = function () { rotate(-90); };
    UI.$('#edRotR', box).onclick = function () { rotate(90); };
    UI.$('#edCropReset', box).onclick = function () { e.crop = { x: 0, y: 0, w: 1, h: 1 }; ratio = 0; sync(); place(); };
    // pointer: focus point / move crop / resize crop
    var drag = null;
    function move(ev) {
      if (!drag) return;
      var r = rect(), px = clamp((ev.clientX - r.ax) / r.w, 0, 1), py = clamp((ev.clientY - r.ay) / r.h, 0, 1);
      if (drag.k === 'focus') { focus.x = Math.round(px * 100); focus.y = Math.round(py * 100); place(); return; }
      var c = drag.c, n;
      if (drag.k === 'move') {
        n = { x: clamp(c.x + px - drag.px, 0, 1 - c.w), y: clamp(c.y + py - drag.py, 0, 1 - c.h), w: c.w, h: c.h };
      } else {
        var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
        if (drag.k.indexOf('w') >= 0) x0 = Math.min(px, x1 - .05); else x1 = Math.max(px, x0 + .05);
        if (drag.k.indexOf('n') >= 0) y0 = Math.min(py, y1 - .05); else y1 = Math.max(py, y0 + .05);
        if (ratio && base) {
          var ia = base.width / base.height, fh = (x1 - x0) * ia / ratio;
          if (drag.k.indexOf('n') >= 0) y0 = y1 - fh; else y1 = y0 + fh;
          if (y0 < 0 || y1 > 1) return;
        }
        n = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      e.crop = n; place();
    }
    wrap.onpointerdown = function (ev) {
      var r = rect(), px = (ev.clientX - r.ax) / r.w, py = (ev.clientY - r.ay) / r.h;
      drag = null;
      if (mode === 'focus') drag = { k: 'focus' };
      else if (mode === 'crop') {
        var h = ev.target.dataset && ev.target.dataset.h;
        if (h) drag = { k: h, c: JSON.parse(JSON.stringify(e.crop)) };
        else if (ev.target === cbox) drag = { k: 'move', c: JSON.parse(JSON.stringify(e.crop)), px: px, py: py };
      }
      if (drag) { try { wrap.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } move(ev); ev.preventDefault(); }
    };
    wrap.onpointermove = move;
    wrap.onpointerup = wrap.onpointercancel = function () { drag = null; };
    UI.$('#edReset', box).onclick = function () { e = defaultEdit(false); e.rot = 0; e.crop = { x: 0, y: 0, w: 1, h: 1 }; focus = { x: 50, y: 50 }; ratio = 0; sync(); buildBase(); };
    UI.$('#edCancel', box).onclick = UI.close;
    UI.$('#edOk', box).onclick = function () {
      if (e.crop && e.crop.w >= .999 && e.crop.h >= .999) delete e.crop;
      if (!e.rot) delete e.rot;
      UI.close(); onSave({ photoId: slot.photoId, edit: e, focus: focus });
    };
    setMode('filter'); sync();
  };
  function blobImgFor(id) { return Photos.get(id).then(function (rec) { return rec || (S.Cloud.enabled() ? { id: id, name: 'Foto', added: Date.now(), cloud: true, tags: [] } : null); }).then(ensureBlob).then(function (rec) { return blobImg(rec.blob); }); }

  window.Photos = Photos;
})();
