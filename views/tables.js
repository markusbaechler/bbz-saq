// views/tables.js – reine Tabellenmodelle für die Views (kein DOM), getestet in tests/tables.test.js.
// Jede Tabelle: { title, columns: [{ key, label }], rows: [{ … , small }], note }.
// Prozent mit 1 Dezimale, immer mit n; Gruppen mit n < 5 tragen die Markierung «*».

import {
  MODE, SMALL_N, formatPct, writtenPassRates, writtenPerformance, partFirstAttempt, oralPassRates, oralPerformance,
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
  const row = (label, small, n, r) => ({ gruppe: mark(label, small), n, small, erstversuch: formatPct(r.erstversuch.pct), durchgefallen: formatPct(r.erstversuchFailed.pct), gesamt: formatPct(r.gesamt.pct) });
  const rows = [row('Gesamt', smallTotal, persons.length, total)];
  for (const g of byGroup(persons, key, writtenPassRates)) rows.push(row(groupLabel(g.key), g.small, g.n, g.value));
  return {
    title: 'Bestehensquote schriftlich nach ' + GROUP_LABELS[key],
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n'), col('erstversuch', 'Im 1. Versuch bestanden'), col('durchgefallen', 'Im 1. Versuch durchgefallen'), col('gesamt', 'Insgesamt bestanden')],
    rows,
    note: SMALL_NOTE + '; 1. Versuch: Nenner sind Personen mit absolviertem RUN1',
  };
}

// kind: 'written' | 'oral' – beide Wertungen nebeneinander (Resultat des 1. Versuchs, Resultat des bestandenen Runs)
export function performanceTable(persons, key, kind = 'written') {
  const fn = kind === 'oral' ? oralPerformance : writtenPerformance;
  const row = (label, ps) => {
    const first = fn(ps, MODE.ERSTVERSUCH);
    const passed = fn(ps, MODE.BESTANDEN);
    return { gruppe: mark(label, first.n < SMALL_N), n: first.n, small: first.n < SMALL_N, mean1: formatPct(first.mean), n2: passed.n, mean2: formatPct(passed.mean) };
  };
  const rows = [row('Gesamt', persons)];
  for (const g of byGroup(persons, key, (ps) => ps)) rows.push(row(groupLabel(g.key), g.value));
  return {
    title: 'Ø Resultat ' + (kind === 'oral' ? 'mündlich' : 'schriftlich') + ' nach ' + GROUP_LABELS[key],
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n (1. Versuch)'), col('mean1', 'Ø Resultat 1. Versuch'), col('n2', 'n (bestanden)'), col('mean2', 'Ø Resultat bestandener Run')],
    rows,
    note: SMALL_NOTE + '; Resultat = erreichte Punkte in Prozent; «bestandener Run» nur für Personen, deren absolvierte Teilprüfungen alle bestanden sind',
  };
}

