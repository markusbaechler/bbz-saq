// views/tables.js – reine Tabellenmodelle für die Views (kein DOM), getestet in tests/tables.test.js.
// Jede Tabelle: { title, columns: [{ key, label }], rows: [{ … , small }], note }.
// Prozent mit 1 Dezimale, immer mit n; Gruppen mit n < 5 tragen die Markierung «*».

import {
  MODE, SMALL_N, formatPct, writtenPassRates, writtenPerformance, writtenPerformanceByPart, oralPassRates, oralPerformance,
  byGroup, vssVsmBreakdown, topWritten, topOral, awardRanking, overview, plannedRuns, plannedGroups,
} from '../metrics.js';
import { fmtDate, fmtTime } from '../export.js';

export const SMALL_MARK = '*';
export const SMALL_NOTE = SMALL_MARK + ' Gruppe mit n < ' + SMALL_N + ' (Aussagekraft eingeschränkt)';

export const GROUP_LABELS = { profil: 'Profil', sprache: 'Sprache', employerCanon: 'Bank' };

export function groupLabel(value) {
  return value === null || value === undefined || value === '' ? 'unbekannt' : String(value);
}

function mark(label, small) {
  return small ? label + ' ' + SMALL_MARK : label;
}

function personName(p) {
  return [p.lastName, p.firstName].filter((x) => x).join(' ');
}

function col(key, label) {
  return { key, label };
}

// ---------------------------------------------------------------------------
// Schriftlich
// ---------------------------------------------------------------------------

export function passRateTable(persons, key) {
  const total = writtenPassRates(persons);
  const smallTotal = persons.length < SMALL_N;
  const rows = [{ gruppe: mark('Gesamt', smallTotal), n: persons.length, small: smallTotal, erstversuch: formatPct(total.erstversuch.pct), gesamt: formatPct(total.gesamt.pct) }];
  for (const g of byGroup(persons, key, writtenPassRates)) {
    rows.push({ gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small, erstversuch: formatPct(g.value.erstversuch.pct), gesamt: formatPct(g.value.gesamt.pct) });
  }
  return {
    title: 'Bestehensquote schriftlich nach ' + GROUP_LABELS[key],
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n'), col('erstversuch', 'Erstversuchsquote'), col('gesamt', 'Gesamterfolgsquote')],
    rows,
    note: SMALL_NOTE,
  };
}

// kind: 'written' | 'oral'
export function performanceTable(persons, key, mode, kind = 'written') {
  const fn = kind === 'oral' ? oralPerformance : writtenPerformance;
  const total = fn(persons, mode);
  const rows = [{ gruppe: mark('Gesamt', total.n < SMALL_N), n: total.n, small: total.n < SMALL_N, mean: formatPct(total.mean) }];
  for (const g of byGroup(persons, key, (ps) => fn(ps, mode))) {
    const small = g.value.n < SMALL_N;
    rows.push({ gruppe: mark(groupLabel(g.key), small), n: g.value.n, small, mean: formatPct(g.value.mean) });
  }
  return {
    title: 'Ø Performance ' + (kind === 'oral' ? 'mündlich' : 'schriftlich') + ' nach ' + GROUP_LABELS[key] + ' (' + (mode === MODE.BESTANDEN ? 'Bestanden' : 'Erstversuch') + ')',
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n'), col('mean', 'Ø Performance')],
    rows,
    note: SMALL_NOTE,
  };
}

