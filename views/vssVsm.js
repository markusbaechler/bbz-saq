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
  // P5: beide Prüfungsteile, wie Ansicht und README es versprechen. Zwei Diagramme statt zweier Reihen in einem:
  // Die Nenner sind verschieden (auswertbarer erster Versuch schriftlich, angetretene Vorgänge mündlich), also
  // braucht jede Seite ihre eigene Bezugslinie. Zwei Linien in einem Plot lüden dazu ein, einen Punkt gegen die
  // falsche zu lesen – dieselbe Regel wie beim Teilprüfungs-Diagramm (Paket H).
  const punkte = ['schriftlich', 'muendlich'].map((teil) => vssVsmPunkte(ctx.persons, teil));
  const hints = [];
  const sec = hinted(hints);
  return {
    nodes: [
      // P1: Diagramm zeigt die Durchfallquote, Tabelle die Bestehensquoten – die Überschrift nennt beides
      sec('Bestehen und Durchfallen: VSS / VSM / ohne', punkte.map((m) => punktDiagramm(m)).concat([renderTable(table)]).filter(Boolean),
        'Zwei Diagramme, ein Prüfungsteil je Diagramm: die Durchfallquote im 1. Versuch je Kennzeichnung mit 95-%-Wilson-Intervall. Berührt ein Balken die Linie auf dem Gesamtwert, ist der Abstand nicht gesichert. Jedes Diagramm hat seine eigene Linie, weil die Nenner verschieden sind: schriftlich die Vorgänge mit auswertbarem ersten Versuch, mündlich die angetretenen Vorgänge (OE1 RUN1 absolviert und datiert). Deshalb dürfen die beiden Diagramme nicht gegeneinander gelesen werden, sondern jedes gegen seine eigene Linie. Die drei Gruppen überschneiden sich und teilen den Gesamtwert nicht auf: ein Vorgang mit VSS und VSM zählt in beiden. VSS und VSM stammen aus den Threaded Comments auf der Namenszelle (Muster «VSS …» bzw. «VSM …»); «ohne» = weder VSS noch VSM. Welche Kennzeichnung zu welchem Prüfungsteil gehört, sagt die Datei nicht – beide Teile stehen deshalb für alle drei Gruppen.'),
    ],
    tables: [table],
    hints,
  };
}
