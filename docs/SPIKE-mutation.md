# Spike Mutation – minimaler Schreibpfad über die Graph-Workbook-API (Paket E, E.1)

Stand 06.09.2026. Ziel: eine einzelne Run-Zelle (Passed, Date, Result, Location, Expert 1/2) eines Vorgangs in einer bestehenden Spalte
der Excel ändern, ohne die Struktur der Datei zu verändern (E10). Testumgebung: Testkopie `General/07_KUBA/Test_Reporting_KUBA.xlsx`
(Auftraggeber, 06.09.2026); Testseite `spike/mutation.html` (nur lokal, Scope `Files.ReadWrite.All` nur dort, Protokoll ohne Personendaten).
Entscheide vor Start (06.09.2026): Audit als `Reporting_KUBA.changes.json` neben der Datei; Umfang nur Run-Felder; Flag `features.write`
bleibt `false` bis zur Aktivierung durch den Auftraggeber. **Go durch den Auftraggeber am 06.09.2026** – die Umsetzung E.2–E.4 folgt; der
Lauf der Testseite auf der Testkopie ist Bedingung vor der Flag-Aktivierung (Abschnitt 8).

## 1 Ablauf über die Workbook-API

Zur Laufzeit aus dem Lesepfad bekannt: `driveId`, `itemId` (Auflösung Site → Drive → Item wie in `datasource/fileAdapter.js`), Sheet-Name aus
`person.sheetName`, Excel-Zeile aus `person.row`, Spaltenindex aus dem Header-Mapping der Zeile 10 (nie Spaltenbuchstaben raten).

1. `GET /drives/{driveId}/items/{itemId}?$select=eTag,lastModifiedDateTime` → Konfliktprüfung gegen den Stand beim Laden.
2. `GET …/workbook/worksheets('{Sheet}')/range(address='A10:ZZ10')?$select=values` → Spaltenindex des Headers (Sicherheitsnetz gegen verschobene Spalten).
3. `GET …/range(address='{Adresse}')?$select=values,valueTypes,numberFormat,text` → erwarteter Wert und Schreibweise der Zelle.
4. `POST …/workbook/createSession` mit `{ persistChanges: true }` → `workbook-session-id`.
5. `PATCH …/range(address='{Adresse}')` mit `{ values: [[wert]] }` und Session-Header.
6. `POST …/workbook/closeSession` (auch im Fehlerfall).
7. Audit: `GET /drives/{driveId}/root:/…/Reporting_KUBA.changes.json:/content` (404 → leer) → Eintrag anhängen → `PUT …:/content` (JSON).
8. `GET item` → neue Version (eTag, lastModified); danach in der App **Neuladen** über den Lesepfad, kein optimistisches Update.

Reine Helfer dafür liegen in `datasource/workbookApi.js` (`rangeAddress`, `workbookPaths`, `cellValueFor`, `writePlan`, `conflictOf`,
`auditEntry`, `appendAuditJson`), getestet in `tests/workbookApi.test.js`.

## 2 Datentypen

Die Datei enthält je Feld unterschiedliche Schreibweisen (Parser in `store.js`: Datum als Serienzahl oder Text `dd.mm.yyyy`, Passed als
`yes`/`no` in beiden Sheet-Varianten, Result als Bruch 0–1 oder Prozentwert). Der Schreibpfad **liest vor dem Schreiben die Zielzelle und die
Nachbarzellen derselben Spalte** (`valueTypes`, `numberFormat`) und schreibt in derselben Schreibweise (`cellValueFor` mit `passedStyle`,
`dateStyle`, `resultStyle`). So bleibt die Spalte einheitlich, und der Parser liest den neuen Wert wie die bestehenden. `[unklar bis zum Lauf
auf der Testkopie]`: welche Schreibweise die Zielspalten tatsächlich tragen (Testseite Schritt 4 protokolliert Typ, Format und Text der Zelle
und dreier Nachbarzellen).

## 3 Konflikte

- Datei geändert seit dem Laden: `eTag` (sonst `lastModifiedDateTime`) weicht ab → Abbruch «Datei wurde geändert – neu laden» (`conflictOf`, kind `file`).
- Zelle geändert: gelesener Wert ≠ erwarteter Wert aus dem Memory → Abbruch (kind `cell`).
- Header nicht mehr an der erwarteten Stelle → `HeaderError`, nichts wird geschrieben.
- Nach jedem Schreiben lädt die App die Datei neu; der Memory-Stand ist nie «optimistisch».

