# Paket E – Mutation: minimaler Schreibpfad (Phase 2): Umsetzungsplan

> **Für ausführende Agenten:** Plan Task für Task abarbeiten (superpowers:executing-plans). Nach jedem Task (= Schritt E.1 … E.4 aus `PROMPT-2.md`) Bericht nach Vorlage 0.8 und Freigabe abwarten. Task 1 endet mit ⛔ Go/No-Go; Tasks 2–4 nur bei Go. TDD für alle reinen Helfer und den Adapter (Graph-Mock); der Spike-Test selbst läuft interaktiv auf der Testkopie.

**Ziel:** Eine einzelne Run-Zelle (Passed, Date, Result, Location, Expert 1/2) eines Vorgangs in einer bestehenden Spalte der Excel über die Graph-Workbook-API ändern – mit Validierung, Konfliktprüfung, Audit-Protokoll und Feature-Flag. Die Struktur der Datei bleibt unverändert (E10). Kein Anlegen von Zeilen, keine Sheet-Änderungen.

**Architektur:** Spike als lokale Testseite `spike/mutation.html` (nur `python -m http.server 3000`, Anmeldung mit dem Konto des Auftraggebers, Scope `Files.ReadWrite.All` nur auf dieser Seite) gegen die Testkopie `General/07_KUBA/Test_Reporting_KUBA.xlsx`. Reine Helfer in `datasource/workbookApi.js` (Range-Adressen, Sessions-Ablauf als Request-Liste, Audit-Eintrag, Konfliktvergleich) mit Tests. Bei Go: `datasource/workbookAdapter.js` `write(change)` über `graph.js`, `datasource/index.js` delegiert; UI in `views/personen.js` hinter `CONFIG.features.write`; nach dem Schreiben Neuladen (kein optimistisches Update).

**Tech Stack:** Vanilla JS ES-Module, MSAL (lokal), Microsoft Graph v1.0 (Drive-Items, Workbook-API, Datei-Upload für das Audit-JSON), `tests/run-node.js` mit Graph-Mock, Playwright-Smoke (UI nur mit Flag und Mock).

## Globale Vorgaben (aus `PROMPT-2.md` und `CLAUDE.md`)

- Excel-Struktur nie ändern (Regel 1, E10): nur Zellwerte in bestehenden Spalten, adressiert über Header-Namen der Zeile 10 → Spaltenbuchstabe zur Laufzeit; Zeile aus `person.row`; Sheet aus `person.sheetName`.
- Schreibtests ausschliesslich auf der Testkopie `General/07_KUBA/Test_Reporting_KUBA.xlsx` (Auftraggeber, 06.09.2026); Dateiname samt Endung beim ersten Zugriff über Graph prüfen, nie raten.
- Keine Personendaten: Protokolle des Spikes enthalten nur Zeitpunkte, Adressen (Sheet, Zeile, Spalte), Werttypen, Status-Codes und Zellwerte ohne Personenbezug (Ort, yes/no, Datum, Result). Keine Namen.
- Feature-Flag `CONFIG.features.write` bleibt `false`; Aktivierung nur durch den Auftraggeber (Entscheid vor Start 4). Scope `Files.ReadWrite.All` in `config.js` erst bei Go (E.2), der Spike überschreibt den Scope nur auf seiner Seite.
- Angenommene Entscheide (Empfehlungen, ⛔ vor E.1 bestätigen lassen): (2) Audit als `Reporting_KUBA.changes.json` neben der Datei, Append je Änderung; (3) nur Run-Felder Passed, Date, Result, Location, Expert 1/2; (4) Flag bleibt `false` bis zur Aktivierung durch den Auftraggeber.
- Zahlen unverändert (Snapshot mit Baseline D identisch) – Paket E ändert keine Kennzahl.
- Smoke lokal: `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe node tests/smoke/run.mjs`. Commits klein, deutsch, Imperativ, Trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; Code-Einbau per `split/join`, keine Backslashes in Heredocs.

