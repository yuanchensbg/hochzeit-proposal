# Design-Studio – neue Designs mit KI erstellen

Verfügbar in der Admin-App (*Designs & Design-Studio*) und – wenn freigeschaltet – in der Kunden-App (*Design → Eigene Designs*).

## Ablauf

1. **„✦ Neues Design mit KI-Prompt“** öffnen.
2. Wunsch beschreiben, z. B. „Boho, Terrakotta, rundes Foto, Namen in Schreibschrift, viel Weißraum“.
3. Basis-Layout für die Innenseiten wählen (Classic, Editorial, Fine Art, Modern, Blush).
4. **„Prompt kopieren“** → in ChatGPT oder Claude einfügen.
5. Die JSON-Antwort komplett kopieren → in „Antwort der KI“ einfügen → **„Übernehmen & ansehen“**.
6. In der Vorschau prüfen. Admin: veröffentlichen. Kundin: wird in ihrer Cloud gespeichert.

Bestehende eigene Designs: **„Mit KI überarbeiten“** schickt das aktuelle HTML/CSS mit, die ID bleibt gleich.

## Was der Prompt festlegt

- Seite = 794 × 1123 px (A4), Deckblatt absolut positioniert, Innenseiten nur per CSS gestaltet.
- Alle CSS-Regeln beginnen mit `.d-<id>`; kein JavaScript, keine externen Bilder, kein `transform`, keine Filter.
- Variablen: `--paper`, `--ink`, `--accent`, `--serif`, `--script`, `--sans`.
- Schriften: The Seasons, Cormorant Garamond, Playfair Display, Bodoni Moda · Mrs Saint Delafield, Allura, Great Vibes, Pinyon Script, Parisienne, Herr Von Muellerhoff · Montserrat.

## Platzhalter im Deckblatt

`{{title}} {{subtitle}} {{name1}} {{name2}} {{namen}} {{datum}} {{datumKurz}} {{ort}} {{studio}} {{owner}} {{email}} {{phone}} {{web}} {{instagram}}`
`{{photo}}` (Titelfoto) · `{{logo_full}} {{logo_mark}} {{logo_word}}` (+ `_white`) · `{{sprig}}` (Blütenranke)

## Antwortformat

```json
{
  "id": "boho-terra",
  "name": "Boho Terra",
  "desc": "Terrakotta, rundes Foto",
  "base": "classic",
  "paper": "#f6efe7", "ink": "#4a3328", "accent": "#c0704f",
  "script": "Allura", "serif": "Cormorant Garamond",
  "cover": "<h1 class=\"t\">{{namen}}</h1>{{photo}}{{logo_full}}",
  "css": ".d-boho-terra .t { position:absolute; top:90px; left:0; right:0; text-align:center; font-family:var(--script); font-size:80px; } …"
}
```

## Feinschliff per Hand

Jedes Design (auch die eingebauten) hat ein Feld **Feinschliff-CSS**, z. B.:

```css
.d-classic .cv-title { font-size: 84px; }
.d-mr-black .du-cover h1 { letter-spacing: .02em; }
```
