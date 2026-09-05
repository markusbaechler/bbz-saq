// views/written.js – View 2 «Schriftlich»: Bestehensquoten und Ø Performance nach Profil, Sprache, Bank, Teilprüfung.

import { passRateTable, performanceTable, partTable } from './tables.js';
import { renderTable, section } from './common.js';

export const id = 'schriftlich';
export const label = 'Schriftlich';

const KEYS = ['profil', 'sprache', 'employerCanon'];

export function build(ctx) {
  const rates = KEYS.map((k) => passRateTable(ctx.persons, k));
  const parts = partTable(ctx.persons, 'we');
  const perf = KEYS.map((k) => performanceTable(ctx.persons, k, 'written'));
  return {
    nodes: [
      section('Bestehensquoten (Anteil Personen)', rates.map((t) => renderTable(t)), {
        intro: 'Im 1. Versuch bestanden: alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden. Im 1. Versuch durchgefallen: mindestens eine Teilprüfung im ersten Versuch nicht bestanden. Insgesamt bestanden: «WE All Passed» = yes, unabhängig von der Anzahl Versuche.',
      }),
      section('Je Teilprüfung WE1–WE6', [renderTable(parts)], {
        intro: 'Anteile und Ø Resultat je Teilprüfung; n = Personen mit absolviertem ersten Versuch der Teilprüfung.',
      }),
      section('Ø Resultat (erreichte Punkte in Prozent)', perf.map((t) => renderTable(t)), {
        intro: 'Je Person Mittel über die vorhandenen Teilprüfungen, danach Mittel über die Personen. Beide Wertungen nebeneinander: Resultat des ersten Versuchs und Resultat des bestandenen Runs.',
      }),
    ],
    tables: rates.concat([parts], perf),
  };
}
