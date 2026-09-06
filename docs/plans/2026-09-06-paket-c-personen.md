# Paket C – Personen-Layer (Suche und Pfad): Umsetzungsplan

> **Für ausführende Agenten:** Plan Task für Task abarbeiten (superpowers:executing-plans). Nach jedem Task (= Schritt C.1 … C.6 aus `PROMPT-2.md`) Bericht nach Vorlage 0.8 und Freigabe abwarten. Entscheide vor Start sind getroffen (06.09.2026, alle wie empfohlen). TDD: Test zuerst (RED), dann Umsetzung (GREEN).

**Ziel:** Eine Ansicht «Personen» (Gruppe Personen), in der eine Person gesucht und ihr ganzer Weg durch die Zertifizierung nachvollzogen wird: alle Vorgänge in zeitlicher Abfolge, jede Prüfung als Ereignis, Status, Zertifikat, Datenqualität und Fundstelle. Lesend (E7); Schreibpfad nur vorbereitet (Flag, Signatur).

**Architektur:** Reine Funktionen in `metrics.js` (Suchindex, Pfad, Zeitachse, Raster) → Tabellenmodelle in `views/tables.js` → Rendering in `views/personen.js` mit den Helfern aus `views/common.js`. Suchtext und gewählte Person liegen nur im Memory (`store.ui.personen`), nie in der URL; ein Datenwechsel leert sie. Namen erscheinen in dieser Ansicht (E7), Exporte tragen «nur intern».

**Tech Stack:** Vanilla JS ES-Module, `tests/run-node.js`, Playwright-Smoke (drei Viewports), `tools/snapshot-synth.js`, `tools/glossar-readme.js`.

## Globale Vorgaben (aus `PROMPT-2.md` und `CLAUDE.md`)

- Keine Personendaten im Repo: nur erfundene Namen («Muster Anna», «Beispiel Ben», «Testbank AG», «Musterbank» und die neuen Namen aus Anhang A5).
- Nie localStorage/sessionStorage/IndexedDB für Daten; Suchtext und Personenschlüssel nie in der URL (`serializeState()` ohne `personen`).
- Spalten nur über Header-Namen; `certEnd` ist bereits gemappt (`config.js`, `required: 'none'`).
- Schichten: `metrics.js` ohne DOM; `views/tables.js` ohne DOM; DOM nur in `views/`.
- Zahlen: `store.js`-Änderung (`certEnd`) darf keine Kennzahl ändern → Snapshot-Vergleich **vor** der Erweiterung der synthetischen Daten identisch; danach neue Baseline `tests/smoke/output/snapshot-baseline-c.json` (Zahlen ändern sich nur durch die neuen synthetischen Personen; Abweichung im Schrittbericht benennen).
- Entschieden 06.09.2026 (alle wie empfohlen): (1) ohne Suchtext leer, ausser Bank-Filter gesetzt → alle Personen der Bank alphabetisch; (2) Profil, Sprache, Bank, VSS/VSM, Zertifikate wirken auf die Trefferliste, Zeitraum/Versuche/Wertung nicht, das Detail zeigt immer alle Vorgänge; (3) Geburtsjahr nur, wenn die Trefferliste Namensgleiche enthält, nie das volle Datum; (4) Export «Diese Person» mit Dateiname `personen-vorgang-<datum>` ohne Namen, Inhalt «nur intern».
- Smoke lokal: `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe node tests/smoke/run.mjs`. Snapshot: `node tools/snapshot-synth.js --vergleich <baseline>`.
- Commits klein, deutsch, Imperativ, Trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; Push je Task; Draft-PR nach dem ersten Push, PR-Text nachführen.

## Dateistruktur

| Datei | Verantwortung in Paket C |
|---|---|
| `metrics.js` | `normalizeNamePart()` (aus `store.js` verschoben), `personSearchIndex()`, `searchPersons()`, `personPath()`, `runTimeline()`, `examGrid()` |
| `store.js` | Feld `certEnd` (normalizeSheet, mergeVorgang); Re-Export `normalizeNamePart`; `setData()`/`clear()` leeren `ui.personen` |
| `views/tables.js` | `personResultsTable()`, `personGridTable()`, `personTimelineTable()`, `personDqTable()`; Spalte «Zertifikatsende» im Export; `STATUS_COLUMN_LABELS` + «Ergebnis» |
| `urlState.js` | `DEFAULT_UI.personen = null`, nie serialisiert |
| `views/common.js` | `cell()` mit Spaltenoption `status` (Badge am letzten Segment), `renderExpandableTable({ isOpen, onToggle })`, `renderExportMenu({ note })` |
| `views/personen.js` (neu) | Suche (Debounce 150 ms, Fokus bleibt), Trefferliste, Detail (Kopf, Pfad, Karten je Vorgang, Raster, Zeitachse, DQ, Export), Bearbeiten-Button nur bei `CONFIG.features.write` |
| `app.js` | View in `KPI_VIEWS` vor «Offene Vorgänge»; `ctx.personVorgaenge`, `ctx.allVorgaenge`, `ctx.dq`, `ctx.personen`, `ctx.onPersonenChange` |
| `glossary.js` | «Pfad einer Person», «Prüfungsraster», «Zeitachse (Person)» (Anhang A3) |
| `styles.css` | Suchfeld, Pfad-Leiste, Karten je Vorgang, Raster; Phone: Pfad vertikal, Raster eingeklappt |
| `config.js` | `features: { write: false }` |
| `datasource/index.js` | Signatur `write({ sheet, row, header, value, expected, reason })` dokumentiert, bleibt `NotImplementedError` |
| `tests/fixtures.js`, `tests/smoke/synth.mjs` | Anhang A5: Bankwechsel, Namensgleiche, ohne Geburtsdatum; `certEnd` im Modell |
| `tests/metrics.test.js`, `tests/store.test.js`, `tests/store-state.test.js`, `tests/tables.test.js`, `tests/urlState.test.js`, `tests/views-meta.test.js`, `tests/config.test.js`, `tests/fileAdapter.test.js` | Tests je Task |
| `tests/smoke/run.mjs` | Zahlen der erweiterten Datei, Personen-Suche Desktop und Phone, URL ohne Suchtext, Speicher leer |
| `README.md`, `PROMPT.md` | Ansicht «Personen», Filterverhalten, Datenschutz (E7), Harte Regeln |

---

### Task 1 (Schritt C.1): Modell und reine Funktionen, synthetische Daten

**Dateien:** `metrics.js`, `store.js`, `views/tables.js` (nur Export-Spalte), `tests/fixtures.js`, `tests/smoke/synth.mjs`, `tests/smoke/run.mjs` (Zahlen), `tests/metrics.test.js`, `tests/store.test.js`, `tests/tables.test.js`

**Schnittstellen (Produziert):**

```js
// metrics.js
export function normalizeNamePart(raw)                    // wie bisher in store.js (NFD, Akzente weg, ß→ss, Kleinschreibung, Nicht-Buchstaben → Leerzeichen)
export function personSearchIndex(persons)                // → Einträge je Person (ohne Duplikate), alphabetisch (Nachname, Vorname, Geburtsdatum)
//   { key, lastName, firstName, birthDate, keyLevel: 'full'|'name-only', name: 'Nachname Vorname', nameKey: 'nachname|vorname',
//     vorgaenge: [chronologisch], profiles: ['PK','IK'], latest: <jüngster Vorgang>, bank, formerBanks: [...],
//     lastExam: Date|null, certCount, status, passiv, role, text: <normalisierter Suchtext> }
export function searchPersons(index, query, { limit = 50, all = false } = {})
//   → { persons: [Einträge], total, truncated, tooShort }; Begriffe UND-verknüpft; ab 2 Zeichen; all = ohne Suchtext alle (Bank-Filter, Entscheid 1)
export function personPath(person)                         // → [{ vorgang, profil, jahr, status, passiv, issued, certNumber, missing, passerelle }]
export function runTimeline(vorgang)                       // → [{ kind: 'run'|'zertifikat', date, label, part, run, location, result, passed, planned, ergebnis }]
export function examGrid(vorgang, parts = profileParts())  // → { spec: bool, outside: ['WE4'], rows: [{ label, kind, part, inSpec, runs: [{ n, taken, planned, date, result, passed, ergebnis }] }] }
```

Reihenfolge der Vorgänge einer Person (C.3): `firstExamDate`, sonst `refDate`, sonst Zeile. `ergebnis` je Run: `geplant` (planned), `bestanden` (passed true), `nicht bestanden` (passed false), sonst `–` (nicht absolviert) bzw. `ohne Ergebnis` (Datum vergangen, kein Passed-Wert). Suchtext = Nachname, Vorname, je Vorgang Bank (`employerCanon` und `employer`), Profil, Sprache, Zertifikatsnummer, Statuswörter (`bestanden`, `nicht bestanden`, `offen`, `passiv`, `nicht erfasst`), alles über `normalizeNamePart()`.

- [ ] **Schritt 1: `normalizeNamePart` nach `metrics.js` verschieben (Test bleibt in `store.test.js` über Re-Export)**

In `metrics.js` nach `formatPct()` einfügen (Text 1:1 aus `store.js`, dort löschen und stattdessen `normalizeNamePart` aus `./metrics.js` importieren und re-exportieren: `export { normalizeNamePart };`). `node tests/run-node.js` bleibt grün (285). Kein Commit nötig, gehört zu Schritt 4.

- [ ] **Schritt 2: Tests für `certEnd` (RED)** – in `tests/store.test.js` nach dem Test «resolveHeaders: certStart fehlt nur in Sheet 2 hart»:

```js
test('normalizeSheet: certEnd (Certificate End Date) wird gelesen, in Sheet 1 ohne Header null; mergeVorgang füllt certEnd auf', () => {
  const issued = makeSheet('issued', [{ lastName: 'Muster', firstName: 'Anna', profil: 'PK', certStart: '01.07.2024', certEnd: '30.06.2029', weAllPassed: 'yes', oeAllPassed: 'yes' }]);
  const p = normalizeSheet(issued).persons[0];
  assertEqual(p.certEnd, new Date(2029, 5, 30));
  const first = makeSheet('first', [{ lastName: 'Muster', firstName: 'Anna', profil: 'PK', weAllPassed: 'yes', oeAllPassed: 'yes' }]);
  const q = normalizeSheet(first).persons[0];
  assertEqual(q.certEnd, null, 'Sheet 1 hat keinen Header Certificate End Date');
  mergeVorgang(q, p);
  assertEqual(q.certEnd, new Date(2029, 5, 30), 'Lücke aus dem Duplikat aufgefüllt');
});
```

(`mergeVorgang` ist bereits exportiert; falls nicht importiert, im Import-Block von `store.test.js` ergänzen.) In `tests/tables.test.js` im Test «tables.vorgangExportTables …» das Fixture `p` um `certEnd: d('2029-06-30')` erweitern und die Zeile mit `r.certStart` so ändern:

```js
  assertEqual([r.first, r.refDate, r.issued, r.certNumber, r.certStart, r.certEnd, r.personKey, r.duplicates], ['01.03.2024', '01.06.2024', 'ja', 'Z-9', '01.07.2024', '30.06.2029', 'Name + Geburtsdatum', 'First Certification Zeile 12']);
```

