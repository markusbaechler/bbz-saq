// tests/bankvergleich.test.js – Bankvergleich nach E7/E8/E9 (PROMPT-3, P7.2b).
// Die Bank ist Attribut des Vorgangs (employerCanon), nicht der Person: eine Person kann in zwei Banken vorkommen.
// Delta steht nur in der Fokusspalte, bezogen auf «alle Banken ohne Fokusbank», gerechnet aus Rohwerten.
import { test, assert, assertEqual, assertClose } from './runner.js';
import { SMALL_N, COMPARE_MAX, bankComparison, bankPersonCounts } from '../metrics.js';
import { makePerson } from './fixtures.js';

// Ein abgeschlossener Vorgang einer Bank; durchgefallen = WE1 RUN1 nicht bestanden, danach bestanden.
function vorgang(bank, { durchgefallen = false, sprache = 'DE', personKey = null } = {}) {
  const runs = durchgefallen
    ? [{ passed: false, date: '2024-03-01', result: 0.5 }, { passed: true, date: '2024-06-01', result: 0.8 }]
    : [{ passed: true, date: '2024-03-01', result: 0.8 }];
  const p = makePerson({
    employerCanon: bank, sprache,
    weAllPassed: true, oeAllPassed: true,
    we: { 1: runs },
    oe: { 1: [{ passed: true, date: '2024-09-01', result: 0.9 }] },
  });
  if (personKey) p.personKey = personKey;
  return p;
}

function viele(bank, anzahl, options = {}) {
  return Array.from({ length: anzahl }, (_, i) => vorgang(bank, { ...options, durchgefallen: i < (options.durchgefallen || 0) }));
}

function zeile(modell, id) {
  const z = modell.zeilen.find((r) => r.id === id);
  assert(z, 'Zeile «' + id + '» fehlt im Modell');
  return z;
}

// ---------------------------------------------------------------------------
// E7 – Bankzuordnung am Vorgang
// ---------------------------------------------------------------------------

test('bankComparison: eine Person mit Bankwechsel zählt in beiden Banken, im Gesamtwert einmal', () => {
  const a = vorgang('Bank A', { personKey: 'gleich' });
  const b = vorgang('Bank B', { personKey: 'gleich' });
  const m = bankComparison([a, b], { fokus: 'Bank A', vergleich: ['Bank B'] });
  assertEqual(m.spalten.find((s) => s.id === 'fokus').personen, 1);
  assertEqual(m.spalten.find((s) => s.id === 'v0').personen, 1);
  assertEqual(m.personen.alle, 1, 'im Gesamtwert einmal');
  assertEqual(m.personen.uebergreifend, 1);
});

test('bankPersonCounts: Personen je Bank distinct, Summe über Banken grösser als die Gesamtzahl', () => {
  const p = bankPersonCounts([vorgang('Bank A', { personKey: 'gleich' }), vorgang('Bank B', { personKey: 'gleich' }), vorgang('Bank A')]);
  assertEqual(p.banken.get('Bank A').vorgaenge, 2);
  assertEqual(p.banken.get('Bank A').personen, 2);
  assertEqual(p.banken.get('Bank B').personen, 1);
  assertEqual(p.personenGesamt, 2);
  assertEqual(p.uebergreifend, 1);
});

// ---------------------------------------------------------------------------
// E8 – Spalten, Benchmarks, Delta
// ---------------------------------------------------------------------------

test('bankComparison: ohne gewählte Vergleichsbanken bleiben Fokusspalte und beide Benchmarks', () => {
  const m = bankComparison(viele('Bank A', 6), { fokus: 'Bank A', vergleich: [] });
  assertEqual(m.spalten.map((s) => s.id), ['fokus', 'alle', 'ohneFokus']);
});

test('bankComparison: höchstens vier Vergleichsbanken, die Fokusbank steht nie unter ihnen', () => {
  const banken = ['Bank A', 'Bank B', 'Bank C', 'Bank D', 'Bank E', 'Bank F'];
  const persons = banken.flatMap((b) => viele(b, 6));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: banken });
  const vergleichsspalten = m.spalten.filter((s) => s.art === 'vergleich');
  assertEqual(vergleichsspalten.length, COMPARE_MAX);
  assertEqual(vergleichsspalten.map((s) => s.bank), ['Bank B', 'Bank C', 'Bank D', 'Bank E']);
  assertEqual(m.ueberzaehlig, ['Bank F'], 'die überzählige Bank wird gemeldet, nicht still fallen gelassen');
});

