import { test, assert, assertEqual, assertClose } from './runner.js';
import {
  MODE, SMALL_N, DEFAULT_FILTER, ratio, mean, formatPct, eligible, filterPersons, hasRetry,
  partResult, writtenScore, oralScore, firstAttemptPassed,
  writtenPassRates, writtenPerformance, writtenPerformanceByPart,
  oralPassRates, oralPerformance, groupBy, byGroup, vssVsmBreakdown,
  awardScore, topWritten, topOral, awardRanking, overview, plannedRuns, plannedGroups, dayKey, partFirstAttempt,
} from '../metrics.js';
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

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

test('ratio: Zähler, Nenner, Quote, Kennzeichnung n<5', () => {
  assertEqual(SMALL_N, 5);
  const r = ratio(1, 3);
  assertEqual([r.count, r.n, r.small], [1, 3, true]);
  assertClose(r.pct, 1 / 3);
  assertEqual(ratio(0, 0), { count: 0, n: 0, pct: null, small: true });
  assertEqual(ratio(5, 5).small, false);
});

test('mean: ignoriert null, leer → null', () => {
  const m = mean([0.8, null, 0.9]);
  assertClose(m.mean, 0.85);
  assertEqual(m.n, 2);
  assertEqual(mean([]), { mean: null, n: 0 });
  assertEqual(mean([null, undefined]), { mean: null, n: 0 });
});

test('formatPct: 1 Dezimale, Schweizer Schreibweise, null → Strich', () => {
  assertEqual(formatPct(0.83333), '83.3 %');
  assertEqual(formatPct(1), '100.0 %');
  assertEqual(formatPct(0), '0.0 %');
  assertEqual(formatPct(0.12345), '12.3 %');
  assertEqual(formatPct(null), '–');
  assertEqual(formatPct(undefined), '–');
});

test('MODE und DEFAULT_FILTER', () => {
  assertEqual(MODE, { ERSTVERSUCH: 'erstversuch', BESTANDEN: 'bestanden' });
  assertEqual(DEFAULT_FILTER, { from: null, to: null, profil: [], sprache: [], bank: [], vssVsm: 'alle', versuche: 'alle', onlyIssued: false, mode: 'erstversuch' });
});

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

test('eligible/filterPersons: nur Personen mit ≥1 WE-RUN-Datum', () => {
  const withDate = simple();
  const noDate = makePerson({ we: { 1: [{ passed: true, result: 0.8 }] } });
  const nothing = makePerson();
  assertEqual(eligible([withDate, noDate, nothing]), [withDate]);
  assertEqual(filterPersons([withDate, noDate, nothing], DEFAULT_FILTER), [withDate]);
});

test('filterPersons: Profil, Sprache, Bank – leere Liste = alle', () => {
  const a = simple({ profil: 'PK', sprache: 'DE', employerCanon: 'Testbank AG' });
  const b = simple({ profil: 'IK', sprache: 'FR', employerCanon: 'Musterbank' });
  const c = simple({ profil: null, sprache: null, employerCanon: null });
  const all = [a, b, c];
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, profil: ['PK'] }), [a]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, profil: ['PK', 'IK'] }), [a, b]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, sprache: ['FR'] }), [b]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, bank: ['Musterbank'] }), [b]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, profil: [], sprache: [], bank: [] }), all);
});

test('filterPersons: VSS/VSM (alle | vss | vsm | ohne)', () => {
  const vss = simple({ vss: true });
  const vsm = simple({ vsm: true });
  const both = simple({ vss: true, vsm: true });
  const none = simple();
  const all = [vss, vsm, both, none];
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, vssVsm: 'alle' }), all);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, vssVsm: 'vss' }), [vss, both]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, vssVsm: 'vsm' }), [vsm, both]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, vssVsm: 'ohne' }), [none]);
});