Run: `node tests/run-node.js` → erwartet FAIL (`certEnd` undefined).

- [ ] **Schritt 3: `certEnd` umsetzen (GREEN)**

`store.js` im Personenobjekt nach `certStart`: `certEnd: map.certEnd === undefined ? null : field('certEnd', parseDate),`; in `mergeVorgang()` die Schlüsselliste um `'certEnd'` ergänzen (`['certNumber', 'certStart', 'certEnd', 'birthDate', …]`). `tests/fixtures.js` `makePerson`: `certEnd: null,` nach `certNumber`. `views/tables.js` `vorgangExportTables`: Spalte `col('certEnd', 'Zertifikatsende')` nach `certStart` und im Row-Objekt `certEnd: fmtDate(p.certEnd)`. Run: `node tests/run-node.js` → grün. **Snapshot-Kontrolle:** `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json` → «identisch».

- [ ] **Schritt 4: Tests für die reinen Funktionen (RED)** – am Ende von `tests/metrics.test.js` (Import-Block um `normalizeNamePart, personSearchIndex, searchPersons, personPath, runTimeline, examGrid` ergänzen):

```js
// Paket C: Personen-Layer – synthetische Personen mit Bankwechsel, Namensgleichen und ohne Geburtsdatum (Anhang A5)
function personenCohort() {
  return [
    simple({ lastName: 'Wechsel', firstName: 'Willi', birthDate: d('1989-09-09'), profil: 'PK', employerCanon: 'Testbank AG', employer: 'Testbank AG', issued: true, certNumber: 'Z-7', certStart: d('2023-07-01'),
      we: { 1: [{ passed: true, date: '2023-03-01', result: 0.8 }] }, oe: { 1: [{ passed: true, date: '2023-06-01', result: 0.85 }] } }),
    makePerson({ lastName: 'Wechsel', firstName: 'Willi', birthDate: d('1989-09-09'), profil: 'IK', employerCanon: 'Musterbank', employer: 'Musterbank', weAllPassed: true,
      we: { 1: [{ passed: true, date: '2026-02-01', result: 0.75 }] } }),
    simple({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: d('1980-01-01'), profil: 'PK', employerCanon: 'Testbank AG' }),
    makePerson({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: d('1991-05-05'), profil: 'KMU', employerCanon: 'Musterbank', sprache: 'FR',
      we: { 1: [{ passed: true, date: '2026-04-01', result: 0.7 }], 2: [{ date: '2026-10-01', planned: true, location: 'Bern' }] } }),
    makePerson({ lastName: 'Datumlos', firstName: 'Otto', profil: 'PK', employerCanon: 'Testbank AG', weAllPassed: true, oeAllPassed: false,
      we: { 1: [{ passed: true, date: '2025-05-01', result: 0.8 }] }, oe: { 1: [{ passed: false, date: '2025-08-01', result: 0.5 }] } }),
  ];
}

test('metrics.personSearchIndex: eine Zeile je Person, Vorgänge chronologisch, Bankwechsel als frühere Bank, Namensgleiche getrennt, ohne Geburtsdatum «name-only»', () => {
  const index = personSearchIndex(personenCohort());
  assertEqual(index.map((e) => [e.name, e.keyLevel, e.profiles.join(' → '), e.bank, e.formerBanks]), [
    ['Datumlos Otto', 'name-only', 'PK', 'Testbank AG', []],
    ['Wechsel Willi', 'full', 'PK → IK', 'Musterbank', ['Testbank AG']],
    ['Zwilling Gabi', 'full', 'PK', 'Testbank AG', []],
    ['Zwilling Gabi', 'full', 'KMU', 'Musterbank', []],
  ]);
  const willi = index[1];
  assertEqual([willi.vorgaenge.length, willi.latest.profil, willi.certCount, willi.status, willi.lastExam], [2, 'IK', 1, 'offen', d('2026-02-01')]);
  assert(willi.text.includes('wechsel') && willi.text.includes('musterbank') && willi.text.includes('testbank ag') && willi.text.includes('z 7') && willi.text.includes('offen') && willi.text.includes('bestanden'), willi.text);
  assertEqual(personSearchIndex([]), []);
});

test('metrics.searchPersons: ab 2 Zeichen, Teilstring, Begriffe UND-verknüpft, Akzente egal; ohne Suchtext leer ausser all; Limit', () => {
  const index = personSearchIndex(personenCohort());
  assertEqual(searchPersons(index, 'W').persons.length, 0);
  assertEqual(searchPersons(index, 'W').tooShort, true);
  assertEqual(searchPersons(index, 'wech').persons.map((e) => e.name), ['Wechsel Willi']);
  assertEqual(searchPersons(index, 'zwilling musterbank').persons.map((e) => e.bank), ['Musterbank'], 'UND: Name und Bank');
  assertEqual(searchPersons(index, 'Z-7').persons.map((e) => e.name), ['Wechsel Willi'], 'Zertifikatsnummer');
  assertEqual(searchPersons(index, 'KMU').persons.map((e) => e.name), ['Zwilling Gabi'], 'Profil');
  assertEqual(searchPersons(index, 'nicht bestanden').persons.map((e) => e.name), ['Datumlos Otto'], 'Status');
  assertEqual(searchPersons(index, 'Wéchsel').persons.length, 1, 'Akzente normalisiert');
  assertEqual(searchPersons(index, '').persons.length, 0);
  assertEqual(searchPersons(index, '', { all: true }).persons.length, 4, 'Bank-Filter gesetzt: alle Personen');
  const limited = searchPersons(index, '', { all: true, limit: 2 });
  assertEqual([limited.persons.length, limited.total, limited.truncated], [2, 4, true]);
});

test('metrics.personPath: Schritte je Vorgang mit Jahr, Status, Zertifikat, fehlenden Teilen und Passerelle', () => {
  const willi = personSearchIndex(personenCohort()).find((e) => e.lastName === 'Wechsel');
  const path = personPath(willi);
  assertEqual(path.map((s) => [s.profil, s.jahr, s.status, s.issued, s.certNumber, s.missing, s.passerelle]), [
    ['PK', 2023, 'bestanden', true, 'Z-7', [], null],
    ['IK', 2026, 'offen', false, null, ['OE1'], 'PK'],
  ]);
});

test('metrics.runTimeline: absolvierte und geplante Runs chronologisch, Zertifikatsbeginn als Ereignis, Runs ohne Datum am Ende', () => {
  const p = makePerson({ profil: 'PK', certStart: d('2024-07-01'), certNumber: 'Z-1', weAllPassed: true, oeAllPassed: true,
    we: { 1: [{ passed: false, date: '2024-01-10', result: 0.4, location: 'Bern' }, { passed: true, date: '2024-03-01', result: 0.7 }], 2: [{ passed: true, result: 0.9 }] },
    oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }, { date: '2030-01-01', planned: true, location: 'Zürich' }] } });
  assertEqual(runTimeline(p).map((e) => [e.kind, e.label, e.date, e.location, e.result, e.ergebnis]), [
    ['run', 'WE1 RUN1', d('2024-01-10'), 'Bern', 0.4, 'nicht bestanden'],
    ['run', 'WE1 RUN2', d('2024-03-01'), null, 0.7, 'bestanden'],
    ['run', 'OE1 RUN1', d('2024-06-01'), null, 0.9, 'bestanden'],
    ['zertifikat', 'Zertifikatsbeginn Z-1', d('2024-07-01'), null, null, 'Zertifikat'],
    ['run', 'OE1 RUN2', d('2030-01-01'), 'Zürich', null, 'geplant'],
    ['run', 'WE2 RUN1', null, null, 0.9, 'bestanden'],
  ]);
  assertEqual(runTimeline(makePerson({})), []);
});

test('metrics.examGrid: Teile der Vorgabe × RUN1–RUN3, Runs ausserhalb der Vorgabe markiert, ohne Vorgabe alle genutzten Teile', () => {
  const p = makePerson({ profil: 'PK', we: { 1: [{ passed: false, date: '2026-01-10', result: 0.4 }, { date: '2026-10-01', planned: true }], 2: [{ passed: true, date: '2026-02-01', result: 0.6 }] }, oe: {} });
  const g = examGrid(p);
  assertEqual([g.spec, g.outside], [true, ['WE2']]);
  assertEqual(g.rows.map((r) => [r.label, r.inSpec, r.runs.map((x) => x.ergebnis).join(',')]), [['WE1', true, 'nicht bestanden,geplant,–'], ['OE1', true, '–,–,–'], ['WE2', false, 'bestanden,–,–']]);
  assertEqual(g.rows[0].runs[0].date, d('2026-01-10'));
  const unknown = examGrid(makePerson({ profil: null, we: { 3: [{ passed: true, date: '2026-02-01', result: 0.6 }] } }));
  assertEqual([unknown.spec, unknown.rows.map((r) => r.label)], [false, ['WE3']]);
});
```

Run: `node tests/run-node.js` → erwartet FAIL (`personSearchIndex is not a function`).

- [ ] **Schritt 5: Reine Funktionen umsetzen (GREEN)** – in `metrics.js` nach `multiProfilePersons()`:

