# Paket D – Experten-Layer (mündliche Prüfung): Umsetzungsplan

> **Für ausführende Agenten:** Plan Task für Task abarbeiten (superpowers:executing-plans). Nach jedem Task (= Schritt D.1 … D.6 aus `PROMPT-2.md`) Bericht nach Vorlage 0.8 und Freigabe abwarten. Entscheide vor Start sind getroffen (06.09.2026, alle wie empfohlen); die Header-abhängigen Entscheide fallen in D.1/D.2 (⛔). TDD: Test zuerst (RED), dann Umsetzung (GREEN).

**Ziel:** Ansicht «Experten» (eigene Gruppe): je Experte/Expertin der mündlichen Prüfung Einsätze, Rollenverteilung Experte 1/2, Durchfallquote (1. Versuch, Wiederholung, gesamt), Ø Resultat, jeweils mit Δ zum Benchmark aller Experten im Filter (E9); Zeilen-Detail je Jahr, Profil, Sprache und Partner; Paarungstabelle; Export «Einsatzebene». Beobachtungswerte, keine Leistungsbeurteilung; Expertennamen sichtbar (E8).

**Architektur:** Header-Verifikation zuerst (`tools/headers.js`, ⛔ Bestätigung). Danach Mapping in `config.js` (nur bestätigte Header-Namen, `required: 'none'`), Normalisierung und Data-Quality in `store.js` (`run.experts`), reine Kennzahlen in `metrics.js` (`expertRuns`, `expertStats`, `expertBenchmark`, `expertPairs`), Tabellenmodelle in `views/tables.js`, Rendering in `views/experten.js`. Sortierzustand nur im Memory (`DEFAULT_UI.experten`), nie in der URL.

**Tech Stack:** Vanilla JS ES-Module, `tests/run-node.js`, Playwright-Smoke (drei Viewports), `tools/snapshot-synth.js`, `tools/glossar-readme.js`.

## Globale Vorgaben (aus `PROMPT-2.md` und `CLAUDE.md`)

- Spalten nur über bestätigte Header-Namen (Zeile 10); nie raten (⛔ D.2). Datei ohne Expertenspalten lädt weiterhin (Ansicht zeigt Hinweis).
- Keine Personendaten im Repo: synthetische Experten «Prüfer Pia», «Experte Emil», «Beisitz Bruno»; Kandidaten wie bisher. `tools/headers.js` gibt nie Zellwerte aus.
- Schichten: `metrics.js` ohne DOM; `views/tables.js` ohne DOM; DOM nur in `views/`. Kennzahlen als reine Funktionen mit n; Gruppen n < 5 markiert.
- Zahlen: Kennzahlen der bestehenden Ansichten bleiben unverändert (Snapshot). Die Experten-Testdaten fügen Data-Quality-Hinweise hinzu (Zähler `hinweise` im Snapshot) → nach D.2 neue Baseline `tests/smoke/output/snapshot-baseline-d.json`, Abweichung im Schrittbericht benennen; sonst identisch.
- Entschieden 06.09.2026 (alle wie empfohlen): (1) Paarungstabelle Experte 1 × Experte 2 umsetzen; (2) Zeitraum wirkt auf das Run-Datum des Einsatzes, Versuche und Wertung wirken nicht; (3) Export «Einsatzebene» mit Kandidatennamen «nur intern» (E5).
- Smoke lokal: `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe node tests/smoke/run.mjs`. Snapshot: `node tools/snapshot-synth.js --vergleich <baseline>`.
- Commits klein, deutsch, Imperativ, Trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; Push je Task; Draft-PR nach dem ersten Push; PR-Text nachführen. Einbau von Code über Skripte: nie `String.replace` mit `$`-haltigem Ersatztext (`$$` wird zu `$`), sondern `split/join`; keine Backslashes in Heredocs.

## Dateistruktur

| Datei | Verantwortung in Paket D |
|---|---|
| `tools/headers.js` (neu) | Header-Übersicht beider Sheets ohne Zellwerte: Spaltenbuchstabe, Header, Anzahl gefüllte Zellen, Anzahl unterschiedliche Werte, Markierung `expert|examiner|experte|prüfer`; reine Funktion `headerSummary(sheet)` + CLI |
| `config.js` | Felder `runKey('oe', p, r, 'expert1'/'expert2')` mit bestätigten Headern (`required: 'none'`), `EXPERT_ALIASES`, `CONFIG.experts.from`, `EXPERT_HEADER_REGEX` |
| `store.js` | `parseExpert()`, `run.experts`, DQ-Regeln (Fehler «nicht lesbar»; Hinweise «fehlt», «ohne Run», «1 = 2»), `fillRun()` mit `experts`, `meta.experts` (Spalten vorhanden ja/nein) |
| `metrics.js` | `expertRuns()`, `expertStats()`, `expertBenchmark()`, `expertPairs()` |
| `views/tables.js` | `expertTables()` (KPIs, Haupttabelle mit Δ, Detail je Jahr/Profil/Sprache/Partner, Paarungen), `expertRunExportTable()` (Einsatzebene) |
| `views/experten.js` (neu) | Ansicht: KPI-Zeile, sortierbare Haupttabelle mit Zeilen-Detail, Paarungen, Hinweis, Leerzustand ohne Spalten |
| `app.js`, `urlState.js` | View in Gruppe «Experten»; `ctx.expertRuns`, `ctx.expertMeta`; `DEFAULT_UI.experten = null` (Sortierung, nicht serialisiert) |
| `glossary.js` | Anhang A3: «Einsatz (Experte)», «Experte 1 / Experte 2», «Einsätze», «Anteil Experte 1», «Durchfallquote (Experte)», «Ø Resultat (Experte)», «Benchmark (Experten)» |
| `styles.css` | Haupttabelle, Sortierpfeile (wie DQ), Phone-Regeln |
| `tests/fixtures.js`, `tests/smoke/synth.mjs` | Expertenspalten je OE-Run, `runValues` mit `expert1/expert2`, `makePerson` mit `experts` je Run; synthetische Einsätze (Anhang A5) |
| `tests/headers.test.js` (neu), `tests/config.test.js`, `tests/store.test.js`, `tests/metrics.test.js`, `tests/tables.test.js`, `tests/urlState.test.js`, `tests/views-meta.test.js`, `tests/smoke/run.mjs` | Tests je Task |
| `README.md`, `PROMPT.md` | Ansicht «Experten», Normalisierung Experte, DQ-Regeln, Datenschutz (E8), Harte Regeln |

---

### Task 1 (Schritt D.1): Header verifizieren – `tools/headers.js`, Lauf auf der lokalen Kopie, Mapping-Vorschlag, ⛔ Bestätigung

**Dateien:** `tools/headers.js` (neu), `tests/headers.test.js` (neu), `tests/all.js`

**Schnittstellen (Produziert):**

