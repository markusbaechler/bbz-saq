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

**Fassungsmarke vor jedem Commit erneuern:**

```bash
node tools/version.js --write
```

Das schreibt `version.js` und den erzeugten Bereich in `index.html` neu (Import-Map mit `?v=…` an jeder Datei).
Ohne das liefert Pages nach dem Deploy bis zu zehn Minuten alte Module aus dem Browser-Cache, teils gemischt mit
neuen. Die CI bricht ab, wenn die Marke veraltet ist. Details im README unter «Fassungsmarke».

**Nach dem Deploy prüfen, was wirklich ausgeliefert wird** – nicht nur, dass der Merge durch ist:

```bash
curl -s https://markusbaechler.github.io/bbz-saq/version.js
```

Dieselbe Fassung steht in der Fusszeile der Seite und im Datenstand. Stimmen sie nicht überein, zeigt die Seite
selbst einen Hinweis mit Knopf «Neu laden».

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
| `hash_does_not_contain_known_properties` beim Popup-Login | Die App hat die MSAL-Antwort (`#code=…&state=…`) in der Redirect-URI überschrieben, bevor MSAL sie las. Seit dem Hotfix vom 07.09.2026 ausgeschlossen: im Popup rendert die App nichts, sonst liest MSAL den Hash zuerst (`isAuthResponseHash()`); `navigateToLoginRequestUrl: false` verhindert den zweiten Sprung nach dem Redirect-Login. Sauberste Variante gemäss MSAL-Doku wäre eine leere `auth-redirect.html` als Popup-Redirect-URI; dafür müssten `https://markusbaechler.github.io/bbz-saq/auth-redirect.html` und `http://localhost:3000/auth-redirect.html` in der App-Registrierung (Plattform SPA) registriert sein – noch nicht umgesetzt. |
| Konsole: «MSAL-Antwort im Hash nicht verwertbar und verworfen» | Eine alte oder fremde Antwort stand im Hash (z. B. Neuladen einer URL mit `#code=…`). Harmlos: die App startet ohne Konto, erneut anmelden. |
| «Kein Schreibrecht auf die Datei (HTTP 403)» | Schreibpfad: keine SharePoint-Schreibberechtigung auf Datei oder Ordner. Rechte prüfen; nichts wurde geändert. |
| «Die Datei wurde zwischenzeitlich geändert – bitte neu laden» | Schreibpfad: Datei-Version (eTag) weicht vom Stand beim Laden ab. Neu laden, Änderung wiederholen. |
| «Die Datei ist gesperrt, vermutlich in Excel geöffnet» | Schreibpfad: HTTP 423/409 der Workbook-API. Datei in Excel schliessen, erneut versuchen. |
| «Schreiben ist nur möglich, wenn die Datei von SharePoint geladen wurde» | Daten stammen aus einer lokalen Datei; «Daten von SharePoint laden» und wiederholen. |

## Phase 2: Schreibpfad aktivieren

Der Schreibpfad (`datasource/workbookAdapter.js`, Dialog in der Ansicht «Personen») ist umgesetzt und seit 06.09.2026 über
`CONFIG.features.write = true` produktiv freigeschaltet (Test auf der Testkopie durch den Auftraggeber). So wurde er eingerichtet, so
lässt er sich abschalten:

1. Testkopie prüfen: in `config.js` vorübergehend die Pfade auf die Testkopie `General/07_KUBA/Test_Reporting_KUBA.xlsx` setzen (nie
   committen), «Bearbeiten» einschalten, eine Raster-Zelle schreiben, neu laden, Audit und Historie prüfen (so geschehen am 06.09.2026,
   Entscheid E13). Die frühere Spike-Testseite `spike/mutation.html` wurde mit Paket F entfernt; der Ablauf steht in `docs/SPIKE-mutation.md`.
2. In `config.js` `features: { write: true }` setzen, committen und pushen; GitHub Pages veröffentlicht automatisch.
3. Im Kopf «Bearbeiten» einschalten (Standard aus; nach Neuladen der Seite wieder aus), in der Ansicht «Personen» eine Zelle des
   Prüfungsrasters anklicken. Beim ersten Schreiben fordert die App `Files.ReadWrite.All` an (Zustimmung bestätigen). Der Dialog zeigt
   alt → neu, verlangt einen Grund, schreibt genau eine Zelle und lädt die Datei neu.
4. Änderungsprotokoll: `General/07_KUBA/Reporting_KUBA.changes.json` neben der Datei (JSON-Array, ein Eintrag je Änderung).
5. Abschalten: `features: { write: false }` – die Bearbeiten-Elemente verschwinden, die Datei bleibt unverändert.

## Datenquelle bbz-ERP

Mit `CONFIG.datasource = 'erp'` liest das Cockpit die Vorgänge aus dem bbz-ERP statt aus `Reporting_KUBA.xlsx`
(`datasource/erpAdapter.js`). Das ERP liefert unter `GET /saq/export/kuba` je Vorgang ein Objekt mit den logischen
Feldschlüsseln aus `HEADER_FIELDS` und `erpFallId`. Der Adapter baut daraus denselben Eingabevertrag für `store.js` wie
der fileAdapter. Normalisierung, Duplikate, Status und Data-Quality-Log laufen unverändert. Fundstelle im Log:
Sheet «bbz-ERP», Zeile = Position des Vorgangs im Export. Der Schreibpfad und das Änderungsprotokoll gehören zur
Excel-Datei; mit der ERP-Quelle gibt es kein «Bearbeiten». «Lokale Excel-Datei prüfen» bleibt möglich.

