// views/oral.js – View 3 «Mündlich»: Bestehensquote gesamt und je Profil, Anteil 1×/2× durchgefallen, Ø Performance.

import { oralRateTable, performanceTable, partTable } from './tables.js';
import { renderTable, section } from './common.js';

export const id = 'muendlich';
export const label = 'Mündlich';

export function build(ctx) {
  const rates = oralRateTable(ctx.persons, 'profil');
  const parts = partTable(ctx.persons, 'oe');
  const perf = ['profil', 'sprache', 'employerCanon'].map((k) => performanceTable(ctx.persons, k, 'oral'));
  return {
    nodes: [
      section('Bestehensquote (Anteil Vorgänge)', [renderTable(rates)], {
        intro: 'Bestanden / nicht bestanden: «OE All Passed» = yes bzw. no; Nenner sind abgeschlossene Vorgänge mündlich. Offen = Gesamtergebnis leer (Prozess läuft noch, auch wenn noch keine mündliche Prüfung stattfand); nicht erfasst = unlesbar. Im 1. Versuch durchgefallen: OE1 im ersten Versuch nicht bestanden, unabhängig vom späteren Erfolg; 2× durchgefallen: OE1 im ersten und zweiten Versuch nicht bestanden. Nenner dieser beiden Quoten: angetretene Vorgänge mit absolviertem, datiertem OE1 RUN1 (geplante Termine zählen nicht).',
      }),
      section('Je Teilprüfung OE1–OE2', [renderTable(parts)], {
        intro: 'Anteile und Ø Resultat je Teilprüfung; n = Vorgänge mit absolviertem ersten Versuch der Teilprüfung.',
      }),
      section('Ø Resultat (erreichte Punkte in Prozent)', perf.map((t) => renderTable(t)), {
        intro: 'Mittel über die Vorgänge mit Wert. Beide Wertungen nebeneinander: Resultat des ersten Versuchs und Resultat des bestandenen Runs.',
      }),
    ],
    tables: [rates, parts].concat(perf),
  };
}
