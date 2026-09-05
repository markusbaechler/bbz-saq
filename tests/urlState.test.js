import { test, assert, assertEqual } from './runner.js';
import { serializeState, parseHash, buildHash, parseDay, formatDay, sameFilter, DEFAULT_UI } from '../urlState.js';
import { DEFAULT_FILTER, MODE } from '../metrics.js';
import { d } from './fixtures.js';

test('urlState.serializeState: Standardzustand → leer; nur Abweichungen werden geschrieben', () => {
  assertEqual(serializeState(DEFAULT_FILTER, DEFAULT_UI), '');
  assertEqual(serializeState({ ...DEFAULT_FILTER, profil: ['PK'] }), 'profil=PK');
  assertEqual(serializeState({ ...DEFAULT_FILTER, from: d('2025-01-01'), to: d('2025-12-31') }), 'von=2025-01-01&bis=2025-12-31');
  assertEqual(serializeState({ ...DEFAULT_FILTER, vssVsm: 'vsm', versuche: 'erstversuch', onlyIssued: true, mode: MODE.BESTANDEN }, { benchmark: 'profil' }),
    'vss=vsm&versuche=erstversuch&zertifikate=1&wertung=bestanden&benchmark=profil');
});

test('urlState: Hin- und Rückweg mit Mehrfachauswahl, Sonderzeichen und Umlauten; keine Personendaten im Format', () => {
  const filter = { ...DEFAULT_FILTER, from: d('2024-06-01'), profil: ['PK', 'IK'], sprache: ['FR'], bank: ['Banca Popolare di Sondrio (Suisse) SA', 'Zürcher Bank & Co'], vssVsm: 'ohne', versuche: 'mehrere', onlyIssued: true, mode: MODE.BESTANDEN };
  const ui = { benchmark: 'gesamt', dq: { text: 'x' } };
  const hash = buildHash('schriftlich', filter, ui);
  assert(hash.startsWith('#schriftlich?'), hash);
  assert(!hash.includes('dq') && !hash.includes('text=x'), 'DQ-Zustand (Suchtext) steht nicht in der URL');
  const parsed = parseHash(hash);
  assertEqual(parsed.view, 'schriftlich');
  assertEqual(parsed.hasParams, true);
  assertEqual(parsed.filter, filter);
  assertEqual(parsed.ui, { ...DEFAULT_UI, benchmark: 'gesamt' });
  assert(sameFilter(parsed.filter, filter));
  assert(!sameFilter(parsed.filter, DEFAULT_FILTER));
});

test('urlState.parseHash: ohne Parameter → Standardfilter, hasParams false; ungültige Werte werden ignoriert', () => {
  const bare = parseHash('#muendlich');
  assertEqual([bare.view, bare.hasParams], ['muendlich', false]);
  assertEqual(bare.filter, { ...DEFAULT_FILTER, profil: [], sprache: [], bank: [] });
  assertEqual(parseHash('').view, '');
  assertEqual(parseHash('#').view, '');
  const odd = parseHash('#uebersicht?von=31.12.2025&bis=2025-13-40&vss=irgendwas&versuche=x&wertung=y&benchmark=z&zertifikate=ja&profil=&profil=PK');
  assertEqual([odd.filter.from, odd.filter.to, odd.filter.vssVsm, odd.filter.versuche, odd.filter.mode, odd.ui.benchmark, odd.filter.onlyIssued], [null, null, 'alle', 'alle', MODE.ERSTVERSUCH, 'bank', false]);
  assertEqual(odd.filter.profil, ['PK'], 'leere Werte fallen weg');
  assertEqual(odd.hasParams, true);
});

test('urlState.parseDay / formatDay: lokales Datum ohne Zeitzonenversatz', () => {
  assertEqual(parseDay('2025-03-31'), new Date(2025, 2, 31));
  assertEqual(formatDay(new Date(2025, 2, 31)), '2025-03-31');
  assertEqual(parseDay('2025-3-31'), null);
  assertEqual(parseDay(null), null);
  assertEqual(formatDay(null), '');
  assertEqual(formatDay(new Date('nope')), '');
});

test('urlState: Vergleichsjahre (a6) als vergleich=JJJJ-JJJJ; ungültig → null', () => {
  assertEqual(serializeState(DEFAULT_FILTER, { ...DEFAULT_UI, compare: { a: 2024, b: 2025 } }), 'vergleich=2024-2025');
  assertEqual(parseHash('#zeitverlauf?vergleich=2024-2025').ui.compare, { a: 2024, b: 2025 });
  assertEqual(parseHash('#zeitverlauf?vergleich=2024').ui.compare, null);
  assertEqual(parseHash('#zeitverlauf').ui.compare, null);
  assertEqual(serializeState(DEFAULT_FILTER, { ...DEFAULT_UI, compare: { a: 'x', b: 2025 } }), '');
});
