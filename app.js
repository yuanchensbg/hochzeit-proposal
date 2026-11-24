/* Main app (shared by the client app index.html and the developer app admin.html). */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, Photos = window.Photos, PP = window.PP;
  var $ = UI.$, $$ = UI.$$, esc = UI.esc;
  var ADMIN = window.APP_MODE === 'admin';

  var STATUS = [
    { id: 'draft',    name: 'Entwurf',     color: '#9a918a' },
    { id: 'ready',    name: 'Fertig',      color: '#6f8fa8' },
    { id: 'sent',     name: 'Gesendet',    color: '#b0897a' },
    { id: 'followup', name: 'Nachfassen',  color: '#c68a3c' },
    { id: 'booked',   name: 'Gebucht',     color: '#4f7a5a' },
    { id: 'declined', name: 'Abgesagt',    color: '#a2483f' },
    { id: 'archived', name: 'Archiviert',  color: '#c9c1ba' }
  ];
  function statusOf(id) { return STATUS.filter(function (s) { return s.id === id; })[0] || STATUS[0]; }
  function chip(id) { var s = statusOf(id); return '<span class="st" style="--c:' + s.color + '">' + s.name + '</span>'; }

  var App = window.App = { ADMIN: ADMIN, STATUS: STATUS, cfg: window.APP_CONFIG || {}, cur: null, zoom: 0 };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function when(ts) { var d = new Date(ts); return d.toLocaleDateString('de-AT') + ' ' + d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }); }
  function label(pr) { return ((pr.name1 || '') + (pr.name2 ? ' & ' + pr.name2 : '')).trim() || 'Neues Angebot'; }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  /* ================= SHELL ================= */
  var STEPS = [['design', '✦', 'Design'], ['data', '♡', 'Paar'], ['photos', '◎', 'Fotos'], ['content', '☰', 'Inhalte'], ['preview', '▢', 'Vorschau'], ['send', '➤', 'Senden']];
  if (ADMIN) STEPS.push(['dev', '⚙', 'Entwickler']);
  document.body.insertAdjacentHTML('afterbegin',
    '<header class="top"><button class="brand" id="brand" type="button"><img id="brandLogo" alt=""><span>' + (ADMIN ? 'Angebots-Studio · Admin' : 'Angebots-Studio') + '<small class="ver" id="appVer">v' + esc((window.APP_CONFIG || {}).appVersion || '1.0') + '</small></span></button>' +
    '<div class="top-actions"><span class="badge warn hide" id="localBadge" title="Lokale Änderungen noch nicht veröffentlicht">Nicht veröffentlicht</span>' +
    (ADMIN ? '<a class="btn ghost" href="./" target="_blank" rel="noopener" title="Die einfache App für deine Kollegin">Kunden-App ↗</a>' : '') +
    '<button class="btn ghost hide" id="installBtn" type="button">App installieren</button>' +
    '<button class="btn ghost" id="libBtn" type="button" title="Foto-Datenbank">Fotos</button>' +
    '<button class="btn" id="mgrBtn" type="button">Angebote</button></div></header>' +
    '<main class="app" id="app" data-step="design"><nav class="steps" id="steps">' +
    STEPS.map(function (s) { return '<button data-step="' + s[0] + '" type="button"' + (s[0] === 'preview' ? ' class="mobile-only"' : '') + '><i>' + s[1] + '</i><span>' + s[2] + '</span></button>'; }).join('') +
    '</nav><section class="panel" id="panel">' +
      '<div class="curbar" id="curbar"></div>' +
      '<div class="pane" data-pane="design"><h2>Design wählen</h2><p class="hint">Tippe auf einen Entwurf – die Vorschau zeigt sofort deine Daten.</p><div class="gallery" id="gallery"></div><div id="designTools"></div></div>' +
      '<div class="pane" data-pane="data"><h2>Brautpaar &amp; Hochzeit</h2>' +
        '<div class="grid2"><label>Name 1<input data-f="name1" placeholder="z. B. Anna" autocomplete="off"></label><label>Name 2<input data-f="name2" placeholder="z. B. Max" autocomplete="off"></label></div>' +
        '<label>Hochzeitsdatum<input type="date" data-f="date"></label><label>Location / Ort<input data-f="venue" placeholder="z. B. Schloss Fuschl, Salzburg"></label>' +
        '<label>Angebotsdatum<input type="date" data-f="offerDate"></label>' +
        '<h3>Kontakt des Paares <small>(für den Versand)</small></h3>' +
        '<label>E-Mail<input type="email" data-f="clientEmail" placeholder="paar@example.com"></label><label>WhatsApp-Nummer<input type="tel" data-f="clientPhone" placeholder="+43 660 1234567"></label>' +
        '<label>Interne Notiz <small>(erscheint nicht im Angebot)</small><textarea data-f="note" rows="3" placeholder="z. B. Anfrage über Instagram, Budget …"></textarea></label></div>' +
      '<div class="pane" data-pane="photos"><h2>Fotos</h2><label class="switch"><input type="checkbox" id="autoEdit" checked><span>Neue Fotos automatisch bearbeiten (Natürlich)</span></label>' +
        '<div class="slots" id="slots"></div><p class="hint">Wähle Fotos aus deiner Foto-Datenbank oder lade neue hoch – am Handy aus der Galerie, am PC aus jedem Ordner. „Bearbeiten“ = Filter, Helligkeit &amp; Bildausschnitt.</p></div>' +
      '<div class="pane" data-pane="content"><h2>Inhalte</h2><p class="hint">Vorbelegt mit den Standardtexten. Bei vielen Texten gibt es „Vorschläge“ – oder du schreibst frei. Änderungen gelten nur für dieses Angebot.</p>' +
        '<div id="contentEditor"></div><button class="btn ghost" id="resetContent" type="button">Standardtexte neu laden</button></div>' +
      '<div class="pane" data-pane="send"><h2>Senden</h2><div class="send-grid">' +
        '<button class="sendbtn wa" id="sWa" type="button"><b>Per WhatsApp senden</b><span id="sWaSub">PDF direkt an WhatsApp teilen</span></button>' +
        '<button class="sendbtn" id="sEml" type="button"><b>E-Mail-Entwurf mit PDF (.eml)</b><span>HTML-Mail mit PDF-Anhang – öffnet in Outlook / Apple Mail als Entwurf</span></button>' +
        '<button class="sendbtn" id="sPdf" type="button"><b>PDF herunterladen</b><span>Zum Speichern, Drucken oder selbst verschicken</span></button>' +
        '<button class="sendbtn" id="sCopy" type="button"><b>E-Mail-HTML kopieren</b><span>Formatierte Mail in Gmail / Outlook einfügen</span></button>' +
        '<button class="sendbtn" id="sMail" type="button"><b>Mail-App öffnen</b><span>Einfacher Text – PDF danach selbst anhängen</span></button>' +
        '<button class="sendbtn hide" id="sShare" type="button"><b>Teilen …</b><span>Teilen-Menü des Handys (Mail, WhatsApp, AirDrop …)</span></button></div>' +
        '<div id="msgEditor"></div><div class="status" id="sendStatus"></div>' +
        '<div class="tpl-save"><h3>Vorlage</h3><p class="hint">Design, Pakete, Preise, Texte, Logo und Fotos dieses Angebots als Vorlage speichern. Namen, Datum, Ort und Kontakt trägst du bei jedem neuen Angebot neu ein.</p>' +
        '<button class="btn ghost" id="sTpl" type="button">☆ Als Vorlage speichern</button></div></div>' +
      (ADMIN ? '<div class="pane" data-pane="dev" id="devPane"></div>' : '') +
    '</section><section class="preview" id="preview"><div class="pv-bar"><span id="pvInfo"></span><div>' +
      '<button class="btn mini" id="zoomOut" type="button">−</button><button class="btn mini" id="zoomFit" type="button">⤢</button><button class="btn mini" id="zoomIn" type="button">+</button></div></div>' +
    '<div class="pv-scroll" id="pvScroll"><div class="pv-pages" id="pages"></div></div></section></main>' +
    '<div class="modal hide" id="modal"><div class="modal-box" id="modalBox"></div></div><div class="toast" id="toast"></div><div id="exportRoot" aria-hidden="true"></div>');
  if (ADMIN) document.body.classList.add('admin');
  $('#brandLogo').src = PP.logoSrc('mark', '#1c1a19');

  /* ================= CONFIG ================= */
  // Render config = published/admin config + designs the client created herself (stored in the cloud).
  App.clientDesigns = [];
  App.rcfg = function () {
    var c = Object.assign({}, App.cfg);
    c.customDesigns = (App.cfg.customDesigns || []).concat(App.clientDesigns || []);
    return c;
  };
  App.perm = function (k) { return ADMIN || !!((App.cfg.clientPermissions || {})[k]); };
  function applyCss() { $('#customCss').textContent = PP.designCSS(App.rcfg()); }
  App.setConfig = function (cfg) {
    App.cfg = cfg;
    applyCss();
    PP.prepare(App.rcfg()).then(function () { renderGallery(); refresh(); });
    renderGallery(); renderDesignTools(); renderContentEditor(); renderMsgEditor(); refresh();
  };
  App.designs = function () {
    var cfg = App.rcfg();
    return PP.getDesigns(cfg).filter(function (d) {
      if (!d.builtin) { var cd = (cfg.customDesigns || []).filter(function (x) { return x.id === d.id; })[0]; return !cd || cd.enabled !== false; }
      var o = (cfg.designs || {})[d.id]; return !o || o.enabled !== false;
    });
  };

  /* ================= PROPOSALS ================= */
  function snapshot(pr) {
    return clone({ design: pr.design, name1: pr.name1, name2: pr.name2, date: pr.date, venue: pr.venue, offerDate: pr.offerDate,
      clientEmail: pr.clientEmail, clientPhone: pr.clientPhone, content: pr.content, slots: pr.slots, logo: pr.logo || 'auto', style: pr.style || null });
  }
  function newProposal() {
    var cfg = App.cfg;
    return {
      id: S.uid('a'), created: Date.now(), updated: Date.now(), status: 'draft',
      design: cfg.defaultDesign || 'classic', name1: '', name2: '', date: '', venue: '', offerDate: today(),
      clientEmail: '', clientPhone: '', note: '', content: clone(cfg.defaults || {}),
      slots: { cover: null, about: null, gallery: [null, null, null] },
      versions: [], log: [{ at: Date.now(), type: 'create', text: 'Angebot angelegt' }], dirty: true
    };
  }
  App.log = function (pr, type, text) { pr.log = pr.log || []; pr.log.unshift({ at: Date.now(), type: type, text: text }); };
  App.saveVersion = function (pr, note) {
    pr.versions = pr.versions || [];
    var n = (pr.versions[0] ? pr.versions[0].n : 0) + 1;
    pr.versions.unshift({ n: n, at: Date.now(), note: note || '', snap: snapshot(pr) });
    App.log(pr, 'version', 'Version ' + n + ' gespeichert' + (note ? ' – ' + note : ''));
    return n;
  };
  App.restoreVersion = function (pr, v) {
    App.saveVersion(pr, 'Stand vor Wiederherstellung von V' + v.n);
    var s = clone(v.snap); Object.keys(s).forEach(function (k) { pr[k] = s[k]; });
    App.log(pr, 'restore', 'Version ' + v.n + ' wiederhergestellt');
  };
  App.setStatus = function (pr, st) {
    if (pr.status === st) return;
    App.log(pr, 'status', 'Status: ' + statusOf(pr.status).name + ' → ' + statusOf(st).name);
    pr.status = st;
  };

  var cloudPush = debounce(function () { App.syncProposals(true); }, 4000);
  App.save = function (pr, quiet) {
    pr = pr || App.cur; if (!pr) return Promise.resolve();
    pr.updated = Date.now(); pr.dirty = true;
    return S.IDB.put('proposals', pr).then(function () {
      if (!quiet) drawCurbar();
      if (S.Cloud.enabled()) cloudPush();
    });
  };
  var saveSoon = debounce(function () { App.save(); }, 600);
  App.changed = function () { saveSoon(); refreshSoon(); };

  App.open = function (pr) {
    App.cur = pr;
    try { localStorage.setItem('pp_last', pr.id); } catch (e) { /* ignore */ }
    fillForm(); renderSlots(); renderContentEditor(); renderMsgEditor(); renderGallery(); renderDesignTools(); drawCurbar(); refresh();
  };
  App.newProposal = function () { var pr = newProposal(); return S.IDB.put('proposals', pr).then(function () { App.open(pr); setStep('data'); return pr; }); };
  App.duplicate = function (src) {
    var pr = clone(src); pr.id = S.uid('a'); pr.created = pr.updated = Date.now(); pr.status = 'draft'; pr.versions = []; pr.cloudSha = null;
    pr.log = [{ at: Date.now(), type: 'create', text: 'Kopie von „' + label(src) + '“' }];
    return S.IDB.put('proposals', pr).then(function () { App.open(pr); return pr; });
  };
  App.remove = function (pr) {
    return S.IDB.del('proposals', pr.id).then(function () {
      if (S.Cloud.enabled() && pr.cloudSha) return S.Cloud.deleteProposal(pr).catch(function (e) { UI.toast('Cloud: ' + e.message); });
    });
  };

  // Two-way sync with the private data repo (newest "updated" wins; versions are kept inside each proposal).
  var syncing = false;
  App.syncProposals = function (quiet) {
    if (!S.Cloud.enabled() || syncing) return Promise.resolve();
    syncing = true;
    return Promise.all([S.Cloud.listProposals(), S.IDB.all('proposals')]).then(function (r) {
      var remote = r[0], local = r[1], byId = {}, jobs = [];
      local.forEach(function (p) { byId[p.id] = p; });
      remote.forEach(function (f) {
        var id = f.name.replace(/\.json$/, ''), l = byId[id];
        if (l && l.cloudSha === f.sha && !l.dirty) return;            // unchanged
        if (l && l.cloudSha === f.sha && l.dirty) return;             // only local changes -> push below
        jobs.push(S.Cloud.getProposal(f.path).then(function (rp) {
          if (!rp) return;
          if (!l || !l.dirty || rp.updated > l.updated) {
            rp.dirty = false;
            if (l && l.dirty) { rp.versions = rp.versions || []; rp.versions.unshift({ n: (rp.versions[0] ? rp.versions[0].n : 0) + 1, at: Date.now(), note: 'Lokaler Stand (Konflikt)', snap: snapshot(l) }); rp.dirty = true; }
            byId[id] = rp;
            return S.IDB.put('proposals', rp).then(function () { if (App.cur && App.cur.id === id) { App.cur = rp; App.open(rp); } });
          }
          l.cloudSha = f.sha;
        }));
      });
      return Promise.all(jobs).then(function () {
        var push = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (p) { return p.dirty; });
        return push.reduce(function (pr, p) {
          return pr.then(function () {
            return S.Cloud.pushProposal(p).then(function (sha) {
              p.cloudSha = sha; p.dirty = false;
              var target = (App.cur && App.cur.id === p.id) ? App.cur : p;
              target.cloudSha = sha; target.dirty = false;
              return S.IDB.put('proposals', target);
            }).catch(function (e) { if (e.message === 'remote-newer') return; throw e; });
          });
        }, Promise.resolve());
      });
    }).then(function () { syncing = false; drawCurbar(); if (!quiet) UI.toast('Mit der Cloud abgeglichen'); })
      .catch(function (e) {
        syncing = false; console.warn(e);
        if (e.status === 401 && !ADMIN && App.cfg.cloudVault) { var s = S.ghSettings(); s.token = ''; S.saveGhSettings(s); S.IDB.del('kv', 'cloudConnect'); App.askVault(true); return; }
        if (!quiet) UI.toast('Cloud-Fehler: ' + e.message);
      });
  };

  /* ================= STEPS ================= */
  function setStep(s) {
    $('#app').dataset.step = s;
    $$('#steps button').forEach(function (b) { b.classList.toggle('on', b.dataset.step === s); });
    try { sessionStorage.setItem('pp_step', s); } catch (e) { /* ignore */ }
    if (s === 'preview') setTimeout(function () { applyZoom(); }, 30);
    if (s === 'design') setTimeout(sizeThumbs, 30);
    if (s === 'send') prepareExport();
    if (s === 'dev' && App.onDev) App.onDev();
    window.scrollTo(0, 0);
  }
  App.setStep = setStep;
  $('#steps').onclick = function (e) { var b = e.target.closest('button'); if (b) setStep(b.dataset.step); };

  function drawCurbar() {
    var pr = App.cur, el = $('#curbar'); if (!pr || !el) return;
    el.innerHTML = '<div class="cb-switch"><select id="cbPick" title="Entwurf wechseln"><option value="' + pr.id + '">' + esc(label(pr)) + '</option></select>' +
      '<button class="btn" id="cbNew" type="button" title="Neuen Entwurf anlegen">+ Neuer Entwurf</button></div>' +
      '<div><b>' + esc(label(pr)) + '</b> ' + chip(pr.status) +
      '<span class="cb-sub">' + (pr.versions && pr.versions.length ? 'V' + pr.versions[0].n + ' · ' : '') + 'gespeichert ' + when(pr.updated) +
      (S.Cloud.enabled() ? (pr.dirty ? ' · ☁ ausstehend' : ' · ☁ synchron') : '') + '</span></div>' +
      '<div class="row"><select id="cbStatus">' + STATUS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === pr.status ? ' selected' : '') + '>' + s.name + '</option>'; }).join('') + '</select>' +
      '<button class="btn ghost" id="cbVer" type="button" title="Aktuellen Stand als Version sichern">Version sichern</button></div>';
    $('#cbStatus').onchange = function (e) { App.setStatus(pr, e.target.value); App.save(); };
    $('#cbNew').onclick = function () { App.chooseNew(); };
    S.IDB.all('proposals').then(function (l) {
      var sel = $('#cbPick'); if (!sel) return;
      l.sort(function (a, b) { return b.updated - a.updated; });
      sel.innerHTML = l.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pr.id ? ' selected' : '') + '>' + esc(label(p)) + (p.date ? ' · ' + esc(PP.dateShort(p.date)) : '') + ' (' + statusOf(p.status).name + ')</option>'; }).join('') +
        '<option value="__all">Alle Angebote verwalten …</option>';
      sel.onchange = function () {
        if (sel.value === '__all') { sel.value = pr.id; App.openManager(); return; }
        App.save().then(function () { return S.IDB.get('proposals', sel.value); }).then(function (p) { if (p) { App.open(p); UI.toast('Gewechselt zu „' + label(p) + '“'); } });
      };
    });
    $('#cbVer').onclick = function () {
      var note = window.prompt('Kurze Notiz zur Version (optional):', '');
      if (note === null) return;
      var n = App.saveVersion(pr, note); App.save(); UI.toast('Version ' + n + ' gesichert');
    };
  }

  /* ================= FORM ================= */
  function fillForm() {
    var pr = App.cur;
    $$('[data-f]').forEach(function (i) { i.value = pr[i.dataset.f] || ''; });
  }
  $$('[data-f]').forEach(function (i) {
    i.addEventListener('input', function () { App.cur[i.dataset.f] = i.value; App.changed(); if (i.dataset.f === 'name1' || i.dataset.f === 'name2') drawCurbarSoon(); });
  });
  var drawCurbarSoon = debounce(drawCurbar, 300);

  /* ================= PHOTOS (slots) ================= */
  var SLOTS = [['cover', 'Titelbild', 'wide'], ['about', 'Über mich'], ['g0', 'Galerie 1'], ['g1', 'Galerie 2'], ['g2', 'Galerie 3']];
  function slotGet(k) { var s = App.cur.slots || {}; return k.charAt(0) === 'g' && k !== 'gallery' ? (s.gallery || [])[+k.slice(1)] : s[k]; }
  function slotSet(k, v) {
    var s = App.cur.slots = App.cur.slots || { gallery: [null, null, null] };
    if (k.charAt(0) === 'g') { s.gallery = s.gallery || [null, null, null]; s.gallery[+k.slice(1)] = v; } else s[k] = v;
    App.changed(); renderSlots(); renderGallerySoon();
  }
  function renderSlots() {
    var el = $('#slots'); if (!el || !App.cur) return;
    el.innerHTML = SLOTS.map(function (s) {
      var v = slotGet(s[0]);
      return '<div class="slot ' + (s[2] || '') + '" data-k="' + s[0] + '"><div class="sp" data-act="pick">' + (v ? '' : (s[0] === 'about' && App.cfg.defaults.photos && App.cfg.defaults.photos.about ? 'Standardfoto' : '+ Foto wählen')) + '</div>' +
        '<b>' + s[1] + '</b><div class="row"><button class="btn ghost" data-act="pick" type="button">Wählen</button>' +
        (v ? '<button class="btn ghost" data-act="edit" type="button">Bearbeiten</button><button class="btn ghost" data-act="clear" type="button" title="Entfernen">✕</button>' : '') + '</div></div>';
    }).join('');
    SLOTS.forEach(function (s) {
      var v = slotGet(s[0]), sp = el.querySelector('[data-k="' + s[0] + '"] .sp');
      if (v && v.photoId) Photos.url(v.photoId, v.edit, 600).then(function (u) { sp.style.backgroundImage = 'url(' + u + ')'; sp.style.backgroundPosition = (v.focus ? v.focus.x + '% ' + v.focus.y + '%' : 'center'); })
        .catch(function () { sp.textContent = 'Foto nicht verfügbar'; });
      else if (s[0] === 'about' && App.cfg.defaults.photos && App.cfg.defaults.photos.about) sp.style.backgroundImage = 'url(' + App.cfg.defaults.photos.about + ')';
    });
  }
  $('#slots').onclick = function (e) {
    var b = e.target.closest('[data-act]'), sl = e.target.closest('.slot'); if (!b || !sl) return;
    var k = sl.dataset.k, v = slotGet(k);
    if (b.dataset.act === 'pick') Photos.open({ title: 'Foto für „' + SLOTS.filter(function (s) { return s[0] === k; })[0][1] + '“', onPick: function (id) {
      slotSet(k, { photoId: id, edit: Photos.defaultEdit($('#autoEdit').checked), focus: { x: 50, y: 50 } });
    } });
    else if (b.dataset.act === 'edit' && v) Photos.edit(v, function (nv) { slotSet(k, nv); });
    else if (b.dataset.act === 'clear') slotSet(k, null);
  };
  $('#libBtn').onclick = function () { Photos.open({}); };

  function photoMap(pr, max) {
    var s = pr.slots || {}, out = { gallery: [] }, jobs = [];
    function one(slot, key) {
      if (!slot || !slot.photoId) return;
      jobs.push(Photos.url(slot.photoId, slot.edit, max).then(function (u) { out[key] = u; out[key + 'Focus'] = slot.focus; }).catch(function () { /* missing photo */ }));
    }
    one(s.cover, 'cover'); one(s.about, 'about');
    (s.gallery || []).forEach(function (g, i) {
      if (g && g.photoId) jobs.push(Photos.url(g.photoId, g.edit, max).then(function (u) { out.gallery[i] = { url: u, focus: g.focus }; }).catch(function () { /* missing */ }));
    });
    return Promise.all(jobs).then(function () {
      if (!out.about && App.cfg.defaults.photos && App.cfg.defaults.photos.about) out.about = App.cfg.defaults.photos.about;
      out.gallery = out.gallery.filter(Boolean);
      return out;
    });
  }
  App.photoMap = photoMap;

  /* ================= PREVIEW ================= */
  function fit(root) {
    // Package cards: shrink the grid text until no word overflows its card (no mid-word breaks).
    $$('.pks', root).forEach(function (g) {
      g.style.fontSize = ''; var k = 1, guard = 0;
      var over = function () { return $$('.pk', g).some(function (c) { return c.scrollWidth > c.clientWidth + 1; }); };
      while (over() && guard++ < 12) { k -= .05; g.style.fontSize = k + 'em'; }
    });
    $$('.pc', root).forEach(function (pc) {
      var fs = +pc.dataset.fs || 16.5; pc.style.fontSize = fs + 'px';
      var guard = 0;
      var min = fs * .62;
      while (pc.scrollHeight > pc.clientHeight + 1 && fs > min && guard++ < 40) { fs -= .3; pc.style.fontSize = fs + 'px'; }
    });
  }
  App.fit = fit;
  var renderTok = 0;
  function refresh() {
    if (!App.cur) return;
    var tok = ++renderTok, pr = App.cur;
    photoMap(pr, 1600).then(function (ph) {
      if (tok !== renderTok) return;
      var html = PP.render(pr, App.rcfg(), ph);
      var pages = $('#pages'), sc = $('#pvScroll'), top = sc.scrollTop;
      pages.innerHTML = html;
      $$('.page', pages).forEach(function (pg) { var w = document.createElement('div'); w.className = 'pgw'; pg.parentNode.insertBefore(w, pg); w.appendChild(pg); });
      fit(pages); applyZoom(); sc.scrollTop = top;
      var n = $$('.page', pages).length, d = App.designs().filter(function (x) { return x.id === pr.design; })[0];
      $('#pvInfo').textContent = (d ? d.name : pr.design) + ' · ' + n + ' Seiten · A4';
    });
  }
  App.refresh = refresh;
  var refreshSoon = debounce(refresh, 250);
  function applyZoom() {
    var sc = $('#pvScroll'), w = sc.clientWidth - (window.innerWidth < 900 ? 16 : 40);
    var fitZ = Math.max(.2, Math.min(1.2, w / 794));
    var z = App.zoom ? App.zoom : Math.min(fitZ, window.innerWidth < 900 ? 1 : .85);
    $('#pages').style.setProperty('--z', z.toFixed(3));
    document.fonts && document.fonts.ready.then(function () { fit($('#pages')); });
  }
  $('#zoomIn').onclick = function () { App.zoom = Math.min(1.5, (App.zoom || +getComputedStyle($('#pages')).getPropertyValue('--z') || .6) + .1); applyZoom(); };
  $('#zoomOut').onclick = function () { App.zoom = Math.max(.2, (App.zoom || +getComputedStyle($('#pages')).getPropertyValue('--z') || .6) - .1); applyZoom(); };
  $('#zoomFit').onclick = function () { App.zoom = 0; applyZoom(); };

  // No page zoom on phones (it distorts the layout) – except a pinch-zoom of the preview pages, handled by the app.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (e.touches.length > 1 && !e.target.closest('#pvScroll')) e.preventDefault(); }, { passive: false });
  (function () {
    var sc = $('#pvScroll'), pinch = null;
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    function curZ() { return +getComputedStyle($('#pages')).getPropertyValue('--z') || .6; }
    sc.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var r = sc.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        pinch = { d: dist(e.touches), z: curZ(), mx: mx, my: my, sx: sc.scrollLeft, sy: sc.scrollTop, wy: window.scrollY };
      }
    }, { passive: true });
    sc.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var z = Math.max(.25, Math.min(2.5, pinch.z * dist(e.touches) / pinch.d)), k = z / pinch.z;
      App.zoom = z; $('#pages').style.setProperty('--z', z.toFixed(3));
      sc.scrollLeft = (pinch.sx + pinch.mx) * k - pinch.mx;
      if (window.innerWidth < 900) window.scrollTo(window.scrollX, (pinch.wy + pinch.my) * k - pinch.my);   // phones scroll the window vertically
      else sc.scrollTop = (pinch.sy + pinch.my) * k - pinch.my;
    }, { passive: false });
    sc.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
  })();
  window.addEventListener('resize', debounce(function () { applyZoom(); renderGallery(); }, 200));

  /* ================= DESIGN GALLERY ================= */
  /* favourite designs: shown first; stored locally + in the cloud (designs/favorites.json) */
  var FAV_KEY = 'pp_fav_designs', FAV_PATH = 'designs/favorites.json', favSha = null;
  App.favs = (function () { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } })();
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(App.favs)); } catch (e) { /* ignore */ }
    if (S.Cloud.enabled()) S.GH.put(S.Cloud.repo(), FAV_PATH, S.utf8ToB64(JSON.stringify(App.favs)), 'Lieblingsdesigns', favSha || undefined)
      .then(function (r) { favSha = r.content.sha; }).catch(function (e) { console.warn(e); });
  }
  App.loadFavs = function () {
    if (!S.Cloud.enabled()) return Promise.resolve();
    return S.GH.getText(S.Cloud.repo(), FAV_PATH).then(function (r) {
      if (r) { favSha = r.sha; try { App.favs = JSON.parse(r.text); localStorage.setItem(FAV_KEY, r.text); } catch (e) { /* keep */ } renderGallery(); }
    }).catch(function () { /* offline */ });
  };
  function renderGallery() {
    var g = $('#gallery'); if (!g || !App.cur) return;
    var pr = App.cur, all = App.designs();
    var favs = App.favs.map(function (id) { return all.filter(function (d) { return d.id === id; })[0]; }).filter(Boolean);
    var list = favs.concat(all.filter(function (d) { return App.favs.indexOf(d.id) < 0; }));
    g.innerHTML = list.map(function (d, i) {
      var fav = App.favs.indexOf(d.id) >= 0;
      return (i === 0 && favs.length ? '<div class="gal-sec">★ Favoriten</div>' : '') + (i === favs.length && favs.length ? '<div class="gal-sec">Alle Designs</div>' : '') +
        '<div role="button" tabindex="0" class="dz' + (d.id === pr.design ? ' on' : '') + '" data-id="' + d.id + '"><div class="thumb"><div></div></div>' +
        '<button type="button" class="dz-fav' + (fav ? ' on' : '') + '" data-fav="' + d.id + '" title="' + (fav ? 'Aus Favoriten entfernen' : 'Als Favorit oben anzeigen') + '">★</button>' +
        '<b>' + esc(d.name) + '</b><span>' + esc(d.desc || '') + '</span>' +
        (d.builtin ? (d.duo ? '<span class="tag">2 Seiten</span>' : '') : '<span class="tag">eigenes Design</span>') + '</div>';
    }).join('');
    photoMap(pr, 700).then(function (ph) {
      list.forEach(function (d) {
        var t = g.querySelector('[data-id="' + d.id + '"] .thumb'); if (!t) return;
        var inner = t.firstChild; inner.style.transform = 'scale(' + (t.clientWidth ? (t.clientWidth / 794).toFixed(4) : '0.25') + ')';
        inner.innerHTML = PP.render(Object.assign({}, pr, { design: d.id }), App.rcfg(), ph, { coverOnly: true });
      });
    });
  }
  // Scale each cover thumbnail to its tile; re-run whenever tiles change size or become visible.
  function sizeThumbs() {
    $$('#gallery .thumb').forEach(function (t) {
      var w = t.clientWidth; if (w > 0) t.firstChild.style.transform = 'scale(' + (w / 794).toFixed(4) + ')';
    });
  }
  if (window.ResizeObserver) new ResizeObserver(sizeThumbs).observe($('#gallery'));
  var renderGallerySoon = debounce(renderGallery, 500);
  App.renderGallery = renderGallery;
  $('#gallery').onclick = function (e) {
    var f = e.target.closest('[data-fav]');
    if (f) {
      e.stopPropagation();
      var id = f.dataset.fav, i = App.favs.indexOf(id);
      if (i >= 0) App.favs.splice(i, 1); else App.favs.unshift(id);
      saveFavs(); renderGallery(); UI.toast(i >= 0 ? 'Aus Favoriten entfernt' : '★ Als Favorit oben angezeigt');
      return;
    }
    var b = e.target.closest('.dz'); if (!b) return;
    App.cur.design = b.dataset.id; App.changed();
    $$('#gallery .dz').forEach(function (x) { x.classList.toggle('on', x === b); });
    if (window.innerWidth < 900) setTimeout(function () { setStep('preview'); }, 150);
  };

  /* ================= DESIGN TOOLS (permissions) ================= */
  var LOGOS = [['auto', 'Wie im Design'], ['full', 'Komplettlogo'], ['mark', 'Monogramm'], ['word', 'Schriftzug'], ['none', 'Ohne Logo']];
  function renderDesignTools() {
    var el = $('#designTools'), pr = App.cur; if (!el || !pr) return;
    var html = '';
    if (App.perm('chooseLogo')) {
      html += '<h3>Logo</h3><div class="logo-pick">' + LOGOS.map(function (l) {
        return '<button type="button" data-logo="' + l[0] + '" class="' + ((pr.logo || 'auto') === l[0] ? 'on' : '') + '">' +
          (l[0] === 'auto' ? '<span class="lp-auto">✦</span>' : l[0] === 'none' ? '<span class="lp-auto">∅</span>' : '<img alt="" src="' + PP.logoSrc(l[0], '#1c1a19') + '">') + '<small>' + l[1] + '</small></button>';
      }).join('') + '</div>';
    }
    if (App.perm('editDesign')) {
      var st = pr.style || {}, base = (App.rcfg().designs || {})[pr.design] || (App.rcfg().customDesigns || []).filter(function (d) { return d.id === pr.design; })[0] || {};
      html += '<details class="box"' + (pr.style ? ' open' : '') + '><summary>Dieses Angebot anpassen</summary><p class="hint">Farben und Schriften nur für dieses Angebot. Das Design selbst bleibt unverändert.</p>' +
        '<div class="grid3"><label>Papier<input type="color" data-sty="paper" value="' + esc(st.paper || base.paper || '#ffffff') + '"></label><label>Schrift<input type="color" data-sty="ink" value="' + esc(st.ink || base.ink || '#1c1a19') + '"></label><label>Akzent<input type="color" data-sty="accent" value="' + esc(st.accent || base.accent || '#8a7f76') + '"></label></div>' +
        '<div class="grid2"><label>Schreibschrift<select data-sty="script">' + window.Studio.SCRIPTS.map(function (f) { return '<option' + (f === (st.script || base.script) ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label>' +
        '<label>Serifenschrift<select data-sty="serif">' + window.Studio.SERIFS.map(function (f) { return '<option' + (f === (st.serif || base.serif) ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label></div>' +
        '<button class="btn ghost" type="button" id="styReset">Auf Design zurücksetzen</button></details>';
    }
    if (App.perm('createDesigns') && !ADMIN) {
      html += '<h3>Eigene Designs</h3><div class="drafts">' + (App.clientDesigns || []).map(function (d, i) {
        return '<div class="draft"><div><b>' + esc(d.name || d.id) + '</b><span>' + esc(d.desc || '') + '</span></div><div class="row"><button class="btn ghost" type="button" data-cd="edit" data-i="' + i + '">Überarbeiten</button><button class="btn ghost" type="button" data-cd="del" data-i="' + i + '">✕</button></div></div>';
      }).join('') + '</div><button class="btn" type="button" id="cdNew">✦ Eigenes Design erstellen</button>';
    }
    el.innerHTML = html;
    $$('[data-logo]', el).forEach(function (b) { b.onclick = function () { pr.logo = b.dataset.logo; App.changed(); renderDesignTools(); renderGallerySoon(); }; });
    $$('[data-sty]', el).forEach(function (i) {
      i.oninput = i.onchange = function () { pr.style = pr.style || {}; pr.style[i.dataset.sty] = i.value; App.changed(); renderGallerySoon(); };
    });
    var r = $('#styReset', el); if (r) r.onclick = function () { pr.style = null; App.changed(); renderDesignTools(); renderGallerySoon(); };
    var n = $('#cdNew', el); if (n) n.onclick = function () { window.Studio.open({ onSave: saveClientDesign }); };
    $$('[data-cd]', el).forEach(function (b) {
      b.onclick = function () {
        var d = App.clientDesigns[+b.dataset.i];
        if (b.dataset.cd === 'edit') window.Studio.open({ existing: d, onSave: saveClientDesign });
        else if (UI.confirm('Design „' + (d.name || d.id) + '“ löschen?')) { App.clientDesigns.splice(+b.dataset.i, 1); persistClientDesigns(); }
      };
    });
  }
  App.renderDesignTools = renderDesignTools;
  function saveClientDesign(o, existing) {
    if (existing) Object.keys(o).forEach(function (k) { existing[k] = o[k]; });
    else {
      var old = o.id; o.id = 'k-' + o.id.replace(/^k-/, '');
      if (o.css) o.css = o.css.split('.d-' + old).join('.d-' + o.id);
      o.client = true; App.clientDesigns.push(o);
    }
    persistClientDesigns();
    App.cur.design = existing ? existing.id : o.id; App.changed();
    UI.toast('Design gespeichert');
    if (window.innerWidth < 900) setStep('preview');
  }
  var CD_PATH = 'designs/client-designs.json', cdSha = null;
  App.loadClientDesigns = function () {
    return S.IDB.get('kv', 'clientDesigns').then(function (loc) {
      App.clientDesigns = loc || [];
      if (!S.Cloud.enabled()) return App.clientDesigns;
      return S.GH.getText(S.Cloud.repo(), CD_PATH).then(function (r) {
        if (r) { cdSha = r.sha; try { App.clientDesigns = JSON.parse(r.text); } catch (e) { /* keep local */ } S.IDB.put('kv', App.clientDesigns, 'clientDesigns'); }
        return App.clientDesigns;
      }).catch(function () { return App.clientDesigns; });
    });
  };
  function persistClientDesigns() {
    applyCss(); renderGallery(); renderDesignTools(); refreshSoon();
    S.IDB.put('kv', App.clientDesigns, 'clientDesigns');
    if (S.Cloud.enabled()) {
      S.GH.put(S.Cloud.repo(), CD_PATH, S.utf8ToB64(JSON.stringify(App.clientDesigns, null, 1)), 'Eigene Designs aktualisiert', cdSha || undefined)
        .then(function (r) { cdSha = r.content.sha; }).catch(function (e) { UI.toast('Cloud: ' + e.message); });
    }
  }

  /* ================= CONTENT EDITOR ================= */
  // Generic editor for a content object (used for proposals and, in admin, for defaults).
  App.contentEditor = function (root, c, onChange, opt) {
    opt = opt || {};
    var ideas = App.cfg.textIdeas || {};
    function txt(key, lbl, rows, ideaKey) {
      var ik = ideaKey || key, list = ideas[ik] || [];
      return '<label class="fld">' + lbl + (list.length ? ' <button type="button" class="idea-btn" data-idea="' + ik + '" data-key="' + key + '">Vorschläge ▾</button>' : '') +
        (rows ? '<textarea data-k="' + key + '" rows="' + rows + '"></textarea>' : '<input data-k="' + key + '">') + '</label><div class="ideas hide" data-for="' + key + '"></div>';
    }
    function lines(key, lbl, hint) { return '<label>' + lbl + ' <small>' + (hint || 'eine Zeile pro Punkt') + '</small><textarea data-l="' + key + '" rows="5"></textarea></label>'; }
    var sec = c.sections = c.sections || {};
    var SEC = [['about', 'Über mich'], ['packages', 'Pakete'], ['details', 'Leistungen & Lieferung'], ['timeline', 'Ablauf'], ['thanks', 'Investition & Danke']];
    root.innerHTML =
      '<details class="box" open><summary>Seiten &amp; Titel</summary><div class="toggles">' +
        SEC.map(function (s) { return '<label class="switch"><input type="checkbox" data-sec="' + s[0] + '"' + (sec[s[0]] !== false ? ' checked' : '') + '><span>' + s[1] + '</span></label>'; }).join('') +
        '</div>' + txt('title', 'Titel') + txt('subtitle', 'Untertitel (Editorial)') + '</details>' +
      '<details class="box"' + (opt.openIntro ? ' open' : '') + '><summary>Begrüßung</summary>' + txt('intro', 'Begrüßungstext', 6) + '</details>' +
      '<details class="box"><summary>Über mich</summary>' + txt('aboutTitle', 'Überschrift') + txt('about', 'Text', 7) + txt('signature', 'Unterschrift') + '</details>' +
      '<details class="box"' + (opt.openPackages ? ' open' : '') + '><summary>Pakete &amp; Preise</summary>' + txt('packagesTitle', 'Überschrift') + txt('packagesIntro', 'Einleitung', 3) +
        txt('featuredLabel', 'Text für empfohlenes Paket') +
        txt('packagesTitleSingle', 'Überschrift bei nur einem Paket') + txt('packagesIntroSingle', 'Einleitung bei nur einem Paket', 2) + '<div id="pkList"></div><button class="btn ghost" type="button" id="pkAdd">+ Paket hinzufügen</button></details>' +
      '<details class="box"><summary>Leistungen &amp; Lieferung</summary>' + txt('servicesTitle', 'Überschrift Leistungen') + lines('services', 'Leistungen') +
        txt('deliveryTitle', 'Überschrift Lieferung') + lines('delivery', 'Lieferung') + '</details>' +
      '<details class="box"><summary>Ablauf</summary>' + txt('timelineTitle', 'Überschrift') + lines('timeline', 'Ablauf', 'eine Zeile pro Punkt: „14:00 Trauung“') + '</details>' +
      '<details class="box"><summary>Investition &amp; Danke</summary>' + txt('paymentTitle', 'Überschrift Investition') + txt('payment', 'Zahlungsbedingungen', 3) +
        '<label>Gültigkeit (Tage)<input type="number" min="1" data-n="validDays"></label>' + txt('validity', 'Gültigkeitssatz ({gueltig} = Datum)') +
        txt('thanksTitle', 'Danke-Überschrift') + txt('thanks', 'Danke-Text', 4) + '</details>' +
      '<p class="hint">Platzhalter: {name1} {name2} {namen} {datum} {ort} {studio} {owner} {gueltig}</p>';

    $$('[data-k]', root).forEach(function (i) { i.value = c[i.dataset.k] || ''; i.oninput = function () { c[i.dataset.k] = i.value; onChange(); }; });
    $$('[data-n]', root).forEach(function (i) { i.value = c[i.dataset.n] || ''; i.oninput = function () { c[i.dataset.n] = +i.value || 0; onChange(); }; });
    $$('[data-sec]', root).forEach(function (i) { i.onchange = function () { sec[i.dataset.sec] = i.checked; onChange(); }; });
    $$('[data-l]', root).forEach(function (i) {
      var k = i.dataset.l;
      i.value = k === 'timeline' ? (c.timeline || []).map(function (t) { return (t.time || '') + ' ' + (t.label || ''); }).join('\n') : (c[k] || []).join('\n');
      i.oninput = function () {
        var arr = i.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        c[k] = k === 'timeline' ? arr.map(function (x) { var m = x.match(/^(\S+)\s+(.*)$/); return m ? { time: m[1], label: m[2] } : { time: '', label: x }; }) : arr;
        onChange();
      };
    });
    // text ideas
    $$('.idea-btn', root).forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var box = root.querySelector('.ideas[data-for="' + b.dataset.key + '"]'), list = (App.cfg.textIdeas || {})[b.dataset.idea] || [];
        if (!box.classList.contains('hide')) { box.classList.add('hide'); return; }
        box.innerHTML = list.map(function (it, i) { return '<button type="button" data-i="' + i + '"><b>' + esc(it.label) + '</b><span>' + esc(it.text) + '</span></button>'; }).join('');
        box.classList.remove('hide');
        box.onclick = function (ev) {
          var x = ev.target.closest('[data-i]'); if (!x) return;
          var field = root.querySelector('[data-k="' + b.dataset.key + '"]');
          field.value = list[+x.dataset.i].text; c[b.dataset.key] = field.value; onChange(); box.classList.add('hide');
        };
      };
    });
    // packages
    function drawPk() {
      var el = $('#pkList', root);
      el.innerHTML = (c.packages || []).map(function (p, i) {
        return '<div class="lst-item" data-i="' + i + '"><div class="lst-head"><b>' + esc(p.name || 'Paket') + '</b><div class="row">' +
          '<button class="btn ghost" data-a="up" type="button" title="Nach oben">↑</button><button class="btn ghost" data-a="del" type="button" title="Löschen">✕</button></div></div>' +
          '<div class="grid3"><label>Name<input data-p="name"></label><label>Dauer<input data-p="hours"></label><label>Preis<input data-p="price"></label></div>' +
          '<label>Leistungen <small>eine Zeile pro Punkt</small><textarea data-p="items" rows="4"></textarea></label>' +
          '<div class="row"><label class="switch"><input type="checkbox" data-p="show"><span>Anzeigen</span></label><label class="switch"><input type="checkbox" data-p="featured"><span>Empfohlen</span></label></div></div>';
      }).join('');
      $$('.lst-item', el).forEach(function (it) {
        var p = c.packages[+it.dataset.i];
        $$('[data-p]', it).forEach(function (f) {
          var k = f.dataset.p;
          if (f.type === 'checkbox') { f.checked = k === 'show' ? p.show !== false : !!p[k]; f.onchange = function () { p[k] = f.checked; onChange(); }; }
          else if (k === 'items') { f.value = (p.items || []).join('\n'); f.oninput = function () { p.items = f.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); onChange(); }; }
          else { f.value = p[k] || ''; f.oninput = function () { p[k] = f.value; it.querySelector('.lst-head b').textContent = p.name || 'Paket'; onChange(); }; }
        });
        $$('[data-a]', it).forEach(function (b) {
          b.onclick = function () {
            var i = +it.dataset.i;
            if (b.dataset.a === 'del' && UI.confirm('Paket „' + (p.name || '') + '“ entfernen?')) c.packages.splice(i, 1);
            if (b.dataset.a === 'up' && i > 0) c.packages.splice(i - 1, 0, c.packages.splice(i, 1)[0]);
            drawPk(); onChange();
          };
        });
      });
    }
    $('#pkAdd', root).onclick = function () { c.packages = c.packages || []; c.packages.push({ name: 'Neues Paket', hours: '', price: '', items: [], show: true, featured: false }); drawPk(); onChange(); };
    drawPk();
  };
  function renderContentEditor() {
    if (!App.cur) return;
    App.contentEditor($('#contentEditor'), App.cur.content, App.changed, { openIntro: true, openPackages: true });
  }
  $('#resetContent').onclick = function () {
    if (!UI.confirm('Alle Texte dieses Angebots durch die aktuellen Standardtexte ersetzen?')) return;
    App.cur.content = clone(App.cfg.defaults); renderContentEditor(); App.changed();
  };

  /* ================= MESSAGES ================= */
  function renderMsgEditor() {
    var pr = App.cur, el = $('#msgEditor'); if (!pr || !el) return;
    var m = App.cfg.messages || {}, ideas = App.cfg.textIdeas || {};
    pr.msg = pr.msg || {};
    function ideasBtn(k) { return (ideas[k] || []).length ? ' <button type="button" class="idea-btn" data-idea="' + k + '">Vorschläge ▾</button>' : ''; }
    el.innerHTML =
      '<label>Nachricht (WhatsApp / Teilen)' + ideasBtn('whatsapp') + '<textarea id="msgText" rows="4"></textarea></label><div class="ideas hide" data-for="whatsapp"></div>' +
      '<label>E-Mail-Betreff<input id="mailSubject"></label>' +
      '<label>E-Mail-Text' + ideasBtn('emailBody') + '<textarea id="mailBody" rows="7"></textarea></label><div class="ideas hide" data-for="emailBody"></div>';
    var v = PP.vars(pr, App.cfg);
    var f = { whatsapp: $('#msgText'), emailSubject: $('#mailSubject'), emailBody: $('#mailBody') };
    Object.keys(f).forEach(function (k) {
      f[k].value = pr.msg[k] != null ? pr.msg[k] : PP.fmt(m[k] || '', v);
      f[k].oninput = function () { pr.msg[k] = f[k].value; saveSoon(); };
    });
    $$('.idea-btn', el).forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var k = b.dataset.idea, box = el.querySelector('.ideas[data-for="' + k + '"]'), list = ideas[k] || [];
        if (!box.classList.contains('hide')) { box.classList.add('hide'); return; }
        box.innerHTML = list.map(function (it, i) { return '<button type="button" data-i="' + i + '"><b>' + esc(it.label) + '</b><span>' + esc(PP.fmt(it.text, PP.vars(pr, App.cfg))) + '</span></button>'; }).join('');
        box.classList.remove('hide');
        box.onclick = function (ev) {
          var x = ev.target.closest('[data-i]'); if (!x) return;
          var field = k === 'whatsapp' ? f.whatsapp : f.emailBody;
          field.value = PP.fmt(list[+x.dataset.i].text, PP.vars(pr, App.cfg)); pr.msg[k] = field.value; saveSoon(); box.classList.add('hide');
        };
      };
    });
  }
  App.renderMsgEditor = renderMsgEditor;

  /* ================= MANAGER (proposals, status, versions) ================= */
  App.openManager = function () {
    var filter = 'active', q = '';
    var box = UI.modal('<h2>Angebote</h2><div class="row"><button class="btn" id="mNew" type="button">+ Neues Angebot</button>' +
      (S.Cloud.enabled() ? '<button class="btn ghost" id="mSync" type="button">☁ Abgleichen</button>' : '') + '<button class="btn ghost" id="mClose" type="button">Schließen</button></div>' +
      '<div class="row mgr-filter"><select id="mF"><option value="active">Aktiv</option><option value="all">Alle</option>' + STATUS.map(function (s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('') + '</select>' +
      '<input id="mQ" placeholder="Suchen (Namen, Ort) …" style="flex:1;min-width:140px"></div><div class="mgr-stats" id="mStats"></div><div class="drafts" id="mList"></div>' +
      '<div class="cloud-info">' + cloudInfo() + '</div>', { wide: true });
    function draw() {
      S.IDB.all('proposals').then(function (l) {
        var stats = {}; l.forEach(function (p) { stats[p.status] = (stats[p.status] || 0) + 1; });
        $('#mStats', box).innerHTML = STATUS.filter(function (s) { return stats[s.id]; }).map(function (s) { return chip(s.id) + ' ' + stats[s.id]; }).join(' &nbsp; ');
        l = l.filter(function (p) {
          if (filter === 'active' && (p.status === 'archived' || p.status === 'declined')) return false;
          if (filter !== 'active' && filter !== 'all' && p.status !== filter) return false;
          return !q || (label(p) + ' ' + (p.venue || '')).toLowerCase().indexOf(q) >= 0;
        }).sort(function (a, b) { return b.updated - a.updated; });
        $('#mList', box).innerHTML = l.length ? l.map(function (p) {
          return '<div class="draft' + (App.cur && App.cur.id === p.id ? ' on' : '') + '" data-id="' + p.id + '"><div><b>' + esc(label(p)) + '</b>' +
            '<span>' + chip(p.status) + ' ' + esc(PP.dateShort(p.date) || 'kein Datum') + (p.venue ? ' · ' + esc(p.venue) : '') + ' · ' + (p.versions || []).length + ' Versionen · ' + when(p.updated) + '</span></div>' +
            '<div class="row"><button class="btn" data-a="open" type="button">Öffnen</button><button class="btn ghost" data-a="hist" type="button">Verlauf</button></div></div>';
        }).join('') : '<p class="hint">Keine Angebote in dieser Ansicht.</p>';
      });
    }
    $('#mF', box).onchange = function (e) { filter = e.target.value; draw(); };
    $('#mQ', box).oninput = function (e) { q = e.target.value.trim().toLowerCase(); draw(); };
    $('#mNew', box).onclick = function () { UI.close(); App.chooseNew(); };
    $('#mClose', box).onclick = UI.close;
    var sy = $('#mSync', box); if (sy) sy.onclick = function () { var b = UI.busy('Abgleich …'); App.syncProposals().then(function () { b.done(); draw(); }); };
    bindCloudInfo(box);
    $('#mList', box).onclick = function (e) {
      var b = e.target.closest('[data-a]'), it = e.target.closest('.draft'); if (!b || !it) return;
      S.IDB.get('proposals', it.dataset.id).then(function (p) {
        if (b.dataset.a === 'open') { UI.close(); App.open(p); setStep(window.innerWidth < 900 ? 'data' : 'design'); }
        else App.openHistory(p);
      });
    };
    draw();
  };

  App.openHistory = function (pr) {
    var box = UI.modal('<h2>' + esc(label(pr)) + '</h2><div class="row">' + chip(pr.status) + '<select id="hSt">' +
      STATUS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === pr.status ? ' selected' : '') + '>' + s.name + '</option>'; }).join('') + '</select></div>' +
      (pr.note ? '<p class="hint">Notiz: ' + esc(pr.note) + '</p>' : '') +
      '<h3>Versionen</h3><div class="drafts" id="hVer"></div><h3>Verlauf</h3><div class="log" id="hLog"></div>' +
      '<div class="row"><button class="btn" id="hOpen" type="button">Öffnen</button><button class="btn ghost" id="hDup" type="button">Duplizieren</button>' +
      '<button class="btn ghost" id="hBack" type="button">Zurück</button><button class="btn danger" id="hDel" type="button">Löschen</button></div>', { wide: true });
    function draw() {
      $('#hVer', box).innerHTML = (pr.versions || []).length ? pr.versions.map(function (v, i) {
        return '<div class="draft" data-i="' + i + '"><div><b>Version ' + v.n + '</b><span>' + when(v.at) + (v.note ? ' · ' + esc(v.note) : '') + ' · ' + esc(PP.getDesigns(App.rcfg()).filter(function (d) { return d.id === v.snap.design; }).map(function (d) { return d.name; })[0] || v.snap.design) + '</span></div>' +
          '<div class="row"><button class="btn ghost" data-a="pdf" type="button">PDF</button><button class="btn ghost" data-a="restore" type="button">Wiederherstellen</button></div></div>';
      }).join('') : '<p class="hint">Noch keine Versionen. Versionen entstehen automatisch beim Senden oder über „Version sichern“.</p>';
      $('#hLog', box).innerHTML = (pr.log || []).map(function (l) { return '<div><span>' + when(l.at) + '</span> ' + esc(l.text) + '</div>'; }).join('');
    }
    $('#hSt', box).onchange = function (e) { App.setStatus(pr, e.target.value); App.save(pr, true).then(function () { if (App.cur && App.cur.id === pr.id) { App.cur = pr; drawCurbar(); } App.openHistory(pr); }); };
    $('#hVer', box).onclick = function (e) {
      var b = e.target.closest('[data-a]'), it = e.target.closest('[data-i]'); if (!b || !it) return;
      var v = pr.versions[+it.dataset.i];
      if (b.dataset.a === 'restore' && UI.confirm('Version ' + v.n + ' wiederherstellen? Der aktuelle Stand wird vorher als Version gesichert.')) {
        App.restoreVersion(pr, v); App.save(pr).then(function () { UI.close(); App.open(pr); UI.toast('Version ' + v.n + ' wiederhergestellt'); });
      }
      if (b.dataset.a === 'pdf') {
        var tmp = Object.assign(clone(pr), clone(v.snap));
        App.buildPdf(tmp).then(function (blob) { downloadBlob(blob, pdfName(tmp).replace('.pdf', '_V' + v.n + '.pdf')); });
      }
    };
    $('#hOpen', box).onclick = function () { UI.close(); App.open(pr); };
    $('#hDup', box).onclick = function () { UI.close(); App.duplicate(pr).then(function () { UI.toast('Kopie angelegt'); }); };
    $('#hBack', box).onclick = App.openManager;
    $('#hDel', box).onclick = function () {
      if (!UI.confirm('Angebot „' + label(pr) + '“ endgültig löschen' + (S.Cloud.enabled() ? ' (auch in der Cloud)' : '') + '?')) return;
      App.remove(pr).then(function () {
        if (App.cur && App.cur.id === pr.id) S.IDB.all('proposals').then(function (l) { if (l[0]) App.open(l[0]); else App.newProposal(); });
        App.openManager();
      });
    };
    draw();
  };
  $('#mgrBtn').onclick = App.openManager;
  $('#brand').onclick = function () {
    var cl = App.cfg.changelog || [];
    UI.modal('<div class="install-hero"><img src="assets/icons/icon-192.png" alt=""><h2>Angebots-Studio</h2><p class="hint">Version ' + esc(App.cfg.appVersion || '1.0') + '</p></div>' +
      '<h3>Neuigkeiten</h3><div class="log">' + cl.map(function (c) { return '<div><span>v' + esc(c.version) + ' · ' + esc(c.date) + '</span> ' + esc((c.notes || []).join(' · ')) + '</div>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn ghost" type="button" onclick="UI.close()">Schließen</button>' + (!ADMIN ? '' : '') + '</div>');
  };

  function cloudInfo() {
    if (S.Cloud.enabled()) return '☁ Cloud verbunden (' + esc(S.Cloud.repo()) + ') – Angebote und Fotos sind auf allen Geräten verfügbar. <button class="btn mini" type="button" id="cloudOff">Trennen</button>';
    if (ADMIN) return 'Angebote werden auf diesem Gerät gespeichert. Cloud im Entwickler-Bereich verbinden.';
    return 'Angebote werden auf diesem Gerät gespeichert. <b>Cloud verbinden:</b> Verbindungs-Link öffnen oder hier einfügen:' +
      '<div class="row"><input id="cloudCode" placeholder="Link oder Code einfügen" style="flex:1"><button class="btn mini" type="button" id="cloudOn">Verbinden</button>' +
      (App.cfg.cloudVault ? '<button class="btn mini" type="button" id="cloudPw">Mit Passwort verbinden</button>' : '') + '</div>';
  }
  function bindCloudInfo(box) {
    var pw = $('#cloudPw', box); if (pw) pw.onclick = function () { UI.close(); App.askVault(true); };
    var on = $('#cloudOn', box);
    if (on) on.onclick = function () {
      var v = $('#cloudCode', box).value.trim(), m = v.match(/connect=([^&\s]+)/);
      if (applyConnect(m ? m[1] : v)) { UI.close(); App.syncProposals(); App.loadClientDesigns().then(function () { App.setConfig(App.cfg); }); App.loadFavs(); Photos.sync().catch(function () { /* ignore */ }); }
    };
    var b = $('#cloudOff', box);
    if (b) b.onclick = function () {
      if (!UI.confirm('Cloud-Verbindung auf diesem Gerät trennen? Lokale Daten bleiben erhalten.')) return;
      var s = S.ghSettings(); s.token = ''; S.saveGhSettings(s); UI.close(); UI.toast('Cloud getrennt');
    };
  }

  /* ================= EXPORT ================= */
  var LIB = {
    h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };
  var libP = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Bibliothek konnte nicht geladen werden (Internet?)')); }; document.head.appendChild(s); }); }
  function libs() { return libP || (libP = Promise.all([loadScript(LIB.h2c), loadScript(LIB.jspdf)]).catch(function (e) { libP = null; throw e; })); }

  function pdfName(pr) {
    var n = ('Hochzeitsangebot_' + (pr.name1 || '') + (pr.name2 ? '_' + pr.name2 : '') + (pr.date ? '_' + pr.date : '')).replace(/[^\wäöüÄÖÜß\-]+/g, '_');
    return n + '.pdf';
  }
  App.pdfName = pdfName;

  // Render pages unscaled off-screen and rasterise them.
  function renderCanvases(pr, scale) {
    return libs().then(function () { return PP.prepare(App.rcfg(), pr.style); }).then(function () { return photoMap(pr, 2000); }).then(function (ph) {
      var root = $('#exportRoot');
      root.innerHTML = PP.render(pr, App.rcfg(), ph);
      return (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
        fit(root);
        var imgs = $$('img', root).map(function (i) { return i.decode ? i.decode().catch(function () { /* ignore */ }) : null; });
        return Promise.all(imgs);
      }).then(function () {
        var pages = $$('.page', root), out = [];
        return pages.reduce(function (p, pg) {
          return p.then(function () {
            return window.html2canvas(pg, { scale: scale || 2, useCORS: true, backgroundColor: null, logging: false, width: 794, height: 1123, windowWidth: 1200 })
              .then(function (c) { out.push(c); });
          });
        }, Promise.resolve()).then(function () { root.innerHTML = ''; return out; });
      });
    });
  }

  App.renderCanvases = renderCanvases;
  var pdfCache = { key: '', blob: null, cover: null, p: null };
  function cacheKey(pr) { return JSON.stringify(snapshot(pr)) + JSON.stringify(App.cfg.designs || {}) + JSON.stringify(App.rcfg().customDesigns); }
  App.buildPdf = function (pr) {
    pr = pr || App.cur;
    var key = cacheKey(pr);
    if (pr === App.cur && pdfCache.key === key && (pdfCache.blob || pdfCache.p)) return pdfCache.blob ? Promise.resolve(pdfCache.blob) : pdfCache.p;
    var p = renderCanvases(pr, 2).then(function (cs) {
      var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      cs.forEach(function (c, i) { if (i) pdf.addPage(); pdf.addImage(c.toDataURL('image/jpeg', .9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST'); });
      var blob = pdf.output('blob');
      if (pr === App.cur) { pdfCache.cover = cs[0]; pdfCache.blob = blob; pdfCache.p = null; }
      return blob;
    });
    if (pr === App.cur) { pdfCache = { key: key, blob: null, cover: null, p: p }; p.catch(function () { pdfCache = { key: '', blob: null, cover: null, p: null }; }); }
    return p;
  };
  function prepareExport() {
    if (!App.cur) return;
    var st = $('#sendStatus'); st.className = 'status'; st.textContent = 'PDF wird vorbereitet …';
    App.buildPdf().then(function (b) { st.textContent = 'PDF bereit (' + Math.round(b.size / 1024) + ' KB, ' + pdfName(App.cur) + ')'; })
      .catch(function (e) { st.className = 'status err'; st.textContent = 'PDF-Fehler: ' + e.message; });
    var canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }));
    $('#sShare').classList.toggle('hide', !canShare);
    $('#sWaSub').textContent = isMobile() && canShare ? 'PDF über das Teilen-Menü an WhatsApp senden' : 'PDF wird gespeichert, WhatsApp öffnet sich mit der Nachricht – PDF dort anhängen';
  }
  function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function downloadBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  App.downloadBlob = downloadBlob;

  function markSent(channel) {
    var pr = App.cur;
    App.saveVersion(pr, 'gesendet per ' + channel);
    App.log(pr, 'send', 'Versendet per ' + channel);
    if (pr.status === 'draft' || pr.status === 'ready') App.setStatus(pr, 'sent');
    App.save();
  }
  function withPdf(btn, fn) {
    var st = $('#sendStatus'), old = btn.innerHTML;
    btn.disabled = true; st.className = 'status'; st.textContent = 'PDF wird erstellt …';
    return App.buildPdf().then(function (blob) { btn.disabled = false; return fn(blob); })
      .catch(function (e) { btn.disabled = false; btn.innerHTML = old; st.className = 'status err'; st.textContent = 'Fehler: ' + e.message; });
  }
  // Android/iOS only open the share sheet when navigator.share() runs *directly* inside a tap.
  // So: never await anything before calling it. If the PDF is not ready, build it and ask for a second tap.
  function shareFile(blob) {
    var safe = pdfName(App.cur).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^\w.\-]+/g, '_');
    return new File([blob], safe, { type: 'application/pdf' });
  }
  function shareNow(blob, text, channel) {          // must be called synchronously from a click handler
    var p;
    try { p = navigator.share({ files: [shareFile(blob)], text: text }); }
    catch (e) { p = Promise.reject(e); }
    return p.then(function () { markSent(channel); return true; }).catch(function (e) {
      if (e && e.name === 'AbortError') return false;   // user closed the share sheet
      shareFallback(blob, text, channel, e);
      return false;
    });
  }
  // Share sheet blocked by the device/browser: save the PDF and open WhatsApp with the message.
  function shareFallback(blob, text, channel, err) {
    console.warn('share failed', err);
    var box = UI.modal('<h2>Teilen-Menü nicht verfügbar</h2><p class="hint">Dein Gerät hat das direkte Teilen blockiert' + (err && err.message ? ' (' + esc(err.message) + ')' : '') +
      '. Alternative: Das PDF wird gespeichert und WhatsApp öffnet sich mit der Nachricht – dort mit 📎 das PDF aus „Downloads“ anhängen.</p>' +
      '<div class="row"><button class="btn" id="fbGo" type="button">PDF speichern &amp; WhatsApp öffnen</button><button class="btn ghost" id="fbX" type="button">Abbrechen</button></div>');
    $('#fbGo', box).onclick = function () {
      UI.close(); downloadBlob(blob, shareFile(blob).name);
      window.open('https://wa.me/' + (waNumber(App.cur.clientPhone) || '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      $('#sendStatus').textContent = 'PDF gespeichert – in WhatsApp mit 📎 anhängen.'; markSent(channel);
    };
    $('#fbX', box).onclick = UI.close;
  }
  function readyPdf() { return pdfCache.blob && pdfCache.key === cacheKey(App.cur) ? pdfCache.blob : null; }
  function shareFlow(btn, channel) {
    var text = $('#msgText').value, ready = readyPdf();
    if (ready) { shareNow(ready, text, channel); return; }      // direct: still inside the tap
    withPdf(btn, function (b) {
      var box = UI.modal('<h2>PDF ist fertig</h2><p class="hint">Tippe auf „' + (channel === 'WhatsApp' ? 'An WhatsApp senden' : 'Jetzt teilen') + '“ und wähle ' +
        (channel === 'WhatsApp' ? 'im Teilen-Menü WhatsApp und dann den Chat.' : 'die App.') + '</p><div class="row"><button class="btn" id="shNow" type="button">' +
        (channel === 'WhatsApp' ? 'An WhatsApp senden' : 'Jetzt teilen') + '</button><button class="btn ghost" id="shX" type="button">Abbrechen</button></div>');
      $('#shNow', box).onclick = function () { shareNow(b, text, channel); UI.close(); };
      $('#shX', box).onclick = UI.close;
    });
  }
  function needsTap() { return !pdfCache.blob || pdfCache.key !== cacheKey(App.cur); }
  function waNumber(n) {
    n = String(n || '').replace(/[^\d+]/g, '');
    if (n.indexOf('+') === 0) return n.slice(1);
    if (n.indexOf('00') === 0) return n.slice(2);
    if (n.indexOf('0') === 0) return (App.cfg.studio.countryCode || '43') + n.slice(1);
    return n;
  }

  $('#sTpl').onclick = function () { App.saveAsTemplate(); };
  $('#sPdf').onclick = function () { withPdf(this, function (b) { downloadBlob(b, pdfName(App.cur)); App.log(App.cur, 'export', 'PDF heruntergeladen'); App.save(); $('#sendStatus').textContent = 'PDF gespeichert.'; }); };
  $('#sWa').onclick = function () {
    var text = $('#msgText').value, btn = this;
    var canShare = navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
    if (isMobile() && canShare) {
      shareFlow(btn, 'WhatsApp');
    } else {
      withPdf(btn, function (b) {
        downloadBlob(b, pdfName(App.cur));
        var num = waNumber(App.cur.clientPhone);
        window.open('https://wa.me/' + (num || '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        $('#sendStatus').textContent = 'PDF wurde gespeichert. Ziehe es in den WhatsApp-Chat oder hänge es mit 📎 an.';
        markSent('WhatsApp');
      });
    }
  };
  $('#sShare').onclick = function () { shareFlow(this, 'Teilen'); };
  $('#sMail').onclick = function () {
    var pr = App.cur;
    location.href = 'mailto:' + encodeURIComponent(pr.clientEmail || '') + '?subject=' + encodeURIComponent($('#mailSubject').value) + '&body=' + encodeURIComponent($('#mailBody').value);
    App.log(pr, 'export', 'Mail-App geöffnet'); App.save();
  };

  /* ---------- HTML e-mail ---------- */
  function logoPng(kind, w) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var r = img.naturalHeight / img.naturalWidth || .6, c = document.createElement('canvas'); c.width = w * 2; c.height = Math.round(w * 2 * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res({ url: c.toDataURL('image/png'), w: w, h: Math.round(w * r) });
      };
      img.onerror = function () { res(null); };
      img.src = PP.logoSrc(kind, '#1c1a19');
    });
  }
  function coverJpeg() {
    var c = pdfCache.cover; if (!c) return null;
    var w = 600, h = Math.round(w * c.height / c.width), o = document.createElement('canvas'); o.width = w * 2; o.height = h * 2;
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/jpeg', .85), w: w, h: h };
  }
  function mailHTML(pr, img) {
    var cfg = App.cfg, s = cfg.studio || {}, c = pr.content || {}, v = PP.vars(pr, cfg);
    var ds = (cfg.designs || {})[pr.design] || {}, ink = ds.ink || '#1c1a19', accent = ds.accent || '#8a7f76', paper = ds.paper || '#ffffff';
    var font = "Georgia,'Times New Roman',serif", sans = "Helvetica,Arial,sans-serif";
    var body = esc($('#mailBody').value).split(/\n\s*\n/).map(function (p) { return '<p style="margin:0 0 14px;font:15px/1.6 ' + sans + ';color:' + ink + '">' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
    var pk = (c.sections || {}).packages === false ? [] : PP.shownPackages(c);
    var pkRows = pk.map(function (p) {
      return '<tr><td style="padding:10px 0;border-bottom:1px solid #e8e2dc;font:15px ' + font + ';color:' + ink + '">' + esc(p.name) + (p.featured && pk.length > 1 ? ' <span style="font:11px ' + sans + ';color:' + accent + ';letter-spacing:1px;text-transform:uppercase">· ' + esc(c.featuredLabel || 'Empfehlung') + '</span>' : '') +
        '<br><span style="font:12px ' + sans + ';color:#8a817a">' + esc(p.hours || '') + '</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #e8e2dc;font:16px ' + font + ';color:' + ink + '">' + esc(p.price || '') + '</td></tr>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:#f3efeb">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efeb"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:' + paper + '">' +
      (img.logo ? '<tr><td align="center" style="padding:28px 0 18px"><img src="' + img.logo.src + '" width="' + img.logo.w + '" height="' + img.logo.h + '" alt="' + esc(s.name) + '" style="display:block;border:0"></td></tr>' : '') +
      (img.cover ? '<tr><td><img src="' + img.cover.src + '" width="600" alt="' + esc(c.title) + '" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>' : '') +
      '<tr><td style="padding:30px 40px 10px">' + body + '</td></tr>' +
      '<tr><td style="padding:0 40px 10px"><p style="margin:0 0 4px;font:11px ' + sans + ';letter-spacing:2px;text-transform:uppercase;color:' + accent + '">Eure Hochzeit</p>' +
      '<p style="margin:0 0 18px;font:18px ' + font + ';color:' + ink + '">' + esc(v.datum) + (pr.venue ? ' · ' + esc(pr.venue) : '') + '</p>' +
      (pkRows ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + pkRows + '</table>' : '') + '</td></tr>' +
      '<tr><td style="padding:18px 40px 30px"><p style="margin:0;font:13px/1.6 ' + sans + ';color:#8a817a">Das vollständige Angebot findet ihr als PDF im Anhang.</p></td></tr>' +
      '<tr><td align="center" style="padding:20px 40px 28px;border-top:1px solid #e8e2dc;font:12px/1.8 ' + sans + ';color:#8a817a">' +
      esc([s.owner, s.phone, s.email, s.web].filter(Boolean).join('  ·  ')) + '</td></tr></table></td></tr></table></body></html>';
  }
  function wrap76(b64) { return b64.replace(/(.{76})/g, '$1\r\n'); }
  function mimeWord(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + S.utf8ToB64(s) + '?='; }

  $('#sEml').onclick = function () {
    var pr = App.cur;
    withPdf(this, function (pdf) {
      return Promise.all([S.blobToB64(pdf), logoPng('full', 150)]).then(function (r) {
        var pdfB64 = r[0], logo = r[1], cover = coverJpeg();
        var html = mailHTML(pr, { logo: logo ? { src: 'cid:logo', w: logo.w, h: logo.h } : null, cover: cover ? { src: 'cid:cover' } : null });
        var B1 = '=_m' + S.uid(), B2 = '=_r' + S.uid(), B3 = '=_a' + S.uid(), NL = '\r\n';
        var parts = [
          'X-Unsent: 1', 'To: ' + (pr.clientEmail || ''), 'Subject: ' + mimeWord($('#mailSubject').value), 'MIME-Version: 1.0',
          'Content-Type: multipart/mixed; boundary="' + B1 + '"', '', '--' + B1,
          'Content-Type: multipart/related; boundary="' + B2 + '"', '', '--' + B2,
          'Content-Type: multipart/alternative; boundary="' + B3 + '"', '', '--' + B3,
          'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(S.utf8ToB64($('#mailBody').value)), '--' + B3,
          'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(S.utf8ToB64(html)), '--' + B3 + '--'
        ];
        if (logo) parts.push('--' + B2, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64', 'Content-ID: <logo>', 'Content-Disposition: inline; filename="logo.png"', '', wrap76(logo.url.split(',')[1]));
        if (cover) parts.push('--' + B2, 'Content-Type: image/jpeg', 'Content-Transfer-Encoding: base64', 'Content-ID: <cover>', 'Content-Disposition: inline; filename="titel.jpg"', '', wrap76(cover.url.split(',')[1]));
        parts.push('--' + B2 + '--', '--' + B1,
          'Content-Type: application/pdf; name="' + pdfName(pr).replace(/[^\x20-\x7e]/g, '_') + '"', 'Content-Transfer-Encoding: base64',
          'Content-Disposition: attachment; filename="' + pdfName(pr).replace(/[^\x20-\x7e]/g, '_') + '"', '', wrap76(pdfB64), '--' + B1 + '--', '');
        downloadBlob(new Blob([parts.join(NL)], { type: 'message/rfc822' }), pdfName(pr).replace(/\.pdf$/, '.eml'));
        $('#sendStatus').textContent = 'E-Mail-Entwurf gespeichert – Datei öffnen, Empfänger prüfen, Senden.';
        markSent('E-Mail');
      });
    });
  };
  $('#sCopy').onclick = function () {
    var pr = App.cur;
    withPdf(this, function () {
      return logoPng('full', 150).then(function (logo) {
        var cover = coverJpeg();
        var html = mailHTML(pr, { logo: logo ? { src: logo.url, w: logo.w, h: logo.h } : null, cover: cover ? { src: cover.url } : null });
        var done = function () { $('#sendStatus').textContent = 'Formatierte E-Mail kopiert – im Mailprogramm einfügen und das PDF anhängen.'; App.log(pr, 'export', 'E-Mail-HTML kopiert'); App.save(); };
        if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
          return navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([$('#mailBody').value], { type: 'text/plain' }) })]).then(done);
        }
        var d = document.createElement('div'); d.contentEditable = 'true'; d.innerHTML = html; document.body.appendChild(d);
        var r = document.createRange(); r.selectNodeContents(d); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        document.execCommand('copy'); d.remove(); done();
      });
    });
  };

  /* ================= PWA / INSTALL ================= */
  var deferredPrompt = null;
  function standalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  var SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  var DOTS_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  App.showInstall = function () {
    var ua = navigator.userAgent, ios = isIOS(), inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua);
    var samsung = /SamsungBrowser/i.test(ua) && !ios;
    var chromeUrl = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
    var steps;
    if (samsung) steps = '<li><b>Empfohlen:</b> Tippe unten auf <b>„In Chrome öffnen“</b> und installiere die App dort über ' + DOTS_ICON + ' → <b>„App installieren“</b>. ' +
      '(Die Installation über Samsung Internet wird von Google Play Protect als „unsichere App“ blockiert.)</li>' +
      '<li><b>Oder hier in Samsung Internet:</b> Menü ☰ unten rechts → <b>„Seite hinzufügen zu“</b> → <b>„Startbildschirm“</b>. Das legt nur ein Symbol an und wird nicht blockiert.</li>';
    else if (inApp) steps = '<li>Du hast den Link in einer App (z. B. WhatsApp/Instagram) geöffnet. Tippe oben auf ' + DOTS_ICON + ' bzw. „…“ und wähle <b>' + (ios ? 'In Safari öffnen' : 'Im Browser öffnen') + '</b>.</li><li>Danach erscheint diese Anleitung dort erneut.</li>';
    else if (ios) steps = '<li>Tippe auf <b>Teilen</b> ' + SHARE_ICON + ' (Safari: unten in der Mitte · Chrome: oben rechts).</li>' +
      '<li>Scrolle nach unten und wähle <b>„Zum Home-Bildschirm“</b> ' + PLUS_ICON + '.</li><li>Tippe oben rechts auf <b>„Hinzufügen“</b> – fertig! Die App findest du jetzt auf deinem Home-Bildschirm.</li>';
    else if (deferredPrompt) steps = '<li>Tippe unten auf <b>„Jetzt installieren“</b>.</li><li>Bestätige mit <b>„Installieren“</b> – die App erscheint auf deinem Startbildschirm.</li>';
    else steps = '<li>Tippe oben rechts auf das Menü ' + DOTS_ICON + '.</li><li>Wähle <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b>.</li><li>Bestätige mit <b>„Installieren“</b> bzw. <b>„Hinzufügen“</b>.</li>';
    var box = UI.modal('<div class="install-hero"><img src="assets/icons/icon-192.png" alt=""><h2>Als App speichern</h2>' +
      '<p class="hint">Speichere das Angebots-Studio auf deinem ' + (ios ? 'iPhone' : (isMobile() ? 'Handy' : 'Computer')) + ' – dann öffnet es sich wie eine echte App, im Vollbild und mit einem Tipp.</p></div>' +
      '<ol class="install-steps">' + steps + '</ol><div class="row">' + (samsung ? '<a class="btn" href="' + chromeUrl + '">In Chrome öffnen</a>' : (deferredPrompt ? '<button class="btn" id="inGo" type="button">Jetzt installieren</button>' : '')) +
      '<button class="btn ghost" id="inLater" type="button">Später</button><button class="btn ghost" id="inNever" type="button">Nicht mehr anzeigen</button></div>', { sticky: true });
    var go = $('#inGo', box);
    if (go) go.onclick = function () { deferredPrompt.prompt(); deferredPrompt.userChoice.then(function () { deferredPrompt = null; UI.close(); }); };
    $('#inLater', box).onclick = function () { try { sessionStorage.setItem('pp_install_later', '1'); } catch (e) { /* ignore */ } UI.close(); };
    $('#inNever', box).onclick = function () { try { localStorage.setItem('pp_install_never', '1'); } catch (e) { /* ignore */ } UI.close(); };
  };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (/SamsungBrowser/i.test(navigator.userAgent)) return;   // its WebAPK gets blocked by Play Protect -> guide to Chrome instead
    deferredPrompt = e; $('#installBtn').classList.remove('hide');
    var go = $('#inGo'); if (!go && $('.install-steps')) App.showInstall();
  });
  window.addEventListener('appinstalled', function () { $('#installBtn').classList.add('hide'); UI.toast('App installiert 🎉'); });
  $('#installBtn').onclick = App.showInstall;
  function maybeAskInstall() {
    if (standalone()) return;
    var later = false, never = false;
    try { later = sessionStorage.getItem('pp_install_later'); never = localStorage.getItem('pp_install_never'); } catch (e) { /* ignore */ }
    if (isMobile()) $('#installBtn').classList.remove('hide');
    if (isMobile() && !later && !never) setTimeout(function () { if ($('#modal').classList.contains('hide')) App.showInstall(); }, 900);
  }
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); });
  }

  /* ================= CONNECT LINK (#connect=...) ================= */
  function applyConnect(code) {
    try {
      var o = JSON.parse(S.b64ToUtf8(decodeURIComponent(code)));
      if (!o.t) throw new Error('no token');
      var s = S.ghSettings(); s.token = o.t; if (o.d) s.dataRepo = o.d; S.saveGhSettings(s);
      try { S.IDB.put('kv', { t: o.t, d: o.d }, 'cloudConnect'); } catch (e) { /* backup copy only */ }
      UI.toast('☁ Cloud verbunden – Angebote und Fotos werden synchronisiert', 4000);
      return true;
    } catch (e) { UI.toast('Verbindungs-Link ungültig'); return false; }
  }
  function readConnect() {
    var m = location.hash.match(/connect=([^&]+)/); if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    return applyConnect(m[1]);
  }
  // Encrypted cloud access shipped with the app (config.cloudVault): the client enters the password once per device.
  App.askVault = function (force) {
    var v = App.cfg.cloudVault;
    if (!v || S.Cloud.enabled() || !(window.crypto && crypto.subtle)) return;
    try { if (!force && sessionStorage.getItem('pp_vault_later')) return; } catch (e) { /* ignore */ }
    var box = UI.modal('<div class="install-hero"><img src="assets/icons/icon-192.png" alt=""><h2>Cloud verbinden</h2>' +
      '<p class="hint">Gib einmal das Cloud-Passwort ein – danach sind deine Angebote und Fotos auf Handy und Laptop synchron. Das Passwort bekommst du vom Admin.</p></div>' +
      '<label>Cloud-Passwort<input type="password" id="vPw" autocomplete="current-password"></label>' +
      '<div class="row"><button class="btn" id="vGo" type="button">Verbinden</button><button class="btn ghost" id="vLater" type="button">Später</button></div><div class="status" id="vSt"></div>', { sticky: true });
    function go() {
      var st = $('#vSt', box); st.className = 'status'; st.textContent = 'Prüfe …';
      S.Vault.open(v, $('#vPw', box).value).then(function (o) {
        if (!o || !o.t) throw new Error('leer');
        var s = S.ghSettings(); s.token = o.t; if (o.d) s.dataRepo = o.d; S.saveGhSettings(s);
        S.IDB.put('kv', { t: o.t, d: o.d }, 'cloudConnect');
        UI.close(); UI.toast('☁ Cloud verbunden – Angebote und Fotos werden synchronisiert', 4000);
        App.syncProposals(true); Photos.sync().catch(function () { /* ignore */ }); App.loadFavs(); App.loadTemplates();
        App.loadClientDesigns().then(function () { App.setConfig(App.cfg); });
      }).catch(function () { st.className = 'status err'; st.textContent = 'Falsches Passwort'; });
    }
    $('#vGo', box).onclick = go;
    $('#vPw', box).onkeydown = function (e) { if (e.key === 'Enter') go(); };
    $('#vLater', box).onclick = function () { try { sessionStorage.setItem('pp_vault_later', '1'); } catch (e) { /* ignore */ } UI.close(); };
  };

  /* ---------- templates: design, packages, texts, logo, photos – without couple data ---------- */
  var TPL_PATH = 'templates/templates.json', tplSha = null;
  App.templates = [];
  App.loadTemplates = function () {
    return S.IDB.get('kv', 'templates').then(function (l) {
      App.templates = l || [];
      if (!S.Cloud.enabled()) return App.templates;
      return S.GH.getText(S.Cloud.repo(), TPL_PATH).then(function (r) {
        if (r) { tplSha = r.sha; try { App.templates = JSON.parse(r.text); S.IDB.put('kv', App.templates, 'templates'); } catch (e) { /* keep local */ } }
        return App.templates;
      }).catch(function () { return App.templates; });
    });
  };
  function saveTemplates() {
    S.IDB.put('kv', App.templates, 'templates');
    if (S.Cloud.enabled()) S.GH.put(S.Cloud.repo(), TPL_PATH, S.utf8ToB64(JSON.stringify(App.templates, null, 1)), 'Vorlagen aktualisiert', tplSha || undefined)
      .then(function (r) { tplSha = r.content.sha; }).catch(function (e) { UI.toast('Cloud: ' + e.message); });
  }
  App.saveAsTemplate = function () {
    var pr = App.cur;
    var name = window.prompt('Name der Vorlage (z. B. „Klassik 2027“ oder „Standesamt kurz“):', (pr.content && pr.content.title ? '' : '') + (App.designs().filter(function (d) { return d.id === pr.design; }).map(function (d) { return d.name; })[0] || 'Vorlage'));
    if (!name) return;
    var t = { id: S.uid('t'), name: name, created: Date.now(), design: pr.design, logo: pr.logo || 'auto', style: pr.style || null, content: clone(pr.content), slots: clone(pr.slots) };
    var same = App.templates.filter(function (x) { return x.name === name; })[0];
    if (same && UI.confirm('Vorlage „' + name + '“ überschreiben?')) { t.id = same.id; App.templates = App.templates.map(function (x) { return x.id === same.id ? t : x; }); }
    else App.templates.unshift(t);
    saveTemplates(); UI.toast('Vorlage „' + name + '“ gespeichert');
  };
  App.newFromTemplate = function (t) {
    var pr = newProposal();
    if (t) {
      pr.design = t.design; pr.logo = t.logo; pr.style = t.style ? clone(t.style) : null; pr.content = clone(t.content); pr.slots = clone(t.slots);
      pr.log = [{ at: Date.now(), type: 'create', text: 'Angelegt aus Vorlage „' + t.name + '“' }];
    }
    return S.IDB.put('proposals', pr).then(function () { App.open(pr); setStep('data'); return pr; });
  };
  App.chooseNew = function () {
    if (!App.templates.length) return App.save().then(function () { App.newProposal(); UI.toast('Neuer Entwurf angelegt'); });
    var box = UI.modal('<h2>Neuer Entwurf</h2><p class="hint">Mit einer Vorlage sind Design, Pakete, Preise, Texte und Fotos schon fertig – du trägst nur noch Paar, Datum und Ort ein.</p>' +
      '<div class="drafts"><div class="draft"><div><b>Leer (Standardtexte)</b><span>Neues Angebot mit den Standardvorlagen</span></div><div class="row"><button class="btn" type="button" data-t="">Anlegen</button></div></div>' +
      App.templates.map(function (t, i) {
        var d = App.designs().filter(function (x) { return x.id === t.design; })[0];
        var pk = (t.content.packages || []).filter(function (p) { return p.show !== false; }).map(function (p) { return p.name + ' ' + p.price; }).join(' · ');
        return '<div class="draft"><div><b>' + esc(t.name) + '</b><span>' + esc((d ? d.name : t.design) + (pk ? ' · ' + pk : '')) + '</span></div><div class="row"><button class="btn" type="button" data-t="' + i + '">Anlegen</button><button class="btn ghost" type="button" data-del="' + i + '" title="Vorlage löschen">✕</button></div></div>';
      }).join('') + '</div><div class="row"><button class="btn ghost" type="button" id="tplX">Abbrechen</button></div>', { wide: true });
    $('#tplX', box).onclick = UI.close;
    $$('[data-t]', box).forEach(function (b) { b.onclick = function () { var t = b.dataset.t === '' ? null : App.templates[+b.dataset.t]; UI.close(); App.save().then(function () { App.newFromTemplate(t); UI.toast(t ? 'Aus Vorlage „' + t.name + '“ angelegt' : 'Neuer Entwurf angelegt'); }); }; });
    $$('[data-del]', box).forEach(function (b) { b.onclick = function () { var t = App.templates[+b.dataset.del]; if (!UI.confirm('Vorlage „' + t.name + '“ löschen?')) return; App.templates.splice(+b.dataset.del, 1); saveTemplates(); UI.close(); App.chooseNew(); }; });
  };

  // If localStorage was cleared but IndexedDB still has the connection, restore it.
  function restoreConnect() {
    if (S.Cloud.enabled()) return Promise.resolve();
    return S.IDB.get('kv', 'cloudConnect').then(function (c) {
      if (c && c.t) { var s = S.ghSettings(); s.token = c.t; if (c.d) s.dataRepo = c.d; S.saveGhSettings(s); }
    }).catch(function () { /* ignore */ });
  }

  /* ================= START ================= */
  function start() {
    readConnect();
    applyCss();
    Photos.onChange = function () { renderSlots(); };
    var last = null; try { last = localStorage.getItem('pp_last'); } catch (e) { /* ignore */ }
    restoreConnect().then(function () { return App.loadClientDesigns(); }).catch(function () { return []; }).then(function () { applyCss(); return PP.prepare(App.rcfg()); }).then(function () { return S.IDB.all('proposals'); }).then(function (l) {
      var pick = function (list) { return list.filter(function (p) { return p.id === last; })[0] || list.sort(function (a, b) { return b.updated - a.updated; })[0]; };
      var pr = pick(l);
      if (pr) { App.open(pr); return; }
      // fresh device: fetch the cloud first, create an empty draft only if there is nothing
      var first = S.Cloud.enabled() ? App.syncProposals(true).then(function () { return S.IDB.all('proposals'); }) : Promise.resolve([]);
      return first.then(function (l2) {
        var p2 = pick(l2 || []);
        if (p2) { App.open(p2); return; }
        var n = newProposal(); return S.IDB.put('proposals', n).then(function () { App.open(n); });
      });
    }).then(function () {
      var st = null; try { st = sessionStorage.getItem('pp_step'); } catch (e) { /* ignore */ }
      setStep(st && $('[data-pane="' + st + '"], [data-step="' + st + '"]') ? st : 'design');
      App.loadTemplates();
      if (S.Cloud.enabled()) { App.syncProposals(true); App.loadFavs(); Photos.sync().catch(function (e) { console.warn(e); }); }
      maybeAskInstall();
      // ask for the cloud password as soon as no other dialog (e.g. the install guide) is open
      if (!ADMIN) (function tryVault(n) {
        if (S.Cloud.enabled() || !App.cfg.cloudVault) return;
        if (n > 0 && $('#modal').classList.contains('hide')) App.askVault(); else if (n < 200) setTimeout(function () { tryVault(n + 1); }, 1200);
      })(0);
      if (App.onReady) App.onReady();
    }).catch(function (e) {
      console.error(e);
      UI.modal('<h2>Speicher nicht verfügbar</h2><p>Der Browser erlaubt keine lokale Speicherung (privater Modus?). Bitte im normalen Modus öffnen.</p><p class="hint">' + esc(e.message) + '</p>');
    });
  }
  App.start = start;

  // Keep phone and laptop in sync: pull when the app comes back to the foreground and every 45 s while visible.
  function cloudRefresh() {
    if (!S.Cloud.enabled() || document.hidden) return;
    App.syncProposals(true);
    Photos.sync().catch(function () { /* offline */ });
    App.loadFavs(); App.loadTemplates();
    App.loadClientDesigns().then(function () { applyCss(); renderGallery(); }).catch(function () { /* offline */ });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) cloudRefresh(); });
  window.addEventListener('online', cloudRefresh);
  setInterval(function () { if (S.Cloud.enabled() && !document.hidden) App.syncProposals(true); }, 45000);
  // Flush pending changes before the page is closed or hidden (e.g. switching apps on the phone).
  document.addEventListener('visibilitychange', function () { if (document.hidden && App.cur && App.cur.dirty && S.Cloud.enabled()) App.syncProposals(true); });
  if (!ADMIN) start();
})();