Einrichtung:

1. ERP: `AUTH_MODE=entra` mit `ENTRA_TENANT_ID` und `ENTRA_AUDIENCE` (App-Registrierung der ERP-API). Die ERP-API stellt
   einen delegierten Scope bereit (z. B. `access_as_user`).
2. App-Registrierung «bbz-saq-SPA»: API-Berechtigung auf diesen Scope ergänzen und die Zustimmung erteilen.
3. Wer lädt, braucht im ERP ein freigeschaltetes Konto (Mitarbeitende) mit Admin-Rolle: `mitarbeitende.rolle = admin`
   oder App-Rolle `bbz.admin` (`ENTRA_ADMIN_ROLE`).
4. ERP: CORS für den Ursprung des Cockpits (`https://markusbaechler.github.io`, lokal `http://localhost:3000`) auf
   `/saq/export/kuba`, inklusive Preflight (`OPTIONS`, Header `authorization`).
5. `config.js`: `datasource: 'erp'`, `erp.baseUrl` (ohne Pfad), `erp.scopes` (z. B. `['api://<Client-ID>/access_as_user']`).
   Kennungen sind öffentlich, keine Secrets.
6. Abgleich: die synthetische Datei (`node tests/smoke/synth.mjs synth.xlsx`) mit `npm run kuba:import -- --datei synth.xlsx
   --ausfuehren --stichtag 2026-09-06` in eine Test-Instanz des ERP importieren (Banken «Testbank AG» und «Musterbank» vorher als
   Organisation anlegen), den Export als `export.json` sichern (Test-Instanz mit `AUTH_MODE=dev`:
   `curl -H 'x-user-role: admin' <ERP-URL>/saq/export/kuba > export.json`), dann
   `node tools/snapshot-synth.js basis.json` und `node tools/snapshot-synth.js --erp export.json --nur-kennzahlen --vergleich basis.json`.

Bekannte Abweichungen des ERP-Exports (Stand 28.10.2026, ERP-Branch `claude/admiring-archimedes-2segqh`, geprüft mit der
synthetischen Datei über Import und Export):

| Thema | Excel | ERP-Export | Wirkung im Cockpit |
|---|---|---|---|
| WE All / OE All | erfasster Wert | aus den Runs neu berechnet: `yes` erst, wenn alle Pflichtteile bestanden sind; `no` erst nach drei nicht bestandenen Runs eines Teils. Der Fallstatus (`saq_fall.status`, beim Import aus WE All/OE All übernommen) fliesst nicht ein | **Kennzahlen weichen ab** (Status, offen, passiv, Quoten). Mit der synthetischen Datei: 23 Abweichungen. Leitet das ERP die Werte aus dem Fallstatus ab, sind alle Kennzahlen gleich (Prototyp geprüft). |
| CORS | – | `/saq/export/kuba` sendet keine CORS-Header (nur `/public/*`) | Der Browser blockiert den Abruf von GitHub Pages aus. |
| VSS/VSM | Threaded Comment auf B{Zeile} | `saq_fall.kennzeichnung` wird nicht exportiert | Ansicht, Kachel und Filter VSS/VSM führen alle Vorgänge als «ohne». |
| Uhrzeit | Datum mit Uhrzeit | nur Datum (`date`) | Geplante Prüfungen ohne Uhrzeit. |
| Employer | Rohwert, Alias-Map | Name der CRM-Organisation; beim Import nicht zugeordnete Banken fehlen | Bankgruppen können abweichen oder leer sein. |
| Datenqualität | Zellen wie erfasst | Import führt Duplikate zusammen, bereinigt Werte, übernimmt Runs nur mit Datum und Zeilen nur mit Namen | Datei-Zähler und Data-Quality-Log sind kleiner. Das ist erwartet. |
| Certificate End Date | leer möglich | ohne Wert: Start + 3 Jahre | Gültigkeit erscheint, wo die Datei keine hatte. |
| Sprache | leer möglich | nie leer (Standard DE) | Gruppe «ohne Sprache» entfällt. |

Fehlerbilder der ERP-Quelle:

| Meldung | Ursache und Massnahme |
|---|---|
| «ERP-Konfiguration fehlt» | `CONFIG.erp.baseUrl` oder `CONFIG.erp.scopes` leer. In `config.js` eintragen. |
| «bbz-ERP nicht erreichbar» | Netzwerk, falsche Basis-URL oder fehlende CORS-Freigabe des ERP (Konsole: «blocked by CORS policy»). |
| «Anmeldung am bbz-ERP abgelehnt (HTTP 401)» | Token passt nicht zur Audience des ERP. Scope in `CONFIG.erp.scopes` und `ENTRA_AUDIENCE` prüfen. |
| «Kein Zugriff auf den ERP-Export (HTTP 403)» | Kein freigeschaltetes ERP-Konto oder keine Admin-Rolle. |
| «ERP-Export weicht vom Feldschema ab» | Ein Pflichtfeld aus `HEADER_FIELDS` fehlt im Export, oder die Antwort ist kein JSON-Array. Nichts wird verarbeitet. |
