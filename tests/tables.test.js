import { test, assert, assertEqual } from './runner.js';
import { MODE } from '../metrics.js';
import {
  groupLabel, passRateTable, performanceTable, partTable, oralRateTable, vssVsmTable,
  rankingTables, plannedTables, overviewModel, comparisonTable, multiProfileTable, excludedTables, openCasesTables, SMALL_MARK,
  awardDossierTable, rankReasonText, vorgangExportTables,
  timeSeriesTable, timeSeriesByProfileTable, timeSeriesChartSeries, yearComparisonTable, defaultCompareYears, difficultyTables,
} from '../views/tables.js';
import { makePerson, d } from './fixtures.js';

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
  assertEqual(t.columns.map((c) => c.label), ['Profil', 'n (Vorgänge)', 'Im 1. Versuch bestanden', 'Im 1. Versuch durchgefallen', 'Insgesamt bestanden', 'n (abgeschlossen)', 'Offen', 'Nicht erfasst']);
  assertEqual(t.rows.map((r) => r.gruppe), ['Gesamt *', 'PK *', 'IK *', 'unbekannt *']);
  assertEqual(t.rows[0].n, 4);
  assertEqual(t.rows[0].erstversuch, '50.0 %', 'A und D im ersten Versuch, B und C nicht');
  assertEqual(t.rows[0].durchgefallen, '50.0 %');
  assertEqual(t.rows[0].gesamt, '75.0 %');
  assertEqual(t.rows[1], { gruppe: 'PK *', n: 2, small: true, erstversuch: '50.0 %', durchgefallen: '50.0 %', gesamt: '100.0 %', abgeschlossen: 2, offen: 0, nichtErfasst: 0 });
  assertEqual(t.rows[2].gesamt, '0.0 %');
  assert(t.note.includes('n < 5') && t.note.includes('abgeschlossene Vorgänge'));
  const five = Array.from({ length: 5 }, () => simple({ profil: 'PK' }));
  assertEqual(passRateTable(five, 'profil').rows.map((r) => r.gruppe), ['Gesamt', 'PK'], 'keine Markierung ab n=5');
  assertEqual(passRateTable([], 'sprache').rows, [{ gruppe: 'Gesamt *', n: 0, small: true, erstversuch: '–', durchgefallen: '–', gesamt: '–', abgeschlossen: 0, offen: 0, nichtErfasst: 0 }]);
});

test('tables.passRateTable: offene und nicht erfasste Vorgänge stehen nicht im Nenner von «insgesamt bestanden» (E4)', () => {
  const ps = cohort().concat([simple({ profil: 'PK', weAllPassed: null, oeAllPassed: null }), simple({ profil: 'PK', weStatus: 'nicht erfasst' })]);
  const t = passRateTable(ps, 'profil');
  assertEqual([t.rows[0].n, t.rows[0].abgeschlossen, t.rows[0].offen, t.rows[0].nichtErfasst, t.rows[0].gesamt], [6, 4, 1, 1, '75.0 %']);
  assertEqual([t.rows[1].gruppe, t.rows[1].n, t.rows[1].abgeschlossen, t.rows[1].offen, t.rows[1].nichtErfasst, t.rows[1].gesamt], ['PK *', 4, 2, 1, 1, '100.0 %']);
});

test('tables.performanceTable: Ø Resultat beider Wertungen je Gruppe, je mit n', () => {
  const t = performanceTable(cohort(), 'sprache', 'written');
  assertEqual(t.columns.map((c) => c.label), ['Sprache', 'n (1. Versuch)', 'Ø Resultat 1. Versuch', 'n (bestanden)', 'Ø Resultat bestandener Run']);
  assertEqual(t.rows[0].gruppe, 'Gesamt *');
  // 1. Versuch: A 0.7, B 0.5, C 0.55, D 0.7 → 0.6125; bestanden: A 0.7, B 0.65, D 0.7 (C nicht alle Teile bestanden)
  assertEqual([t.rows[0].n, t.rows[0].mean1, t.rows[0].n2, t.rows[0].mean2], [4, '61.3 %', 3, '68.3 %']);
  assertEqual(t.rows.map((r) => r.gruppe), ['Gesamt *', 'DE *', 'FR *']);
  assertEqual(t.rows[2], { gruppe: 'FR *', n: 1, small: true, mean1: '50.0 %', n2: 1, mean2: '65.0 %' });
  const oral = performanceTable(cohort(), 'profil', 'oral');
  assertEqual([oral.rows[0].n, oral.rows[0].mean1, oral.rows[0].n2, oral.rows[0].mean2], [4, '77.5 %', 3, '90.0 %']);
});