test('bankComparison: beide Benchmarks weichen voneinander ab, das Delta zählt «ohne Fokusbank»', () => {
  // Fokus: 8 Vorgänge, 4 im ersten Versuch durchgefallen (50.0 %). Übrige: 6 Vorgänge, keiner durchgefallen (0.0 %).
  const persons = viele('Bank A', 8, { durchgefallen: 4 }).concat(viele('Bank B', 6));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] });
  const z = zeile(m, 'we.v1');
  assertClose(z.zellen.fokus.value, 0.5, 1e-9);
  assertClose(z.zellen.alle.value, 4 / 14, 1e-9);
  assertClose(z.zellen.ohneFokus.value, 0, 1e-9);
  assertClose(z.delta.wert, 50, 1e-9, 'gegen «ohne Fokusbank», nicht gegen «alle»');
  assert(Math.abs(z.delta.wert - (0.5 - 4 / 14) * 100) > 1, 'Delta gegen «alle» wäre ein anderer Wert');
});

test('bankComparison: das Delta entsteht aus Rohwerten, nicht aus gerundeten Anzeigewerten', () => {
  // Fokus 2/6 = 33.333 %, übrige 1/6 = 16.667 %. Aus den Anzeigewerten gerechnet ergäbe 33.3 − 16.7 = 16.6 pp.
  const persons = viele('Bank A', 6, { durchgefallen: 2 }).concat(viele('Bank B', 6, { durchgefallen: 1 }));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] });
  assertClose(zeile(m, 'we.v1').delta.wert, 100 / 6, 1e-9);
});

test('bankComparison: Delta steht nur in der Fokusspalte', () => {
  const persons = viele('Bank A', 6, { durchgefallen: 2 }).concat(viele('Bank B', 6));
  const z = zeile(bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] }), 'we.v1');
  assert(z.delta !== null, 'die Zeile trägt ein Delta');
  for (const id of ['fokus', 'v0', 'alle', 'ohneFokus']) {
    assert(!('delta' in z.zellen[id]), 'Zelle ' + id + ' trägt kein eigenes Delta');
  }
});

test('bankComparison: eine Bank ohne Vorgänge im Filter wird gemeldet statt still übergangen', () => {
  const m = bankComparison(viele('Bank A', 6), { fokus: 'Bank A', vergleich: ['Bank B'] });
  assertEqual(m.fehlend, ['Bank B']);
  assert(!m.spalten.some((s) => s.bank === 'Bank B'), 'keine leere Spalte');
});

// ---------------------------------------------------------------------------
// E9 – Maskierung je Zelle
// ---------------------------------------------------------------------------

test('bankComparison: eine Zelle unter k wird maskiert, obwohl die Bank über k liegt', () => {
  // Bank A: 6 Vorgänge DE und 3 FR – die Bank liegt über k, die Sprachzelle FR darunter.
  const persons = viele('Bank A', 6).concat(viele('Bank A', 3, { sprache: 'FR' })).concat(viele('Bank B', 5, { sprache: 'FR' }));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] });
  assertEqual(zeile(m, 'we.v1').zellen.fokus.maskiert, false, 'die Bank selbst liegt über k');
  const fr = zeile(m, 'sprache.we1.FR');
  assertEqual(fr.zellen.fokus.maskiert, true);
  assertEqual(fr.zellen.fokus.n, 3, 'die Anzahl bleibt sichtbar');
  assertEqual(fr.zellen.fokus.value, null, 'die Quote nicht');
  assertEqual(fr.zellen.alle.maskiert, false, 'über alle Banken sind es 8');
});

test('bankComparison: eine maskierte Zelle liefert kein Delta', () => {
  const persons = viele('Bank A', 6).concat(viele('Bank A', 3, { sprache: 'FR' })).concat(viele('Bank B', 6));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] });
  assertEqual(zeile(m, 'sprache.we1.FR').delta, null);
});

