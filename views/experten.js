// views/experten.js – Ansicht «Experten» (PROMPT-2 Paket D): Beobachtungswerte je Experte der mündlichen Prüfung (E8, E9):
// Einsätze, Rollen, Durchfallquote je Versuchsart und Ø Resultat mit Δ zum Benchmark aller Experten; Zeilen-Detail je Jahr,
// Profil, Sprache und Partner; Paarungen. Sortiert wird wie in jeder anderen Tabelle (Paket B, B4): über
// renderExpandableTable, Zustand in der URL.

import { expertTables } from './tables.js';
import { renderKpis, renderTable, renderExpandableTable, section, hinted, el } from './common.js';
import { punktDiagramm } from './chart.js';

export const id = 'experten';
export const label = 'Experten';
export const group = null; // eigenes Ziel im Band (Paket E)
export const intro = 'Einsätze, Rollen, Durchfallquote und Ø Resultat je Experte der mündlichen Prüfung gegen den Benchmark aller Experten; Beobachtungswerte, mit Namen.';
export const glossar = 'Einsatz (Experte)';
export const noPersonExport = true; // eigener Export «Einsatzebene» (app.js)
// Die Ausgangssortierung «Einsätze absteigend» steckt im Modell (metrics.expertStats sortiert danach); die Tabelle
// braucht dafür keinen eigenen Zustand mehr. Sortiert wird seit Paket B (B4) über renderExpandableTable – eine
// Implementierung für alle Tabellen, Zustand in der URL statt nur im Memory.
// Wirksamkeit der globalen Filterleiste (Paket A, A1): die Einsätze entstehen aus ctx.expertRuns – die Vorgangsfilter wirken,
// der Versuchsmodus nicht (er wird auf 'alle' gesetzt). Der Zeitraum bleibt aktiv, wirkt aber auf das Run-Datum des Einsatzes;
// darum der sichtbare Hinweis in der Leiste statt einer Erklärung im Text.
export const filters = {
  versuche: false,
  grund: {
    versuche: 'Ein Einsatz zählt unabhängig davon, der wievielte Versuch der Kandidatin oder des Kandidaten er ist',
  },
  hinweis: 'Der Zeitraum wirkt hier auf das Run-Datum des Einsatzes, nicht auf das Referenzdatum des Vorgangs.',
};

// Zeilen-Detail: vier kleine Tabellen (je Jahr, je Profil, je Sprache, Partner)
function detailNode(det) {
  if (!det) return null;
  return el('div', { class: 'expert-detail' }, [det.jahr, det.profil, det.sprache, det.partner].map((t) => renderTable(t)));
}

export function build(ctx) {
  const meta = ctx.expertMeta || { columns: false, expected: [] };
  const hints = [
    'Das Punktdiagramm steht in der Reihenfolge der Tabelle (Einsätze absteigend), nicht nach Quote sortiert: Es soll zeigen, wessen Abstand zum Benchmark gesichert ist, und keine Rangliste von Personen sein. Die Balken werden nach unten breiter, weil wenige Einsätze stärker streuen – berührt ein Balken die Linie, ist der Abstand nicht gesichert.',
    'Beobachtungswerte, keine Leistungsbeurteilung: ein Einsatz zählt für beide Experten voll; Kandidaten mit Wiederholung haben strukturell höhere Durchfallquoten, deshalb getrennter Benchmark je Versuchsart (E9). Δ = Wert des Experten minus Benchmark aller Experten im Filter, in Prozentpunkten, neutral dargestellt.',
    'Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» wirken über die Vorgänge; der Zeitraum wirkt auf das Run-Datum des Einsatzes. Runs mit Ergebnis ohne Datum zählen nur ohne Zeitraum («ohne Datum»).',
  ];
  const sec = hinted(hints);
  if (!meta.columns) {
    return { nodes: [el('p', { class: 'empty', text: 'Keine Expertenspalten in dieser Datei (erwartete Header: ' + (meta.expected || []).join(', ') + ' je mündlichem Run).' })], tables: [], hints };
  }
  const t = expertTables(ctx.expertRuns || []);
  const holder = el('div', { class: 'expert-table' }, [renderExpandableTable(t.main, {
    detail: (row) => detailNode(t.details.get(row.key)),
    hint: 'Zeile anklicken (oder Enter): Aufschlüsselung je Jahr, Profil, Sprache und Partner.',
  })]);

  return {
    nodes: [
      renderKpis(t.kpis, { glossaryHref: ctx.glossaryHref }),
      sec('Experten', [punktDiagramm(t.punkte), holder].filter(Boolean), null,
        t.main.rows.length + (t.main.rows.length === 1 ? ' Experte' : ' Experten') + ' · ' + (ctx.expertRuns || []).length + ' Einsätze'),
      sec('Paarungen Experte 1 × Experte 2', [renderTable(t.pairs)], 'Einsätze mit zwei verschiedenen Experten, unabhängig von der Rollenreihenfolge; häufigste Paare zuerst (höchstens 30).', null, { phoneCollapsed: true }),
    ],
    tables: [t.main, t.pairs],
    hints,
  };
}