test('tables.partTable: je Teilprüfung 1. Versuch bestanden/durchgefallen, insgesamt bestanden, Ø beider Wertungen', () => {
  const t = partTable(cohort(), 'we');
  assertEqual(t.columns.map((c) => c.label), ['Teilprüfung', 'n', 'Im 1. Versuch bestanden', 'Im 1. Versuch durchgefallen', 'Insgesamt bestanden', 'Ø Resultat 1. Versuch', 'Ø Resultat bestandener Run']);
  assertEqual(t.rows.length, 6);
  assertEqual(t.rows[0], { gruppe: 'WE1 *', n: 4, small: true, bestanden1: '75.0 %', durchgefallen1: '25.0 %', gesamt: '100.0 %', mean1: '70.0 %', mean2: '77.5 %' });
  assertEqual(t.rows[2], { gruppe: 'WE3 *', n: 0, small: true, bestanden1: '–', durchgefallen1: '–', gesamt: '–', mean1: '–', mean2: '–' });
  const oe = partTable(cohort(), 'oe');
  assertEqual(oe.rows.length, 2);
  assertEqual(oe.rows[0], { gruppe: 'OE1 *', n: 4, small: true, bestanden1: '75.0 %', durchgefallen1: '25.0 %', gesamt: '75.0 %', mean1: '77.5 %', mean2: '90.0 %' });
});

test('tables.oralRateTable: Nenner = Personen mit OE1 RUN1-Datum, bestanden, 1× und 2× durchgefallen', () => {
  const t = oralRateTable(cohort(), 'profil');
  assertEqual(t.columns.map((c) => c.label), ['Profil', 'n (abgeschlossen)', 'Bestanden', 'Nicht bestanden', 'Offen', 'Nicht erfasst', 'n (angetreten)', 'Im 1. Versuch durchgefallen', '2× durchgefallen']);
  assertEqual(t.rows[0], { gruppe: 'Gesamt *', n: 4, small: true, bestanden: '75.0 %', nichtBestanden: '25.0 %', offen: 0, nichtErfasst: 0, angetreten: 4, failed1: '25.0 %', failed2: '0.0 %' });
  assertEqual(t.rows[2].gruppe, 'IK *');
  assertEqual(t.rows[2].bestanden, '0.0 %');
  const withOpen = oralRateTable(cohort().concat([simple({ profil: 'PK', oeAllPassed: null, oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }] } })]), 'profil');
  assertEqual([withOpen.rows[0].n, withOpen.rows[0].offen, withOpen.rows[0].angetreten, withOpen.rows[0].failed1], [4, 1, 5, '40.0 %'], 'offener Vorgang: nicht im Nenner «bestanden», aber angetreten und 1× durchgefallen');
});

test('tables.vssVsmTable: VSS / VSM / ohne, je Profil, mit beiden Quoten', () => {
  const t = vssVsmTable(cohort());
  assertEqual(t.columns.map((c) => c.label), ['Gruppe', 'Profil', 'n (Vorgänge)', 'Schriftlich im 1. Versuch bestanden', 'Schriftlich insgesamt bestanden', 'Mündlich bestanden']);
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
  const r = rankingTables(persons, MODE.ERSTVERSUCH, 5, { dynamic: false });
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
  assertEqual(t.personen, 2, 'Menschen mit geplanten Terminen');
  assertEqual(plannedTables([]).total, 0);
});

