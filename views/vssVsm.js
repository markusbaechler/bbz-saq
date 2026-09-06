// views/vssVsm.js – View 4 «VSS/VSM»: Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil.

import { vssVsmTable } from './tables.js';
import { renderTable, hinted } from './common.js';

export const id = 'vss-vsm';
export const label = 'VSS/VSM';
export const group = 'Kennzahlen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Bestehensquoten schriftlich und mündlich für VSS, VSM und ohne Kennzeichnung, je Profil.';
export const glossar = 'VSS / VSM (Kennzeichnung)';

export function build(ctx) {
  const table = vssVsmTable(ctx.persons);
  const hints = [];
  const sec = hinted(hints);
  return {
    nodes: [
      sec('Bestehensquoten VSS / VSM / ohne', [renderTable(table)],
        'VSS und VSM stammen aus den Threaded Comments auf der Namenszelle (Muster «VSS …» bzw. «VSM …»). Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen; «ohne» = weder VSS noch VSM. Nenner der Quoten wie in den Ansichten Schriftlich und Mündlich (abgeschlossene bzw. angetretene Vorgänge).'),
    ],
    tables: [table],
    hints,
  };
}