```js
// ---------------------------------------------------------------------------
// Personen-Layer (PROMPT-2 Paket C): Suche, Pfad, Zeitachse, Raster – reine Funktionen
// ---------------------------------------------------------------------------

const STATUS_WORDS = { bestanden: 'bestanden', 'nicht bestanden': 'nicht bestanden', offen: 'offen', 'nicht erfasst': 'nicht erfasst' };

function vorgangOrderTime(v) {
  return v.firstExamDate ? v.firstExamDate.getTime() : v.refDate ? v.refDate.getTime() : Number.MAX_SAFE_INTEGER;
}

// Suchindex: ein Eintrag je Person (Personenschlüssel), Vorgänge chronologisch; text = normalisierte Suchfelder (C.2)
export function personSearchIndex(persons) {
  const out = [];
  for (const g of groupByPerson(persons)) {
    const vorgaenge = g.vorgaenge.slice().sort((a, b) => vorgangOrderTime(a) - vorgangOrderTime(b) || a.row - b.row);
    const latest = vorgaenge[vorgaenge.length - 1];
    const banks = [...new Set(vorgaenge.map((v) => v.employerCanon).filter(Boolean))];
    const dated = vorgaenge.flatMap((v) => v.we.concat(v.oe)).flatMap((part) => part.runs).filter((r) => r.taken && r.date).map((r) => r.date.getTime());
    const words = [];
    for (const v of vorgaenge) {
      words.push(v.employerCanon, v.employer, v.profil, v.sprache, v.certNumber, STATUS_WORDS[v.status] || '', v.passiv ? 'passiv' : '');
    }
    out.push({
      key: g.key, lastName: g.lastName, firstName: g.firstName, birthDate: g.birthDate, keyLevel: latest.personKeyLevel === 'full' ? 'full' : 'name-only',
      name: [g.lastName, g.firstName].filter(Boolean).join(' '), nameKey: normalizeNamePart(g.lastName) + '|' + normalizeNamePart(g.firstName),
      vorgaenge, profiles: [...new Set(vorgaenge.map((v) => (v.profil === undefined || v.profil === null ? 'unbekannt' : v.profil)))],
      latest, bank: latest.employerCanon || (banks.length ? banks[banks.length - 1] : ''), formerBanks: banks.filter((b) => b !== latest.employerCanon),
      lastExam: dated.length ? new Date(Math.max(...dated)) : null, certCount: vorgaenge.filter((v) => v.issued).length,
      status: latest.status, passiv: !!latest.passiv, role: latest.role || '',
      text: [g.lastName, g.firstName].concat(words).map((w) => normalizeNamePart(w)).filter(Boolean).join(' '),
    });
  }
  return out.sort((a, b) => collator.compare(a.lastName || '', b.lastName || '') || collator.compare(a.firstName || '', b.firstName || '') || (a.birthDate ? a.birthDate.getTime() : 0) - (b.birthDate ? b.birthDate.getTime() : 0));
}

// Suche (C.2): ab 2 Zeichen, mehrere Begriffe = UND, Teilstring auf dem normalisierten Suchtext; all = ohne Suchtext alle (Entscheid 1)
export function searchPersons(index, query, { limit = 50, all = false } = {}) {
  const q = String(query || '').trim();
  let hits;
  if (q.length < 2) {
    if (!all) return { persons: [], total: 0, truncated: false, tooShort: q.length > 0 };
    hits = index.slice();
  } else {
    const terms = normalizeNamePart(q).split(' ').filter(Boolean);
    hits = index.filter((e) => terms.every((t) => e.text.includes(t)));
  }
  return { persons: hits.slice(0, limit), total: hits.length, truncated: hits.length > limit, tooShort: false };
}

// Pfad (C.3): ein Schritt je Vorgang in zeitlicher Reihenfolge
export function personPath(entry) {
  const parts = profileParts();
  const index = personIndex(entry.vorgaenge);
  return entry.vorgaenge.map((v) => ({
    vorgang: v, profil: v.profil === undefined || v.profil === null ? 'unbekannt' : v.profil, jahr: v.firstExamDate ? v.firstExamDate.getFullYear() : null,
    status: v.status, passiv: !!v.passiv, issued: !!v.issued, certNumber: v.certNumber || null, missing: missingParts(v, parts), passerelle: passerelleFrom(v, index),
  }));
}

function runErgebnis(r) {
  if (r.planned) return 'geplant';
  if (r.passed === true) return 'bestanden';
  if (r.passed === false) return 'nicht bestanden';
  return r.date ? 'ohne Ergebnis' : '–';
}

// Zeitachse (C.3): datierte Runs (absolviert und geplant) chronologisch, Zertifikatsbeginn als Ereignis, Runs ohne Datum am Ende
export function runTimeline(v) {
  const events = [];
  for (const kind of ['we', 'oe']) {
    for (const part of v[kind]) {
      for (const r of part.runs) {
        if (!r.taken && !r.planned) continue;
        events.push({ kind: 'run', date: r.date, label: kind.toUpperCase() + part.part + ' RUN' + r.n, part: kind.toUpperCase() + part.part, run: r.n, location: r.location || null, result: r.result, passed: r.passed, planned: !!r.planned, ergebnis: runErgebnis(r) });
      }
    }
  }
  if (v.certStart) events.push({ kind: 'zertifikat', date: v.certStart, label: 'Zertifikatsbeginn' + (v.certNumber ? ' ' + v.certNumber : ''), part: null, run: null, location: null, result: null, passed: null, planned: false, ergebnis: 'Zertifikat' });
  const t = (e) => (e.date ? e.date.getTime() : Number.MAX_SAFE_INTEGER);
  return events.sort((a, b) => t(a) - t(b) || (a.kind === 'zertifikat') - (b.kind === 'zertifikat') || a.label.localeCompare(b.label));
}

// Prüfungsraster (C.3): Teile der Vorgabe (PROFILE_PARTS) × RUN1–RUN3; genutzte Teile ausserhalb der Vorgabe angehängt und markiert
export function examGrid(v, parts = profileParts()) {
  const def = parts.find((x) => x.profil === v.profil) || null;
  const used = (part) => part.runs.some((r) => r.taken || r.planned);
  const row = (kind, part, inSpec) => ({ label: kind.toUpperCase() + part.part, kind, part: part.part, inSpec, runs: part.runs.map((r) => ({ n: r.n, taken: r.taken, planned: !!r.planned, date: r.date, result: r.result, passed: r.passed, ergebnis: runErgebnis(r) })) });
  const rows = [];
  const outside = [];
  for (const kind of ['we', 'oe']) {
    const spec = def ? def[kind] : [];
    for (const n of spec) if (v[kind][n - 1]) rows.push(row(kind, v[kind][n - 1], true));
  }
  for (const kind of ['we', 'oe']) {
    for (const part of v[kind]) {
      const inSpec = !!def && def[kind].includes(part.part);
      if (inSpec || !used(part)) continue;
      rows.push(row(kind, part, !def ? true : false));
      if (def) outside.push(kind.toUpperCase() + part.part);
    }
  }
  return { spec: !!def, outside, rows };
}
```

Run: `node tests/run-node.js` → grün. Wenn eine Erwartung nicht passt (z. B. Sortierung der Zeitachse), zuerst prüfen, ob der Test die Absicht der Spezifikation trifft; Test nur bei einem Denkfehler im Test anpassen.

- [ ] **Schritt 6: Synthetische Daten erweitern (Anhang A5)** – in `tests/smoke/synth.mjs` im Block `add('first', [...])` nach «Bank Bea» anhängen:

```js
    // Paket C (Anhang A5): Bankwechsel – PK bei Testbank AG bestanden 2023 (Zertifikat Z-7 in Sheet 2), IK bei Musterbank offen 2026 (Passerelle möglich)
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', ...runValues('we', { 1: [{ passed: 'yes', date: d(2023, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2023, 6, 1), score: 5, result: 0.85 }] }) }),
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', employer: 'Musterbank', profil: 'IK', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 2, 1), score: 50, result: 0.75 }] }), ...leerOe }),
    // Namensgleiche mit unterschiedlichem Geburtsdatum (Entscheid 3: Geburtsjahr nur bei Namensgleichen)
    base({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: '01.01.1980', ...runValues('we', { 1: [{ passed: 'yes', date: d(2024, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2024, 6, 1), score: 5, result: 0.9 }] }) }),
    base({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: '05.05.1991', employer: 'Musterbank', profil: 'KMU', sprache: 'FR', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 4, 1), score: 50, result: 0.7 }], 2: [{ passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }] }), ...leerOe }),
    // ohne Geburtsdatum (Schlüssel nur aus dem Namen), mündlich nicht bestanden
    base({ lastName: 'Datumlos', firstName: 'Otto', birthDate: '', oeAllPassed: 'no', ...runValues('we', { 1: [{ passed: 'yes', date: d(2025, 5, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'no', date: d(2025, 8, 1), score: 2, result: 0.5 }] }) }),
```

und im Block `add('issued', [...])`:

```js
    // Zertifikat zu Wechsel Willi PK (Duplikat der Sheet-1-Zeile, E1) mit Zertifikatsende (certEnd, Paket C)
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', certStart: '01.07.2023', certNumber: 'Z-7', certEnd: '30.06.2028', ...runValues('we', { 1: [{ passed: 'yes', date: d(2023, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2023, 6, 1), score: 5, result: 0.85 }] }) }),
```

Der Kommentar-Kopf von `synth.mjs` erhält den Zusatz «Bankwechsel, Namensgleiche, ohne Geburtsdatum (Paket C)». Erwartete Wirkung (im Bericht nennen): kennzahlrelevante Vorgänge 8 → 13, Duplikate 1 → 2, Personen mit mehreren Profilen 1 → 2, Passerelle möglich +1, Schlüssel ohne Geburtsdatum 0 → 1.

- [ ] **Schritt 7: Smoke-Test-Zahlen nachziehen, neue Baseline**

In `tests/smoke/run.mjs`: `snapshot.kennzahlen.vorgaenge.value === 8` → `=== 13` (Text «Vorgänge» bleibt aus dem Wert); `vorgRow[1] === '8' && vorgRow[2] === '8'` → `'13'` (und im Meldungstext «= 13»); `names`-Liste um `'Wechsel', 'Willi', 'Zwilling', 'Gabi', 'Datumlos', 'Otto'` ergänzen. Dann:

```bash
node tools/snapshot-synth.js tests/smoke/output/snapshot-baseline-c.json
node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json
```

Der zweite Befehl **muss** abweichen (nur Zähler und Quoten der neuen Personen); die Liste der Abweichungen in den Schrittbericht übernehmen (keine Namen darin). Ab jetzt gilt `snapshot-baseline-c.json` als Baseline für C.2–C.6.

- [ ] **Schritt 8: Alles grün, Commit, Push, Draft-PR**

`node --check metrics.js store.js views/tables.js`, `node tests/run-node.js`, Smoke (drei Viewports), `node tools/contrast.js`, `node tools/glossar-readme.js --write` (keine Änderung). Commit «Personen: Suchindex, Pfad, Zeitachse und Raster als reine Funktionen; certEnd im Modell; synthetische Personen (Bankwechsel, Namensgleiche, ohne Geburtsdatum)». Push, `gh pr create --draft --title "Paket C – Personen-Layer (Suche und Pfad)" --body-file <PR-Text>` (Vorlage 0.8; Schritte C.1–C.6 als Checkliste, DoD-Liste). ⛔ Schrittbericht C.1, Freigabe abwarten.

---

### Task 2 (Schritt C.2): Tabellenmodelle, URL-Zustand, Store

**Dateien:** `views/tables.js`, `urlState.js`, `store.js`, `views/common.js` (nur `cell()`), `tests/tables.test.js`, `tests/urlState.test.js`, `tests/store-state.test.js`

**Schnittstellen (Produziert):**

```js
// views/tables.js
export function personResultsTable(entries)     // Trefferliste: Name(1) · Jahrgang(1, nur bei Namensgleichen) · Bank(1) · Profile(1) · Status(2) · Letzte Prüfung(2) · Zertifikate(2) · Vorgänge(3) · Schlüssel(3); row.key = personKey
export function personGridTable(vorgang)        // Raster: Teilprüfung(1) · RUN1(1) · RUN2(1) · RUN3(2); Zelle «12.03.2026 · 82.0 % · bestanden» | «geplant · 29.09.2026» | «–»; Spalten RUN1–3 mit status: true
export function personTimelineTable(vorgang)    // Zeitachse: Datum(1) · Ereignis(1) · Ort(3) · Resultat(2) · Ergebnis(1)
export function personDqTable(dq, vorgaenge)    // Datenqualität der Zeilen dieser Vorgänge (inkl. zusammengeführter Zeilen): Wirkung(2) · Stufe(1) · Sheet(3) · Zeile(2) · Header(1) · Rohwert(3) · Grund(1)
// urlState.js: DEFAULT_UI.personen = null (nie serialisiert)
// store.js: setData() und clear() setzen ui.personen = null
// views/common.js cell(): Spaltenoption status → Badge auf dem letzten «·»-Segment; STATUS_COLUMN_LABELS + 'Ergebnis'
```

