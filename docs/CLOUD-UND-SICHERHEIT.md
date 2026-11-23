# Cloud & Sicherheit

## Zwei Repositories

| Repo | Sichtbarkeit | Inhalt |
|---|---|---|
| `yuanchensbg/hochzeit-proposal` | **öffentlich** (nötig für GitHub Pages) | App-Code, Konfiguration (Texte, Preise, Designs), Logos, Schriften |
| `yuanchensbg/hochzeit-proposal-data` | **privat** | Angebote (`proposals/*.json` inkl. Versionen), Fotos (`photos/*.jpg` + `*.json`), Designs der Kundin, Lieblingsdesigns |

Kundendaten und Fotos landen **nie** im öffentlichen Repo.

## Tokens (Fine-grained Personal Access Tokens)

github.com → Settings → Developer settings → Fine-grained tokens → *Generate new token*.

| Token | Repos | Rechte | Wo eingeben |
|---|---|---|---|
| Admin | beide | Contents: Read and write | Admin-App → Veröffentlichen & Version |
| Kundin | nur `hochzeit-proposal-data` | Contents: Read and write | über den Verbindungs-Link |

Ablaufdatum: am besten 1 Jahr; vor Ablauf neuen Token erstellen und neu verbinden.

**Warum der Token nicht in die App eingebaut wird:** Das App-Repo ist öffentlich – ein Token im Code wäre für jeden lesbar
und würde Zugriff auf die privaten Kundendaten geben. GitHub erkennt solche Tokens außerdem automatisch und sperrt sie.

## Geräte verbinden

**Empfohlen – verschlüsselt mitliefern:** Admin-App → *Kollegin verbinden* → Token einfügen → Cloud-Passwort (mind. 10 Zeichen) →
„Verschlüsselt hinterlegen“ → veröffentlichen. Der Token steht dann als AES-256-GCM-verschlüsselter Text (`cloudVault`, Schlüssel per PBKDF2-SHA256, 200 000 Runden)
in `config.js` und wird bei **jedem Update automatisch mitgeliefert**. Die Kundin gibt auf jedem Gerät **einmal** das Passwort ein.
Ohne Passwort ist der Text wertlos; GitHub erkennt ihn nicht als Token. Läuft der Token ab oder wird er gesperrt, fragt die App automatisch erneut nach dem Passwort –
neuen Token mit demselben oder neuem Passwort hinterlegen und veröffentlichen.

**Alternative – Verbindungs-Link:**

1. Admin-App → *Kollegin verbinden* → Kunden-Token einfügen → „Verbindungs-Link erzeugen“ (wird kopiert).
2. Link nur an die Kollegin schicken, auf **jedem** Gerät einmal öffnen (Handy **und** Laptop).
3. Installierte iPhone-App: Link/Code in der App unter „Angebote“ einfügen.

Der Token wird nur auf dem Gerät gespeichert (Browser-Speicher + Sicherungskopie in IndexedDB) und bleibt bei App-Updates erhalten.
„Trennen“ (unter „Angebote“) entfernt ihn vom Gerät. Bei Verlust eines Geräts: Token auf GitHub löschen.

## Synchronisierung

- Änderungen werden ~4 s nach der letzten Eingabe hochgeladen, beim Wechsel in den Hintergrund sofort.
- Abruf: beim Start, beim Zurückkehren in die App, bei wiederhergestellter Internetverbindung und alle 45 s.
- Konflikte (gleiches Angebot auf zwei Geräten geändert): der neuere Stand gewinnt, der ältere wird als Version „Lokaler Stand (Konflikt)“ gesichert.
- Offline: alles funktioniert lokal weiter und wird später abgeglichen.

## PIN

Die Admin-PIN wird als SHA-256-Hash in `config.js` gespeichert. Sie ist ein Bedienschutz, kein Ersatz für den Token.
