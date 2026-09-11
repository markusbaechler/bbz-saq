// views/tables.js – reine Tabellenmodelle für die Views (kein DOM), getestet in tests/tables.test.js.
// Jede Tabelle: { title, columns: [{ key, label }], rows: [{ … , small }], note }.
// Prozent mit 1 Dezimale, immer mit n; Gruppen mit n < 5 tragen die Markierung «*».
// Begriffe (E3): «Vorgänge» für alle prüfungsbezogenen Quoten, «Personen» nur, wo Menschen gezählt werden.

import {
  MODE, SMALL_N, formatPct, writtenPassRates, writtenPerformance, partFirstAttempt, oralPassRates, oralPerformance,
  byGroup, vssVsmBreakdown, topWritten, topOral, awardRanking, overview, plannedRuns, plannedGroups, plannedByKind, dayKey,
  multiProfilePersons, personCount, excludedRows, openCases, STATUS, rankingLimit, writtenScore, oralScore, firstAttemptPassed, partResult,
  timeSeries, timeSeriesBy, partDifficultyByYear, yearsOf, refYear,
  earlyWarnings, passiveCases, throughputStats, durationDays, certificateDays, groupBy, partsByProfile, missingParts, PASSIVE_DAYS, profileParts, personIndex, passerelleFrom,
  runTimeline, examGrid, expertStats, expertBenchmark, expertPairs, mean,
  writtenDispersion, oralDispersion, wilsonInterval, effectSize, writtenHistogram, oralHistogram } from '../metrics.js';
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

// Spalte eines Tabellenmodells (PROMPT-2 A.5): prio 1 = immer sichtbar (Phone), 2 = ab 601 px, 3 = ab 901 px (CSS in Paket B);
// extra z. B. direction für Differenzspalten
export function col(key, label, prio = 2, extra = {}) {
  return { key, label, prio, ...extra };
}

// Streuung (PROMPT-2 Paket G, E14): Text «σ 9.8 pp · Median 76.0 % (P25 70.0 · P75 84.5)» für die Kachel-Zweitzeile, Kurzform
// «σ 9.8 pp» (Phone) und Einzelwerte für Tabellenspalten; null, wenn keine Streuung ausgewiesen wird (n < 5, metrics.reportedDispersion)
export function formatSpread(d) {
  if (!d || !isNum(d.sd)) return null;
  const pp = (v) => (Math.round(v * 1000) / 10).toFixed(1);
  return {
    text: 'σ ' + pp(d.sd) + ' pp · Median ' + formatPct(d.median) + ' (P25 ' + pp(d.p25) + ' · P75 ' + pp(d.p75) + ')',
    short: 'σ ' + pp(d.sd) + ' pp', sd: pp(d.sd) + ' pp', median: formatPct(d.median), p25: formatPct(d.p25), p75: formatPct(d.p75),
  };
}

// Spalten σ · Median · P25 · P75 einer Wertung (Prio 3, Entscheid 6); Lagewerte in Prozent ohne Datenbalken (bar: false), der Balken bleibt auf Ø
function spreadKeys(suffix) {
  return { sd: 'sd' + suffix, median: 'median' + suffix, p25: 'p25' + (suffix ? '_' + suffix : ''), p75: 'p75' + (suffix ? '_' + suffix : '') };
}
function spreadColumns(suffix, wertung) {
  const k = spreadKeys(suffix);
  return [col(k.sd, 'σ (' + wertung + ')', 3), col(k.median, 'Median (' + wertung + ')', 3, { bar: false }), col(k.p25, 'P25 (' + wertung + ')', 3, { bar: false }), col(k.p75, 'P75 (' + wertung + ')', 3, { bar: false })];
}
function spreadCells(suffix, d) {
  const k = spreadKeys(suffix);
  const s = formatSpread(d);
  return { [k.sd]: s ? s.sd : '–', [k.median]: s ? s.median : '–', [k.p25]: s ? s.p25 : '–', [k.p75]: s ? s.p75 : '–' };
}
const SPREAD_NOTE = 'σ = Stichproben-Standardabweichung der Resultate je Vorgang in Prozentpunkten, Median/P25/P75 = Lage der Resultate; Streuung erst ab n ≥ ' + SMALL_N;

// Differenzspalten (Δ in Prozentpunkten oder absolut): Symbol, Vorzeichen und Farbe nach Richtung (views/common.js)
export function isDeltaColumn(column) {
  if (!column) return false;
  return /^(differenz|delta)/i.test(String(column.key || '')) || /^(Differenz|Δ)/.test(String(column.label || ''));
}

// Spalten, deren Zellen als Status-Badge erscheinen (Text bleibt, Farbe kommt dazu)
export const STATUS_COLUMN_LABELS = ['Status', 'Status Vorgang', 'Status schriftlich', 'Status mündlich', 'Stufe', 'Bestanden', 'Passiv', 'Ergebnis'];

// Farbton einer Statuszelle: bestanden | nicht | offen | passiv | geplant | null (kein Badge)
export function statusTone(text, label = '') {
  const t = String(text === null || text === undefined ? '' : text).trim().toLowerCase();
  if (!t || t === '–' || t === '-') return null;
  if (label === 'Passiv') return t === 'ja' ? 'passiv' : null;
  if (label === 'Bestanden') return t === 'ja' ? 'bestanden' : t === 'nein' ? 'nicht' : null;
  if (t.startsWith('nicht bestanden') || t === 'nein' || t.startsWith('letzter versuch') || t.startsWith('ausgeschöpft')) return 'nicht';
  if (t.startsWith('nicht erfasst')) return 'passiv';
  if (t.startsWith('bestanden') || t === 'ja') return 'bestanden';
  if (t.startsWith('geplant')) return 'geplant';
  if (t.startsWith('offen')) return 'offen';
  if (t.startsWith('passiv')) return 'passiv';
  return null;
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
      col('gruppe', GROUP_LABELS[key], 1), col('n', 'n (Vorgänge)', 1), col('erstversuch', 'Im 1. Versuch bestanden', 1), col('durchgefallen', 'Im 1. Versuch durchgefallen', 2),
      col('gesamt', 'Insgesamt bestanden', 1), col('abgeschlossen', 'n (abgeschlossen)', 2), col('offen', 'Offen', 2), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)', 3), col('nichtErfasst', 'Nicht erfasst', 3),
    ],
    rows,
    note: SMALL_NOTE + '; 1. Versuch: Nenner sind Vorgänge mit absolviertem RUN1; insgesamt bestanden: Nenner sind abgeschlossene Vorgänge (bestanden + nicht bestanden); offen = Gesamtergebnis leer (läuft noch), passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen und kein Termin; nicht erfasst = Gesamtergebnis unlesbar',
  };
}

// kind: 'written' | 'oral' – beide Wertungen nebeneinander (Resultat des 1. Versuchs, Resultat des bestandenen Runs)
export function performanceTable(persons, key, kind = 'written') {
  const fn = kind === 'oral' ? oralDispersion : writtenDispersion; // Mittel wie bisher, dazu Streuung (Paket G)
  const row = (label, ps) => {
    const first = fn(ps, MODE.ERSTVERSUCH);
    const passed = fn(ps, MODE.BESTANDEN);
    return { gruppe: mark(label, first.n < SMALL_N), n: first.n, small: first.n < SMALL_N, mean1: formatPct(first.mean), ...spreadCells('1', first), n2: passed.n, mean2: formatPct(passed.mean), ...spreadCells('2', passed) };
  };
  const rows = [row('Gesamt', persons)];
  for (const g of byGroup(persons, key, (ps) => ps)) rows.push(row(groupLabel(g.key), g.value));
  return {
    title: 'Ø Resultat ' + (kind === 'oral' ? 'mündlich' : 'schriftlich') + ' nach ' + GROUP_LABELS[key],
    wide: true, // 13 Spalten mit Streuung: Prio 3 erst ab 1900 px, Full HD (F.2, Paket G)
    columns: [col('gruppe', GROUP_LABELS[key], 1), col('n', 'n (1. Versuch)', 2), col('mean1', 'Ø Resultat 1. Versuch', 1), ...spreadColumns('1', '1. Versuch'), col('n2', 'n (bestanden)', 2), col('mean2', 'Ø Resultat bestandener Run', 1), ...spreadColumns('2', 'bestandener Run')],
    rows,
    note: SMALL_NOTE + '; Resultat = erreichte Punkte in Prozent; n = Vorgänge mit Wert; «bestandener Run» nur für Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind; ' + SPREAD_NOTE,
  };
}

