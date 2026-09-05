import { test, assert, assertEqual } from './runner.js';
import { csvEscape, toCsv, tableToAoa, filterLines, exportFileName, fmtDate, fmtDateTime, fmtTime } from '../export.js';
import { DEFAULT_FILTER } from '../metrics.js';

const TABLE = {
  title: 'Testtabelle',
  columns: [{ key: 'gruppe', label: 'Gruppe' }, { key: 'n', label: 'n' }, { key: 'quote', label: 'Quote' }],
  rows: [{ gruppe: 'Gesamt', n: 12, quote: '83.3 %' }, { gruppe: 'PK; Basis', n: 3, quote: '66.7 %' }],
};

test('export.fmtDate/fmtDateTime/fmtTime: Schweizer Schreibweise, leer bei null', () => {
  assertEqual(fmtDate(new Date(2026, 8, 5, 9, 30)), '05.09.2026');
  assertEqual(fmtDateTime(new Date(2026, 8, 5, 9, 5)), '05.09.2026 09:05');
  assertEqual(fmtTime(new Date(2026, 8, 5, 13, 30)), '13:30');
  assertEqual(fmtDate(null), '');
  assertEqual(fmtDateTime(undefined), '');
});

test('export.csvEscape: Trennzeichen, Anführungszeichen, Zeilenumbruch, leer, Zahl, Datum', () => {
  assertEqual(csvEscape('Muster'), 'Muster');
  assertEqual(csvEscape('a;b'), '"a;b"');
  assertEqual(csvEscape('say "hi"'), '"say ""hi"""');
  assertEqual(csvEscape('zwei' + String.fromCharCode(10) + 'Zeilen'), '"zwei' + String.fromCharCode(10) + 'Zeilen"');
  assertEqual(csvEscape(null), '');
  assertEqual(csvEscape(undefined), '');
  assertEqual(csvEscape(0.5), '0.5');
  assertEqual(csvEscape(new Date(2026, 0, 2)), '02.01.2026');
});

test('export.toCsv: Filterzeilen im Kopf, Leerzeile, Spaltentitel, Zeilen, Semikolon, CRLF', () => {
  const csv = toCsv(TABLE, ['Datei: Reporting_KUBA.xlsx', 'Zeitraum: alle']);
  const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
  assertEqual(csv.split(CRLF), ['Datei: Reporting_KUBA.xlsx', 'Zeitraum: alle', '', 'Gruppe;n;Quote', 'Gesamt;12;83.3 %', '"PK; Basis";3;66.7 %']);
  assertEqual(toCsv(TABLE).split(CRLF)[0], 'Gruppe;n;Quote', 'ohne Kopfzeilen direkt Spaltentitel');
});

test('export.tableToAoa: Array-of-Arrays für SheetJS, Zahlen bleiben Zahlen', () => {
  const aoa = tableToAoa(TABLE, ['Zeitraum: alle']);
  assertEqual(aoa, [['Zeitraum: alle'], [], ['Gruppe', 'n', 'Quote'], ['Gesamt', 12, '83.3 %'], ['PK; Basis', 3, '66.7 %']]);
  assertEqual(tableToAoa(TABLE)[0], ['Gruppe', 'n', 'Quote']);
});

test('export.filterLines: Filterzustand lesbar, Standard = alle', () => {
  const meta = { fileName: 'Reporting_KUBA.xlsx', lastModified: new Date(2026, 8, 4, 16, 2), loadedAt: new Date(2026, 8, 5, 9, 13), source: 'graph' };
  const lines = filterLines(DEFAULT_FILTER, meta);
  assertEqual(lines[0], 'Datei: Reporting_KUBA.xlsx (SharePoint), geändert 04.09.2026 16:02, geladen 05.09.2026 09:13');
  assert(lines.includes('Zeitraum: alle'));
  assert(lines.includes('Profil: alle'));
  assert(lines.includes('Sprache: alle'));
  assert(lines.includes('Bank: alle'));
  assert(lines.includes('VSS/VSM: alle'));
  assert(lines.includes('Versuche: alle'));
  assert(lines.includes('Versuchsmodus: Erstversuch (nur RUN1 zählt)'));
  assert(lines.includes('Nur ausgestellte Zertifikate: nein'));
});

test('export.filterLines: gesetzte Filter', () => {
  const f = { ...DEFAULT_FILTER, from: new Date(2025, 0, 1), to: new Date(2025, 11, 31), profil: ['PK', 'IK'], sprache: ['FR'], bank: ['Testbank AG'], vssVsm: 'vsm', versuche: 'erstversuch', mode: 'bestanden', onlyIssued: true };
  const lines = filterLines(f, { fileName: 'x.xlsx', source: 'file' });
  assert(lines[0].startsWith('Datei: x.xlsx (lokale Datei)'), lines[0]);
  assert(lines.includes('Zeitraum: 01.01.2025 – 31.12.2025'));
  assert(lines.includes('Profil: PK, IK'));
  assert(lines.includes('Sprache: FR'));
  assert(lines.includes('Bank: Testbank AG'));
  assert(lines.includes('VSS/VSM: nur VSM'));
  assert(lines.includes('Versuche: nur 1. Versuch'));
  assert(lines.includes('Versuchsmodus: Bestanden (der bestandene Run zählt)'));
  assert(lines.includes('Nur ausgestellte Zertifikate: ja'));
  assertEqual(filterLines({ ...DEFAULT_FILTER, from: new Date(2025, 0, 1) }, {}).find((l) => l.startsWith('Zeitraum')), 'Zeitraum: ab 01.01.2025');
  assertEqual(filterLines({ ...DEFAULT_FILTER, to: new Date(2025, 0, 1) }, {}).find((l) => l.startsWith('Zeitraum')), 'Zeitraum: bis 01.01.2025');
});

test('export.exportFileName: Präfix, View, Datum, Endung', () => {
  assertEqual(exportFileName('schriftlich', 'csv', new Date(2026, 8, 5)), 'bbz-saq_schriftlich_2026-09-05.csv');
  assertEqual(exportFileName('geplante-pruefungen', 'xlsx', new Date(2026, 0, 2)), 'bbz-saq_geplante-pruefungen_2026-01-02.xlsx');
});