test('filterPersons: Versuche (alle | erstversuch | mehrere)', () => {
  const single = simple(); // alle Teile im 1. Versuch
  const retryWritten = simple({ we: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }, { passed: true, date: '2024-04-01', result: 0.7 }] } });
  const retryOral = simple({ oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }, { passed: true, date: '2024-06-01', result: 0.8 }] } });
  const all = [single, retryWritten, retryOral];
  assertEqual(hasRetry(single), false);
  assertEqual(hasRetry(retryWritten), true);
  assertEqual(hasRetry(retryOral), true);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, versuche: 'alle' }), all);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, versuche: 'erstversuch' }), [single]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, versuche: 'mehrere' }), [retryWritten, retryOral]);
});

test('filterPersons: nur ausgestellte Zertifikate (source=issued)', () => {
  const first = simple({ source: 'first' });
  const issued = simple({ source: 'issued' });
  assertEqual(filterPersons([first, issued], { ...DEFAULT_FILTER, onlyIssued: true }), [issued]);
  assertEqual(filterPersons([first, issued], DEFAULT_FILTER), [first, issued]);
});

test('filterPersons: Zeitraum wirkt auf Referenzdatum (inklusive, Bis = Tagesende)', () => {
  const jan = simple({ oe: { 1: [{ passed: true, date: '2024-01-15', result: 0.9 }] } });
  const jun = simple({ oe: { 1: [{ passed: true, date: '2024-06-30', result: 0.9 }] } });
  const dec = simple({ oe: { 1: [{ passed: true, date: '2024-12-31', result: 0.9 }] } });
  const noRef = simple({ refDate: null, refDateSource: null });
  assertEqual(jan.refDate, d('2024-01-15'));
  const all = [jan, jun, dec, noRef];
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, from: d('2024-06-01'), to: d('2024-06-30') }), [jun]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, from: d('2024-01-15') }), [jan, jun, dec]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, to: d('2024-06-30') }), [jan, jun]);
  assertEqual(filterPersons(all, { ...DEFAULT_FILTER, from: d('2025-01-01') }), []);
  assertEqual(filterPersons(all, DEFAULT_FILTER), all, 'ohne Zeitraum auch Personen ohne Referenzdatum');
});

test('filterPersons: Fallback-Referenzdatum (letztes Prüfungsdatum) wird ebenfalls gefiltert', () => {
  const failedOral = makePerson({
    we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }] },
    oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }] },
  });
  assertEqual(failedOral.refDateSource, 'lastExam');
  assertEqual(filterPersons([failedOral], { ...DEFAULT_FILTER, from: d('2024-05-01'), to: d('2024-05-31') }), [failedOral]);
  assertEqual(filterPersons([failedOral], { ...DEFAULT_FILTER, from: d('2024-06-01') }), []);
});

// ---------------------------------------------------------------------------
// Versuchsmodus pro Person
// ---------------------------------------------------------------------------

test('partResult: ERSTVERSUCH = RUN1, BESTANDEN = bestandener Run', () => {
  const p = makePerson({ we: { 1: [{ passed: false, date: '2024-01-01', result: 0.5 }, { passed: true, date: '2024-02-01', result: 0.7 }] } });
  assertEqual(partResult(p.we[0], MODE.ERSTVERSUCH), 0.5);
  assertEqual(partResult(p.we[0], MODE.BESTANDEN), 0.7);
});

test('partResult: kein RUN1 bzw. kein bestandener Run → null', () => {
  const p = makePerson({ we: { 1: [{ passed: false, date: '2024-01-01', result: 0.5 }, { passed: false, date: '2024-02-01', result: 0.55 }] } });
  assertEqual(partResult(p.we[0], MODE.BESTANDEN), null, 'nie bestanden');
  assertEqual(partResult(p.we[1], MODE.ERSTVERSUCH), null, 'Teil nicht absolviert');
  assertEqual(partResult(p.we[1], MODE.BESTANDEN), null);
});

