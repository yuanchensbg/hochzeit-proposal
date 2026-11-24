/* Proposal renderer: turns a draft + config into A4 page HTML (794 x 1123 px per page).
   Each design shares the page structure; covers are design-specific, the rest is styled in designs.css. */
(function () {
  'use strict';

  var DESIGNS = [
    { id: 'classic',   name: 'Classic Script',  desc: 'Weiß, Schreibschrift-Titel, gerahmtes Foto' },
    { id: 'editorial', name: 'Editorial',       desc: 'Magazin-Look, Großbuchstaben, Monogramm-Siegel' },
    { id: 'fineart',   name: 'Fine Art Sand',   desc: 'Warmes Beige, Bogen-Foto, Goldlinien' },
    { id: 'modern',    name: 'Modern Minimal',  desc: 'Vollflächiges Foto, Schwarz-Weiß, Raster' },
    { id: 'blush',     name: 'Romantic Blush',  desc: 'Zartes Rosé, ovales Foto, Blütenranken' }
  ];

  var MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(s, v) {
    return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null && v[k] !== '' ? v[k] : m; });
  }
  function paras(s, v) {
    return fmt(s, v).split(/\n\s*\n/).map(function (p) {
      return p.trim() ? '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>' : '';
    }).join('');
  }
  function dateLong(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return (+p[2]) + '. ' + MONTHS[(+p[1]) - 1] + ' ' + p[0];
  }
  function dateShort(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso;
  }
  function addDays(iso, n) {
    var d = iso ? new Date(iso + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + (+n || 0));
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function vars(dr, cfg) {
    var s = cfg.studio || {}, c = dr.content || {};
    var n1 = dr.name1 || 'Name', n2 = dr.name2 || 'Name';
    return {
      name1: n1, name2: n2, namen: n1 + ' & ' + n2,
      datum: dateLong(dr.date) || 'eurem Hochzeitstag', datumKurz: dateShort(dr.date),
      ort: dr.venue || 'eurer Location', studio: (s.name || '') + (s.tagline ? ' ' + s.tagline : ''),
      owner: s.owner || s.name || '', angebotsdatum: dateLong(dr.offerDate),
      gueltig: dateLong(addDays(dr.offerDate, c.validDays || 30))
    };
  }

  // SVG sources are rasterised to PNG once (prepare) because html2canvas (PDF) does not draw SVG images reliably.
  var svgCache = {}, pngCache = {};
  function logoSvg(kind, color) {
    var svg = (window.APP_LOGOS || {})[kind] || '';
    return svg.replace(/fill="#[0-9a-fA-F]{3,6}"/, 'fill="' + color + '"');
  }
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function logoSrc(kind, color) {
    var key = 'logo|' + kind + '|' + color;
    return pngCache[key] || svgCache[key] || (svgCache[key] = svgUrl(logoSvg(kind, color)));
  }
  function rasterise(key, svg, widthPx) {
    if (pngCache[key]) return Promise.resolve();
    var m = svg.match(/viewBox="([\d.\s-]+)"/), vb = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 300, 300];
    var w = widthPx, h = Math.round(widthPx * vb[3] / vb[2]);
    var sized = svg.replace('<svg ', '<svg width="' + w + '" height="' + h + '" ');
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h); pngCache[key] = c.toDataURL('image/png');
        } catch (e) { /* keep SVG */ }
        res();
      };
      img.onerror = function () { res(); };
      img.src = svgUrl(sized);
    });
  }
  // Rasterise every logo/sprig colour the current config can use.
  function prepare(cfg, extra) {
    var colors = { '#ffffff': 1, '#1c1a19': 1 }, accents = {};
    DUO.forEach(function (d) { colors[d.ink] = 1; accents[d.accent] = 1; });
    if (extra) { if (extra.ink) colors[extra.ink] = 1; if (extra.accent) accents[extra.accent] = 1; }
    Object.keys(cfg.designs || {}).forEach(function (k) { var d = cfg.designs[k] || {}; if (d.ink) colors[d.ink] = 1; if (d.accent) accents[d.accent] = 1; });
    (cfg.customDesigns || []).forEach(function (d) { if (d.ink) colors[d.ink] = 1; if (d.accent) accents[d.accent] = 1; });
    var jobs = [];
    Object.keys(colors).forEach(function (col) {
      ['full', 'mark', 'word'].forEach(function (k) { jobs.push(rasterise('logo|' + k + '|' + col, logoSvg(k, col), k === 'word' ? 1400 : 900)); });
    });
    Object.keys(accents).forEach(function (a) { jobs.push(rasterise('sprig|' + a, sprigSvg(a), 900)); });
    return Promise.all(jobs);
  }
  var LOGO_OVERRIDE = 'auto';
  function logo(kind, color, cls) {
    cls = cls || '';
    if (LOGO_OVERRIDE === 'none') return '';
    if (LOGO_OVERRIDE !== 'auto' && /cv-logo|end-logo|cv-word|du-logo|du-mark/.test(cls)) kind = LOGO_OVERRIDE;
    return '<img class="lg lg-' + kind + ' ' + (cls || '') + '" alt="" src="' + logoSrc(kind, color) + '">';
  }

  function sprigSvg(color) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round">' +
      '<path d="M10 290 C 70 220, 110 160, 150 110 S 230 30, 290 12"/>' +
      '<path d="M60 230 C 40 200, 45 175, 70 160 C 80 190, 78 210, 60 230Z"/>' +
      '<path d="M95 185 C 115 165, 140 165, 160 178 C 140 196, 115 198, 95 185Z"/>' +
      '<path d="M120 150 C 100 120, 105 95, 130 80 C 140 110, 138 130, 120 150Z"/>' +
      '<path d="M165 105 C 190 90, 215 95, 230 110 C 205 125, 185 122, 165 105Z"/>' +
      '<path d="M200 60 C 190 35, 200 18, 222 10 C 228 32, 222 48, 200 60Z"/>' +
      '<circle cx="250" cy="45" r="5"/><circle cx="268" cy="62" r="3.5"/><circle cx="235" cy="70" r="3"/>' +
      '<path d="M30 268 C 18 250, 22 238, 38 230"/></svg>';
  }
  function sprig(color) { return pngCache['sprig|' + color] || svgUrl(sprigSvg(color)); }

  function photo(url, focus, cls) {
    var f = focus || { x: 50, y: 50 };
    if (!url) return '<div class="ph ph-empty ' + (cls || '') + '"></div>';
    return '<div class="ph ' + (cls || '') + '" style="background-image:url(\'' + url + '\');background-position:' + f.x + '% ' + f.y + '%"></div>';
  }

  function head(n, title) {
    return '<div class="sh"><span class="sh-num">' + ('0' + n).slice(-2) + '</span><h2>' + esc(title) + '</h2></div>';
  }
  function list(items) {
    return '<ul class="ls">' + (items || []).filter(Boolean).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  /* ---------- covers ---------- */
  var COVERS = {
    classic: function (ctx) {
      var v = ctx.v, c = ctx.c, d = ctx.ds;
      return '<div class="cv">' +
        '<h1 class="cv-title">' + esc(c.title) + '</h1>' +
        '<div class="cv-frame">' + photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo') + '</div>' +
        '<div class="cv-namebox"><div class="cv-names">' + esc(v.namen) + '</div>' +
        '<div class="cv-meta">' + esc([v.datumKurz, ctx.dr.venue].filter(Boolean).join('  ·  ')) + '</div></div>' +
        logo('full', d.ink, 'cv-logo') + '</div>';
    },
    editorial: function (ctx) {
      var v = ctx.v, c = ctx.c, d = ctx.ds, s = ctx.cfg.studio || {};
      return '<div class="cv">' +
        '<div class="cv-kicker">' + esc(c.subtitle || s.tagline) + '</div>' +
        '<h1 class="cv-title">' + esc(c.title) + '</h1>' +
        '<div class="cv-seal">' + logo('mark', d.ink) + '</div>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo') +
        '<div class="cv-cols">' +
          '<div><b>Datum</b><span>' + esc(v.datum) + '</span><span>' + esc(ctx.dr.venue || '') + '</span></div>' +
          '<div><b>Erstellt von</b><span>' + esc(v.studio) + '</span><span>' + esc(s.email || '') + '</span><span>' + esc(s.web || '') + '</span></div>' +
          '<div><b>Erstellt für</b><span>' + esc(v.namen) + '</span><span>' + esc(v.angebotsdatum) + '</span></div>' +
        '</div></div>';
    },
    fineart: function (ctx) {
      var v = ctx.v, c = ctx.c, d = ctx.ds;
      return '<div class="cv">' + logo('mark', d.ink, 'cv-mark') +
        '<h1 class="cv-title">' + esc(c.title) + '</h1><div class="cv-rule"></div>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo') +
        '<div class="cv-namebox"><div class="cv-names">' + esc(v.name1) + ' <i>&amp;</i> ' + esc(v.name2) + '</div>' +
        '<div class="cv-meta">' + esc(v.datum) + '</div>' +
        '<div class="cv-meta2">' + esc(ctx.dr.venue || '') + '</div></div>' +
        logo('word', d.ink, 'cv-logo') + '</div>';
    },
    modern: function (ctx) {
      var v = ctx.v, c = ctx.c;
      return '<div class="cv">' + photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo') + '<div class="cv-shade"></div>' +
        (LOGO_OVERRIDE === 'auto' ? logo('mark', '#ffffff', 'cv-mark') : '') +
        '<div class="cv-text"><div class="cv-kicker">' + esc(c.title) + '</div>' +
        '<h1 class="cv-names">' + esc(v.name1) + '<br>&amp; ' + esc(v.name2) + '</h1>' +
        '<div class="cv-line"></div>' +
        '<div class="cv-meta">' + esc([v.datum, ctx.dr.venue].filter(Boolean).join('  —  ')) + '</div></div>' +
        logo('word', '#ffffff', 'cv-word') + '</div>';
    },
    blush: function (ctx) {
      var v = ctx.v, c = ctx.c, d = ctx.ds, sp = sprig(d.accent);
      return '<div class="cv"><img class="sprig sp-tl" alt="" src="' + sp + '"><img class="sprig sp-br" alt="" src="' + sp + '">' +
        '<div class="cv-kicker">' + esc(c.title) + '</div>' +
        '<h1 class="cv-names">' + esc(v.name1) + ' &amp; ' + esc(v.name2) + '</h1>' +
        '<div class="cv-oval">' + photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo') + '</div>' +
        '<div class="cv-meta">' + esc(v.datum) + '</div>' +
        '<div class="cv-meta2">' + esc(ctx.dr.venue || '') + '</div>' +
        logo('full', d.ink, 'cv-logo') + '</div>';
    }
  };

  /* ---------- inner pages ---------- */
  function inner(ctx, body, extraCls) {
    var d = ctx.ds, s = ctx.cfg.studio || {};
    ctx.page++;
    return '<div class="page inner ' + (extraCls || '') + '">' +
      '<div class="hd">' + logo(ctx.id === 'modern' ? 'word' : 'mark', d.ink, 'hd-logo') + '</div>' +
      '<div class="pc"><div class="pcw">' + body + '</div></div>' +
      '<div class="ft"><span>' + esc(s.web || s.email || '') + '</span><span>' + ctx.page + '</span></div></div>';
  }

  function aboutPage(ctx) {
    var c = ctx.c, v = ctx.v;
    return inner(ctx,
      '<div class="intro">' + paras(c.intro, v) + '</div>' +
      '<div class="about">' + photo(ctx.ph.about, ctx.ph.aboutFocus, 'about-photo') +
      '<div class="about-txt">' + head(ctx.n++, c.aboutTitle) + paras(c.about, v) +
      (c.signature ? '<div class="sig">' + esc(c.signature) + '</div>' : '') + '</div></div>', 'p-about');
  }

  // Visible packages: switched on and not empty (an emptied package is not an option).
  function shownPackages(c) {
    return (c.packages || []).filter(function (p) {
      return p && p.show !== false && (String(p.name || '').trim() || String(p.price || '').trim());
    });
  }
  function packagesPage(ctx, withIntro) {
    var c = ctx.c, v = ctx.v;
    var pk = shownPackages(c), n = pk.length;
    var layout = n <= 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : 'many';
    var anyFeat = n > 1 && pk.some(function (p) { return p.featured; });   // a single package needs no "recommended" badge
    var cards = pk.map(function (p) {
      var feat = n > 1 && p.featured;
      var head = (feat ? '<div class="pk-badge">' + esc(c.featuredLabel || 'Empfehlung') + '</div>' : (anyFeat ? '<div class="pk-badge ph">&nbsp;</div>' : '')) +
        '<div class="pk-name">' + esc(p.name) + '</div><div class="pk-hours">' + esc(p.hours) + '</div><div class="pk-price">' + esc(p.price) + '</div>';
      return '<div class="pk' + (feat ? ' pk-feat' : '') + '">' + (n <= 1 ? '<div class="pk-main">' + head + '</div><div class="pk-body">' + list(p.items) + '</div>' : head + list(p.items)) + '</div>';
    }).join('');
    var title = n <= 1 ? (c.packagesTitleSingle || 'Euer Paket') : c.packagesTitle;
    var intro = n <= 1 ? (c.packagesIntroSingle != null ? c.packagesIntroSingle : '') : c.packagesIntro;
    return inner(ctx,
      (withIntro ? '<div class="intro">' + paras(c.intro, v) + '</div>' : '') +
      head(ctx.n++, title) + (intro ? '<div class="lead">' + paras(intro, v) + '</div>' : '') +
      '<div class="pks pks-' + layout + '">' + cards + '</div>', 'p-packages');
  }

  function timelineHTML(ctx) {
    var c = ctx.c;
    return head(ctx.n++, c.timelineTitle) + '<div class="tl">' + (c.timeline || []).filter(function (t) { return t && (t.time || t.label); }).map(function (t) {
      return '<div class="tl-row"><span class="tl-time">' + esc(t.time) + '</span><span class="tl-dot"></span><span class="tl-label">' + esc(t.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function detailsPage(ctx) {
    var c = ctx.c, sec = c.sections || {}, body = '';
    if (sec.details !== false) {
      body += '<div class="two"><div>' + head(ctx.n++, c.servicesTitle) + list(c.services) + '</div>' +
        '<div>' + head(ctx.n++, c.deliveryTitle) + list(c.delivery) + '</div></div>';
    }
    if (sec.timeline !== false) body += timelineHTML(ctx);
    return inner(ctx, body, 'p-details');
  }

  function thanksPage(ctx) {
    var c = ctx.c, v = ctx.v, s = ctx.cfg.studio || {};
    var gal = (ctx.ph.gallery || []).filter(function (g) { return g && g.url; });
    var contact = [
      s.owner && ['Fotografin', s.owner], s.phone && ['Telefon', s.phone], s.email && ['E-Mail', s.email],
      s.web && ['Web', s.web], s.instagram && ['Instagram', s.instagram], s.address && ['Adresse', s.address]
    ].filter(Boolean).map(function (r) { return '<div><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>'; }).join('');
    return inner(ctx,
      (c.payment ? head(ctx.n++, c.paymentTitle) + '<div class="lead">' + paras(c.payment, v) + '</div>' : '') +
      (c.validity ? '<div class="valid">' + esc(fmt(c.validity, v)) + '</div>' : '') +
      (gal.length ? '<div class="gal">' + gal.slice(0, 3).map(function (g) { return photo(g.url, g.focus, 'gal-ph'); }).join('') + '</div>' : '') +
      '<div class="thx"><div class="thx-title">' + esc(c.thanksTitle) + '</div>' + paras(c.thanks, v) + '</div>' +
      '<div class="contact">' + contact + '</div>' +
      logo('full', ctx.ds.ink, 'end-logo'), 'p-thanks');
  }

  /* ---------- "Duo" designs: 2 pages (cover + offer page), from the 10-draft collection ---------- */
  var DUO = [
    { id: 'mr-editorial', name: 'Editorial Minimal', desc: 'Foto rechts in voller Höhe, klare Typo', paper: '#f6f3ee', ink: '#171717', accent: '#b89a72', serif: 'Georgia' },
    { id: 'mr-arch',      name: 'Blush Arch',        desc: 'Rosé, Bogenfoto, zentriert',            paper: '#f7efec', ink: '#312725', accent: '#b97878', serif: 'Georgia' },
    { id: 'mr-black',     name: 'Luxury Black',      desc: 'Schwarz mit Gold, großes Panorama',     paper: '#11100f', ink: '#f4eee5', accent: '#c6a36a', serif: 'Times New Roman' },
    { id: 'mr-bordeaux',  name: 'Bordeaux Classic',  desc: 'Rahmen, ovales Foto, Bordeaux',         paper: '#f5f0e8', ink: '#4c1723', accent: '#a8895d', serif: 'Georgia' },
    { id: 'mr-sage',      name: 'Botanical Sage',    desc: 'Salbeigrün, Blattform, Fotostreifen',   paper: '#eef0e9', ink: '#26342c', accent: '#849078', serif: 'Georgia' },
    { id: 'mr-grid',      name: 'Modern Grid',       desc: 'Raster, große Zahl, Senfgelb',          paper: '#faf9f6', ink: '#101010', accent: '#d8a243', serif: 'Georgia' },
    { id: 'mr-ivory',     name: 'Fine Art Ivory',    desc: 'Elfenbein, Hochformat-Porträt',         paper: '#fbf6eb', ink: '#332d28', accent: '#c4ad8b', serif: 'Times New Roman' },
    { id: 'mr-cinema',    name: 'Cinematic',         desc: 'Dunkel, Breitbild-Foto, Film-Look',     paper: '#1b2021', ink: '#f0e8dc', accent: '#9b654e', serif: 'Georgia' },
    { id: 'mr-swiss',     name: 'Swiss Typography',  desc: 'Schweizer Raster, rote Linie',          paper: '#f1f1ef', ink: '#131313', accent: '#cd4d3c', serif: 'Georgia' },
    { id: 'mr-lilac',     name: 'Soft Lilac',        desc: 'Flieder, Polaroid, Kreisform',          paper: '#f3f0f4', ink: '#302b36', accent: '#9a839e', serif: 'Georgia' }
  ];
  var DUO_BY = {};
  DUO.forEach(function (d) { DUO_BY[d.id] = d; });

  var DUO_COVER_HAS_LOGO = { 'mr-swiss': 1, 'mr-arch': 1, 'mr-black': 1, 'mr-sage': 1, 'mr-ivory': 1, 'mr-cinema': 1, 'mr-lilac': 1 };
  function duoFooter(ctx, n) {
    var s = ctx.cfg.studio || {}, left;
    if (n > 1) left = '<span>' + esc([s.web, s.email].filter(Boolean).join('  ·  ')) + '</span>';
    else left = DUO_COVER_HAS_LOGO[ctx.id] && LOGO_OVERRIDE !== 'none' ? '<span></span>' : logo('word', ctx.ds.ink, 'du-foot-logo');
    return '<div class="du-foot">' + left + '<span>' + ('0' + n).slice(-2) + '</span></div>';
  }
  function duoMeta(ctx, sep) {
    return esc([ctx.v.datum, ctx.dr.venue].filter(Boolean).join(sep || ' · '));
  }
  var DUO_COVERS = {
    'mr-editorial': function (ctx) {
      return photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div class="du-copy"><div class="eyebrow">Persönliches Angebot</div><h1>Hochzeits<br>fotografie</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p>' +
        '<div class="du-meta"><span>' + esc(ctx.v.datum) + '</span><span>' + esc(ctx.dr.venue || '') + '</span></div></div>';
    },
    'mr-arch': function (ctx) {
      return photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') + logo('word', ctx.ds.ink, 'du-logo') +
        '<div class="du-copy"><div class="eyebrow">Eure Geschichte in Bildern</div><h1>' + esc(ctx.v.namen) + '</h1><p>' + duoMeta(ctx) + '</p></div>';
    },
    'mr-black': function (ctx) {
      return '<div class="du-top">' + logo('word', ctx.ds.ink, 'du-logo') + '<div class="eyebrow">Wedding Collection</div></div>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div class="du-copy"><h1>Timeless<br>Moments</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p><p class="du-accent">' + duoMeta(ctx) + '</p></div>';
    },
    'mr-bordeaux': function (ctx) {
      return '<div class="du-frame">' + logo('mark', ctx.ds.ink, 'du-mark') + '<div class="eyebrow">Hochzeitsreportage</div><h1>Ein Tag.<br>Für immer.</h1>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') + '<p class="du-couple">' + esc(ctx.v.namen) + '</p><p>' + duoMeta(ctx) + '</p></div>';
    },
    'mr-sage': function (ctx) {
      return '<div class="du-leaf"></div><div class="du-copy"><div class="eyebrow">Natürlich · Echt · Zeitlos</div><h1>Hochzeits<br>angebot</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p><p>' + duoMeta(ctx) + '</p></div>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') + logo('word', ctx.ds.ink, 'du-logo');
    },
    'mr-grid': function (ctx) {
      var s = ctx.cfg.studio || {};
      return '<div class="du-grid"><div class="du-num">01</div><div><div class="eyebrow">' + esc((s.name || '') + ' ' + (s.tagline || '')) + '</div><h1>HOCHZEITS<br>ANGEBOT</h1></div>' +
        logo('mark', ctx.ds.ink, 'du-mark') + photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div></div><div class="du-meta"><b>' + esc(ctx.v.namen) + '</b><span>' + esc(ctx.v.datum) + '</span><span>' + esc(ctx.dr.venue || '') + '</span></div></div>';
    },
    'mr-ivory': function (ctx) {
      return logo('word', ctx.ds.ink, 'du-logo') + photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div class="du-copy"><div class="eyebrow">Eine Sammlung echter Augenblicke</div><h1>Für eure<br>Geschichte</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p><p class="du-muted">' + duoMeta(ctx) + '</p></div>';
    },
    'mr-cinema': function (ctx) {
      return photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div class="du-copy"><div class="eyebrow">Hochzeitsreportage</div><h1>Love,<br>documented.</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p><div class="du-rule"></div>' +
        '<p>' + esc(ctx.v.datum) + '<br>' + esc(ctx.dr.venue || '') + '</p></div>' + logo('word', ctx.ds.ink, 'du-logo');
    },
    'mr-swiss': function (ctx) {
      return '<div class="du-swiss"><div class="eyebrow">01 / Angebot</div>' + logo('mark', ctx.ds.ink, 'du-mark') + '<h1>Hochzeit<br>in Bildern.</h1><div class="du-red"></div>' +
        photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') +
        '<div class="du-meta"><b>' + esc(ctx.v.namen) + '</b><span>' + esc(ctx.v.datum) + '</span><span>' + esc(ctx.dr.venue || '') + '</span></div></div>';
    },
    'mr-lilac': function (ctx) {
      return '<div class="du-halo"></div><div class="du-copy"><div class="eyebrow">Von Herzen begleitet</div><h1>Mein Blick<br>für euren Tag</h1><p class="du-couple">' + esc(ctx.v.namen) + '</p><p>' + duoMeta(ctx) + '</p></div>' +
        '<div class="du-polaroid">' + photo(ctx.ph.cover, ctx.ph.coverFocus, 'du-photo') + '</div>' + logo('word', ctx.ds.ink, 'du-logo');
    }
  };

  function duoDetails(ctx) {
    var c = ctx.c, v = ctx.v, s = ctx.cfg.studio || {};
    var pk = shownPackages(c);
    var main = pk.filter(function (p) { return p.featured; })[0] || pk[0] || {};
    var services = (main.items && main.items.length ? main.items : c.services) || [];
    var extras = pk.length < 2 ? [] : pk.filter(function (p) { return p !== main; }).map(function (p) { return p.name + (p.hours ? ' (' + p.hours + ')' : '') + ' · ' + p.price; });
    var tl = (c.timeline || []).filter(function (t) { return t && (t.time || t.label); });
    var closing = fmt(c.closing || 'Ich freue mich darauf,\neure Geschichte festzuhalten.', v);
    return '<div class="page du-details">' +
      '<div class="du-head"><div><div class="eyebrow">Euer persönliches Angebot</div><h2>' + esc(main.name || c.packagesTitle || c.title) + '</h2></div>' + logo('word', ctx.ds.ink, 'du-head-logo') + '</div>' +
      '<div class="du-hr"></div>' +
      '<div class="pc" data-fs="12.5"><div class="pcw">' +
        '<div class="du-intro"><div class="du-body">' + paras(c.intro, v) + '</div>' +
        '<div class="du-invest"><div class="eyebrow">' + esc(c.paymentTitle || 'Investition') + '</div><div class="du-price">' + esc(main.price || '') + '</div><div class="du-small">' + esc(main.hours || '') + '</div></div></div>' +
        '<div class="du-cols"><section><div class="eyebrow">Enthalten</div><ul class="du-list">' + services.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></section>' +
        '<section>' + (tl.length ? '<div class="eyebrow">' + esc(c.timelineTitle || 'Euer Ablauf') + '</div><ol class="du-tl">' + tl.map(function (t) { return '<li><span>' + esc(t.time) + '</span>' + esc(t.label) + '</li>'; }).join('') + '</ol>' : '') +
        (extras.length ? '<div class="du-extras"><div class="eyebrow">Weitere Optionen</div><ul class="du-list du-small">' + extras.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>' : '') + '</section></div>' +
        (c.payment ? '<p class="du-small du-pay">' + esc(fmt(c.payment, v)) + '</p>' : '') +
        '<div class="du-closing"><h2>' + esc(closing).replace(/\n/g, '<br>') + '</h2><p class="du-small">' + esc(fmt(c.validity || '', v)) + '<br>' + esc([s.web, s.email, s.phone].filter(Boolean).join(' · ')) + '</p></div>' +
      '</div></div>' + duoFooter(ctx, 2) + '</div>';
  }

  /* ---------- public ---------- */
  function designSettings(cfg, id) {
    var d = (cfg.designs || {})[id] || {}, f = DUO_BY[id] || {};
    return {
      paper: d.paper || f.paper || '#ffffff', ink: d.ink || f.ink || '#1c1a19', accent: d.accent || f.accent || '#8a7f76',
      script: d.script || 'Mrs Saint Delafield', serif: d.serif || f.serif || 'The Seasons'
    };
  }
  function styleVars(ds) {
    return '--paper:' + ds.paper + ';--ink:' + ds.ink + ';--accent:' + ds.accent +
      ";--script:'" + ds.script + "',cursive;--serif:'" + ds.serif + "','Cormorant Garamond',Georgia,serif";
  }

  // All designs: built-ins + custom designs from config (dev "Design-Studio").
  function getDesigns(cfg) {
    var list = DESIGNS.concat(DUO).map(function (d) { return { id: d.id, name: d.name, desc: d.desc, builtin: true, duo: !!DUO_BY[d.id] }; });
    (cfg.customDesigns || []).forEach(function (d) {
      if (d && d.id && !COVERS[d.id] && !DUO_BY[d.id]) list.push({ id: d.id, name: d.name || d.id, desc: d.desc || '', builtin: false, base: d.base || 'classic' });
    });
    return list;
  }
  function customDesign(cfg, id) {
    return (cfg.customDesigns || []).filter(function (d) { return d && d.id === id; })[0] || null;
  }
  // Cover template: {{key}} placeholders, see TEMPLATE_KEYS.
  var TEMPLATE_KEYS = ['title', 'subtitle', 'name1', 'name2', 'namen', 'datum', 'datumKurz', 'ort', 'studio', 'owner', 'email', 'phone', 'web', 'instagram',
    'photo', 'logo_full', 'logo_mark', 'logo_word', 'logo_full_white', 'logo_mark_white', 'logo_word_white', 'sprig'];
  function coverFromTemplate(tpl, ctx) {
    var v = ctx.v, c = ctx.c, d = ctx.ds, s = ctx.cfg.studio || {};
    var map = {
      title: esc(c.title), subtitle: esc(c.subtitle || s.tagline), name1: esc(v.name1), name2: esc(v.name2), namen: esc(v.namen),
      datum: esc(v.datum), datumKurz: esc(v.datumKurz), ort: esc(ctx.dr.venue || ''), studio: esc(v.studio), owner: esc(v.owner),
      email: esc(s.email || ''), phone: esc(s.phone || ''), web: esc(s.web || ''), instagram: esc(s.instagram || ''),
      photo: photo(ctx.ph.cover, ctx.ph.coverFocus, 'cv-photo'),
      logo_full: logo('full', d.ink), logo_mark: logo('mark', d.ink), logo_word: logo('word', d.ink),
      logo_full_white: logo('full', '#ffffff'), logo_mark_white: logo('mark', '#ffffff'), logo_word_white: logo('word', '#ffffff'),
      sprig: '<img class="sprig" alt="" src="' + sprig(d.accent) + '">'
    };
    tpl = String(tpl).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=/gi, ' data-x=');
    return '<div class="cv">' + tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return map[k] != null ? map[k] : m; }) + '</div>';
  }
  // CSS from config: per-design "css" overrides + custom design CSS.
  function designCSS(cfg) {
    var out = '';
    Object.keys(cfg.designs || {}).forEach(function (k) { if (cfg.designs[k] && cfg.designs[k].css) out += '\n' + cfg.designs[k].css; });
    (cfg.customDesigns || []).forEach(function (d) { if (d && d.css) out += '\n' + d.css; });
    return out.replace(/<\/style/gi, '');
  }

  // photos: { cover, coverFocus, about, aboutFocus, gallery: [{url, focus}] }
  function render(dr, cfg, photos, opt) {
    opt = opt || {};
    var id = dr.design || cfg.defaultDesign || 'classic';
    if (DUO_BY[id]) return renderDuo(dr, cfg, photos, opt, id);
    var cd = COVERS[id] ? null : customDesign(cfg, id);
    if (!COVERS[id] && !cd) id = 'classic';
    var base = cd ? (COVERS[cd.base] ? cd.base : 'classic') : id;
    var ds = designSettings(cfg, base);
    if (cd) ['paper', 'ink', 'accent', 'script', 'serif'].forEach(function (k) { if (cd[k]) ds[k] = cd[k]; });
    if (dr.style) ['paper', 'ink', 'accent', 'script', 'serif'].forEach(function (k) { if (dr.style[k]) ds[k] = dr.style[k]; });
    LOGO_OVERRIDE = dr.logo || 'auto';
    var c = dr.content || cfg.defaults || {};
    var sec = c.sections || {};
    var ctx = { id: base, dr: dr, cfg: cfg, c: c, ds: ds, v: vars(dr, cfg), ph: photos || {}, n: 1, page: 1 };
    var out = '<div class="page cover' + (ctx.v.namen.length > 22 ? ' long' : '') + '">' + (cd && cd.cover ? coverFromTemplate(cd.cover, ctx) : COVERS[base](ctx)) + '</div>';
    if (!opt.coverOnly) {
      var introDone = false;
      if (sec.about !== false) { out += aboutPage(ctx); introDone = true; }
      if (sec.packages !== false) { out += packagesPage(ctx, !introDone); introDone = true; }
      if (sec.details !== false || sec.timeline !== false) out += detailsPage(ctx);
      if (sec.thanks !== false) out += thanksPage(ctx);
    }
    return '<div class="pp d-' + base + (cd ? ' d-' + id : '') + '" style="' + styleVars(ds) + '">' + out + '</div>';
  }

  function renderDuo(dr, cfg, photos, opt, id) {
    var ds = designSettings(cfg, id);
    if (dr.style) ['paper', 'ink', 'accent', 'script', 'serif'].forEach(function (k) { if (dr.style[k]) ds[k] = dr.style[k]; });
    LOGO_OVERRIDE = dr.logo || 'auto';
    var c = dr.content || cfg.defaults || {};
    var ctx = { id: id, dr: dr, cfg: cfg, c: c, ds: ds, v: vars(dr, cfg), ph: photos || {}, n: 1, page: 1 };
    var out = '<div class="page cover du-cover' + (ctx.v.namen.length > 22 ? ' long' : '') + '">' + DUO_COVERS[id](ctx) + duoFooter(ctx, 1) + '</div>';
    if (!opt.coverOnly) out += duoDetails(ctx);
    return '<div class="pp duo d-' + id + '" style="' + styleVars(ds) + '">' + out + '</div>';
  }

  window.PP = {
    DESIGNS: DESIGNS, DUO: DUO, getDesigns: getDesigns, designCSS: designCSS, TEMPLATE_KEYS: TEMPLATE_KEYS, render: render,
    prepare: prepare, shownPackages: shownPackages, fmt: fmt, vars: vars, dateLong: dateLong, dateShort: dateShort, addDays: addDays, logoSrc: logoSrc, esc: esc
  };
})();