```js
// tools/headers.js
export const EXPERT_HEADER_REGEX = /expert|examiner|experte|prüfer|pruefer/i;
export function headerSummary(sheet)   // sheet = { source, sheetName, headerRow, rows } (Parser-Format)
//   → [{ column: 'A', index: 0, header: 'Last Name', filled: 12, distinct: 11, expert: false }, …]  – keine Zellwerte, nur Zahlen
export function columnLetter(index)    // 0 → 'A', 25 → 'Z', 26 → 'AA'
export function formatSummary(sheets)  // Textbericht je Sheet (Markdown-Tabelle), nur Header und Zahlen
```

- [ ] **Schritt 1: Test (RED)** – `tests/headers.test.js`:

```js
import { test, assert, assertEqual } from './runner.js';
import { headerSummary, columnLetter, formatSummary, EXPERT_HEADER_REGEX } from '../tools/headers.js';
import { makeSheet, runValues } from './fixtures.js';

test('headers.columnLetter: A, Z, AA, AB', () => {
  assertEqual([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(27)], ['A', 'Z', 'AA', 'AB']);
});

test('headers.headerSummary: je Header Spalte, gefüllte Zellen, unterschiedliche Werte und Experten-Markierung – nie Zellwerte', () => {
  const sheet = makeSheet('first', [
    { lastName: 'Muster', firstName: 'Anna', employer: 'Testbank AG', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024' }] }) },
    { lastName: 'Beispiel', firstName: 'Ben', employer: 'Testbank AG' },
  ]);
  sheet.headerRow = sheet.headerRow.concat(['OE1 RUN1 Expert 1', 'Prüfer 2']);
  sheet.rows[0].cells = sheet.rows[0].cells.concat(['Prüfer Pia', 'Experte Emil']);
  sheet.rows[1].cells = sheet.rows[1].cells.concat([null, 'Experte Emil']);
  const s = headerSummary(sheet);
  const byHeader = new Map(s.map((x) => [x.header, x]));
  assertEqual(byHeader.get('Last Name').column, 'B');
  assertEqual([byHeader.get('Last Name').filled, byHeader.get('Last Name').distinct], [2, 2]);
  assertEqual([byHeader.get('Employer').filled, byHeader.get('Employer').distinct], [2, 1]);
  assertEqual([byHeader.get('OE1 RUN1 Expert 1').filled, byHeader.get('OE1 RUN1 Expert 1').distinct, byHeader.get('OE1 RUN1 Expert 1').expert], [1, 1, true]);
  assertEqual([byHeader.get('Prüfer 2').filled, byHeader.get('Prüfer 2').distinct, byHeader.get('Prüfer 2').expert], [2, 1, true]);
  assertEqual(byHeader.get('OE1 RUN1 Date').expert, false);
  const text = JSON.stringify(s) + formatSummary([sheet]);
  assert(!/Muster|Anna|Pia|Emil|Testbank/.test(text), 'keine Zellwerte in der Ausgabe');
  assert(/\| B \| Last Name \| 2 \| 2 \|/.test(formatSummary([sheet])), 'Markdown-Zeile je Header');
  assert(EXPERT_HEADER_REGEX.test('Examiner 1') && !EXPERT_HEADER_REGEX.test('Result'));
});
```

`tests/all.js`: `import './headers.test.js';` anhängen. Run: `node tests/run-node.js` → FAIL (Modul fehlt).

- [ ] **Schritt 2: `tools/headers.js` (GREEN)**

```js
#!/usr/bin/env node
// tools/headers.js – Header-Übersicht beider Sheets einer lokalen Excel-Kopie (PROMPT-2 D.2): je Header Spaltenbuchstabe,
// Anzahl gefüllte Zellen, Anzahl unterschiedlicher Werte und eine Markierung für Experten-Header. Gibt NIE Zellwerte aus
// (keine Personendaten). Die Datei wird nur gelesen. Aufruf: node tools/headers.js local/Reporting_KUBA.xlsx

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CONFIG } from '../config.js';

export const EXPERT_HEADER_REGEX = /expert|examiner|experte|prüfer|pruefer/i;

export function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function blank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function headerSummary(sheet) {
  return sheet.headerRow.map((h, i) => {
    const header = h === null || h === undefined ? '' : String(h).trim();
    const values = new Set();
    let filled = 0;
    for (const { cells } of sheet.rows) {
      const v = cells ? cells[i] : null;
      if (blank(v)) continue;
      filled += 1;
      values.add(v instanceof Date ? v.getTime() : String(v).trim().toLowerCase());
    }
    return { column: columnLetter(i), index: i, header, filled, distinct: values.size, expert: EXPERT_HEADER_REGEX.test(header) };
  });
}

export function formatSummary(sheets) {
  const out = [];
  for (const sheet of sheets) {
    out.push('## ' + sheet.sheetName + ' (' + sheet.rows.length + ' Zeilen ab Zeile ' + CONFIG.dataStartRow + ')', '', '| Spalte | Header | gefüllt | unterschiedlich | Experte? |', '|---|---|---|---|---|');
    for (const s of headerSummary(sheet)) out.push('| ' + s.column + ' | ' + (s.header || '(leer)') + ' | ' + s.filled + ' | ' + s.distinct + ' | ' + (s.expert ? '**ja**' : '') + ' |');
    out.push('');
  }
  return out.join('\n');
}

const isMain = typeof process !== 'undefined' && process.argv && String(process.argv[1] || '').replace(/[\\\/]/g, '/').endsWith('tools/headers.js');
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error('Aufruf: node tools/headers.js <Reporting_KUBA.xlsx>');
    process.exit(2);
  }
  const require = createRequire(import.meta.url);
  const { parseWorkbook } = await import('../datasource/fileAdapter.js');
  const libs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };
  const parsed = parseWorkbook(new Uint8Array(readFileSync(path)), libs);
  console.log('# Header-Übersicht – ' + path.split(/[\\/]/).pop() + ' (nur Header und Zahlen, keine Zellwerte)');
  console.log('');
  console.log(formatSummary(parsed.sheets));
}
```

Hinweis zur Datei: Regex-Backslashes nur über das Write-Werkzeug schreiben (nie per Heredoc). Run: `node tests/run-node.js` → grün; `node --check tools/headers.js`.

- [ ] **Schritt 3: Lauf auf der lokalen Kopie und Mapping-Vorschlag** – `node tools/headers.js local/Reporting_KUBA.xlsx > "$S/headers-kuba.md"`; die Ausgabe (Header, Zahlen, Markierungen – keine Werte) in den Schrittbericht übernehmen, dazu die Vorschau `grep -i 'ja' "$S/headers-kuba.md"` für die Experten-Header. Mapping-Vorschlag je OE-Run (`OE{p} RUN{r} …`), Zahl der gefüllten Zellen je Expertenspalte, Prüfung: gibt es Experten-Header ausserhalb der OE-Runs (je Teil statt je Run, oder bei WE-Teilen)? Hypothese `[hypothese]`: `OE{n} RUN{r} Expert 1` / `Expert 2` (Varianten `Examiner 1/2`, `Experte 1/2`, `Expert1`).

