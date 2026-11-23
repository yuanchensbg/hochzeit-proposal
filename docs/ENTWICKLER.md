# Entwickler-Dokumentation

Statische Web-App ohne Build-Schritt. Läuft auf GitHub Pages (Branch `main`, Ordner `/`) und lokal über jeden Static-Server.
Externe Abhängigkeiten (gepinnt, nur bei Bedarf geladen): `html2canvas 1.4.1`, `jspdf 2.5.1` (cdnjs), Google Fonts.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Kunden-App (lädt **kein** `dev.js`) |
| `admin.html` | Admin-App (`window.APP_MODE = 'admin'`, lädt zusätzlich `dev.js`) |
| `config.js` | `window.APP_CONFIG = {…}` – Studio, Texte, Pakete, Designs, Rechte, Version, Changelog. Wird von der Admin-App geschrieben. Cache-Busting über `?v=Date.now()` |
| `logos.js` | `window.APP_LOGOS = {full, mark, word}` – einfarbige SVGs (`fill` wird je Design ersetzt) |
| `designs.js` | Renderer `PP.render(draft, cfg, photos, opt)` → HTML der A4-Seiten; 5 mehrseitige + 10 zweiseitige („Duo“) Designs; Custom-Design-Templates; Logo-Rasterung |
| `designs.css` | Seiten-Styles aller Designs (eine Seite = 794 × 1123 px) |
| `store.js` | IndexedDB (`proposals`, `photos`, `kv`), GitHub-API-Client, Cloud-Funktionen (privates Daten-Repo) |
| `photos.js` | UI-Helfer (`UI.modal/toast/busy`), Foto-Datenbank, Bildbearbeitung (Filter, Zuschneiden, Drehen, Fokus) |
| `studio.js` | Design-Studio: KI-Prompt-Builder, JSON-Import |
| `app.js` | Oberfläche (Shell wird per JS erzeugt), Angebote, Status/Versionen, Sync, Vorschau, Export (PDF/WhatsApp/E-Mail), PWA-Installation |
| `dev.js` | Admin: lokale Arbeitskopie der Config, PIN, Veröffentlichen (Git Data API, ein Commit), Editoren, Rechte, Datei-Editor |
| `app.css` | App-Oberfläche (Desktop ≥ 900 px: Formular links, Vorschau rechts; Handy: Schritte mit Leiste unten) |
| `sw.js` | Service Worker: Netzwerk zuerst, Cache als Offline-Fallback; `api.github.com` wird nie gecacht |
| `manifest.webmanifest`, `admin.webmanifest` | PWA-Manifeste (getrennte Start-URLs) |
| `assets/` | `logo/*.svg`, `icons/*.png`, `fonts/*` |

Ladereihenfolge: `logos.js` → `config.js` → `designs.js` → `store.js` → `photos.js` → `studio.js` → `app.js` (→ `dev.js`).

## Datenmodell

**Angebot** (IndexedDB `proposals`, Cloud `proposals/<id>.json`):
```
{ id, created, updated, status, design, logo: 'auto'|'full'|'mark'|'word'|'none', style: {paper,ink,accent,script,serif}|null,
  name1, name2, date (ISO), venue, offerDate, clientEmail, clientPhone, note,
  content: <Kopie von config.defaults>, msg: {whatsapp, emailSubject, emailBody},
  slots: { cover, about, gallery:[3] }  // slot = { photoId, edit:{preset,b,c,s,w,f,rot,crop:{x,y,w,h}}, focus:{x,y} }
  versions: [{ n, at, note, snap }], log: [{ at, type, text }], cloudSha, dirty }
```
**Foto** (IndexedDB `photos`, Cloud `photos/<id>.jpg` + `.json`): `{ id, name, added, w, h, fav, tags, blob (≤2400 px JPEG), thumb, cloud, cloudSha }`.
Bearbeitungen werden nicht ins Foto geschrieben, sondern pro Angebot im Slot gespeichert und beim Rendern angewendet.

**Config** (`config.js`): `appVersion, changelog, studio, pinHash, defaultDesign, customDesigns, clientPermissions, designs{id:{enabled,paper,ink,accent,script,serif,css}}, defaults, textIdeas, messages, github`.

## Rendering & PDF

- `PP.render` liefert `<div class="pp d-<id>">` mit `.page`-Elementen. Innenseiten haben `.pc` (Inhalt), das `App.fit()` verkleinert (Schrift in `em`), bis nichts überläuft; Paketkarten werden zusätzlich so skaliert, dass kein Wort umbricht.
- PDF: Seiten werden unskaliert in `#exportRoot` gerendert, mit html2canvas (Faktor 2) gerastert und mit jsPDF als A4 zusammengesetzt.
- html2canvas zeichnet keine SVG-`<img>` zuverlässig und ignoriert `filter`/`mix-blend-mode`/`clip-path` → Logos und Ranken werden über `PP.prepare(cfg, extraColors)` vorab als PNG gerastert; Formen nur mit `border-radius`.
- Vorschau: `zoom` auf `.page` (`--z`); Galerie-Thumbnails per `ResizeObserver` skaliert.

## Eigene Designs

`config.customDesigns[]` (Admin) bzw. `designs/client-designs.json` im Daten-Repo (Kundin, IDs mit Präfix `k-`):
`{ id, name, desc, base, enabled, paper, ink, accent, script, serif, cover (HTML mit {{platzhaltern}}), css }`.
Innenseiten kommen vom Basis-Layout `base`. Platzhalter: `PP.TEMPLATE_KEYS`. CSS wird in `<style id="customCss">` eingefügt.

## Veröffentlichen

`dev.js → publish()`: Git Data API (`refs → commits → blobs → trees → commit → PATCH ref`) = ein Commit pro Version.
Datei-Editor nutzt denselben Weg. Cloud-Schreibzugriffe nutzen die Contents API (`PUT /contents/<path>` mit `sha`).

## Lokal testen

```powershell
npx --yes http-server "C:\…\hochzeit-proposal" -p 8770 -c-1
```
Dann `http://localhost:8770/` (Kunden-App) bzw. `/admin.html` (PIN 1234). Service Worker und PIN-Hash brauchen `http(s)`, nicht `file://`.

## Regeln für Änderungen

- Neue Texte für die Oberfläche: Deutsch; Code und Kommentare: Englisch.
- Neue Seiten-Elemente: nur Eigenschaften, die html2canvas kann (kein `filter`, `clip-path`, `mask`, Blend-Modes).
- Jede Änderung, die Kundinnen sehen, über die Admin-App veröffentlichen → Version steigt, Changelog wird geführt.
- `CHANGELOG.md` und diese Doku bei Funktionsänderungen mitpflegen.