## Dateistruktur

| Datei | Verantwortung in Paket E |
|---|---|
| `datasource/workbookApi.js` (neu) | Reine Helfer: `rangeAddress(colIndex, row)`, `workbookPaths(driveId, itemId, sheetName, address)`, `writePlan(change, ctx)` (Request-Liste createSession → PATCH range → closeSession), `auditEntry(change, account, now)`, `appendAuditJson(text, entry)`, `conflictOf(expectedItem, actualItem, expectedValue, actualValue)`, `cellValueFor(field, value)` (Datentyp je Feld) |
| `spike/mutation.html`, `spike/mutation.js` (neu) | Lokale Testseite: Anmelden (Scope ReadWrite nur hier), Testkopie auflösen, Header lesen, Zelle lesen, schreiben, zurückschreiben, Konflikt (eTag), Audit-JSON anhängen, Protokoll ohne Personendaten kopieren |
| `docs/SPIKE-mutation.md` (neu) | Spike-Bericht ≤ 2 Seiten: Ablauf, Datentypen, Konflikte, gleichzeitig geöffnete Datei, Audit, Berechtigungen, Aufwand, Risiken, Go/No-Go-Vorlage |
| `datasource/workbookAdapter.js` | Bei Go: `write(change)` mit `WriteConflictError`, `WriteForbiddenError`; `datasource/index.js` delegiert |
| `views/personen.js`, `views/common.js` | Bei Go: Bearbeiten je Raster-Zelle hinter Flag, Formular mit Parsern aus `store.js`, Vorschau alt → neu, Grund, Bestätigung, Neuladen |
| `config.js`, `DEPLOY.md`, `README.md`, `CLAUDE.md` | Bei Go: Scope, Abschnitt «Mutation (Phase 2)», Regel 1 gemäss E10 |
| `tests/workbookApi.test.js`, `tests/workbookAdapter.test.js` (neu), `tests/smoke/run.mjs` | Tests je Task |

---

### Task 1 (Schritt E.1): Spike – Helfer, Testseite, Test auf der Testkopie, Bericht, ⛔ Go/No-Go

**Dateien:** `datasource/workbookApi.js`, `tests/workbookApi.test.js`, `tests/all.js`, `spike/mutation.html`, `spike/mutation.js`, `docs/SPIKE-mutation.md`, `.gitignore` (kein Eintrag nötig: die Seite enthält keine Secrets), `README.md` (ein Satz unter Werkzeuge)

**Schnittstellen (Produziert):**

```js
// datasource/workbookApi.js (rein, kein Netz)
export function rangeAddress(colIndex, row)                 // (0, 12) → 'A12'; (27, 12) → 'AB12'
export function workbookPaths(driveId, itemId, sheetName, address)
//   → { item: '/drives/{d}/items/{i}', session: '…/workbook/createSession', close: '…/workbook/closeSession', range: "…/workbook/worksheets('{sheet}')/range(address='A12')" }  (Sheet-Name URL-kodiert, Apostroph verdoppelt)
export function cellValueFor(field, value)                  // Feldtyp → Zellwert: passed → 'yes'|'no' (Schreibweise des Sheets über change.style), date → 'dd.mm.yyyy' oder Serienzahl (change.dateStyle), result → Zahl 0–1 oder Prozenttext, location/expert → Text
export function writePlan(change, ctx)                      // → [{ method, path, body, headers }] in Reihenfolge: createSession(persistChanges) → PATCH range { values: [[v]] } → closeSession; ctx = { driveId, itemId, sessionId? }
export function conflictOf({ expectedModified, actualModified, expectedEtag, actualEtag, expectedValue, actualValue }) // → null | { kind: 'file'|'cell', message }
export function auditEntry(change, account, now = new Date()) // → { at: ISO, user: account.username|'', sheet, row, header, address, old, new, reason, source: 'bbz-saq' } – kein Name des Kandidaten
export function appendAuditJson(text, entry)                // bestehender JSON-Text ('' → []) + Eintrag → neuer Text (Array, 2 Leerzeichen)
```