- [ ] **Schritt 1: Tests Tabellenmodelle (RED)** – am Ende von `tests/tables.test.js` (Import um `personResultsTable, personGridTable, personTimelineTable, personDqTable` und aus `../metrics.js` um `personSearchIndex` ergänzen):

```js
function personenEntries() {
  const persons = [
    simple({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: d('1980-01-01'), profil: 'PK', employerCanon: 'Testbank AG', issued: true, certNumber: 'Z-3' }),
    makePerson({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: d('1991-05-05'), profil: 'KMU', employerCanon: 'Musterbank', we: { 1: [{ passed: true, date: '2026-04-01', result: 0.7 }] } }),
    makePerson({ lastName: 'Datumlos', firstName: 'Otto', profil: 'PK', employerCanon: 'Testbank AG', weAllPassed: true, oeAllPassed: false, we: { 1: [{ passed: true, date: '2025-05-01', result: 0.8 }] }, oe: { 1: [{ passed: false, date: '2025-08-01', result: 0.5 }] } }),
  ];
  return personSearchIndex(persons);
}

test('tables.personResultsTable: Trefferliste mit Prioritäten; Jahrgang nur bei Namensgleichen und nur in deren Zeilen (Entscheid 3)', () => {
  const t = personResultsTable(personenEntries());
  assertEqual(t.columns.map((c) => [c.label, c.prio]), [['Name', 1], ['Jahrgang', 1], ['Bank', 1], ['Profile', 1], ['Status', 2], ['Letzte Prüfung', 2], ['Zertifikate', 2], ['Vorgänge', 3], ['Schlüssel', 3]]);
  assertEqual(t.rows.map((r) => [r.name, r.jahrgang, r.bank, r.profile, r.status, r.letzte, r.zertifikate, r.vorgaenge, r.schluessel]), [
    ['Datumlos Otto', '', 'Testbank AG', 'PK', 'nicht bestanden', '01.08.2025', 0, 1, 'ohne Geburtsdatum'],
    ['Zwilling Gabi', '1980', 'Testbank AG', 'PK', 'bestanden', '01.06.2024', 1, 1, 'Name + Geburtsdatum'],
    ['Zwilling Gabi', '1991', 'Musterbank', 'KMU', 'offen', '01.04.2026', 0, 1, 'Name + Geburtsdatum'],
  ]);
  assert(t.rows.every((r) => typeof r.key === 'string' && r.key.length > 0), 'Personenschlüssel je Zeile (nur DOM, nie URL)');
  const single = personResultsTable(personenEntries().slice(2));
  assert(!single.columns.some((c) => c.key === 'jahrgang'), 'ohne Namensgleiche keine Spalte Jahrgang');
  assert(t.note.includes('nur intern'));
  assertEqual(personResultsTable([]).rows, []);
});

test('tables.personGridTable: Teilprüfungen × RUN1–RUN3 mit Datum, Resultat und Ergebnis; Runs ausserhalb der Vorgabe markiert', () => {
  const p = makePerson({ profil: 'PK', we: { 1: [{ passed: false, date: '2026-01-10', result: 0.4 }, { date: '2026-10-01', planned: true }], 2: [{ passed: true, date: '2026-02-01', result: 0.6 }] }, oe: {} });
  const t = personGridTable(p);
  assertEqual(t.columns.map((c) => [c.label, c.prio, !!c.status]), [['Teilprüfung', 1, false], ['RUN1', 1, true], ['RUN2', 1, true], ['RUN3', 2, true]]);
  assertEqual(t.rows.map((r) => [r.teil, r.run1, r.run2, r.run3]), [
    ['WE1', '10.01.2026 · 40.0 % · nicht bestanden', 'geplant · 01.10.2026', '–'],
    ['OE1', '–', '–', '–'],
    ['WE2 (ausserhalb der Vorgabe)', '01.02.2026 · 60.0 % · bestanden', '–', '–'],
  ]);
  assert(t.note.includes('WE2'), 'Hinweis auf Teile ausserhalb der Vorgabe');
});

test('tables.personTimelineTable: chronologische Ereignisse mit Ergebnis-Spalte (Badge)', () => {
  const p = makePerson({ profil: 'PK', certStart: d('2024-07-01'), certNumber: 'Z-1', weAllPassed: true, oeAllPassed: true,
    we: { 1: [{ passed: true, date: '2024-03-01', result: 0.7, location: 'Bern' }] }, oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] } });
  const t = personTimelineTable(p);
  assertEqual(t.columns.map((c) => c.label), ['Datum', 'Ereignis', 'Ort', 'Resultat', 'Ergebnis']);
  assertEqual(t.rows.map((r) => [r.datum, r.ereignis, r.ort, r.resultat, r.ergebnis]), [
    ['01.03.2024', 'WE1 RUN1', 'Bern', '70.0 %', 'bestanden'],
    ['01.06.2024', 'OE1 RUN1', '', '90.0 %', 'bestanden'],
    ['01.07.2024', 'Zertifikatsbeginn Z-1', '', '–', 'Zertifikat'],
  ]);
  assertEqual(personTimelineTable(makePerson({})).rows, []);
});

test('tables.personDqTable: nur Einträge der Zeilen dieser Vorgänge, inklusive zusammengeführter Zeilen', () => {
  const p = makePerson({ sheetName: 'First Certification', row: 12, duplicates: [{ sheet: 'Ausgestellte Zertifikate', row: 30 }] });
  const dq = [
    { level: 'hinweis', impact: 'keine', sheet: 'First Certification', row: 12, header: 'WE1 RUN1 Result', raw: 85, reason: 'als Prozentwert umgedeutet' },
    { level: 'hinweis', impact: 'kennzahl', sheet: 'Ausgestellte Zertifikate', row: 30, header: 'Last Name', raw: null, reason: 'Duplikat' },
    { level: 'fehler', impact: 'kennzahl', sheet: 'First Certification', row: 13, header: 'WE1 RUN1 Passed', raw: '?', reason: 'andere Zeile' },
  ];
  const t = personDqTable(dq, [p]);
  assertEqual(t.columns.map((c) => [c.label, c.prio]), [['Wirkung', 2], ['Stufe', 1], ['Sheet', 3], ['Zeile', 2], ['Header', 1], ['Rohwert', 3], ['Grund', 1]]);
  assertEqual(t.rows.map((r) => [r.wirkung, r.stufe, r.sheet, r.row, r.header, r.raw, r.grund]), [
    ['ohne Kennzahlwirkung', 'Hinweis', 'First Certification', 12, 'WE1 RUN1 Result', '85', 'als Prozentwert umgedeutet'],
    ['verändert Kennzahl', 'Hinweis', 'Ausgestellte Zertifikate', 30, 'Last Name', '', 'Duplikat'],
  ]);
  assertEqual(personDqTable(dq, []).rows, []);
});
```

Run: `node tests/run-node.js` → erwartet FAIL (`personResultsTable is not a function`).

- [ ] **Schritt 2: Tabellenmodelle umsetzen (GREEN)** – in `views/tables.js` (Import aus `../metrics.js` um `personPath, runTimeline, examGrid` ergänzen; `IMPACT_LABELS` nicht importieren – `store.js` importiert `tables.js` nicht, aber `tables.js` bleibt frei von `store.js`; die Wirkungstexte stehen lokal):

```js
// ---------------------------------------------------------------------------
// Personen (PROMPT-2 Paket C)
// ---------------------------------------------------------------------------

const DQ_IMPACT_TEXT = { unsichtbar: 'macht Zeile unsichtbar', kennzahl: 'verändert Kennzahl', keine: 'ohne Kennzahlwirkung' };
const DQ_LEVEL_TEXT = { fehler: 'Fehler', hinweis: 'Hinweis', 'nicht-ausgewertet': 'Nicht ausgewertet' };

// Trefferliste (C.2): eine Zeile je Person; Jahrgang nur, wenn Namensgleiche in der Liste stehen, und nur in deren Zeilen (Entscheid 3)
export function personResultsTable(entries) {
  const byName = new Map();
  for (const e of entries) byName.set(e.nameKey, (byName.get(e.nameKey) || 0) + 1);
  const twins = [...byName.values()].some((n) => n > 1);
  const columns = [col('name', 'Name', 1)];
  if (twins) columns.push(col('jahrgang', 'Jahrgang', 1));
  columns.push(col('bank', 'Bank', 1), col('profile', 'Profile', 1), col('status', 'Status', 2), col('letzte', 'Letzte Prüfung', 2), col('zertifikate', 'Zertifikate', 2), col('vorgaenge', 'Vorgänge', 3), col('schluessel', 'Schlüssel', 3));
  return {
    title: 'Trefferliste',
    columns,
    rows: entries.map((e) => ({
      key: e.key, name: e.name, jahrgang: twins && byName.get(e.nameKey) > 1 && e.birthDate ? String(e.birthDate.getFullYear()) : '', bank: e.bank || '', profile: e.profiles.join(' → '),
      status: e.passiv ? 'passiv' : e.status, letzte: fmtDate(e.lastExam), zertifikate: e.certCount, vorgaenge: e.vorgaenge.length,
      schluessel: e.keyLevel === 'full' ? 'Name + Geburtsdatum' : 'ohne Geburtsdatum',
    })),
    empty: 'Keine Person gefunden.',
    note: 'Eine Zeile je Person (Personenschlüssel); Profile in zeitlicher Abfolge; Status und letzte Prüfung des jüngsten Vorgangs. «ohne Geburtsdatum»: Namensgleiche fallen zusammen. Enthält Namen – nur intern (E7).',
  };
}

function gridCell(r) {
  if (r.planned) return 'geplant · ' + fmtDate(r.date);
  if (!r.taken) return '–';
  return [fmtDate(r.date) || 'ohne Datum', formatPct(r.result), r.ergebnis].join(' · ');
}

// Prüfungsraster (C.3): Teilprüfungen × RUN1–RUN3; Spalten RUN1–RUN3 tragen status: true (Badge auf dem Ergebnis, views/common.js)
export function personGridTable(vorgang) {
  const g = examGrid(vorgang);
  return {
    title: 'Prüfungsraster',
    columns: [col('teil', 'Teilprüfung', 1), col('run1', 'RUN1', 1, { status: true }), col('run2', 'RUN2', 1, { status: true }), col('run3', 'RUN3', 2, { status: true })],
    rows: g.rows.map((r) => ({ teil: r.label + (r.inSpec ? '' : ' (ausserhalb der Vorgabe)'), run1: gridCell(r.runs[0]), run2: gridCell(r.runs[1]), run3: gridCell(r.runs[2]) })),
    note: (g.spec ? 'Teile gemäss Vorgabe für das Profil (config.js, PROFILE_PARTS)' : 'Kein Profil mit Vorgabe – genutzte Teile') + (g.outside.length ? '; absolvierte Runs ausserhalb der Vorgabe: ' + g.outside.join(', ') + ' (Hinweis im Data-Quality-Log)' : '') + '.',
  };
}

// Zeitachse (C.3): alle datierten Runs und der Zertifikatsbeginn, chronologisch
export function personTimelineTable(vorgang) {
  return {
    title: 'Zeitachse',
    columns: [col('datum', 'Datum', 1), col('ereignis', 'Ereignis', 1), col('ort', 'Ort', 3), col('resultat', 'Resultat', 2), col('ergebnis', 'Ergebnis', 1)],
    rows: runTimeline(vorgang).map((e) => ({ datum: fmtDate(e.date) || 'ohne Datum', ereignis: e.label, ort: e.location || '', resultat: formatPct(e.result), ergebnis: e.ergebnis })),
    empty: 'Keine absolvierten oder geplanten Prüfungen.',
    note: 'Absolvierte und geplante Runs sowie der Zertifikatsbeginn; entspricht dem Blatt «Runs» des Exports.',
  };
}

// Datenqualität der Person (C.3): Einträge zu den Zeilen ihrer Vorgänge, reduziert wie in der Ansicht «Datenqualität»
export function personDqTable(dq, vorgaenge) {
  const keys = new Set();
  for (const v of vorgaenge) {
    keys.add(v.sheetName + '|' + v.row);
    for (const dup of v.duplicates || []) keys.add(dup.sheet + '|' + dup.row);
  }
  const rows = dq.filter((e) => keys.has(e.sheet + '|' + e.row));
  return {
    title: 'Datenqualität',
    columns: [col('wirkung', 'Wirkung', 2), col('stufe', 'Stufe', 1), col('sheet', 'Sheet', 3), col('row', 'Zeile', 2), col('header', 'Header', 1), col('raw', 'Rohwert', 3), col('grund', 'Grund', 1)],
    rows: rows.map((e) => ({ wirkung: DQ_IMPACT_TEXT[e.impact] || 'verändert Kennzahl', stufe: DQ_LEVEL_TEXT[e.level] || 'Fehler', sheet: e.sheet, row: e.row, header: e.header, raw: e.raw === null || e.raw === undefined ? '' : String(e.raw), grund: e.reason })),
    empty: 'Keine Einträge im Data-Quality-Log zu dieser Person.',
  };
}
```

