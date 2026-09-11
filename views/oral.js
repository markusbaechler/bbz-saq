// views/oral.js – View 3 «Mündlich»: Bestehensquote gesamt und je Profil, Anteil 1×/2× durchgefallen, Ø Performance;
// Verteilung der Resultate als Histogramm (PROMPT-2 Paket G, Stufe 4, Baustein aus written.js).

import { oralRateTable, performanceTable, partTable, quotenPunkte, GROUP_LABELS } from './tables.js';
import { punktDiagramm } from './chart.js';
import { renderTable, hinted } from './common.js';
import { histogramSection } from './written.js';
import { oralPassRates } from '../metrics.js';

export const id = 'muendlich';
export const label = 'Mündlich';
export const group = 'Prüfungen'; // Geschwister unter diesem Primärziel (Paket E)
export const intro = 'Bestehensquote mündlich, Anteil 1× und 2× durchgefallen, Ø Resultat nach Profil, Sprache und Bank.';
export const glossar = 'Mündlich: bestanden';
// Wirksamkeit der Filterleiste (A1/C5): Der Benchmark wirkt hier über das Histogramm (Auswahl gegen Benchmark).
export const filters = { benchmark: true };

export function build(ctx) {
  const rates = oralRateTable(ctx.persons, 'profil');
  // H2: dasselbe Punktdiagramm wie in «Schriftlich» – hier auf der Quote «im 1. Versuch durchgefallen» (Nenner:
  // angetretene Vorgänge). Die Tabelle bleibt darunter und im Export.
  const punkte = quotenPunkte(ctx.persons, 'profil', {
    rates: oralPassRates, wert: (r) => r.failed1, titel: 'Mündlich im 1. Versuch durchgefallen nach ' + GROUP_LABELS.profil,
  });
  const parts = partTable(ctx.persons, 'oe');
  const perf = ['profil', 'sprache', 'employerCanon'].map((k) => performanceTable(ctx.persons, k, 'oral'));
  const hints = [];
  const sec = hinted(hints);
  const hist = histogramSection(ctx, 'oral', sec);
  return {
    nodes: [
      sec('Bestehensquote (Anteil Vorgänge)', [punktDiagramm(punkte), renderTable(rates)].filter(Boolean),
        'Bestanden / nicht bestanden: «OE All Passed» = yes bzw. no; Nenner sind abgeschlossene Vorgänge mündlich. Offen = Gesamtergebnis leer (Prozess läuft noch, auch wenn noch keine mündliche Prüfung stattfand); nicht erfasst = unlesbar. Im 1. Versuch durchgefallen: OE1 im ersten Versuch nicht bestanden, unabhängig vom späteren Erfolg; 2× durchgefallen: OE1 im ersten und zweiten Versuch nicht bestanden. Nenner dieser beiden Quoten: angetretene Vorgänge mit absolviertem, datiertem OE1 RUN1 (geplante Termine zählen nicht).'),
      sec('Je Teilprüfung OE1–OE2', [renderTable(parts)], 'Anteile und Ø Resultat je Teilprüfung; n = Vorgänge mit absolviertem ersten Versuch der Teilprüfung.'),
      sec('Ø Resultat (erreichte Punkte in Prozent)', perf.map((t) => renderTable(t)), 'Mittel über die Vorgänge mit Wert. Beide Wertungen nebeneinander: Resultat des ersten Versuchs und Resultat des bestandenen Runs.'),
      hist.node,
    ],
    tables: [rates, parts].concat(perf, [hist.table]),
    hints,
  };
}