test('tables.overviewModel: KPIs mit n und Kennzeichnung, Tabelle je Profil', () => {
  const m = overviewModel(cohort());
  const byLabel = Object.fromEntries(m.kpis.map((k) => [k.label, k]));
  assertEqual(byLabel['Vorgänge'].value, '4');
  assertEqual(byLabel['Personen'].value, '4', 'vier verschiedene Menschen');
  assertEqual([byLabel['Vorgänge offen'].value, byLabel['Vorgänge nicht erfasst'].value, byLabel['Personen mit mehreren Profilen'].value], ['0', '0', '0']);
  const k = byLabel['Schriftlich: im 1. Versuch bestanden'];
  assertEqual([k.value, k.n, k.small, k.count], ['50.0 %', 4, true, 2], 'Prozent und absolute Zahl');
  assert(typeof k.hint === 'string' && k.hint.length > 20, 'jede Kachel hat eine Beschreibung');
  assertEqual(byLabel['Schriftlich: im 1. Versuch durchgefallen'].count, 2);
  assertEqual(byLabel['Schriftlich: insgesamt bestanden'].count, 3);
  assertEqual(byLabel['Mündlich: bestanden'].count, 3);
  assertEqual(byLabel['Mündlich: im 1. Versuch durchgefallen'].count, 1);
  assertEqual(byLabel['Mündlich: 2× durchgefallen'].count, 0);
  assertEqual(byLabel['Schriftlich: Ø Resultat 1. Versuch'].count, null, 'Mittelwerte haben keine absolute Zahl');
  assertEqual(byLabel['Personen'].count, null);
  assert(m.kpis.every((x) => 'count' in x));
  assertEqual([k.kind, k.raw], ['ratio', 0.5], 'Art und Rohwert für Vergleiche');
  assertEqual(byLabel['Schriftlich: Ø Resultat 1. Versuch'].kind, 'mean');
  assertEqual(byLabel['Personen'].kind, 'count');
  assertEqual(byLabel['Personen'].raw, 4);
  assertEqual(byLabel['Vorgänge'].raw, 4);
  assert(m.kpis.every((x) => typeof x.hint === 'string' && x.hint.length > 0));
  assertEqual(byLabel['Schriftlich: im 1. Versuch durchgefallen'].value, '50.0 %');
  assertEqual(byLabel['Schriftlich: insgesamt bestanden'].value, '75.0 %');
  assertEqual(byLabel['Schriftlich: Ø Resultat 1. Versuch'].value, '61.3 %');
  assertEqual(byLabel['Schriftlich: Ø Resultat bestandener Run'].value, '68.3 %');
  assertEqual(byLabel['Mündlich: bestanden'].value, '75.0 %');
  assertEqual(byLabel['Mündlich: im 1. Versuch durchgefallen'].value, '25.0 %');
  assertEqual(byLabel['Mündlich: Ø Resultat 1. Versuch'].value, '77.5 %');
  assertEqual(byLabel['Mündlich: Ø Resultat bestandener Run'].value, '90.0 %');
  assertEqual(byLabel['VSS / VSM'].value, '1 / 0');
  assertEqual(byLabel['Ausgestellte Zertifikate'].value, '0');
  assertEqual(m.byProfil.columns.map((c) => c.label), ['Profil', 'n (Vorgänge)', 'Personen', 'Schriftlich im 1. Versuch bestanden', 'Schriftlich im 1. Versuch durchgefallen', 'Schriftlich insgesamt bestanden', 'Mündlich bestanden', 'Offen']);
  assertEqual(m.byProfil.rows.map((r) => r.gruppe), ['PK *', 'IK *', 'unbekannt *']);
  assertEqual(m.byProfil.rows.map((r) => [r.n, r.personen, r.offen]), [[2, 2, 0], [1, 1, 0], [1, 1, 0]]);
  assertEqual(m.multi.title, 'Personen mit mehreren Profilen');
  assertEqual(m.multi.rows, []);
});

