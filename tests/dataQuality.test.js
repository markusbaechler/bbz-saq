import { test, assert, assertEqual } from './runner.js';
import { DQ_COLUMNS, LEVEL_LABELS, levelOf, impactOf, formatRaw, sortDq, filterDq, sheetOptions, summarizeDq, summaryAsText, DEFAULT_DQ_STATE } from '../views/dataQuality.js';
import { LEVEL, IMPACT, normalizeSheet } from '../store.js';
import { PASS_THRESHOLD } from '../config.js';
import { makeSheet, runValues } from './fixtures.js';

const ENTRIES = [
  { level: 'fehler', sheet: 'First Certification', row: 100, header: 'WE1 RUN1 Passed', field: 'we1.run1.passed', raw: 'maybe', reason: 'Passed-Wert nicht in Whitelist' },
  { level: 'fehler', sheet: 'First Certification', row: 9, header: 'Certificate Language', field: 'sprache', raw: 'ES', reason: 'Sprache unbekannt' },
  { level: 'fehler', sheet: 'Ausgestellte Zertifikate', row: 10, header: 'OE1 RUN1 Date', field: 'oe1.run1.date', raw: '31.02.2024', reason: 'Datum ungültig (Tag/Monat)' },
  { level: 'hinweis', sheet: 'Ausgestellte Zertifikate', row: 10, header: 'WE2 RUN1 Score', field: 'we2.run1.score', raw: 12.5, reason: 'Score ist keine ganze Zahl ≥ 0' },
  { level: 'fehler', sheet: 'First Certification', row: 12, header: 'Last Name', field: 'lastName', raw: null, reason: 'Name fehlt (Zeile enthält Daten)' },
];

test('dataQuality.DQ_COLUMNS: Wirkung, Stufe, Sheet, Zeile, Header, Rohwert, Grund', () => {
  assertEqual(DQ_COLUMNS.map((c) => c.key), ['impact', 'level', 'sheet', 'row', 'header', 'raw', 'reason']);
  assertEqual(DQ_COLUMNS.map((c) => c.label), ['Wirkung', 'Stufe', 'Sheet', 'Zeile', 'Header', 'Rohwert', 'Grund']);
  assertEqual(DEFAULT_DQ_STATE.sortKey, 'impact', 'Standard: nach Wirkung priorisiert');
});

test('dataQuality.formatRaw: leer, Datum, Zahl, Boolean, Text', () => {
  assertEqual(formatRaw(null), '');
  assertEqual(formatRaw(undefined), '');
  assertEqual(formatRaw(''), '');
  assertEqual(formatRaw(new Date(2024, 8, 5, 10, 30)), '05.09.2024 10:30');
  assertEqual(formatRaw(12.5), '12.5');
  assertEqual(formatRaw(true), 'TRUE');
  assertEqual(formatRaw(' x '), ' x ');
});

test('dataQuality.sortDq: Zeile numerisch, auf- und absteigend, Original unverändert', () => {
  const asc = sortDq(ENTRIES, 'row', 'asc');
  assertEqual(asc.map((e) => e.row), [9, 10, 10, 12, 100]);
  assertEqual(sortDq(ENTRIES, 'row', 'desc').map((e) => e.row), [100, 12, 10, 10, 9]);
  assertEqual(ENTRIES.map((e) => e.row), [100, 9, 10, 10, 12], 'Eingabe bleibt unverändert');
});

test('dataQuality.sortDq: Text-Spalten mit Collator, stabil bei Gleichstand', () => {
  const bySheet = sortDq(ENTRIES, 'sheet', 'asc');
  assertEqual(bySheet.map((e) => e.sheet), ['Ausgestellte Zertifikate', 'Ausgestellte Zertifikate', 'First Certification', 'First Certification', 'First Certification']);
  assertEqual(bySheet.slice(0, 2).map((e) => e.header), ['OE1 RUN1 Date', 'WE2 RUN1 Score'], 'Reihenfolge innerhalb gleicher Sheets bleibt');
  assertEqual(sortDq(ENTRIES, 'raw', 'asc').map((e) => e.raw), [null, 12.5, '31.02.2024', 'ES', 'maybe']);
});

