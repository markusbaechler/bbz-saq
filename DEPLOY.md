# Betrieb und Einrichtung

## Voraussetzungen

- Azure App-Registrierung «bbz-saq-SPA» im Tenant bbzsg (Plattform «Single-Page-Anwendung»)
  - Redirect-URIs, exakt mit Schrägstrich am Ende: `http://localhost:3000/` und `https://markusbaechler.github.io/bbz-saq/`
  - Delegierte Berechtigung Microsoft Graph `Files.Read.All` (Zustimmung durch die Nutzenden oder Admin-Consent)
  - Client-ID und Tenant-ID stehen in `config.js` (`CONFIG.auth`); sie sind öffentliche Kennungen, keine Secrets.
- SharePoint: Site `bbzsg.sharepoint.com/sites/bbz-Zertifizierung`, Datei `General/07_KUBA/Reporting_KUBA.xlsx`
  in der Standardbibliothek «Dokumente» (`CONFIG.sharepoint`). Lesezugriff der Nutzenden auf die Datei genügt.

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

Die Excel-Datei wird nie verändert. Abweichungen werden im Data-Quality-Log gemeldet, nicht stillschweigend korrigiert.

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

## Phase 2 (Ausblick)

`datasource/workbookAdapter.js` ist als Stub mit gleichem Interface vorbereitet (Graph Workbook-API für Erfassen und
Mutieren). Views und Kennzahlen greifen ausschliesslich über `datasource/index.js` auf Daten zu und bleiben unverändert.
