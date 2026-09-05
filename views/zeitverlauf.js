// views/zeitverlauf.js – Ansicht «Zeitverlauf» (P6): Kennzahlen je Jahr (a1), zwei Jahre vergleichen (a6),
// Schwierigkeit je Teilprüfung über die Jahre (b6). Der Zeitraumfilter wirkt hier nicht (alle Jahre), die übrigen Filter schon.

import { timeSeriesTable, timeSeriesByProfileTable, timeSeriesChartSeries, yearComparisonTable, defaultCompareYears, difficultyTables, throughputTables } from './tables.js';
import { renderTable, section, el } from './common.js';
import { renderLineChart } from './chart.js';
import { formatPct, yearsOf } from '../metrics.js';

export const id = 'zeitverlauf';
export const label = 'Zeitverlauf';

export function build(ctx) {
  const persons = ctx.timePersons || [];
  const years = yearsOf(persons);
  const chartSeries = timeSeriesChartSeries(persons);
  const perYear = timeSeriesTable(persons);
  const perProfile = timeSeriesByProfileTable(persons);
  const diff = difficultyTables(persons);
  const through = throughputTables(persons);
  const compare = (ctx.compare && years.includes(ctx.compare.a) && years.includes(ctx.compare.b)) ? ctx.compare : defaultCompareYears(persons);
  const comparison = compare ? yearComparisonTable(persons, compare.a, compare.b) : null;
  const yearSelect = (value, onChange) => {
    const sel = el('select', { onchange: (ev) => onChange(Number(ev.target.value)) }, years.map((y) => el('option', { value: String(y), text: String(y) })));
    sel.value = String(value);
    return sel;
  };
  const compareBar = compare ? el('div', { class: 'toolbar' }, [
    el('label', { class: 'inline' }, ['Jahr A ', yearSelect(compare.a, (a) => ctx.onCompareChange && ctx.onCompareChange({ a, b: compare.b }))]),
    el('label', { class: 'inline' }, ['Jahr B ', yearSelect(compare.b, (b) => ctx.onCompareChange && ctx.onCompareChange({ a: compare.a, b }))]),
    el('span', { class: 'meta-list', text: 'Differenz = Jahr A minus Jahr B in Prozentpunkten. Standard: die zwei jüngsten Jahre mit Daten.' }),
  ]) : null;
  const pct = (v) => formatPct(v, 0);
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Entwicklung der Kennzahlen je Jahr des Referenzdatums (bestandene mündliche Prüfung, sonst letzte Prüfung). Die Filter Profil, Sprache, Bank, VSS/VSM, Versuche und «nur ausgestellte Zertifikate» gelten; der Zeitraumfilter wirkt hier nicht, damit alle Jahre sichtbar bleiben. Jahre mit weniger als 5 Vorgängen sind mit * markiert (hohle Marker).' }),
      years.length ? section('Bestehensquoten je Jahr', [
        renderLineChart(chartSeries.quoten, { title: 'Bestehensquoten je Jahr', yFormat: pct, yMax: 1, ariaLabel: 'Liniendiagramm: Bestehensquoten schriftlich (1. Versuch, insgesamt) und mündlich je Jahr; Werte in der Tabelle «Kennzahlen je Jahr»' }),
        renderLineChart(chartSeries.resultate, { title: 'Ø Resultate je Jahr (1. Versuch)', yFormat: pct, yMax: 1, ariaLabel: 'Liniendiagramm: Ø Resultat schriftlich und mündlich im 1. Versuch je Jahr; Werte in der Tabelle «Kennzahlen je Jahr»' }),
        renderTable(perYear),
      ]) : el('p', { class: 'empty', text: 'Keine Vorgänge mit Referenzdatum im aktiven Filter.' }),
      section('Kennzahlen je Profil und Jahr', [renderTable(perProfile)]),
      comparison ? section('Zwei Jahre vergleichen', [compareBar, renderTable(comparison)], { intro: 'Dieselben Kennzahlen wie in der Übersicht für zwei Jahre nebeneinander.' }) : null,
      section('Schwierigkeit je Teilprüfung', [renderTable(diff.pivot), renderTable(diff.long)], {
        intro: 'Wie streng oder leicht war eine Teilprüfung in einem Jahr? Durchfallquote und Ø Resultat des ersten Versuchs je WE1–WE6 und OE1–OE2, Jahr = Datum des ersten Versuchs. Hohe Durchfallquoten bei gleichbleibenden Kandidatinnen und Kandidaten deuten auf die Prüfung, nicht auf die Teilnehmenden.',
      }),
      section('Durchlaufzeit', [renderTable(through.byProfil), renderTable(through.byYear)], {
        intro: 'Tage vom ersten Prüfungsdatum bis zur bestandenen mündlichen Prüfung (nur bestandene Vorgänge) sowie bis zum Zertifikatsbeginn, wo «Certificate Start Date» vorhanden ist. Median ist robuster als der Mittelwert.',
      }),
    ],
    tables: [perYear, perProfile].concat(comparison ? [comparison] : [], [diff.pivot, diff.long, through.byProfil, through.byYear]),
  };
}
