import { test, assert, assertEqual } from './runner.js';
import { MODE } from '../metrics.js';
import {
  groupLabel, passRateTable, performanceTable, performanceByPartTable, oralRateTable, vssVsmTable,
  rankingTables, plannedTables, overviewModel, SMALL_MARK,
} from '../views/tables.js';
import { makePerson } from './fixtures.js';

// Kurzform: schriftlich 2 Teile, RUN1 bestanden, mündlich OE1 RUN1 bestanden
function simple(overrides = {}) {
  return makePerson({
    weAllPassed: true,
    oeAllPassed: true,
    we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }], 2: [{ passed: true, date: '2024-03-01', result: 0.6 }] },
    oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] },
    ...overrides,
  });
}

function cohort() {
  return [
    simple({ lastName: 'A', profil: 'PK', sprache: 'DE', employerCanon: 'Testbank AG' }),
    simple({ lastName: 'B', profil: 'PK', sprache: 'FR', employerCanon: 'Testbank AG', we: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }, { passed: true, date: '2024-04-01', result: 0.7 }], 2: [{ passed: true, date: '2024-03-01', result: 0.6 }] } }),
    simple({ lastName: 'C', profil: 'IK', sprache: 'DE', employerCanon: 'Musterbank', weAllPassed: false, oeAllPassed: false, we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }], 2: [{ passed: false, date: '2024-03-01', result: 0.3 }] }, oe: { 1: [{ passed: false, date: '2024-06-01', result: 0.4 }] } }),
    simple({ lastName: 'D', profil: null, sprache: 'DE', employerCanon: null, vss: true }),
  ];
}

test('tables.groupLabel: null → «unbekannt», sonst Wert', () => {
  assertEqual(groupLabel(null), 'unbekannt');
  assertEqual(groupLabel('PK'), 'PK');
  assertEqual(SMALL_MARK, '*');
});

test('tables.passRateTable: Gesamt zuerst, Gruppen mit n, beide Quoten, n<5 markiert', () => {
  const t = passRateTable(cohort(), 'profil');
  assertEqual(t.columns.map((c) => c.label), ['Profil', 'n', 'Erstversuchsquote', 'Gesamterfolgsquote']);
  assertEqual(t.rows.map((r) => r.gruppe), ['Gesamt *', 'PK *', 'IK *', 'unbekannt *']);
  assertEqual(t.rows[0].n, 4);
  assertEqual(t.rows[0].erstversuch, '50.0 %', 'A und D im ersten Versuch, B und C nicht');
  assertEqual(t.rows[0].gesamt, '75.0 %');
  assertEqual(t.rows[1], { gruppe: 'PK *', n: 2, small: true, erstversuch: '50.0 %', gesamt: '100.0 %' });
  assertEqual(t.rows[2].gesamt, '0.0 %');
  assert(t.note.includes('n < 5'));
  const five = Array.from({ length: 5 }, () => simple({ profil: 'PK' }));
  assertEqual(passRateTable(five, 'profil').rows.map((r) => r.gruppe), ['Gesamt', 'PK'], 'keine Markierung ab n=5');
  assertEqual(passRateTable([], 'sprache').rows, [{ gruppe: 'Gesamt *', n: 0, small: true, erstversuch: '–', gesamt: '–' }]);
});

test('tables.performanceTable: Ø gemäss Modus je Gruppe, n = Personen mit Wert', () => {
  const t = performanceTable(cohort(), 'sprache', MODE.ERSTVERSUCH, 'written');
  assertEqual(t.columns.map((c) => c.label), ['Sprache', 'n', 'Ø Performance']);
  assertEqual(t.rows[0].gruppe, 'Gesamt *');
  assertEqual(t.rows[0].n, 4);
  // A 0.7, B 0.5, C 0.55, D 0.7 → 0.6125
  assertEqual(t.rows[0].mean, '61.3 %');
  assertEqual(t.rows.map((r) => r.gruppe), ['Gesamt *', 'DE *', 'FR *']);
  assertEqual(t.rows[2], { gruppe: 'FR *', n: 1, small: true, mean: '50.0 %' });
  const oral = performanceTable(cohort(), 'profil', MODE.BESTANDEN, 'oral');
  assertEqual(oral.rows[0].n, 3, 'C ohne bestandene OE hat keinen Wert');
  assertEqual(oral.rows[0].mean, '90.0 %');
});

test('tables.performanceByPartTable: WE1–WE6 mit n', () => {
  const t = performanceByPartTable(cohort(), MODE.ERSTVERSUCH);
  assertEqual(t.columns.map((c) => c.label), ['Teilprüfung', 'n', 'Ø Performance']);
  assertEqual(t.rows.length, 6);
  assertEqual(t.rows[0], { gruppe: 'WE1 *', n: 4, small: true, mean: '70.0 %' });
  assertEqual(t.rows[2], { gruppe: 'WE3 *', n: 0, small: true, mean: '–' });
});

test('tables.oralRateTable: Nenner = Personen mit OE1 RUN1-Datum, bestanden, 1× und 2× durchgefallen', () => {
  const t = oralRateTable(cohort(), 'profil');
  assertEqual(t.columns.map((c) => c.label), ['Profil', 'n', 'Bestanden', '1× durchgefallen', '2× durchgefallen']);
  assertEqual(t.rows[0], { gruppe: 'Gesamt *', n: 4, small: true, bestanden: '75.0 %', failed1: '25.0 %', failed2: '0.0 %' });
  assertEqual(t.rows[2].gruppe, 'IK *');
  assertEqual(t.rows[2].bestanden, '0.0 %');
});

