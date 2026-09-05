import { test, assert, assertEqual } from './runner.js';
import { GLOSSARY, glossaryTerms, glossaryEntry } from '../glossary.js';
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