## 4 Gleichzeitig geöffnete Datei

Die Workbook-API arbeitet serverseitig auf der Datei in SharePoint. Mit Excel Online geöffnet werden Änderungen zusammengeführt
(Co-Authoring); mit Excel Desktop kann die Datei gesperrt sein → Graph antwortet mit HTTP 423 (`resourceLocked`/`notAllowed`) oder 409.
Umsetzung: 423/409 als **Konflikt mit Hinweis** behandeln («Datei ist in Excel geöffnet – schliessen und erneut versuchen»), kein Retry-Sturm.
`[unklar bis zum Lauf auf der Testkopie]`: Testseite Schritt 9 (Datei in Excel Online geöffnet, Schreiben wiederholen).

## 5 Audit

Keine Änderung an der Excel-Struktur (E10). Änderungsprotokoll als JSON-Array `Reporting_KUBA.changes.json` neben der Datei, je Änderung ein
Eintrag `{ at, user, sheet, row, header, address, old, new, reason, source }` – ohne Kandidatenname (`auditEntry`). Anhängen = lesen → ergänzen
→ `PUT` mit `If-Match: {eTag der Audit-Datei}`; bei 412 einmal neu lesen und wiederholen. Ungültiges JSON wird nie überschrieben (Abbruch mit
Meldung). Die Audit-Datei liegt im selben Ordner und unterliegt denselben SharePoint-Rechten.

## 6 Berechtigungen

Graph setzt die SharePoint-Rechte durch: ohne Schreibrecht HTTP 403 → `WriteForbiddenError` mit verständlicher Meldung. Der Scope
`Files.ReadWrite.All` ist in Azure gesetzt (E10). Empfehlung für E.2: **inkrementelle Zustimmung** – der Lesepfad behält `Files.Read.All`,
der Schreibpfad holt das Token mit `Files.ReadWrite.All` erst beim ersten Schreiben (`auth.getToken({ scopes })`), damit Nutzende ohne
Schreibabsicht keine neue Zustimmung sehen. Bei verlangtem Admin-Consent: Freigabe durch die Tenant-Administration (`DEPLOY.md`).

## 7 Aufwand und Risiken

| Schritt | Inhalt | Aufwand |
|---|---|---|
| E.2 Adapter | `workbookAdapter.write(change)`: Auflösung, Konfliktprüfung, Session, PATCH, Audit mit If-Match, Fehlerklassen; Tests mit Graph-Mock (Erfolg, Konflikt Datei/Zelle, 403, 423, Header fehlt, Audit vorhanden) | 1 Arbeitsschritt |
| E.3 UI | Bearbeiten je Run-Zelle in «Personen» hinter Flag: Feldwahl, Validierung mit den Parsern aus `store.js`, Vorschau alt → neu, Grund, Bestätigung, Schreiben, Neuladen, Erfolg mit Fundstelle; Smoke mit Mock-Endpunkt | 1–2 Arbeitsschritte |
| E.4 Doku | README «Mutation (Phase 2)», `CLAUDE.md` Regel 1 (E10), `DEPLOY.md` Scope/Consent, `PROMPT.md` | 0.5 Arbeitsschritt |

Risiken: (1) Schreibweise der Zielzellen weicht von den Nachbarzellen ab → der Parser meldet die Zelle im Data-Quality-Log, der Wert bleibt
lesbar; (2) Datei in Excel Desktop gesperrt → Konfliktmeldung, kein Datenverlust; (3) zwei gleichzeitige Audit-Schreiber → `If-Match`;
(4) Zustimmung zum neuen Scope → inkrementell, sonst Admin-Consent; (5) Gesamtergebnisse (`WE All`, `OE All`) und Formeln bleiben unberührt,
weil nur Run-Felder editierbar sind.

## 8 Go/No-Go

**Empfehlung: Go** mit den Entscheiden 2–4 und dieser Bedingung: Vor der Aktivierung von `features.write` führt der Auftraggeber die Testseite
auf der Testkopie aus (Schritte 1–9) und schickt das Protokoll; die Abschnitte 2 und 4 werden damit von `[unklar]` auf «geprüft» gesetzt, und
die Schreibweise je Feld wird gegen die Protokollwerte abgeglichen. **Entscheid des Auftraggebers: Go (06.09.2026).**
