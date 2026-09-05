// views/planned.js – View «Geplante Prüfungen»: Termine in der Zukunft ohne Ergebnis, je Tag und Ort, mit Teilnehmenden.
// Hier erscheinen Namen (Auftraggeber: Einteilung der Teilnehmenden ist Zweck der Ansicht).

import { plannedTables } from './tables.js';
import { renderKpis, renderTable, section, el } from './common.js';

export const id = 'geplante-pruefungen';
export const label = 'Geplante Prüfungen';

export function build(ctx) {
  const t = plannedTables(ctx.plannedPersons || []);
  const days = new Set(t.summary.rows.map((r) => r.datum)).size;
  const persons = t.personen;
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Geplant = Prüfungsdatum in der Zukunft ohne Passed-Wert. Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» gelten; Zeitraum und Versuchsmodus wirken hier nicht.' }),
      renderKpis([
        { label: 'Geplante Termine', value: String(t.total), n: t.total, small: false },
        { label: 'Prüfungstage', value: String(days), n: days, small: false },
        { label: 'Personen', value: String(persons), n: persons, small: false },
      ]),
      section('Je Tag und Ort', [renderTable(t.summary)]),
      section('Teilnehmende', [renderTable(t.details)]),
    ],
    tables: [t.summary, t.details],
  };
}