test('writtenScore/oralScore: Mittel über vorhandene Teilprüfungen gemäss Modus', () => {
  const p = makePerson({
    we: {
      1: [{ passed: false, date: '2024-01-01', result: 0.5 }, { passed: true, date: '2024-02-01', result: 0.7 }],
      2: [{ passed: true, date: '2024-01-01', result: 0.9 }],
    },
    oe: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }, { passed: true, date: '2024-04-01', result: 0.8 }] },
  });
  assertClose(writtenScore(p, MODE.ERSTVERSUCH), 0.7);
  assertClose(writtenScore(p, MODE.BESTANDEN), 0.8);
  assertClose(oralScore(p, MODE.ERSTVERSUCH), 0.4);
  assertClose(oralScore(p, MODE.BESTANDEN), 0.8);
  assertEqual(writtenScore(makePerson(), MODE.ERSTVERSUCH), null);
  assertEqual(oralScore(makePerson(), MODE.BESTANDEN), null);
});

test('writtenScore/oralScore BESTANDEN: nur wenn alle vorhandenen Teilprüfungen bestanden sind', () => {
  const partOpen = makePerson({ we: { 1: [{ passed: true, date: '2024-01-01', result: 0.9 }], 2: [{ passed: false, date: '2024-01-01', result: 0.3 }] } });
  assertEqual(writtenScore(partOpen, MODE.BESTANDEN), null, 'WE2 nicht bestanden');
  assertClose(writtenScore(partOpen, MODE.ERSTVERSUCH), 0.6, 'ERSTVERSUCH unverändert');
  const oralOpen = makePerson({ oe: { 1: [{ passed: true, date: '2024-01-01', result: 0.9 }], 2: [{ passed: false, date: '2024-02-01', result: 0.5 }] } });
  assertEqual(oralScore(oralOpen, MODE.BESTANDEN), null, 'OE2 nicht bestanden');
  const partial = makePerson({ we: { 1: [{ passed: true, date: '2024-01-01', result: 0.9 }] } });
  assertClose(writtenScore(partial, MODE.BESTANDEN), 0.9, 'nicht absolvierte Teile sind nicht erforderlich');
  const unknown = makePerson({ we: { 1: [{ passed: null, date: '2024-01-01', result: 0.9 }] } });
  assertEqual(writtenScore(unknown, MODE.BESTANDEN), null, 'Passed nicht interpretierbar gilt nicht als bestanden');
});

test('firstAttemptPassed: alle vorhandenen WE RUN1 bestanden', () => {
  assertEqual(firstAttemptPassed(simple()), true);
  const oneFailed = simple({ we: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }, { passed: true, date: '2024-04-01', result: 0.7 }], 2: [{ passed: true, date: '2024-03-01', result: 0.6 }] } });
  assertEqual(firstAttemptPassed(oneFailed), false);
  const unknown = simple({ we: { 1: [{ passed: null, date: '2024-03-01', result: 0.6 }] } });
  assertEqual(firstAttemptPassed(unknown), null, 'RUN1 ohne Passed-Wert ist nicht absolviert');
  assertEqual(firstAttemptPassed(makePerson()), null, 'ohne WE RUN1 keine Aussage');
});

// ---------------------------------------------------------------------------
// Schriftlich
// ---------------------------------------------------------------------------

function writtenCohort() {
  const a = simple({ profil: 'PK' }); // Erstversuch ok, gesamt ok
  const b = simple({ profil: 'PK', we: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }, { passed: true, date: '2024-04-01', result: 0.7 }], 2: [{ passed: true, date: '2024-03-01', result: 0.6 }] } }); // Erstversuch nein, gesamt ok
  const c = simple({ profil: 'IK', weAllPassed: false, we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }], 2: [{ passed: false, date: '2024-03-01', result: 0.3 }] } }); // beides nein
  return [a, b, c];
}

