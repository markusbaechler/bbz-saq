// views/written.js – View 2 «Schriftlich»: Bestehensquoten und Ø Performance nach Profil, Sprache, Bank, Teilprüfung;
// Verteilung der Resultate als Histogramm (PROMPT-2 Paket G, Stufe 4).

import { passRateTable, performanceTable, partTable, histogramModel, quotenPunkte, teilPunkte, GROUP_LABELS } from './tables.js';
import { renderTable, hinted, el, isPhone } from './common.js';

import { renderBarChart, punktDiagramm } from './chart.js';
import { formatPct, SMALL_N } from '../metrics.js';

export const id = 'schriftlich';
export const label = 'Schriftlich';
export const group = 'Prüfungen'; // Geschwister unter diesem Primärziel (Paket E)
export const intro = 'Bestehensquoten und Ø Resultat schriftlich nach Profil, Sprache, Bank und Teilprüfung; beide Wertungen nebeneinander.';
export const glossar = 'Schriftlich: im 1. Versuch bestanden';
// Wirksamkeit der Filterleiste (A1/C5): Der Benchmark wirkt hier über das Histogramm (Auswahl gegen Benchmark).
export const filters = { benchmark: true };

const KEYS = ['profil', 'sprache', 'employerCanon'];

// Histogramm der Resultate (Wertung 1. Versuch), Auswahl gegen den Benchmark der Übersicht (ctx.benchmark); n < 5 → Hinweis statt
// Diagramm, die Tabelle (Tabellen-Zwilling, Export) bleibt. Auch von der Ansicht «Mündlich» genutzt (kind 'oral').
export function histogramSection(ctx, kind, sec) {
  const benchLabel = ctx.benchmark ? ctx.benchmark.label : 'Benchmark';
  const hist = histogramModel(ctx.persons, ctx.benchmark ? ctx.benchmark.persons : null, kind, { benchmarkLabel: benchLabel });
  const title = 'Verteilung der Resultate (1. Versuch)';
  const chart = hist.small
    ? el('p', { class: 'empty', text: 'Verteilung erst ab ' + SMALL_N + ' Vorgängen mit Wert (n = ' + hist.n + '); die Tabelle zeigt die Anzahl je Klasse.' })
    : renderBarChart(hist.series, {
      title, yFormat: (v) => formatPct(v, 0), compact: isPhone(),
      ariaLabel: 'Balkendiagramm: Anteil der Vorgänge je Resultatklasse à 10 Prozentpunkte, Auswahl und Benchmark «' + benchLabel + '»; Werte in der Tabelle darunter',
    });
  const node = sec(title, [chart, renderTable(hist.table)],
    'Resultat je Vorgang (Mittel der Teilprüfungen, Wertung 1. Versuch) in Klassen à 10 Prozentpunkte, Anteil an den Vorgängen mit Wert; Auswahl gegen den Benchmark der Übersicht («' + benchLabel + '»'
      + (hist.benchmarkSmall ? ', ohne Reihe, weil n < ' + SMALL_N : '') + '). Zeigt die Form der Verteilung, die Ø und σ allein nicht verraten, etwa Ausreisser nach unten.',
    null, { phoneCollapsed: true });
  return { node, table: hist.table };
}

export function build(ctx) {
  const rates = KEYS.map((k) => passRateTable(ctx.persons, k));
  // H2: Drei strukturgleiche Tabellen, die sich nur in der Gruppierung unterscheiden – genau der Fall für das
  // Punktdiagramm: eine Quote je Gruppe mit Intervall gegen den Gesamtwert. Gezeigt wird die Durchfallquote im
  // ersten Versuch, wie in der Übersicht. Die Tabelle bleibt darunter stehen und im Export.
  const punkte = KEYS.map((k) => quotenPunkte(ctx.persons, k, { titel: 'Im 1. Versuch durchgefallen nach ' + GROUP_LABELS[k] }));
  const parts = partTable(ctx.persons, 'we');
  const perf = KEYS.map((k) => performanceTable(ctx.persons, k, 'written'));
  const hints = [];
  const sec = hinted(hints);
  const hist = histogramSection(ctx, 'written', sec);
  return {
    nodes: [
      sec('Bestehensquoten (Anteil Vorgänge)', rates.flatMap((t, i) => [punktDiagramm(punkte[i]), renderTable(t)]).filter(Boolean),
        'Im 1. Versuch bestanden: alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden. Im 1. Versuch durchgefallen: mindestens eine Teilprüfung im ersten Versuch nicht bestanden (Nenner: Vorgänge mit absolviertem RUN1). Insgesamt bestanden: «WE All Passed» = yes, unabhängig von der Anzahl Versuche (Nenner: abgeschlossene Vorgänge, d. h. bestanden oder nicht bestanden). Offen = Gesamtergebnis leer, der Prozess läuft noch; nicht erfasst = Gesamtergebnis unlesbar (Data-Quality-Log).'),
      sec('Je Teilprüfung WE1–WE6', [punktDiagramm(teilPunkte(ctx.persons, 'we')), renderTable(parts)].filter(Boolean),
        'Anteile und Ø Resultat je Teilprüfung; n = Vorgänge mit absolviertem ersten Versuch der Teilprüfung. Das Punktdiagramm zeigt die Durchfallquote im 1. Versuch je Teilprüfung mit 95-%-Wilson-Intervall und ohne Bezugslinie: Ein Gesamtwert über alle Teilprüfungen hätte einen anderen Nenner als die einzelnen Zeilen. Verglichen werden die Teilprüfungen untereinander – überlappen zwei Intervalle nicht, ist der Unterschied gesichert.'),
      sec('Ø Resultat (erreichte Punkte in Prozent)', perf.map((t) => renderTable(t)),
        'Je Vorgang Mittel über die vorhandenen Teilprüfungen, danach Mittel über die Vorgänge. Beide Wertungen nebeneinander: Resultat des ersten Versuchs und Resultat des bestandenen Runs.'),
      hist.node,
    ],
    tables: rates.concat([parts], perf, [hist.table]),
    hints,
  };
}