- [ ] **Schritt 4: Commit, Push, Draft-PR, ⛔ Bestätigung** – Commit «Werkzeug headers.js: Header-Übersicht ohne Zellwerte (Paket D, Header-Verifikation)». Push, `gh pr create --draft --title "Paket D – Experten-Layer (mündliche Prüfung)" --body-file <PR-Text>`. ⛔ Eine Nachricht mit Header-Liste und Mapping-Vorschlag, gebündelte Fragen: (a) Pflicht-Header ja/nein (Empfehlung: nein, `required: 'none'`, damit ältere Dateien laden); (b) `CONFIG.experts.from` (Datum, ab dem Experten erfasst sind); (c) Rollen-Semantik Experte 1 / Experte 2 (Prüfungsleitung?); (d) Alias-Liste (Empfehlung: leer starten); (e) Färbung der Δ-Werte (Empfehlung: neutral, nur Symbol und Vorzeichen, weil E9 Beobachtungswerte ohne Leistungsbeurteilung verlangt). Keine Umsetzung von D.2 vor der Antwort.

---

### Task 2 (Schritt D.2): Mapping, Normalisierung, Data-Quality, synthetische Experten

**Voraussetzung:** ⛔ Bestätigung aus Task 1 (bestätigte Header-Namen, Pflicht ja/nein, `experts.from`, Rollen-Semantik, Aliase, Δ-Färbung). Die Header unten sind die Hypothese `OE{p} RUN{r} Expert 1/2`; nach der Bestätigung durch die bestätigten Namen ersetzen.

**Dateien:** `config.js`, `store.js`, `tests/fixtures.js`, `tests/smoke/synth.mjs`, `tests/config.test.js`, `tests/store.test.js`, `tests/smoke/run.mjs` (Zahlen)

**Schnittstellen (Produziert):**

```js
// config.js
CONFIG.experts = { from: '<bestätigt, z. B. 2024-01-01>' };           // ab diesem Datum gilt «Experte fehlt» als Hinweis
export const EXPERT_ALIASES = {};                                      // Schreibvariante → kanonischer Name (leer starten)
// HEADER_FIELDS: je OE-Run { key: runKey('oe', p, r, 'expert1'), candidates: ['OE{p} RUN{r} Expert 1', 'OE{p} RUN{r} Examiner 1', 'OE{p} RUN{r} Experte 1'], required: 'none' } und expert2 analog
// store.js
export function parseExpert(raw)                                       // → { value: { name, key } | null, reason?, level? }; leer → null ohne Hinweis
run.experts = [{ role: 1, name, key }, { role: 2, name, key }]         // leere Rollen weggelassen; [] ohne Spalten
meta.experts = { columns: true|false, from: Date|null, headers: [...] } // Spalten in der Datei vorhanden?
// tests/fixtures.js
runValues('oe', { 1: [{ passed: 'yes', date, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] })   // Schlüssel expert1/expert2
makePerson({ oe: { 1: [{ passed: true, date: '2025-06-01', result: 0.8, experts: ['Prüfer Pia', 'Experte Emil'] }] } })  // experts: [name1, name2|null]
```

- [ ] **Schritt 1: Tests config (RED)** – `tests/config.test.js` anhängen:

```js
test('config: Expertenfelder je OE-Run (optional, bestätigte Header) und CONFIG.experts.from (PROMPT-2 D.3)', () => {
  assertEqual(headerCandidates(runKey('oe', 1, 1, 'expert1'))[0], 'OE1 RUN1 Expert 1');
  assertEqual(headerCandidates(runKey('oe', 2, 3, 'expert2'))[0], 'OE2 RUN3 Expert 2');
  assert(!requiredFieldKeys('first').includes(runKey('oe', 1, 1, 'expert1')), 'optional: ältere Dateien ohne Spalten laden weiterhin');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(CONFIG.experts.from), 'experts.from als JJJJ-MM-TT');
  assertEqual(typeof EXPERT_ALIASES, 'object');
  assert(!headerCandidates(runKey('we', 1, 1, 'expert1')), 'keine Expertenfelder für schriftliche Teile');
});
```

(Import um `EXPERT_ALIASES` ergänzen.) Run → FAIL.

- [ ] **Schritt 2: `config.js` (GREEN)** – in `CONFIG` nach `features`: `experts: { from: '<bestätigt>' }, // Experten (Paket D): ab diesem Datum sind Experten erfasst; früher fehlende Experten ergeben keinen Hinweis`. Nach `EMPLOYER_ALIASES`: `export const EXPERT_ALIASES = {}; // Schreibvarianten von Expertennamen → kanonischer Name (leer; Auftraggeber füllt bei Bedarf)`. In `buildHeaderFields()` im Run-Block nach `location`: `if (g.kind === 'oe') { fields.push({ key: runKey(g.kind, p, r, 'expert1'), candidates: [run + ' Expert 1', run + ' Examiner 1', run + ' Experte 1'], required: 'none' }); fields.push({ key: runKey(g.kind, p, r, 'expert2'), candidates: [run + ' Expert 2', run + ' Examiner 2', run + ' Experte 2'], required: 'none' }); }` (Kandidaten = bestätigte Header zuerst). Run → grün.

- [ ] **Schritt 3: Tests store (RED)** – `tests/store.test.js` anhängen (Imports: `parseExpert`; `runValues` ist importiert):

