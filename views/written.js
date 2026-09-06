// views/written.js – View 2 «Schriftlich»: Bestehensquoten und Ø Performance nach Profil, Sprache, Bank, Teilprüfung.

import { passRateTable, performanceTable, partTable } from './tables.js';
import { renderTable, hinted } from './common.js';

export const id = 'schriftlich';
export const label = 'Schriftlich';
export const group = 'Kennzahlen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Bestehensquoten und Ø Resultat schriftlich nach Profil, Sprache, Bank und Teilprüfung; beide Wertungen nebeneinander.';
export const glossar = 'Schriftlich: im 1. Versuch bestanden';

const KEYS = ['profil', 'sprache', 'employerCanon'];

export function build(ctx) {
  const rates = KEYS.map((k) => passRateTable(ctx.persons, k));
  const parts = partTable(ctx.persons, 'we');
  const perf = KEYS.map((k) => performanceTable(ctx.persons, k, 'written'));
  const hints = [];
  const sec = hinted(hints);
  return {
    nodes: [
      sec('Bestehensquoten (Anteil Vorgänge)', rates.map((t) => renderTable(t)),
        'Im 1. Versuch bestanden: alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden. Im 1. Versuch durchgefallen: mindestens eine Teilprüfung im ersten Versuch nicht bestanden (Nenner: Vorgänge mit absolviertem RUN1). Insgesamt bestanden: «WE All Passed» = yes, unabhängig von der Anzahl Versuche (Nenner: abgeschlossene Vorgänge, d. h. bestanden oder nicht bestanden). Offen = Gesamtergebnis leer, der Prozess läuft noch; nicht erfasst = Gesamtergebnis unlesbar (Data-Quality-Log).'),
      sec('Je Teilprüfung WE1–WE6', [renderTable(parts)], 'Anteile und Ø Resultat je Teilprüfung; n = Vorgänge mit absolviertem ersten Versuch der Teilprüfung.'),
      sec('Ø Resultat (erreichte Punkte in Prozent)', perf.map((t) => renderTable(t)),
        'Je Vorgang Mittel über die vorhandenen Teilprüfungen, danach Mittel über die Vorgänge. Beide Wertungen nebeneinander: Resultat des ersten Versuchs und Resultat des bestandenen Runs.'),
    ],
    tables: rates.concat([parts], perf),
    hints,
  };
}