test('writtenPassRates: im 1. Versuch bestanden / durchgefallen UND insgesamt bestanden, je mit n', () => {
  const r = writtenPassRates(writtenCohort());
  assertEqual(r.erstversuch, ratio(1, 3));
  assertEqual(r.erstversuchFailed, ratio(2, 3), 'b und c mit mindestens einem WE RUN1 nicht bestanden');
  assertEqual(r.gesamt.count, 2);
  assertEqual(r.gesamt.n, 3);
  assertClose(r.gesamt.pct, 2 / 3);
  assertEqual(r.gesamt.small, true);
  assertEqual(writtenPassRates([]), { erstversuch: ratio(0, 0), erstversuchFailed: ratio(0, 0), gesamt: ratio(0, 0) });
});

test('writtenPassRates: Nenner Erstversuch = Personen mit absolviertem WE RUN1', () => {
  const onlyRun2 = makePerson({ weAllPassed: true, we: { 1: [null, { passed: true, date: '2024-02-01', result: 0.7 }] } });
  const r = writtenPassRates([simple(), onlyRun2]);
  assertEqual([r.erstversuch.n, r.erstversuchFailed.n, r.gesamt.n], [1, 1, 2]);
  assertEqual(r.gesamt.count, 2);
});

test('partFirstAttempt: je Teilprüfung n, 1. Versuch bestanden/durchgefallen, insgesamt bestanden, Ø beider Wertungen', () => {
  const parts = partFirstAttempt(writtenCohort(), 'we');
  assertEqual(parts.map((p) => p.label), ['WE1', 'WE2', 'WE3', 'WE4', 'WE5', 'WE6']);
  const we1 = parts[0];
  assertEqual([we1.part, we1.n], [1, 3]);
  assertEqual(we1.passed, ratio(2, 3));
  assertEqual(we1.failed, ratio(1, 3));
  assertEqual(we1.anyPassed, ratio(3, 3));
  assertClose(we1.meanFirst.mean, (0.8 + 0.4 + 0.8) / 3);
  assertEqual(we1.meanFirst.n, 3);
  assertClose(we1.meanPassed.mean, (0.8 + 0.7 + 0.8) / 3);
  const we2 = parts[1];
  assertEqual([we2.passed, we2.failed, we2.anyPassed], [ratio(2, 3), ratio(1, 3), ratio(2, 3)]);
  assertClose(we2.meanPassed.mean, 0.6);
  assertEqual(we2.meanPassed.n, 2);
  assertEqual(parts[2], { part: 3, label: 'WE3', n: 0, passed: ratio(0, 0), failed: ratio(0, 0), anyPassed: ratio(0, 0), meanFirst: { mean: null, n: 0 }, meanPassed: { mean: null, n: 0 } });
  const oe = partFirstAttempt([simple()], 'oe');
  assertEqual(oe.map((p) => p.label), ['OE1', 'OE2']);
  assertEqual(oe[0].passed, ratio(1, 1));
});

test('writtenPerformance: Ø über Personen gemäss Modus, n = Personen mit Wert', () => {
  const [a, b, c] = writtenCohort();
  // a: (0.8+0.6)/2 = 0.7 ; b erst: (0.4+0.6)/2 = 0.5, best: (0.7+0.6)/2 = 0.65 ; c erst: (0.8+0.3)/2 = 0.55, best: null (Teil 2 nie bestanden)
  const erst = writtenPerformance([a, b, c], MODE.ERSTVERSUCH);
  assertClose(erst.mean, (0.7 + 0.5 + 0.55) / 3);
  assertEqual(erst.n, 3);
  const best = writtenPerformance([a, b, c], MODE.BESTANDEN);
  assertClose(best.mean, (0.7 + 0.65) / 2);
  assertEqual(best.n, 2);
  assertEqual(writtenPerformance([makePerson()], MODE.BESTANDEN), { mean: null, n: 0 });
});

