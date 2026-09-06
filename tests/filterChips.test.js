import { test, assertEqual } from './runner.js';
import { DEFAULT_FILTER } from '../metrics.js';
import { yearOf, filterChips } from '../filterChips.js';

const f = (o) => ({ ...DEFAULT_FILTER, profil: [], sprache: [], bank: [], ...o });

test('filterChips.yearOf: ganzes Jahr erkannt, sonst null', () => {
  assertEqual(yearOf(f({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) })), 2026);
  assertEqual(yearOf(f({ from: new Date(2026, 0, 1), to: new Date(2026, 2, 31) })), null);
  assertEqual(yearOf(f({ from: new Date(2026, 0, 1), to: null })), null);
  assertEqual(yearOf(f({})), null);
});

test('filterChips: keine Chips im Standard; je aktive Einschränkung ein Chip mit Rücksetz-Teilzustand', () => {
  assertEqual(filterChips(f({})), []);
  const chips = filterChips(f({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31), profil: ['PK', 'IK'], vssVsm: 'ohne', onlyIssued: true }));
  assertEqual(chips.map((c) => c.label), ['2026', 'Profil PK', 'Profil IK', 'Ohne VSS/VSM', 'Nur ausgestellte Zertifikate']);
  assertEqual(chips[0].reset, { from: null, to: null });
  assertEqual(chips[1].reset, { profil: ['IK'] });
  assertEqual(chips[3].reset, { vssVsm: 'alle' });
  assertEqual(chips[4].reset, { onlyIssued: false });
  assertEqual(chips[4].ariaLabel, 'Filter Nur ausgestellte Zertifikate entfernen');
  assertEqual(new Set(chips.map((c) => c.key)).size, chips.length, 'Schlüssel eindeutig');
});

test('filterChips: freier Zeitraum als Von–Bis, Sprache und Bank, Versuche; Wertung nie als Chip', () => {
  const chips = filterChips(f({ from: new Date(2026, 0, 1), to: new Date(2026, 2, 31), sprache: ['FR'], bank: ['Testbank AG'], versuche: 'erstversuch', mode: 'bestanden' }));
  assertEqual(chips.map((c) => c.label), ['01.01.2026 – 31.03.2026', 'Sprache FR', 'Bank Testbank AG', 'Nur 1. Versuch']);
  assertEqual(chips[3].reset, { versuche: 'alle' });
  assertEqual(filterChips(f({ from: new Date(2026, 0, 1) })).map((c) => c.label), ['ab 01.01.2026']);
  assertEqual(filterChips(f({ to: new Date(2026, 5, 30) })).map((c) => c.label), ['bis 30.06.2026']);
});
