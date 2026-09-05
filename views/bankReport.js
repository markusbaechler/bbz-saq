// views/bankReport.js – Ansicht «Bank-Report» (b2): Zahlen einer Bank gegen den anonymen Benchmark «alle Banken».
// Für die Weitergabe an das Institut: keine Namen, keine anderen Banken einzeln; PDF über die Druckansicht des Browsers.
// Voraussetzung: in der Filterleiste genau eine Bank gewählt.

import { bankReportTables } from './tables.js';
import { renderTable, section, el } from './common.js';
import { printPage } from '../export.js';

export const id = 'bank-report';
export const label = 'Bank-Report';
export const noPersonExport = true; // keine Vorgangsebene (Namen) in dieser Ansicht

export function build(ctx) {
  const banks = (ctx.filter && ctx.filter.bank) || [];
  if (banks.length !== 1) {
    return {
      nodes: [el('p', { class: 'empty', text: 'Bitte in der Filterleiste genau eine Bank wählen. Der Report zeigt deren Kennzahlen im Vergleich zu allen Banken (gleicher Zeitraum, gleiche übrigen Filter) – ohne Namen und ohne andere Banken einzeln.' })],
      tables: [],
    };
  }
  const bank = banks[0];
  const t = bankReportTables(ctx.persons, ctx.bankBenchmarkPersons || ctx.persons, bank);
  const head = ctx.headerLines || [];
  return {
    nodes: [
      el('div', { class: 'toolbar' }, [
        el('button', { type: 'button', text: 'Bank-Report drucken / als PDF speichern', onclick: () => printPage() }),
        el('span', { class: 'meta-list', text: 'Druckansicht enthält nur diesen Report mit Filterzustand; im Druckdialog «Als PDF speichern» wählen.' }),
      ]),
      el('div', { class: 'report-head' }, [
        el('h3', { text: 'bbz Zertifizierungs-Cockpit – Bank-Report ' + bank }),
        el('p', { class: 'meta-list', text: head.join(' · ') }),
        el('p', { class: 'meta-list', text: 'Kennzahlen der Zertifizierungsvorgänge von ' + bank + ' im Vergleich zum Benchmark «alle Banken» (derselbe Zeitraum, dieselben übrigen Filter). Der Benchmark ist ein Aggregat; andere Institute werden nicht einzeln ausgewiesen. Definitionen: Glossar des Cockpits.' }),
      ]),
      section('Kennzahlen im Vergleich', [renderTable(t.kpis)]),
      section('Je Profil', [renderTable(t.byProfil)]),
      section('Verlauf je Jahr', [renderTable(t.verlauf)]),
    ],
    tables: [t.kpis, t.byProfil, t.verlauf],
  };
}