```js
test('parseExpert: Text → { name, key }; Alias; leer → null ohne Hinweis; Zahl/Datum → Fehler', () => {
  assertEqual(parseExpert('  Prüfer   Pia '), { value: { name: 'Prüfer Pia', key: 'prufer pia' }, reason: null });
  assertEqual(parseExpert('').value, null);
  assertEqual(parseExpert(null).reason, null);
  const n = parseExpert(42);
  assert(n.value === null && /nicht lesbar/.test(n.reason) && n.level === 'fehler');
  assert(parseExpert(new Date(2024, 0, 1)).value === null);
});

test('normalizeSheet: Experten je OE-Run mit Rolle; DQ-Regeln fehlt / ohne Run / 1 = 2; ohne Spalten leere Liste', () => {
  const rows = [
    { lastName: 'Muster', firstName: 'Anna', weAllPassed: 'yes', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2025', result: 0.8 }] }),
      ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] }) },
    { lastName: 'Beispiel', firstName: 'Ben', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'no', date: '01.07.2025', result: 0.4, expert1: 'Prüfer Pia' }] }) },        // nur ein Experte: kein Hinweis
    { lastName: 'Fehlt', firstName: 'Fritz', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.08.2025', result: 0.7 }] }) },                           // beide leer, Datum ≥ from → Hinweis «Experte fehlt»
    { lastName: 'Alt', firstName: 'Anton', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2020', result: 0.7 }] }) },                              // vor experts.from → kein Hinweis
    { lastName: 'Ohne', firstName: 'Run', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: '', date: '', expert1: 'Beisitz Bruno' }] }) },                                 // Experte ohne Run → Hinweis
    { lastName: 'Gleich', firstName: 'Gerda', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.09.2025', result: 0.8, expert1: 'Experte Emil', expert2: 'experte emil' }] }) }, // 1 = 2 → Hinweis
  ];
  const { persons, dq } = normalizeSheet(makeSheet('first', rows));
  assertEqual(persons[0].oe[0].runs[0].experts, [{ role: 1, name: 'Prüfer Pia', key: 'prufer pia' }, { role: 2, name: 'Experte Emil', key: 'experte emil' }]);
  assertEqual(persons[1].oe[0].runs[0].experts, [{ role: 1, name: 'Prüfer Pia', key: 'prufer pia' }]);
  assertEqual(persons[0].we[0].runs[0].experts, [], 'schriftliche Runs ohne Experten');
  const reasons = dq.filter((e) => /Experte/.test(e.reason)).map((e) => [e.row - 11, e.level, e.impact, e.reason.slice(0, 20)]);
  assertEqual(reasons, [[2, 'hinweis', 'keine', 'Experte fehlt – abso'], [4, 'hinweis', 'keine', 'Experte ohne Run – F'], [5, 'hinweis', 'keine', 'Experte 1 = Experte ']]);
  const plain = normalizeSheet(makeSheet('first', [rows[0]], { withoutFields: ['oe1.run1.expert1', 'oe1.run1.expert2'] }));
  assertEqual(plain.persons[0].oe[0].runs[0].experts, []);
});

test('mergeVorgang: Experten aus dem Duplikat auffüllen, nie überschreiben', () => {
  const a = normalizeSheet(makeSheet('first', [{ lastName: 'Muster', firstName: 'Anna', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9 }] }) }])).persons[0];
  const b = normalizeSheet(makeSheet('first', [{ lastName: 'Muster', firstName: 'Anna', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9, expert1: 'Prüfer Pia' }] }) }])).persons[0];
  mergeVorgang(a, b);
  assertEqual(a.oe[0].runs[0].experts.map((x) => x.name), ['Prüfer Pia']);
});
```

`makeSheet(source, rows, { withoutFields })`: neue Option in `tests/fixtures.js`, die Header dieser Feldschlüssel aus Zeile 10 entfernt (Datei ohne Expertenspalten). `runValues` muss `expert1`/`expert2` durchreichen (Liste `['passed', 'date', 'score', 'result', 'location', 'expert1', 'expert2']`); `headerRowFor` fügt je OE-Run nach `location` die beiden Expert-Header an (`h(runKey('oe', p, r, 'expert1'))`, `expert2`). Run → FAIL (`parseExpert` fehlt).

- [ ] **Schritt 4: `store.js` (GREEN)**

Nach `parseEmployer()`:

```js
// Experte (Paket D): Text → { name, key }; Alias (EXPERT_ALIASES) vor der Normalisierung; leer → null ohne Hinweis;
// Zahl, Datum oder unlesbar → Fehler «Experte nicht lesbar» (Wirkung «verändert Kennzahl»: Experten-Kennzahlen)
export function parseExpert(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw !== 'string' && typeof raw !== 'number') return bad(null, 'Experte nicht lesbar (' + typeName(raw) + ')');
  const text = String(raw).trim().replace(/\s+/g, ' ');
  if (typeof raw === 'number' || /^\d+([.,]\d+)?$/.test(text)) return bad(null, 'Experte nicht lesbar (Zahl «' + text + '»)');
  const name = EXPERT_ALIASES[text] || text;
  return ok({ name, key: normalizeNamePart(name) });
}
```

In `buildParts()` nach `location`: `experts: [],` und danach (nur `kind === 'oe'`) je Rolle: `const e1 = map[runKey(kind, p, r, 'expert1')] === undefined ? null : field(runKey(kind, p, r, 'expert1'), parseExpert); const e2 = … ; if (e1) run.experts.push({ role: 1, ...e1 }); if (e2) run.experts.push({ role: 2, ...e2 });` und die Hinweise (alle `IMPACT.KEINE`): `run.taken && run.date && expertsFrom && run.date >= expertsFrom && hasColumns && run.experts.length === 0` → `hint(expert1Key, raw, 'Experte fehlt – absolvierter mündlicher Run ab ' + CONFIG.experts.from + ' ohne Experten')`; `run.experts.length && !run.taken && !run.planned` → `hint(expert1Key, raw, 'Experte ohne Run – Feld gefüllt, aber Run weder absolviert noch geplant')`; `e1 && e2 && e1.key === e2.key` → `hint(expert2Key, raw2, 'Experte 1 = Experte 2 – beide Felder nennen dieselbe Person')`. `hasColumns` = ein Expertenfeld gemappt; `expertsFrom` = `parseDay`-artig aus `CONFIG.experts.from` (lokales Datum, Tagesanfang). `fillRun()`: `if (!target.experts.length && sourceRun.experts && sourceRun.experts.length) target.experts = sourceRun.experts.map((x) => ({ ...x }));`. `normalizeWorkbook()`: `meta.experts = { columns: <irgendein Sheet hat expert-Header>, from: <Date|null>, headers: [gefundene Header] }`. `hint(...)` mit `impact` KEINE: `logDq(key, raw, reason, LEVEL.HINWEIS, IMPACT.KEINE)`. Run → grün. Snapshot mit Baseline C identisch (synthetische Datei noch ohne Experten).

- [ ] **Schritt 5: Synthetische Experten (Anhang A5)** – `tests/smoke/synth.mjs`: drei Namen «Prüfer Pia», «Experte Emil», «Beisitz Bruno». Einsätze so setzen: Muster Anna OE1 RUN1 2024 (Pia/Emil), Beispiel Ben IK OE1 RUN1 2024 nicht bestanden (Emil/Bruno), Beispiel Ben CWMA OE1 2026 (Pia/Bruno), Bank Bea 2025 (Pia allein), Zwilling Gabi 1980 OE1 2024 (Bruno/Emil), Wechsel Willi PK OE1 2023 (vor `experts.from` → ohne Experten, kein Hinweis, sofern `from` ≥ 2024), Datumlos Otto OE1 2025 nicht bestanden (Emil/Emil → Hinweis «1 = 2»), Plan Petra OE1 geplant 2026 (Pia/Bruno – geplant, kein Einsatz), Zertifikat Zoe (Sheet 2, OE leer). Erwartung (Bericht): Einsätze 6 (Otto zählt einmal mit einem Experten-Schlüssel), Δ-Werte ≠ 0. `tests/smoke/run.mjs`: nur wenn Zählungen betroffen (Hinweise im Datenstand). Neue Baseline `snapshot-baseline-d.json`; Vergleich mit Baseline C zeigt nur `zaehler.hinweise` (+1 «1 = 2»).