`STATUS_COLUMN_LABELS` um `'Ergebnis'` ergänzen (Zeitachse); `statusTone()` kennt bereits «bestanden», «nicht bestanden», «geplant», «offen», «passiv» – für «Zertifikat» und «ohne Ergebnis» soll `statusTone` `null` liefern (kein Badge; prüfen, dass `t.startsWith('zertifikat')` in keinen Zweig fällt – trifft zu). Run: `node tests/run-node.js` → grün.

- [ ] **Schritt 3: Tests URL-Zustand und Store (RED)** – in `tests/urlState.test.js` anhängen:

```js
test('urlState: DEFAULT_UI.personen = null; Suchtext und Personenschlüssel werden nie serialisiert (Paket C, C.4)', () => {
  assertEqual(DEFAULT_UI.personen, null);
  const ui = { ...DEFAULT_UI, personen: { query: 'Muster', selectedKey: 'muster|anna|1985-03-15' } };
  assertEqual(serializeState(DEFAULT_FILTER, ui), '');
  const hash = buildHash('personen', { ...DEFAULT_FILTER, bank: ['Testbank AG'] }, ui);
  assert(!/muster|anna|1985|query|selected/i.test(hash), hash);
  assertEqual(parseHash('#personen?bank=Testbank+AG').ui.personen, null);
});
```

in `tests/store-state.test.js` anhängen:

```js
test('createStore: ui.personen (Suchtext, gewählte Person) nur im Memory; setData() und clear() leeren ihn (C.4)', () => {
  const store = createStore();
  assertEqual(store.getState().ui.personen, null);
  store.setUi({ personen: { query: 'Mu', selectedKey: 'muster|test|' } }, { silent: true });
  assertEqual(store.getState().ui.personen.query, 'Mu');
  store.setData(loadResult());
  assertEqual(store.getState().ui.personen, null, 'Datenwechsel leert die Personensuche');
  store.setUi({ personen: { query: 'Mu', selectedKey: null } }, { silent: true });
  store.clear();
  assertEqual(store.getState().ui.personen, null);
});
```

Run: `node tests/run-node.js` → erwartet FAIL (`DEFAULT_UI.personen` undefined).

- [ ] **Schritt 4: URL-Zustand und Store umsetzen (GREEN)**

`urlState.js`: `DEFAULT_UI = Object.freeze({ benchmark: 'bank', dq: null, compare: null, snapshots: [], snapshotErrors: [], personen: null })` mit Kommentar «personen: Suchtext und gewählte Person der Ansicht «Personen» – nur im Memory, nie in der URL (C.4)». `store.js` `setData()`: nach `state.meta = meta;` die Zeile `state.ui = { ...state.ui, personen: null };` (Datenwechsel, C.4); `clear()`: dieselbe Zeile vor `notify()`. Run: `node tests/run-node.js` → grün.

- [ ] **Schritt 5: `cell()` mit Spaltenoption `status` (Badge auf dem Ergebnis-Segment)** – in `views/common.js` `cell()` vor dem `STATUS_COLUMN_LABELS`-Zweig:

```js
  // Raster-Zellen (Paket C): «12.03.2026 · 82.0 % · bestanden» → Text plus Badge auf dem letzten Segment; «geplant · 29.09.2026» → Badge vorn
  if (c.status && text && text !== '–') {
    const parts = text.split(' · ');
    const statusIndex = parts[0] === 'geplant' ? 0 : parts.length - 1;
    const tone = statusTone(parts[statusIndex]);
    if (tone) {
      const rest = parts.filter((_, i) => i !== statusIndex).join(' · ');
      return el('td', { ...attrs, class: (cls.concat(['status-cell']).join(' ')) }, [el('span', { class: 'badge status-' + tone, text: parts[statusIndex] }), rest ? ' ' + rest : '']);
    }
  }
```

Kein Unit-Test (DOM); der Smoke-Test in Task 3 prüft `#view .person-grid .badge`. `styles.css` nach `.badge.status-geplant`: `td.status-cell { white-space: nowrap; }`.

- [ ] **Schritt 6: Alles grün, Commit, Push**

`node tests/run-node.js`, Smoke (drei Viewports), `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline-c.json` → identisch, `node tools/contrast.js`, glossar-readme unverändert. Commit «Personen: Tabellenmodelle für Trefferliste, Raster, Zeitachse und Datenqualität; Suchzustand nur im Memory». Push, PR-Text (C.2 abhaken). ⛔ Schrittbericht C.2.

---

### Task 3 (Schritt C.3): Ansicht «Personen» – Suche, Trefferliste, Detail, Export

**Dateien:** `views/personen.js` (neu), `app.js`, `views/common.js`, `glossary.js`, `README.md` (nur Glossar-Abschnitt via Tool), `styles.css`, `tests/views-meta.test.js`, `tests/glossary.test.js` (keine Änderung nötig), `tests/smoke/run.mjs`

**Schnittstellen:**

- Konsumiert: `personSearchIndex`, `searchPersons`, `personPath`, `openCaseState`, `earlyWarnings`, `durationDays`, `certificateDays`, `exclusionReason`, `isVorgang` (metrics), `personResultsTable`, `personGridTable`, `personTimelineTable`, `personDqTable`, `vorgangExportTables`, `groupLabel` (tables), `el`, `renderTable`, `renderExpandableTable`, `renderExportMenu`, `section`, `hinted` (common).
- Produziert: `views/personen.js` exportiert `id = 'personen'`, `label = 'Personen'`, `group = 'Personen'`, `intro`, `glossar = 'Pfad einer Person'`, `noPersonExport = true`, `SEARCH_DEBOUNCE_MS = 150`, `RESULT_LIMIT = 50`, `build(ctx)`; `ctx` neu: `allVorgaenge`, `personVorgaenge`, `dq`, `personen`, `onPersonenChange(next)`. `renderExpandableTable(table, { detail, hint, isOpen, onToggle })`; `renderExportMenu({ viewId, tables, headerLines, extra, label = 'Export', note = 'Aggregate dieser Ansicht, Filterzustand im Kopf' })`.

- [ ] **Schritt 1: Metadaten-Test und Glossar (RED → GREEN)** – `tests/views-meta.test.js`: `import * as personen from '../views/personen.js';`, `VIEW_MODULES` um `personen` ergänzen, `assertEqual(personen.group, 'Personen');`. Run → FAIL (Modul fehlt). Dann `glossary.js` nach dem Eintrag «Passerelle» (Anhang A3):

```js
  {
    kind: 'Begriff', term: 'Pfad einer Person',
    definition: 'Zeitliche Abfolge aller Vorgänge (Profile) einer Person nach erstem Prüfungsdatum, mit Status je Vorgang, Zertifikat und Passerelle-Kennzeichen.',
    nenner: '–', grenzfaelle: 'Ansicht «Personen». Namen sichtbar (E7). Suchtext und gewählte Person stehen nie in der URL.',
  },
  {
    kind: 'Begriff', term: 'Prüfungsraster',
    definition: 'Tabelle Teilprüfungen × Versuche (RUN1–RUN3) eines Vorgangs mit Datum, Resultat und Ergebnis je Run; Runs ausserhalb der Profilvorgabe sind markiert.',
    nenner: '–', grenzfaelle: 'Grundlage: Vorgabe je Profil (config.js, PROFILE_PARTS). Ohne Vorgabe (unbekanntes Profil) erscheinen die genutzten Teile.',
  },
  {
    kind: 'Begriff', term: 'Zeitachse (Person)',
    definition: 'Alle datierten Runs eines Vorgangs chronologisch, absolviert und geplant, plus Zertifikatsbeginn.',
    nenner: '–', grenzfaelle: 'Entspricht dem Blatt «Runs» des Exports (gleiche Anzahl datierter Runs).',
  },
```

`node tools/glossar-readme.js --write` (README-Abschnitt wächst um drei Zeilen). Die View selbst entsteht in Schritt 3.

- [ ] **Schritt 2: Helfer in `views/common.js`** – `renderExpandableTable(table, { detail, hint = null, isOpen = null, onToggle = null } = {})`: nach dem Anlegen von `detailRow`: `if (isOpen && isOpen(row)) { detailRow.hidden = false; tr.setAttribute('aria-expanded', 'true'); }`; in `toggle()` nach dem Umschalten: `if (onToggle) onToggle(row, open);`. `renderExportMenu({ viewId, tables, headerLines, extra = null, label = 'Export', note = 'Aggregate dieser Ansicht, Filterzustand im Kopf' })`: `menu-note` mit `note`, `summary` mit `label`. Bestehende Aufrufer unverändert.

- [ ] **Schritt 3: `views/personen.js` anlegen**

