import { test, assert, assertEqual } from './runner.js';
import {
  SNAPSHOT_FORMAT, SNAPSHOT_VERSION, SNAPSHOT_KPIS, SNAPSHOT_COUNTS, SnapshotFormatError,
  kennzahlenOf, buildSnapshot, snapshotFileName, snapshotJson, parseSnapshot, sortSnapshots, compareKennzahlen, compareZaehler, compareByGroup,
} from '../snapshot.js';
import { overviewModel } from '../views/tables.js';
import { makePerson, d } from './fixtures.js';

// Kurzform: PK, WE1 bestanden, OE1 bestanden, Referenzdatum 2024
function simple(overrides = {}) {
  return makePerson({
    weAllPassed: true, oeAllPassed: true,
    we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }] },
    oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] },
    ...overrides,
  });
}

function cohort() {
  return [
    simple({ lastName: 'Alpha', firstName: 'Anna', personKey: 'alpha|anna|1990-01-01', profil: 'PK' }),
    simple({ lastName: 'Beta', firstName: 'Ben', personKey: 'beta|ben|1991-01-01', profil: 'PK', weAllPassed: false, we: { 1: [{ passed: false, date: '2024-03-01', result: 0.4 }] }, oeAllPassed: null, oe: {} }),
    simple({ lastName: 'Gamma', firstName: 'Gia', personKey: 'gamma|gia|1992-01-01', profil: 'IK', we: { 1: [{ passed: true, date: '2025-03-01', result: 0.7 }] }, oe: { 1: [{ passed: true, date: '2025-06-01', result: 0.85 }] }, issued: true }),
    simple({ lastName: 'Alpha', firstName: 'Anna', personKey: 'alpha|anna|1990-01-01', profil: 'IK', weAllPassed: null, oeAllPassed: null, we: { 1: [{ passed: true, date: '2026-03-01', result: 0.9 }] }, oe: {} }),
    makePerson({ lastName: 'Zeta', firstName: 'Zoe', personKey: 'zeta|zoe|1993-01-01', profil: 'PK' }), // nicht kennzahlrelevant (kein WE-Run)
  ];
}

const META = { fileName: 'Test.xlsx', lastModified: new Date(2026, 8, 1, 10, 0), counts: { zeilen: 5, vorgaenge: 5, personen: 4, duplikate: 0, bestanden: 2, nichtBestanden: 1, offen: 2, passiv: 0, nichtErfasst: 0, vollstaendigOhneGesamtergebnis: 0, teileAusserhalbVorgabe: 0, fehler: 1, hinweise: 2, nichtAusgewertet: 0 } };
const TODAY = new Date(2026, 8, 5, 14, 30);

test('snapshot.kennzahlenOf: Katalog vollständig, Werte wie die Übersicht (Anteile 0..1 mit count und n, Zählungen mit n)', () => {
  const k = kennzahlenOf(cohort().filter((p) => p.we[0] && p.we[0].runs.some((r) => r.taken)));
  assertEqual(Object.keys(k).sort(), SNAPSHOT_KPIS.map((x) => x.key).sort());
  assertEqual([k.vorgaenge.value, k.personen.value, k.offen.value, k.zertifikate.value, k.mehrereProfile.value], [4, 3, 1, 1, 1]);
  assertEqual(k.weGesamt, { value: 2 / 3, count: 2, n: 3 }, 'schriftlich insgesamt bestanden: 2 von 3 abgeschlossenen');
  assertEqual(k.oeBestanden, { value: 1, count: 2, n: 2 });
  assertEqual([k.wePerf1.n, typeof k.wePerf1.value], [4, 'number']);
  assertEqual(k.mehrereProfile.n, 3, 'Bezugsmenge Personen');
});

test('snapshot.SNAPSHOT_KPIS: Beschriftungen identisch mit den Kacheln der Übersicht', () => {
  const labels = new Set(overviewModel(cohort().slice(0, 4)).kpis.map((k) => k.label));
  for (const k of SNAPSHOT_KPIS) assert(labels.has(k.label), 'Kachel fehlt: ' + k.label);
});