- [ ] **Schritt 6: Alles grün, Commit, Push** – Tests, Smoke (drei Viewports), Snapshot (Baseline D), contrast, glossar-readme. Commit «Experten: Mapping (bestätigte Header), Normalisierung parseExpert, Data-Quality-Regeln, synthetische Experten». Push, PR-Text (D.2). ⛔ Schrittbericht D.2.

---

### Task 3 (Schritt D.3): Kennzahlen `expertRuns`, `expertStats`, `expertBenchmark`, `expertPairs`

**Dateien:** `metrics.js`, `tests/metrics.test.js`

**Schnittstellen (Produziert):**

```js
export function expertRuns(persons, { from = null, to = null } = {})
//   Einsätze: absolvierte OE-Runs (taken, Datum) mit ≥ 1 Experten aus Vorgängen ohne Duplikat; Zeitraum auf das Run-Datum (to = Tagesende)
//   → [{ person, part: 'OE1', run: 1, date, passed, result, experts: [{ role, name, key }], erstversuch: run === 1, jahr, profil, sprache, bank }]
export function expertStats(runs)
//   → je Experte (sortiert nach Einsätzen absteigend, dann Name): { key, name, einsaetze, role1, role2, anteilRole1: ratio, fail: { gesamt, erst, wdh } (ratio), result: { mean, n }, first, last, small,
//        byYear: [{ key, einsaetze, fail, result }], byProfil: [...], bySprache: [...], partners: [{ key, name, einsaetze, fail: ratio, result }] }
export function expertBenchmark(runs)   // → { einsaetze: n, fail: { gesamt, erst, wdh }, result: { mean, n } }
export function expertPairs(runs, limit = 30)  // → [{ expert1, expert2, einsaetze, fail: ratio, result: { mean, n } }] nur Einsätze mit zwei verschiedenen Experten, nach Einsätzen absteigend
```

`ratio(count, n)` und `mean(values)` aus `metrics.js` wiederverwenden (`ratio` liefert `{ count, n, pct, small }`; `mean` liefert `{ mean, n }` – vor dem Schreiben die Signaturen in `metrics.js` Zeilen 55–70 prüfen und die Tests darauf abstimmen).

- [ ] **Schritt 1: Tests (RED)** – `tests/metrics.test.js` anhängen (Import um `expertRuns, expertStats, expertBenchmark, expertPairs` ergänzen). Testfall D.8: 3 Experten, 10 Einsätze mit bekannten Ergebnissen:

```js
function expertCohort() {
  const mk = (i, runs, extra = {}) => makePerson({ lastName: 'Kandidat' + i, profil: 'PK', sprache: 'DE', employerCanon: 'Testbank AG', weAllPassed: true, we: { 1: [{ passed: true, date: '2025-01-10', result: 0.8 }] }, oe: { 1: runs }, ...extra });
  return [
    mk(1, [{ passed: true, date: '2025-03-01', result: 0.9, experts: ['Prüfer Pia', 'Experte Emil'] }]),
    mk(2, [{ passed: false, date: '2025-03-01', result: 0.4, experts: ['Prüfer Pia', 'Experte Emil'] }, { passed: true, date: '2025-06-01', result: 0.7, experts: ['Prüfer Pia', 'Beisitz Bruno'] }]),
    mk(3, [{ passed: true, date: '2025-04-01', result: 0.8, experts: ['Experte Emil', 'Beisitz Bruno'] }], { profil: 'IK', sprache: 'FR' }),
    mk(4, [{ passed: false, date: '2025-05-01', result: 0.5, experts: ['Beisitz Bruno', 'Prüfer Pia'] }]),
    mk(5, [{ passed: true, date: '2024-11-01', result: 0.85, experts: ['Prüfer Pia', null] }]),
    mk(6, [{ passed: false, date: '2026-02-01', result: 0.45, experts: ['Experte Emil', 'Experte Emil'] }], { profil: 'IK' }),
    mk(7, [{ passed: true, date: '2026-03-01', result: 0.95, experts: ['Beisitz Bruno', 'Experte Emil'] }, { passed: null, date: '2030-01-01', planned: true, experts: ['Prüfer Pia', 'Beisitz Bruno'] }]),
    mk(8, [{ passed: true, date: '2025-09-01', result: 0.6, experts: [] }]),                          // ohne Experten: kein Einsatz
    mk(9, [{ passed: true, date: '2025-10-01', result: 0.75, experts: ['Prüfer Pia', 'Experte Emil'] }], { duplicateOf: { sheet: 'x', row: 1 } }), // Duplikat: zählt nicht
  ];
}

test('metrics.expertRuns: absolvierte OE-Runs mit Experten, Zeitraum auf das Run-Datum, keine Duplikate, keine geplanten Runs', () => {
  const runs = expertRuns(expertCohort());
  assertEqual(runs.length, 8);
  assertEqual(runs.map((r) => r.experts.map((e) => e.role + ':' + e.key).join('/')).slice(0, 2), ['1:prufer pia/2:experte emil', '1:prufer pia/2:experte emil']);
  assertEqual(expertRuns(expertCohort(), { from: d('2025-01-01'), to: d('2025-12-31') }).length, 6);
  assertEqual(expertRuns(expertCohort(), { from: d('2026-01-01') }).length, 2);
  assertEqual(expertRuns([]), []);
});

test('metrics.expertStats: Einsätze, Rollen, Durchfallquote nach Versuchsart, Ø Resultat, Partner; Summe der Rollen = 2 × Einsätze mit zwei Experten + Einsätze mit einem', () => {
  const runs = expertRuns(expertCohort());
  const stats = expertStats(runs);
  assertEqual(stats.map((s) => [s.name, s.einsaetze, s.role1, s.role2]), [['Prüfer Pia', 5, 4, 1], ['Experte Emil', 5, 2, 3], ['Beisitz Bruno', 5, 2, 3]]);
  const pia = stats[0];
  assertEqual([pia.fail.gesamt.count, pia.fail.gesamt.n, pia.fail.erst.count, pia.fail.erst.n, pia.fail.wdh.count, pia.fail.wdh.n], [2, 5, 2, 4, 0, 1]);
  assertClose(pia.result.mean, (0.9 + 0.4 + 0.7 + 0.5 + 0.85) / 5, 1e-9);
  assertEqual([pia.first, pia.last], [d('2024-11-01'), d('2025-06-01')]);
  assertEqual(pia.partners.map((p) => [p.name, p.einsaetze]), [['Experte Emil', 2], ['Beisitz Bruno', 2]]);
  assertEqual(pia.byYear.map((y) => [y.key, y.einsaetze]), [['2024', 1], ['2025', 4]]);
  assertEqual(pia.byProfil.map((y) => [y.key, y.einsaetze]), [['PK', 5]]);
  const emil = stats[1];
  assertEqual(emil.partners.map((p) => p.name), ['Prüfer Pia', 'Beisitz Bruno'], 'Einsatz mit sich selbst zählt einmal und ohne Partner');
  const roles = stats.reduce((acc, s) => acc + s.role1 + s.role2, 0);
  const two = runs.filter((r) => r.experts.length === 2).length; // auch Emil/Emil: zwei Rollen-Nennungen, ein Einsatz
  const one = runs.length - two;
  assertEqual(roles, 2 * two + one, 'Rollen-Summe = 2 × Einsätze mit zwei Nennungen + Einsätze mit einer (D.8)');
  assert(stats.every((s) => s.small === false), 'n = 5 → nicht klein');
});

test('metrics.expertBenchmark und expertPairs: Basis der Δ-Werte; Paare nur mit zwei verschiedenen Experten, nach Einsätzen', () => {
  const runs = expertRuns(expertCohort());
  const b = expertBenchmark(runs);
  assertEqual([b.einsaetze, b.fail.gesamt.count, b.fail.erst.n, b.fail.wdh.n], [8, 3, 7, 1]);
  assertClose(b.result.mean, (0.9 + 0.4 + 0.7 + 0.8 + 0.5 + 0.85 + 0.45 + 0.95) / 8, 1e-9);
  const pairs = expertPairs(runs);
  assertEqual(pairs.map((p) => [p.expert1, p.expert2, p.einsaetze]), [['Experte Emil', 'Prüfer Pia', 2], ['Beisitz Bruno', 'Experte Emil', 2], ['Beisitz Bruno', 'Prüfer Pia', 2]]);
  assertEqual(expertPairs(runs, 1).length, 1);
});
```