- [ ] **Schritt 1: Tests (RED)** – `tests/workbookApi.test.js`:

```js
import { test, assert, assertEqual } from './runner.js';
import { rangeAddress, workbookPaths, cellValueFor, writePlan, conflictOf, auditEntry, appendAuditJson } from '../datasource/workbookApi.js';

test('workbookApi.rangeAddress: Spaltenindex + Excel-Zeile → Adresse', () => {
  assertEqual([rangeAddress(0, 12), rangeAddress(25, 11), rangeAddress(26, 500), rangeAddress(183, 21)], ['A12', 'Z11', 'AA500', 'GB21']);
});

test('workbookApi.workbookPaths: Pfade für Item, Session und Range; Sheet-Name kodiert, Apostroph verdoppelt', () => {
  const p = workbookPaths('d1', 'i1', "First Certification", 'GB21');
  assertEqual(p.item, '/drives/d1/items/i1');
  assertEqual(p.session, '/drives/d1/items/i1/workbook/createSession');
  assertEqual(p.close, '/drives/d1/items/i1/workbook/closeSession');
  assertEqual(p.range, "/drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='GB21')");
  assert(workbookPaths('d', 'i', "O'Brien", 'A1').range.includes("worksheets('O''Brien')"));
});

test('workbookApi.cellValueFor: Datentyp je Feld gemäss Schreibweise im Sheet', () => {
  assertEqual(cellValueFor('passed', true, { passedStyle: ['yes', 'no'] }), 'yes');
  assertEqual(cellValueFor('passed', false, { passedStyle: ['Yes', 'No'] }), 'No');
  assertEqual(cellValueFor('date', new Date(2026, 8, 6), { dateStyle: 'text' }), '06.09.2026');
  assertEqual(cellValueFor('date', new Date(2026, 8, 6), { dateStyle: 'serial' }), 46271);
  assertEqual(cellValueFor('result', 0.85, { resultStyle: 'fraction' }), 0.85);
  assertEqual(cellValueFor('result', 0.85, { resultStyle: 'percent' }), '85 %');
  assertEqual(cellValueFor('location', 'Bern', {}), 'Bern');
  assertEqual(cellValueFor('expert1', 'Prüfer Pia', {}), 'Prüfer Pia');
  assertEqual(cellValueFor('passed', null, {}), '');
});

test('workbookApi.writePlan: createSession → PATCH range → closeSession, Session-Id im Header', () => {
  const change = { sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', colIndex: 183, field: 'location', value: 'Bern', expected: 'Zürich', reason: 'Test' };
  const plan = writePlan(change, { driveId: 'd1', itemId: 'i1', sessionId: 's1' });
  assertEqual(plan.map((r) => [r.method, r.path.slice(-40)]), [
    ['POST', '/items/i1/workbook/createSession'],
    ['PATCH', "ation')/range(address='GB21')"],
    ['POST', '/items/i1/workbook/closeSession'],
  ]);
  assertEqual(plan[0].body, { persistChanges: true });
  assertEqual(plan[1].body, { values: [['Bern']] });
  assertEqual(plan[1].headers, { 'workbook-session-id': 's1' });
  assertEqual(plan[2].headers, { 'workbook-session-id': 's1' });
});

test('workbookApi.conflictOf: Datei geändert (lastModified/eTag) oder Zelle abweichend → Konflikt, sonst null', () => {
  const base = { expectedModified: '2026-09-06T10:00:00Z', actualModified: '2026-09-06T10:00:00Z', expectedEtag: 'e1', actualEtag: 'e1', expectedValue: 'Zürich', actualValue: 'Zürich' };
  assertEqual(conflictOf(base), null);
  assertEqual(conflictOf({ ...base, actualEtag: 'e2' }).kind, 'file');
  assertEqual(conflictOf({ ...base, actualModified: '2026-09-06T11:00:00Z' }).kind, 'file');
  assertEqual(conflictOf({ ...base, actualValue: 'Bern' }).kind, 'cell');
  assert(/neu laden/i.test(conflictOf({ ...base, actualEtag: 'e2' }).message));
  assertEqual(conflictOf({ ...base, expectedValue: null, actualValue: '' }), null, 'leer = leer');
});

test('workbookApi.auditEntry / appendAuditJson: Eintrag ohne Kandidatennamen, Append auf leerem und bestehendem JSON', () => {
  const change = { sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'GB21', field: 'location', value: 'Bern', expected: 'Zürich', reason: 'Ort korrigiert', personName: 'Muster Anna' };
  const e = auditEntry(change, { username: 'konto@example.org' }, new Date(Date.UTC(2026, 8, 6, 12, 0, 0)));
  assertEqual(e, { at: '2026-09-06T12:00:00.000Z', user: 'konto@example.org', sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'GB21', old: 'Zürich', new: 'Bern', reason: 'Ort korrigiert', source: 'bbz-saq' });
  assert(!JSON.stringify(e).includes('Muster'), 'kein Kandidatenname im Audit');
  const first = appendAuditJson('', e);
  assertEqual(JSON.parse(first).length, 1);
  const second = appendAuditJson(first, { ...e, reason: 'zweiter' });
  assertEqual(JSON.parse(second).map((x) => x.reason), ['Ort korrigiert', 'zweiter']);
  assert(second.endsWith('\n'));
  let threw = false;
  try { appendAuditJson('{kaputt', e); } catch { threw = true; }
  assert(threw, 'ungültiges JSON wird nicht überschrieben');
});
```

