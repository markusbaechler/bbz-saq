// views/overview.js – View 1 «Übersicht»: KPIs gesamt für den aktiven Filter, Kennzahlen je Profil.

import { overviewModel, plannedTables } from './tables.js';
import { renderKpis, renderTable, section, el } from './common.js';

export const id = 'uebersicht';
export const label = 'Übersicht';

export function build(ctx) {
  const m = overviewModel(ctx.persons, ctx.mode);
  const planned = plannedTables(ctx.plannedPersons || []);
  const kpis = m.kpis.concat([{ label: 'Geplante Prüfungstermine', value: String(planned.total), n: planned.total, small: false }]);
  const kpiTable = {
    title: 'Kennzahlen gesamt',
    columns: [{ key: 'label', label: 'Kennzahl' }, { key: 'value', label: 'Wert' }, { key: 'n', label: 'n' }],
    rows: kpis.map((k) => ({ label: k.label, value: k.value, n: k.n, small: k.small })),
  };
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Kennzahlen für Personen mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Versuchsmodus: ' + (ctx.modeLabel || ctx.mode) + '.' }),
      renderKpis(kpis),
      el('p', { class: 'note', text: '* Kennzahl auf Basis von n < 5 Personen (Aussagekraft eingeschränkt)' }),
      section('Kennzahlen je Profil', [renderTable(m.byProfil)]),
    ],
    tables: [kpiTable, m.byProfil],
  };
}
