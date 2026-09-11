// views/vssVsm.js – View 4 «VSS/VSM»: Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil.

import { vssVsmTable, vssVsmPunkte } from './tables.js';
import { punktDiagramm } from './chart.js';
import { renderTable, hinted } from './common.js';

export const id = 'vss-vsm';
export const label = 'VSS/VSM';
export const group = 'Prüfungen'; // Geschwister unter diesem Primärziel (Paket E)
export const intro = 'Bestehensquoten schriftlich und mündlich für VSS, VSM und ohne Kennzeichnung, je Profil.';
export const glossar = 'VSS / VSM (Kennzeichnung)';

export function build(ctx) {
  const table = vssVsmTable(ctx.persons);
  const punkte = vssVsmPunkte(ctx.persons);
  const hints = [];
  const sec = hinted(hints);
  return {
    nodes: [
      sec('Bestehensquoten VSS / VSM / ohne', [punktDiagramm(punkte), renderTable(table)].filter(Boolean),
        'Das Punktdiagramm zeigt die Durchfallquote im 1. Versuch je Kennzeichnung mit 95-%-Wilson-Intervall; berührt ein Balken die Linie auf dem Gesamtwert, ist der Abstand nicht gesichert. Die drei Gruppen überschneiden sich und teilen den Gesamtwert nicht auf: ein Vorgang mit VSS und VSM zählt in beiden. VSS und VSM stammen aus den Threaded Comments auf der Namenszelle (Muster «VSS …» bzw. «VSM …»). Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen; «ohne» = weder VSS noch VSM. Nenner der Quoten wie in den Ansichten Schriftlich und Mündlich (abgeschlossene bzw. angetretene Vorgänge).'),
    ],
    tables: [table],
    hints,
  };
}
