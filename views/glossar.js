// views/glossar.js – Ansicht «Glossar»: Begriffe und Kennzahl-Definitionen (a5). Statisch: braucht keine geladenen Daten.

import { GLOSSARY, glossaryAnchor } from '../glossary.js';
import { renderTable, section, hinted } from './common.js';

export const id = 'glossar';
export const label = 'Glossar';
export const group = 'Daten'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Verbindliche Definitionen aller Begriffe und Kennzahlen des Cockpits, identisch mit README.md.';
export const isStatic = true;

function table(kind) {
  const rows = GLOSSARY.filter((g) => g.kind === kind).map((g) => ({ term: g.term, definition: g.definition, nenner: g.nenner, grenzfaelle: g.grenzfaelle }));
  return {
    title: kind === 'Kennzahl' ? 'Kennzahlen' : 'Begriffe',
    columns: [{ key: 'term', label: kind }, { key: 'definition', label: 'Definition' }, { key: 'nenner', label: 'Nenner' }, { key: 'grenzfaelle', label: 'Grenzfälle / Hinweise' }],
    rows,
  };
}

// Tabelle mit Anker je Begriff (A.3): Zeile «glossar-<slug>», per Link «Definitionen» aus den Ansichten fokussierbar
function tableWithAnchors(model) {
  const wrap = renderTable(model);
  wrap.querySelectorAll('tbody tr').forEach((tr, i) => {
    tr.id = glossaryAnchor(model.rows[i].term);
    tr.tabIndex = -1;
  });
  return wrap;
}

export function build() {
  const begriffe = table('Begriff');
  const kennzahlen = table('Kennzahl');
  const hints = ['Grundlage sind die Entscheide E1–E6 des Auftraggebers; [unklar] markiert offene Punkte.'];
  const sec = hinted(hints);
  return {
    nodes: [
      section('Begriffe', [tableWithAnchors(begriffe)]),
      sec('Kennzahlen', [tableWithAnchors(kennzahlen)], 'Beschriftung wie auf den Kacheln und in den Tabellenspalten. Alle Quoten werden mit n (Nenner) ausgewiesen, Prozent mit einer Dezimale; Gruppen mit n < 5 sind mit «*» markiert.'),
    ],
    tables: [begriffe, kennzahlen],
    hints,
  };
}
