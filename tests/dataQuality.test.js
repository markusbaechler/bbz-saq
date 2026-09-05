import { test, assertEqual } from './runner.js';
import { DQ_COLUMNS, formatRaw, sortDq, filterDq, sheetOptions } from '../views/dataQuality.js';

const ENTRIES = [
  { sheet: 'First Certification', row: 100, header: 'WE1 RUN1 Passed', field: 'we1.run1.passed', raw: 'maybe', reason: 'Passed-Wert nicht in Whitelist' },
  { sheet: 'First Certification', row: 9, header: 'Certificate Language', field: 'sprache', raw: 'ES', reason: 'Sprache unbekannt' },
  { sheet: 'Ausgestellte Zertifikate', row: 10, header: 'OE1 RUN1 Date', field: 'oe1.run1.date', raw: '31.02.2024', reason: 'Datum ungültig (Tag/Monat)' },
  { sheet: 'Ausgestellte Zertifikate', row: 10, header: 'WE2 RUN1 Score', field: 'we2.run1.score', raw: 12.5, reason: 'Score ist keine ganze Zahl ≥ 0' },
  { sheet: 'First Certification', row: 12, header: 'Last Name', field: 'lastName', raw: null, reason: 'Name fehlt (Zeile enthält Daten)' },
];

test('dataQuality.DQ_COLUMNS: Sheet, Zeile, Header, Rohwert, Grund', () => {
  assertEqual(DQ_COLUMNS.map((c) => c.key), ['sheet', 'row', 'header', 'raw', 'reason']);
  assertEqual(DQ_COLUMNS.map((c) => c.label), ['Sheet', 'Zeile', 'Header', 'Rohwert', 'Grund']);
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