test('writtenPerformanceByPart: Ø pro Teilprüfung WE1–WE6', () => {
  const parts = writtenPerformanceByPart(writtenCohort(), MODE.ERSTVERSUCH);
  assertEqual(parts.map((p) => p.part), [1, 2, 3, 4, 5, 6]);
  assertClose(parts[0].mean, (0.8 + 0.4 + 0.8) / 3);
  assertEqual(parts[0].n, 3);
  assertClose(parts[1].mean, (0.6 + 0.6 + 0.3) / 3);
  assertEqual(parts[2], { part: 3, mean: null, n: 0 });
  const best = writtenPerformanceByPart(writtenCohort(), MODE.BESTANDEN);
  assertClose(best[0].mean, (0.8 + 0.7 + 0.8) / 3, 'pro Teilprüfung zählt der bestandene Run unabhängig von anderen Teilen');
  assertClose(best[1].mean, 0.6);
  assertEqual(best[1].n, 2);
});

// ---------------------------------------------------------------------------
// Mündlich
// ---------------------------------------------------------------------------

function oralCohort() {
  const ok = simple({ profil: 'PK' }); // bestanden RUN1
  const f1 = simple({ profil: 'PK', oeAllPassed: true, oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }, { passed: true, date: '2024-06-01', result: 0.75 }] } }); // 1× durchgefallen, dann bestanden
  const f2 = simple({ profil: 'IK', oeAllPassed: false, oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }, { passed: false, date: '2024-06-01', result: 0.45 }] } }); // 2× durchgefallen
  const none = simple({ profil: 'IK', oeAllPassed: null, oe: {} }); // noch keine mündliche Prüfung
  return { ok, f1, f2, none };
}

test('oralPassRates: Nenner = Personen mit OE1 RUN1-Datum; bestanden, 1× und 2× durchgefallen', () => {
  const { ok, f1, f2, none } = oralCohort();
  const r = oralPassRates([ok, f1, f2, none]);
  assertEqual(r.bestanden.n, 3);
  assertEqual(r.bestanden.count, 2);
  assertEqual(r.failed1, { count: 2, n: 3, pct: 2 / 3, small: true });
  assertEqual(r.failed2, { count: 1, n: 3, pct: 1 / 3, small: true });
  assertEqual(oralPassRates([none]).bestanden, ratio(0, 0));
});

test('oralPerformance: Result-% gemäss Modus', () => {
  const { ok, f1, f2 } = oralCohort();
  const erst = oralPerformance([ok, f1, f2], MODE.ERSTVERSUCH);
  assertClose(erst.mean, (0.9 + 0.4 + 0.4) / 3);
  assertEqual(erst.n, 3);
  const best = oralPerformance([ok, f1, f2], MODE.BESTANDEN);
  assertClose(best.mean, (0.9 + 0.75) / 2);
  assertEqual(best.n, 2);
});

// ---------------------------------------------------------------------------
// Gruppierung
// ---------------------------------------------------------------------------

test('groupBy: Profil in kanonischer Reihenfolge, Unbekannte alphabetisch, null zuletzt', () => {
  const persons = [simple({ profil: 'KMU' }), simple({ profil: null }), simple({ profil: 'PK' }), simple({ profil: 'XYZ' }), simple({ profil: 'PK' })];
  const groups = groupBy(persons, 'profil');
  assertEqual(groups.map((g) => g.key), ['PK', 'KMU', 'XYZ', null]);
  assertEqual(groups[0].persons.length, 2);
});

test('groupBy: Sprache und Bank alphabetisch', () => {
  const persons = [simple({ sprache: 'FR', employerCanon: 'Zebra Bank' }), simple({ sprache: 'DE', employerCanon: 'Alpha Bank' })];
  assertEqual(groupBy(persons, 'sprache').map((g) => g.key), ['DE', 'FR']);
  assertEqual(groupBy(persons, 'employerCanon').map((g) => g.key), ['Alpha Bank', 'Zebra Bank']);
});

test('byGroup: wendet Kennzahl je Gruppe an, mit n und Kennzeichnung n<5', () => {
  const rows = byGroup(writtenCohort(), 'profil', (ps) => writtenPassRates(ps));
  assertEqual(rows.map((r) => [r.key, r.n, r.small]), [['PK', 2, true], ['IK', 1, true]]);
  assertEqual(rows[0].value.gesamt.count, 2);
  assertEqual(rows[1].value.gesamt.count, 0);
});