```js
// views/personen.js – Ansicht «Personen» (PROMPT-2 Paket C): Suche, Trefferliste, Detail je Person (Kopf, Pfad, Karten je Vorgang mit
// Stammdaten, Status, Prüfungsraster, Zeitachse, Datenqualität, Export). Namen erscheinen hier (E7). Suchtext und gewählte Person
// liegen nur im Memory (store.ui.personen), nie in der URL. Zeitraum, Versuche und Wertung wirken nicht (Entscheid 06.09.2026).

import { CONFIG } from '../config.js';
import { personSearchIndex, searchPersons, personPath, openCaseState, earlyWarnings, durationDays, certificateDays, exclusionReason, PASSIVE_DAYS } from '../metrics.js';
import { personResultsTable, personGridTable, personTimelineTable, personDqTable, vorgangExportTables, groupLabel, statusTone } from './tables.js';
import { el, renderTable, renderExpandableTable, renderExportMenu, section, hinted } from './common.js';
import { fmtDate } from '../export.js';

export const id = 'personen';
export const label = 'Personen';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Eine Person suchen und ihren Weg durch die Zertifizierung nachvollziehen: Vorgänge, Prüfungen, Status, Zertifikat, Datenqualität; mit Namen.';
export const glossar = 'Pfad einer Person';
export const noPersonExport = true; // eigener Export «Diese Person» je Detail (Entscheid 4)
export const SEARCH_DEBOUNCE_MS = 150;
export const RESULT_LIMIT = 50;

function badge(text) {
  const tone = statusTone(text);
  return tone ? el('span', { class: 'badge status-' + tone, text }) : el('span', { text });
}

function dl(pairs) {
  return el('dl', { class: 'person-dl' }, pairs.flatMap(([k, v]) => (v === null || v === undefined || v === '' ? [] : [el('dt', { text: k }), el('dd', {}, [typeof v === 'string' ? v : v])])));
}

function stepText(s) {
  const parts = [s.profil, s.jahr ? String(s.jahr) : null, s.passiv ? 'passiv' : s.status, s.issued ? 'Zertifikat' + (s.certNumber ? ' ' + s.certNumber : '') : null];
  if (s.status === 'offen' && s.missing && s.missing.length) parts.push(s.missing.length + (s.missing.length === 1 ? ' Teil fehlt' : ' Teile fehlen'));
  if (s.passerelle) parts.push('Passerelle möglich (' + s.passerelle + ')');
  return parts.filter(Boolean).join(' · ');
}

function vorgangCard(v, ctx, open) {
  const today = ctx.today || new Date();
  const oc = openCaseState(v, today);
  const warn = earlyWarnings([v]);
  const dur = durationDays(v);
  const cert = certificateDays(v);
  const reason = exclusionReason(v);
  const stamm = dl([
    ['Profil', groupLabel(v.profil)], ['Sprache', groupLabel(v.sprache) + (v.spracheDerived ? ' (abgeleitet)' : '')],
    ['Bank', (v.employerCanon || '–') + (v.employer && v.employer !== v.employerCanon ? ' (Rohwert: ' + v.employer + ')' : '')], ['Role', v.role || ''],
    ['Fundstelle', v.sheetName + ', Zeile ' + v.row], ['Zusammengeführte Zeilen', (v.duplicates || []).map((d) => d.sheet + ' Zeile ' + d.row).join('; ')],
    ['VSS / VSM', [v.vss ? 'VSS' : null, v.vsm ? 'VSM' : null].filter(Boolean).join(', ') || 'ohne'],
    ['Zertifikat', v.issued ? ['ausgestellt', v.certNumber, v.certStart ? 'Beginn ' + fmtDate(v.certStart) : null, v.certEnd ? 'Ende ' + fmtDate(v.certEnd) : null].filter(Boolean).join(' · ') : 'nicht ausgestellt'],
    ['Kennzahlrelevant', reason ? 'nein – ' + reason : 'ja'],
  ]);
  const status = el('div', { class: 'person-status' }, [
    'schriftlich ', badge(v.weStatus), ' mündlich ', badge(v.oeStatus), ' gesamt ', badge(v.passiv ? 'passiv' : v.status),
  ]);
  const facts = dl([
    ['Referenzdatum', v.refDate ? fmtDate(v.refDate) + (v.refDateSource === 'oe' ? ' (bestandene mündliche Prüfung)' : ' (letzte Prüfung)') : '–'],
    ['Durchlaufzeit', dur === null ? null : dur + ' Tage'], ['Tage bis Zertifikat', cert === null ? null : cert + ' Tage'],
    ['Passiv', v.passiv ? 'ja – seit ' + oc.daysSinceLastExam + ' Tagen keine Prüfung (> ' + PASSIVE_DAYS + '), kein Termin' : null],
    ['Frühwarnung', warn.length ? warn.map((w) => w.label + ': ' + w.stage).join('; ') : null], ['Versuche gesamt', String(v.attemptsTotal)],
    ['Nächster Termin', oc.nextPlanned ? fmtDate(oc.nextPlanned) : null],
  ]);
  const grid = el('div', { class: 'person-grid' }, [renderTable(personGridTable(v))]);
  if (CONFIG.features && CONFIG.features.write) {
    // Phase 2 (C.8): Bearbeiten je Run-Zelle – nur mit Feature-Flag, Umsetzung in Paket E
    for (const td of grid.querySelectorAll('td.status-cell')) td.appendChild(el('button', { type: 'button', class: 'run-edit', disabled: true, title: 'Schreibpfad (Paket E)', text: 'Bearbeiten' }));
  }
  const dq = personDqTable(ctx.dq || [], [v]);
  const nodes = [
    section('Stammdaten', [stamm]), section('Status', [status, facts]),
    section('Prüfungsraster', [grid], { phoneCollapsed: true }), section('Zeitachse', [renderTable(personTimelineTable(v))]),
  ];
  if (dq.rows.length) nodes.push(section('Datenqualität (' + dq.rows.length + ')', [renderTable(dq)], { phoneCollapsed: true }));
  const summary = el('summary', {}, [groupLabel(v.profil) + ' · ' + v.sheetName + ', Zeile ' + v.row + ' · ', badge(v.passiv ? 'passiv' : v.status)]);
  return el('details', { class: 'vorgang-card', open: open || null }, [summary].concat(nodes));
}

function renderDetail(entry, ctx) {
  const latest = entry.latest;
  const head = el('div', { class: 'person-head' }, [
    el('h4', { text: entry.name }),
    el('span', { class: 'meta-list', text: (entry.bank || 'ohne Bank') + (entry.formerBanks.length ? ' (früher: ' + entry.formerBanks.join(', ') + ')' : '') + ' · ' + entry.vorgaenge.length + (entry.vorgaenge.length === 1 ? ' Vorgang' : ' Vorgänge') + ' · ' }),
    badge(entry.passiv ? 'passiv' : entry.status),
    el('span', { class: 'meta-list', text: ' · Schlüssel: ' + (entry.keyLevel === 'full' ? 'Name + Geburtsdatum' : 'ohne Geburtsdatum (Namensgleiche fallen zusammen)') + (latest.role ? ' · ' + latest.role : '') }),
  ]);
  const path = el('ol', { class: 'person-path', 'aria-label': 'Pfad' }, personPath(entry).map((s) => el('li', { class: 'status-' + (statusTone(s.passiv ? 'passiv' : s.status) || 'offen'), text: stepText(s) })));
  const cards = entry.vorgaenge.map((v) => vorgangCard(v, ctx, v === latest));
  const exportMenu = renderExportMenu({ viewId: 'personen-vorgang', tables: vorgangExportTables(entry.vorgaenge), headerLines: ctx.headerLines || [], label: 'Diese Person exportieren', note: 'Vorgänge und Runs dieser Person, mit Namen, nur intern; Dateiname ohne Namen' });
  const back = el('button', { type: 'button', class: 'secondary person-back', text: 'Zur Liste', onclick: (ev) => { const row = ev.target.closest('tr.event-detail'); const tr = row && row.previousElementSibling; if (tr) { tr.click(); tr.scrollIntoView({ block: 'center' }); tr.focus(); } } });
  return el('div', { class: 'person-detail' }, [head, path].concat(cards, [el('div', { class: 'view-actions person-actions' }, [exportMenu, back])]));
}

export function build(ctx) {
  const state = { query: '', selectedKey: null, ...(ctx.personen || {}) };
  const filter = ctx.filter || {};
  const fullIndex = personSearchIndex(ctx.allVorgaenge || []);
  const inFilter = new Set(personSearchIndex(ctx.personVorgaenge || []).map((e) => e.key));
  const index = fullIndex.filter((e) => inFilter.has(e.key)); // Trefferliste nach globalem Filter, Detail mit allen Vorgängen (Entscheid 2)
  const byKey = new Map(index.map((e) => [e.key, e]));
  const hints = [
    'Suche ab 2 Zeichen in Nachname, Vorname, Bank, Profil, Sprache, Zertifikatsnummer und Status (bestanden, offen, passiv, nicht bestanden); mehrere Begriffe müssen alle zutreffen. Ohne Suchtext bleibt die Liste leer, ausser in der Filterleiste ist eine Bank gewählt: dann erscheinen alle Personen dieser Bank. Höchstens ' + RESULT_LIMIT + ' Treffer.',
    'Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» schränken die Trefferliste ein; Zeitraum, Versuche und Wertung wirken nicht. Das Detail zeigt immer alle Vorgänge der Person. Suchtext und gewählte Person stehen nie in der URL und werden beim Neuladen der Daten geleert.',
  ];
  const sec = hinted(hints);
  const results = el('div', { class: 'person-results' });
  const tables = [];
  let timer = null;
  const commit = () => ctx.onPersonenChange && ctx.onPersonenChange({ query: state.query, selectedKey: state.selectedKey });
  const input = el('input', {
    type: 'search', class: 'person-search', placeholder: 'Name, Bank, Profil, Sprache, Zertifikat-Nr., Status …', 'aria-label': 'Person suchen', autocomplete: 'off', value: state.query,
    oninput: (ev) => { const query = ev.target.value; clearTimeout(timer); timer = setTimeout(() => { state.query = query; commit(); renderResults(); }, SEARCH_DEBOUNCE_MS); },
  });
  function renderResults() {
    const found = searchPersons(index, state.query, { limit: RESULT_LIMIT, all: (filter.bank || []).length > 0 });
    const table = personResultsTable(found.persons);
    tables.splice(0, tables.length, table);
    const nodes = [];
    if (found.tooShort) nodes.push(el('p', { class: 'empty', text: 'Mindestens 2 Zeichen eingeben.' }));
    else if (!found.persons.length && !state.query.trim()) nodes.push(el('p', { class: 'empty', text: 'Suchtext eingeben – oder in der Filterleiste eine Bank wählen, dann erscheinen alle Personen dieser Bank.' }));
    else {
      nodes.push(el('p', { class: 'meta-list person-count', text: found.truncated ? 'Suche eingrenzen (' + found.total + ' Treffer, die ersten ' + RESULT_LIMIT + ' angezeigt)' : found.total + (found.total === 1 ? ' Person' : ' Personen') }));
      nodes.push(renderExpandableTable(table, {
        detail: (row) => renderDetail(byKey.get(row.key), ctx), hint: 'Zeile anklicken (oder Enter): Detail der Person.',
        isOpen: (row) => row.key === state.selectedKey, onToggle: (row, open) => { state.selectedKey = open ? row.key : null; commit(); },
      }));
    }
    results.replaceChildren(...nodes);
  }
  renderResults();
  return {
    nodes: [sec('Suche', [input, el('p', { class: 'person-hint', text: 'Ab 2 Zeichen: Name, Bank, Profil, Sprache, Zertifikat-Nr., Status. Filter: Profil, Sprache, Bank, VSS/VSM, Zertifikate – nicht Zeitraum, Versuche, Wertung.' }), results])],
    tables,
    hints,
  };
}
```