test('dataQuality.filterDq: Volltext über alle Spalten, case-insensitiv', () => {
  assertEqual(filterDq(ENTRIES, { text: 'datum' }).map((e) => e.header), ['OE1 RUN1 Date']);
  assertEqual(filterDq(ENTRIES, { text: 'run1' }).length, 3);
  assertEqual(filterDq(ENTRIES, { text: '12.5' }).map((e) => e.header), ['WE2 RUN1 Score']);
  assertEqual(filterDq(ENTRIES, { text: '100' }).map((e) => e.header), ['WE1 RUN1 Passed']);
  assertEqual(filterDq(ENTRIES, { text: '' }).length, 5);
  assertEqual(filterDq(ENTRIES, { text: 'gibtesnicht' }).length, 0);
});

test('dataQuality.filterDq: Sheet-Filter, kombinierbar mit Text', () => {
  assertEqual(filterDq(ENTRIES, { sheet: 'Ausgestellte Zertifikate' }).length, 2);
  assertEqual(filterDq(ENTRIES, { sheet: 'Ausgestellte Zertifikate', text: 'score' }).map((e) => e.row), [10]);
  assertEqual(filterDq(ENTRIES, { sheet: '' }).length, 5);
});

test('dataQuality.sheetOptions: vorhandene Sheets in Konfigurationsreihenfolge', () => {
  assertEqual(sheetOptions(ENTRIES), ['First Certification', 'Ausgestellte Zertifikate']);
  assertEqual(sheetOptions([ENTRIES[2]]), ['Ausgestellte Zertifikate']);
  assertEqual(sheetOptions([]), []);
});

test('dataQuality.summarizeDq: Anzahl je Sheet/Header/Grund, absteigend, ohne Rohwerte und Zeilen', () => {
  const rows = summarizeDq(ENTRIES.concat([{ ...ENTRIES[0], row: 200, raw: 'vielleicht' }]));
  assertEqual(rows.length, 5);
  assertEqual(rows[0], { impact: 'kennzahl', level: 'fehler', sheet: 'First Certification', header: 'WE1 RUN1 Passed', reason: 'Passed-Wert nicht in Whitelist', count: 2, examples: ['maybe', 'vielleicht'] });
  assertEqual(rows.map((r) => r.count), [2, 1, 1, 1, 1]);
  assertEqual(rows.slice(1).map((r) => r.sheet), ['First Certification', 'First Certification', 'Ausgestellte Zertifikate', 'Ausgestellte Zertifikate'], 'Gleichstand: Sheet in Konfigurationsreihenfolge');
  assertEqual(rows.slice(1).map((r) => r.header), ['Certificate Language', 'Last Name', 'OE1 RUN1 Date', 'WE2 RUN1 Score'], 'dann Header alphabetisch');
  assert(rows.every((r) => !('raw' in r) && !('row' in r)));
  assertEqual(summarizeDq([]), []);
});

test('dataQuality.summarizeDq: Beispiele – höchstens 3 verschiedene Rohwerte, keine aus Namensspalten', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ ...ENTRIES[3], row: 20 + i, raw: 10.5 + (i % 4) }));
  const rows = summarizeDq(many.concat(ENTRIES[4], { ...ENTRIES[4], row: 13, raw: 'irgendwas' }));
  assertEqual(rows[0].examples, ['10.5', '11.5', '12.5']);
  assertEqual(rows[1].header, 'Last Name');
  assertEqual(rows[1].examples, [], 'Namensfelder liefern keine Beispiele');
  assertEqual(summarizeDq([{ ...ENTRIES[2], raw: new Date(2024, 8, 5, 10, 30) }])[0].examples, ['05.09.2024 10:30']);
});

test('dataQuality.summaryAsText: Tab-getrennt mit Stufe und Beispielen', () => {
  const TAB = String.fromCharCode(9);
  const lines = summaryAsText(summarizeDq(ENTRIES.slice(0, 2))).split(String.fromCharCode(10));
  assertEqual(lines[0], ['Wirkung', 'Stufe', 'Sheet', 'Header', 'Grund', 'Anzahl', 'Beispiele'].join(TAB));
  assertEqual(lines[1], ['verändert Kennzahl', 'fehler', 'First Certification', 'Certificate Language', 'Sprache unbekannt', '1', 'ES'].join(TAB));
  assertEqual(lines.length, 3);
});