test('vssVsmBreakdown: Gruppen vss / vsm / ohne (beides möglich), je Profil', () => {
  const vss = simple({ vss: true, profil: 'PK' });
  const vsm = simple({ vsm: true, profil: 'IK' });
  const both = simple({ vss: true, vsm: true, profil: 'PK' });
  const none = simple({ profil: 'PK', weAllPassed: false });
  const b = vssVsmBreakdown([vss, vsm, both, none]);
  assertEqual(b.vss.n, 2);
  assertEqual(b.vsm.n, 2);
  assertEqual(b.ohne.n, 1);
  assertEqual(b.vss.written.gesamt, ratio(2, 2));
  assertEqual(b.ohne.written.gesamt, ratio(0, 1));
  assertEqual(b.vss.oral.bestanden, ratio(2, 2));
  assertEqual(b.vss.byProfil.map((g) => [g.key, g.n]), [['PK', 2]]);
  assertEqual(b.vsm.byProfil.map((g) => [g.key, g.n]), [['PK', 1], ['IK', 1]]);
  assertEqual(b.vsm.byProfil[1].value.written.erstversuch, ratio(1, 1));
});

// ---------------------------------------------------------------------------
// Bestenlisten / Award
// ---------------------------------------------------------------------------

test('awardScore: 0.5·schriftlich + 0.5·mündlich, nur mit bestandener OE', () => {
  const p = simple(); // schriftlich 0.7, mündlich 0.9
  assertClose(awardScore(p, MODE.ERSTVERSUCH), 0.8);
  assertEqual(awardScore(simple({ oeAllPassed: false }), MODE.ERSTVERSUCH), null);
  assertEqual(awardScore(simple({ oeAllPassed: null }), MODE.ERSTVERSUCH), null);
  assertEqual(awardScore(simple({ oe: {} , oeAllPassed: true }), MODE.ERSTVERSUCH), null, 'ohne mündlichen Wert kein Score');
});

test('awardRanking: pro Profil Top 5, Tie-Break Versuche, dann früheres Referenzdatum', () => {
  const best = simple({ lastName: 'Best', profil: 'PK', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.9 }] }, oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] } }); // 0.9
  const tieLate = simple({ lastName: 'TieLate', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-07-01', result: 0.9 }] } }); // 0.8, 3 Versuche, Ref Juli
  const tieEarly = simple({ lastName: 'TieEarly', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-05-01', result: 0.9 }] } }); // 0.8, 3 Versuche, Ref Mai
  const tieMore = simple({ lastName: 'TieMore', profil: 'PK', we: { 1: [{ passed: false, date: '2024-02-01', result: 0.5 }, { passed: true, date: '2024-03-01', result: 0.8 }], 2: [{ passed: true, date: '2024-03-01', result: 0.6 }] }, oe: { 1: [{ passed: true, date: '2024-04-01', result: 0.9 }] } }); // BESTANDEN: 0.8, 4 Versuche
  const other = simple({ lastName: 'Other', profil: 'IK' });
  const failed = simple({ lastName: 'Failed', profil: 'PK', oeAllPassed: false });
  const groups = awardRanking([tieLate, other, failed, tieMore, tieEarly, best], MODE.BESTANDEN);
  assertEqual(groups.map((g) => g.profil), ['PK', 'IK']);
  const pk = groups[0].entries;
  assertEqual(pk.map((e) => e.person.lastName), ['Best', 'TieEarly', 'TieLate', 'TieMore']);
  assertEqual(pk.map((e) => e.rank), [1, 2, 3, 4]);
  assertClose(pk[0].score, 0.9);
  assertClose(pk[1].score, 0.8);
  assertEqual(pk[1].attempts, 3);
  assertEqual(pk[3].attempts, 4);
  assertClose(pk[0].written, 0.9);
  assertClose(pk[0].oral, 0.9);
  assertEqual(groups[1].entries.map((e) => e.person.lastName), ['Other']);
});

test('awardRanking: begrenzt auf k Einträge', () => {
  const persons = Array.from({ length: 7 }, (_, i) => simple({ profil: 'PK', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.5 + i * 0.05 }] } }));
  const [pk] = awardRanking(persons, MODE.ERSTVERSUCH, 5);
  assertEqual(pk.entries.length, 5);
  assertClose(pk.entries[0].score, (0.8 + 0.9) / 2);
  assertEqual(awardRanking(persons, MODE.ERSTVERSUCH, 2)[0].entries.length, 2);
});

