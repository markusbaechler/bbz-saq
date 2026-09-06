# Betrieb und Einrichtung

## Voraussetzungen

- Azure App-Registrierung «bbz-saq-SPA» im Tenant bbzsg (Plattform «Single-Page-Anwendung»)
  - Redirect-URIs, exakt mit Schrägstrich am Ende: `http://localhost:3000/` und `https://markusbaechler.github.io/bbz-saq/`
  - Delegierte Berechtigung Microsoft Graph `Files.Read.All` (Zustimmung durch die Nutzenden oder Admin-Consent)
  - Client-ID und Tenant-ID stehen in `config.js` (`CONFIG.auth`); sie sind öffentliche Kennungen, keine Secrets.
- SharePoint: Site `bbzsg.sharepoint.com/sites/bbz-Zertifizierung`, Datei `General/07_KUBA/Reporting_KUBA.xlsx`
  in der Standardbibliothek «Dokumente» (`CONFIG.sharepoint`). Lesezugriff der Nutzenden auf die Datei genügt.
- Schreibpfad (Phase 2, nur mit Flag): delegierte Berechtigung `Files.ReadWrite.All` (in Azure gesetzt); die App fordert sie erst beim
  ersten Schreiben an (inkrementelle Zustimmung, ggf. Admin-Consent). Schreibrecht der Nutzenden auf die Datei und den Ordner
  (Audit-Datei `Reporting_KUBA.changes.json`).

## GitHub Pages

1. Repository https://github.com/markusbaechler/bbz-saq, Branch `main`, Datei `.nojekyll` vorhanden.
2. Settings → Pages → Source «Deploy from a branch», Branch `main`, Ordner `/ (root)`.
3. Aufruf mit Schrägstrich: https://markusbaechler.github.io/bbz-saq/
4. Jeder Push auf `main` veröffentlicht automatisch; es gibt keinen Build-Schritt.

## Lokal

```bash
python -m http.server 3000
```

http://localhost:3000 öffnen, «Anmelden», «Daten von SharePoint laden». Ohne Azure-Zugang lässt sich eine Excel-Datei
über «Lokale Excel-Datei prüfen» laden; sie bleibt im Browser.

Tests: `node tests/run-node.js` oder http://localhost:3000/tests.html. Alle Tests müssen grün sein, bevor Views
geändert werden.

## Konfiguration anpassen

Alles in `config.js`:

- `CONFIG.sheets`: Sheet-Namen; `CONFIG.headerRow` (10) und `CONFIG.dataStartRow` (11)
- `HEADER_FIELDS`: Header-Namen inkl. Varianten («… Passed» | «… yes»); neue Varianten dort als Kandidaten ergänzen
- `PROFILES`, `PROFILE_ALIASES`, `LANGUAGES`, `LANGUAGE_ALIASES`, `PASSED_TRUE/FALSE`, `EMPLOYER_ALIASES`:
  Whitelists und Alias-Maps; Erweiterungen erscheinen sofort in den Kennzahlen
- `DATE_RULES`: plausible Jahre und der Bereich, in dem Zahlen als Excel-Serienzahl gelten

Die Struktur der Excel-Datei wird nie verändert; Zellwerte nur über den Schreibpfad mit Flag (Abschnitt «Phase 2»). Abweichungen werden
im Data-Quality-Log gemeldet, nicht stillschweigend korrigiert.

## Fehlerbilder

| Meldung | Ursache und Massnahme |
|---|---|
| AADSTS50011 beim Anmelden | Redirect-URI fehlt oder ohne Schrägstrich registriert. In der App-Registrierung ergänzen. |
| Zustimmung nicht möglich | Tenant verlangt Admin-Consent für `Files.Read.All`. Admin-Freigabe einholen. |
| «Datei nicht gefunden» | Pfad in `CONFIG.sharepoint.filePath` oder Site-Pfad stimmt nicht, oder keine Leserechte. |
| «Pflicht-Header fehlen» | Header in Zeile 10 wurden umbenannt oder verschoben. Liste in der Meldung prüfen; ggf. Variante in `HEADER_FIELDS` ergänzen. |
| «Anmeldung abgelaufen» | Token konnte nicht erneuert werden. Erneut anmelden und Ladevorgang wiederholen. |
| «Dienst vorübergehend nicht verfügbar» | Graph antwortet mit 429/503; die App wiederholt automatisch mit Backoff, danach «Erneut versuchen». |
| Konsole: «Cross-Origin-Opener-Policy would block window.closed» | Harmlos, stammt aus der MSAL-Popup-Überwachung. |
| «Kein Schreibrecht auf die Datei (HTTP 403)» | Schreibpfad: keine SharePoint-Schreibberechtigung auf Datei oder Ordner. Rechte prüfen; nichts wurde geändert. |
| «Die Datei wurde zwischenzeitlich geändert – bitte neu laden» | Schreibpfad: Datei-Version (eTag) weicht vom Stand beim Laden ab. Neu laden, Änderung wiederholen. |
| «Die Datei ist gesperrt, vermutlich in Excel geöffnet» | Schreibpfad: HTTP 423/409 der Workbook-API. Datei in Excel schliessen, erneut versuchen. |
| «Schreiben ist nur möglich, wenn die Datei von SharePoint geladen wurde» | Daten stammen aus einer lokalen Datei; «Daten von SharePoint laden» und wiederholen. |

## Phase 2: Schreibpfad aktivieren

Der Schreibpfad (`datasource/workbookAdapter.js`, Dialog in der Ansicht «Personen») ist umgesetzt und über `CONFIG.features.write`
abgeschaltet. Aktivierung durch den Auftraggeber:

1. Testkopie prüfen: `python -m http.server 3000`, dann http://localhost:3000/spike/mutation.html – Schritte 1 bis 9 auf der Testkopie
   `General/07_KUBA/Test_Reporting_KUBA.xlsx` ausführen; das Protokoll (ohne Personendaten) bestätigt Schreibweise, Konflikterkennung und
   Audit (`docs/SPIKE-mutation.md`, Abschnitt 8).
2. In `config.js` `features: { write: true }` setzen, committen und pushen; GitHub Pages veröffentlicht automatisch.
3. Im Kopf «Bearbeiten» einschalten (Standard aus; nach Neuladen der Seite wieder aus), in der Ansicht «Personen» eine Zelle des
   Prüfungsrasters anklicken. Beim ersten Schreiben fordert die App `Files.ReadWrite.All` an (Zustimmung bestätigen). Der Dialog zeigt
   alt → neu, verlangt einen Grund, schreibt genau eine Zelle und lädt die Datei neu.
4. Änderungsprotokoll: `General/07_KUBA/Reporting_KUBA.changes.json` neben der Datei (JSON-Array, ein Eintrag je Änderung).
5. Abschalten: `features: { write: false }` – die Bearbeiten-Elemente verschwinden, die Datei bleibt unverändert.