test('dataQuality.filterDq: Stufe (fehler | hinweis), kombinierbar', () => {
  assertEqual(filterDq(ENTRIES, { level: 'hinweis' }).map((e) => e.header), ['WE2 RUN1 Score']);
  assertEqual(filterDq(ENTRIES, { level: 'fehler' }).length, 4);
  assertEqual(filterDq(ENTRIES, { level: 'fehler', sheet: 'Ausgestellte Zertifikate' }).length, 1);
  assertEqual(filterDq(ENTRIES, { level: '' }).length, 5);
});

test('dataQuality.levelOf / LEVEL_LABELS: Stufe «nicht ausgewertet» (E6) wird erkannt, Unbekanntes gilt als Fehler', () => {
  assertEqual(LEVEL_LABELS['nicht-ausgewertet'], 'Nicht ausgewertet');
  assertEqual(levelOf({ level: 'nicht-ausgewertet' }), 'nicht-ausgewertet');
  assertEqual(levelOf({ level: 'hinweis' }), 'hinweis');
  assertEqual(levelOf({ level: 'fehler' }), 'fehler');
  assertEqual(levelOf({ level: 'irgendwas' }), 'fehler');
  assertEqual(levelOf(null), 'fehler');
  const entries = ENTRIES.concat([{ level: 'nicht-ausgewertet', sheet: 'First Certification', row: 30, header: 'WE1 RUN1 Score', field: 'we1.run1.score', raw: 'x', reason: 'Score …' }]);
  assertEqual(filterDq(entries, { level: 'nicht-ausgewertet' }).map((e) => e.row), [30]);
  assertEqual(filterDq(entries, { level: 'fehler' }).length, 4);
  assertEqual(summarizeDq(entries).find((r) => r.level === 'nicht-ausgewertet').header, 'WE1 RUN1 Score');
});

test('dataQuality.impactOf / sortDq(impact) / filterDq(impact): Priorisierung nach Wirkung, dann Stufe, dann Zeile', () => {
  const entries = [
    { level: 'hinweis', impact: 'keine', sheet: 'First Certification', row: 5, header: 'WE1 RUN1 Result', field: 'we1.run1.result', raw: 85, reason: 'umgedeutet' },
    { level: 'fehler', impact: 'kennzahl', sheet: 'First Certification', row: 3, header: 'Certificate Language', field: 'sprache', raw: 'ES', reason: 'Sprache unbekannt' },
    { level: 'hinweis', impact: 'unsichtbar', sheet: 'Ausgestellte Zertifikate', row: 9, header: 'WE1 RUN1 Date', field: 'we1.run1.date', raw: null, reason: 'Passed ohne Datum' },
    { level: 'fehler', impact: 'unsichtbar', sheet: 'First Certification', row: 7, header: 'Last Name', field: 'lastName', raw: null, reason: 'Name fehlt' },
    { level: 'fehler', sheet: 'First Certification', row: 1, header: 'WE1 RUN1 Passed', field: 'we1.run1.passed', raw: 'x', reason: 'ohne Wirkungsangabe' },
  ];
  assertEqual(impactOf(entries[4]), 'kennzahl', 'ohne Angabe gilt «verändert Kennzahl»');
  assertEqual(sortDq(entries, 'impact', 'asc').map((e) => e.row), [7, 9, 1, 3, 5], 'unsichtbar (Fehler vor Hinweis), dann Kennzahl nach Zeile, dann keine');
  assertEqual(sortDq(entries, 'impact', 'desc').map((e) => e.row), [5, 3, 1, 9, 7]);
  assertEqual(sortDq(entries, 'level', 'asc').map((e) => e.row), [3, 7, 1, 5, 9], 'Stufe: Fehler vor Hinweis, stabil');
  assertEqual(filterDq(entries, { impact: 'unsichtbar' }).map((e) => e.row), [9, 7]);
  assertEqual(filterDq(entries, { impact: 'keine' }).length, 1);
  assertEqual(filterDq(entries, { text: 'unsichtbar' }).length, 2, 'Volltext findet die Wirkungsbezeichnung');
  const summary = summarizeDq(entries);
  assertEqual(summary.map((r) => [r.impact, r.count]), [['unsichtbar', 1], ['unsichtbar', 1], ['kennzahl', 1], ['kennzahl', 1], ['keine', 1]]);
  assert(summaryAsText(summary).startsWith('Wirkung'));
});