test('topWritten / topOral: beste Werte je Profil gemäss Modus', () => {
  const strong = simple({ lastName: 'Strong', profil: 'PK', we: { 1: [{ passed: true, date: '2024-03-01', result: 0.95 }] } });
  const weak = simple({ lastName: 'Weak', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.6 }] } });
  const noWritten = makePerson({ profil: 'PK', we: { 1: [{ passed: null, date: '2024-03-01' }] } });
  const w = topWritten([weak, strong, noWritten], MODE.ERSTVERSUCH);
  assertEqual(w[0].profil, 'PK');
  assertEqual(w[0].entries.map((e) => e.person.lastName), ['Strong', 'Weak']);
  assertClose(w[0].entries[0].score, 0.95);
  const o = topOral([weak, strong], MODE.ERSTVERSUCH);
  assertEqual(o[0].entries.map((e) => e.person.lastName), ['Strong', 'Weak']);
  assertClose(o[0].entries[1].score, 0.6);
});

test('topWritten: Tie-Break weniger Versuche, dann früheres Referenzdatum', () => {
  const fewer = simple({ lastName: 'Fewer', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] } });
  const more = simple({ lastName: 'More', profil: 'PK', oe: { 1: [{ passed: false, date: '2024-05-01', result: 0.4 }, { passed: true, date: '2024-06-01', result: 0.9 }] } });
  const earlier = simple({ lastName: 'Earlier', profil: 'PK', oe: { 1: [{ passed: true, date: '2024-01-01', result: 0.9 }] } });
  const [pk] = topWritten([more, fewer, earlier], MODE.ERSTVERSUCH);
  assertEqual(pk.entries.map((e) => e.person.lastName), ['Earlier', 'Fewer', 'More']);
});

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

test('overview: KPIs gesamt für aktiven Filter', () => {
  const persons = [simple({ vss: true }), simple({ vsm: true, source: 'issued' }), simple({ weAllPassed: false, oeAllPassed: false, oe: { 1: [{ passed: false, date: '2024-06-01', result: 0.3 }] } })];
  const o = overview(persons, MODE.ERSTVERSUCH);
  assertEqual(o.n, 3);
  assertEqual(o.small, true);
  assertEqual(o.written.gesamt, ratio(2, 3));
  assertEqual(o.written.erstversuch, ratio(3, 3));
  assertEqual(o.oral.bestanden, ratio(2, 3));
  assertEqual(o.oral.failed1, ratio(1, 3));
  assertClose(o.writtenPerf.mean, 0.7);
  assertClose(o.oralPerf.mean, (0.9 + 0.9 + 0.3) / 3);
  assertEqual([o.vss, o.vsm, o.issued], [1, 1, 1]);
  assertEqual(o.byProfil.map((g) => [g.key, g.n]), [['PK', 3]]);
});

// ---------------------------------------------------------------------------
// Geplante Prüfungen
// ---------------------------------------------------------------------------

function plannedCohort() {
  const a = makePerson({ lastName: 'Alpha', profil: 'PK', employerCanon: 'Testbank AG', we: { 1: [{ passed: true, date: '2026-03-01', result: 0.8 }], 2: [{ date: '2026-10-01', location: 'Bern', planned: true }] }, oe: { 1: [{ date: '2026-11-05', location: 'Zürich', planned: true }] } });
  const b = makePerson({ lastName: 'Beta', profil: 'IK', employerCanon: 'Musterbank', we: { 1: [{ date: '2026-10-01', location: 'Bern', planned: true }] } });
  const c = makePerson({ lastName: 'Gamma', profil: 'PK', we: { 1: [{ passed: true, date: '2026-03-01', result: 0.7 }] } });
  return { a, b, c };
}

