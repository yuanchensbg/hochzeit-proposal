/* Design studio (shared by admin and – if unlocked – the client app): AI prompt builder + JSON import of a design. */
(function () {
  'use strict';
  var UI = window.UI, PP = window.PP;
  var $ = UI.$;

  var SCRIPTS = ['Mrs Saint Delafield', 'Allura', 'Great Vibes', 'Pinyon Script', 'Parisienne', 'Herr Von Muellerhoff'];
  var SERIFS = ['The Seasons', 'Cormorant Garamond', 'Playfair Display', 'Bodoni Moda'];

  function uniqueId(base) {
    var id = String(base).toLowerCase().replace(/[äöüß]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
    var all = PP.getDesigns(window.App.cfg).map(function (d) { return d.id; }), n = id, i = 2;
    while (all.indexOf(n) >= 0) n = id + '-' + (i++);
    return n;
  }

  function sampleHTML(base) {
    var App = window.App;
    var dr = Object.assign({}, App.cur, { design: base });
    var html = PP.render(dr, App.cfg, { cover: 'PHOTO.jpg', about: 'PHOTO.jpg', gallery: [{ url: 'PHOTO.jpg' }] });
    return html.replace(/data:image\/[^"')]+/g, 'LOGO.png').replace(/></g, '>\n<');
  }

  function buildPrompt(wish, base, existing) {
    var cfg = window.App.cfg;
    return 'Du bist ein erfahrener Editorial- und Hochzeits-Designer. Gestalte ein neues Design für ein Hochzeitsfotografie-Angebot (PDF, A4) der Marke „' + (cfg.studio.name || '') + ' ' + (cfg.studio.tagline || '') + '“.\n\n' +
      'MEIN WUNSCH:\n' + (wish || '(elegant, zeitlos, viel Weißraum)') + '\n\n' +
      'TECHNISCHER RAHMEN (unbedingt einhalten):\n' +
      '- Jede Seite ist ein <div class="page"> mit exakt 794 × 1123 px (A4 bei 96 dpi), overflow hidden.\n' +
      '- Du lieferst (a) das HTML des DECKBLATTS und (b) CSS für alle Seiten. Die Innenseiten haben eine feste HTML-Struktur (unten), die du nur per CSS gestaltest.\n' +
      '- Das Deckblatt-HTML wird in <div class="cv"> (position:absolute; inset:0) eingesetzt. Positioniere Elemente absolut in px.\n' +
      '- Platzhalter im Deckblatt: ' + PP.TEMPLATE_KEYS.map(function (k) { return '{{' + k + '}}'; }).join(', ') + '.\n' +
      '  {{photo}} ist ein <div class="ph cv-photo"> mit background-image (cover) – gib ihm per CSS Position, Breite und Höhe. Runde Formen nur mit border-radius (kein clip-path, keine mask).\n' +
      '  {{logo_full}}, {{logo_mark}}, {{logo_word}} (+ _white) sind <img class="lg"> – Größe per CSS (z. B. width: 160px; height: auto).\n' +
      '- ALLE CSS-Selektoren müssen mit .d-ID beginnen (ID siehe Antwortformat). Keine @import, keine externen Bilder, kein JavaScript, keine Animationen, keine Filter oder Blend-Modes, kein transform.\n' +
      '- Vorhandene CSS-Variablen: --paper (Hintergrund), --ink (Text), --accent (Akzent), --serif, --script, --sans.\n' +
      '- Verfügbare Schriften: Serif: ' + SERIFS.join(', ') + '. Schreibschrift: ' + SCRIPTS.join(', ') + '. Sans: Montserrat (300/400/500/600).\n' +
      '- Innenseiten-Text in em angeben (die Seite skaliert die Schrift automatisch, damit alles passt). Keine festen Höhen für Textblöcke.\n' +
      '- Design-Richtlinien: klares Raster, großzügige Ränder (mind. 64 px), max. 3 Schriftgrößen-Ebenen pro Seite, gute Lesbarkeit (Fließtext mind. 0.9em, ausreichender Kontrast), konsistente Abstände, Logo auf dem Deckblatt.\n\n' +
      'BASIS-LAYOUT der Innenseiten: ' + base + '. Beispiel-HTML mit Testdaten (Klassen nutzen):\n```html\n' + sampleHTML(base).slice(0, 14000) + '\n```\n\n' +
      (existing ? 'BESTEHENDES DESIGN (bitte überarbeiten, ID beibehalten: ' + existing.id + '):\nDeckblatt:\n```html\n' + (existing.cover || '') + '\n```\nCSS:\n```css\n' + (existing.css || '') + '\n```\n\n' : '') +
      'ANTWORTFORMAT – gib NUR dieses JSON zurück (ohne Erklärungen):\n' +
      '```json\n{\n  "id": "' + (existing ? existing.id : 'kurze-id-in-kleinbuchstaben') + '",\n  "name": "Name des Designs",\n  "desc": "Ein Satz Beschreibung",\n  "base": "' + base + '",\n' +
      '  "paper": "#ffffff",\n  "ink": "#1c1a19",\n  "accent": "#8a7f76",\n  "script": "Allura",\n  "serif": "The Seasons",\n  "cover": "<HTML des Deckblatts mit {{platzhaltern}}>",\n  "css": "<CSS, jede Regel beginnt mit .d-ID>"\n}\n```';
  }

  function parseAnswer(raw) {
    raw = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    var s1 = raw.indexOf('{'), s2 = raw.lastIndexOf('}');
    var o = JSON.parse(raw.slice(s1, s2 + 1));
    if (!o.cover && !o.css) throw new Error('Antwort enthält weder "cover" noch "css".');
    return o;
  }

  // opt: { existing, onSave(design) }
  function open(opt) {
    opt = opt || {};
    var existing = opt.existing || null;
    var box = UI.modal('<h2>Design-Studio</h2><p class="hint">1. Wunsch beschreiben · 2. Prompt kopieren und in ChatGPT (oder Claude) einfügen · 3. Die JSON-Antwort hier einfügen · 4. Ansehen und speichern.</p>' +
      '<label>Dein Wunsch<textarea id="aiWish" rows="3" placeholder="z. B. Boho-Stil mit Terrakotta, großes rundes Foto, Namen in Schreibschrift, viel Weißraum"></textarea></label>' +
      '<label>Basis-Layout für Innenseiten<select id="aiBase">' + PP.DESIGNS.map(function (b) { return '<option value="' + b.id + '"' + (existing && existing.base === b.id ? ' selected' : '') + '>' + b.name + '</option>'; }).join('') + '</select></label>' +
      '<div class="row"><button class="btn" id="aiCopy" type="button">Prompt kopieren</button><button class="btn ghost" id="aiShow" type="button">Prompt anzeigen</button></div>' +
      '<textarea class="code prompt-box hide" id="aiPrompt" rows="10" readonly></textarea>' +
      '<label>Antwort der KI (JSON) einfügen<textarea class="code" id="aiAns" rows="8" spellcheck="false" placeholder="{ &quot;id&quot;: …, &quot;cover&quot;: …, &quot;css&quot;: … }"></textarea></label>' +
      '<div class="row"><button class="btn" id="aiApply" type="button">Übernehmen &amp; ansehen</button><button class="btn ghost" id="aiClose" type="button">Schließen</button></div><div class="status" id="aiSt"></div>', { wide: true });
    function prompt() { return buildPrompt($('#aiWish', box).value, $('#aiBase', box).value, existing); }
    $('#aiShow', box).onclick = function () { var t = $('#aiPrompt', box); t.value = prompt(); t.classList.toggle('hide'); };
    $('#aiCopy', box).onclick = function () {
      var t = prompt(); $('#aiPrompt', box).value = t;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { UI.toast('Prompt kopiert – jetzt in ChatGPT einfügen'); })
        .catch(function () { var a = $('#aiPrompt', box); a.classList.remove('hide'); a.select(); document.execCommand('copy'); UI.toast('Prompt kopiert'); });
    };
    $('#aiClose', box).onclick = UI.close;
    $('#aiApply', box).onclick = function () {
      var st = $('#aiSt', box), o;
      try { o = parseAnswer($('#aiAns', box).value); } catch (e) { st.className = 'status err'; st.textContent = 'Kein gültiges JSON: ' + e.message; return; }
      var oldId = o.id;
      o.id = existing ? existing.id : uniqueId(o.id || o.name || 'design');
      if (oldId && oldId !== o.id && o.css) o.css = o.css.split('.d-' + oldId).join('.d-' + o.id);
      if (!PP.DESIGNS.filter(function (b) { return b.id === o.base; })[0]) o.base = $('#aiBase', box).value;
      o.enabled = true;
      UI.close();
      if (opt.onSave) opt.onSave(o, existing);
    };
  }

  window.Studio = { open: open, buildPrompt: buildPrompt, parseAnswer: parseAnswer, uniqueId: uniqueId, SCRIPTS: SCRIPTS, SERIFS: SERIFS };
})();