// ---------------------------------------------------------------------------
// Paket A (A6): Ergebnis unter der Bestehensgrenze
// Die Bestehensgrenze liegt bei 70 % (Auftraggeber, bestätigt 10.09.2026). Passed-Wert und Resultat müssen zusammenpassen:
// Die Quoten lesen den Passed-Wert, die Ø-Resultate das Resultat – widersprechen sie sich, geht einer der beiden Werte
// falsch in die Kennzahlen ein. Synthetische Zeilen beidseits der Grenze.
// ---------------------------------------------------------------------------

const person = (name, we) => ({ lastName: name, firstName: 'Test', profil: 'PK', sprache: 'DE', employer: 'Testbank AG', ...runValues('we', we) });
const grenzeDq = (rowValues) => normalizeSheet(makeSheet('first', rowValues), {}, { today: new Date(2026, 8, 10) })
  .dq.filter((e) => /Bestehensgrenze/.test(e.reason));

test('dataQuality A6: bestanden unter der Grenze und nicht bestanden darüber ergeben je einen Hinweis', () => {
  const dq = grenzeDq([
    person('Widerspruch', { 1: [{ passed: 'yes', date: '2026-03-02', result: 0.65 }] }),
    person('Umgekehrt', { 1: [{ passed: 'no', date: '2026-03-03', result: 0.82 }] }),
  ]);
  assertEqual(dq.length, 2, 'ein Eintrag je widersprüchlichem Run');
  for (const e of dq) {
    assertEqual(e.level, LEVEL.HINWEIS);
    assertEqual(e.impact, IMPACT.KENNZAHL, 'verändert Kennzahl');
    assertEqual(e.sheet, 'First Certification');
    assertEqual(e.header, 'WE1 RUN1 Result', 'Fundstelle ist die Resultat-Spalte');
    assert(typeof e.row === 'number' && e.row >= 11, 'Excel-Zeile genannt');
    assert(e.raw !== null && e.raw !== undefined, 'Rohwert mitgeführt');
    assert(!/ß/.test(e.reason), 'ss statt ß');
  }
  assert(/Als bestanden erfasst/.test(dq[0].reason) && /65\.0 %/.test(dq[0].reason) && /70\.0 %/.test(dq[0].reason), 'Grund nennt beide Werte: ' + dq[0].reason);
  assert(/Als nicht bestanden erfasst/.test(dq[1].reason) && /82\.0 %/.test(dq[1].reason), 'Grund der Gegenrichtung: ' + dq[1].reason);
});

test('dataQuality A6: passende Werte, die Grenze selbst und fehlende Angaben ergeben keinen Hinweis', () => {
  assertEqual(grenzeDq([
    person('Passt', { 1: [{ passed: 'yes', date: '2026-03-02', result: 0.82 }] }),          // bestanden, darüber
    person('PasstAuch', { 1: [{ passed: 'no', date: '2026-03-02', result: 0.65 }] }),       // nicht bestanden, darunter
    person('Genau', { 1: [{ passed: 'yes', date: '2026-03-02', result: PASS_THRESHOLD }] }), // genau 70 % gilt als bestanden
    person('OhneResultat', { 1: [{ passed: 'yes', date: '2026-03-02' }] }),                 // Resultat leer
    person('Geplant', { 1: [{ date: '2027-03-02', result: 0.65 }] }),                       // kein Passed-Wert: Run nicht absolviert
  ]).length, 0);
});

test('dataQuality A6: knapp unter der Grenze zählt, die Grenze selbst nicht', () => {
  assertEqual(grenzeDq([person('Knapp', { 1: [{ passed: 'yes', date: '2026-03-02', result: 0.699 }] })]).length, 1);
  assertEqual(grenzeDq([person('Grenze', { 1: [{ passed: 'no', date: '2026-03-02', result: PASS_THRESHOLD }] })]).length, 1, 'genau 70 % und «no» widersprechen sich');
});