test('dayKey: lokales Datum als YYYY-MM-DD', () => {
  assertEqual(dayKey(new Date(2026, 9, 1, 9, 30)), '2026-10-01');
  assertEqual(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('plannedRuns: alle geplanten Runs mit Person, Prüfung, Datum und Ort, sortiert nach Datum', () => {
  const { a, b, c } = plannedCohort();
  const runs = plannedRuns([c, a, b]);
  assertEqual(runs.length, 3);
  assertEqual(runs.map((r) => [r.person.lastName, r.kind, r.part, r.run, r.location]), [['Alpha', 'we', 2, 1, 'Bern'], ['Beta', 'we', 1, 1, 'Bern'], ['Alpha', 'oe', 1, 1, 'Zürich']]);
  assertEqual(runs[0].date, d('2026-10-01'));
  assertEqual(runs[0].label, 'WE2 RUN1');
  assertEqual(runs[2].label, 'OE1 RUN1');
  assertEqual(plannedRuns([c]), []);
});

test('plannedGroups: gruppiert nach Tag und Ort mit Anzahl und Einträgen', () => {
  const { a, b, c } = plannedCohort();
  const groups = plannedGroups(plannedRuns([a, b, c]));
  assertEqual(groups.map((g) => [g.dayKey, g.location, g.count]), [['2026-10-01', 'Bern', 2], ['2026-11-05', 'Zürich', 1]]);
  assertEqual(groups[0].day, d('2026-10-01'));
  assertEqual(groups[0].entries.map((e) => e.person.lastName), ['Alpha', 'Beta']);
  assertEqual(groups[0].exams, ['WE1 RUN1', 'WE2 RUN1']);
  const noLocation = plannedGroups(plannedRuns([makePerson({ we: { 1: [{ date: '2026-10-02', planned: true }] } })]));
  assertEqual(noLocation[0].location, null);
});

test('filterPersons: Optionen eligibleOnly und period für die Planungsansicht', () => {
  const { a, b, c } = plannedCohort();
  assertEqual(filterPersons([a, b, c], DEFAULT_FILTER).map((p) => p.lastName), ['Alpha', 'Gamma'], 'Standard: nur Personen mit absolviertem WE-Run');
  assertEqual(filterPersons([a, b, c], DEFAULT_FILTER, { eligibleOnly: false }).map((p) => p.lastName), ['Alpha', 'Beta', 'Gamma']);
  const period = { ...DEFAULT_FILTER, from: d('2030-01-01') };
  assertEqual(filterPersons([a, b, c], period, { eligibleOnly: false }), [], 'Zeitraum wirkt');
  assertEqual(filterPersons([a, b, c], period, { eligibleOnly: false, period: false }).length, 3, 'Zeitraum ignoriert');
  assertEqual(filterPersons([a, b, c], { ...DEFAULT_FILTER, profil: ['IK'] }, { eligibleOnly: false }).map((p) => p.lastName), ['Beta'], 'übrige Filter gelten weiterhin');
});

test('oralPassRates: geplante oder ausstehende OE1 RUN1 (Datum ohne Passed) zählen nicht im Nenner', () => {
  const done = simple();
  const plannedOe = simple({ oeAllPassed: null, oe: { 1: [{ date: '2026-11-05', planned: true }] } });
  const pending = simple({ oeAllPassed: null, oe: { 1: [{ date: '2024-06-01' }] } });
  const undated = simple({ oe: { 1: [{ passed: true, result: 0.9 }] } });
  const r = oralPassRates([done, plannedOe, pending, undated]);
  assertEqual(r.bestanden.n, 1, 'nur absolvierte, datierte OE1 RUN1');
  assertEqual(r.bestanden.count, 1);
});