test('snapshot.buildSnapshot: Format, Stichtag, Quelle, Zähler, Kennzahlen gesamt / je Profil / je Jahr – nur Aggregate, keine Namen', () => {
  const s = buildSnapshot({ persons: cohort(), meta: META, today: TODAY });
  assertEqual([s.format, s.version, s.stichtag], [SNAPSHOT_FORMAT, 1, '2026-09-05']);
  assertEqual(s.erstellt, TODAY.toISOString());
  assertEqual(s.quelle, { dateiname: 'Test.xlsx', geaendert: new Date(2026, 8, 1, 10, 0).toISOString() });
  assertEqual(Object.keys(s.zaehler), SNAPSHOT_COUNTS.map((c) => c.key));
  assertEqual([s.zaehler.zeilen, s.zaehler.fehler, s.zaehler.hinweise], [5, 1, 2]);
  assertEqual(s.kennzahlen.vorgaenge.value, 4, 'kennzahlrelevante Vorgänge ohne Filter (Zeile ohne WE-Run fehlt)');
  assertEqual(s.jeProfil.map((g) => [g.profil, g.kennzahlen.vorgaenge.value, g.kennzahlen.weGesamt.value]), [['PK', 2, 0.5], ['IK', 2, 1]]);
  assertEqual(s.jeJahr.map((g) => [g.jahr, g.kennzahlen.vorgaenge.value]), [[2024, 2], [2025, 1], [2026, 1]]);
  const json = snapshotJson(s);
  for (const name of ['Alpha', 'Anna', 'Beta', 'Ben', 'Gamma', 'Gia', 'Zeta', 'Zoe', 'alpha|anna']) assert(!json.includes(name), 'Personendaten im Snapshot: ' + name);
  assert(!/lastName|firstName|personKey|birthDate|employer/.test(json), 'keine Personenfelder');
  assertEqual(snapshotFileName(s), 'cockpit-snapshot-2026-09-05.json');
  const leer = buildSnapshot({ persons: [], meta: null, today: TODAY });
  assertEqual([leer.kennzahlen.vorgaenge.value, leer.kennzahlen.weGesamt.value, leer.zaehler.zeilen, leer.quelle.dateiname, leer.jeProfil, leer.jeJahr], [0, null, null, null, [], []]);
});

test('snapshot.parseSnapshot: Hin- und Rückweg über JSON, nur bekannte Felder (Whitelist), Dateiname wird gemerkt', () => {
  const s = buildSnapshot({ persons: cohort(), meta: META, today: TODAY });
  const raw = JSON.parse(snapshotJson(s));
  raw.namen = ['darf nicht durch'];
  raw.kennzahlen.weGesamt.kommentar = 'weg';
  raw.jeProfil[0].zeilen = [{ lastName: 'X' }];
  const p = parseSnapshot(JSON.stringify(raw), 'cockpit-snapshot-2026-09-05.json');
  assertEqual(p.stichtag, s.stichtag);
  assertEqual(p.kennzahlen, s.kennzahlen);
  assertEqual(p.zaehler, s.zaehler);
  assertEqual(p.jeProfil, s.jeProfil);
  assertEqual(p.jeJahr, s.jeJahr);
  assertEqual(p.quelle, s.quelle);
  assertEqual(p.datei, 'cockpit-snapshot-2026-09-05.json');
  assertEqual(Object.keys(p).sort(), ['datei', 'erstellt', 'format', 'jeJahr', 'jeProfil', 'kennzahlen', 'quelle', 'stichtag', 'version', 'zaehler']);
  assert(!JSON.stringify(p).includes('darf nicht durch') && !JSON.stringify(p).includes('kommentar') && !JSON.stringify(p).includes('lastName'), 'unbekannte Felder verworfen');
  // fehlende Kennzahl → leerer Wert statt Absturz
  delete raw.kennzahlen.oePerf2;
  assertEqual(parseSnapshot(JSON.stringify(raw)).kennzahlen.oePerf2, { value: null, count: null, n: 0 });
});

