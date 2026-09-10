// tests/overview.test.js – reine Funktionen der Ansicht «Übersicht» (kein DOM).
// benchmarkRelevant (Paket A, A2): Trägt die Delta-Zeile überhaupt eine Information, oder ist die Auswahl der Benchmark?
import { test, assert } from './runner.js';
import { benchmarkRelevant } from '../views/overview.js';
import { DEFAULT_FILTER } from '../metrics.js';

const f = (partial) => ({ ...DEFAULT_FILTER, profil: [], sprache: [], bank: [], ...partial });

test('overview.benchmarkRelevant: ohne Filter ist die Auswahl der Benchmark – keine Delta-Zeile (A2)', () => {
  for (const kind of ['bank', 'profil', 'sprache', 'gesamt']) {
    assert(!benchmarkRelevant(f({}), kind), 'Standardfilter, Benchmark «' + kind + '»');
  }
  assert(!benchmarkRelevant(undefined, 'bank'), 'ohne Filterobjekt');
});

test('overview.benchmarkRelevant: nur die Einschränkung zählt, die der Benchmark wegnimmt (A2)', () => {
  assert(benchmarkRelevant(f({ bank: ['Testbank AG'] }), 'bank'), 'Bank-Filter gegen «Alle Banken»');
  assert(!benchmarkRelevant(f({ bank: ['Testbank AG'] }), 'profil'), 'Bank-Filter gegen «Alle Profile»: beide Seiten gleich eingeschränkt');
  assert(benchmarkRelevant(f({ profil: ['PK'] }), 'profil'), 'Profil-Filter gegen «Alle Profile»');
  assert(benchmarkRelevant(f({ sprache: ['DE'] }), 'sprache'), 'Sprach-Filter gegen «Alle Sprachen»');
  assert(!benchmarkRelevant(f({ profil: ['PK'] }), 'bank'), 'Profil-Filter gegen «Alle Banken»');
});

test('overview.benchmarkRelevant: «Gesamt» nimmt alles weg, der Zeitraum nie (A2)', () => {
  for (const partial of [{ profil: ['PK'] }, { bank: ['Testbank AG'] }, { vssVsm: 'vss' }, { versuche: 'erstversuch' }, { onlyIssued: true }]) {
    assert(benchmarkRelevant(f(partial), 'gesamt'), 'Benchmark «Gesamt» gegen ' + JSON.stringify(partial));
  }
  // Der Benchmark verwendet denselben Zeitraum wie die Auswahl – er unterscheidet die beiden Mengen nie
  const zeitraum = f({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) });
  for (const kind of ['bank', 'profil', 'sprache', 'gesamt']) {
    assert(!benchmarkRelevant(zeitraum, kind), 'Zeitraum allein, Benchmark «' + kind + '»');
  }
});

test('overview.benchmarkRelevant: VSS/VSM und Zertifikate wirken nur auf «Gesamt» (A2)', () => {
  for (const partial of [{ vssVsm: 'vsm' }, { onlyIssued: true }, { versuche: 'mehrere' }]) {
    assert(!benchmarkRelevant(f(partial), 'bank'), '«Alle Banken» lässt ' + JSON.stringify(partial) + ' auf beiden Seiten stehen');
    assert(benchmarkRelevant(f(partial), 'gesamt'), '«Gesamt» nimmt ' + JSON.stringify(partial) + ' weg');
  }
});