test('tables.overviewModel / multiProfileTable: Personen vs Vorgänge, Profil-Abfolge auch über den Profil-Filter hinaus (E3)', () => {
  const ik = simple({ lastName: 'Zwei', firstName: 'Anna', profil: 'IK', we: { 1: [{ passed: true, date: '2023-03-01', result: 0.8 }] }, oe: { 1: [{ passed: true, date: '2023-12-07', result: 0.9 }] } });
  const cwma = simple({ lastName: 'Zwei', firstName: 'Anna', profil: 'CWMA', we: { 1: [{ passed: true, date: '2026-03-01', result: 0.8 }] }, oe: { 1: [{ passed: true, date: '2026-05-05', result: 0.9 }] } });
  const other = simple({ lastName: 'Eins', firstName: 'Ben', profil: 'IK' });
  const all = [ik, cwma, other];
  const m = overviewModel(all);
  const byLabel = Object.fromEntries(m.kpis.map((k) => [k.label, k]));
  assertEqual([byLabel['Vorgänge'].value, byLabel['Personen'].value, byLabel['Personen mit mehreren Profilen'].value], ['3', '2', '1']);
  assertEqual(m.multi.columns.map((c) => c.label), ['Profil-Abfolge', 'Personen', 'Vorgänge']);
  assertEqual(m.multi.rows, [{ sequence: 'IK → CWMA', personen: 1, vorgaenge: 2 }]);
  assertEqual(m.multi.total, 1);
  assertEqual(m.byProfil.rows.map((r) => [r.gruppe, r.n, r.personen]), [['IK *', 2, 2], ['CWMA *', 1, 1]]);
  // Profil-Filter IK: nur ik und other im Filter – die Abfolge der Person bleibt über allPersons sichtbar
  const filtered = overviewModel([ik, other], all);
  assertEqual(Object.fromEntries(filtered.kpis.map((k) => [k.label, k]))['Personen mit mehreren Profilen'].value, '1');
  assertEqual(multiProfileTable([ik, other], all).rows, [{ sequence: 'IK → CWMA', personen: 1, vorgaenge: 2 }]);
  assertEqual(multiProfileTable([other], all).rows, [], 'Person ohne Vorgang im Filter zählt nicht');
  assertEqual(multiProfileTable([ik, other]).rows, [], 'ohne allPersons nur der Filter');
});

test('tables.comparisonTable: Auswahl gegen Benchmark je Kennzahl, Differenz in Prozentpunkten', () => {
  const selection = overviewModel(cohort().filter((p) => p.employerCanon === 'Testbank AG'));
  const benchmark = overviewModel(cohort());
  const t = comparisonTable(selection.kpis, benchmark.kpis, 'Alle Banken');
  assertEqual(t.columns.map((c) => c.label), ['Kennzahl', 'Auswahl', 'n (Auswahl)', 'Benchmark: Alle Banken', 'n (Benchmark)', 'Differenz']);
  const byLabel = Object.fromEntries(t.rows.map((r) => [r.kennzahl, r]));
  // Testbank: A, B → im 1. Versuch bestanden A (50.0 %); alle: 50.0 % → Differenz 0
  assertEqual(byLabel['Schriftlich: im 1. Versuch bestanden'], { kennzahl: 'Schriftlich: im 1. Versuch bestanden', auswahl: '50.0 %', n: 2, benchmark: '50.0 %', n2: 4, differenz: '0.0 pp', small: true });
  // insgesamt bestanden: Testbank 100 % (A, B) vs alle 75 % → +25.0 pp
  assertEqual(byLabel['Schriftlich: insgesamt bestanden'].differenz, '+25.0 pp');
  // Ø Resultat 1. Versuch: Testbank (0.7+0.5)/2 = 0.6 vs alle 0.6125 → −1.3 pp
  assertEqual(byLabel['Schriftlich: Ø Resultat 1. Versuch'].differenz, '−1.3 pp');
  assertEqual(byLabel['Personen'].differenz, '', 'Zählungen ohne Differenz');
  assertEqual(byLabel['Personen'].auswahl, '2');
  assertEqual(t.rows.length, selection.kpis.length);
});

test('tables.comparisonTable: fehlender Wert → Strich statt Differenz', () => {
  const none = overviewModel([]);
  const all = overviewModel(cohort());
  const t = comparisonTable(none.kpis, all.kpis, 'Alle Banken');
  const row = t.rows.find((r) => r.kennzahl === 'Schriftlich: im 1. Versuch bestanden');
  assertEqual([row.auswahl, row.differenz], ['–', '–']);
});

