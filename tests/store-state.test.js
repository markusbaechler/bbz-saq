import { test, assert, assertEqual } from './runner.js';
import { CONFIG } from '../config.js';
import { createStore } from '../store.js';
import { DEFAULT_FILTER, MODE, overview } from '../metrics.js';
import { makeSheet, runValues } from './fixtures.js';

function row(overrides = {}) {
  return {
    lastName: 'Muster', firstName: 'Test', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE',
    weAllPassed: 'yes', oeAllPassed: 'yes',
    ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 50, result: 0.8 }] }),
    ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024', score: 5, result: 0.9 }] }),
    ...overrides,
  };
}

function loadResult() {
  const first = makeSheet('first', [
    row(),
    row({ lastName: 'Beispiel', profil: 'IK', sprache: 'FR', employer: 'BEKB' }),
    row({ lastName: 'OhneDatum', ...runValues('we', { 1: [{ passed: 'yes', date: '', score: 50, result: 0.8 }] }) }),
    row({ lastName: 'Fehler', 'we1.run1.passed': '?' }),
  ]);
  const issued = makeSheet('issued', [row({ lastName: 'Zertifikat', profil: 'KMU', sprache: 'IT', certStart: '01.07.2024' })]);
  return { sheets: [first, issued], comments: { [CONFIG.sheets.first]: { B12: 'VSS 01.01.2025: X' } }, meta: { fileName: 'Reporting_KUBA.xlsx' } };
}

test('createStore: Initialzustand ohne Daten, Filter = DEFAULT_FILTER', () => {
  const store = createStore();
  const s = store.getState();
  assertEqual(s.persons, []);
  assertEqual(s.dq, []);
  assertEqual(s.meta, null);
  assertEqual(s.filter, { ...DEFAULT_FILTER });
  assertEqual(store.getFilteredPersons(), []);
});

test('createStore.setData: normalisiert Sheets, hält Personen, DQ und Meta nur im Memory', () => {
  const store = createStore();
  store.setData(loadResult());
  const s = store.getState();
  assertEqual(s.persons.length, 5);
  assertEqual(s.dq.length, 2, 'ein Fehler (?), ein Hinweis (Passed ohne Datum)');
  assertEqual(s.meta.counts, {
    first: 4, issued: 1, zeilen: 5, vorgaenge: 5, personen: 5, duplikate: 0, profilKonflikte: 0, mehrereProfile: 0,
    bestanden: 5, nichtBestanden: 0, offen: 0, passiv: 0, nichtErfasst: 0, vollstaendigOhneGesamtergebnis: 0, teileAusserhalbVorgabe: 0, passerelleMoeglich: 0, schluesselOhneGeburtsdatum: 5,
    dq: 2, fehler: 1, hinweise: 1, nichtAusgewertet: 0,
    wirkungUnsichtbar: 2, wirkungKennzahl: 0, wirkungKeine: 0,
  });
  assertEqual(s.meta.fileName, 'Reporting_KUBA.xlsx');
  assertEqual(s.persons[1].vss, true);
});

test('createStore.getFilteredPersons: wendet Filter an (nur Personen mit WE-Datum)', () => {
  const store = createStore();
  store.setData(loadResult());
  assertEqual(store.getFilteredPersons().map((p) => p.lastName), ['Muster', 'Beispiel', 'Zertifikat'], 'RUN1 ohne Passed-Wert gilt nicht als absolviert');
  store.setFilter({ profil: ['IK', 'KMU'] });
  assertEqual(store.getFilteredPersons().map((p) => p.lastName), ['Beispiel', 'Zertifikat']);
  store.setFilter({ onlyIssued: true });
  assertEqual(store.getFilteredPersons().map((p) => p.lastName), ['Zertifikat']);
  assertEqual(store.getState().filter.profil, ['IK', 'KMU'], 'setFilter merged partiell');
});

test('createStore.resetFilter: zurück auf DEFAULT_FILTER', () => {
  const store = createStore();
  store.setData(loadResult());
  store.setFilter({ profil: ['IK'], mode: MODE.BESTANDEN });
  store.resetFilter();
  assertEqual(store.getState().filter, { ...DEFAULT_FILTER });
  assertEqual(store.getFilteredPersons().length, 3);
});

test('createStore.getFilterOptions: Auswahlwerte aus den Daten (sortiert, ohne null)', () => {
  const store = createStore();
  store.setData(loadResult());
  assertEqual(store.getFilterOptions(), {
    profil: ['PK', 'IK', 'KMU'],
    sprache: ['DE', 'FR', 'IT'],
    bank: ['Berner Kantonalbank AG', 'Testbank AG'],
  });
});

test('createStore.subscribe: benachrichtigt bei Daten- und Filteränderung, abbestellbar', () => {
  const store = createStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls += 1; });
  store.setData(loadResult());
  store.setFilter({ sprache: ['DE'] });
  assertEqual(calls, 2);
  unsubscribe();
  store.resetFilter();
  assertEqual(calls, 2);
});

test('createStore: Kennzahlen laufen auf gefilterten Personen (End-to-End synthetisch)', () => {
  const store = createStore();
  store.setData(loadResult());
  const o = overview(store.getFilteredPersons(), store.getState().filter.mode);
  assertEqual(o.n, 3);
  assertEqual(o.written.gesamt.count, 3);
  assertEqual(o.written.erstversuch.count, 3);
  assertEqual(o.oral.bestanden.n, 3);
  assertEqual(o.issued, 1);
  assertEqual(o.vss, 1);
});

test('createStore.clear: entfernt Personen, DQ und Meta aus dem Memory (z. B. beim Abmelden)', () => {
  const store = createStore();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.setData(loadResult());
  store.setFilter({ profil: ['PK'] });
  store.clear();
  const s = store.getState();
  assertEqual([s.persons, s.dq, s.meta], [[], [], null]);
  assertEqual(s.filter.profil, ['PK'], 'Filter bleibt erhalten');
  assertEqual(store.getFilteredPersons(), []);
  assertEqual(store.getFilterOptions(), { profil: [], sprache: [], bank: [] });
  assertEqual(calls, 3);
});

test('createStore.setUi / update: Anzeigezustand im Store; silent ohne Benachrichtigung; update setzt Filter und UI mit einer Benachrichtigung', () => {
  const store = createStore();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  assertEqual(store.getState().ui, { benchmark: 'bank', dq: null, compare: null, snapshots: [], snapshotErrors: [] });
  store.setUi({ benchmark: 'profil' });
  assertEqual([store.getState().ui.benchmark, calls], ['profil', 1]);
  store.setUi({ dq: { text: 'x' } }, { silent: true });
  assertEqual([store.getState().ui.dq, calls], [{ text: 'x' }, 1], 'silent: gemerkt, aber nicht benachrichtigt');
  store.update({ filter: { profil: ['PK'] }, ui: { compare: { a: 2024, b: 2025 } } });
  assertEqual([store.getState().filter.profil, store.getState().ui.compare, calls], [['PK'], { a: 2024, b: 2025 }, 2]);
  store.update({});
  assertEqual(calls, 3);
});
