// tests/versuche.test.js – Versuchslogik nach E11 (PROMPT-3, P7.2a).
// Entscheid 12.09.2026: «angetreten zu Versuch r» = für Run r liegt ein erfasstes Ergebnis vor (Passed-Wert).
// Ein Prüfungsdatum ohne Ergebnis bleibt Termin und zählt nie in einen Nenner.
import { test, assert, assertEqual, assertClose } from './runner.js';
import {
  DEFAULT_FILTER, SMALL_N, filterPersons,
  takenParts, attempted, passedThrough, appointmentsWithoutResult,
  failRatesByAttempt, attemptsUntilPass, languageBreakdown,
} from '../metrics.js';
import { makePerson, d } from './fixtures.js';

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

test('takenParts: Teil zählt, sobald ein Run ein Ergebnis trägt – ein blosses Datum genügt nicht', () => {
  const p = makePerson({
    we: { 1: [{ passed: true, date: '2024-03-01' }], 2: [{ date: '2024-03-01' }] },
  });
  assertEqual(takenParts(p, 'we').map((t) => t.part), [1]);
});

test('attempted: Versuch 2 ohne Ergebnis ist kein Antritt, auch mit Prüfungsdatum', () => {
  const p = makePerson({
    we: { 1: [{ passed: false, date: '2024-03-01' }, { date: '2024-06-01' }] },
  });
  assertEqual(attempted(p, 'we', 1), true);
  assertEqual(attempted(p, 'we', 2), false);
  assertEqual(appointmentsWithoutResult([p], 'we', 2), 1);
});

test('passedThrough: bestanden bis und mit Versuch r über alle absolvierten Teilprüfungen', () => {
  const p = makePerson({
    weAllPassed: true,
    we: {
      1: [{ passed: true, date: '2024-03-01' }],
      2: [{ passed: false, date: '2024-03-01' }, { passed: true, date: '2024-06-01' }],
      3: [{ passed: true, date: '2024-03-01' }],
    },
  });
  assertEqual(passedThrough(p, 'we', 1), false, 'WE2 ist nach Versuch 1 offen');
  assertEqual(passedThrough(p, 'we', 2), true);
});

test('passedThrough: ein erst im zweiten Versuch begonnener Teil lässt Versuch 1 scheitern', () => {
  // Kommt in der Datei vor: eine Teilprüfung ohne RUN1, erstmals in RUN2 absolviert. Der Vorgang war nach
  // Versuch 1 nicht vollständig bestanden – E11 misst auf Vorgangsebene, nicht je Teil.
  const p = makePerson({
    weAllPassed: true,
    we: { 1: [{ passed: true, date: '2024-03-01' }], 2: [null, { passed: true, date: '2024-06-01' }] },
  });
  assertEqual(takenParts(p, 'we').length, 2);
  assertEqual(attempted(p, 'we', 1), true);
  assertEqual(passedThrough(p, 'we', 1), false);
  assertEqual(passedThrough(p, 'we', 2), true);
});

// ---------------------------------------------------------------------------
// Durchfallquote je Versuch (E10.1 / E10.2)
// ---------------------------------------------------------------------------

test('failRatesByAttempt: kein Antritt zu Versuch 2 – n = 0, keine Division, keine Quote', () => {
  const p = makePerson({ weAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] } });
  const r = failRatesByAttempt([p], 'we');
  assertEqual(r[0].antritte, 1);
  assertEqual(r[0].durchgefallen, 0);
  assertEqual(r[0].quote.pct, 0);
  assertEqual(r[1].antritte, 0);
  assertEqual(r[1].durchgefallen, 0);
  assertEqual(r[1].quote.pct, null, 'ohne Antritt keine Quote');
  assert(!Number.isNaN(r[1].quote.pct), 'null statt NaN');
});

test('failRatesByAttempt: Termin ohne erfasstes Ergebnis zählt nicht als Antritt, wird aber ausgewiesen', () => {
  const angetreten = makePerson({ weAllPassed: true, we: { 1: [{ passed: false, date: '2024-03-01' }, { passed: true, date: '2024-06-01' }] } });
  const nurTermin = makePerson({ we: { 1: [{ passed: false, date: '2024-03-01' }, { date: '2024-06-01' }] } });
  const r = failRatesByAttempt([angetreten, nurTermin], 'we');
  assertEqual(r[1].antritte, 1, 'nur der Vorgang mit Ergebnis');
  assertEqual(r[1].durchgefallen, 0);
  assertEqual(r[1].termineOhneErgebnis, 1);
});

test('failRatesByAttempt: offener Vorgang nach Versuch 1 zählt als durchgefallen im Versuch 1', () => {
  const p = makePerson({ weAllPassed: null, we: { 1: [{ passed: false, date: '2024-03-01' }] } });
  const r = failRatesByAttempt([p], 'we');
  assertEqual(r[0].antritte, 1);
  assertEqual(r[0].durchgefallen, 1);
  assertEqual(r[0].quote.pct, 1);
  assertEqual(r[1].antritte, 0);
});

test('failRatesByAttempt: kleine Gruppen sind gekennzeichnet', () => {
  const wenige = Array.from({ length: SMALL_N - 1 }, () => makePerson({ weAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] } }));
  assertEqual(failRatesByAttempt(wenige, 'we')[0].small, true);
  const genug = wenige.concat(makePerson({ weAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] } }));
  assertEqual(failRatesByAttempt(genug, 'we')[0].small, false);
});

