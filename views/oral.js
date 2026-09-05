// views/oral.js – View 3 «Mündlich»: Bestehensquote gesamt und je Profil, Anteil 1×/2× durchgefallen, Ø Performance.

import { oralRateTable, performanceTable } from './tables.js';
import { renderTable, section } from './common.js';

export const id = 'muendlich';
export const label = 'Mündlich';

export function build(ctx) {
  const rates = oralRateTable(ctx.persons, 'profil');
  const perf = ['profil', 'sprache', 'employerCanon'].map((k) => performanceTable(ctx.persons, k, ctx.mode, 'oral'));
  return {
    nodes: [
      section('Bestehensquote', [renderTable(rates)], {
        intro: 'Bestanden: «OE All Passed» = yes. 1× durchgefallen: OE1 RUN1 nicht bestanden. 2× durchgefallen: OE1 RUN1 und RUN2 nicht bestanden. Nenner n: Personen mit absolviertem, datiertem OE1 RUN1 im aktiven Filter (geplante Termine zählen nicht).',
      }),
      section('Ø Performance (' + (ctx.modeLabel || ctx.mode) + ')', perf.map((t) => renderTable(t)), {
        intro: 'Result-Prozent der mündlichen Prüfung gemäss Versuchsmodus, gemittelt über die Personen mit Wert.',
      }),
    ],
    tables: [rates].concat(perf),
  };
}