export function performanceByPartTable(persons, mode) {
  const rows = writtenPerformanceByPart(persons, mode).map((p) => ({ gruppe: mark('WE' + p.part, p.n < SMALL_N), n: p.n, small: p.n < SMALL_N, mean: formatPct(p.mean) }));
  return {
    title: 'Ø Performance schriftlich je Teilprüfung (' + (mode === MODE.BESTANDEN ? 'Bestanden' : 'Erstversuch') + ')',
    columns: [col('gruppe', 'Teilprüfung'), col('n', 'n'), col('mean', 'Ø Performance')],
    rows,
    note: SMALL_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Mündlich
// ---------------------------------------------------------------------------

function oralRow(label, rates) {
  const n = rates.bestanden.n;
  return { gruppe: mark(label, n < SMALL_N), n, small: n < SMALL_N, bestanden: formatPct(rates.bestanden.pct), failed1: formatPct(rates.failed1.pct), failed2: formatPct(rates.failed2.pct) };
}

export function oralRateTable(persons, key) {
  const rows = [oralRow('Gesamt', oralPassRates(persons))];
  for (const g of byGroup(persons, key, oralPassRates)) rows.push(oralRow(groupLabel(g.key), g.value));
  return {
    title: 'Bestehensquote mündlich nach ' + GROUP_LABELS[key],
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n'), col('bestanden', 'Bestanden'), col('failed1', '1× durchgefallen'), col('failed2', '2× durchgefallen')],
    rows,
    note: SMALL_NOTE + '; n = Personen mit absolviertem, datiertem OE1 RUN1',
  };
}

// ---------------------------------------------------------------------------
// VSS / VSM
// ---------------------------------------------------------------------------

export function vssVsmTable(persons) {
  const b = vssVsmBreakdown(persons);
  const rows = [];
  const push = (gruppe, profil, n, small, written, oral) => rows.push({
    gruppe, profil, n, small, erstversuch: formatPct(written.erstversuch.pct), gesamt: formatPct(written.gesamt.pct), muendlich: formatPct(oral.bestanden.pct),
  });
  for (const [gruppe, block] of [['VSS', b.vss], ['VSM', b.vsm], ['ohne', b.ohne]]) {
    push(gruppe, 'alle', block.n, block.small, block.written, block.oral);
    for (const g of block.byProfil) push(gruppe, groupLabel(g.key), g.n, g.small, g.value.written, g.value.oral);
  }
  return {
    title: 'Bestehensquoten VSS / VSM / ohne, je Profil',
    columns: [col('gruppe', 'Gruppe'), col('profil', 'Profil'), col('n', 'n'), col('erstversuch', 'Schriftlich Erstversuch'), col('gesamt', 'Schriftlich gesamt'), col('muendlich', 'Mündlich bestanden')],
    rows,
    note: 'Personen mit VSS und VSM zählen in beiden Gruppen; Zeilen mit n < ' + SMALL_N + ' sind eingeschränkt aussagekräftig',
  };
}

// ---------------------------------------------------------------------------
// Bestenlisten
// ---------------------------------------------------------------------------

function baseRankingRow(e) {
  return { rang: e.rank, name: personName(e.person), bank: e.person.employerCanon || '', wert: formatPct(e.score), versuche: e.attempts, refDate: fmtDate(e.refDate) };
}

export function rankingTables(persons, mode, k = 5) {
  const simpleColumns = (label) => [col('rang', 'Rang'), col('name', 'Name'), col('bank', 'Bank'), col('wert', label), col('versuche', 'Versuche'), col('refDate', 'Referenzdatum')];
  const build = (groups, title, columns, mapEntry) => groups.map((g) => ({
    profil: groupLabel(g.profil),
    n: g.n,
    title: title + ' – ' + groupLabel(g.profil),
    columns,
    rows: g.entries.map(mapEntry),
  }));
  return {
    written: build(topWritten(persons, mode, k), 'Beste schriftliche Prüfung', simpleColumns('Schriftlich'), baseRankingRow),
    oral: build(topOral(persons, mode, k), 'Beste mündliche Prüfung', simpleColumns('Mündlich'), baseRankingRow),
    award: build(awardRanking(persons, mode, k), 'bbz-Award',
      [col('rang', 'Rang'), col('name', 'Name'), col('bank', 'Bank'), col('wert', 'Award-Score'), col('schriftlich', 'Schriftlich'), col('muendlich', 'Mündlich'), col('versuche', 'Versuche'), col('refDate', 'Referenzdatum')],
      (e) => ({ ...baseRankingRow(e), schriftlich: formatPct(e.written), muendlich: formatPct(e.oral) })),
  };
}

// ---------------------------------------------------------------------------
// Geplante Prüfungen
// ---------------------------------------------------------------------------

export function plannedTables(persons) {
  const runs = plannedRuns(persons);
  const groups = plannedGroups(runs);
  return {
    total: runs.length,
    summary: {
      title: 'Geplante Prüfungen je Tag und Ort',
      columns: [col('datum', 'Datum'), col('ort', 'Ort'), col('pruefungen', 'Prüfungen'), col('anzahl', 'Anzahl')],
      rows: groups.map((g) => ({ datum: fmtDate(g.day), ort: groupLabel(g.location), pruefungen: g.exams.join(', '), anzahl: g.count })),
    },
    details: {
      title: 'Geplante Prüfungen – Teilnehmende',
      columns: [col('datum', 'Datum'), col('zeit', 'Zeit'), col('ort', 'Ort'), col('pruefung', 'Prüfung'), col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('sprache', 'Sprache')],
      rows: runs.map((r) => ({
        datum: fmtDate(r.date), zeit: fmtTime(r.date), ort: groupLabel(r.location), pruefung: r.label,
        name: personName(r.person), bank: r.person.employerCanon || '', profil: groupLabel(r.person.profil), sprache: groupLabel(r.person.sprache),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

export function overviewModel(persons, mode) {
  const o = overview(persons, mode);
  const kpi = (label, value, n) => ({ label, value, n, small: n < SMALL_N });
  const kpis = [
    kpi('Personen', String(o.n), o.n),
    kpi('Schriftlich Erstversuchsquote', formatPct(o.written.erstversuch.pct), o.written.erstversuch.n),
    kpi('Schriftlich Gesamterfolgsquote', formatPct(o.written.gesamt.pct), o.written.gesamt.n),
    kpi('Schriftlich Ø Performance', formatPct(o.writtenPerf.mean), o.writtenPerf.n),
    kpi('Mündlich Bestehensquote', formatPct(o.oral.bestanden.pct), o.oral.bestanden.n),
    kpi('Mündlich 1× durchgefallen', formatPct(o.oral.failed1.pct), o.oral.failed1.n),
    kpi('Mündlich 2× durchgefallen', formatPct(o.oral.failed2.pct), o.oral.failed2.n),
    kpi('Mündlich Ø Performance', formatPct(o.oralPerf.mean), o.oralPerf.n),
    kpi('VSS / VSM', o.vss + ' / ' + o.vsm, o.n),
    kpi('Ausgestellte Zertifikate', String(o.issued), o.n),
  ];
  const byProfil = {
    title: 'Kennzahlen je Profil',
    columns: [col('gruppe', 'Profil'), col('n', 'n'), col('erstversuch', 'Schriftlich Erstversuch'), col('gesamt', 'Schriftlich gesamt'), col('muendlich', 'Mündlich bestanden')],
    rows: o.byProfil.map((g) => ({
      gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small,
      erstversuch: formatPct(g.value.written.erstversuch.pct), gesamt: formatPct(g.value.written.gesamt.pct), muendlich: formatPct(g.value.oral.bestanden.pct),
    })),
    note: SMALL_NOTE,
  };
  return { kpis, byProfil };
}