test('tables.excludedTables: Gründe mit Anzahl, Zeilen mit Namen, Zeilen ohne Namen aus dem Log', () => {
  const persons = cohort().concat([
    makePerson({ lastName: 'Neu', firstName: 'Nora', profil: 'PK', sheetName: 'First Certification', row: 40 }),
    makePerson({ lastName: 'Plan', firstName: 'Paul', profil: 'IK', sheetName: 'First Certification', row: 41, we: { 1: [{ date: '2030-01-01', planned: true }] } }),
    simple({ lastName: 'Doppelt', firstName: 'Dora', sheetName: 'Ausgestellte Zertifikate', row: 12, duplicateOf: { sheet: 'First Certification', row: 12 } }),
  ]);
  const dq = [{ level: 'fehler', field: 'lastName', sheet: 'First Certification', row: 50, header: 'Last Name', raw: null, reason: 'Name fehlt' }];
  const t = excludedTables(persons, dq);
  assertEqual([t.total, t.rows, t.nameless, t.zeilen], [4, 3, 1, 8]);
  assertEqual(t.summary.columns.map((c) => c.label), ['Grund', 'Zeilen']);
  assertEqual(t.summary.rows, [
    { grund: 'Duplikat', anzahl: 1 },
    { grund: 'Kein Name (Zeile zählt nicht als Person)', anzahl: 1 },
    { grund: 'Noch keine Prüfung absolviert', anzahl: 1 },
    { grund: 'Noch keine Prüfung absolviert (nur geplante Termine)', anzahl: 1 },
  ]);
  assertEqual(t.details.columns.map((c) => c.label), ['Sheet', 'Zeile', 'Name', 'Profil', 'Bank', 'Grund', 'Status']);
  assertEqual(t.details.rows.map((r) => [r.name, r.row, r.status]), [['Doppelt Dora', 12, 'bestanden'], ['Neu Nora', 40, 'offen'], ['Plan Paul', 41, 'offen']]);
  assert(t.details.rows[0].grund.startsWith('Duplikat (zusammengeführt mit «First Certification» Zeile 12)'));
  assertEqual(excludedTables(cohort()).total, 0);
});

test('tables.openCasesTables: offene Vorgänge je Profil und Teilnehmende, ohne abgeschlossene Vorgänge', () => {
  const today = d('2026-09-05');
  const persons = cohort().concat([
    simple({ lastName: 'Offen', firstName: 'Olga', profil: 'PK', employerCanon: 'Testbank AG', oeAllPassed: null, oe: {} }),
    makePerson({ lastName: 'Neu', firstName: 'Nora', profil: 'IK', we: { 1: [{ date: '2026-10-01', location: 'Bern', planned: true }] } }),
  ]);
  const t = openCasesTables(persons, today);
  assertEqual([t.total, t.ohnePruefung, t.mitTermin], [2, 1, 1]);
  assertEqual(t.summary.columns.map((c) => c.label), ['Profil', 'Offen', 'davon schriftlich offen', 'davon mündlich offen', 'ohne Prüfung', 'mit geplantem Termin', 'kennzahlrelevant']);
  assertEqual(t.summary.rows, [
    { profil: 'IK', offen: 1, ohnePruefung: 1, schriftlich: 1, muendlich: 1, geplant: 1, kennzahlrelevant: 0 },
    { profil: 'PK', offen: 1, ohnePruefung: 0, schriftlich: 0, muendlich: 1, geplant: 0, kennzahlrelevant: 1 },
  ]);
  assertEqual(t.details.columns.map((c) => c.label), ['Name', 'Bank', 'Profil', 'Sprache', 'Offen', 'Letzte Prüfung', 'Tage seit letzter Prüfung', 'Nächster Termin', 'Versuche', 'Sheet', 'Zeile']);
  assertEqual(t.details.rows[0].name, 'Offen Olga');
  assertEqual([t.details.rows[0].offen, t.details.rows[0].letzte, t.details.rows[0].naechste, t.details.rows[0].versuche], ['mündlich', '01.03.2024', '', 2]);
  assertEqual([t.details.rows[1].name, t.details.rows[1].letzte, t.details.rows[1].tage, t.details.rows[1].naechste], ['Neu Nora', '', '', '01.10.2026']);
  assertEqual(openCasesTables(cohort(), today).total, 0);
});

