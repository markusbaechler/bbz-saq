// views/overview.js – View 1 «Übersicht»: KPIs gesamt für den aktiven Filter, Kennzahlen je Profil.

import { overviewModel, plannedTables, comparisonTable } from './tables.js';
import { renderKpis, renderTable, section, hinted, el } from './common.js';
import { BENCHMARKS } from '../metrics.js';

export const id = 'uebersicht';
export const label = 'Übersicht';
export const group = 'Kennzahlen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Kennzahlen der Vorgänge mit absolviertem schriftlichem Run im Filter; Quoten auf abgeschlossene Vorgänge, Personen zählen Menschen.';
export const glossar = 'Kennzahlrelevant (Grundgesamtheit)'; // Ziel des Links «Definitionen»

export function build(ctx) {
  const hints = [
    'Kennzahlen für Zertifizierungsvorgänge (eine Zeile der Datei, Duplikate zusammengeführt) mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Quoten sind Anteile von Vorgängen; «Personen» zählt Menschen (eine Person kann mehrere Vorgänge haben); Ø Resultat ist der Mittelwert der erreichten Punkte in Prozent. Bestehensquoten beziehen sich auf abgeschlossene Vorgänge; offene Vorgänge (Prozess läuft noch) sind separat ausgewiesen.',
    '* Kennzahl auf Basis von n < 5 Vorgängen (Aussagekraft eingeschränkt).',
  ];
  const sec = hinted(hints);
  const m = overviewModel(ctx.persons, ctx.allPersons || ctx.persons);
  const planned = plannedTables(ctx.plannedPersons || []);
  const bench = ctx.benchmark || null;
  let comparison = null;
  if (bench) {
    const bm = overviewModel(bench.persons, ctx.allPersons || bench.persons);
    comparison = comparisonTable(m.kpis, bm.kpis, bench.label);
    const byLabel = new Map(bm.kpis.map((k) => [k.label, k]));
    for (const k of m.kpis) {
      const b = byLabel.get(k.label);
      if (b && k.kind !== 'count') {
        k.benchmark = b.value;
        k.benchmarkLabel = bench.label;
        // Differenz in Prozentpunkten für die Kachel (A.4); null ohne Wert auf einer Seite
        k.delta = Number.isFinite(k.raw) && Number.isFinite(b.raw) ? (k.raw - b.raw) * 100 : null;
      }
    }
  }
  const kpis = m.kpis.concat([{ label: 'Geplante Prüfungstermine', value: String(planned.total), n: planned.total, small: false, kind: 'count', group: 'Mengen', direction: 'neutral', hint: 'Termine in der Zukunft ohne Ergebnis (Filter Profil, Sprache, Bank, VSS/VSM)' }]);
  let benchmarkBar = null;
  if (bench) {
    const def = BENCHMARKS.find((b) => b.id === bench.kind) || {};
    if (def.hint) hints.push('Benchmark «' + bench.label + '»: ' + def.hint);
    const select = el('select', { onchange: (ev) => ctx.onBenchmarkChange && ctx.onBenchmarkChange(ev.target.value) }, BENCHMARKS.map((b) => el('option', { value: b.id, text: b.label })));
    select.value = bench.kind;
    benchmarkBar = el('div', { class: 'toolbar benchmark-bar' }, [
      el('label', { class: 'inline' }, ['Benchmark ', select]),
      el('span', { class: 'meta-list', text: bench.persons.length + ' Vorgänge im Benchmark' + (bench.persons.length === ctx.persons.length ? ' (entspricht der Auswahl, kein entsprechender Filter aktiv)' : '') }),
    ]);
  }
  const kpiTable = {
    title: 'Kennzahlen gesamt',
    columns: [{ key: 'label', label: 'Kennzahl' }, { key: 'value', label: 'Wert' }, { key: 'count', label: 'Anzahl' }, { key: 'n', label: 'n' }, { key: 'hint', label: 'Beschreibung' }],
    rows: kpis.map((k) => ({ label: k.label, value: k.value, count: k.count === null || k.count === undefined ? '' : k.count, n: k.n, hint: k.hint, small: k.small })),
  };
  return {
    nodes: [
      benchmarkBar,
      renderKpis(kpis, { glossaryHref: ctx.glossaryHref }),
      // Phone (B.4): Benchmark-Tabelle und Mehrfachprofile eingeklappt, Kennzahlen je Profil offen
      comparison ? sec('Auswahl im Vergleich zum Benchmark', [renderTable(comparison)], 'Differenz in Prozentpunkten: Auswahl minus Benchmark. Der Benchmark verwendet dieselben Filter wie die Auswahl, nur ohne die gewählte Einschränkung.', null, { phoneCollapsed: true }) : null,
      section('Kennzahlen je Profil', [renderTable(m.byProfil)]),
      sec('Personen mit mehreren Profilen', [renderTable(m.multi)], 'Menschen mit Zertifizierungsvorgängen in mehr als einem Profil, gruppiert nach der zeitlichen Abfolge der Profile.', null, { phoneCollapsed: true }),
    ],
    tables: (comparison ? [kpiTable, comparison, m.byProfil] : [kpiTable, m.byProfil]).concat([m.multi]),
    hints,
  };
}