test('failRatesByAttempt: mündlich rechnet über alle absolvierten OE-Teile, nicht nur über OE1', () => {
  const p = makePerson({
    oeAllPassed: true,
    oe: { 1: [{ passed: true, date: '2024-06-01' }], 2: [{ passed: false, date: '2024-06-01' }, { passed: true, date: '2024-09-01' }] },
  });
  const r = failRatesByAttempt([p], 'oe');
  assertEqual(r[0].durchgefallen, 1, 'OE2 im ersten Versuch nicht bestanden');
  assertEqual(r[1].antritte, 1);
  assertEqual(r[1].durchgefallen, 0);
});

test('failRatesByAttempt: der Zeitfilter greift am Vorgang – Versuche über einen Jahreswechsel bleiben zusammen', () => {
  const p = makePerson({
    weAllPassed: true, oeAllPassed: true,
    we: { 1: [{ passed: false, date: '2024-11-12' }, { passed: true, date: '2025-02-03' }] },
    oe: { 1: [{ passed: true, date: '2025-02-03' }] },
  });
  const in2025 = filterPersons([p], { ...DEFAULT_FILTER, from: d('2025-01-01'), to: d('2025-12-31') });
  assertEqual(in2025.length, 1, 'Referenzdatum 2025 – der ganze Vorgang liegt in 2025');
  const r = failRatesByAttempt(in2025, 'we');
  assertEqual(r[0].antritte, 1, 'auch der Versuch von 2024 zählt mit');
  assertEqual(r[1].antritte, 1);
  const in2024 = filterPersons([p], { ...DEFAULT_FILTER, from: d('2024-01-01'), to: d('2024-12-31') });
  assertEqual(in2024.length, 0, 'der Vorgang liegt nicht in 2024');
});

// ---------------------------------------------------------------------------
// Ø Versuche bis Bestanden (E10.5)
// ---------------------------------------------------------------------------

test('attemptsUntilPass: Mittel der benötigten Run-Nummern über die absolvierten Teilprüfungen', () => {
  const p = makePerson({
    weAllPassed: true,
    we: {
      1: [{ passed: true, date: '2024-03-01' }],
      2: [{ passed: false, date: '2024-03-01' }, { passed: true, date: '2024-06-01' }],
      3: [{ passed: true, date: '2024-03-01' }],
    },
  });
  const r = attemptsUntilPass([p], 'we');
  assertClose(r.mean, (1 + 2 + 1) / 3, 1e-9);
  assertEqual(r.n, 1);
});

test('attemptsUntilPass: offene und nicht bestandene Vorgänge fliessen nicht ein und werden gezählt', () => {
  const bestanden = makePerson({ weAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] } });
  const offen = makePerson({ weAllPassed: null, we: { 1: [{ passed: false, date: '2024-03-01' }] } });
  const gescheitert = makePerson({ weAllPassed: false, we: { 1: [{ passed: false, date: '2024-03-01' }] } });
  const r = attemptsUntilPass([bestanden, offen, gescheitert], 'we');
  assertClose(r.mean, 1, 1e-9);
  assertEqual(r.n, 1);
  assertEqual(r.ausgeschlossen.offen, 1);
  assertEqual(r.ausgeschlossen.nichtBestanden, 1);
});

test('attemptsUntilPass: als bestanden erfasst, aber kein Teil trägt einen bestandenen Run – eigener Zähler', () => {
  const p = makePerson({ weAllPassed: true, we: { 1: [{ passed: false, date: '2024-03-01' }] } });
  const r = attemptsUntilPass([p], 'we');
  assertEqual(r.mean, null);
  assertEqual(r.n, 0);
  assertEqual(r.ausgeschlossen.ohneRunNummer, 1);
});

test('attemptsUntilPass: mündlich zählt die Run-Nummer des bestandenen OE-Runs', () => {
  const p = makePerson({ oeAllPassed: true, oe: { 1: [{ passed: false, date: '2024-06-01' }, { passed: false, date: '2024-09-01' }, { passed: true, date: '2024-12-01' }] } });
  const r = attemptsUntilPass([p], 'oe');
  assertClose(r.mean, 3, 1e-9);
  assertEqual(r.n, 1);
});

// ---------------------------------------------------------------------------
// Sprache (E10.6)
// ---------------------------------------------------------------------------

test('languageBreakdown: Verteilung und Durchfallquote im Erstversuch je Sprache, Zeilen folgen den Daten', () => {
  const de = (passed) => makePerson({ sprache: 'DE', weAllPassed: true, oeAllPassed: true, we: { 1: [{ passed, date: '2024-03-01' }, { passed: true, date: '2024-06-01' }] }, oe: { 1: [{ passed: true, date: '2024-06-01' }] } });
  const fr = () => makePerson({ sprache: 'FR', weAllPassed: true, oeAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] }, oe: { 1: [{ passed: true, date: '2024-06-01' }] } });
  const rows = languageBreakdown([de(false), de(true), de(true), fr(), fr()]);
  assertEqual(rows.map((r) => r.sprache), ['DE', 'FR'], 'nach Häufigkeit, keine feste Liste');
  assertEqual(rows[0].vorgaenge, 3);
  assertClose(rows[0].anteil.pct, 3 / 5, 1e-9);
  assertEqual(rows[0].we1.count, 1);
  assertEqual(rows[0].we1.n, 3);
  assertEqual(rows[1].we1.count, 0);
  assertEqual(rows[0].small, true, 'n = 3 liegt unter der Schwelle');
});

test('languageBreakdown: Vorgänge ohne Sprache bilden eine eigene Zeile statt zu verschwinden', () => {
  const ohne = makePerson({ sprache: null, weAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01' }] } });
  const rows = languageBreakdown([ohne]);
  assertEqual(rows.length, 1);
  assertEqual(rows[0].sprache, 'ohne Angabe');
  assertEqual(rows[0].vorgaenge, 1);
});