test('tables.rankingTables: Mindestgruppengrösse und dynamisches k – kleine Gruppen ohne Liste, Hinweis statt Rangliste (Befund 4)', () => {
  const small = rankingTables(cohort(), MODE.ERSTVERSUCH, 5);
  assertEqual(small.award.map((t) => [t.profil, t.n, t.k, t.suppressed, t.rows.length]), [['PK', 2, 0, true, 0], ['IK', 1, 0, true, 0], ['unbekannt', 1, 0, true, 0]]);
  assertEqual(small.award[0].note, null, 'gesperrt: Grund steht im Leertext');
  assert(small.award[0].empty.includes('n = 2 < 5'), small.award[0].empty);
  const six = Array.from({ length: 6 }, (_, i) => simple({ lastName: 'P' + i, profil: 'PK', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.5 + i * 0.05 }] } }));
  const r = rankingTables(six, MODE.ERSTVERSUCH, 5);
  assertEqual([r.written[0].n, r.written[0].k, r.written[0].suppressed, r.written[0].rows.length], [6, 3, false, 3]);
  assertEqual(r.written[0].rows.map((x) => x.rang), [1, 2, 3]);
  assert(r.written[0].note.startsWith('Top 3 von 6 Vorgängen'), r.written[0].note);
});

test('tables.awardDossierTable / rankReasonText: Begründung je Rang, gesperrte Gruppen im Hinweis', () => {
  const persons = [
    simple({ lastName: 'Best', firstName: 'B', profil: 'PK', employerCanon: 'Testbank AG', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.9 }] }, oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] } }),
    simple({ lastName: 'TieEarly', firstName: 'E', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-05-01', result: 0.9 }] } }),
    simple({ lastName: 'TieLate', firstName: 'L', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-07-01', result: 0.9 }] } }),
    simple({ lastName: 'TieMore', firstName: 'M', profil: 'PK', oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }, { passed: true, date: '2024-07-01', result: 0.9 }] } }),
    simple({ lastName: 'Last', firstName: 'X', profil: 'PK', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.5 }] }, oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.5 }] } }),
    simple({ lastName: 'Small', firstName: 'S', profil: 'IK' }),
  ];
  const t = awardDossierTable(persons, MODE.BESTANDEN, 5, { dynamic: false });
  assertEqual(t.columns.map((c) => c.label), ['Profil', 'Rang', 'Name', 'Bank', 'Sprache', 'Award-Score', 'Schriftlich', 'Mündlich', 'Versuche', 'Referenzdatum', 'Sheet', 'Zeile', 'Begründung Rang']);
  assertEqual(t.rows.map((r) => [r.profil, r.rang, r.name]), [['PK', 1, 'Best B'], ['PK', 2, 'TieEarly E'], ['PK', 3, 'TieLate L'], ['PK', 4, 'TieMore M'], ['PK', 5, 'Last X'], ['IK', 1, 'Small S']]);
  assertEqual(t.rows[0].begruendung, 'Score höher als Rang 2 (80.0 %)');
  assertEqual(t.rows[1].begruendung, 'Gleicher Score und gleiche Versuche wie Rang 3 – Tie-Break 2: früheres Referenzdatum (01.05.2024 statt 01.07.2024)');
  assertEqual(t.rows[2].begruendung, 'Gleicher Score wie Rang 4 – Tie-Break 1: weniger Prüfungsversuche (3 statt 4)');
  assertEqual(t.rows[3].begruendung, 'Score höher als Rang 5 (50.0 %)');
  assertEqual(t.rows[4].begruendung, 'Letzter gewerteter Vorgang der Gruppe; kein weiterer Vorgang mit Wert');
  assert(t.note.includes('Bestanden (der bestandene Run zählt)') && t.note.includes('Tie-Break 1'), t.note);
  const dyn = awardDossierTable(persons, MODE.BESTANDEN, 5);
  assertEqual(dyn.rows.map((r) => [r.profil, r.rang]), [['PK', 1], ['PK', 2]], 'PK n = 5 → Top 2; IK n = 1 gesperrt');
  assert(dyn.note.includes('Ohne Liste (Gruppe zu klein): IK (n = 1)'), dyn.note);
  assertEqual(dyn.groups, [{ profil: 'PK', n: 5, k: 2, suppressed: false }, { profil: 'IK', n: 1, k: 0, suppressed: true }]);
  assertEqual(rankReasonText({ reason: { by: 'none', vsRank: 2, next: {} } }), 'Vollständiger Gleichstand mit Rang 2 (Score, Versuche, Referenzdatum) – Reihenfolge alphabetisch, fachlich unentschieden');
});