test('snapshot.parseSnapshot: verständliche Fehler bei ungültigem JSON, fremdem Format, falscher Version, fehlendem Stichtag', () => {
  const expectError = (text, re) => {
    let err = null;
    try { parseSnapshot(text, 'x.json'); } catch (e) { err = e; }
    assert(err instanceof SnapshotFormatError && re.test(err.message), 'erwartet ' + re + ', erhalten ' + (err && err.message));
  };
  expectError('{', /x\.json: kein gültiges JSON/);
  expectError('[]', /kein Cockpit-Snapshot/);
  expectError(JSON.stringify({ format: 'anders', version: 1 }), /kein Cockpit-Snapshot/);
  expectError(JSON.stringify({ format: SNAPSHOT_FORMAT, version: 99, stichtag: '2026-01-01', kennzahlen: {} }), /Version 99 wird nicht unterstützt/);
  expectError(JSON.stringify({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, stichtag: '1.1.2026', kennzahlen: {} }), /Stichtag/);
  expectError(JSON.stringify({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, stichtag: '2026-01-01' }), /Kennzahlen fehlen/);
});

test('snapshot.compare*: chronologisch sortiert, Differenz heute gegenüber dem jüngsten Snapshot (Anteile in pp, Zählungen absolut)', () => {
  const alt = buildSnapshot({ persons: cohort().slice(0, 2), meta: { counts: { zeilen: 2, fehler: 3 } }, today: new Date(2026, 0, 31) });   // 2 PK: 1 bestanden, 1 nicht → 50 %
  const mitte = buildSnapshot({ persons: cohort().slice(0, 3), meta: { counts: { zeilen: 3, fehler: 2 } }, today: new Date(2026, 4, 31) }); // + IK bestanden → 66.7 %
  const heute = buildSnapshot({ persons: cohort(), meta: META, today: TODAY });                                                             // + IK offen → 66.7 % (offen nicht im Nenner)
  assertEqual(sortSnapshots([mitte, alt]).map((s) => s.stichtag), ['2026-01-31', '2026-05-31']);
  const rows = compareKennzahlen([mitte, alt], heute);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assertEqual(byKey.vorgaenge.cells.map((c) => c.value), [2, 3], 'Zellen in chronologischer Reihenfolge');
  assertEqual([byKey.vorgaenge.current.value, byKey.vorgaenge.delta], [4, 1]);
  assertEqual(byKey.weGesamt.cells.map((c) => Math.round(c.value * 1000) / 1000), [0.5, 0.667]);
  assertEqual(Math.round(byKey.weGesamt.delta * 10) / 10, 0, 'Differenz in Prozentpunkten: 66.7 → 66.7');
  assertEqual(byKey.offen.delta, 1);
  assertEqual(compareKennzahlen([], heute).map((r) => r.cells.length).every((n) => n === 0), true, 'ohne Snapshots keine Zellen');
  assertEqual(compareKennzahlen([], heute).find((r) => r.key === 'weGesamt').delta, null, 'ohne Snapshot keine Differenz');
  const z = Object.fromEntries(compareZaehler([mitte, alt], heute).map((r) => [r.key, r]));
  assertEqual([z.zeilen.cells, z.zeilen.current, z.zeilen.delta], [[2, 3], 5, 2]);
  assertEqual([z.fehler.cells, z.fehler.current, z.fehler.delta], [[3, 2], 1, -1], 'Datenqualität verbessert sich');
  assertEqual([z.duplikate.cells, z.duplikate.current, z.duplikate.delta], [[null, null], 0, null], 'fehlender Zähler → null, keine Differenz');
  const g = compareByGroup([mitte, alt], heute, 'jeProfil', 'profil', 'weGesamt');
  assertEqual(g.map((r) => [r.group, r.cells.map((c) => (c ? Math.round(c.value * 100) : null)), r.current && Math.round(r.current.value * 100), r.delta]), [
    ['IK', [null, 100], 100, 0],
    ['PK', [50, 50], 50, 0],
  ], 'Gruppen als Vereinigung aller Stichtage, alphabetisch; fehlende Gruppe → null');
  const j = compareByGroup([alt], heute, 'jeJahr', 'jahr', 'vorgaenge');
  assertEqual(j.map((r) => [r.group, r.cells[0] && r.cells[0].value, r.current.value]), [[2024, 2, 2], [2025, null, 1], [2026, null, 1]]);
});
