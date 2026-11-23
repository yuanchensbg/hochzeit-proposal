# Admin-Handbuch – Admin-App (`admin.html`)

Die Admin-App ist eine eigene Seite. Die Kunden-App enthält **keinen** Admin-Code und keinen Link dorthin.
Oben in der Admin-App führt „Kunden-App ↗“ zur einfachen App.

## Zugang

`…/hochzeit-proposal/admin.html` → PIN (Standard **1234**, bitte sofort ändern: *Sicherheit & Backup*).
Die PIN schützt die Oberfläche. Veröffentlichen ist zusätzlich nur mit GitHub-Token möglich.

## Arbeitsweise

Alle Änderungen im Tab **„Entwickler“** wirken sofort in der Vorschau und werden **lokal** gespeichert
(Badge „Nicht veröffentlicht“). Erst **„Veröffentlichen als vX.Y“** schreibt sie nach GitHub. Nach ca. 1 Minute sieht die Kundin sie.
„Lokale Änderungen verwerfen“ setzt auf den veröffentlichten Stand zurück.

## Bereiche

| Bereich | Inhalt |
|---|---|
| Veröffentlichen & Version | GitHub-Token, Repos, Branch, „Verbindung testen“, Änderungsnotiz, „Großes Update“, Versionsliste |
| Studio-Daten | Name, Zusatz, Inhaberin, E-Mail, Telefon, Ländervorwahl (WhatsApp), Website, Instagram, Adresse |
| Standardtexte & Pakete | Vorlagen für **neue** Angebote: Seiten, Titel, Begrüßung, Über mich, Pakete & Preise, Leistungen, Lieferung, Ablauf, Investition, Danke. Standard-Foto „Über mich“. |
| Textvorschläge | Varianten für „Vorschläge ▾“ (Begrüßung, Über mich, Pakete-Einleitung, Zahlung, Danke, WhatsApp, E-Mail) |
| Designs & Design-Studio | je Design: aktiv, Standard, Farben, Schriften, Feinschliff-CSS, „Im aktuellen Angebot ansehen“. Eigene Designs: Deckblatt-HTML + CSS, KI-Prompt (siehe DESIGN-STUDIO.md) |
| Nachrichten-Vorlagen | Standardtexte für WhatsApp, E-Mail-Betreff und -Text |
| Logo | Komplettlogo, Monogramm, Schriftzug als SVG ersetzen (einfarbig; Farbe wird je Design gesetzt) |
| Rechte der Kundin | Logo wählen · Farben/Schriften pro Angebot · eigene Designs anlegen. Designs der Kundin ansehen und als offizielles Design übernehmen. |
| Kollegin verbinden | Verbindungs-Link für die Cloud erzeugen (siehe CLOUD-UND-SICHERHEIT.md) |
| Datei-Editor | Jede Datei im App-Repo laden, bearbeiten und als neue Version committen (Code-Updates direkt aus der App) |
| Sicherheit & Backup | PIN ändern, Konfiguration exportieren/importieren |

## Designs (15)

**Mehrseitig (bis 5 Seiten):** Classic Script, Editorial, Fine Art Sand, Modern Minimal, Romantic Blush.
**Zweiseitig (Deckblatt + Angebotsseite):** Editorial Minimal, Blush Arch, Luxury Black, Bordeaux Classic, Botanical Sage,
Modern Grid, Fine Art Ivory, Cinematic, Swiss Typography, Soft Lilac.

Zweiseitige Designs zeigen das **empfohlene** Paket (sonst das erste) mit Preis; die anderen Pakete erscheinen als „Weitere Optionen“.

## Standard-Rechte der Kundin

| Recht | Standard |
|---|---|
| Logo-Variante wählen | an |
| Farben & Schriften anpassen | aus |
| Eigene Designs anlegen | aus |

Rechte wirken mit der nächsten veröffentlichten Version.