test('tables.vorgangExportTables: eine Zeile je Vorgang und je Run, mit Status, Quoten-Bausteinen und Zertifikat', () => {
  const p = simple({ lastName: 'Export', firstName: 'Eva', profil: 'PK', employerCanon: 'Testbank AG', employer: 'Testbank', vss: true, issued: true, certNumber: 'Z-9', certStart: d('2024-07-01'), duplicates: [{ sheet: 'First Certification', row: 12 }], personKeyLevel: 'full' });
  const q = makePerson({ lastName: 'Plan', firstName: 'P', we: { 1: [{ date: '2030-01-01', planned: true, location: 'Bern' }] } });
  const [cases, runs] = vorgangExportTables([p, q]);
  assertEqual(cases.title, 'Vorgänge');
  assertEqual(cases.rows.length, 2);
  const r = cases.rows[0];
  assertEqual([r.name, r.bank, r.employer, r.vss, r.vsm, r.status, r.weStatus, r.oeStatus, r.erstversuch], ['Export Eva', 'Testbank AG', 'Testbank', 'ja', 'nein', 'bestanden', 'bestanden', 'bestanden', 'ja']);
  assertEqual([r.wr1, r.wr2, r.or1, r.or2, r.versuche], ['70.0 %', '70.0 %', '90.0 %', '90.0 %', 3]);
  assertEqual([r.first, r.refDate, r.issued, r.certNumber, r.certStart, r.personKey, r.duplicates], ['01.03.2024', '01.06.2024', 'ja', 'Z-9', '01.07.2024', 'Name + Geburtsdatum', 'First Certification Zeile 12']);
  assertEqual([cases.rows[1].status, cases.rows[1].erstversuch, cases.rows[1].wr1, cases.rows[1].personKey], ['offen', '', '–', 'nur Name']);
  assertEqual(runs.title, 'Runs');
  assertEqual(runs.rows.map((x) => [x.name, x.teil, x.run, x.datum, x.passed, x.result, x.geplant, x.ort]), [
    ['Export Eva', 'WE1', 1, '01.03.2024', 'ja', '80.0 %', 'nein', ''],
    ['Export Eva', 'WE2', 1, '01.03.2024', 'ja', '60.0 %', 'nein', ''],
    ['Export Eva', 'OE1', 1, '01.06.2024', 'ja', '90.0 %', 'nein', ''],
    ['Plan P', 'WE1', 1, '01.01.2030', '', '–', 'ja', 'Bern'],
  ]);
  assertEqual(vorgangExportTables([])[0].rows, []);
});

function yearCohort() {
  return [
    simple({ lastName: 'A23', profil: 'PK', oe: { 1: [{ passed: true, date: '2023-06-01', result: 0.9 }] } }),
    simple({ lastName: 'B23', profil: 'PK', weAllPassed: false, we: { 1: [{ passed: false, date: '2023-03-01', result: 0.4 }] }, oeAllPassed: null, oe: {} }),
    simple({ lastName: 'C24', profil: 'IK', oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.8 }] } }),
    simple({ lastName: 'D25', profil: 'PK', we: { 1: [{ passed: true, date: '2025-03-01', result: 0.7 }] }, oe: { 1: [{ passed: true, date: '2025-06-01', result: 0.6 }] } }),
    simple({ lastName: 'E25', profil: 'PK', we: { 1: [{ passed: true, date: '2025-03-01', result: 0.7 }] }, oe: { 1: [{ passed: false, date: '2025-05-01', result: 0.4 }, { passed: true, date: '2025-06-01', result: 0.6 }] } }),
  ];
}

