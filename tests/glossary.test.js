import { test, assert, assertEqual } from './runner.js';
import { GLOSSARY, glossaryTerms, glossaryEntry, glossarySlug, glossaryAnchor } from '../glossary.js';
import { overviewModel, plannedTables } from '../views/tables.js';
import { makePerson } from './fixtures.js';

test('glossary: jeder Eintrag hat Art, Begriff, Definition, Nenner und Grenzfälle; Begriffe eindeutig', () => {
  assert(GLOSSARY.length >= 30);
  for (const g of GLOSSARY) {
    assert(['Begriff', 'Kennzahl'].includes(g.kind), g.term);
    for (const k of ['term', 'definition', 'nenner', 'grenzfaelle']) assert(typeof g[k] === 'string' && g[k].length > 0, g.term + ': ' + k);
    assert(!/ß/.test((g.definition + g.grenzfaelle + g.nenner).replace('ß → ss', '')), 'ss statt ß: ' + g.term);
  }
  const terms = glossaryTerms();
  assertEqual(new Set(terms).size, terms.length, 'Begriffe eindeutig');
  assertEqual(glossaryEntry('Vorgänge').kind, 'Kennzahl');
  assertEqual(glossaryEntry('gibt es nicht'), null);
  assert(glossaryTerms('Begriff').includes('Zertifizierungsvorgang (Vorgang)'));
});

test('glossary: jede Kachel der Übersicht hat einen Glossar-Eintrag mit identischer Beschriftung', () => {
  const persons = [makePerson({ weAllPassed: true, oeAllPassed: true, we: { 1: [{ passed: true, date: '2024-03-01', result: 0.8 }] }, oe: { 1: [{ passed: true, date: '2024-06-01', result: 0.9 }] } })];
  const labels = overviewModel(persons).kpis.map((k) => k.label).concat(['Geplante Prüfungstermine']);
  const kennzahlen = glossaryTerms('Kennzahl');
  for (const label of labels) assert(kennzahlen.includes(label), 'Glossar-Eintrag fehlt für Kachel «' + label + '»');
  assertEqual(plannedTables([]).total, 0);
});

test('glossary.glossarySlug: Umlaute, ß und Sonderzeichen; Anker «glossar-<slug>»; Slugs aller Begriffe eindeutig (A.3)', () => {
  assertEqual(glossarySlug('Mündlich: bestanden'), 'muendlich-bestanden');
  assertEqual(glossarySlug('Passiv (> 365 Tage)'), 'passiv-365-tage');
  assertEqual(glossarySlug('Wertung «Resultat 1. Versuch» / «Resultat bestandener Run»'), 'wertung-resultat-1-versuch-resultat-bestandener-run');
  assertEqual(glossarySlug('Grösse ß'), 'groesse-ss');
  assertEqual(glossaryAnchor('Vorgänge'), 'glossar-vorgaenge');
  const slugs = glossaryTerms().map(glossarySlug);
  assertEqual(new Set(slugs).size, slugs.length, 'Slugs eindeutig');
  assert(slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)), 'nur a-z, 0-9 und Bindestrich');
});
