// views/overview.js – View 1 «Übersicht»: KPIs gesamt für den aktiven Filter, Kennzahlen je Profil.

import { overviewModel, plannedTables, comparisonTable, messzeilenEingaben, kennzahlenExportTable } from './tables.js';
import { renderKpis, renderTable, section, hinted, el, signalBlock, isPhone, messzeileModell, messzeilenBlock } from './common.js';
import { renderDotChart } from './chart.js';
import { BENCHMARKS, benchmarkFilter, DEFAULT_FILTER, formatPct } from '../metrics.js';

export const id = 'uebersicht';
export const label = 'Übersicht';
export const group = null; // eigenes Ziel im Band (Paket E)
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
        // Rohwert für Marke und Abstand der Messzeile – wie die Delta-Zeile der Kachel nur mit benchmarkrelevantem
        // Filter (Paket BEFUNDE, A2): Ohne ihn ist die Auswahl der Benchmark, und «● 0.0 pp» sagt nichts.
        if (relevant) k.benchmarkRaw = b.raw;
        // Differenz in Prozentpunkten für die Kachel (A.4); null ohne Wert auf einer Seite.
        // Ohne benchmarkrelevanten Filter gar nicht setzen (A2): common.js rendert die Zeile dann nicht.
        if (relevant) k.delta = Number.isFinite(k.raw) && Number.isFinite(b.raw) ? (k.raw - b.raw) * 100 : null;
      }
    }
  }
  const kpis = m.kpis.concat([{ label: 'Geplante Prüfungstermine', value: String(planned.total), n: planned.total, small: false, kind: 'count', group: 'Mengen', direction: 'neutral', hint: 'Termine in der Zukunft ohne Ergebnis (Filter Profil, Sprache, Bank, VSS/VSM)' }]);
  // M3: Die sechs Quoten der Blöcke «Schriftlich» und «Mündlich» werden Messzeilen und stehen zuoberst; Mengen und
  // die vier Ø-Kennzahlen bleiben Kacheln und folgen darunter. Gemessen bei 1400 × 900: So endet die letzte Messzeile
  // bei y = 771 statt y = 1119 (letzte Quoten-Kachel vorher) und liegt damit über der Falz. Blieben die Kacheln oben,
  // läge sie bei 1056 – die Reihenfolge ist der einzige Weg zum Zielmass, ohne etwas einzuklappen.
  const messzeilen = messzeilenEingaben(ctx.persons, kpis, { benchmarkLabel: bench ? bench.label : null });
  const quotenLabels = new Set(messzeilen.map((z) => z.label));
  // Das Komplement der Erstversuchsquote erscheint auf der Übersicht gar nicht mehr: Es sagt dasselbe wie die Zeile
  // darüber, nur andersherum. Als Kennzahl bleibt es in der Vergleichstabelle, im Export und in «Schriftlich».
  const NICHT_AUF_DER_UEBERSICHT = ['Schriftlich: im 1. Versuch durchgefallen'];
  const kachelKpis = kpis
    .filter((k) => !quotenLabels.has(k.label) && !NICHT_AUF_DER_UEBERSICHT.includes(k.label))
    // Die Ø-Kennzahlen tragen die Streuungszeile aus Paket G; sie bleiben Kacheln und stehen zusammen in einem Block
    .map((k) => (k.kind === 'mean' ? { ...k, group: 'Ø Resultat' } : k));
  // Ein Block statt zwei: Die gemeinsame Skala ist der ganze Sinn der Messzeile – sechs Quoten auf einer Spur sind
  // vergleichbar, zwei Spuren untereinander wären es nicht. Gemessen kostet ein zweiter Block ausserdem 82 px, und
  // genau die fehlen im echten Fall am Zielmass (922 statt 840 px bei sechs Signalen).
  const quotenModelle = messzeilen.map((z) => messzeileModell(z.eingabe));
  const quotenBlock = quotenModelle.length ? el('section', { class: 'kpi-group' }, [
    messzeilenBlock('Quoten', quotenModelle, { referenzLabel: relevant && bench ? bench.label : null }),
  ]) : null;
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
  const kpiTable = kennzahlenExportTable(kpis);
  return {
    nodes: [
      // D2: Signale zuerst – sie beantworten «worauf schaue ich heute», und das gehört nicht unter zwölf Kacheln
      signalBlock(ctx.signale, { onWeg: ctx.onSignalWeg, filterKurz: ctx.filterKurz }),
      benchmarkBar,
      // M3: Die sechs Quoten der Blöcke «Schriftlich» und «Mündlich» stehen als Messzeilen auf einer gemeinsamen
      // Skala; die Kacheln bleiben für die Mengen und für die vier Ø-Kennzahlen, die ihre Streuungszeile tragen.
      quotenBlock ? el('div', { class: 'kpi-groups' }, [quotenBlock]) : null,
      renderKpis(kachelKpis, { glossaryHref: ctx.glossaryHref, gruppen: ['Mengen', 'Ø Resultat'] }),
      // Phone (B.4): Benchmark-Tabelle und Mehrfachprofile eingeklappt, Kennzahlen je Profil offen
      gleichstand, // steht sichtbar vor der eingeklappten Tabelle – im Aufklapper würde die Begründung niemand lesen
      comparison ? sec('Auswahl im Vergleich zum Benchmark', [renderTable(comparison)],
        'Differenz in Prozentpunkten: Auswahl minus Benchmark. Der Benchmark verwendet dieselben Filter wie die Auswahl, nur ohne die gewählte Einschränkung.',
        null, { phoneCollapsed: true, collapsed: !relevant }) : null,
      // M2: Sechs Punkte mit Wilson-Balken gegen die Linie auf dem Gesamtwert lesen sich schneller als acht Spalten.
      // Die Tabelle bleibt darunter stehen (Tabellen-Zwilling) und im Export – sie verschwindet nicht.
      section('Kennzahlen je Profil', [
        m.profilPunkte.punkte.length ? renderDotChart(m.profilPunkte.punkte, {
          title: m.profilPunkte.titel,
          yFormat: (v) => formatPct(v, 0),
          referenz: m.profilPunkte.referenz,
          compact: isPhone(),
          ariaLabel: 'Punktdiagramm: Anteil im ersten Versuch bestandener Vorgänge je Profil mit 95-Prozent-Wilson-Intervall, senkrechte Linie auf dem Gesamtwert; alle Zahlen in der Tabelle darunter',
        }) : null,
        renderTable(m.byProfil),
      ].filter(Boolean)),
      sec('Personen mit mehreren Profilen', [renderTable(m.multi)], 'Menschen mit Zertifizierungsvorgängen in mehr als einem Profil, gruppiert nach der zeitlichen Abfolge der Profile.', null, { phoneCollapsed: true }),
    ],
    tables: (comparison ? [kpiTable, comparison, m.byProfil] : [kpiTable, m.byProfil]).concat([m.multi]),
    hints,
  };
}