// Je Teilprüfung (kind 'we' | 'oe'): 1. Versuch bestanden/durchgefallen, insgesamt bestanden, Ø beider Wertungen
export function partTable(persons, kind = 'we') {
  const rows = partFirstAttempt(persons, kind).map((p) => ({
    gruppe: mark(p.label, p.n < SMALL_N), n: p.n, small: p.n < SMALL_N,
    bestanden1: formatPct(p.passed.pct), durchgefallen1: formatPct(p.failed.pct), gesamt: formatPct(p.anyPassed.pct),
    mean1: formatPct(p.meanFirst.mean), mean2: formatPct(p.meanPassed.mean),
  }));
  return {
    title: (kind === 'oe' ? 'Mündlich' : 'Schriftlich') + ' je Teilprüfung',
    columns: [col('gruppe', 'Teilprüfung'), col('n', 'n'), col('bestanden1', 'Im 1. Versuch bestanden'), col('durchgefallen1', 'Im 1. Versuch durchgefallen'), col('gesamt', 'Insgesamt bestanden'), col('mean1', 'Ø Resultat 1. Versuch'), col('mean2', 'Ø Resultat bestandener Run')],
    rows,
    note: SMALL_NOTE + '; n = Personen mit absolviertem RUN1 der Teilprüfung',
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
    columns: [col('gruppe', GROUP_LABELS[key]), col('n', 'n'), col('bestanden', 'Bestanden'), col('failed1', 'Im 1. Versuch durchgefallen'), col('failed2', '2× durchgefallen')],
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
    columns: [col('gruppe', 'Gruppe'), col('profil', 'Profil'), col('n', 'n'), col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden')],
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

export function overviewModel(persons) {
  const o = overview(persons, MODE.ERSTVERSUCH);
  const wp1 = writtenPerformance(persons, MODE.ERSTVERSUCH);
  const wp2 = writtenPerformance(persons, MODE.BESTANDEN);
  const op1 = oralPerformance(persons, MODE.ERSTVERSUCH);
  const op2 = oralPerformance(persons, MODE.BESTANDEN);
  const kpi = (label, value, n, hint) => ({ label, value, n, small: n < SMALL_N, hint });
  const kpis = [
    kpi('Personen', String(o.n), o.n, 'Personen im Filter mit mindestens einem absolvierten, datierten schriftlichen Run'),
    kpi('Schriftlich: im 1. Versuch bestanden', formatPct(o.written.erstversuch.pct), o.written.erstversuch.n, 'Anteil Personen, die alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden haben'),
    kpi('Schriftlich: im 1. Versuch durchgefallen', formatPct(o.written.erstversuchFailed.pct), o.written.erstversuchFailed.n, 'Anteil Personen mit mindestens einer Teilprüfung, die im ersten Versuch nicht bestanden wurde'),
    kpi('Schriftlich: insgesamt bestanden', formatPct(o.written.gesamt.pct), o.written.gesamt.n, 'Anteil Personen mit «WE All Passed» = yes, unabhängig von der Anzahl Versuche'),
    kpi('Schriftlich: Ø Resultat 1. Versuch', formatPct(wp1.mean), wp1.n, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des ersten Versuchs je Teilprüfung'),
    kpi('Schriftlich: Ø Resultat bestandener Run', formatPct(wp2.mean), wp2.n, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des bestandenen Runs; nur Personen, deren Teilprüfungen alle bestanden sind'),
    kpi('Mündlich: bestanden', formatPct(o.oral.bestanden.pct), o.oral.bestanden.n, 'Anteil Personen mit «OE All Passed» = yes; n = Personen mit absolvierter mündlicher Prüfung OE1'),
    kpi('Mündlich: im 1. Versuch durchgefallen', formatPct(o.oral.failed1.pct), o.oral.failed1.n, 'OE1 im ersten Versuch nicht bestanden, unabhängig vom späteren Erfolg'),
    kpi('Mündlich: 2× durchgefallen', formatPct(o.oral.failed2.pct), o.oral.failed2.n, 'OE1 im ersten und im zweiten Versuch nicht bestanden'),
    kpi('Mündlich: Ø Resultat 1. Versuch', formatPct(op1.mean), op1.n, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), erster Versuch'),
    kpi('Mündlich: Ø Resultat bestandener Run', formatPct(op2.mean), op2.n, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), bestandener Run'),
    kpi('VSS / VSM', o.vss + ' / ' + o.vsm, o.n, 'Anzahl Personen mit Kennzeichnung VSS bzw. VSM aus dem Kommentar auf der Namenszelle'),
    kpi('Ausgestellte Zertifikate', String(o.issued), o.n, 'Personen aus dem Sheet «Ausgestellte Zertifikate» im Filter'),
  ];
  const byProfil = {
    title: 'Kennzahlen je Profil',
    columns: [col('gruppe', 'Profil'), col('n', 'n'), col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('durchgefallen', 'Schriftlich im 1. Versuch durchgefallen'), col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden')],
    rows: o.byProfil.map((g) => ({
      gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small,
      erstversuch: formatPct(g.value.written.erstversuch.pct), durchgefallen: formatPct(g.value.written.erstversuchFailed.pct),
      gesamt: formatPct(g.value.written.gesamt.pct), muendlich: formatPct(g.value.oral.bestanden.pct),
    })),
    note: SMALL_NOTE,
  };
  return { kpis, byProfil };
}