Paar-Schlüssel: alphabetisch sortierte Namen (Reihenfolge der Rollen egal). Run → FAIL.

- [ ] **Schritt 2: `metrics.js` (GREEN)** – Abschnitt «Experten (Paket D)» vor `// Übersicht`-Block; Hilfsfunktionen `groupRuns(runs, keyFn)`; `expertStats` sammelt je Schlüssel: Einsätze (einmal je Run, auch wenn beide Rollen dieselbe Person nennen), `role1`/`role2` je Nennung, `fail` = `ratio(failed, n)` je Schicht (`erst` = `run === 1`, `wdh` = `run > 1`), `result` = `mean(results mit Wert)`, `first/last` Min/Max Datum, `small` = `einsaetze < SMALL_N`, Aufschlüsselungen je `jahr`, `profil`, `sprache` (leere Werte «unbekannt»), Partner = anderer Experte desselben Runs mit anderem Schlüssel. Sortierung: Einsätze absteigend, dann Name (Collator). Run → grün; Snapshot identisch (Baseline D).

- [ ] **Schritt 3: Commit, Push** – «Experten: Kennzahlen expertRuns, expertStats, expertBenchmark, expertPairs (reine Funktionen, Tests)». PR-Text (D.3). ⛔ Schrittbericht D.3.

---

### Task 4 (Schritt D.4): Tabellenmodelle, Ansicht «Experten», Einbindung, Export Einsatzebene

**Dateien:** `views/tables.js`, `views/experten.js` (neu), `app.js`, `urlState.js`, `tests/tables.test.js`, `tests/urlState.test.js`, `tests/views-meta.test.js`, `styles.css`

**Schnittstellen (Produziert):**

```js
// views/tables.js
export function expertTables(runs, { deltaDirection = 'neutral' } = {})
//   → { benchmark, kpis: [{ label, value, n, small, hint, kind, group: 'Experten' }], main: { title: 'Experten', columns, rows: [{ key, experte, einsaetze, role1, role2, anteil1, fail1, delta1, failW, deltaW, result, deltaR, erster, letzter, small }] },
//       details: Map(key → { jahr: table, profil: table, sprache: table, partner: table }), pairs: table }
//   Spalten (Prio): Experte(1) · Einsätze(1) · als Experte 1(2) · als Experte 2(2) · Anteil Experte 1(2) · Durchfallquote 1. Versuch(1) · Δ 1. Versuch(1) ·
//   Durchfallquote Wiederholung(2) · Δ Wiederholung(2) · Ø Resultat(2) · Δ Ø Resultat(3) · Erster Einsatz(3) · Letzter Einsatz(3); Δ-Spalten mit key 'delta…' und direction aus deltaDirection
export function expertRunExportTable(runs)  // Einsatzebene: Datum · Teilprüfung · Run · Versuch (1. Versuch|Wiederholung) · Experte 1 · Experte 2 · Bestanden · Resultat · Profil · Sprache · Bank · Kandidat (Name) · Sheet · Zeile; note «mit Namen, nur intern»
// urlState.js: DEFAULT_UI.experten = null (Sortierung { sortKey, sortDir } nur im Memory)
// views/experten.js: id 'experten', label 'Experten', group 'Experten', intro, glossar 'Einsatz (Experte)', noPersonExport true, build(ctx)
// app.js ctx: expertRuns: expertRuns(filterPersons(state.persons, filter, { period: false }), { from: filter.from, to: filter.to }), expertMeta: state.meta.experts, experten: state.ui.experten, onExpertenChange(next)
```

- [ ] **Schritt 1: Tests Tabellen und URL-Zustand (RED)** – `tests/tables.test.js` anhängen (Imports `expertTables, expertRunExportTable`; aus metrics `expertRuns`; die Kohorte `expertCohort()` aus `tests/metrics.test.js` als lokale Kopie `expertCohortT()` anlegen):