Hinweis: `tables` ist ein Array-Objekt, das `renderResults()` befüllt; `app.js` liest es einmal beim Rendern (Export-Menü der Ansicht = Trefferliste zum Zeitpunkt des Renderns, mit Namen, nur intern – siehe `note` der Tabelle).

- [ ] **Schritt 4: `app.js` einbinden** – `import * as personen from './views/personen.js';`, `KPI_VIEWS = [overview, written, oral, vssVsm, zeitverlauf, bankReport, personen, offen, planned, ranking, historie]`; Import `isVorgang` aus `./metrics.js`; im `ctx` von `renderView()` ergänzen:

```js
    allVorgaenge: state.persons.filter(isVorgang), // Personen (C.4): Detail zeigt immer alle Vorgänge der Person
    personVorgaenge: filterPersons(state.persons, { ...filter, versuche: 'alle' }, { eligibleOnly: false, period: false }), // Trefferliste: Profil, Sprache, Bank, VSS/VSM, Zertifikate
    dq: state.dq,
    personen: state.ui.personen,
    onPersonenChange: (next) => store.setUi({ personen: next }, { silent: true }), // nur Memory; kein Neurendern (Fokus bleibt im Suchfeld)
```

- [ ] **Schritt 5: `styles.css`** – nach `.ranking-grid`:

```css
/* Personen (PROMPT-2 Paket C): Suche, Pfad-Leiste, Karten je Vorgang, Raster-Zellen */
.person-search { width: 100%; max-width: 40rem; font-size: var(--fs-md); padding: .45rem .6rem; }
.person-hint { color: var(--muted); font-size: var(--fs-sm); margin: var(--space-1) 0 var(--space-3); }
.person-count { margin: 0 0 var(--space-2); }
.person-head { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); align-items: center; margin-bottom: var(--space-2); }
.person-head h4 { margin: 0; font-size: var(--fs-lg); }
.person-path { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0; margin: var(--space-2) 0 var(--space-3); }
.person-path li { border: 1px solid var(--border); border-left: 4px solid var(--muted); border-radius: var(--radius); padding: var(--space-1) var(--space-3); background: var(--panel-2); }
.person-path li.status-bestanden { border-left-color: var(--status-bestanden); }
.person-path li.status-nicht { border-left-color: var(--status-nicht); }
.person-path li.status-offen { border-left-color: var(--status-offen); }
.person-path li.status-passiv { border-left-color: var(--status-passiv); }
.person-path li + li::before { content: '→ '; color: var(--muted); }
details.vorgang-card { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3); background: var(--panel); }
details.vorgang-card > summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.person-dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-4); margin: var(--space-2) 0; font-size: var(--fs-sm); }
.person-dl dt { color: var(--muted); }
.person-dl dd { margin: 0; }
.person-status { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin: var(--space-2) 0; }
.person-actions { justify-content: flex-start; margin-top: var(--space-3); }
tr.event-detail > td .person-detail table.data { width: 100%; }
```

`node tools/contrast.js` bleibt grün (keine neuen Farben).

- [ ] **Schritt 6: Smoke-Test Desktop** – in `tests/smoke/run.mjs` nach dem Block «Datenqualität: Suche …», vor «Historie»:

```js
  // Personen (Paket C): Suche mit synthetischem Namen, Detail mit Pfad, Raster (Badges) und Zeitachse; Suchtext nie in der URL
  await page.goto(server.url + '#personen');
  await page.waitForSelector('#view .person-search');
  check((await page.locator('#view .person-results table').count()) === 0 && (await page.locator('#view .person-results p.empty').count()) === 1, 'Personen: ohne Suchtext leere Liste mit Hinweis');
  await page.fill('#view .person-search', 'wechsel');
  await page.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  check((await page.locator('#view .person-results tr.expandable').count()) === 1 && (await page.evaluate(() => document.activeElement.classList.contains('person-search'))), 'Personen: «wechsel» findet eine Person, Fokus bleibt im Suchfeld');
  check(!/wechsel/i.test(page.url()) && !/personen\?/.test(page.url()), 'Personen: Suchtext steht nicht in der URL (' + page.url().replace(server.url, '') + ')');
  await page.locator('#view .person-results tr.expandable').first().click();
  await page.waitForSelector('#view .person-detail');
  const pathSteps = await page.$$eval('#view .person-path li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check(pathSteps.length === 2 && /^PK · 2023 · bestanden · Zertifikat Z-7/.test(pathSteps[0]) && /^IK · 2026 · offen/.test(pathSteps[1]) && /Passerelle möglich \(PK\)/.test(pathSteps[1]), 'Personen: Pfad PK → IK mit Zertifikat und Passerelle (' + pathSteps.join(' | ') + ')');
  check(/früher: Testbank AG/.test(await page.textContent('#view .person-head')), 'Personen: Bankwechsel als «früher: Testbank AG»');
  check((await page.locator('#view details.vorgang-card').count()) === 2 && (await page.locator('#view details.vorgang-card[open]').count()) === 1, 'Personen: zwei Karten je Vorgang, nur der jüngste offen');
  check((await page.locator('#view details.vorgang-card[open] .person-grid td .badge').count()) >= 1 && (await page.locator('#view details.vorgang-card[open] table.data').count()) >= 2, 'Personen: Raster mit Badges und Zeitachse in der offenen Karte');
  check(/Ende 30\.06\.2028/.test(await page.textContent('#view details.vorgang-card:not([open])')), 'Personen: Zertifikatsende (certEnd) in der Karte PK');
  await page.locator('#view .person-results tr.expandable').first().click();
  check((await page.locator('#view .person-detail').count()) === 0 || await page.locator('#view tr.event-detail').first().isHidden(), 'Personen: Detail wieder zugeklappt');
  await page.fill('#view .person-search', 'zwilling');
  await page.waitForFunction(() => document.querySelectorAll('#view .person-results tr.expandable').length === 2, null, { timeout: 5000 });
  check((await page.$$eval('#view .person-results thead th', (th) => th.map((x) => x.textContent))).includes('Jahrgang'), 'Personen: Namensgleiche → Spalte Jahrgang');
  await page.fill('#view .person-search', '');
  await page.locator('#filterbar label:has-text("Bank") select').selectOption({ label: 'Musterbank' });
  await page.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  check((await page.locator('#view .person-results tr.expandable').count()) === 5 && (await page.locator('#view .person-search').inputValue()) === '', 'Personen: ohne Suchtext mit Bank-Filter alle Personen der Bank (5)');
  await page.locator('#filterbar label:has-text("Profil") select').selectOption('IK');
  await page.waitForFunction(() => document.querySelectorAll('#view .person-results tr.expandable').length === 2, null, { timeout: 5000 });
  await page.locator('#view .person-results tr.expandable', { hasText: 'Wechsel' }).click();
  await page.waitForSelector('#view .person-detail');
  check((await page.locator('#view details.vorgang-card').count()) === 2, 'Personen: Profil-Filter IK – Detail zeigt trotzdem beide Vorgänge (PK und IK)');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  await shot(page, 'personen');
```

Erwartung «5»: Musterbank-Personen in der synthetischen Datei sind Plan Petra, Termin Tom, Bank Bea, Wechsel Willi (IK), Zwilling Gabi (1991). Nach Profil IK: Termin Tom und Wechsel Willi.

- [ ] **Schritt 7: Alles grün, Commit, Push**

`node --check views/personen.js app.js views/common.js glossary.js`, `node tests/run-node.js`, Smoke (drei Viewports – der Phone-Durchlauf prüft die neue Ansicht bereits auf Überlauf; Feinschliff in Task 4), Snapshot identisch (Baseline C), contrast, glossar-readme unverändert. Commit «Personen: Ansicht mit Suche, Trefferliste, Pfad, Karten je Vorgang, Raster, Zeitachse, Datenqualität und Export; Glossar». Push, PR-Text (C.3). ⛔ Schrittbericht C.3.

---

### Task 4 (Schritt C.4): Phone-Layout und Smoke-Prüfungen Phone

**Dateien:** `styles.css`, `tests/smoke/run.mjs`

**Schnittstellen:** Konsumiert die Klassen aus Task 3 (`.person-search`, `.person-path`, `.person-dl`, `details.vorgang-card`, `.person-grid`) und `section({ phoneCollapsed: true })` (Raster, Datenqualität sind auf Phone bereits `details.fold`).

- [ ] **Schritt 1: Smoke-Test Phone (RED)** – in `tests/smoke/run.mjs` im Phone-Teil nach den B.4-Prüfungen, vor `await phone.close();`:

```js
  // Phone (C.4): Personen – Suche, Detail ohne Seitenscroll, Pfad vertikal, Raster eingeklappt, Zeitachse mit Prio-1-Spalten, URL ohne Suchtext, Speicher leer
  await phone.goto(server.url + '#personen');
  await phone.waitForSelector('#view .person-search');
  await phone.fill('#view .person-search', 'wechsel');
  await phone.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  await phone.locator('#view .person-results tr.expandable').first().click();
  await phone.waitForSelector('#view .person-detail');
  const phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(phoneOverflow <= 0, 'Phone Personen: Detail ohne Seitenscroll (' + phoneOverflow + ' px)');
  check(await phone.evaluate(() => getComputedStyle(document.querySelector('#view .person-path')).flexDirection === 'column'), 'Phone Personen: Pfad vertikal');
  const openCard = (sel) => phone.evaluate((s) => { const card = document.querySelector('#view details.vorgang-card[open]'); const n = card && [...card.querySelectorAll(s.q)].find((x) => (x.querySelector('h3, summary') || {}).textContent.startsWith(s.t)); if (!n) return null; const table = n.querySelector('table'); return { open: n.tagName === 'DETAILS' ? n.open : true, heads: table ? [...table.querySelectorAll('thead th')].filter((th) => th.getClientRects().length && !th.classList.contains('toggle')).map((th) => th.textContent) : [] }; }, sel);
  const raster = await openCard({ q: 'details.fold', t: 'Prüfungsraster' });
  const zeitachse = await openCard({ q: 'section.block', t: 'Zeitachse' });
  check(!!raster && raster.open === false, 'Phone Personen: Raster in der offenen Karte eingeklappt');
  check(!!zeitachse && JSON.stringify(zeitachse.heads) === JSON.stringify(['Datum', 'Ereignis', 'Ergebnis']), 'Phone Personen: Zeitachse mit Prio-1-Spalten (' + JSON.stringify(zeitachse && zeitachse.heads) + ')');
  check(!/wechsel/i.test(phone.url()), 'Phone Personen: Suchtext steht nicht in der URL');
  const phoneStorage = await phone.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  check(phoneStorage.local.length === 0 && phoneStorage.session.every((k) => /msal|login\.|authority|client\.info/i.test(k)), 'Phone Personen: keine Daten im Browser-Speicher (' + JSON.stringify(phoneStorage) + ')');
  await phone.screenshot({ path: join(outDir, 'phone-personen-detail.png'), fullPage: true });
```

