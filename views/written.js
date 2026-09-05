// views/written.js – View 2 «Schriftlich»: Bestehensquoten und Ø Performance nach Profil, Sprache, Bank, Teilprüfung.

import { passRateTable, performanceTable, performanceByPartTable } from './tables.js';
import { renderTable, section } from './common.js';

export const id = 'schriftlich';
export const label = 'Schriftlich';

const KEYS = ['profil', 'sprache', 'employerCanon'];

export function build(ctx) {
  const rates = KEYS.map((k) => passRateTable(ctx.persons, k));
  const perf = KEYS.map((k) => performanceTable(ctx.persons, k, ctx.mode, 'written'));
  const parts = performanceByPartTable(ctx.persons, ctx.mode);
  return {
    nodes: [
      section('Bestehensquoten', rates.map((t) => renderTable(t)), {
        intro: 'Erstversuchsquote: alle absolvierten WE RUN1 bestanden. Gesamterfolgsquote: «WE All Passed» = yes. Nenner n: Personen mit mindestens einem absolvierten, datierten WE-Run im aktiven Filter.',
      }),
      section('Ø Performance (' + (ctx.modeLabel || ctx.mode) + ')', perf.concat([parts]).map((t) => renderTable(t)), {
        intro: 'Mittel der Result-Prozente über die vorhandenen Teilprüfungen je Person, danach Mittel über die Personen. Im Modus «Bestanden» nur Personen, deren absolvierte Teilprüfungen alle bestanden sind.',
      }),
    ],
    tables: rates.concat(perf, [parts]),
  };
}
