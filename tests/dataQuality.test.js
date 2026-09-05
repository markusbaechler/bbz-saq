import { test, assert, assertEqual } from './runner.js';
import { DQ_COLUMNS, LEVEL_LABELS, levelOf, formatRaw, sortDq, filterDq, sheetOptions, summarizeDq, summaryAsText } from '../views/dataQuality.js';

const ENTRIES = [
  { level: 'fehler', sheet: 'First Certification', row: 100, header: 'WE1 RUN1 Passed', field: 'we1.run1.passed', raw: 'maybe', reason: 'Passed-Wert nicht in Whitelist' },
  { level: 'fehler', sheet: 'First Certification', row: 9, header: 'Certificate Language', field: 'sprache', raw: 'ES', reason: 'Sprache unbekannt' },
  { level: 'fehler', sheet: 'Ausgestellte Zertifikate', row: 10, header: 'OE1 RUN1 Date', field: 'oe1.run1.date', raw: '31.02.2024', reason: 'Datum ungültig (Tag/Monat)' },
  { level: 'hinweis', sheet: 'Ausgestellte Zertifikate', row: 10, header: 'WE2 RUN1 Score', field: 'we2.run1.score', raw: 12.5, reason: 'Score ist keine ganze Zahl ≥ 0' },
  { level: 'fehler', sheet: 'First Certification', row: 12, header: 'Last Name', field: 'lastName', raw: null, reason: 'Name fehlt (Zeile enthält Daten)' },
];

test('dataQuality.DQ_COLUMNS: Sheet, Zeile, Header, Rohwert, Grund', () => {
  assertEqual(DQ_COLUMNS.map((c) => c.key), ['level', 'sheet', 'row', 'header', 'raw', 'reason']);
  assertEqual(DQ_COLUMNS.map((c) => c.label), ['Stufe', 'Sheet', 'Zeile', 'Header', 'Rohwert', 'Grund']);
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
  assertEqual(rows[0], { level: 'fehler', sheet: 'First Certification', header: 'WE1 RUN1 Passed', reason: 'Passed-Wert nicht in Whitelist', count: 2, examples: ['maybe', 'vielleicht'] });
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
  assertEqual(lines[0], ['Stufe', 'Sheet', 'Header', 'Grund', 'Anzahl', 'Beispiele'].join(TAB));
  assertEqual(lines[1], ['fehler', 'First Certification', 'Certificate Language', 'Sprache unbekannt', '1', 'ES'].join(TAB));
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