`tests/all.js`: `import './workbookApi.test.js';`. Run → FAIL (Modul fehlt).

- [ ] **Schritt 2: `datasource/workbookApi.js` (GREEN)** – reine Funktionen wie oben; `cellValueFor` Excel-Serienzahl = Tage seit 1899-12-30 (lokales Datum); Prozenttext `Math.round(v * 100) + ' %'`; `conflictOf` vergleicht eTag, dann lastModified, dann Zellwert (leer ≡ null ≡ ''); `appendAuditJson` parst vorhandenen Text (leer → `[]`), wirft bei ungültigem JSON, gibt `JSON.stringify(arr, null, 2) + '\n'` zurück. Run → grün.

- [ ] **Schritt 3: Testseite `spike/mutation.html` + `spike/mutation.js`** – nur lokal (`python -m http.server 3000` → `http://localhost:3000/spike/mutation.html`), ohne Build; lädt `lib/msal-browser.min.js`, `auth.js` mit `createAuth({ msal, authConfig: { ...CONFIG.auth, scopes: ['Files.ReadWrite.All'] } })`, `graph.js`, `datasource/fileAdapter.js` (`resolveDriveItem` mit `filePath: 'General/07_KUBA/Test_Reporting_KUBA.xlsx'`), `datasource/workbookApi.js`, `tools/headers.js` (`columnLetter`). Schritte als Buttons, jeder schreibt ins Protokoll (`<pre>`; nur Zeitpunkt, Aktion, Adresse, Status, Werttyp, Zellwert ohne Personenbezug):
  1. Anmelden (Redirect/Popup wie App).
  2. Testkopie auflösen: Site → Drive → Item; Protokoll: Name, Grösse, `lastModifiedDateTime`, `eTag`. Sicherheitsriegel: Abbruch, wenn der Item-Name nicht mit `Test_` beginnt.
  3. Header lesen: `GET …/workbook/worksheets('First Certification')/range(address='10:10')/usedRange` → Werte der Zeile 10 → Spaltenindex des gewählten Headers (Auswahlfeld: `OE1 RUN1 Location`, `OE1 RUN1 Passed`, `OE1 RUN1 Date`, `OE1 RUN1 Result`, `OE1 RUN1 Expert 1`); Eingabe Excel-Zeile (Standard: letzte Datenzeile).
  4. Zelle lesen: `GET range(address)` mit `values`, `valueTypes`, `numberFormat`, `text` → Protokoll (Werttyp, Format, Text); dazu die Nachbarzellen derselben Spalte (3 Zeilen darüber) für die Schreibweise (Datum Serienzahl oder Text, Passed yes/no, Result Bruch oder Prozent).
  5. Schreiben: `writePlan` ausführen (createSession persistChanges → PATCH → closeSession); Protokoll je Request mit Status; danach Zelle und Item erneut lesen (Wert, `lastModifiedDateTime`, `eTag`).
  6. Zurückschreiben des ursprünglichen Werts (gleicher Ablauf).
  7. Konflikt: gespeicherten eTag mit aktuellem vergleichen (`conflictOf`), einmal absichtlich nach einer manuellen Änderung der Testkopie in Excel Online (Auftraggeber) → «Datei wurde geändert – neu laden» erwartet.
  8. Audit: `GET /drives/{d}/root:/General/07_KUBA/Test_Reporting_KUBA.changes.json:/content` (404 → leer) → `appendAuditJson` → `PUT …:/content` (Content-Type application/json) → Protokoll Status und Anzahl Einträge.
  9. Gleichzeitig geöffnet: Auftraggeber öffnet die Testkopie in Excel Online/Desktop, dann Schritt 5 wiederholen → Ergebnis protokollieren.
  10. Schaltfläche «Protokoll kopieren» (Zwischenablage) – der Auftraggeber fügt es in die Antwort ein.
  Keine Speicherung im Browser (Regel 4). Die Seite ist in `index.html` nicht verlinkt.