Run Smoke → erwartet FAIL bei «Pfad vertikal» (Desktop-CSS gilt noch).

- [ ] **Schritt 2: Phone-CSS (GREEN)** – in `styles.css` im Block `@media screen and (max-width: 600px)` vor `.kpi-delta-vs`:

```css
  /* C.4: Personen – Pfad vertikal, Stammdaten einspaltig, Karten und Detail randnah */
  .person-path { flex-direction: column; gap: var(--space-1); }
  .person-path li + li::before { content: '↓ '; }
  .person-dl { grid-template-columns: 1fr; gap: 0; }
  .person-dl dt { margin-top: var(--space-1); }
  details.vorgang-card { padding: var(--space-2); }
  tr.event-detail > td { padding-left: var(--space-2); padding-right: var(--space-2); }
  .person-search { max-width: none; }
```

Run Smoke (drei Viewports) → grün; Tablet-Durchlauf prüft die Ansicht auf Überlauf mit Prio 1 + 2 (Jahrgang, Bank, Profile, Status, Letzte Prüfung, Zertifikate).

- [ ] **Schritt 3: Alles grün, Commit, Push**

`node tests/run-node.js`, Smoke, Snapshot identisch (Baseline C), contrast. Commit «Personen: Phone-Layout (Pfad vertikal, Raster eingeklappt), Smoke-Prüfungen Phone». Push, PR-Text (C.4). ⛔ Schrittbericht C.4.

---

### Task 5 (Schritt C.5): Dokumentation (README, PROMPT.md, Entscheid-Log)

**Dateien:** `README.md`, `PROMPT.md`

- [ ] **Schritt 1: README «Ansichten»** – in der Tabelle vor der Zeile «Offene Vorgänge» einfügen:

```
| Personen | Eine Person suchen (Name, Bank, Profil, Sprache, Zertifikat-Nr., Status; ab 2 Zeichen, mehrere Begriffe = UND) und ihren Weg nachvollziehen: Pfad über alle Vorgänge, je Vorgang Stammdaten, Status, Prüfungsraster (Teilprüfungen × RUN1–RUN3), Zeitachse, Datenqualität und Export «Diese Person»; mit Namen (E7). Ohne Suchtext leer, ausser eine Bank ist gefiltert (dann alle Personen der Bank); Geburtsjahr nur bei Namensgleichen |
```

Im Absatz «Mobile» den Satz «Vollständig für das Phone gestaltet sind Übersicht, Offene Vorgänge und Geplante Prüfungen» um «und Personen» ergänzen.

- [ ] **Schritt 2: README «Globale Filter»** – am Ende des Abschnitts (vor «## Modell») den Absatz anfügen:

```
In der Ansicht «Personen» wirken Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» auf die Trefferliste; Zeitraum,
Versuche und Wertung wirken nicht. Das Detail zeigt immer alle Vorgänge der Person. Suchtext und gewählte Person stehen nie in der
URL (nur im Memory) und werden beim Neuladen der Daten geleert.
```

- [ ] **Schritt 3: README Entscheid-Log und Datenschutz** – Überschrift «## Modell: … (Entscheid-Log E1–E10)» → «E1–E11»; nach E10 anfügen:

```
- **E11 (06.09.2026)** Personensuche: ohne Suchtext leere Liste, ausser der Bank-Filter ist gesetzt (alle Personen der Bank); Profil, Sprache, Bank, VSS/VSM und Zertifikate wirken auf die Trefferliste, Zeitraum, Versuche und Wertung nicht, das Detail zeigt alle Vorgänge; Geburtsjahr nur bei Namensgleichen, nie das volle Datum; Export «Diese Person» mit Dateiname ohne Namen, Inhalt «nur intern».
```

Im Absatz «Datenschutz» (Abschnitt Architektur) den Satz «Namen erscheinen nur in Bestenlisten, geplanten Prüfungen und im Data-Quality-Log.» ersetzen durch: «Namen erscheinen nur in den Ansichten Personen, Offene Vorgänge, Geplante Prüfungen und Bestenlisten, im Data-Quality-Log und in Exporten «nur intern» (E5, E7); Suchtext und gewählte Person der Personensuche stehen nie in der URL.» Die Dateiliste unter «Architektur» um `views/personen.js` ergänzen (analog zu den anderen Views).

- [ ] **Schritt 4: `PROMPT.md` Harte Regeln** – die Zeile «Namen erscheinen nur in Bestenlisten und in der Datenqualitäts-View.» ersetzen durch «Namen erscheinen nur in den Ansichten Personen, Offene Vorgänge, Geplante Prüfungen, Bestenlisten und Datenqualität sowie in Exporten «nur intern» (E5, E7); nie in URL, Snapshots, Repo.» `CLAUDE.md` bleibt unverändert (Regel 3 betrifft das Repo).

- [ ] **Schritt 5: Prüfen, Commit, Push** – `node tools/glossar-readme.js --write` ohne Änderung, `node tests/run-node.js`, Smoke. Commit «Doku: Ansicht Personen, Filterwirkung, Datenschutz (E7, E11), Harte Regeln». Push, PR-Text (C.5). ⛔ Schrittbericht C.5.

---

### Task 6 (Schritt C.6): Phase-2-Vorbereitung ohne Schreibpfad, PR «Ready for review», Abnahme

**Dateien:** `config.js`, `datasource/index.js`, `tests/config.test.js`, `tests/fileAdapter.test.js`, `tests/smoke/run.mjs`, `README.md` (Architektur, ein Satz)

- [ ] **Schritt 1: Tests (RED)** – `tests/config.test.js` anhängen:

```js
test('config.features: Schreibpfad (Phase 2) standardmässig aus – ohne Flag keine Bearbeiten-Elemente (PROMPT-2 C.8)', () => {
  assertEqual(CONFIG.features, { write: false });
});
```

`tests/fileAdapter.test.js` anhängen (Import `import { write as datasourceWrite, NotImplementedError as DsNotImplemented } from '../datasource/index.js';`):

```js
test('datasource.write: Signatur { sheet, row, header, value, expected, reason } dokumentiert, wirft NotImplementedError (Phase 2)', async () => {
  let e = null;
  try { await datasourceWrite({ sheet: 'First Certification', row: 12, header: 'WE1 RUN1 Passed', value: 'yes', expected: null, reason: 'Test' }); } catch (err) { e = err; }
  assert(e instanceof DsNotImplemented, 'NotImplementedError erwartet');
  assert(/Phase 2/.test(e.message));
});
```

`tests/smoke/run.mjs` im Personen-Block (Desktop) nach der Raster-Prüfung: `check((await page.locator('#view .run-edit').count()) === 0, 'Personen: ohne Feature-Flag keine Bearbeiten-Elemente (Phase 2)');`. Run: `node tests/run-node.js` → FAIL (`CONFIG.features` undefined).

- [ ] **Schritt 2: Umsetzen (GREEN)** – `config.js` in `CONFIG` nach `oe:`:

```js
  // Phase 2 (PROMPT-2 C.8, Paket E): Schreibpfad nur mit Flag. false = keine Bearbeiten-Elemente, kein Schreibzugriff.
  features: { write: false },
```

`datasource/index.js`: Kopfkommentar und Funktion ersetzen:

```js
// write({ sheet, row, header, value, expected, reason }) → { ok, written, conflict, itemVersion }
//   Phase 2 (Paket E): genau eine Zelle in einer bestehenden Spalte (Header-Name, nie Spaltenbuchstabe) über die Graph-Workbook-API;
//   expected = erwarteter aktueller Zellwert (Konfliktprüfung), reason = Begründung fürs Audit-Protokoll. Bis dahin NotImplementedError.
export async function write({ sheet, row, header, value, expected = null, reason = '' } = {}) {
  void sheet; void row; void header; void value; void expected; void reason;
  throw new NotImplementedError('Schreiben ist erst in Phase 2 (Workbook-API) vorgesehen.');
}
```

README «Architektur»: Satz «Phase 2 (Schreibpfad, Paket E) ist nur vorbereitet: `CONFIG.features.write` (Standard `false`) und die dokumentierte Signatur `write({ sheet, row, header, value, expected, reason })` in `datasource/index.js`; ohne Flag rendert die App keine Bearbeiten-Elemente.» Run: `node tests/run-node.js` → grün; Smoke grün.

- [ ] **Schritt 3: Abschluss Paket C** – Alle Tests, Smoke (drei Viewports), `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline-c.json` identisch, `node tools/contrast.js`, `node tools/glossar-readme.js --write` ohne Änderung. Commit «Phase-2-Vorbereitung: Feature-Flag write=false, Signatur write() dokumentiert». Push, CI abwarten (`gh pr checks <n>`), PR-Text vollständig (C.1–C.6, DoD), `gh pr ready <n>`. ⛔ Abnahme-Bericht Paket C nach Vorlage 0.8 (DoD mit Nachweis, PR-Link, Doku-Stellen, Entscheid-Log E11, Restpunkte: Dateiname des Exports trägt das Präfix `bbz-saq_` der übrigen Exporte; Schreibpfad erst Paket E) **inklusive Block «Entscheide vor Start» Paket D** (Fragen aus `PROMPT-2.md`, Abschnitt «Paket D – Experten-Layer», Zeilen «⛔ Entscheide vor Start»; je Frage Empfehlung und Begründung in je einem Satz; Header-abhängige Fragen folgen erst nach D.2).

## Selbstprüfung des Plans

- Spezifikation C.1–C.9 abgedeckt: Suche (Task 1/3), Trefferliste mit Prioritäten und Limit (Task 2/3), Detail mit Kopf, Pfad, Karten, Raster, Zeitachse, Datenqualität, Export (Task 3), Filter- und URL-Verhalten (Task 2/3, Tests), Datenschutz (Task 5), Phone (Task 4), Phase 2 (Task 6), Akzeptanzkriterien C.9 als Unit- und Smoke-Prüfungen (Namensgleiche getrennt, Detail unabhängig vom Profil-Filter, Raster/Zeitachse = Export «Runs» über `runTimeline`, URL ohne Suchtext, Speicher leer, Phone ohne Überlauf).
- Abweichungen vom Dokument (im Bericht nennen): Glossar-Einträge bereits in C.3 (der Metadaten-Test verlangt den Begriff); Snapshot-Baseline wechselt in C.1 wegen der neuen synthetischen Personen; Namen aus Anhang A5 konkretisiert als «Wechsel Willi», «Zwilling Gabi» (2×), «Datumlos Otto».
- Typen konsistent: `personSearchIndex()`-Einträge (`key`, `name`, `nameKey`, `vorgaenge`, `profiles`, `latest`, `bank`, `formerBanks`, `lastExam`, `certCount`, `status`, `passiv`, `keyLevel`, `role`, `text`) werden in `searchPersons()`, `personPath()`, `personResultsTable()` und `views/personen.js` gleich verwendet; `ergebnis`-Wörter («bestanden», «nicht bestanden», «geplant», «ohne Ergebnis», «–», «Zertifikat») sind in `runErgebnis()`, `gridCell()`, `personTimelineTable()` und `statusTone()` abgestimmt.
