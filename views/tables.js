// views/tables.js – reine Tabellenmodelle für die Views (kein DOM), getestet in tests/tables.test.js.
// Jede Tabelle: { title, columns: [{ key, label }], rows: [{ … , small }], note }.
// Prozent mit 1 Dezimale, immer mit n; Gruppen mit n < 5 tragen die Markierung «*».
// Begriffe (E3): «Vorgänge» für alle prüfungsbezogenen Quoten, «Personen» nur, wo Menschen gezählt werden.

import {
  MODE, SMALL_N, formatPct, writtenPassRates, writtenPerformance, partFirstAttempt, oralPassRates, oralPerformance,
  byGroup, vssVsmBreakdown, topWritten, topOral, awardRanking, overview, plannedRuns, plannedGroups, plannedByKind, dayKey,
  multiProfilePersons, personCount, excludedRows, openCases, STATUS, rankingLimit, writtenScore, oralScore, firstAttemptPassed, partResult,
  timeSeries, timeSeriesBy, partDifficultyByYear, yearsOf, refYear,
  earlyWarnings, passiveCases, throughputStats, durationDays, certificateDays, groupBy, partsByProfile, missingParts, PASSIVE_DAYS, profileParts, personIndex, passerelleFrom } from '../metrics.js';
import { compareKennzahlen, compareZaehler, compareByGroup } from '../snapshot.js';
import { fmtDate, fmtTime, MODE_LABELS } from '../export.js';

export const SMALL_MARK = '*';
export const SMALL_NOTE = SMALL_MARK + ' Gruppe mit n < ' + SMALL_N + ' (Aussagekraft eingeschränkt)';

export const GROUP_LABELS = { profil: 'Profil', sprache: 'Sprache', employerCanon: 'Bank' };

// Numerische Spalten eines Tabellenmodells (Befund 13): Zählspalten per Schlüssel sowie Spalten, deren nicht leere Werte
// alle Zahlen, Prozentwerte («83.3 %»), Prozentpunkte («+1.3 pp») oder der Strich «–» sind. Rechtsbündig mit Tabellenziffern.
const COUNT_KEYS = /^(n|n2|anzahl|rang|versuche|abgeschlossen|angetreten|offen|nichtErfasst|personen|vorgaenge|count|row|fehlversuche|tage|nZert)$/;
const NUMERIC_TEXT = /^\s*[−+±-]?\d+([.,]\d+)?\s*(%|pp)?\s*\*?\s*(\(n \d+\))?\s*$|^–$|^\d+\s*\/\s*\d+$/; // Zahl (auch ±0), Prozent, pp, Strich, «a / b», optional «(n 12)»

export function numericColumns(table) {
  const out = new Set();
  for (const c of table.columns) {
    if (COUNT_KEYS.test(c.key)) { out.add(c.key); continue; }
    const values = table.rows.map((r) => r[c.key]).filter((v) => v !== null && v !== undefined && v !== '');
    if (values.length && values.every((v) => typeof v === 'number' || (typeof v === 'string' && NUMERIC_TEXT.test(v)))) out.add(c.key);
  }
  return out;
}

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
  const row = (label, small, n, r) => ({
    gruppe: mark(label, small), n, small,
    erstversuch: formatPct(r.erstversuch.pct), durchgefallen: formatPct(r.erstversuchFailed.pct),
    gesamt: formatPct(r.gesamt.pct), abgeschlossen: r.gesamt.n, offen: r.offen, passiv: r.passiv, nichtErfasst: r.nichtErfasst,
  });
  const rows = [row('Gesamt', smallTotal, persons.length, total)];
  for (const g of byGroup(persons, key, writtenPassRates)) rows.push(row(groupLabel(g.key), g.small, g.n, g.value));
  return {
    title: 'Bestehensquote schriftlich nach ' + GROUP_LABELS[key],
    columns: [
      col('gruppe', GROUP_LABELS[key]), col('n', 'n (Vorgänge)'), col('erstversuch', 'Im 1. Versuch bestanden'), col('durchgefallen', 'Im 1. Versuch durchgefallen'),
      col('gesamt', 'Insgesamt bestanden'), col('abgeschlossen', 'n (abgeschlossen)'), col('offen', 'Offen'), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)'), col('nichtErfasst', 'Nicht erfasst'),
    ],
    rows,
    note: SMALL_NOTE + '; 1. Versuch: Nenner sind Vorgänge mit absolviertem RUN1; insgesamt bestanden: Nenner sind abgeschlossene Vorgänge (bestanden + nicht bestanden); offen = Gesamtergebnis leer (läuft noch), passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen und kein Termin; nicht erfasst = Gesamtergebnis unlesbar',
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
    note: SMALL_NOTE + '; Resultat = erreichte Punkte in Prozent; n = Vorgänge mit Wert; «bestandener Run» nur für Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind',
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
    note: SMALL_NOTE + '; n = Vorgänge mit absolviertem RUN1 der Teilprüfung',
  };
}

// ---------------------------------------------------------------------------
// Mündlich
// ---------------------------------------------------------------------------

function oralRow(label, rates) {
  const n = rates.bestanden.n;
  return {
    gruppe: mark(label, n < SMALL_N), n, small: n < SMALL_N,
    bestanden: formatPct(rates.bestanden.pct), nichtBestanden: formatPct(rates.nichtBestanden.pct), offen: rates.offen, passiv: rates.passiv, nichtErfasst: rates.nichtErfasst,
    angetreten: rates.angetreten, failed1: formatPct(rates.failed1.pct), failed2: formatPct(rates.failed2.pct),
  };
}

export function oralRateTable(persons, key) {
  const rows = [oralRow('Gesamt', oralPassRates(persons))];
  for (const g of byGroup(persons, key, oralPassRates)) rows.push(oralRow(groupLabel(g.key), g.value));
  return {
    title: 'Bestehensquote mündlich nach ' + GROUP_LABELS[key],
    columns: [
      col('gruppe', GROUP_LABELS[key]), col('n', 'n (abgeschlossen)'), col('bestanden', 'Bestanden'), col('nichtBestanden', 'Nicht bestanden'), col('offen', 'Offen'), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)'), col('nichtErfasst', 'Nicht erfasst'),
      col('angetreten', 'n (angetreten)'), col('failed1', 'Im 1. Versuch durchgefallen'), col('failed2', '2× durchgefallen'),
    ],
    rows,
    note: SMALL_NOTE + '; bestanden / nicht bestanden: Nenner sind abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden); passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen, kein Termin; durchgefallen: Nenner sind angetretene Vorgänge (absolvierter, datierter OE1 RUN1)',
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
    columns: [col('gruppe', 'Gruppe'), col('profil', 'Profil'), col('n', 'n (Vorgänge)'), col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden')],
    rows,
    note: 'Vorgänge mit VSS und VSM zählen in beiden Gruppen; Zeilen mit n < ' + SMALL_N + ' sind eingeschränkt aussagekräftig; Nenner der Quoten wie in den Ansichten Schriftlich und Mündlich',
  };
}

// ---------------------------------------------------------------------------
// Bestenlisten
// ---------------------------------------------------------------------------

function baseRankingRow(e) {
  return { rang: e.rank, name: personName(e.person), bank: e.person.employerCanon || '', wert: formatPct(e.score), versuche: e.attempts, refDate: fmtDate(e.refDate) };
}