```js
test('tables.expertTables: KPIs, Haupttabelle mit Prioritäten und Δ zum Benchmark, Detail je Experte, Paarungen', () => {
  const runs = expertRuns(expertCohortT());
  const t = expertTables(runs);
  assertEqual(t.kpis.map((k) => k.label), ['Experten', 'Einsätze', 'Ø Einsätze je Experte', 'Durchfallquote 1. Versuch', 'Durchfallquote Wiederholung', 'Ø Resultat (Experten)']);
  assertEqual(t.kpis[0].value, '3');
  assertEqual(t.main.columns.map((c) => [c.label, c.prio]), [['Experte', 1], ['Einsätze', 1], ['als Experte 1', 2], ['als Experte 2', 2], ['Anteil Experte 1', 2], ['Durchfallquote 1. Versuch', 1], ['Δ 1. Versuch', 1], ['Durchfallquote Wiederholung', 2], ['Δ Wiederholung', 2], ['Ø Resultat', 2], ['Δ Ø Resultat', 3], ['Erster Einsatz', 3], ['Letzter Einsatz', 3]]);
  const pia = t.main.rows[0];
  assertEqual([pia.experte, pia.einsaetze, pia.role1, pia.role2, pia.anteil1, pia.fail1, pia.failW, pia.erster, pia.letzter], ['Prüfer Pia', 5, 4, 1, '80.0 %', '50.0 %', '0.0 %', '01.11.2024', '01.06.2025']);
  assert(/pp$/.test(pia.delta1) && t.main.columns.find((c) => c.key === 'delta1').direction === 'neutral', 'Δ in pp, neutral (E9)');
  assertEqual(t.main.rows.map((r) => r.small), [false, false, false]);
  const det = t.details.get(pia.key);
  assertEqual(det.jahr.rows.map((r) => [r.gruppe, r.einsaetze]), [['2024', 1], ['2025', 4]]);
  assertEqual(det.partner.rows.map((r) => r.partner), ['Experte Emil', 'Beisitz Bruno']);
  assertEqual(t.pairs.columns.map((c) => c.label), ['Experte 1', 'Experte 2', 'Einsätze', 'Durchfallquote', 'Ø Resultat']);
  assertEqual(t.pairs.rows.length, 3);
  assertEqual(expertTables([]).main.rows, []);
});

test('tables.expertRunExportTable: eine Zeile je Einsatz mit Kandidatenname, «nur intern»', () => {
  const t = expertRunExportTable(expertRuns(expertCohortT()));
  assertEqual(t.columns.map((c) => c.label), ['Datum', 'Teilprüfung', 'Run', 'Versuch', 'Experte 1', 'Experte 2', 'Bestanden', 'Resultat', 'Profil', 'Sprache', 'Bank', 'Kandidat', 'Sheet', 'Zeile']);
  assertEqual(t.rows.length, 8);
  assertEqual([t.rows[0].experte1, t.rows[0].experte2, t.rows[0].versuch, t.rows[0].bestanden], ['Prüfer Pia', 'Experte Emil', '1. Versuch', 'ja']);
  assert(/nur intern/.test(t.note));
});
```

`tests/urlState.test.js`: `assertEqual(DEFAULT_UI.experten, null); assertEqual(serializeState(DEFAULT_FILTER, { ...DEFAULT_UI, experten: { sortKey: 'fail1', sortDir: 'desc' } }), '');`. `tests/views-meta.test.js`: `import * as experten`, `VIEW_MODULES` + `experten`, `assertEqual(experten.group, 'Experten')`. Run → FAIL.

- [ ] **Schritt 2: `views/tables.js`, `urlState.js`, Glossar-Vorbereitung (GREEN)** – `expertTables` mit `formatPct` für Quoten, `formatPp((stat − bench) × 100)` für Δ (leer, wenn eine Seite ohne Wert), `fmtDate` für Daten; KPI-Kacheln mit `group: 'Experten'`, `direction: 'neutral'`, `hint`; `details` je Experte: Tabellen «je Jahr», «je Profil», «je Sprache» (Spalten Gruppe(1) · Einsätze(1) · Durchfallquote(1) · Ø Resultat(2)) und «Partner» (Partner(1) · Einsätze(1) · Durchfallquote(2) · Ø Resultat(3)); `pairs` aus `expertPairs`. `DEFAULT_UI.experten = null`. Der Metadaten-Test verlangt den Glossar-Begriff «Einsatz (Experte)» → Glossar-Einträge (Anhang A3, alle sieben) bereits hier in `glossary.js` einfügen und `node tools/glossar-readme.js --write` ausführen (Abweichung vom Dokument wie in Paket C, im Bericht nennen). Run → grün.

- [ ] **Schritt 3: `views/experten.js`**

```js
// views/experten.js – Ansicht «Experten» (PROMPT-2 Paket D): Beobachtungswerte je Experte der mündlichen Prüfung (E8, E9).
import { expertTables, expertRunExportTable } from './tables.js';
import { renderKpis, renderTable, renderExpandableTable, section, hinted, el } from './common.js';

export const id = 'experten';
export const label = 'Experten';
export const group = 'Experten';
export const intro = 'Einsätze, Rollen, Durchfallquote und Ø Resultat je Experte der mündlichen Prüfung gegen den Benchmark aller Experten; Beobachtungswerte, mit Namen.';
export const glossar = 'Einsatz (Experte)';
export const noPersonExport = true; // eigener Export «Einsatzebene»
const SORT_KEYS = ['experte', 'einsaetze', 'role1', 'role2', 'anteil1', 'fail1', 'delta1', 'failW', 'deltaW', 'result', 'deltaR', 'erster', 'letzter'];

function sortRows(rows, sortKey, sortDir) { /* Zahlen aus «83.3 %», «+1.2 pp», Daten «dd.mm.yyyy» numerisch; Text mit Collator; stabil; small unverändert */ }

export function build(ctx) {
  const meta = ctx.expertMeta || { columns: false, headers: [] };
  const hints = ['Beobachtungswerte, keine Leistungsbeurteilung: ein Einsatz zählt für beide Experten voll; Kandidaten mit Wiederholung haben strukturell höhere Durchfallquoten, deshalb getrennter Benchmark je Versuchsart (E9). Profil, Sprache, Bank, VSS/VSM und Zertifikate wirken über die Vorgänge; der Zeitraum wirkt auf das Run-Datum des Einsatzes; Versuche und Wertung wirken nicht.'];
  const sec = hinted(hints);
  if (!meta.columns) return { nodes: [el('p', { class: 'empty', text: 'Keine Expertenspalten in dieser Datei (erwartete Header: ' + (meta.expected || []).join(', ') + ').' })], tables: [], hints };
  const t = expertTables(ctx.expertRuns || []);
  const state = { sortKey: 'einsaetze', sortDir: 'desc', ...(ctx.experten || {}) };
  // Haupttabelle: sortierbare Kopfzellen (button, aria-sort wie DQ), Zeilen-Detail mit vier kleinen Tabellen
  … renderExpandableTable({ ...t.main, rows: sortRows(t.main.rows, state.sortKey, state.sortDir) }, { detail: (row) => detailNode(t.details.get(row.key)) }) und Kopfzellen nachträglich mit Sortier-Buttons versehen (onclick → ctx.onExpertenChange({ sortKey, sortDir }) und Neuaufbau nur der Tabelle)
  return { nodes: [renderKpis(t.kpis, { glossaryHref: ctx.glossaryHref }), sec('Experten', [table]), sec('Paarungen Experte 1 × Experte 2', [renderTable(t.pairs)], 'Einsätze mit zwei verschiedenen Experten, häufigste Paare zuerst (Top 30).', null, { phoneCollapsed: true })], tables: [t.main, t.pairs], hints };
}
```

