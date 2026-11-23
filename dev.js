/* Admin / developer app (admin.html only). Edits the config locally, then publishes it to GitHub as a new app version. */
(function () {
  'use strict';
  var App = window.App, S = window.Store, UI = window.UI, PP = window.PP;
  var $ = UI.$, $$ = UI.$$, esc = UI.esc;
  var LOCAL = 'pp_cfg_local', LOCAL_LOGOS = 'pp_logos_local';
  var pending = {};   // extra files to commit: path -> {b64} | {text}

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { UI.toast('Lokaler Speicher voll – bitte veröffentlichen'); } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }

  /* ---------- local working copy ---------- */
  var published = clone(window.APP_CONFIG);
  var publishedLogos = clone(window.APP_LOGOS);
  var local = load(LOCAL), localLogos = load(LOCAL_LOGOS);
  if (local) App.cfg = local; else App.cfg = clone(published);
  if (localLogos) window.APP_LOGOS = localLogos;
  App.cfg.customDesigns = App.cfg.customDesigns || [];

  function dirty() { return !!(load(LOCAL) || load(LOCAL_LOGOS) || Object.keys(pending).length); }
  function badge() { $('#localBadge').classList.toggle('hide', !dirty()); var b = $('#pubState'); if (b) b.innerHTML = dirty() ? '<b>Es gibt nicht veröffentlichte Änderungen.</b>' : 'Alles veröffentlicht.'; }
  var applySoon = (function () { var t; return function () { clearTimeout(t); t = setTimeout(function () { App.setConfig(App.cfg); }, 300); }; })();
  function changed() { store(LOCAL, App.cfg); badge(); applySoon(); }
  App.cfgChanged = changed;

  /* ---------- PIN ---------- */
  function sha256(s) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('Sicherer Kontext nötig (https oder localhost)'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function gate() {
    var ok = false; try { ok = sessionStorage.getItem('pp_admin_ok') === '1'; } catch (e) { /* ignore */ }
    if (ok) return Promise.resolve();
    return new Promise(function (res) {
      var box = UI.modal('<div class="install-hero"><img src="assets/icons/icon-192.png" alt=""><h2>Admin-Bereich</h2><p class="hint">Bitte PIN eingeben.</p></div>' +
        '<label>PIN<input type="password" inputmode="numeric" id="pin" autocomplete="current-password"></label><div class="row"><button class="btn" id="pinGo" type="button">Öffnen</button>' +
        '<a class="btn ghost" href="./">Zur Kunden-App</a></div><div class="status" id="pinSt"></div>', { sticky: true });
      function tryPin() {
        sha256($('#pin', box).value).then(function (h) {
          if (h === (App.cfg.pinHash || published.pinHash)) { try { sessionStorage.setItem('pp_admin_ok', '1'); } catch (e) { /* ignore */ } UI.close(); res(); }
          else { $('#pinSt', box).className = 'status err'; $('#pinSt', box).textContent = 'Falsche PIN'; }
        }).catch(function (e) { $('#pinSt', box).textContent = e.message; });
      }
      $('#pinGo', box).onclick = tryPin;
      $('#pin', box).onkeydown = function (e) { if (e.key === 'Enter') tryPin(); };
      setTimeout(function () { $('#pin', box).focus(); }, 50);
    });
  }

  /* ---------- version ---------- */
  function nextVersion(major) {
    var v = String(App.cfg.appVersion || published.appVersion || '1.0').split('.').map(Number);
    return major ? (v[0] + 1) + '.0' : v[0] + '.' + ((v[1] || 0) + 1);
  }
  function changelogMd(cfg) {
    return '# Changelog\n\nAlle Versionen der Hochzeitsangebot-App. Format: `Major.Minor` – Minor bei jedem Update, Major bei großen Umbauten.\n\n' +
      (cfg.changelog || []).map(function (c) { return '## ' + c.version + ' – ' + c.date + '\n\n' + (c.notes || []).map(function (n) { return '- ' + n; }).join('\n') + '\n'; }).join('\n');
  }

  /* ---------- UI building blocks ---------- */
  function sec(id, title, body, open) { return '<details class="box dev-sec" id="' + id + '"' + (open ? ' open' : '') + '><summary>' + title + '</summary>' + body + '</details>'; }
  function bindObj(root, obj, attr, after) {
    $$('[' + attr + ']', root).forEach(function (i) {
      var k = i.getAttribute(attr);
      if (i.type === 'checkbox') { i.checked = obj[k] !== false && !!obj[k] || (obj[k] === undefined && i.dataset.def === '1'); i.onchange = function () { obj[k] = i.checked; changed(); if (after) after(); }; }
      else { i.value = obj[k] == null ? '' : obj[k]; i.oninput = function () { obj[k] = i.type === 'number' ? +i.value : i.value; changed(); if (after) after(); }; }
    });
  }
  var SCRIPTS = window.Studio.SCRIPTS, SERIFS = window.Studio.SERIFS;
  function opts(list, cur) { if (cur && list.indexOf(cur) < 0) list = [cur].concat(list); return list.map(function (f) { return '<option' + (f === cur ? ' selected' : '') + '>' + f + '</option>'; }).join(''); }

  /* ---------- render admin pane ---------- */
  App.onDev = function () {
    var cfg = App.cfg, gh = S.ghSettings();
    var pane = $('#devPane');
    pane.innerHTML = '<h2>Entwickler</h2><p class="hint">Alle Änderungen werden sofort in der Vorschau gezeigt und lokal gespeichert. Erst mit „Veröffentlichen“ landen sie auf GitHub – dann sehen sie alle in der Kunden-App. Aktuelle Version: <b>' + esc(cfg.appVersion || '1.0') + '</b></p>' +
      sec('dPub', 'Veröffentlichen &amp; Version', publishHTML(gh), true) +
      sec('dStudio', 'Studio-Daten', '<div class="dev-grid">' + [['name', 'Name'], ['tagline', 'Zusatz (z. B. Fotografie)'], ['owner', 'Inhaberin'], ['email', 'E-Mail'], ['phone', 'Telefon'], ['countryCode', 'Ländervorwahl (WhatsApp)'], ['web', 'Website'], ['instagram', 'Instagram'], ['address', 'Adresse']]
        .map(function (f) { return '<label>' + f[1] + '<input data-st="' + f[0] + '"></label>'; }).join('') + '</div>') +
      sec('dDefaults', 'Standardtexte &amp; Pakete', '<p class="hint">Gilt für alle neuen Angebote.</p><div id="defEd"></div>' +
        '<h3>Standard-Foto „Über mich“</h3><div class="row"><label class="btn ghost" style="margin:0">Foto hochladen<input type="file" accept="image/*" hidden id="aboutUp"></label><button class="btn ghost" id="aboutClr" type="button">Entfernen</button><span class="hint" id="aboutInfo"></span></div>') +
      sec('dIdeas', 'Textvorschläge', '<p class="hint">Diese Varianten erscheinen bei „Vorschläge ▾“ in der Kunden-App. Platzhalter wie {name1} sind erlaubt.</p><div id="ideasEd"></div>') +
      sec('dDesigns', 'Designs &amp; Design-Studio', designsHTML()) +
      sec('dMsg', 'Nachrichten-Vorlagen', '<label>WhatsApp<textarea data-msg="whatsapp" rows="3"></textarea></label><label>E-Mail-Betreff<input data-msg="emailSubject"></label><label>E-Mail-Text<textarea data-msg="emailBody" rows="6"></textarea></label>') +
      sec('dLogo', 'Logo', '<p class="hint">SVG-Dateien hochladen (einfarbig). Die Farbe wird je Design automatisch angepasst.</p><div class="logo-prev" id="logoPrev"></div>' +
        ['full', 'mark', 'word'].map(function (k) { return '<label class="btn ghost" style="margin:0 6px 6px 0">' + { full: 'Komplettlogo', mark: 'Monogramm', word: 'Schriftzug' }[k] + ' ersetzen<input type="file" accept=".svg,image/svg+xml" hidden data-logo="' + k + '"></label>'; }).join('')) +
      sec('dPerm', 'Rechte der Kundin', permHTML()) +
      sec('dConnect', 'Kollegin verbinden (Cloud)', connectHTML()) +
      sec('dFiles', 'Datei-Editor (Code-Updates)', '<p class="hint">Jede Datei im App-Repo direkt bearbeiten und committen – z. B. <span class="kbd">designs.css</span> oder <span class="kbd">app.js</span>. Ein Commit hier erhöht die Version ebenfalls.</p>' +
        '<div class="row"><input id="fPath" placeholder="z. B. designs.css" style="flex:1"><button class="btn ghost" id="fLoad" type="button">Laden</button></div><textarea class="code" id="fText" rows="14" spellcheck="false"></textarea>' +
        '<div class="row"><input id="fMsg" placeholder="Was wurde geändert?" style="flex:1"><button class="btn" id="fSave" type="button">Als neue Version committen</button></div><div class="status" id="fSt"></div>') +
      sec('dSec', 'Sicherheit &amp; Backup', '<div class="row"><input type="password" id="newPin" placeholder="Neue PIN" style="flex:1"><button class="btn ghost" id="setPin" type="button">PIN ändern</button></div>' +
        '<div class="row"><button class="btn ghost" id="cfgExp" type="button">Konfiguration exportieren</button><label class="btn ghost" style="margin:0">Importieren<input type="file" accept=".json" hidden id="cfgImp"></label></div>');

    bindPublish(pane);
    bindObj($('#dStudio', pane), cfg.studio, 'data-st');
    App.contentEditor($('#defEd', pane), cfg.defaults, changed, {});
    bindAbout(pane);
    drawIdeas(pane);
    bindDesigns(pane);
    cfg.messages = cfg.messages || {};
    bindObj($('#dMsg', pane), cfg.messages, 'data-msg');
    bindLogos(pane);
    bindConnect(pane);
    bindPerm(pane);
    bindFiles(pane);
    bindSecurity(pane);
    badge();
  };

  /* ---------- publish ---------- */
  function publishHTML(gh) {
    return '<div class="status" id="pubState"></div>' +
      '<div class="dev-grid"><label>App-Repo (öffentlich)<input id="ghSite" value="' + esc(gh.siteRepo) + '"></label><label>Daten-Repo (privat, Cloud)<input id="ghData" value="' + esc(gh.dataRepo) + '"></label>' +
      '<label>Branch<input id="ghBranch" value="' + esc(gh.branch) + '"></label><label>GitHub-Token<input type="password" id="ghToken" value="' + esc(gh.token) + '" placeholder="github_pat_…" autocomplete="off"></label></div>' +
      '<p class="hint">Fine-grained Token mit <b>Contents: Read and write</b> für beide Repos. Er bleibt nur in diesem Browser gespeichert.</p>' +
      '<div class="row"><button class="btn ghost" id="ghTest" type="button">Verbindung testen</button></div>' +
      '<h3>Neue Version</h3><label>Was ist neu? <small>(eine Zeile pro Punkt – landet im Changelog)</small><textarea id="pubNotes" rows="3" placeholder="z. B. Neues Design „Boho“, Preise 2027"></textarea></label>' +
      '<label class="switch"><input type="checkbox" id="pubMajor"><span>Großes Update (neue Hauptversion)</span></label>' +
      '<div class="row"><button class="btn" id="pubGo" type="button">Veröffentlichen</button><button class="btn danger" id="pubDiscard" type="button">Lokale Änderungen verwerfen</button></div>' +
      '<div class="status" id="pubSt"></div><h3>Versionen</h3><div class="log" id="verLog"></div>';
  }
  function bindPublish(pane) {
    function saveGh() {
      var s = S.ghSettings();
      s.siteRepo = $('#ghSite', pane).value.trim(); s.dataRepo = $('#ghData', pane).value.trim(); s.branch = $('#ghBranch', pane).value.trim() || 'main'; s.token = $('#ghToken', pane).value.trim();
      S.saveGhSettings(s);
    }
    ['#ghSite', '#ghData', '#ghBranch', '#ghToken'].forEach(function (id) { $(id, pane).onchange = saveGh; });
    function label() { $('#pubGo', pane).textContent = 'Veröffentlichen als v' + nextVersion($('#pubMajor', pane).checked); }
    $('#pubMajor', pane).onchange = label; label();
    $('#verLog', pane).innerHTML = (App.cfg.changelog || []).map(function (c) { return '<div><span>v' + esc(c.version) + ' · ' + esc(c.date) + '</span> ' + esc((c.notes || []).join(' · ')) + '</div>'; }).join('');
    $('#ghTest', pane).onclick = function () {
      saveGh(); var st = $('#pubSt', pane); st.className = 'status'; st.textContent = 'Teste …';
      var s = S.ghSettings();
      Promise.all([S.GH.user(), S.GH.repo(s.siteRepo), S.GH.repo(s.dataRepo)]).then(function (r) {
        var msg = 'Angemeldet als ' + r[0].login + '\nApp-Repo: ' + (r[1] ? (r[1].permissions && r[1].permissions.push ? 'Schreibzugriff ✓' : 'nur lesen ✗') : 'nicht gefunden ✗') +
          '\nDaten-Repo: ' + (r[2] ? (r[2].private ? 'privat ✓ ' : 'ÖFFENTLICH ⚠ ') + (r[2].permissions && r[2].permissions.push ? 'Schreibzugriff ✓' : 'nur lesen ✗') : 'nicht gefunden ✗');
        st.className = 'status ok'; st.textContent = msg;
        if (S.Cloud.enabled()) { App.syncProposals(true); window.Photos.sync().catch(function () { /* ignore */ }); }
      }).catch(function (e) { st.className = 'status err'; st.textContent = e.message; });
    };
    $('#pubDiscard', pane).onclick = function () {
      if (!UI.confirm('Alle nicht veröffentlichten Änderungen verwerfen?')) return;
      store(LOCAL, null); store(LOCAL_LOGOS, null); pending = {};
      App.cfg = clone(published); window.APP_LOGOS = clone(publishedLogos); App.setConfig(App.cfg); App.onDev();
    };
    $('#pubGo', pane).onclick = function () {
      saveGh();
      var notes = $('#pubNotes', pane).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var st = $('#pubSt', pane);
      if (!notes.length) { st.className = 'status err'; st.textContent = 'Bitte kurz beschreiben, was neu ist.'; return; }
      publish(notes, $('#pubMajor', pane).checked, [], st).then(function () { App.onDev(); });
    };
  }
  // Commits config.js (+ logos.js, CHANGELOG.md, pending files, extra files) as one new version.
  function publish(notes, major, extraFiles, st) {
    var s = S.ghSettings();
    if (!s.token) { st.className = 'status err'; st.textContent = 'Kein GitHub-Token eingetragen.'; return Promise.resolve(); }
    var cfg = clone(App.cfg), ver = nextVersion(major);
    cfg.appVersion = ver;
    cfg.changelog = [{ version: ver, date: today(), notes: notes }].concat(cfg.changelog || []);
    if (cfg.defaults && cfg.defaults.photos && cfg.defaults.photos.aboutPath && /^data:/.test(cfg.defaults.photos.about || '')) { cfg.defaults.photos.about = cfg.defaults.photos.aboutPath; }
    if (cfg.defaults && cfg.defaults.photos) delete cfg.defaults.photos.aboutPath;
    var files = [{ path: 'config.js', text: 'window.APP_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n' }, { path: 'CHANGELOG.md', text: changelogMd(cfg) }];
    if (load(LOCAL_LOGOS)) files.push({ path: 'logos.js', text: 'window.APP_LOGOS = ' + JSON.stringify(window.APP_LOGOS, null, 1) + ';\n' });
    Object.keys(pending).forEach(function (p) { var f = pending[p]; files.push(f.b64 != null ? { path: p, b64: f.b64 } : { path: p, text: f.text }); });
    files = files.concat(extraFiles || []);
    st.className = 'status'; st.textContent = 'Veröffentliche v' + ver + ' (' + files.length + ' Dateien) …';
    return S.GH.commitFiles(s.siteRepo, files, 'v' + ver + ' – ' + notes.join('; ')).then(function (c) {
      App.cfg = cfg; published = clone(cfg); publishedLogos = clone(window.APP_LOGOS); window.APP_CONFIG = clone(cfg);
      store(LOCAL, null); store(LOCAL_LOGOS, null); pending = {};
      App.setConfig(App.cfg); badge();
      st.className = 'status ok';
      st.innerHTML = '✓ v' + esc(ver) + ' veröffentlicht. <a href="' + esc(c.html_url) + '" target="_blank" rel="noopener">Commit ansehen</a> – GitHub Pages ist in ca. 1 Minute aktualisiert.';
      UI.toast('Version ' + ver + ' veröffentlicht');
    }).catch(function (e) { st.className = 'status err'; st.textContent = 'Fehler: ' + e.message; });
  }

  /* ---------- default about photo ---------- */
  function bindAbout(pane) {
    var info = $('#aboutInfo', pane), d = App.cfg.defaults;
    d.photos = d.photos || {};
    info.textContent = d.photos.about ? 'gesetzt: ' + d.photos.about.slice(0, 40) : 'keins';
    $('#aboutUp', pane).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () {
        var r = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', .86);
        pending['assets/about.jpg'] = { b64: data.split(',')[1] };
        d.photos.about = data;          // preview until published …
        d.photos.aboutPath = 'assets/about.jpg';
        changed(); info.textContent = 'neu (wird beim Veröffentlichen hochgeladen)';
      };
      img.src = u;
    };
    $('#aboutClr', pane).onclick = function () { d.photos.about = ''; delete d.photos.aboutPath; delete pending['assets/about.jpg']; changed(); info.textContent = 'keins'; };
  }

  /* ---------- text ideas ---------- */
  var IDEA_KEYS = [['intro', 'Begrüßung'], ['about', 'Über mich'], ['packagesIntro', 'Pakete-Einleitung'], ['payment', 'Zahlungsbedingungen'], ['thanks', 'Danke-Text'], ['whatsapp', 'WhatsApp-Nachricht'], ['emailBody', 'E-Mail-Text']];
  function drawIdeas(pane) {
    var ti = App.cfg.textIdeas = App.cfg.textIdeas || {}, el = $('#ideasEd', pane);
    el.innerHTML = IDEA_KEYS.map(function (k) {
      var list = ti[k[0]] = ti[k[0]] || [];
      return '<h3>' + k[1] + '</h3>' + list.map(function (it, i) {
        return '<div class="lst-item" data-k="' + k[0] + '" data-i="' + i + '"><div class="lst-head"><input data-f="label" placeholder="Name der Variante" style="flex:1"><button class="btn ghost" data-a="del" type="button">✕</button></div><textarea data-f="text" rows="3"></textarea></div>';
      }).join('') + '<button class="btn ghost" type="button" data-add="' + k[0] + '">+ Variante</button>';
    }).join('');
    $$('.lst-item', el).forEach(function (it) {
      var o = ti[it.dataset.k][+it.dataset.i];
      $$('[data-f]', it).forEach(function (f) { f.value = o[f.dataset.f] || ''; f.oninput = function () { o[f.dataset.f] = f.value; changed(); }; });
      $('[data-a=del]', it).onclick = function () { ti[it.dataset.k].splice(+it.dataset.i, 1); changed(); drawIdeas(pane); };
    });
    $$('[data-add]', el).forEach(function (b) { b.onclick = function () { ti[b.dataset.add].push({ label: 'Neu', text: '' }); changed(); drawIdeas(pane); }; });
  }

  /* ---------- designs ---------- */
  function designsHTML() {
    return '<p class="hint">Farben, Schriften und Feinschliff-CSS je Design. Eigene Designs entstehen im Design-Studio – z. B. mit einem Entwurf aus ChatGPT.</p>' +
      '<div class="row"><button class="btn" id="dzAi" type="button">✦ Neues Design mit KI-Prompt</button><button class="btn ghost" id="dzBlank" type="button">+ Leeres eigenes Design</button></div><div id="dzList"></div>';
  }
  function bindDesigns(pane) {
    var cfg = App.cfg; cfg.designs = cfg.designs || {};
    function draw() {
      var list = PP.getDesigns(cfg), el = $('#dzList', pane);
      el.innerHTML = list.map(function (d) {
        var o = d.builtin ? (cfg.designs[d.id] = cfg.designs[d.id] || {}) : cfg.customDesigns.filter(function (x) { return x.id === d.id; })[0];
        return '<div class="dz-edit" data-id="' + d.id + '"><div class="lst-head"><b>' + esc(d.name) + (d.builtin ? '' : ' <span class="st" style="--c:#8f6d60">eigenes</span>') + '</b><div class="row">' +
          '<label class="switch"><input type="radio" name="defDz" value="' + d.id + '"' + (cfg.defaultDesign === d.id ? ' checked' : '') + '><span>Standard</span></label>' +
          '<label class="switch"><input type="checkbox" data-o="enabled" data-def="1"><span>Aktiv</span></label></div></div>' +
          (d.builtin ? '' : '<div class="dev-grid"><label>Name<input data-o="name"></label><label>Beschreibung<input data-o="desc"></label>' +
            '<label>Basis-Layout (Innenseiten)<select data-o="base">' + PP.DESIGNS.map(function (b) { return '<option value="' + b.id + '">' + b.name + '</option>'; }).join('') + '</select></label><label>ID<input value="' + esc(d.id) + '" disabled></label></div>') +
          '<div class="grid3"><label>Papier<input type="color" data-o="paper"></label><label>Schrift<input type="color" data-o="ink"></label><label>Akzent<input type="color" data-o="accent"></label></div>' +
          '<div class="dev-grid"><label>Schreibschrift<select data-o="script">' + opts(SCRIPTS, o.script) + '</select></label><label>Serifenschrift<select data-o="serif">' + opts(SERIFS, o.serif) + '</select></label></div>' +
          (d.builtin ? '' : '<label>Deckblatt-HTML <small>Platzhalter: ' + PP.TEMPLATE_KEYS.map(function (k) { return '{{' + k + '}}'; }).join(' ') + '</small><textarea class="code" data-o="cover" rows="8" spellcheck="false"></textarea></label>') +
          '<label>' + (d.builtin ? 'Feinschliff-CSS' : 'Design-CSS') + ' <small>Selektoren mit <span class="kbd">.d-' + esc(d.id) + '</span> beginnen</small><textarea class="code" data-o="css" rows="' + (d.builtin ? 4 : 10) + '" spellcheck="false" placeholder=".d-' + esc(d.id) + ' .cv-title { letter-spacing: .1em; }"></textarea></label>' +
          '<div class="row"><button class="btn ghost" data-a="try" type="button">Im aktuellen Angebot ansehen</button>' + (d.duo ? '' : '<button class="btn ghost" data-a="dup" type="button">Als eigenes Design kopieren</button>') +
          (d.builtin ? '' : '<button class="btn ghost" data-a="ai" type="button">Mit KI überarbeiten</button><button class="btn danger" data-a="del" type="button">Löschen</button>') + '</div></div>';
      }).join('');
      $$('.dz-edit', el).forEach(function (box) {
        var id = box.dataset.id, builtin = !!list.filter(function (b) { return b.id === id && b.builtin; })[0];
        var o = builtin ? cfg.designs[id] : cfg.customDesigns.filter(function (x) { return x.id === id; })[0];
        var defs = builtin ? ((window.APP_CONFIG.designs || {})[id] || PP.DUO.filter(function (x) { return x.id === id; })[0] || {}) : {};
        ['paper', 'ink', 'accent', 'script', 'serif'].forEach(function (k) { if (o[k] == null && defs[k]) o[k] = defs[k]; });
        if (o.paper == null) { o.paper = '#ffffff'; o.ink = o.ink || '#1c1a19'; o.accent = o.accent || '#8a7f76'; }
        bindObj(box, o, 'data-o', function () { App.renderGallery(); });
        box.querySelector('[name=defDz]').onchange = function () { cfg.defaultDesign = id; changed(); };
        $$('[data-a]', box).forEach(function (b) {
          b.onclick = function () {
            var a = b.dataset.a;
            if (a === 'try') { App.cur.design = id; App.changed(); UI.toast('Vorschau: ' + (o.name || id)); if (window.innerWidth < 900) App.setStep('preview'); }
            if (a === 'dup') { var nd = { id: uniqueId((o.name || id) + '-kopie'), name: (o.name || PP.DESIGNS.filter(function (x) { return x.id === id; }).map(function (x) { return x.name; })[0] || id) + ' Kopie', desc: '', base: builtin ? id : o.base, enabled: true, paper: o.paper, ink: o.ink, accent: o.accent, script: o.script, serif: o.serif, cover: builtin ? '' : o.cover, css: builtin ? '' : String(o.css || '').split('.d-' + id).join('.d-__NEW__') }; nd.css = nd.css.split('__NEW__').join(nd.id); cfg.customDesigns.push(nd); changed(); draw(); }
            if (a === 'del' && UI.confirm('Design „' + (o.name || id) + '“ löschen?')) { cfg.customDesigns = cfg.customDesigns.filter(function (x) { return x.id !== id; }); if (cfg.defaultDesign === id) cfg.defaultDesign = 'classic'; changed(); draw(); }
            if (a === 'ai') openStudio(o);
          };
        });
      });
    }
    $('#dzAi', pane).onclick = function () { openStudio(null); };
    $('#dzBlank', pane).onclick = function () {
      var nd = { id: uniqueId('eigenes-design'), name: 'Eigenes Design', desc: '', base: 'classic', enabled: true, paper: '#ffffff', ink: '#1c1a19', accent: '#8a7f76', script: 'Allura', serif: 'The Seasons',
        cover: '<div style="position:absolute;inset:80px;text-align:center">\n  <h1 class="my-title">{{title}}</h1>\n  <div style="height:640px;margin:30px 0">{{photo}}</div>\n  <p class="my-names">{{namen}}</p>\n  <p>{{datum}} · {{ort}}</p>\n</div>', css: '' };
      nd.css = '.d-' + nd.id + ' .cv-photo { width: 100%; height: 100%; }\n.d-' + nd.id + ' .my-title { font-family: var(--script); font-weight: 400; font-size: 84px; margin: 0; }\n.d-' + nd.id + ' .my-names { font-family: var(--serif); font-size: 30px; letter-spacing: .15em; text-transform: uppercase; }';
      cfg.customDesigns.push(nd); changed(); draw();
    };
    App._drawDesigns = draw;
    draw();
  }
  function uniqueId(b) { return window.Studio.uniqueId(b); }


  function openStudio(existing) {
    window.Studio.open({ existing: existing, onSave: function (o, ex) {
      if (ex) Object.keys(o).forEach(function (k) { ex[k] = o[k]; }); else App.cfg.customDesigns.push(o);
      changed(); App.cur.design = o.id; App.changed(); App.onDev();
      UI.toast('Design „' + (o.name || o.id) + '“ übernommen – in der Vorschau ansehen');
      if (window.innerWidth < 900) App.setStep('preview');
    } });
  }

  /* ---------- logos ---------- */
  function bindLogos(pane) {
    var prev = $('#logoPrev', pane);
    prev.innerHTML = ['full', 'mark', 'word'].map(function (k) { return '<img alt="' + k + '" src="' + PP.logoSrc(k, '#1c1a19') + '">'; }).join('');
    $$('[data-logo]', pane).forEach(function (inp) {
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        f.text().then(function (svg) {
          svg = svg.replace(/<\?xml[\s\S]*?\?>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').trim();
          if (!/^<svg/i.test(svg)) { UI.toast('Keine gültige SVG-Datei'); return; }
          svg = svg.replace(/<svg([^>]*)>/i, function (m, attrs) {
            attrs = attrs.replace(/\s(width|height|fill|style|class|id|x|y|xml:space|version|enable-background)="[^"]*"/g, '');
            return '<svg' + attrs + ' fill="#1c1a19">';
          }).replace(/\sclass="[^"]*"/g, '');
          var lg = clone(window.APP_LOGOS); lg[inp.dataset.logo] = svg; window.APP_LOGOS = lg;
          store(LOCAL_LOGOS, lg); badge(); App.setConfig(App.cfg); bindLogos(pane); UI.toast('Logo ersetzt – Vorschau aktualisiert');
        });
      };
    });
  }

  /* ---------- client permissions + client designs ---------- */
  var PERMS = [['chooseLogo', 'Logo-Variante pro Angebot wählen'], ['editDesign', 'Farben & Schriften pro Angebot anpassen'], ['createDesigns', 'Eigene Designs anlegen (Design-Studio)']];
  function permHTML() {
    return '<p class="hint">Was deine Kollegin in der Kunden-App zusätzlich darf. Wird mit der nächsten Version aktiv.</p>' +
      PERMS.map(function (p) { return '<label class="switch"><input type="checkbox" data-perm="' + p[0] + '"><span>' + p[1] + '</span></label>'; }).join('') +
      '<h3>Designs der Kundin</h3><p class="hint">Designs, die sie selbst angelegt hat (aus der Cloud). Du kannst sie als offizielles Design übernehmen.</p><div id="clDz"><p class="hint">Lade …</p></div>';
  }
  function bindPerm(pane) {
    var perm = App.cfg.clientPermissions = App.cfg.clientPermissions || {};
    $$('[data-perm]', pane).forEach(function (i) { i.checked = !!perm[i.dataset.perm]; i.onchange = function () { perm[i.dataset.perm] = i.checked; changed(); }; });
    var el = $('#clDz', pane);
    App.loadClientDesigns().then(function (list) {
      if (!list.length) { el.innerHTML = '<p class="hint">Noch keine.</p>'; return; }
      el.innerHTML = list.map(function (d, i) { return '<div class="draft"><div><b>' + esc(d.name || d.id) + '</b><span>' + esc(d.desc || '') + '</span></div><div class="row"><button class="btn ghost" type="button" data-i="' + i + '" data-a="try">Ansehen</button><button class="btn" type="button" data-i="' + i + '" data-a="adopt">Übernehmen</button></div></div>'; }).join('');
      $$('[data-a]', el).forEach(function (b) {
        b.onclick = function () {
          var d = list[+b.dataset.i];
          if (b.dataset.a === 'try') { App.cur.design = d.id; App.changed(); return; }
          var nd = JSON.parse(JSON.stringify(d)); var oldId = nd.id; nd.id = uniqueId(nd.id.replace(/^k-/, ''));
          if (nd.css) nd.css = nd.css.split('.d-' + oldId).join('.d-' + nd.id);
          delete nd.client; App.cfg.customDesigns.push(nd); changed(); App.onDev(); UI.toast('Als offizielles Design übernommen – jetzt veröffentlichen');
        };
      });
    }).catch(function (e) { el.innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; });
  }

  /* ---------- connect colleague ---------- */
  function siteUrl() {
    if (/github\.io$/.test(location.hostname)) return location.origin + location.pathname.replace(/admin\.html$/, '');
    var s = S.ghSettings(), p = s.siteRepo.split('/');
    return 'https://' + p[0] + '.github.io/' + p[1] + '/';
  }
  function connectHTML() {
    return '<p class="hint">Deine Kollegin nutzt die Kunden-App <b>ohne</b> Admin-Zugang. Damit ihre Angebote und Fotos in der privaten Cloud landen, braucht ihr Gerät einmal einen Verbindungs-Link.</p>' +
      '<ol class="install-steps"><li>Auf github.com einen eigenen <b>Fine-grained Token</b> nur für das Daten-Repo erstellen (Contents: Read and write).</li><li>Token unten einfügen und Link erzeugen.</li><li>Link per WhatsApp an sie schicken – einmal öffnen, fertig.</li></ol>' +
      '<label>Token nur für das Daten-Repo<input type="password" id="cnTok" placeholder="github_pat_…" autocomplete="off"></label>' +
      '<div class="row"><button class="btn" id="cnGo" type="button">Verbindungs-Link erzeugen</button></div><textarea class="code" id="cnOut" rows="3" readonly></textarea>' +
      '<p class="hint">Link zur Kunden-App ohne Cloud: <a id="cnSite" target="_blank" rel="noopener"></a></p>';
  }
  function bindConnect(pane) {
    var a = $('#cnSite', pane); a.href = siteUrl(); a.textContent = siteUrl();
    $('#cnGo', pane).onclick = function () {
      var t = $('#cnTok', pane).value.trim(); if (!t) { UI.toast('Bitte Token einfügen'); return; }
      var link = siteUrl() + '#connect=' + encodeURIComponent(S.utf8ToB64(JSON.stringify({ t: t, d: S.ghSettings().dataRepo })));
      $('#cnOut', pane).value = link;
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { UI.toast('Link kopiert – nur an deine Kollegin senden'); });
    };
  }

  /* ---------- file editor ---------- */
  function bindFiles(pane) {
    var sha = null, st = $('#fSt', pane);
    $('#fLoad', pane).onclick = function () {
      var p = $('#fPath', pane).value.trim(); if (!p) return;
      st.className = 'status'; st.textContent = 'Lade …';
      S.GH.getText(S.ghSettings().siteRepo, p).then(function (r) {
        if (!r) { st.textContent = 'Neue Datei (existiert noch nicht).'; $('#fText', pane).value = ''; sha = null; return; }
        $('#fText', pane).value = r.text; sha = r.sha; st.textContent = 'Geladen (' + r.text.length + ' Zeichen).';
      }).catch(function (e) { st.className = 'status err'; st.textContent = e.message; });
    };
    $('#fSave', pane).onclick = function () {
      var p = $('#fPath', pane).value.trim(), msg = $('#fMsg', pane).value.trim();
      if (!p || !msg) { st.className = 'status err'; st.textContent = 'Pfad und Beschreibung angeben.'; return; }
      if (p === 'config.js') { st.className = 'status err'; st.textContent = 'config.js bitte über die Bereiche oben bearbeiten.'; return; }
      publish(['Code: ' + p + ' – ' + msg], false, [{ path: p, text: $('#fText', pane).value }], st);
    };
  }

  /* ---------- security / backup ---------- */
  function bindSecurity(pane) {
    $('#setPin', pane).onclick = function () {
      var p = $('#newPin', pane).value; if (p.length < 4) { UI.toast('Mindestens 4 Zeichen'); return; }
      sha256(p).then(function (h) { App.cfg.pinHash = h; changed(); $('#newPin', pane).value = ''; UI.toast('PIN geändert – wird mit der nächsten Version aktiv'); });
    };
    $('#cfgExp', pane).onclick = function () {
      App.downloadBlob(new Blob([JSON.stringify({ config: App.cfg, logos: window.APP_LOGOS }, null, 2)], { type: 'application/json' }), 'angebots-studio-config-v' + (App.cfg.appVersion || '') + '.json');
    };
    $('#cfgImp', pane).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var o = JSON.parse(t); if (!o.config) throw new Error('Keine Konfigurationsdatei');
        App.cfg = o.config; changed();
        if (o.logos) { window.APP_LOGOS = o.logos; store(LOCAL_LOGOS, o.logos); }
        App.setConfig(App.cfg); App.onDev(); UI.toast('Konfiguration importiert (lokal) – zum Übernehmen veröffentlichen');
      }).catch(function (err) { UI.toast(err.message); });
    };
  }

  /* ---------- start ---------- */
  App.onReady = function () { badge(); };
  gate().then(function () { App.start(); });
})();