// Begründung eines Rangs in Worten (Award-Dossier, b3)
export function rankReasonText(entry) {
  const r = entry.reason;
  if (!r || r.by === 'last') return 'Letzter gewerteter Vorgang der Gruppe; kein weiterer Vorgang mit Wert';
  const n = r.next;
  switch (r.by) {
    case 'score': return 'Score höher als Rang ' + r.vsRank + ' (' + formatPct(n.score) + ')';
    case 'attempts': return 'Gleicher Score wie Rang ' + r.vsRank + ' – Tie-Break 1: weniger Prüfungsversuche (' + entry.attempts + ' statt ' + n.attempts + ')';
    case 'refDate': return 'Gleicher Score und gleiche Versuche wie Rang ' + r.vsRank + ' – Tie-Break 2: früheres Referenzdatum (' + fmtDate(entry.refDate) + ' statt ' + (fmtDate(n.refDate) || 'ohne Datum') + ')';
    default: return 'Vollständiger Gleichstand mit Rang ' + r.vsRank + ' (Score, Versuche, Referenzdatum) – Reihenfolge alphabetisch, fachlich unentschieden';
  }
}

// Hinweis unter der Tabelle; bei gesperrten Gruppen steht der Grund bereits im Leertext (empty), darum kein zweiter Hinweis
function groupNote(g) {
  if (g.suppressed) return null;
  return 'Top ' + g.k + ' von ' + g.n + ' Vorgängen (höchstens die Hälfte der Gruppe, maximal 5); ' + g.candidates + ' mit Wert';
}

// options.dynamic (Standard true): Mindestgruppengrösse SMALL_N und dynamisches k (siehe metrics.rankingLimit)
export function rankingTables(persons, mode, k = 5, options = {}) {
  const simpleColumns = (label) => [col('rang', 'Rang'), col('name', 'Name'), col('bank', 'Bank'), col('wert', label), col('versuche', 'Versuche'), col('refDate', 'Referenzdatum')];
  const build = (groups, title, columns, mapEntry) => groups.map((g) => ({
    profil: groupLabel(g.profil),
    n: g.n,
    k: g.k,
    suppressed: g.suppressed,
    title: title + ' – ' + groupLabel(g.profil),
    columns,
    rows: g.entries.map(mapEntry),
    note: groupNote(g),
    empty: g.suppressed ? 'Keine Bestenliste: Gruppe zu klein (n = ' + g.n + ' < ' + SMALL_N + ')' : 'Keine Vorgänge mit Wert im aktiven Filter.',
  }));
  return {
    written: build(topWritten(persons, mode, k, options), 'Beste schriftliche Prüfung', simpleColumns('Schriftlich'), baseRankingRow),
    oral: build(topOral(persons, mode, k, options), 'Beste mündliche Prüfung', simpleColumns('Mündlich'), baseRankingRow),
    award: build(awardRanking(persons, mode, k, options), 'bbz-Award',
      [col('rang', 'Rang'), col('name', 'Name'), col('bank', 'Bank'), col('wert', 'Award-Score'), col('schriftlich', 'Schriftlich'), col('muendlich', 'Mündlich'), col('versuche', 'Versuche'), col('refDate', 'Referenzdatum')],
      (e) => ({ ...baseRankingRow(e), schriftlich: formatPct(e.written), muendlich: formatPct(e.oral) })),
  };
}

// Award-Dossier (b3): Vorschlagsliste je Profil mit nachvollziehbarer Begründung je Rang, als eine Tabelle exportierbar
export function awardDossierTable(persons, mode, k = 5, options = {}) {
  const groups = awardRanking(persons, mode, k, options);
  const rows = [];
  for (const g of groups) {
    for (const e of g.entries) {
      rows.push({
        profil: groupLabel(g.profil), rang: e.rank, name: personName(e.person), bank: e.person.employerCanon || '', sprache: groupLabel(e.person.sprache),
        wert: formatPct(e.score), schriftlich: formatPct(e.written), muendlich: formatPct(e.oral), versuche: e.attempts, refDate: fmtDate(e.refDate),
        sheet: e.person.sheetName, row: e.person.row, begruendung: rankReasonText(e),
      });
    }
  }
  const suppressed = groups.filter((g) => g.suppressed).map((g) => groupLabel(g.profil) + ' (n = ' + g.n + ')');
  return {
    title: 'Award-Dossier',
    columns: [
      col('profil', 'Profil'), col('rang', 'Rang'), col('name', 'Name'), col('bank', 'Bank'), col('sprache', 'Sprache'), col('wert', 'Award-Score'), col('schriftlich', 'Schriftlich'),
      col('muendlich', 'Mündlich'), col('versuche', 'Versuche'), col('refDate', 'Referenzdatum'), col('sheet', 'Sheet'), col('row', 'Zeile'), col('begruendung', 'Begründung Rang'),
    ],
    rows,
    note: 'Award-Score = 0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich; Wertung: ' + (MODE_LABELS[mode] || mode) + '. Nur Vorgänge mit bestandener mündlicher Prüfung. '
      + 'Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum. Mindestgruppengrösse ' + SMALL_N + ', Liste höchstens halbe Gruppe (maximal ' + k + ').'
      + (suppressed.length ? ' Ohne Liste (Gruppe zu klein): ' + suppressed.join(', ') + '.' : ''),
    groups: groups.map((g) => ({ profil: groupLabel(g.profil), n: g.n, k: g.k, suppressed: g.suppressed })),
  };
}

// ---------------------------------------------------------------------------
// Export auf Vorgangsebene (a7): eine Zeile je Vorgang, eine Zeile je absolviertem Run
// ---------------------------------------------------------------------------

function yesNo(v) {
  return v === true ? 'ja' : v === false ? 'nein' : '';
}