test('tables.timeSeriesTable / timeSeriesByProfileTable: Kennzahlen je Jahr des Referenzdatums', () => {
  const t = timeSeriesTable(yearCohort());
  assertEqual(t.columns.map((c) => c.label), ['Jahr', 'n (Vorgänge)', 'Personen', 'Schriftlich im 1. Versuch bestanden', 'Schriftlich insgesamt bestanden', 'Mündlich bestanden', 'Ø schriftlich 1. Versuch', 'Ø schriftlich bestandener Run', 'Ø mündlich 1. Versuch', 'Ø mündlich bestandener Run', 'Offen', 'Nicht erfasst']);
  assertEqual(t.rows.map((r) => [r.gruppe, r.n, r.gesamt, r.muendlich, r.offen]), [['2023 *', 2, '50.0 %', '100.0 %', 0], ['2024 *', 1, '100.0 %', '100.0 %', 0], ['2025 *', 2, '100.0 %', '100.0 %', 0]]);
  assertEqual([t.rows[2].wp1, t.rows[2].op1, t.rows[2].op2], ['70.0 %', '50.0 %', '60.0 %']);
  const byProfil = timeSeriesByProfileTable(yearCohort());
  assertEqual(byProfil.rows.map((r) => [r.profil, r.gruppe, r.n]), [['PK', '2023 *', 2], ['PK', '2025 *', 2], ['IK', '2024 *', 1]]);
  assertEqual(timeSeriesTable([]).rows, []);
});

test('tables.timeSeriesChartSeries: Reihen für das Liniendiagramm mit n und Kennzeichnung kleiner Jahre', () => {
  const c = timeSeriesChartSeries(yearCohort());
  assertEqual(c.quoten.map((s) => s.label), ['Schriftlich im 1. Versuch bestanden', 'Schriftlich insgesamt bestanden', 'Mündlich bestanden']);
  assertEqual(c.resultate.map((s) => s.label), ['Ø schriftlich 1. Versuch', 'Ø mündlich 1. Versuch']);
  assertEqual(c.quoten[1].points.map((p) => [p.x, p.y, p.n, p.small]), [['2023', 0.5, 2, true], ['2024', 1, 1, true], ['2025', 1, 2, true]]);
  assertEqual(c.quoten[0].points.length, 3);
  assertEqual(timeSeriesChartSeries([]).quoten[0].points, []);
});

test('tables.yearComparisonTable / defaultCompareYears: zwei Jahre nebeneinander, Differenz in Prozentpunkten', () => {
  const ps = yearCohort();
  assertEqual(defaultCompareYears(ps), { a: 2025, b: 2024 });
  assertEqual(defaultCompareYears([ps[0]]), { a: 2023, b: 2023 });
  assertEqual(defaultCompareYears([]), null);
  const t = yearComparisonTable(ps, 2025, 2023);
  assertEqual(t.title, 'Vergleich 2025 gegenüber 2023');
  assertEqual(t.columns.map((c) => c.label), ['Kennzahl', '2025', 'n 2025', 'Benchmark: 2023', 'n 2023', 'Differenz']);
  const byLabel = Object.fromEntries(t.rows.map((r) => [r.kennzahl, r]));
  assertEqual([byLabel['Vorgänge'].auswahl, byLabel['Vorgänge'].benchmark], ['2', '2']);
  assertEqual(byLabel['Schriftlich: insgesamt bestanden'].differenz, '+50.0 pp');
  assertEqual(byLabel['Mündlich: im 1. Versuch durchgefallen'].differenz, '+50.0 pp');
  assert(t.note.includes('2025 minus 2023'));
});

test('tables.difficultyTables: lange Tabelle und Pivot Teil × Jahr (Durchfallquote 1. Versuch)', () => {
  const { long, pivot } = difficultyTables(yearCohort());
  assertEqual(long.columns.map((c) => c.label), ['Jahr', 'Teilprüfung', 'n', 'Im 1. Versuch durchgefallen', 'Im 1. Versuch bestanden', 'Ø Resultat 1. Versuch', 'Ø Resultat bestandener Run']);
  assertEqual(long.rows[0], { jahr: 2023, teil: 'WE1 *', n: 1, small: true, durchgefallen: '100.0 %', bestanden: '0.0 %', mean1: '40.0 %', mean2: '–' });
  assertEqual(pivot.columns.map((c) => c.label), ['Teilprüfung', '2023', '2024', '2025']);
  assertEqual(pivot.rows.map((r) => r.teil), ['WE1', 'OE1', 'WE2']);
  assertEqual(pivot.rows[0], { teil: 'WE1', y2023: '100.0 % *', y2024: '0.0 % *', y2025: '0.0 % *' });
  assertEqual(pivot.rows[1].y2025, '50.0 % *');
  assertEqual(pivot.rows[2].y2023, '', 'leer = keine Erstversuche im Jahr');
  assertEqual(difficultyTables([]).pivot.rows, []);
});