- [ ] **Schritt 4: Spike-Test mit dem Auftraggeber** – ⛔ eine Nachricht mit Anleitung (Server starten, Seite öffnen, Schritte 1–9, Protokoll kopieren) und den offenen Entscheiden 2–4. Auswertung des Protokolls ohne Personendaten; Befunde in `docs/SPIKE-mutation.md` (Ablauf, Datentypen je Feld, Konflikterkennung, gleichzeitig geöffnete Datei, Audit, Berechtigungen 403, Aufwand in Arbeitsschritten, Risiken, Empfehlung Go/No-Go).

- [ ] **Schritt 5: Commit, Push, Draft-PR, ⛔ Go/No-Go** – Commits «Workbook-API: reine Helfer für Range, Session-Ablauf, Konflikt und Audit (Spike Paket E)», «Spike-Testseite gegen die Testkopie», «Spike-Bericht Mutation». Draft-PR «Paket E – Mutation: minimaler Schreibpfad (Phase 2)». Der Spike-Bericht wird auch bei No-Go gemerged.

---

### Task 2 (Schritt E.2, nur bei Go): Adapter `workbookAdapter.write(change)` mit Graph-Mock

**Dateien:** `datasource/workbookAdapter.js`, `datasource/index.js`, `config.js` (Scope), `tests/workbookAdapter.test.js` (neu), `tests/all.js`, `tests/fileAdapter.test.js` (Vertragstest anpassen)

**Schnittstellen (Produziert):**

