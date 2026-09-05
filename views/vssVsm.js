// views/vssVsm.js – View 4 «VSS/VSM»: Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil.

import { vssVsmTable } from './tables.js';
import { renderTable, section } from './common.js';

export const id = 'vss-vsm';
export const label = 'VSS/VSM';

export function build(ctx) {
  const table = vssVsmTable(ctx.persons);
  return {
    nodes: [
      section('Bestehensquoten VSS / VSM / ohne', [renderTable(table)], {
        intro: 'VSS und VSM stammen aus den Threaded Comments auf der Namenszelle (Muster «VSS …» bzw. «VSM …»). Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen; «ohne» = weder VSS noch VSM. Nenner der Quoten wie in den Ansichten Schriftlich und Mündlich (abgeschlossene bzw. angetretene Vorgänge).',
      }),
    ],
    tables: [table],
  };
}
