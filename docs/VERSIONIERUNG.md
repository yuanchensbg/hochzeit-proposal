# Versionierung

## Schema `Major.Minor`

| Änderung | Beispiel | Neue Version |
|---|---|---|
| Jede Veröffentlichung (Texte, Preise, Designs, Code) | 1.0 → 1.1 → 1.2 … | Minor + 1 |
| Großes Update (Häkchen „Großes Update“) | 1.7 → 2.0 | Major + 1, Minor = 0 |

Aktuelle Version: **1.0** (Erstveröffentlichung).

## Ablauf beim Veröffentlichen

1. Admin-App → *Veröffentlichen & Version* → „Was ist neu?“ ausfüllen (eine Zeile pro Punkt).
2. Optional „Großes Update“ anhaken.
3. „Veröffentlichen als vX.Y“ → **ein** Commit mit:
   - `config.js` (inkl. `appVersion` und `changelog`)
   - `CHANGELOG.md` (automatisch aus dem Changelog erzeugt)
   - ggf. `logos.js`, `assets/about.jpg`, über den Datei-Editor geänderte Dateien
4. Commit-Nachricht: `vX.Y – <Notizen>`. GitHub Pages aktualisiert die App in ca. 1 Minute.

Auch Commits über den **Datei-Editor** erhöhen die Version.

## Wo die Version sichtbar ist

- Kopfzeile beider Apps (`v1.0`), Klick aufs Logo → Version + Neuigkeiten.
- Admin-App → *Veröffentlichen & Version* → Versionsliste.
- `CHANGELOG.md` im Repo, Git-Historie.

## Zurück zu einer älteren Version

Admin-App → *Sicherheit & Backup* → vor großen Änderungen „Konfiguration exportieren“.
Zum Zurücksetzen: Export importieren → als neue Version veröffentlichen.
Alternativ auf GitHub: Commit auswählen → `config.js` → „Revert“.

## Angebots-Versionen (getrennt davon)

Jedes Angebot hat einen eigenen Versionsverlauf (V1, V2 …): siehe Benutzerhandbuch, Kapitel 6.
