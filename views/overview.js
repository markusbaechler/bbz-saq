// views/overview.js – View 1 «Übersicht»: KPIs gesamt für den aktiven Filter, Kennzahlen je Profil.

import { overviewModel, plannedTables, comparisonTable } from './tables.js';
import { renderKpis, renderTable, section, hinted, el, signalBlock } from './common.js';
import { BENCHMARKS, benchmarkFilter, DEFAULT_FILTER } from '../metrics.js';

export const id = 'uebersicht';
export const label = 'Übersicht';
export const group = 'Kennzahlen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Kennzahlen der Vorgänge mit absolviertem schriftlichem Run im Filter; Quoten auf abgeschlossene Vorgänge, Personen zählen Menschen.';
export const glossar = 'Kennzahlrelevant (Grundgesamtheit)'; // Ziel des Links «Definitionen»
// Wirksamkeit der Filterleiste (A1/C5): Der Benchmark wirkt hier; er stand bis Paket C in einer Werkzeugleiste dieser
// Ansicht, schrieb aber globalen, in der URL serialisierten Anzeigezustand.
export const filters = { benchmark: true };

// Ist der Benchmark überhaupt eine andere Menge als die Auswahl? (Paket A, A2)
// benchmarkFilter() nimmt je nach Art genau eine Einschränkung weg («Alle Banken» den Bank-Filter, «Gesamt» alle).
// Ist diese Einschränkung gar nicht gesetzt, sind Auswahl und Benchmark identisch – dann sagt eine Zeile «● 0.0 pp»
// auf jeder Kachel nur, dass kein Filter aktiv ist. Der Zeitraum zählt nie, weil der Benchmark denselben verwendet.
export function benchmarkRelevant(filter, kind) {
  const f = { ...DEFAULT_FILTER, ...(filter || {}) };
  const b = benchmarkFilter(f, kind);
  for (const key of ['profil', 'sprache', 'bank']) {
    if ((f[key] || []).join('|') !== (b[key] || []).join('|')) return true;
  }
  return f.vssVsm !== b.vssVsm || f.versuche !== b.versuche || f.onlyIssued !== b.onlyIssued;
}

export function build(ctx) {
  const hints = [
    'Kennzahlen für Zertifizierungsvorgänge (eine Zeile der Datei, Duplikate zusammengeführt) mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Quoten sind Anteile von Vorgängen; «Personen» zählt Menschen (eine Person kann mehrere Vorgänge haben); Ø Resultat ist der Mittelwert der erreichten Punkte in Prozent. Bestehensquoten beziehen sich auf abgeschlossene Vorgänge; offene Vorgänge (Prozess läuft noch) sind separat ausgewiesen.',
    '* Kennzahl auf Basis von n < 5 Vorgängen (Aussagekraft eingeschränkt).',
  ];
  const sec = hinted(hints);
  const m = overviewModel(ctx.persons, ctx.allPersons || ctx.persons);
  const planned = plannedTables(ctx.plannedPersons || []);
  const bench = ctx.benchmark || null;
  const relevant = !!bench && benchmarkRelevant(ctx.filter, bench.kind);
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
        // Differenz in Prozentpunkten für die Kachel (A.4); null ohne Wert auf einer Seite.
        // Ohne benchmarkrelevanten Filter gar nicht setzen (A2): common.js rendert die Zeile dann nicht.
        if (relevant) k.delta = Number.isFinite(k.raw) && Number.isFinite(b.raw) ? (k.raw - b.raw) * 100 : null;
      }
    }
  }
  const kpis = m.kpis.concat([{ label: 'Geplante Prüfungstermine', value: String(planned.total), n: planned.total, small: false, kind: 'count', group: 'Mengen', direction: 'neutral', hint: 'Termine in der Zukunft ohne Ergebnis (Filter Profil, Sprache, Bank, VSS/VSM)' }]);
  let benchmarkBar = null;
  if (bench) {
    const def = BENCHMARKS.find((b) => b.id === bench.kind) || {};
    if (def.hint) hints.push('Benchmark «' + bench.label + '»: ' + def.hint);
    // C5: Die Auswahl des Benchmarks steht in der Filterleiste; hier bleibt, was sie bewirkt – wie gross er ist
    benchmarkBar = el('p', { class: 'benchmark-bar', text: 'Benchmark «' + bench.label + '»: ' + bench.persons.length + ' Vorgänge'
      + (bench.persons.length === ctx.persons.length ? ' (entspricht der Auswahl, kein entsprechender Filter aktiv)' : '') });
  }
  // Ohne benchmarkrelevanten Filter zeigen beide Spalten dieselben Zahlen; statt sie aufzuklappen, ein Satz und der Weg dorthin
  const gleichstand = relevant ? null : el('p', { class: 'benchmark-gleichstand' }, [
    'Kein Filter aktiv – die Auswahl entspricht dem Benchmark «' + (bench ? bench.label : '–') + '».',
    ctx.focusFilter ? ' ' : null,
    ctx.focusFilter ? el('button', { type: 'button', class: 'linklike', text: 'Bank wählen', onclick: () => ctx.focusFilter('bank') }) : null,
  ]);
  const kpiTable = {
    title: 'Kennzahlen gesamt',
    columns: [{ key: 'label', label: 'Kennzahl' }, { key: 'value', label: 'Wert' }, { key: 'count', label: 'Anzahl' }, { key: 'n', label: 'n' }, { key: 'hint', label: 'Beschreibung' }],
    rows: kpis.map((k) => ({ label: k.label, value: k.value, count: k.count === null || k.count === undefined ? '' : k.count, n: k.n, hint: k.hint, small: k.small })),
  };
  return {
    nodes: [
      // D2: Signale zuerst – sie beantworten «worauf schaue ich heute», und das gehört nicht unter zwölf Kacheln
      signalBlock(ctx.signale, { onWeg: ctx.onSignalWeg, filterKurz: ctx.filterKurz }),
      benchmarkBar,
      renderKpis(kpis, { glossaryHref: ctx.glossaryHref }),
      // Phone (B.4): Benchmark-Tabelle und Mehrfachprofile eingeklappt, Kennzahlen je Profil offen
      gleichstand, // steht sichtbar vor der eingeklappten Tabelle – im Aufklapper würde die Begründung niemand lesen
      comparison ? sec('Auswahl im Vergleich zum Benchmark', [renderTable(comparison)],
        'Differenz in Prozentpunkten: Auswahl minus Benchmark. Der Benchmark verwendet dieselben Filter wie die Auswahl, nur ohne die gewählte Einschränkung.',
        null, { phoneCollapsed: true, collapsed: !relevant }) : null,
      section('Kennzahlen je Profil', [renderTable(m.byProfil)]),
      sec('Personen mit mehreren Profilen', [renderTable(m.multi)], 'Menschen mit Zertifizierungsvorgängen in mehr als einem Profil, gruppiert nach der zeitlichen Abfolge der Profile.', null, { phoneCollapsed: true }),
    ],
    tables: (comparison ? [kpiTable, comparison, m.byProfil] : [kpiTable, m.byProfil]).concat([m.multi]),
    hints,
  };
}