test('bankComparison: ein leerer Nenner ist nicht maskiert, sondern leer', () => {
  // Kein Vorgang ist abgeschlossen: Ø Versuche bis Bestanden hat keinen einzigen Wert.
  const offen = Array.from({ length: 6 }, () => makePerson({
    employerCanon: 'Bank A', weAllPassed: null, oeAllPassed: null,
    we: { 1: [{ passed: false, date: '2024-03-01', result: 0.5 }] },
  }));
  const m = bankComparison(offen, { fokus: 'Bank A', vergleich: [] });
  const z = zeile(m, 'we.versuche');
  assertEqual(z.zellen.fokus.n, 0);
  assertEqual(z.zellen.fokus.value, null);
  assertEqual(z.zellen.fokus.maskiert, false, 'ohne Wert gibt es nichts zu maskieren');
  assertEqual(zeile(m, 'kontext.abgeschlossen').zellen.fokus.value, 0);
});

test('bankComparison: k ist einstellbar und wirkt je Zelle', () => {
  const persons = viele('Bank A', 6).concat(viele('Bank A', 3, { sprache: 'FR' }));
  const streng = bankComparison(persons, { fokus: 'Bank A', vergleich: [], k: 10 });
  assertEqual(zeile(streng, 'we.v1').zellen.fokus.maskiert, true, 'bei k = 10 liegen auch 9 Vorgänge darunter');
  assertEqual(streng.k, 10);
  assertEqual(bankComparison(persons, { fokus: 'Bank A', vergleich: [] }).k, SMALL_N, 'Standard ist die Schwelle aus E5');
});

// ---------------------------------------------------------------------------
// E10 – Zeilen des Kennzahlensets
// ---------------------------------------------------------------------------

test('bankComparison: die Sprachzeilen folgen der Gesamtmenge, damit alle Spalten dieselben Zeilen tragen', () => {
  const persons = viele('Bank A', 6).concat(viele('Bank B', 6, { sprache: 'FR' }));
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: ['Bank B'] });
  assert(zeile(m, 'sprache.anteil.FR'), 'FR kommt nur bei Bank B vor, steht aber als Zeile');
  const fr = zeile(m, 'sprache.anteil.FR');
  assertEqual(fr.zellen.fokus.value, 0, 'Bank A hat keinen FR-Vorgang');
  assertClose(fr.zellen.v0.value, 1, 1e-9);
});

test('bankComparison: das Kennzahlenset nach E10 ist vollständig und in Gruppen geordnet', () => {
  const m = bankComparison(viele('Bank A', 6), { fokus: 'Bank A', vergleich: [] });
  for (const id of ['we.v1', 'we.v2', 'we.v3', 'oe.v1', 'oe.v2', 'oe.v3',
    'we.perf.erstversuch', 'we.perf.bestanden', 'oe.perf.erstversuch', 'oe.perf.bestanden',
    'we.versuche', 'oe.versuche',
    'kontext.vorgaenge', 'kontext.abgeschlossen', 'kontext.offen', 'kontext.personen', 'kontext.uebergreifend']) {
    zeile(m, id);
  }
  const folge = m.zeilen.map((z) => z.gruppe);
  const bloecke = folge.filter((g, i) => i === 0 || folge[i - 1] !== g);
  assertEqual(bloecke.length, new Set(bloecke).size, 'jede Gruppe steht als ein zusammenhängender Block');
  assertEqual(m.zeilen.every((z) => typeof z.label === 'string' && z.label.length > 0), true);
});

test('bankComparison: Kontextzahlen der Fokusbank zählen Vorgänge, nicht Quoten', () => {
  const persons = viele('Bank A', 6, { durchgefallen: 2 }).concat([makePerson({ employerCanon: 'Bank A', weAllPassed: null, we: { 1: [{ passed: false, date: '2024-03-01' }] } })]);
  const m = bankComparison(persons, { fokus: 'Bank A', vergleich: [] });
  assertEqual(zeile(m, 'kontext.vorgaenge').zellen.fokus.value, 7);
  assertEqual(zeile(m, 'kontext.offen').zellen.fokus.value, 1);
  assertEqual(zeile(m, 'kontext.vorgaenge').zellen.fokus.maskiert, false, 'Mengen werden nicht maskiert');
});