export function vorgangExportTables(persons) {
  const cases = {
    title: 'Vorgänge',
    columns: [
      col('sheet', 'Sheet'), col('row', 'Zeile'), col('name', 'Name'), col('bank', 'Bank'), col('employer', 'Employer (Rohwert)'), col('profil', 'Profil'), col('sprache', 'Sprache'), col('role', 'Role'),
      col('vss', 'VSS'), col('vsm', 'VSM'), col('status', 'Status'), col('weStatus', 'Status schriftlich'), col('oeStatus', 'Status mündlich'),
      col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('wr1', 'Ø Resultat schriftlich 1. Versuch'), col('wr2', 'Ø Resultat schriftlich bestandener Run'),
      col('or1', 'Ø Resultat mündlich 1. Versuch'), col('or2', 'Ø Resultat mündlich bestandener Run'), col('versuche', 'Versuche gesamt'),
      col('first', 'Erstes Prüfungsdatum'), col('refDate', 'Referenzdatum'), col('issued', 'Zertifikat ausgestellt'), col('certNumber', 'Zertifikat-Nr.'), col('certStart', 'Zertifikatsbeginn'),
      col('personKey', 'Personenschlüssel-Stufe'), col('duplicates', 'Zusammengeführte Zeilen'),
    ],
    rows: persons.map((p) => ({
      sheet: p.sheetName, row: p.row, name: personName(p), bank: p.employerCanon || '', employer: p.employer || '', profil: groupLabel(p.profil), sprache: groupLabel(p.sprache), role: p.role || '',
      vss: yesNo(p.vss), vsm: yesNo(p.vsm), status: p.status, weStatus: p.weStatus, oeStatus: p.oeStatus,
      erstversuch: yesNo(firstAttemptPassed(p)), wr1: formatPct(writtenScore(p, MODE.ERSTVERSUCH)), wr2: formatPct(writtenScore(p, MODE.BESTANDEN)),
      or1: formatPct(oralScore(p, MODE.ERSTVERSUCH)), or2: formatPct(oralScore(p, MODE.BESTANDEN)), versuche: p.attemptsTotal,
      first: fmtDate(p.firstExamDate), refDate: fmtDate(p.refDate), issued: yesNo(p.issued), certNumber: p.certNumber || '', certStart: fmtDate(p.certStart),
      personKey: p.personKeyLevel === 'full' ? 'Name + Geburtsdatum' : 'nur Name', duplicates: (p.duplicates || []).map((d) => d.sheet + ' Zeile ' + d.row).join('; '),
    })),
    note: 'Eine Zeile je Zertifizierungsvorgang im aktiven Filter (Duplikate zusammengeführt). Enthält Namen – nur für den internen Gebrauch (E5).',
  };
  const runRows = [];
  for (const p of persons) {
    for (const kind of ['we', 'oe']) {
      for (const part of p[kind]) {
        for (const r of part.runs) {
          if (!r.taken && !r.planned) continue;
          runRows.push({
            sheet: p.sheetName, row: p.row, name: personName(p), profil: groupLabel(p.profil), teil: kind.toUpperCase() + part.part, run: r.n,
            datum: fmtDate(r.date), zeit: fmtTime(r.date), passed: yesNo(r.passed), result: formatPct(r.result), geplant: yesNo(r.planned), ort: r.location || '',
          });
        }
      }
    }
  }
  const runs = {
    title: 'Runs',
    columns: [col('sheet', 'Sheet'), col('row', 'Zeile'), col('name', 'Name'), col('profil', 'Profil'), col('teil', 'Teilprüfung'), col('run', 'Run'), col('datum', 'Datum'), col('zeit', 'Zeit'), col('passed', 'Bestanden'), col('result', 'Resultat'), col('geplant', 'Geplant'), col('ort', 'Ort')],
    rows: runRows,
    note: 'Eine Zeile je absolviertem oder geplantem Run (Passed-Wert vorhanden bzw. Datum in der Zukunft). Score wird nicht ausgewertet (E6).',
  };
  return [cases, runs];
}

// ---------------------------------------------------------------------------
// Geplante Prüfungen
// ---------------------------------------------------------------------------

// Geplante Prüfungen, getrennt nach schriftlich (WE) und mündlich (OE): je Art eine Übersicht je Tag und Ort
// (Teilprüfungen mit Anzahl, Wiederholungen = Versuch 2 oder 3) und die Teilnehmenden. Keine Kapazitäten (b4 entfällt,
// Entscheid 06.09.2026). Namen erscheinen hier bewusst (Einteilung ist Zweck der Ansicht).
export function plannedTables(persons) {
  const runs = plannedRuns(persons);
  const byKind = plannedByKind(runs);
  return {
    total: runs.length,
    tage: new Set(runs.map((r) => dayKey(r.date))).size,
    personen: new Set(runs.map((r) => r.person.personKey)).size, // Menschen mit geplanten Terminen
    we: plannedKindTables(byKind.we, 'we'),
    oe: plannedKindTables(byKind.oe, 'oe'),
  };
}