test('tables.vssVsmTable: VSS / VSM / ohne, je Profil, mit beiden Quoten', () => {
  const t = vssVsmTable(cohort());
  assertEqual(t.columns.map((c) => c.label), ['Gruppe', 'Profil', 'n', 'Schriftlich Erstversuch', 'Schriftlich gesamt', 'Mündlich bestanden']);
  assertEqual(t.rows.map((r) => [r.gruppe, r.profil, r.n]), [
    ['VSS', 'alle', 1], ['VSS', 'unbekannt', 1],
    ['VSM', 'alle', 0],
    ['ohne', 'alle', 3], ['ohne', 'PK', 2], ['ohne', 'IK', 1],
  ]);
  assertEqual(t.rows[0].muendlich, '100.0 %');
  assertEqual(t.rows[2].erstversuch, '–');
});

test('tables.rankingTables: Top-Listen je Profil mit Rang, Name, Bank, Wert, Versuchen, Referenzdatum', () => {
  const persons = cohort();
  const r = rankingTables(persons, MODE.ERSTVERSUCH, 5);
  assertEqual(Object.keys(r), ['written', 'oral', 'award']);
  assertEqual(r.written.map((t) => t.profil), ['PK', 'IK', 'unbekannt']);
  assertEqual(r.written[0].columns.map((c) => c.label), ['Rang', 'Name', 'Bank', 'Schriftlich', 'Versuche', 'Referenzdatum']);
  assertEqual(r.written[0].rows[0], { rang: 1, name: 'A Test', bank: 'Testbank AG', wert: '70.0 %', versuche: 3, refDate: '01.06.2024' });
  assertEqual(r.award[0].columns.map((c) => c.label), ['Rang', 'Name', 'Bank', 'Award-Score', 'Schriftlich', 'Mündlich', 'Versuche', 'Referenzdatum']);
  assertEqual(r.award[0].rows[0].wert, '80.0 %');
  assertEqual(r.award[1].rows, [], 'IK: C ohne bestandene OE');
  assertEqual(r.oral[0].rows.map((x) => x.name), ['A Test', 'B Test']);
});

test('tables.plannedTables: Übersicht je Tag und Ort, Details mit Zeit, Name, Bank, Profil, Sprache', () => {
  const a = simple({ lastName: 'Alpha', firstName: 'Anna', profil: 'PK', sprache: 'DE', employerCanon: 'Testbank AG', we: { 3: [{ date: new Date(2026, 9, 1, 9, 0), location: 'Bern', planned: true }] } });
  const b = makePerson({ lastName: 'Beta', firstName: 'Ben', profil: 'IK', sprache: 'FR', employerCanon: 'Musterbank', we: { 1: [{ date: new Date(2026, 9, 1, 13, 30), location: 'Bern', planned: true }] }, oe: { 1: [{ date: new Date(2026, 10, 5, 8, 0), location: null, planned: true }] } });
  const t = plannedTables([a, b]);
  assertEqual(t.summary.columns.map((c) => c.label), ['Datum', 'Ort', 'Prüfungen', 'Anzahl']);
  assertEqual(t.summary.rows, [
    { datum: '01.10.2026', ort: 'Bern', pruefungen: 'WE1 RUN1, WE3 RUN1', anzahl: 2 },
    { datum: '05.11.2026', ort: 'unbekannt', pruefungen: 'OE1 RUN1', anzahl: 1 },
  ]);
  assertEqual(t.details.columns.map((c) => c.label), ['Datum', 'Zeit', 'Ort', 'Prüfung', 'Name', 'Bank', 'Profil', 'Sprache']);
  assertEqual(t.details.rows[0], { datum: '01.10.2026', zeit: '09:00', ort: 'Bern', pruefung: 'WE3 RUN1', name: 'Alpha Anna', bank: 'Testbank AG', profil: 'PK', sprache: 'DE' });
  assertEqual(t.details.rows[1].name, 'Beta Ben');
  assertEqual(t.details.rows[2], { datum: '05.11.2026', zeit: '08:00', ort: 'unbekannt', pruefung: 'OE1 RUN1', name: 'Beta Ben', bank: 'Musterbank', profil: 'IK', sprache: 'FR' });
  assertEqual(t.total, 3);
  assertEqual(plannedTables([]).total, 0);
});

test('tables.overviewModel: KPIs mit n und Kennzeichnung, Tabelle je Profil', () => {
  const m = overviewModel(cohort(), MODE.ERSTVERSUCH);
  const byLabel = Object.fromEntries(m.kpis.map((k) => [k.label, k]));
  assertEqual(byLabel['Personen'].value, '4');
  assertEqual(byLabel['Schriftlich Erstversuchsquote'], { label: 'Schriftlich Erstversuchsquote', value: '50.0 %', n: 4, small: true });
  assertEqual(byLabel['Schriftlich Gesamterfolgsquote'].value, '75.0 %');
  assertEqual(byLabel['Schriftlich Ø Performance'].value, '61.3 %');
  assertEqual(byLabel['Mündlich Bestehensquote'].value, '75.0 %');
  assertEqual(byLabel['Mündlich Ø Performance'].value, '77.5 %');
  assertEqual(byLabel['VSS / VSM'].value, '1 / 0');
  assertEqual(byLabel['Ausgestellte Zertifikate'].value, '0');
  assertEqual(m.byProfil.columns.map((c) => c.label), ['Profil', 'n', 'Schriftlich Erstversuch', 'Schriftlich gesamt', 'Mündlich bestanden']);
  assertEqual(m.byProfil.rows.map((r) => r.gruppe), ['PK *', 'IK *', 'unbekannt *']);
});