```js
// datasource/workbookAdapter.js
export class WriteConflictError extends Error   // { kind: 'file'|'cell' }
export class WriteForbiddenError extends Error  // HTTP 403
export function createWorkbookAdapter({ graph, config = CONFIG, now = () => new Date(), account = () => null })
//   write({ sheet, row, header, value, expected, reason, field }) → { ok: true, written: { address, value }, conflict: null, itemVersion: { eTag, lastModified } }
//   Ablauf: resolveDriveItem (Cache wie fileAdapter) → GET item ($select eTag,lastModifiedDateTime) + Konflikt mit expected (change.expectedItem) →
//   Header-Zeile 10 lesen → Spaltenindex des Headers (fehlt → HeaderError, kein Raten) → GET range (expected-Wert vergleichen, conflictOf) →
//   writePlan ausführen (createSession → PATCH → closeSession; bei Fehler closeSession trotzdem) → Audit: GET changes.json (404 → leer) → appendAuditJson → PUT →
//   GET item (neue Version) → Ergebnis. 403 an beliebiger Stelle → WriteForbiddenError.
// datasource/index.js: write(change) → getWorkbookAdapter().write(change); Lesepfad bleibt fileAdapter
```

- [ ] **Schritt 1: Tests (RED)** – `tests/workbookAdapter.test.js` mit Fake-Graph (Warteschlange wie `tests/graph.test.js`, Aufzeichnung von method/path/body/headers): (a) Erfolgspfad: Reihenfolge der Requests exakt (site, drive, item, item-select, header-range, range GET, createSession, PATCH mit `values: [['Bern']]` und Session-Header, closeSession, changes.json GET 404, PUT mit Array aus einem Eintrag, item GET) und Rückgabe `{ ok: true, written: { address: 'GB21', value: 'Bern' }, conflict: null }`; (b) Konflikt Datei (eTag abweichend) → `WriteConflictError` kind 'file', kein createSession; (c) Konflikt Zelle → kind 'cell'; (d) 403 beim PATCH → `WriteForbiddenError`, closeSession trotzdem gesendet; (e) Header nicht in Zeile 10 → `HeaderError`, nichts geschrieben; (f) Audit-Datei vorhanden → Append (zwei Einträge). Run → FAIL.
- [ ] **Schritt 2: Umsetzung (GREEN)** – Adapter gemäss Schnittstelle; `datasource/index.js` delegiert; `config.js` `auth.scopes: ['Files.ReadWrite.All']` (in Azure gesetzt, E10) und `sharepoint.auditPath: 'General/07_KUBA/Reporting_KUBA.changes.json'`; Vertragstest in `tests/fileAdapter.test.js` («datasource.write … NotImplementedError») ersetzen durch «ohne Graph-Konfiguration wirft write() einen verständlichen Fehler» oder auf den Adapter-Test verweisen. Run → grün; Smoke grün (Lesepfad unverändert).
- [ ] **Schritt 3: Commit, Push** – «Schreibpfad: workbookAdapter.write mit Session, Konfliktprüfung und Audit (Graph-Mock-Tests)». ⛔ Schrittbericht E.2.

---

### Task 3 (Schritt E.3, nur bei Go): UI hinter Flag in «Personen», Smoke mit Mock

**Dateien:** `views/personen.js`, `views/common.js` (Dialog-Helfer), `app.js` (`ctx.onWrite`, Neuladen), `styles.css`, `tests/smoke/run.mjs`, `tests/smoke/server.mjs` (Mock-Endpunkt für Graph nur im Smoke, Flag über Query `?write=1`) `[hypothese]`

- [ ] **Schritt 1: Smoke (RED)** – mit Flag: Raster-Zelle zeigt «Bearbeiten»; Klick öffnet Formular mit Feld, aktuellem Wert, Eingabe, Grund (Pflicht), Vorschau «alt → neu»; ungültige Eingabe (z. B. Datum «32.13.2026») blockiert mit Parser-Meldung; Bestätigen sendet PATCH an den Mock, danach Neuladen (Datenstand-Zeit ändert sich), Erfolgsmeldung mit Fundstelle; ohne Flag keine «Bearbeiten»-Elemente (bestehende Prüfung). Run → FAIL.
- [ ] **Schritt 2: Umsetzung (GREEN)** – `views/personen.js`: je `td.status-cell` und je Run-Zelle Button «Bearbeiten» (nur `CONFIG.features.write`), Dialog (`<dialog>`) mit Auswahl des Feldes (Passed, Date, Result, Location, Expert 1/2 des Runs), Validierung über `parsePassed`, `parseDate`, `parseResult`, `parseExpert` aus `store.js`, Vorschau, Grund, Bestätigung → `ctx.onWrite(change)`; `app.js`: `onWrite` → `datasource.write(change)` → `load()` → `store.setData` → Meldung; Fehler (`WriteConflictError`, `WriteForbiddenError`) verständlich in `describeError()`. Kein Schreiben im Memory. `tests/smoke/server.mjs`: Mock-Routen nur bei `SMOKE_WRITE_MOCK=1`. Run → grün.
- [ ] **Schritt 3: Commit, Push** – «Schreibpfad: Bearbeiten je Run-Zelle hinter Feature-Flag, Validierung, Vorschau, Neuladen; Smoke mit Mock». ⛔ Schrittbericht E.3.