// Excel-Datum ohne Uhrzeit = Mitternacht; dann keine Zeit anzeigen statt «00:00»
function hasTime(date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

const PLANNED_KIND = {
  we: { titel: 'Schriftliche Prüfungen', leer: 'Keine geplanten schriftlichen Prüfungen im aktiven Filter.' },
  oe: { titel: 'Mündliche Prüfungen', leer: 'Keine geplanten mündlichen Prüfungen im aktiven Filter.' },
};

// Eine Zeile je geplantem Run für Teilnehmendenlisten
function plannedRow(r) {
  return {
    datum: fmtDate(r.date), zeit: hasTime(r.date) ? fmtTime(r.date) : '', ort: groupLabel(r.location), teil: r.kind.toUpperCase() + r.part, versuch: r.run,
    name: personName(r.person), bank: r.person.employerCanon || '', profil: groupLabel(r.person.profil), sprache: groupLabel(r.person.sprache),
  };
}

function plannedKindTables(runs, kind) {
  const k = PLANNED_KIND[kind];
  const groups = plannedGroups(runs);
  return {
    total: runs.length,
    tage: new Set(runs.map((r) => dayKey(r.date))).size,
    personen: new Set(runs.map((r) => r.person.personKey)).size,
    summary: {
      title: k.titel + ' je Tag und Ort',
      columns: [col('datum', 'Datum'), col('ort', 'Ort'), col('teile', 'Teilprüfungen (Anzahl)'), col('anzahl', 'Anzahl'), col('wiederholung', 'davon Wiederholung')],
      rows: groups.map((g) => ({ datum: fmtDate(g.day), ort: groupLabel(g.location), teile: g.parts.map((p) => p.label + ' (' + p.count + ')').join(', '), anzahl: g.count, wiederholung: g.repeats })),
      empty: k.leer,
      note: 'Wiederholung = Termin für Versuch 2 oder 3 (RUN2/RUN3).',
    },
    details: {
      title: k.titel + ' – Teilnehmende',
      columns: [col('datum', 'Datum'), col('zeit', 'Zeit'), col('ort', 'Ort'), col('teil', 'Teilprüfung'), col('versuch', 'Versuch'), col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('sprache', 'Sprache')],
      rows: runs.map(plannedRow),
      empty: k.leer,
      note: 'Sortiert nach Datum und Zeit, Ort, Teilprüfung, Name. Ohne Zeit = Termin ohne Uhrzeit in der Datei.',
    },
    // Prüfungsereignisse (Tag × Ort), parallel zu summary.rows: zugeteilte Personen je Ereignis (zum Aufklappen in der Ansicht)
    events: groups.map((g) => ({
      key: g.dayKey + '|' + (g.location || ''),
      label: fmtDate(g.day) + ', ' + groupLabel(g.location),
      teilnehmende: {
        title: 'Zugeteilte Personen: ' + fmtDate(g.day) + ', ' + groupLabel(g.location) + ' (' + g.count + ')',
        columns: [col('zeit', 'Zeit'), col('teil', 'Teilprüfung'), col('versuch', 'Versuch'), col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('sprache', 'Sprache')],
        rows: g.entries.map(plannedRow),
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

// Personen mit mehreren Profilen (E3): Anzahl und Profil-Abfolge, ohne Namen. allPersons = kennzahlrelevante Vorgänge
// ohne Filter, damit ein Profil-Filter die Abfolge nicht zerschneidet; gezählt werden Personen mit ≥1 Vorgang im Filter.
export function multiProfileTable(persons, allPersons = persons) {
  const inFilter = new Set(persons);
  const multi = multiProfilePersons(allPersons).filter((g) => g.vorgaenge.some((v) => inFilter.has(v)));
  const bySeq = new Map();
  for (const m of multi) {
    const g = bySeq.get(m.sequence) || { sequence: m.sequence, personen: 0, vorgaenge: 0 };
    g.personen += 1;
    g.vorgaenge += m.vorgaenge.length;
    bySeq.set(m.sequence, g);
  }
  const collator = new Intl.Collator('de-CH');
  return {
    title: 'Personen mit mehreren Profilen',
    columns: [col('sequence', 'Profil-Abfolge'), col('personen', 'Personen'), col('vorgaenge', 'Vorgänge')],
    rows: [...bySeq.values()].sort((a, b) => b.personen - a.personen || collator.compare(a.sequence, b.sequence)),
    note: 'Zählt Menschen (Personenschlüssel aus Name und Geburtsdatum, nicht Employer), nicht Vorgänge. Abfolge nach dem ersten Prüfungsdatum je Vorgang; berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb des aktiven Profil-Filters.',
    total: multi.length,
  };
}

export function overviewModel(persons, allPersons = persons) {
  const o = overview(persons, MODE.ERSTVERSUCH);
  const wp1 = writtenPerformance(persons, MODE.ERSTVERSUCH);
  const wp2 = writtenPerformance(persons, MODE.BESTANDEN);
  const op1 = oralPerformance(persons, MODE.ERSTVERSUCH);
  const op2 = oralPerformance(persons, MODE.BESTANDEN);
  const multi = multiProfileTable(persons, allPersons);
  // count: absolute Zahl bei Anteilen (x von n Vorgängen), null bei Mittelwerten und Zählungen
  // kind/raw: Art und Rohwert für Vergleiche (ratio: Anteil 0..1, mean: Mittel 0..1, count: Zahl)
  const kpi = (label, value, n, hint, extra = {}) => ({ label, value, n, small: n < SMALL_N, hint, count: null, kind: 'count', raw: null, ...extra });
  const rate = (label, r, hint) => kpi(label, formatPct(r.pct), r.n, hint, { count: r.count, kind: 'ratio', raw: r.pct });
  const avg = (label, m, hint) => kpi(label, formatPct(m.mean), m.n, hint, { kind: 'mean', raw: m.mean });
  const kpis = [
    kpi('Vorgänge', String(o.n), o.n, 'Zertifizierungsvorgänge (Zeilen ohne Duplikate) im Filter mit mindestens einem absolvierten, datierten schriftlichen Run', { raw: o.n }),
    kpi('Personen', String(o.personen), o.n, 'Menschen hinter den Vorgängen im Filter (Personenschlüssel aus Name und Geburtsdatum); eine Person kann mehrere Vorgänge haben', { raw: o.personen }),
    kpi('Vorgänge offen', String(o.status.offen), o.n, 'Vorgänge ohne Gesamtergebnis (Prozess läuft noch); nicht im Nenner der Bestehensquoten', { raw: o.status.offen }),
    kpi('Vorgänge passiv (> ' + PASSIVE_DAYS + ' Tage)', String(o.status.passiv), o.n, 'Offene Vorgänge, deren letzte Prüfung mehr als ' + PASSIVE_DAYS + ' Tage zurückliegt und die keinen geplanten Termin haben; Teilmenge von «offen», nicht im Nenner', { raw: o.status.passiv }),
    kpi('Vorgänge nicht erfasst', String(o.status.nichtErfasst), o.n, 'Vorgänge mit unlesbarem Gesamtergebnis (Fehler im Data-Quality-Log); nicht im Nenner der Bestehensquoten', { raw: o.status.nichtErfasst }),
    rate('Schriftlich: im 1. Versuch bestanden', o.written.erstversuch, 'Anteil Vorgänge, bei denen alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden sind; n = Vorgänge mit absolviertem WE RUN1'),
    rate('Schriftlich: im 1. Versuch durchgefallen', o.written.erstversuchFailed, 'Anteil Vorgänge mit mindestens einer Teilprüfung, die im ersten Versuch nicht bestanden wurde; n = Vorgänge mit absolviertem WE RUN1'),
    rate('Schriftlich: insgesamt bestanden', o.written.gesamt, 'Anteil abgeschlossener Vorgänge mit «WE All Passed» = yes, unabhängig von der Anzahl Versuche; n = abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden)'),
    avg('Schriftlich: Ø Resultat 1. Versuch', wp1, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des ersten Versuchs je Teilprüfung; n = Vorgänge mit Wert'),
    avg('Schriftlich: Ø Resultat bestandener Run', wp2, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des bestandenen Runs; nur Vorgänge, deren Teilprüfungen alle bestanden sind'),
    rate('Mündlich: bestanden', o.oral.bestanden, 'Anteil abgeschlossener Vorgänge mit «OE All Passed» = yes; n = abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden)'),
    rate('Mündlich: im 1. Versuch durchgefallen', o.oral.failed1, 'OE1 im ersten Versuch nicht bestanden, unabhängig vom späteren Erfolg; n = angetretene Vorgänge (absolvierter, datierter OE1 RUN1)'),
    rate('Mündlich: 2× durchgefallen', o.oral.failed2, 'OE1 im ersten und im zweiten Versuch nicht bestanden; n = angetretene Vorgänge'),
    avg('Mündlich: Ø Resultat 1. Versuch', op1, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), erster Versuch; n = Vorgänge mit Wert'),
    avg('Mündlich: Ø Resultat bestandener Run', op2, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), bestandener Run'),
    kpi('VSS / VSM', o.vss + ' / ' + o.vsm, o.n, 'Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM aus dem Kommentar auf der Namenszelle'),
    kpi('Ausgestellte Zertifikate', String(o.issued), o.n, 'Vorgänge mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt) im Filter', { raw: o.issued }),
    kpi('Personen mit mehreren Profilen', String(multi.total), o.personen, 'Personen im Filter mit Vorgängen in mehr als einem Profil (Abfolge in der Tabelle unten)', { raw: multi.total }),
  ];
  const byProfil = {
    title: 'Kennzahlen je Profil',
    columns: [
      col('gruppe', 'Profil'), col('n', 'n (Vorgänge)'), col('personen', 'Personen'), col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('durchgefallen', 'Schriftlich im 1. Versuch durchgefallen'),
      col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden'), col('offen', 'Offen'), col('passiv', 'davon passiv'),
    ],
    rows: o.byProfil.map((g) => ({
      gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small, personen: personCount(persons.filter((p) => (p.profil === undefined ? null : p.profil) === g.key)),
      erstversuch: formatPct(g.value.written.erstversuch.pct), durchgefallen: formatPct(g.value.written.erstversuchFailed.pct),
      gesamt: formatPct(g.value.written.gesamt.pct), muendlich: formatPct(g.value.oral.bestanden.pct), offen: g.value.written.offen, passiv: g.value.written.passiv,
    })),
    note: SMALL_NOTE + '; offen = Vorgänge ohne schriftliches Gesamtergebnis, passiv = davon ohne Prüfung seit mehr als ' + PASSIVE_DAYS + ' Tagen und ohne Termin; Nenner der Quoten wie in den Kacheln',
  };
  return { kpis, byProfil, multi };
}

// ---------------------------------------------------------------------------
// Benchmark-Vergleich (Übersicht): Auswahl gegen Benchmark je Kennzahl
// ---------------------------------------------------------------------------

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Differenz in Prozentpunkten: «+25.0 pp», «−1.3 pp», «0.0 pp»
export function formatPp(delta) {
  const rounded = Math.round(Math.abs(delta) * 10 + 1e-9) / 10;
  const sign = rounded === 0 ? '' : (delta > 0 ? '+' : '−');
  return sign + rounded.toFixed(1) + ' pp';
}

export function comparisonTable(selectionKpis, benchmarkKpis, benchmarkLabel) {
  const byLabel = new Map(benchmarkKpis.map((k) => [k.label, k]));
  const rows = selectionKpis.map((k) => {
    const b = byLabel.get(k.label);
    let differenz = '';
    if (k.kind !== 'count') differenz = isNum(k.raw) && b && isNum(b.raw) ? formatPp((k.raw - b.raw) * 100) : '–';
    return { kennzahl: k.label, auswahl: k.value, n: k.n, benchmark: b ? b.value : '–', n2: b ? b.n : 0, differenz, small: k.small };
  });
  return {
    title: 'Auswahl im Vergleich zum Benchmark',
    columns: [col('kennzahl', 'Kennzahl'), col('auswahl', 'Auswahl'), col('n', 'n (Auswahl)'), col('benchmark', 'Benchmark: ' + benchmarkLabel), col('n2', 'n (Benchmark)'), col('differenz', 'Differenz')],
    rows,
    note: 'Differenz in Prozentpunkten (Auswahl minus Benchmark); ' + SMALL_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Datenqualität ↔ Kennzahlen: Nicht in den Kennzahlen (Blocker 2)
// ---------------------------------------------------------------------------

const collatorDe = new Intl.Collator('de-CH');

// persons: alle Zeilen (unfiltriert, inkl. Duplikate); dq: Data-Quality-Log (für Zeilen ohne Namen).
// summary: Gründe mit Anzahl; details: je Zeile mit Namen (Ansicht Datenqualität zeigt Namen); nameless: Zeilen ohne Namen.
export function excludedTables(persons, dq = []) {
  const rows = excludedRows(persons);
  const nameless = dq.filter((e) => e.field === 'lastName' && e.level === 'fehler').length;
  const reasonGroup = (reason) => reason.replace(/\s*\(zusammengeführt.*$/, '');
  const counts = new Map();
  for (const { reason } of rows) counts.set(reasonGroup(reason), (counts.get(reasonGroup(reason)) || 0) + 1);
  if (nameless) counts.set('Kein Name (Zeile zählt nicht als Person)', nameless);
  const summary = {
    title: 'Nicht in den Kennzahlen – Gründe',
    columns: [col('grund', 'Grund'), col('anzahl', 'Zeilen')],
    rows: [...counts.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl || collatorDe.compare(a.grund, b.grund)),
  };
  const details = {
    title: 'Nicht in den Kennzahlen – Zeilen',
    columns: [col('sheet', 'Sheet'), col('row', 'Zeile'), col('name', 'Name'), col('profil', 'Profil'), col('bank', 'Bank'), col('grund', 'Grund'), col('status', 'Status')],
    rows: rows
      .map(({ person: p, reason }) => ({ sheet: p.sheetName, row: p.row, name: personName(p), profil: groupLabel(p.profil), bank: p.employerCanon || '', grund: reason, status: p.status }))
      .sort((a, b) => collatorDe.compare(a.grund, b.grund) || collatorDe.compare(a.sheet, b.sheet) || a.row - b.row),
    note: 'Zeilen ohne absolvierten, datierten schriftlichen Run sowie zusammengeführte Duplikate. Zeilen ohne Namen erscheinen nur im Log (Fehler «Name fehlt»).',
  };
  return { summary, details, total: rows.length + nameless, rows: rows.length, nameless, zeilen: persons.length + nameless };
}

// ---------------------------------------------------------------------------
// Offene Vorgänge (E4)
// ---------------------------------------------------------------------------

// persons: Vorgänge nach den Filtern ohne Zeitraum (wie «Geplante Prüfungen»), inkl. nicht kennzahlrelevanter Zeilen
// allPersons: alle Vorgänge (für die Teilprüfungen je Profil), Standard = persons
export function openCasesTables(persons, today = new Date(), allPersons = persons) {
  const cases = openCases(persons, today);
  const parts = profileParts();
  const index = personIndex(allPersons);
  const byProfil = new Map();
  for (const c of cases) {
    const key = groupLabel(c.person.profil);
    const g = byProfil.get(key) || { profil: key, offen: 0, passiv: 0, ohnePruefung: 0, schriftlich: 0, muendlich: 0, geplant: 0, kennzahlrelevant: 0 };
    g.offen += 1;
    if (c.person.passiv) g.passiv += 1;
    if (!c.lastExam) g.ohnePruefung += 1;
    if (c.person.weStatus === STATUS.OFFEN) g.schriftlich += 1;
    if (c.person.oeStatus === STATUS.OFFEN) g.muendlich += 1;
    if (c.nextPlanned) g.geplant += 1;
    if (c.eligible) g.kennzahlrelevant += 1;
    byProfil.set(key, g);
  }
  const summary = {
    title: 'Offene Vorgänge je Profil',
    columns: [col('profil', 'Profil'), col('offen', 'Offen'), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)'), col('schriftlich', 'davon schriftlich offen'), col('muendlich', 'davon mündlich offen'), col('ohnePruefung', 'ohne Prüfung'), col('geplant', 'mit geplantem Termin'), col('kennzahlrelevant', 'kennzahlrelevant')],
    rows: [...byProfil.values()].sort((a, b) => b.offen - a.offen || collatorDe.compare(a.profil, b.profil)),
    note: 'Offen = Gesamtergebnis leer (schriftlich und/oder mündlich), kein «no» und kein unlesbarer Wert. Passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen, kein Termin. Kennzahlrelevant = mindestens ein absolvierter, datierter schriftlicher Run.',
  };
  const details = {
    title: 'Offene Vorgänge – Teilnehmende',
    columns: [
      col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('sprache', 'Sprache'), col('offen', 'Offen'), col('fehlend', 'Fehlende Teile'), col('passerelle', 'Passerelle'), col('passiv', 'Passiv'), col('letzte', 'Letzte Prüfung'),
      col('tage', 'Tage seit letzter Prüfung'), col('naechste', 'Nächster Termin'), col('versuche', 'Versuche'), col('sheet', 'Sheet'), col('row', 'Zeile'),
    ],
    rows: cases.map((c) => {
      const missing = missingParts(c.person, parts);
      const pass = passerelleFrom(c.person, index);
      return {
        name: personName(c.person), bank: c.person.employerCanon || '', profil: groupLabel(c.person.profil), sprache: groupLabel(c.person.sprache), offen: c.offen,
        fehlend: missing === null ? '' : (missing.length ? missing.join(', ') : 'keine (Gesamtergebnis fehlt)'), passerelle: pass ? 'möglich (' + pass + ' bestanden)' : '', passiv: c.person.passiv ? 'ja' : '',
        letzte: fmtDate(c.lastExam), tage: c.daysSinceLastExam === null ? '' : c.daysSinceLastExam, naechste: fmtDate(c.nextPlanned), versuche: c.attempts,
        sheet: c.person.sheetName, row: c.person.row,
      };
    }),
    note: 'Sortiert nach letzter Prüfung (älteste zuerst); Vorgänge ohne Prüfung am Ende. Fehlende Teile = Teilprüfungen der Vorgabe (config.js, PROFILE_PARTS) ohne bestandenen Run. Passerelle = Vorgängerprofil derselben Person bestanden; welcher Teil dann nötig ist, ist offen.',
  };
  return { summary, details, total: cases.length, passiv: cases.filter((c) => c.person.passiv).length, passerelle: cases.filter((c) => passerelleFrom(c.person, index)).length, ohnePruefung: cases.filter((c) => !c.lastExam).length, mitTermin: cases.filter((c) => c.nextPlanned).length };
}

// Teilprüfungen je Profil (Entscheid 3, Vorgabe Auftraggeber 05.09.2026): Vorgabe aus config.PROFILE_PARTS neben der Nutzung in den Daten.
export function profilePartsTable(persons) {
  const parts = profileParts();
  const data = partsByProfile(persons);
  const byProfil = new Map(data.map((d) => [d.profil, d]));
  const fmt = (kind, list) => (list.length ? list.map((x) => kind + x).join(', ') : '–');
  const usage = (d, def) => {
    const used = [];
    const outside = [];
    if (d) {
      for (const kind of ['we', 'oe']) {
        d.taken[kind].forEach((n, i) => {
          if (!n) return;
          const text = kind.toUpperCase() + (i + 1) + ' (' + n + ')';
          used.push(text);
          if (def && !def[kind].includes(i + 1)) outside.push(text);
        });
      }
    }
    return { daten: used.length ? used.join(', ') : '–', abweichung: outside.join(', ') };
  };
  const rows = parts.map((def) => {
    const d = byProfil.get(def.profil) || null;
    return { profil: def.profil, we: fmt('WE', def.we), oe: fmt('OE', def.oe), anzahl: def.we.length + def.oe.length, n: d ? d.n : 0, ...usage(d, def) };
  });
  for (const d of data) {
    if (parts.some((x) => x.profil === d.profil)) continue;
    rows.push({ profil: groupLabel(d.profil), we: '–', oe: '–', anzahl: 0, n: d.n, ...usage(d, null), abweichung: 'keine Vorgabe' });
  }
  return {
    title: 'Teilprüfungen je Profil: Vorgabe und Nutzung in den Daten',
    columns: [col('profil', 'Profil'), col('we', 'Schriftlich (Vorgabe)'), col('oe', 'Mündlich (Vorgabe)'), col('anzahl', 'Anzahl Teile'), col('n', 'n (Vorgänge)'), col('daten', 'In den Daten (Vorgänge je Teil)'), col('abweichung', 'Abweichung')],
    rows,
    note: 'Vorgabe laut Auftraggeber 05.09.2026 (config.js, PROFILE_PARTS); Annahme: die Teile stehen von links in WE1–WEn [hypothese]. «In den Daten» = Anzahl Vorgänge mit absolviertem Run je Teil. Abweichung = absolvierte Runs ausserhalb der Vorgabe, je Vorgang als Hinweis im Data-Quality-Log.',
  };
}

// ---------------------------------------------------------------------------
// Zeit (P6): Zeitverlauf je Kennzahl (a1), Zeitraumvergleich (a6), Schwierigkeit je Teilprüfung (b6)
// ---------------------------------------------------------------------------

function seriesRow(label, r) {
  return {
    gruppe: mark(label, r.small), n: r.n, small: r.small, personen: r.personen,
    erstversuch: formatPct(r.written.erstversuch.pct), gesamt: formatPct(r.written.gesamt.pct), muendlich: formatPct(r.oral.bestanden.pct),
    wp1: formatPct(r.writtenPerf1.mean), wp2: formatPct(r.writtenPerf2.mean), op1: formatPct(r.oralPerf1.mean), op2: formatPct(r.oralPerf2.mean),
    offen: r.status.offen, passiv: r.status.passiv, nichtErfasst: r.status.nichtErfasst,
  };
}

const TIME_COLUMNS = [
  col('n', 'n (Vorgänge)'), col('personen', 'Personen'), col('erstversuch', 'Schriftlich im 1. Versuch bestanden'), col('gesamt', 'Schriftlich insgesamt bestanden'),
  col('muendlich', 'Mündlich bestanden'), col('wp1', 'Ø schriftlich 1. Versuch'), col('wp2', 'Ø schriftlich bestandener Run'), col('op1', 'Ø mündlich 1. Versuch'),
  col('op2', 'Ø mündlich bestandener Run'), col('offen', 'Offen'), col('passiv', 'Passiv'), col('nichtErfasst', 'Nicht erfasst'),
];

// persons: kennzahlrelevante Vorgänge ohne Zeitraumfilter
export function timeSeriesTable(persons) {
  const rows = timeSeries(persons).map((r) => seriesRow(String(r.year), r));
  return {
    title: 'Kennzahlen je Jahr',
    columns: [col('gruppe', 'Jahr')].concat(TIME_COLUMNS),
    rows,
    note: SMALL_NOTE + '; Jahr = Jahr des Referenzdatums (bestandene mündliche Prüfung, sonst letzte Prüfung); Nenner wie in der Übersicht',
  };
}

export function timeSeriesByProfileTable(persons) {
  const rows = [];
  for (const g of timeSeriesBy(persons, 'profil')) {
    for (const r of g.series) rows.push({ profil: groupLabel(g.key), ...seriesRow(String(r.year), r) });
  }
  return {
    title: 'Kennzahlen je Profil und Jahr',
    columns: [col('profil', 'Profil'), col('gruppe', 'Jahr')].concat(TIME_COLUMNS),
    rows,
    note: SMALL_NOTE,
  };
}

// Reihen für das Liniendiagramm: [{ label, points: [{ x, y, n, small }] }]
export function timeSeriesChartSeries(persons) {
  const ts = timeSeries(persons);
  const pick = (label, short, fn) => ({ label, short, points: ts.map((r) => ({ x: String(r.year), y: fn(r), n: r.n, small: r.small })) });
  return {
    quoten: [
      pick('Schriftlich im 1. Versuch bestanden', 'schriftlich 1. Versuch', (r) => r.written.erstversuch.pct),
      pick('Schriftlich insgesamt bestanden', 'schriftlich insgesamt', (r) => r.written.gesamt.pct),
      pick('Mündlich bestanden', 'mündlich', (r) => r.oral.bestanden.pct),
    ],
    resultate: [
      pick('Ø schriftlich 1. Versuch', 'Ø schriftlich', (r) => r.writtenPerf1.mean),
      pick('Ø mündlich 1. Versuch', 'Ø mündlich', (r) => r.oralPerf1.mean),
    ],
  };
}

// Zwei Jahre vergleichen (a6): Kennzahlen des Jahres A gegen Jahr B, Differenz in Prozentpunkten
export function yearComparisonTable(persons, yearA, yearB) {
  const ofYear = (y) => persons.filter((p) => refYear(p) === y);
  const a = overviewModel(ofYear(yearA), persons);
  const b = overviewModel(ofYear(yearB), persons);
  const t = comparisonTable(a.kpis, b.kpis, String(yearB));
  t.title = 'Vergleich ' + yearA + ' gegenüber ' + yearB;
  t.columns = t.columns.map((c) => (c.key === 'auswahl' ? col('auswahl', String(yearA)) : c.key === 'n' ? col('n', 'n ' + yearA) : c.key === 'n2' ? col('n2', 'n ' + yearB) : c));
  t.note = 'Differenz in Prozentpunkten (' + yearA + ' minus ' + yearB + '); Jahr = Jahr des Referenzdatums; ' + SMALL_NOTE;
  return t;
}

// Standardwahl für den Vergleich: die zwei jüngsten Jahre mit Daten
export function defaultCompareYears(persons) {
  const years = yearsOf(persons);
  if (years.length < 2) return years.length === 1 ? { a: years[0], b: years[0] } : null;
  return { a: years[years.length - 1], b: years[years.length - 2] };
}

// Schwierigkeit je Teilprüfung (b6): lange Tabelle und Pivot (Teil × Jahr, Durchfallquote im 1. Versuch)
export function difficultyTables(persons) {
  const cells = partDifficultyByYear(persons);
  const long = {
    title: 'Schwierigkeit je Teilprüfung und Jahr',
    columns: [col('jahr', 'Jahr'), col('teil', 'Teilprüfung'), col('n', 'n'), col('durchgefallen', 'Im 1. Versuch durchgefallen'), col('bestanden', 'Im 1. Versuch bestanden'), col('mean1', 'Ø Resultat 1. Versuch'), col('mean2', 'Ø Resultat bestandener Run')],
    rows: cells.map((c) => ({ jahr: c.year, teil: mark(c.part, c.small), n: c.n, small: c.small, durchgefallen: formatPct(c.failed.pct), bestanden: formatPct(c.passed.pct), mean1: formatPct(c.meanFirst.mean), mean2: formatPct(c.meanPassed.mean) })),
    note: SMALL_NOTE + '; Jahr = Datum des ersten Versuchs (RUN1) der Teilprüfung; n = Vorgänge mit absolviertem, datiertem RUN1',
  };
  const years = [...new Set(cells.map((c) => c.year))].sort((a, b) => a - b);
  const parts = [...new Set(cells.map((c) => c.part))];
  const pivot = {
    title: 'Durchfallquote im 1. Versuch je Teilprüfung und Jahr',
    columns: [col('teil', 'Teilprüfung')].concat(years.map((y) => col('y' + y, String(y)))),
    rows: parts.map((part) => {
      const row = { teil: part };
      for (const y of years) {
        const c = cells.find((x) => x.part === part && x.year === y);
        row['y' + y] = c ? formatPct(c.failed.pct) + (c.small ? ' *' : '') : '';
      }
      return row;
    }),
    note: '* Zelle mit n < ' + SMALL_N + ' Vorgängen; leer = keine Erstversuche im Jahr',
  };
  return { long, pivot };
}

// ---------------------------------------------------------------------------
// Ausbau (P7): Frühwarnung (b1), Durchlaufzeit und Abbruch (b5), Bank-Report (b2)
// ---------------------------------------------------------------------------

export function earlyWarningTable(persons) {
  const items = earlyWarnings(persons);
  return {
    title: 'Frühwarnung: zweiter Fehlversuch',
    columns: [
      col('stufe', 'Stufe'), col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('teil', 'Teilprüfung'), col('fehlversuche', 'Fehlversuche'),
      col('letzter', 'Letzter Fehlversuch'), col('naechster', 'Nächster Termin'), col('status', 'Status Vorgang'), col('sheet', 'Sheet'), col('row', 'Zeile'),
    ],
    rows: items.map((w) => ({
      stufe: w.stage, name: personName(w.person), bank: w.person.employerCanon || '', profil: groupLabel(w.person.profil), teil: w.label, fehlversuche: w.failed,
      letzter: fmtDate(w.lastFail), naechster: w.nextPlanned ? fmtDate(w.nextPlanned) : (w.nextRun ? 'offen (RUN' + w.nextRun + ')' : '–'), status: w.person.status,
      sheet: w.person.sheetName, row: w.person.row,
    })),
    note: 'Teilprüfungen mit zwei nicht bestandenen Versuchen und ohne bestandenen Run. «letzter Versuch» = genau ein Versuch bleibt; «ausgeschöpft» = alle Versuche nicht bestanden. Handlungsbedarf vor dem nächsten Termin.',
    total: items.length,
    lastAttempt: items.filter((w) => w.stage === 'letzter Versuch').length,
    exhausted: items.filter((w) => w.stage === 'ausgeschöpft').length,
  };
}

export function passiveTable(persons, today = new Date()) {
  const items = passiveCases(persons, today);
  const thresholdDays = PASSIVE_DAYS;
  return {
    title: 'Passiv seit über ' + thresholdDays + ' Tagen (keine Prüfung, kein Termin)',
    columns: [
      col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('offen', 'Offen'), col('letzte', 'Letzte Prüfung'), col('tage', 'Tage seit letzter Prüfung'),
      col('letzterRun', 'Letzter Prüfungstag bestanden'), col('versuche', 'Versuche'), col('sheet', 'Sheet'), col('row', 'Zeile'),
    ],
    rows: items.map((c) => ({
      name: personName(c.person), bank: c.person.employerCanon || '', profil: groupLabel(c.person.profil), offen: c.offen, letzte: fmtDate(c.lastExam), tage: c.daysSinceLastExam,
      letzterRun: c.lastRunPassed === null ? '' : c.lastRunPassed ? 'ja' : 'nein', versuche: c.attempts, sheet: c.person.sheetName, row: c.person.row,
    })),
    note: 'Offene Vorgänge, deren letzte Prüfung mehr als ' + thresholdDays + ' Tage zurückliegt und die keinen geplanten Termin haben (Entscheid Auftraggeber 05.09.2026: Kategorie «passiv», nicht «nicht bestanden»). Eigene Zahl neben «offen», nicht im Nenner der Bestehensquoten.',
    total: items.length,
    thresholdDays,
  };
}

function days(v) {
  return v === null || v === undefined ? '–' : String(Math.round(v));
}

// Durchlaufzeit je Profil und je Jahr (Jahr des Referenzdatums): Tage vom ersten Prüfungsdatum bis zur bestandenen mündlichen
// Prüfung (nur bestandene Vorgänge) und bis zum Zertifikatsbeginn (nur mit Certificate Start Date)
export function throughputTables(persons) {
  const row = (label, ps) => {
    const st = throughputStats(ps);
    return {
      gruppe: mark(label, st.pruefung.n < SMALL_N), small: st.pruefung.n < SMALL_N, n: st.pruefung.n, median: days(st.pruefung.median), mean: days(st.pruefung.mean),
      p25: days(st.pruefung.p25), p75: days(st.pruefung.p75), min: days(st.pruefung.min), max: days(st.pruefung.max),
      nZert: st.zertifikat.n, medianZert: days(st.zertifikat.median),
    };
  };
  const columns = (first) => [
    col('gruppe', first), col('n', 'n (bestanden)'), col('median', 'Median Tage'), col('mean', 'Ø Tage'), col('p25', '25 %-Quantil'), col('p75', '75 %-Quantil'), col('min', 'Min'), col('max', 'Max'),
    col('nZert', 'n (mit Zertifikatsbeginn)'), col('medianZert', 'Median Tage bis Zertifikat'),
  ];
  const note = SMALL_NOTE + '; Tage vom ersten Prüfungsdatum bis zur bestandenen mündlichen Prüfung (Referenzdatum); bis Zertifikat nur mit «Certificate Start Date»';
  const byProfil = {
    title: 'Durchlaufzeit je Profil',
    columns: columns('Profil'),
    rows: [row('Gesamt', persons)].concat(groupBy(persons, 'profil').map((g) => row(groupLabel(g.key), g.persons))),
    note,
  };
  const byYear = {
    title: 'Durchlaufzeit je Jahr',
    columns: columns('Jahr'),
    rows: yearsOf(persons).map((y) => row(String(y), persons.filter((p) => refYear(p) === y))),
    note,
  };
  return { byProfil, byYear };
}

// Bank-Report (b2): eigene Zahlen einer Bank gegen den anonymen Benchmark «alle Banken» (gleicher Zeitraum, gleiche
// übrigen Filter). Keine Namen, keine anderen Banken einzeln.
export function bankReportTables(bankPersons, benchmarkPersons, bankLabel) {
  const own = overviewModel(bankPersons, bankPersons);
  const bench = overviewModel(benchmarkPersons, benchmarkPersons);
  const kpis = comparisonTable(own.kpis, bench.kpis, 'Alle Banken');
  kpis.title = 'Kennzahlen ' + bankLabel + ' im Vergleich zu allen Banken';
  kpis.columns = kpis.columns.map((c) => (c.key === 'auswahl' ? col('auswahl', bankLabel) : c.key === 'n' ? col('n', 'n ' + bankLabel) : c.key === 'n2' ? col('n2', 'n alle Banken') : c));
  kpis.rows = kpis.rows.filter((r) => r.kennzahl !== 'Personen mit mehreren Profilen');
  const benchByProfil = new Map(bench.byProfil.rows.map((r) => [r.gruppe.replace(/ \*$/, ''), r]));
  const byProfil = {
    title: 'Je Profil: ' + bankLabel + ' und alle Banken',
    columns: [
      col('profil', 'Profil'), col('n', 'n ' + bankLabel), col('erstversuch', 'Schriftlich 1. Versuch bestanden'), col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden'),
      col('n2', 'n alle Banken'), col('erstversuch2', 'Schriftlich 1. Versuch bestanden (alle)'), col('gesamt2', 'Schriftlich insgesamt bestanden (alle)'), col('muendlich2', 'Mündlich bestanden (alle)'),
    ],
    rows: own.byProfil.rows.map((r) => {
      const key = r.gruppe.replace(/ \*$/, '');
      const b = benchByProfil.get(key) || {};
      return { profil: r.gruppe, small: r.small, n: r.n, erstversuch: r.erstversuch, gesamt: r.gesamt, muendlich: r.muendlich, n2: b.n === undefined ? '' : b.n, erstversuch2: b.erstversuch || '–', gesamt2: b.gesamt || '–', muendlich2: b.muendlich || '–' };
    }),
    note: SMALL_NOTE + '; Benchmark = alle Banken mit denselben übrigen Filtern und demselben Zeitraum',
  };
  const verlauf = timeSeriesTable(bankPersons);
  verlauf.title = 'Kennzahlen je Jahr: ' + bankLabel;
  return { kpis, byProfil, verlauf };
}

// ---------------------------------------------------------------------------
// Historie (b7): Snapshots je Stichtag neben dem heutigen Stand
// ---------------------------------------------------------------------------

function stichtagLabel(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? m[3] + '.' + m[2] + '.' + m[1] : String(s || '–');
}

function signed(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
}

// Zelle einer Kennzahl: count als Zahl; ratio/mean als Prozent mit n und Kennzeichnung kleiner Gruppen
function kpiCell(kind, v) {
  if (!v || v.value === null || v.value === undefined) return '–';
  if (kind === 'count') return v.value;
  return formatPct(v.value) + (v.n < SMALL_N ? ' ' + SMALL_MARK : '') + ' (n ' + v.n + ')';
}

function deltaCell(kind, d) {
  if (d === null || d === undefined) return '–';
  return kind === 'count' ? signed(d) : formatPp(d);
}

// snapshots: geladene Snapshots (snapshot.parseSnapshot), current: buildSnapshot des heutigen Stands
export function historyTables(snapshots, current) {
  const list = snapshots.slice().sort((a, b) => a.stichtag.localeCompare(b.stichtag) || String(a.erstellt || '').localeCompare(String(b.erstellt || '')));
  const stichtage = list.map((s, i) => col('s' + i, stichtagLabel(s.stichtag)));
  const heute = col('heute', 'Heute (' + stichtagLabel(current.stichtag) + ')');
  const differenz = col('differenz', 'Differenz zum letzten Snapshot');
  const fill = (row, cells, cur, d, kind) => {
    cells.forEach((c, i) => { row['s' + i] = kind === 'zaehler' ? (c === null || c === undefined ? '–' : c) : kpiCell(kind, c); });
    row.heute = kind === 'zaehler' ? (cur === null || cur === undefined ? '–' : cur) : kpiCell(kind, cur);
    row.differenz = kind === 'zaehler' ? signed(d) : deltaCell(kind, d);
    return row;
  };
  const kennzahlen = {
    title: 'Kennzahlen je Stichtag (gesamt, ohne Filter)',
    columns: [col('kennzahl', 'Kennzahl')].concat(stichtage, [heute, differenz]),
    rows: compareKennzahlen(list, current).map((r) => fill({ kennzahl: r.label }, r.cells, r.current, r.delta, r.kind)),
    note: 'Anteile mit n (Nenner wie in der Übersicht), ' + SMALL_NOTE + '; Differenz heute gegenüber dem jüngsten Snapshot, Anteile in Prozentpunkten, Zählungen absolut.',
  };
  const zaehler = {
    title: 'Datei-Zähler je Stichtag (Zeilen, Status, Datenqualität)',
    columns: [col('zaehler', 'Zähler')].concat(stichtage, [heute, differenz]),
    rows: compareZaehler(list, current).map((r) => fill({ zaehler: r.label }, r.cells, r.current, r.delta, 'zaehler')),
    note: 'Zeigt, wie sich die Datei zwischen den Stichtagen verändert hat (Zeilen, Duplikate, offene Vorgänge, Data-Quality-Einträge).',
  };
  const jeProfil = [['weGesamt', 'Schriftlich: insgesamt bestanden'], ['oeBestanden', 'Mündlich: bestanden'], ['vorgaenge', 'Vorgänge'], ['offen', 'Vorgänge offen']].map(([key, label]) => {
    const kind = key === 'vorgaenge' || key === 'offen' ? 'count' : 'ratio';
    return {
      title: 'Je Profil: ' + label,
      columns: [col('profil', 'Profil')].concat(stichtage, [heute, differenz]),
      rows: compareByGroup(list, current, 'jeProfil', 'profil', key).map((r) => fill({ profil: groupLabel(r.group) }, r.cells, r.current, r.delta, kind)),
      note: kind === 'ratio' ? 'Anteil mit n je Profil und Stichtag, ' + SMALL_NOTE : 'Anzahl je Profil und Stichtag; «–» = Profil an diesem Stichtag ohne Vorgänge',
    };
  });
  return { kennzahlen, zaehler, jeProfil };
}