Sortier-Kopfzellen wie in `views/dataQuality.js` (`th.sortable` mit `button`, `aria-sort`), Standard Einsätze absteigend. `app.js`: `import * as experten`, `KPI_VIEWS` nach `bankReport` … vor `personen`? Nein: Gruppe «Experten» steht in `NAV_GROUPS` nach «Personen»; Reihenfolge in `KPI_VIEWS` egal für die Gruppe, aber `experten` vor `historie` einfügen. `ctx`: `expertRuns`, `expertMeta` (mit `expected: headerCandidates(runKey('oe', 1, 1, 'expert1'))`), `experten: state.ui.experten`, `onExpertenChange: (next) => store.setUi({ experten: next }, { silent: true })`; Export-Menü: `extra: { label: 'Einsatzebene', tables: [expertRunExportTable(ctx.expertRuns)] }` (Aufruf in `renderView` für `view.id === 'experten'`, Suffix `-einsaetze`). Der Store-Test `ui` erwartet das Literal mit `experten: null` (ergänzen). Smoke: Navigation zählt Gruppen ≥ 3 weiterhin; `#nav .nav-group` jetzt vier.

- [ ] **Schritt 4: Alles grün, Commit, Push** – Tests, Smoke (drei Viewports: die Ansicht rendert Haupttabelle und Kacheln; Detailprüfungen in Task 5), Snapshot identisch (Baseline D), contrast, glossar-readme unverändert. Commit «Experten: Tabellenmodelle, Ansicht mit sortierbarer Haupttabelle, Zeilen-Detail, Paarungen und Export Einsatzebene; Glossar». PR-Text (D.4). ⛔ Schrittbericht D.4.

---

### Task 5 (Schritt D.5): Phone-Layout und Smoke-Prüfungen

**Dateien:** `styles.css`, `tests/smoke/run.mjs`

- [ ] **Schritt 1: Smoke Desktop (RED)** – nach dem Personen-Block: `#experten` rendert ≥ 6 Kacheln und die Haupttabelle mit den drei synthetischen Experten (`Prüfer Pia`, `Experte Emil`, `Beisitz Bruno`), Standard nach Einsätzen absteigend; Klick auf Kopf «Durchfallquote 1. Versuch» sortiert (aria-sort wechselt, erste Zeile ändert sich); Zeilen-Detail per Klick zeigt vier Tabellen (je Jahr, je Profil, je Sprache, Partner); Paarungen-Tabelle ≥ 1 Zeile; Zeitraum 2024 (Jahr-Select) → Einsätze-Kachel kleiner als ohne Zeitraum und nur Einsätze mit Run-Datum 2024; Export-Menü enthält «CSV (Einsatzebene)»; kein Kandidatenname in der Haupttabelle (`Muster Anna` fehlt im Tabellentext). Phone-Block: `#experten` ohne Seitenscroll, Haupttabelle mit Prio-1-Spalten (Experte, Einsätze, Durchfallquote 1. Versuch, Δ 1. Versuch), Paarungen eingeklappt. Run → FAIL an mindestens einer Stelle (Paarungen auf Phone noch offen oder Spaltenbreite).

- [ ] **Schritt 2: CSS (GREEN)** – `.expert-table th.sortable button` wie DQ (`styles.css` Zeile ~325 zeigt das Muster), Phone: `.expert-table` mit `white-space: nowrap` für Experte-Spalte, Paarungen `phoneCollapsed` (bereits in Task 4). Run Smoke → grün.

- [ ] **Schritt 3: Commit, Push** – «Experten: Phone-Layout, Smoke-Prüfungen (Sortierung, Zeilen-Detail, Zeitraum auf Einsätze)». PR-Text (D.5). ⛔ Schrittbericht D.5.

---

### Task 6 (Schritt D.6): Dokumentation, PR «Ready for review», Abnahme

**Dateien:** `README.md`, `PROMPT.md`, `glossary.js` (falls in Task 4 noch nicht vollständig)

- [ ] **Schritt 1: README** – Ansichten-Tabelle: Zeile «Experten» nach «Bestenlisten»: Einsätze, Rollen, Durchfallquote 1. Versuch/Wiederholung, Ø Resultat, Δ zum Benchmark aller Experten (E9), Detail je Jahr/Profil/Sprache/Partner, Paarungen, Export Einsatzebene «nur intern»; Beobachtungswerte; mit Expertennamen (E8). «Globale Filter»: Satz zum Zeitraum auf das Run-Datum in «Experten». «Normalisierung und Data-Quality-Log»: Absatz «Experte»: Header (bestätigt), Alias-Liste, Schlüssel wie Personenschlüssel, DQ-Regeln (Fehler «nicht lesbar»; Hinweise «fehlt» ab `experts.from`, «ohne Run», «1 = 2»). Datenschutz-Absatz: Expertennamen in der Ansicht «Experten» und im Export Einsatzebene. Dateiliste: `views/experten.js`, `tools/headers.js`. Werkzeuge: `node tools/headers.js <Datei.xlsx>` (Header ohne Werte).
- [ ] **Schritt 2: `PROMPT.md`** – Harte Regel Namen: «… Experten (Expertennamen) …» ergänzen; Werkzeuge-Liste, falls vorhanden.
- [ ] **Schritt 3: Prüfen, Commit, Push, Ready** – `node tools/glossar-readme.js --write` ohne Änderung, Tests, Smoke, Snapshot (Baseline D), contrast. Commit «Doku: Ansicht Experten, Normalisierung Experte, Data-Quality-Regeln, Datenschutz (E8)». CI, PR-Text vollständig, `gh pr ready <n>`. ⛔ Abnahme-Bericht Paket D (0.8) inklusive «Entscheide vor Start» Paket E (Fragen aus `PROMPT-2.md`, Abschnitt «Paket E», Block «⛔ Entscheide vor Start»; je Frage Empfehlung und Begründung in je einem Satz).

## Selbstprüfung des Plans

- Spezifikation D.1–D.8 abgedeckt: Header-Verifikation mit Werkzeug und ⛔ (Task 1), Mapping/Normalisierung/DQ/Duplikate (Task 2), Kennzahlen mit Schichten, Partner, Aufschlüsselung, Benchmark, Paarungen (Task 3), Ansicht mit KPI-Zeile, sortierbarer Haupttabelle, Zeilen-Detail, Paarungen, Hinweis, Exporten, Leerzustand ohne Spalten (Task 4), Filterverhalten Zeitraum auf Run-Datum (Task 3/4, Smoke in Task 5), Phone (Task 5), Doku und Glossar (Task 4/6). Akzeptanzkriterien D.8 als Tests: 3 Experten, bekannte Ergebnisse, Rollen-Summe, Zeitraum 2025 nur Run-Datum, keine Kandidatennamen in Aggregaten, Datei ohne Spalten lädt.
- Offene Punkte bis ⛔ D.1/D.2: bestätigte Header-Namen, `experts.from`, Rollen-Semantik, Aliase, Δ-Färbung (Plan nimmt «neutral» an).
- Typen konsistent: `run.experts` `[{ role, name, key }]` in store, metrics (`expertRuns` kopiert die Liste), tables, view; Schichtnamen `gesamt`/`erst`/`wdh` in `expertStats`, `expertBenchmark`, `expertTables`; Spaltenschlüssel `fail1`, `delta1`, `failW`, `deltaW`, `result`, `deltaR` in Tabelle, Sortierung und Smoke.