---

### Task 4 (Schritt E.4, nur bei Go): Dokumentation, Regeln, PR «Ready for review», Abnahme

**Dateien:** `README.md` (Abschnitt «Mutation (Phase 2)»: Umfang, Ablauf, Konflikt, Audit, Flag, Rechte), `CLAUDE.md` (Regel 1 gemäss E10: Struktur nie, Zellwerte nur über den Schreibpfad mit Flag, Validierung, Konfliktprüfung, Audit), `DEPLOY.md` (Scope `Files.ReadWrite.All`, Consent, Aktivierung des Flags), `PROMPT.md` (Harte Regeln, Phase 2), `docs/SPIKE-mutation.md` (Ergebnis)

- [ ] **Schritt 1: Doku** – Abschnitte schreiben; `node tools/glossar-readme.js --write` ohne Änderung (ggf. Glossar «Schreibpfad (Phase 2)» aus Anhang A3 ergänzen, falls in D.4 nicht geschehen).
- [ ] **Schritt 2: Abschluss** – Tests, Smoke (drei Viewports), Snapshot (Baseline D identisch), contrast; PR-Text vollständig; `gh pr ready`; CI. ⛔ Abnahme-Bericht Paket E (0.8); Flag-Aktivierung durch den Auftraggeber nach eigenem Test auf der Testkopie; danach Abschluss des Auftrags PROMPT-2 (Pakete A–E) mit Gesamtbericht.

## Selbstprüfung des Plans

- Spezifikation E.0–E.4 abgedeckt: Umfang (nur Run-Felder, Task 1 Helfer + Task 3 Formular), Spike-Inhalte 1–7 (Task 1 Testseite und Bericht), Go/No-Go-Gate, Adapter mit Sessions, Retry über `graph.js`, Fehlerklassen (Task 2), UI mit Parsern, Vorschau, Grund, Bestätigung, Neuladen, DQ-Wirkung (Task 3), Tests mit Graph-Mock und Smoke mit Mock-Endpunkt (Tasks 2/3), Doku und Regeln (Task 4). Akzeptanzkriterien E.4: Änderung nach Neuladen sichtbar und Struktur unverändert (Spike-Protokoll + `tools/headers.js` vor/nach), Konflikt erkannt (Tests b/c, Spike Schritt 7), ohne Flag keine UI (Smoke), 403 verständlich (Test d), Audit je Änderung (Test a/f, Spike Schritt 8).
- Offene Punkte bis ⛔: Entscheide 2–4 (angenommen wie empfohlen), Datentypen je Feld am File (Spike Schritt 4), Verhalten bei gleichzeitig geöffneter Datei (Spike Schritt 9), Mock-Endpunkt im Smoke-Server `[hypothese]`.
- Typen konsistent: `change = { sheet, row, header, field, value, expected, reason, colIndex?, address?, expectedItem? }` in `writePlan`, `auditEntry`, `workbookAdapter.write`, `datasource.write` und `ctx.onWrite`; Ergebnis `{ ok, written, conflict, itemVersion }` wie in C.8 dokumentiert.