// Je Teilprüfung (kind 'we' | 'oe'): 1. Versuch bestanden/durchgefallen, insgesamt bestanden, Ø beider Wertungen
export function partTable(persons, kind = 'we') {
  const rows = partFirstAttempt(persons, kind).map((p) => ({
    gruppe: mark(p.label, p.n < SMALL_N), n: p.n, small: p.n < SMALL_N,
    bestanden1: formatPct(p.passed.pct), durchgefallen1: formatPct(p.failed.pct), gesamt: formatPct(p.anyPassed.pct),
    mean1: formatPct(p.meanFirst.mean), ...spreadCells('1', p.spreadFirst), mean2: formatPct(p.meanPassed.mean), ...spreadCells('2', p.spreadPassed),
  }));
  return {
    title: (kind === 'oe' ? 'Mündlich' : 'Schriftlich') + ' je Teilprüfung',
    wide: true, // 15 Spalten mit Streuung: Prio 3 erst ab 1900 px, Full HD (F.2, Paket G)
    columns: [col('gruppe', 'Teilprüfung', 1), col('n', 'n', 1), col('bestanden1', 'Im 1. Versuch bestanden', 1), col('durchgefallen1', 'Im 1. Versuch durchgefallen', 2), col('gesamt', 'Insgesamt bestanden', 2), col('mean1', 'Ø Resultat 1. Versuch', 1), ...spreadColumns('1', '1. Versuch'), col('mean2', 'Ø Resultat bestandener Run', 3), ...spreadColumns('2', 'bestandener Run')],
    rows,
    note: SMALL_NOTE + '; n = Vorgänge mit absolviertem RUN1 der Teilprüfung; ' + SPREAD_NOTE,
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
      col('gruppe', GROUP_LABELS[key], 1), col('n', 'n (abgeschlossen)', 1), col('bestanden', 'Bestanden', 1), col('nichtBestanden', 'Nicht bestanden', 2), col('offen', 'Offen', 2), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)', 3), col('nichtErfasst', 'Nicht erfasst', 3),
      col('angetreten', 'n (angetreten)', 2), col('failed1', 'Im 1. Versuch durchgefallen', 1), col('failed2', '2× durchgefallen', 2),
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
    columns: [col('gruppe', 'Gruppe', 1), col('profil', 'Profil', 1), col('n', 'n (Vorgänge)', 1), col('erstversuch', 'Schriftlich im 1. Versuch bestanden', 1), col('gesamt', 'Schriftlich insgesamt bestanden', 2), col('muendlich', 'Mündlich bestanden', 2)],
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
  const simpleColumns = (label) => [col('rang', 'Rang', 1), col('name', 'Name', 1), col('bank', 'Bank', 2), col('wert', label, 1), col('versuche', 'Versuche', 2), col('refDate', 'Referenzdatum', 3)];
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
      [col('rang', 'Rang', 1), col('name', 'Name', 1), col('bank', 'Bank', 2), col('wert', 'Award-Score', 1), col('schriftlich', 'Schriftlich', 2), col('muendlich', 'Mündlich', 2), col('versuche', 'Versuche', 2), col('refDate', 'Referenzdatum', 3)],
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
      col('profil', 'Profil', 1), col('rang', 'Rang', 1), col('name', 'Name', 1), col('bank', 'Bank', 2), col('sprache', 'Sprache', 3), col('wert', 'Award-Score', 1), col('schriftlich', 'Schriftlich', 2),
      col('muendlich', 'Mündlich', 2), col('versuche', 'Versuche', 2), col('refDate', 'Referenzdatum', 3), col('sheet', 'Sheet', 3), col('row', 'Zeile', 3), col('begruendung', 'Begründung Rang', 3),
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
      col('first', 'Erstes Prüfungsdatum'), col('refDate', 'Referenzdatum'), col('issued', 'Zertifikat ausgestellt'), col('certNumber', 'Zertifikat-Nr.'), col('certStart', 'Zertifikatsbeginn'), col('certEnd', 'Zertifikatsende'),
      col('personKey', 'Personenschlüssel-Stufe'), col('duplicates', 'Zusammengeführte Zeilen'),
    ],
    rows: persons.map((p) => ({
      sheet: p.sheetName, row: p.row, name: personName(p), bank: p.employerCanon || '', employer: p.employer || '', profil: groupLabel(p.profil), sprache: groupLabel(p.sprache), role: p.role || '',
      vss: yesNo(p.vss), vsm: yesNo(p.vsm), status: p.status, weStatus: p.weStatus, oeStatus: p.oeStatus,
      erstversuch: yesNo(firstAttemptPassed(p)), wr1: formatPct(writtenScore(p, MODE.ERSTVERSUCH)), wr2: formatPct(writtenScore(p, MODE.BESTANDEN)),
      or1: formatPct(oralScore(p, MODE.ERSTVERSUCH)), or2: formatPct(oralScore(p, MODE.BESTANDEN)), versuche: p.attemptsTotal,
      first: fmtDate(p.firstExamDate), refDate: fmtDate(p.refDate), issued: yesNo(p.issued), certNumber: p.certNumber || '', certStart: fmtDate(p.certStart), certEnd: fmtDate(p.certEnd),
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
      columns: [col('datum', 'Datum', 1), col('ort', 'Ort', 1), col('teile', 'Teilprüfungen (Anzahl)', 2), col('anzahl', 'Anzahl', 1), col('wiederholung', 'davon Wiederholung', 2)],
      rows: groups.map((g) => ({ datum: fmtDate(g.day), ort: groupLabel(g.location), teile: g.parts.map((p) => p.label + ' (' + p.count + ')').join(', '), anzahl: g.count, wiederholung: g.repeats })),
      empty: k.leer,
      note: 'Wiederholung = Termin für Versuch 2 oder 3 (RUN2/RUN3).',
    },
    details: {
      title: k.titel + ' – Teilnehmende',
      columns: [col('datum', 'Datum', 1), col('zeit', 'Zeit', 2), col('ort', 'Ort', 2), col('teil', 'Teilprüfung', 1), col('versuch', 'Versuch', 2), col('name', 'Name', 1), col('bank', 'Bank', 3), col('profil', 'Profil', 2), col('sprache', 'Sprache', 3)],
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
        columns: [col('zeit', 'Zeit', 1), col('teil', 'Teilprüfung', 1), col('versuch', 'Versuch', 2), col('name', 'Name', 1), col('bank', 'Bank', 3), col('profil', 'Profil', 2), col('sprache', 'Sprache', 3)],
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
    columns: [col('sequence', 'Profil-Abfolge', 1), col('personen', 'Personen', 1), col('vorgaenge', 'Vorgänge', 2)],
    rows: [...bySeq.values()].sort((a, b) => b.personen - a.personen || collator.compare(a.sequence, b.sequence)),
    note: 'Zählt Menschen (Personenschlüssel aus Name und Geburtsdatum, nicht Employer), nicht Vorgänge. Abfolge nach dem ersten Prüfungsdatum je Vorgang; berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb des aktiven Profil-Filters.',
    total: multi.length,
  };
}

export function overviewModel(persons, allPersons = persons) {
  const o = overview(persons, MODE.ERSTVERSUCH);
  // Ø wie bisher (Mittel der Vorgänge mit Wert), dazu Streuung σ/Median/Quartile ab n ≥ 5 (Paket G, additiv)
  const wp1 = writtenDispersion(persons, MODE.ERSTVERSUCH);
  const wp2 = writtenDispersion(persons, MODE.BESTANDEN);
  const op1 = oralDispersion(persons, MODE.ERSTVERSUCH);
  const op2 = oralDispersion(persons, MODE.BESTANDEN);
  const multi = multiProfileTable(persons, allPersons);
  // count: absolute Zahl bei Anteilen (x von n Vorgängen), null bei Mittelwerten und Zählungen
  // kind/raw: Art und Rohwert für Vergleiche (ratio: Anteil 0..1, mean: Mittel 0..1, count: Zahl)
  // group: Block der Kachel (Mengen · Schriftlich · Mündlich); direction: höher ist besser (up), tiefer ist besser (down),
  // neutral bei Mengen – bestimmt die Farbe der Differenz zum Benchmark (PROMPT-2 A.4)
  const kpi = (label, value, n, hint, extra = {}) => ({ label, value, n, small: n < SMALL_N, hint, count: null, kind: 'count', raw: null, group: 'Mengen', direction: 'neutral', ...extra });
  const rate = (label, r, hint, group, direction) => kpi(label, formatPct(r.pct), r.n, hint, { count: r.count, kind: 'ratio', raw: r.pct, group, direction });
  // spread: Zweitzeile der Kachel (null bei n < 5); sd: Roh-σ (Anteil) als Basis der Effektstärke im Benchmark-Vergleich
  const avg = (label, m, hint, group) => kpi(label, formatPct(m.mean), m.n, hint, { kind: 'mean', raw: m.mean, group, direction: 'up', sd: isNum(m.sd) ? m.sd : null, spread: formatSpread(m) });
  const kpis = [
    kpi('Vorgänge', String(o.n), o.n, 'Zertifizierungsvorgänge (Zeilen ohne Duplikate) im Filter mit mindestens einem absolvierten, datierten schriftlichen Run', { raw: o.n }),
    kpi('Personen', String(o.personen), o.n, 'Menschen hinter den Vorgängen im Filter (Personenschlüssel aus Name und Geburtsdatum); eine Person kann mehrere Vorgänge haben', { raw: o.personen }),
    // A5: «Zertifizierung offen» – die ganze Zertifizierung läuft noch. Die Spalte «Schriftlich offen» in «Kennzahlen je Profil»
    // zählt die frühere Prozessstufe (nur das schriftliche Gesamtergebnis fehlt) und ist deshalb die kleinere Zahl.
    kpi('Zertifizierung offen', String(o.status.offen), o.n, 'Vorgänge ohne Gesamtergebnis – weder schriftlich noch mündlich abgeschlossen, die Zertifizierung läuft noch; nicht im Nenner der Bestehensquoten', { raw: o.status.offen }),
    kpi('Vorgänge passiv (> ' + PASSIVE_DAYS + ' Tage)', String(o.status.passiv), o.n, 'Offene Vorgänge, deren letzte Prüfung mehr als ' + PASSIVE_DAYS + ' Tage zurückliegt und die keinen geplanten Termin haben; Teilmenge von «offen», nicht im Nenner', { raw: o.status.passiv, direction: 'down' }),
    kpi('Vorgänge nicht erfasst', String(o.status.nichtErfasst), o.n, 'Vorgänge mit unlesbarem Gesamtergebnis (Fehler im Data-Quality-Log); nicht im Nenner der Bestehensquoten', { raw: o.status.nichtErfasst, direction: 'down' }),
    rate('Schriftlich: im 1. Versuch bestanden', o.written.erstversuch, 'Anteil Vorgänge, bei denen alle absolvierten Teilprüfungen im ersten Versuch (RUN1) bestanden sind; n = Vorgänge mit absolviertem WE RUN1', 'Schriftlich', 'up'),
    rate('Schriftlich: im 1. Versuch durchgefallen', o.written.erstversuchFailed, 'Anteil Vorgänge mit mindestens einer Teilprüfung, die im ersten Versuch nicht bestanden wurde; n = Vorgänge mit absolviertem WE RUN1', 'Schriftlich', 'down'),
    rate('Schriftlich: insgesamt bestanden', o.written.gesamt, 'Anteil abgeschlossener Vorgänge mit «WE All Passed» = yes, unabhängig von der Anzahl Versuche; n = abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden)', 'Schriftlich', 'up'),
    avg('Schriftlich: Ø Resultat 1. Versuch', wp1, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des ersten Versuchs je Teilprüfung; n = Vorgänge mit Wert', 'Schriftlich'),
    avg('Schriftlich: Ø Resultat bestandener Run', wp2, 'Mittel der Prüfungsresultate (erreichte Punkte in Prozent), Resultat des bestandenen Runs; nur Vorgänge, deren Teilprüfungen alle bestanden sind', 'Schriftlich'),
    rate('Mündlich: bestanden', o.oral.bestanden, 'Anteil abgeschlossener Vorgänge mit «OE All Passed» = yes; n = abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden)', 'Mündlich', 'up'),
    rate('Mündlich: im 1. Versuch durchgefallen', o.oral.failed1, 'OE1 im ersten Versuch nicht bestanden, unabhängig vom späteren Erfolg; n = angetretene Vorgänge (absolvierter, datierter OE1 RUN1)', 'Mündlich', 'down'),
    rate('Mündlich: 2× durchgefallen', o.oral.failed2, 'OE1 im ersten und im zweiten Versuch nicht bestanden; n = angetretene Vorgänge', 'Mündlich', 'down'),
    avg('Mündlich: Ø Resultat 1. Versuch', op1, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), erster Versuch; n = Vorgänge mit Wert', 'Mündlich'),
    avg('Mündlich: Ø Resultat bestandener Run', op2, 'Mittel der Resultate der mündlichen Prüfung (erreichte Punkte in Prozent), bestandener Run', 'Mündlich'),
    kpi('VSS / VSM', o.vss + ' / ' + o.vsm, o.n, 'Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM aus dem Kommentar auf der Namenszelle'),
    kpi('Ausgestellte Zertifikate', String(o.issued), o.n, 'Vorgänge mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt) im Filter', { raw: o.issued }),
    kpi('Personen mit mehreren Profilen', String(multi.total), o.personen, 'Personen im Filter mit Vorgängen in mehr als einem Profil (Abfolge in der Tabelle unten)', { raw: multi.total }),
  ];
  const byProfil = {
    title: 'Kennzahlen je Profil',
    columns: [
      col('gruppe', 'Profil', 1), col('n', 'n (Vorgänge)', 1), col('personen', 'Personen', 2), col('erstversuch', 'Schriftlich im 1. Versuch bestanden', 1), col('durchgefallen', 'Schriftlich im 1. Versuch durchgefallen', 3),
      col('gesamt', 'Schriftlich insgesamt bestanden', 2), col('muendlich', 'Mündlich bestanden', 1), col('offen', 'Schriftlich offen', 2), col('passiv', 'davon passiv', 3),
    ],
    rows: o.byProfil.map((g) => ({
      gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small, personen: personCount(persons.filter((p) => (p.profil === undefined ? null : p.profil) === g.key)),
      erstversuch: formatPct(g.value.written.erstversuch.pct), durchgefallen: formatPct(g.value.written.erstversuchFailed.pct),
      gesamt: formatPct(g.value.written.gesamt.pct), muendlich: formatPct(g.value.oral.bestanden.pct), offen: g.value.written.offen, passiv: g.value.written.passiv,
    })),
    // A5: Zwei Prozessstufen, zwei Namen – die schriftliche Prüfung ist das Gate zur mündlichen
    note: SMALL_NOTE + '; schriftlich offen = Vorgänge ohne schriftliches Gesamtergebnis (frühere Stufe als die Kachel «Zertifizierung offen», die das Gesamtergebnis überhaupt meint), passiv = davon ohne Prüfung seit mehr als ' + PASSIVE_DAYS + ' Tagen und ohne Termin; Nenner der Quoten wie in den Kacheln',
  };
  // M2: Punkte für das Profil-Diagramm – dieselben Zahlen wie die Spalte «Schriftlich im 1. Versuch bestanden»
  // daneben, dazu ihr 95-%-Wilson-Intervall und der Gesamtwert als Bezugslinie. Keine neue Kennzahl.
  // Sortiert nach Quote, damit die Reihenfolge selbst schon eine Aussage ist; kleine Gruppen bleiben drin und tragen «*».
  const profilPunkte = {
    titel: 'Schriftlich im 1. Versuch bestanden, je Profil',
    punkte: o.byProfil
      .filter((g) => isNum(g.value.written.erstversuch.pct))
      .map((g) => {
        const r = g.value.written.erstversuch;
        const iv = wilsonInterval(r.count, r.n);
        return { label: groupLabel(g.key), pct: r.pct, n: r.n, low: iv.low, high: iv.high, small: r.n < SMALL_N };
      })
      .sort((a, b) => b.pct - a.pct),
    referenz: isNum(o.written.erstversuch.pct) ? { pct: o.written.erstversuch.pct, label: 'Gesamt' } : null,
  };
  return { kpis, byProfil, multi, profilPunkte };
}

// M3: Die sechs Quoten der Blöcke «Schriftlich» und «Mündlich» als Eingaben für die Messzeile. Keine neue Kennzahl –
// Label, Zähler, Nenner und Richtung kommen aus denselben Kacheln wie bisher; dazu die Jahresreihe derselben Quote
// für den Verlauf und der Benchmark als Referenzmarke. Die Reihenfolge ist die der Kacheln.
// Hier stehen nur Bestehensquoten. Die drei Durchfallquoten fehlen mit Absicht: «Schriftlich: im 1. Versuch
// durchgefallen» ist das exakte Komplement der Zeile darüber, und alle drei liegen auf der 50–100-%-Skala am linken
// Anschlag – gemessen an echten Daten 20.7 % und 3.5 % mündlich, also zwei von fünf Zeilen ohne Aussage auf der Spur.
// Eine eigene Skala ab 0 % für sie hiesse, den Sinn der gemeinsamen Spur aufzugeben. Als Kennzahlen bleiben sie
// vollständig erhalten: in der Vergleichstabelle, im Export und in den Ansichten «Schriftlich» und «Mündlich».
const MESSZEILEN_QUOTEN = [
  { label: 'Schriftlich: im 1. Versuch bestanden', gruppe: 'Schriftlich', jahr: (t) => t.written.erstversuch },
  { label: 'Schriftlich: insgesamt bestanden', gruppe: 'Schriftlich', jahr: (t) => t.written.gesamt },
  { label: 'Mündlich: bestanden', gruppe: 'Mündlich', jahr: (t) => t.oral.bestanden },
];

export function messzeilenEingaben(persons, kpis, { benchmarkLabel = null } = {}) {
  const reihen = timeSeries(persons);
  const byLabel = new Map((kpis || []).map((k) => [k.label, k]));
  return MESSZEILEN_QUOTEN.map((q) => {
    const k = byLabel.get(q.label);
    if (!k) return null;
    return {
      gruppe: q.gruppe,
      label: q.label,
      eingabe: {
        // Alle sechs Quoten stehen auf EINER Skala – deshalb trägt jede Zeile ihren vollen Namen samt Prüfungsart
        label: q.label,
        count: k.count, n: k.n, pct: k.raw, richtung: k.direction,
        referenz: isNum(k.benchmarkRaw) ? { pct: k.benchmarkRaw, label: 'Benchmark: ' + (benchmarkLabel || '–') } : null,
        jahre: reihen.map((j) => ({ year: j.year, pct: q.jahr(j).pct, n: q.jahr(j).n })),
      },
    };
  }).filter(Boolean);
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

// Darstellung einer Differenz zum Benchmark (PROMPT-2 A.4): Symbol nach Vorzeichen, Ton nach Richtung der Kennzahl
// (up: höher ist besser, down: tiefer ist besser, neutral: Mengen); unter 0.5 pp neutral «●». Farbe nie allein.
export function deltaView(delta, direction = 'neutral') {
  const text = formatPp(delta);
  if (Math.abs(delta) < 0.5) return { symbol: '●', tone: 'neutral', text };
  const symbol = delta > 0 ? '▲' : '▼';
  const better = direction === 'up' ? delta > 0 : direction === 'down' ? delta < 0 : null;
  return { symbol, tone: better === null ? 'neutral' : (better ? 'pos' : 'neg'), text };
}

// Richtung einer Kennzahl nach ihrer Beschriftung (Kacheln der Übersicht); unbekannt → neutral
let directionByLabel = null;
export function directionOfLabel(label) {
  if (!directionByLabel) directionByLabel = new Map(overviewModel([]).kpis.map((k) => [k.label, k.direction]));
  return directionByLabel.get(label) || 'neutral';
}

// Einordnung einer Differenz (PROMPT-2 Paket G, Entscheid 3): Ø-Kennzahlen über die Effektstärke d = Δ / σ(Benchmark), nur wenn
// beide n ≥ SMALL_N und σ > 0; Quoten über das 95-%-Wilson-Intervall der Auswahl («±pp · Benchmark im Intervall: ja/nein», auch bei
// n < 5, die Markierung * bleibt); Mengen und fehlende Werte «–». Vorzeichen von d wie Δ. Der Text trägt die Bedeutung, der Ton folgt Δ.
function einordnung(k, b) {
  if (!b || k.kind === 'count' || !isNum(k.raw) || !isNum(b.raw)) return '–';
  if (k.kind === 'mean') {
    if (k.small || b.small) return '–';
    const e = effectSize(k.raw, b.raw, b.sd);
    if (!isNum(e.d)) return '–';
    const r = Math.round(Math.abs(e.d) * 10 + 1e-9) / 10;
    return 'd ' + (r === 0 ? '' : (e.d > 0 ? '+' : '−')) + r.toFixed(1) + ' · ' + e.label;
  }
  if (!isNum(k.count) || !k.n) return '–';
  const w = wilsonInterval(k.count, k.n);
  if (!isNum(w.half)) return '–';
  const inside = b.raw >= w.low - 1e-12 && b.raw <= w.high + 1e-12;
  return '±' + (Math.round(w.half * 1000) / 10).toFixed(1) + ' pp · Benchmark im Intervall: ' + (inside ? 'ja' : 'nein');
}

// Anzahl je Art der Kennzahl. Die Spalte «n» trug bisher die Grundmenge der Auswahl, nicht den Nenner der Zelle
// daneben: Bei Quoten fiel das zusammen, bei Mengen nicht («Personen 8 · n 9» zählte Vorgänge, «Zertifizierung offen
// 3 · n 9» las sich als «3 von 9» und war es nicht). Der Zähler lag längst auf dem Modell (k.count) und wurde
// verworfen; die Kachel rendert ihn seit je. Jetzt gilt je Art eine Regel:
//   ratio → «Zähler von Nenner Einheit» (Einheit aus k.unit, sonst Vorgängen) – wie auf der Kachel
//   mean  → nur «n = Nenner»; ein Mittelwert hat keinen Zähler, jede Anzahl wäre erfunden
//   count → leer; der Wert in der Spalte «Auswahl» IST die absolute Zahl
function anzahlText(k) {
  if (!k) return '';
  if (k.kind === 'ratio') {
    return k.count === null || k.count === undefined ? 'n = ' + k.n : k.count + ' von ' + k.n + ' ' + (k.unit || 'Vorgängen');
  }
  return k.kind === 'mean' ? 'n = ' + k.n : '';
}

// Export der Kacheln («Kennzahlen gesamt»). Dieselbe Regel wie in der Vergleichstabelle, nur in zwei Spalten statt
// in einem Satz: Eine Tabellenkalkulation rechnet mit Zahlen, nicht mit «8 von 9 Vorgängen». Mengenzeilen tragen
// deshalb weder Zähler noch Nenner – ihr Wert IST die Anzahl, und die Grundmenge der Auswahl daneben hiesse etwas
// anderes als die Zeile («Personen 8 · n 9» zählte Vorgänge).
export function kennzahlenExportTable(kpis) {
  return {
    title: 'Kennzahlen gesamt',
    columns: [col('label', 'Kennzahl', 1), col('value', 'Wert', 1), col('count', 'Anzahl', 2), col('n', 'n (Nenner)', 2), col('einheit', 'Einheit', 3), col('hint', 'Beschreibung', 3)],
    rows: (kpis || []).map((k) => ({
      label: k.label,
      value: k.value,
      count: k.kind === 'ratio' && k.count !== null && k.count !== undefined ? k.count : '',
      n: k.kind === 'ratio' || k.kind === 'mean' ? k.n : '',
      einheit: k.kind === 'ratio' || k.kind === 'mean' ? (k.unit || 'Vorgänge') : '',
      hint: k.hint,
      small: k.small,
    })),
    note: 'Anzahl und Nenner nur bei Quoten und Ø-Kennzahlen; bei Mengen ist der Wert selbst die Anzahl. ' + SMALL_NOTE,
  };
}

export function comparisonTable(selectionKpis, benchmarkKpis, benchmarkLabel) {
  const byLabel = new Map(benchmarkKpis.map((k) => [k.label, k]));
  const rows = selectionKpis.map((k) => {
    const b = byLabel.get(k.label);
    let differenz = '';
    const delta = isNum(k.raw) && b && isNum(b.raw) ? (k.raw - b.raw) * 100 : null;
    if (k.kind !== 'count') differenz = isNum(delta) ? formatPp(delta) : '–';
    const direction = k.direction || 'neutral';
    return {
      kennzahl: k.label, auswahl: k.value, n: anzahlText(k), benchmark: b ? b.value : '–', n2: anzahlText(b), differenz, small: k.small, direction,
      einordnung: einordnung(k, b), einordnungTone: k.kind !== 'count' && isNum(delta) ? deltaView(delta, direction).tone : 'neutral',
    };
  });
  return {
    title: 'Auswahl im Vergleich zum Benchmark',
    columns: [col('kennzahl', 'Kennzahl', 1), col('auswahl', 'Auswahl', 1), col('n', 'Anzahl (Auswahl)', 2), col('benchmark', 'Benchmark: ' + benchmarkLabel, 2), col('n2', 'Anzahl (Benchmark)', 2), col('differenz', 'Differenz', 1), col('einordnung', 'Einordnung', 1, { toneKey: 'einordnungTone' })],
    rows,
    note: 'Anzahl: bei Quoten «Zähler von Nenner» (die Grundmenge der Quote, nicht der ganzen Auswahl), bei Ø-Kennzahlen nur der Nenner, bei Mengen leer – dort ist der Wert selbst die Anzahl. Differenz in Prozentpunkten (Auswahl minus Benchmark). Einordnung: bei Ø-Kennzahlen die Effektstärke d = Differenz geteilt durch σ des Benchmarks (unter 0.2 gering, bis 0.5 mittel, bis 0.8 deutlich, ab 0.8 gross; nur wenn beide n ≥ ' + SMALL_N + '); bei Quoten das 95-%-Wilson-Intervall der Auswahl (±pp) mit der Angabe, ob der Benchmark darin liegt; Mengen ohne Einordnung. ' + SMALL_NOTE,
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
    columns: [col('grund', 'Grund', 1), col('anzahl', 'Zeilen', 1)],
    rows: [...counts.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl || collatorDe.compare(a.grund, b.grund)),
  };
  const details = {
    title: 'Nicht in den Kennzahlen – Zeilen',
    columns: [col('sheet', 'Sheet', 1), col('row', 'Zeile', 1), col('name', 'Name', 2), col('profil', 'Profil', 2), col('bank', 'Bank', 3), col('grund', 'Grund', 1), col('status', 'Status', 3)],
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
    columns: [col('profil', 'Profil', 1), col('offen', 'Offen', 1), col('passiv', 'davon passiv (> ' + PASSIVE_DAYS + ' Tage)', 1), col('schriftlich', 'davon schriftlich offen', 2), col('muendlich', 'davon mündlich offen', 2), col('ohnePruefung', 'ohne Prüfung', 3), col('geplant', 'mit geplantem Termin', 2), col('kennzahlrelevant', 'kennzahlrelevant', 3)],
    rows: [...byProfil.values()].sort((a, b) => b.offen - a.offen || collatorDe.compare(a.profil, b.profil)),
    note: 'Offen = Gesamtergebnis leer (schriftlich und/oder mündlich), kein «no» und kein unlesbarer Wert. Passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen, kein Termin. Kennzahlrelevant = mindestens ein absolvierter, datierter schriftlicher Run.',
  };
  const details = {
    title: 'Offene Vorgänge – Teilnehmende',
    columns: [
      col('name', 'Name', 1), col('bank', 'Bank', 2), col('profil', 'Profil', 1), col('sprache', 'Sprache', 3), col('offen', 'Offen', 2), col('fehlend', 'Fehlende Teile', 1), col('passerelle', 'Passerelle', 3), col('passiv', 'Passiv', 2), col('letzte', 'Letzte Prüfung', 2),
      col('tage', 'Tage seit letzter Prüfung', 3), col('naechste', 'Nächster Termin', 1), col('versuche', 'Versuche', 2), col('sheet', 'Sheet', 3), col('row', 'Zeile', 3),
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
    columns: [col('profil', 'Profil', 1), col('we', 'Schriftlich (Vorgabe)', 1), col('oe', 'Mündlich (Vorgabe)', 2), col('anzahl', 'Anzahl Teile', 2), col('n', 'n (Vorgänge)', 2), col('daten', 'In den Daten (Vorgänge je Teil)', 3), col('abweichung', 'Abweichung', 1)],
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
  col('n', 'n (Vorgänge)', 1), col('personen', 'Personen', 2), col('erstversuch', 'Schriftlich im 1. Versuch bestanden', 1), col('gesamt', 'Schriftlich insgesamt bestanden', 2),
  col('muendlich', 'Mündlich bestanden', 1), col('wp1', 'Ø schriftlich 1. Versuch', 2), col('wp2', 'Ø schriftlich bestandener Run', 2), col('op1', 'Ø mündlich 1. Versuch', 3),
  col('op2', 'Ø mündlich bestandener Run', 3), col('offen', 'Offen', 3), col('passiv', 'Passiv', 3), col('nichtErfasst', 'Nicht erfasst', 3),
];

// persons: kennzahlrelevante Vorgänge ohne Zeitraumfilter
export function timeSeriesTable(persons) {
  const rows = timeSeries(persons).map((r) => seriesRow(String(r.year), r));
  return {
    title: 'Kennzahlen je Jahr',
    columns: [col('gruppe', 'Jahr', 1)].concat(TIME_COLUMNS),
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
    columns: [col('profil', 'Profil', 1), col('gruppe', 'Jahr', 1)].concat(TIME_COLUMNS),
    rows,
    note: SMALL_NOTE,
  };
}

// Reihen für das Liniendiagramm: [{ label, points: [{ x, y, n, small }] }]
// Kein «short» mehr (Paket B, B2): Die Endbeschriftung trägt nur noch den Wert, den Reihennamen nennt die Legende.
export function timeSeriesChartSeries(persons) {
  const ts = timeSeries(persons);
  const pick = (label, fn) => ({ label, points: ts.map((r) => ({ x: String(r.year), y: fn(r), n: r.n, small: r.small })) });
  return {
    quoten: [
      pick('Schriftlich im 1. Versuch bestanden', (r) => r.written.erstversuch.pct),
      pick('Schriftlich insgesamt bestanden', (r) => r.written.gesamt.pct),
      pick('Mündlich bestanden', (r) => r.oral.bestanden.pct),
    ],
    resultate: [
      pick('Ø schriftlich 1. Versuch', (r) => r.writtenPerf1.mean),
      pick('Ø mündlich 1. Versuch', (r) => r.oralPerf1.mean),
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
  t.columns = t.columns.map((c) => (c.key === 'auswahl' ? col('auswahl', String(yearA), c.prio) : c.key === 'n' ? col('n', 'n ' + yearA, c.prio) : c.key === 'n2' ? col('n2', 'n ' + yearB, c.prio) : c));
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
    wide: true, // 16 Spalten mit Streuung: Prio 3 erst ab 1900 px, Full HD (F.2, Paket G)
    columns: [col('jahr', 'Jahr', 1), col('teil', 'Teilprüfung', 1), col('n', 'n', 2), col('durchgefallen', 'Im 1. Versuch durchgefallen', 1), col('bestanden', 'Im 1. Versuch bestanden', 3), col('mean1', 'Ø Resultat 1. Versuch', 2), ...spreadColumns('1', '1. Versuch'), col('mean2', 'Ø Resultat bestandener Run', 3), ...spreadColumns('2', 'bestandener Run')],
    rows: cells.map((c) => ({ jahr: c.year, teil: mark(c.part, c.small), n: c.n, small: c.small, durchgefallen: formatPct(c.failed.pct), bestanden: formatPct(c.passed.pct), mean1: formatPct(c.meanFirst.mean), ...spreadCells('1', c.spreadFirst), mean2: formatPct(c.meanPassed.mean), ...spreadCells('2', c.spreadPassed) })),
    note: SMALL_NOTE + '; Jahr = Datum des ersten Versuchs (RUN1) der Teilprüfung; n = Vorgänge mit absolviertem, datiertem RUN1; ' + SPREAD_NOTE,
  };
  const years = [...new Set(cells.map((c) => c.year))].sort((a, b) => a - b);
  const parts = [...new Set(cells.map((c) => c.part))];
  const pivot = {
    title: 'Durchfallquote im 1. Versuch je Teilprüfung und Jahr',
    columns: [col('teil', 'Teilprüfung', 1)].concat(years.map((y) => col('y' + y, String(y)))),
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

// Histogramm der Resultate (PROMPT-2 Paket G, Stufe 4): Reihen für renderBarChart() (Anteil der Vorgänge je Klasse à 10 pp, Wertung
// 1. Versuch), Auswahl gegen Benchmark (zweite Reihe nur, wenn der Benchmark n ≥ 5 hat), und Tabellen-Zwilling mit Anzahl und Anteil.
// small = Auswahl mit n < 5: die Ansicht zeigt statt des Diagramms einen Hinweis; die Tabelle bleibt (Export vollständig).
export function histogramModel(persons, benchmarkPersons, kind = 'written', { benchmarkLabel = 'Benchmark' } = {}) {
  const fn = kind === 'oral' ? oralHistogram : writtenHistogram;
  const sel = fn(persons, MODE.ERSTVERSUCH);
  const bench = benchmarkPersons ? fn(benchmarkPersons, MODE.ERSTVERSUCH) : null;
  const points = (h) => h.bins.map((b) => ({ x: b.label, y: b.share, n: b.count, small: false }));
  const series = [{ label: 'Auswahl', points: points(sel) }];
  if (bench && !bench.small) series.push({ label: 'Benchmark: ' + benchmarkLabel, points: points(bench) });
  const columns = [col('klasse', 'Klasse', 1), col('n1', 'Auswahl (Anzahl)', 3), col('anteil1', 'Auswahl (Anteil)', 1)];
  if (bench) columns.push(col('n2', 'Benchmark: ' + benchmarkLabel + ' (Anzahl)', 3), col('anteil2', 'Benchmark: ' + benchmarkLabel + ' (Anteil)', 2));
  const rows = sel.bins.map((b, i) => {
    const row = { klasse: b.label + ' %', n1: b.count, anteil1: formatPct(b.share) };
    if (bench) { row.n2 = bench.bins[i].count; row.anteil2 = formatPct(bench.bins[i].share); }
    return row;
  });
  return {
    n: sel.n, small: sel.small, benchmarkSmall: !!bench && bench.small, series,
    table: {
      title: 'Verteilung der Resultate (1. Versuch)', columns, rows,
      note: 'Klassen à 10 Prozentpunkte des Resultats je Vorgang (Mittel der Teilprüfungen, Wertung 1. Versuch); obere Klassengrenze ausgeschlossen, 100 % in der letzten Klasse; Anteil = Vorgänge der Klasse an allen Vorgängen mit Wert (Auswahl n = ' + sel.n + (bench ? ', Benchmark n = ' + bench.n : '') + '); Diagramm erst ab n ≥ ' + SMALL_N,
    },
  };
}

// ---------------------------------------------------------------------------
// Ausbau (P7): Frühwarnung (b1), Durchlaufzeit und Abbruch (b5), Bank-Report (b2)
// ---------------------------------------------------------------------------

export function earlyWarningTable(persons) {
  const items = earlyWarnings(persons);
  return {
    title: 'Frühwarnung: zweiter Fehlversuch',
    columns: [
      col('stufe', 'Stufe', 1), col('name', 'Name', 1), col('bank', 'Bank', 2), col('profil', 'Profil', 2), col('teil', 'Teilprüfung', 1), col('fehlversuche', 'Fehlversuche', 2),
      col('letzter', 'Letzter Fehlversuch', 2), col('naechster', 'Nächster Termin', 1), col('status', 'Status Vorgang', 3), col('sheet', 'Sheet', 3), col('row', 'Zeile', 3),
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
      col('name', 'Name', 1), col('bank', 'Bank', 2), col('profil', 'Profil', 1), col('offen', 'Offen', 2), col('letzte', 'Letzte Prüfung', 2), col('tage', 'Tage seit letzter Prüfung', 1),
      col('letzterRun', 'Letzter Prüfungstag bestanden', 3), col('versuche', 'Versuche', 3), col('sheet', 'Sheet', 3), col('row', 'Zeile', 3),
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
    col('gruppe', first, 1), col('n', 'n (bestanden)', 1), col('median', 'Median Tage', 1), col('mean', 'Ø Tage', 2), col('p25', '25 %-Quantil', 2), col('p75', '75 %-Quantil', 2), col('min', 'Min', 3), col('max', 'Max', 3),
    col('nZert', 'n (mit Zertifikatsbeginn)', 3), col('medianZert', 'Median Tage bis Zertifikat', 3),
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
  kpis.columns = kpis.columns.map((c) => (c.key === 'auswahl' ? col('auswahl', bankLabel, c.prio) : c.key === 'n' ? col('n', 'n ' + bankLabel, c.prio) : c.key === 'n2' ? col('n2', 'n alle Banken', c.prio) : c));
  kpis.rows = kpis.rows.filter((r) => r.kennzahl !== 'Personen mit mehreren Profilen');
  const benchByProfil = new Map(bench.byProfil.rows.map((r) => [r.gruppe.replace(/ \*$/, ''), r]));
  const byProfil = {
    title: 'Je Profil: ' + bankLabel + ' und alle Banken',
    columns: [
      col('profil', 'Profil', 1), col('n', 'n ' + bankLabel, 1), col('erstversuch', 'Schriftlich 1. Versuch bestanden', 1), col('gesamt', 'Schriftlich insgesamt bestanden', 2), col('muendlich', 'Mündlich bestanden', 1),
      col('n2', 'n alle Banken', 2), col('erstversuch2', 'Schriftlich 1. Versuch bestanden (alle)', 3), col('gesamt2', 'Schriftlich insgesamt bestanden (alle)', 3), col('muendlich2', 'Mündlich bestanden (alle)', 3),
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
  // Prioritäten (A.5): erste Spalte, jüngster Stichtag, Heute und Differenz immer; ältere Stichtage ab Tablet
  const stichtage = list.map((s, i) => col('s' + i, stichtagLabel(s.stichtag), i === list.length - 1 ? 1 : 2));
  const heute = col('heute', 'Heute (' + stichtagLabel(current.stichtag) + ')', 1);
  const differenz = col('differenz', 'Differenz zum letzten Snapshot', 1);
  const fill = (row, cells, cur, d, kind) => {
    cells.forEach((c, i) => { row['s' + i] = kind === 'zaehler' ? (c === null || c === undefined ? '–' : c) : kpiCell(kind, c); });
    row.heute = kind === 'zaehler' ? (cur === null || cur === undefined ? '–' : cur) : kpiCell(kind, cur);
    row.differenz = kind === 'zaehler' ? signed(d) : deltaCell(kind, d);
    return row;
  };
  const kennzahlen = {
    title: 'Kennzahlen je Stichtag (gesamt, ohne Filter)',
    columns: [col('kennzahl', 'Kennzahl', 1)].concat(stichtage, [heute, differenz]),
    rows: compareKennzahlen(list, current).map((r) => fill({ kennzahl: r.label, direction: directionOfLabel(r.label) }, r.cells, r.current, r.delta, r.kind)),
    note: 'Anteile mit n (Nenner wie in der Übersicht), ' + SMALL_NOTE + '; Differenz heute gegenüber dem jüngsten Snapshot, Anteile in Prozentpunkten, Zählungen absolut.',
  };
  const zaehler = {
    title: 'Datei-Zähler je Stichtag (Zeilen, Status, Datenqualität)',
    columns: [col('zaehler', 'Zähler', 1)].concat(stichtage, [heute, differenz]),
    rows: compareZaehler(list, current).map((r) => fill({ zaehler: r.label, direction: 'neutral' }, r.cells, r.current, r.delta, 'zaehler')),
    note: 'Zeigt, wie sich die Datei zwischen den Stichtagen verändert hat (Zeilen, Duplikate, offene Vorgänge, Data-Quality-Einträge).',
  };
  const jeProfil = [['weGesamt', 'Schriftlich: insgesamt bestanden'], ['oeBestanden', 'Mündlich: bestanden'], ['vorgaenge', 'Vorgänge'], ['offen', 'Zertifizierung offen']].map(([key, label]) => {
    const kind = key === 'vorgaenge' || key === 'offen' ? 'count' : 'ratio';
    return {
      title: 'Je Profil: ' + label,
      columns: [col('profil', 'Profil', 1)].concat(stichtage, [heute, differenz]),
      rows: compareByGroup(list, current, 'jeProfil', 'profil', key).map((r) => fill({ profil: groupLabel(r.group), direction: kind === 'ratio' ? 'up' : 'neutral' }, r.cells, r.current, r.delta, kind)),
      note: kind === 'ratio' ? 'Anteil mit n je Profil und Stichtag, ' + SMALL_NOTE : 'Anzahl je Profil und Stichtag; «–» = Profil an diesem Stichtag ohne Vorgänge',
    };
  });
  return { kennzahlen, zaehler, jeProfil };
}

// ---------------------------------------------------------------------------
// Personen (PROMPT-2 Paket C): Trefferliste, Prüfungsraster, Zeitachse, Datenqualität je Person
// ---------------------------------------------------------------------------

// Wirkungs- und Stufentexte wie in der Ansicht «Datenqualität» (store.js IMPACT_LABELS / views/dataQuality.js LEVEL_LABELS);
// lokal gehalten, damit tables.js frei von store.js bleibt
const DQ_IMPACT_TEXT = { unsichtbar: 'macht Zeile unsichtbar', kennzahl: 'verändert Kennzahl', keine: 'ohne Kennzahlwirkung' };
const DQ_LEVEL_TEXT = { fehler: 'Fehler', hinweis: 'Hinweis', 'nicht-ausgewertet': 'Nicht ausgewertet' };

// Trefferliste (C.2): eine Zeile je Person (Einträge aus metrics.personSearchIndex). Jahrgang nur, wenn Namensgleiche in der Liste
// stehen, und nur in deren Zeilen (Entscheid 06.09.2026, Frage 3: Datenminimierung, trotzdem unterscheidbar). row.key = Personenschlüssel
// für die Auswahl im DOM – nie in der URL.
export function personResultsTable(entries) {
  const byName = new Map();
  for (const e of entries) byName.set(e.nameKey, (byName.get(e.nameKey) || 0) + 1);
  const twins = [...byName.values()].some((n) => n > 1);
  const columns = [col('name', 'Name', 1)];
  if (twins) columns.push(col('jahrgang', 'Jahrgang', 1));
  columns.push(col('bank', 'Bank', 1), col('profile', 'Profile', 1), col('status', 'Status', 2), col('letzte', 'Letzte Prüfung', 2), col('zertifikate', 'Zertifikate', 2), col('vorgaenge', 'Vorgänge', 3), col('schluessel', 'Schlüssel', 3));
  return {
    title: 'Trefferliste',
    columns,
    rows: entries.map((e) => ({
      key: e.key, name: e.name, jahrgang: twins && byName.get(e.nameKey) > 1 && e.birthDate ? String(e.birthDate.getFullYear()) : '', bank: e.bank || '', profile: e.profiles.join(' → '),
      status: e.passiv ? 'passiv' : e.status, letzte: fmtDate(e.lastExam), zertifikate: e.certCount, vorgaenge: e.vorgaenge.length,
      schluessel: e.keyLevel === 'full' ? 'Name + Geburtsdatum' : 'ohne Geburtsdatum',
    })),
    empty: 'Keine Person gefunden.',
    note: 'Eine Zeile je Person (Personenschlüssel); Profile in zeitlicher Abfolge; Status und letzte Prüfung des jüngsten Vorgangs. «ohne Geburtsdatum»: Namensgleiche fallen zusammen. Enthält Namen – nur intern (E7).',
  };
}

// Zelle des Rasters: «12.03.2026 · 82.0 % · bestanden» | «geplant · 29.09.2026» | «–» (nicht absolviert)
function gridCell(r) {
  if (r.planned) return 'geplant · ' + fmtDate(r.date);
  if (!r.taken) return '–';
  return [fmtDate(r.date) || 'ohne Datum', formatPct(r.result), r.ergebnis].join(' · ');
}

// Prüfungsraster (C.3): Teilprüfungen × RUN1–RUN3; die Spalten RUN1–RUN3 tragen status: true (Badge auf dem Ergebnis, views/common.js)
export function personGridTable(vorgang) {
  const g = examGrid(vorgang);
  return {
    title: 'Prüfungsraster',
    columns: [col('teil', 'Teilprüfung', 1), col('run1', 'RUN1', 1, { status: true }), col('run2', 'RUN2', 1, { status: true }), col('run3', 'RUN3', 2, { status: true })],
    rows: g.rows.map((r) => ({ teil: r.label + (r.inSpec ? '' : ' (ausserhalb der Vorgabe)'), run1: gridCell(r.runs[0]), run2: gridCell(r.runs[1]), run3: gridCell(r.runs[2]) })),
    note: (g.spec ? 'Teile gemäss Vorgabe für das Profil (config.js, PROFILE_PARTS)' : 'Kein Profil mit Vorgabe – genutzte Teile')
      + (g.outside.length ? '; absolvierte Runs ausserhalb der Vorgabe: ' + g.outside.join(', ') + ' (Hinweis im Data-Quality-Log)' : '') + '.',
  };
}

// Zeitachse (C.3): alle datierten Runs (absolviert und geplant) und der Zertifikatsbeginn, chronologisch
export function personTimelineTable(vorgang) {
  return {
    title: 'Zeitachse',
    columns: [col('datum', 'Datum', 1), col('ereignis', 'Ereignis', 1), col('ort', 'Ort', 3), col('resultat', 'Resultat', 2), col('ergebnis', 'Ergebnis', 1)],
    rows: runTimeline(vorgang).map((e) => ({ datum: fmtDate(e.date) || 'ohne Datum', ereignis: e.label, ort: e.location || '', resultat: formatPct(e.result), ergebnis: e.ergebnis })),
    empty: 'Keine absolvierten oder geplanten Prüfungen.',
    note: 'Absolvierte und geplante Runs sowie der Zertifikatsbeginn; entspricht dem Blatt «Runs» des Exports.',
  };
}

// Datenqualität der Person (C.3): Einträge zu den Zeilen ihrer Vorgänge (inklusive zusammengeführter Zeilen), reduziert wie in der Ansicht «Datenqualität»
export function personDqTable(dq, vorgaenge) {
  const keys = new Set();
  for (const v of vorgaenge) {
    keys.add(v.sheetName + '|' + v.row);
    for (const dup of v.duplicates || []) keys.add(dup.sheet + '|' + dup.row);
  }
  const rows = dq.filter((e) => keys.has(e.sheet + '|' + e.row));
  return {
    title: 'Datenqualität',
    columns: [col('wirkung', 'Wirkung', 2), col('stufe', 'Stufe', 1), col('sheet', 'Sheet', 3), col('row', 'Zeile', 2), col('header', 'Header', 1), col('raw', 'Rohwert', 3), col('grund', 'Grund', 1)],
    rows: rows.map((e) => ({
      wirkung: DQ_IMPACT_TEXT[e.impact] || 'verändert Kennzahl', stufe: DQ_LEVEL_TEXT[e.level] || 'Fehler', sheet: e.sheet, row: e.row, header: e.header,
      raw: e.raw === null || e.raw === undefined ? '' : String(e.raw), grund: e.reason,
    })),
    empty: 'Keine Einträge im Data-Quality-Log zu dieser Person.',
  };
}

// ---------------------------------------------------------------------------
// Experten (PROMPT-2 Paket D, E8/E9): KPIs, Haupttabelle mit Δ zum Benchmark, Detail je Experte, Paarungen, Export Einsatzebene
// ---------------------------------------------------------------------------

function pctOrDash(r) {
  return r && isNum(r.pct) ? formatPct(r.pct) : '–';
}

function meanOrDash(m) {
  return m && isNum(m.mean) ? formatPct(m.mean) : '–';
}

// Δ in Prozentpunkten zwischen zwei Anteilen; leer, wenn eine Seite keinen Wert hat
function ppDelta(a, b) {
  return isNum(a) && isNum(b) ? formatPp((a - b) * 100) : '';
}

function median(values) {
  const s = values.filter(isNum).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function groupTable(title, label, groups) {
  return {
    title,
    columns: [col('gruppe', label, 1), col('einsaetze', 'Einsätze', 1), col('fail', 'Durchfallquote', 1), col('result', 'Ø Resultat', 2)],
    rows: groups.map((g) => ({ gruppe: g.key, einsaetze: g.einsaetze, fail: pctOrDash(g.fail.gesamt), result: meanOrDash(g.result), small: g.einsaetze < SMALL_N })),
    empty: 'Keine Einsätze.',
  };
}

// runs = metrics.expertRuns(); deltaDirection: Farbe der Δ-Spalten (Entscheid 06.09.2026: neutral – Beobachtungswerte, keine Leistungsbeurteilung)
export function expertTables(runs, { deltaDirection = 'neutral' } = {}) {
  const bench = expertBenchmark(runs);
  const stats = expertStats(runs);
  const perExpert = stats.map((s) => s.einsaetze);
  const avg = mean(perExpert);
  const med = median(perExpert);
  const kpi = (label, value, n, extra = {}) => ({ label, value, n, small: false, kind: 'count', group: 'Experten', direction: 'neutral', ...extra });
  const kpis = [
    kpi('Experten', String(bench.experten), bench.experten, { hint: 'Experten mit mindestens einem Einsatz im aktiven Filter' }),
    kpi('Einsätze', String(runs.length), runs.length, { hint: 'Absolvierte mündliche Runs mit mindestens einem Experten; ein Einsatz zählt für beide Experten' }),
    kpi('Ø Einsätze je Experte', isNum(avg.mean) ? (Math.round(avg.mean * 10) / 10).toFixed(1) + ' (Median ' + (Math.round(med * 10) / 10) + ')' : '–', bench.experten, { hint: 'Einsätze geteilt durch Experten; Median in Klammern' }),
    kpi('Durchfallquote 1. Versuch', pctOrDash(bench.fail.erst), bench.fail.erst.n, { kind: 'ratio', unit: 'Einsätzen', count: bench.fail.erst.count, small: bench.fail.erst.small, hint: 'Benchmark aller Experten: Anteil nicht bestandener Einsätze im ersten Versuch (RUN1)' }),
    kpi('Durchfallquote Wiederholung', pctOrDash(bench.fail.wdh), bench.fail.wdh.n, { kind: 'ratio', unit: 'Einsätzen', count: bench.fail.wdh.count, small: bench.fail.wdh.small, hint: 'Benchmark aller Experten: Anteil nicht bestandener Einsätze bei Wiederholungen (RUN2, RUN3)' }),
    kpi('Ø Resultat (Experten)', meanOrDash(bench.result), bench.result.n, { kind: 'mean', hint: 'Mittel der Resultate aller Einsätze mit Wert (Result, E6)', spread: formatSpread(bench.spread) }),
  ];
  const delta = (key, label, prio) => col(key, label, prio, { direction: deltaDirection });
  const main = {
    title: 'Experten',
    wide: true, // 17 Spalten (13 + Streuung): Prio 3 erst ab 1900 px statt 1200 px (PROMPT-2 F.2, Option 1, 07.09.2026; mit Streuung 17 Spalten, in der CI 1761 px breit)
    columns: [
      col('experte', 'Experte', 1), col('einsaetze', 'Einsätze', 1), col('role1', 'als Experte 1', 2), col('role2', 'als Experte 2', 2), col('anteil1', 'Anteil Experte 1', 2),
      col('fail1', 'Durchfallquote 1. Versuch', 1), delta('delta1', 'Δ 1. Versuch', 1), col('failW', 'Durchfallquote Wiederholung', 2), delta('deltaW', 'Δ Wiederholung', 2),
      col('result', 'Ø Resultat', 2), delta('deltaR', 'Δ Ø Resultat', 3), ...spreadColumns('', 'Resultat'), col('erster', 'Erster Einsatz', 3), col('letzter', 'Letzter Einsatz', 3),
    ],
    rows: stats.map((s) => ({
      key: s.key, experte: s.name, einsaetze: s.einsaetze, role1: s.role1, role2: s.role2, anteil1: pctOrDash(s.anteilRole1),
      fail1: pctOrDash(s.fail.erst), delta1: ppDelta(s.fail.erst.pct, bench.fail.erst.pct), failW: pctOrDash(s.fail.wdh), deltaW: ppDelta(s.fail.wdh.pct, bench.fail.wdh.pct),
      result: meanOrDash(s.result), deltaR: ppDelta(s.result.mean, bench.result.mean), ...spreadCells('', s.spread), erster: fmtDate(s.first), letzter: fmtDate(s.last), small: s.small,
    })),
    empty: 'Keine Einsätze im aktiven Filter.',
    note: 'Beobachtungswerte, keine Leistungsbeurteilung: ein Einsatz zählt für beide Experten voll; Δ = Wert des Experten minus Benchmark aller Experten derselben Versuchsart, in Prozentpunkten, neutral dargestellt (E9). ' + SMALL_NOTE,
  };
  const details = new Map(stats.map((s) => [s.key, {
    jahr: groupTable('Je Jahr', 'Jahr', s.byYear),
    profil: groupTable('Je Profil', 'Profil', s.byProfil),
    sprache: groupTable('Je Sprache', 'Sprache', s.bySprache),
    partner: {
      title: 'Partner',
      columns: [col('partner', 'Partner', 1), col('einsaetze', 'Einsätze', 1), col('fail', 'Durchfallquote', 2), col('result', 'Ø Resultat', 3)],
      rows: s.partners.map((p) => ({ partner: p.name, einsaetze: p.einsaetze, fail: pctOrDash(p.fail.gesamt), result: meanOrDash(p.result), small: p.einsaetze < SMALL_N })),
      empty: 'Keine gemeinsamen Einsätze.',
    },
  }]));
  const pairs = {
    title: 'Paarungen Experte 1 × Experte 2',
    columns: [col('expert1', 'Experte 1', 1), col('expert2', 'Experte 2', 1), col('einsaetze', 'Einsätze', 1), col('fail', 'Durchfallquote', 2), col('result', 'Ø Resultat', 3)],
    rows: expertPairs(runs).map((p) => ({ expert1: p.expert1, expert2: p.expert2, einsaetze: p.einsaetze, fail: pctOrDash(p.fail), result: meanOrDash(p.result), small: p.einsaetze < SMALL_N })),
    empty: 'Keine Einsätze mit zwei verschiedenen Experten.',
    note: 'Einsätze mit zwei verschiedenen Experten, unabhängig von der Rollenreihenfolge; häufigste Paare zuerst (höchstens 30).',
  };
  return { benchmark: bench, kpis, main, details, pairs };
}

// Einsatzebene (Entscheid 06.09.2026, Frage 3): eine Zeile je Einsatz mit Kandidatenname – mit Namen, nur intern (E5, E8)
export function expertRunExportTable(runs) {
  const expertName = (r, role) => { const e = r.experts.find((x) => x.role === role); return e ? e.name : ''; };
  return {
    title: 'Einsätze',
    columns: [
      col('datum', 'Datum'), col('teil', 'Teilprüfung'), col('run', 'Run'), col('versuch', 'Versuch'), col('experte1', 'Experte 1'), col('experte2', 'Experte 2'), col('bestanden', 'Bestanden'), col('resultat', 'Resultat'),
      col('profil', 'Profil'), col('sprache', 'Sprache'), col('bank', 'Bank'), col('kandidat', 'Kandidat'), col('sheet', 'Sheet'), col('row', 'Zeile'),
    ],
    rows: runs.map((r) => ({
      datum: fmtDate(r.date), teil: r.part, run: r.run, versuch: r.erstversuch ? '1. Versuch' : 'Wiederholung', experte1: expertName(r, 1), experte2: expertName(r, 2),
      bestanden: yesNo(r.passed), resultat: formatPct(r.result), profil: groupLabel(r.profil), sprache: groupLabel(r.sprache), bank: r.bank || '', kandidat: personName(r.person), sheet: r.person.sheetName, row: r.person.row,
    })),
    note: 'Eine Zeile je Einsatz (absolvierter mündlicher Run mit Experten) im aktiven Filter. Enthält Namen von Kandidaten und Experten – mit Namen, nur intern (E5, E8).',
  };
}

// Sortierung für Tabellen mit Textzellen (Experten-Haupttabelle): Prozent, pp, Datum dd.mm.yyyy und Zahlen numerisch,
// Text mit Collator; Strich und leere Zellen am Ende; stabil; liefert eine Kopie
export function sortTableRows(rows, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const value = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (!s || s === '–') return null;
    const dm = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    if (dm) return Number(dm[3] + dm[2] + dm[1]);
    const nm = /^([−+-]?)(\d+(?:[.,]\d+)?)\s*(%|pp)?$/.exec(s);
    if (nm) return (nm[1] === '−' || nm[1] === '-' ? -1 : 1) * Number(nm[2].replace(',', '.'));
    return s;
  };
  return rows.map((row, i) => ({ row, i, v: value(row[key]) })).sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    const cmp = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : collatorDe.compare(String(a.v), String(b.v));
    return sign * cmp || a.i - b.i;
  }).map((x) => x.row);
}

// ---------------------------------------------------------------------------
// Änderungen über die App (Historie des Schreibpfads, Paket E): Einträge aus Reporting_KUBA.changes.json neben der Datei
// ---------------------------------------------------------------------------

// entries = datasource.loadAudit() (neueste zuerst); persons = geladene Zeilen für den Namen zur Fundstelle (nur intern)
export function auditTable(entries, persons = []) {
  const byRow = new Map(persons.map((p) => [p.sheetName + '|' + p.row, p]));
  const text = (v) => (v === null || v === undefined || v === '' ? 'leer' : String(v));
  return {
    title: 'Änderungen über die App',
    columns: [col('zeit', 'Zeitpunkt', 1), col('name', 'Name', 1), col('sheet', 'Sheet', 3), col('row', 'Zeile', 2), col('header', 'Header', 1), col('alt', 'Alt', 2), col('neu', 'Neu', 1), col('grund', 'Grund', 1), col('konto', 'Konto', 3)],
    rows: entries.map((e) => {
      const p = byRow.get(e.sheet + '|' + e.row);
      return { zeit: fmtDate(e.at) + ' ' + fmtTime(e.at), name: p ? personName(p) : '', sheet: e.sheet, row: e.row, header: e.header, alt: text(e.old), neu: text(e.new), grund: e.reason || '', konto: e.user || '' };
    }),
    empty: 'Keine Änderungen über die App – oder die Datei wurde lokal geladen (das Protokoll liegt neben der Datei auf SharePoint).',
    note: 'Änderungsprotokoll des Schreibpfads (Reporting_KUBA.changes.json neben der Datei): ein Eintrag je geschriebener Zelle, neueste zuerst; Name aus den geladenen Daten. Enthält Namen – nur intern.',
  };
}

// Feldschlüssel eines Runs («oe1.run2.date», siehe config.runKey) → Ziel im Prüfungsraster { kind, part, run, what }; andere Felder null.
// Für den Sprung aus dem Data-Quality-Log zur betroffenen Zelle (Bereinigung über den Schreibpfad).
export function runFieldTarget(field) {
  const m = /^(we|oe)(\d+)\.run(\d+)\.(passed|date|score|result|location|expert1|expert2)$/.exec(String(field || ''));
  if (!m) return null;
  if (m[1] === 'we' && m[4].startsWith('expert')) return null;
  return { kind: m[1], part: Number(m[2]), run: Number(m[3]), what: m[4] };
}
