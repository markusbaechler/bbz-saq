// views/experten.js – Ansicht «Experten» (PROMPT-2 Paket D): Beobachtungswerte je Experte der mündlichen Prüfung (E8, E9):
// Einsätze, Rollen, Durchfallquote je Versuchsart und Ø Resultat mit Δ zum Benchmark aller Experten; Zeilen-Detail je Jahr,
// Profil, Sprache und Partner; Paarungen. Sortierzustand nur im Memory (store.ui.experten), nie in der URL.

import { expertTables, sortTableRows } from './tables.js';
import { renderKpis, renderTable, renderExpandableTable, section, hinted, el } from './common.js';

export const id = 'experten';
export const label = 'Experten';
export const group = 'Experten'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Einsätze, Rollen, Durchfallquote und Ø Resultat je Experte der mündlichen Prüfung gegen den Benchmark aller Experten; Beobachtungswerte, mit Namen.';
export const glossar = 'Einsatz (Experte)';
export const noPersonExport = true; // eigener Export «Einsatzebene» (app.js)
export const DEFAULT_SORT = Object.freeze({ sortKey: 'einsaetze', sortDir: 'desc' });

// Zeilen-Detail: vier kleine Tabellen (je Jahr, je Profil, je Sprache, Partner)
function detailNode(det) {
  if (!det) return null;
  return el('div', { class: 'expert-detail' }, [det.jahr, det.profil, det.sprache, det.partner].map((t) => renderTable(t)));
}

export function build(ctx) {
  const meta = ctx.expertMeta || { columns: false, expected: [] };
  const hints = [
    'Beobachtungswerte, keine Leistungsbeurteilung: ein Einsatz zählt für beide Experten voll; Kandidaten mit Wiederholung haben strukturell höhere Durchfallquoten, deshalb getrennter Benchmark je Versuchsart (E9). Δ = Wert des Experten minus Benchmark aller Experten im Filter, in Prozentpunkten, neutral dargestellt.',
    'Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» wirken über die Vorgänge; der Zeitraum wirkt auf das Run-Datum des Einsatzes; Versuche und Wertung wirken nicht. Runs mit Ergebnis ohne Datum zählen nur ohne Zeitraum («ohne Datum»).',
  ];
  const sec = hinted(hints);
  if (!meta.columns) {
    return { nodes: [el('p', { class: 'empty', text: 'Keine Expertenspalten in dieser Datei (erwartete Header: ' + (meta.expected || []).join(', ') + ' je mündlichem Run).' })], tables: [], hints };
  }
  const t = expertTables(ctx.expertRuns || []);
  const state = { ...DEFAULT_SORT, ...(ctx.experten || {}) };
  const commit = () => ctx.onExpertenChange && ctx.onExpertenChange({ sortKey: state.sortKey, sortDir: state.sortDir });
  const holder = el('div', { class: 'expert-table' });

  // Haupttabelle: sortierbare Kopfzellen (button, aria-sort wie im Data-Quality-Log), Zeilen-Detail zum Aufklappen
  function renderMain() {
    const rows = sortTableRows(t.main.rows, state.sortKey, state.sortDir);
    const wrap = renderExpandableTable({ ...t.main, rows }, { detail: (row) => detailNode(t.details.get(row.key)), hint: 'Zeile anklicken (oder Enter): Aufschlüsselung je Jahr, Profil, Sprache und Partner.' });
    const ths = [...wrap.querySelectorAll('thead th')].filter((th) => !th.classList.contains('toggle'));
    t.main.columns.forEach((c, i) => {
      const th = ths[i];
      if (!th) return;
      const active = state.sortKey === c.key;
      th.classList.add('sortable');
      if (active) th.classList.add('active');
      th.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.replaceChildren(el('button', {
        type: 'button', text: c.label + (active ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : ''), 'aria-label': 'Sortieren nach ' + c.label,
        onclick: () => {
          state.sortDir = active && state.sortDir === 'desc' ? 'asc' : (active ? 'desc' : (c.key === 'experte' ? 'asc' : 'desc'));
          state.sortKey = c.key;
          commit();
          renderMain();
        },
      }));
    });
    holder.replaceChildren(wrap);
  }
  renderMain();

  return {
    nodes: [
      renderKpis(t.kpis, { glossaryHref: ctx.glossaryHref }),
      sec('Experten', [holder], null, t.main.rows.length + (t.main.rows.length === 1 ? ' Experte' : ' Experten') + ' · ' + (ctx.expertRuns || []).length + ' Einsätze'),
      sec('Paarungen Experte 1 × Experte 2', [renderTable(t.pairs)], 'Einsätze mit zwei verschiedenen Experten, unabhängig von der Rollenreihenfolge; häufigste Paare zuerst (höchstens 30).', null, { phoneCollapsed: true }),
    ],
    tables: [t.main, t.pairs],
    hints,
  };
}
