// views/tables.js – reine Tabellenmodelle für die Views (kein DOM), getestet in tests/tables.test.js.
// Jede Tabelle: { title, columns: [{ key, label }], rows: [{ … , small }], note }.
// Prozent mit 1 Dezimale, immer mit n; Gruppen mit n < 5 tragen die Markierung «*».
// Begriffe (E3): «Vorgänge» für alle prüfungsbezogenen Quoten, «Personen» nur, wo Menschen gezählt werden.

import {
  MODE, SMALL_N, formatPct, writtenPassRates, writtenPerformance, partFirstAttempt, oralPassRates, oralPerformance,
  byGroup, vssVsmBreakdown, topWritten, topOral, awardRanking, overview, plannedRuns, plannedGroups,
  multiProfilePersons, personCount, excludedRows, openCases, STATUS,
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
  const row = (label, small, n, r) => ({
    gruppe: mark(label, small), n, small,
    erstversuch: formatPct(r.erstversuch.pct), durchgefallen: formatPct(r.erstversuchFailed.pct),
    gesamt: formatPct(r.gesamt.pct), abgeschlossen: r.gesamt.n, offen: r.offen, nichtErfasst: r.nichtErfasst,
  });
  const rows = [row('Gesamt', smallTotal, persons.length, total)];
  for (const g of byGroup(persons, key, writtenPassRates)) rows.push(row(groupLabel(g.key), g.small, g.n, g.value));
  return {
    title: 'Bestehensquote schriftlich nach ' + GROUP_LABELS[key],
    columns: [
      col('gruppe', GROUP_LABELS[key]), col('n', 'n (Vorgänge)'), col('erstversuch', 'Im 1. Versuch bestanden'), col('durchgefallen', 'Im 1. Versuch durchgefallen'),
      col('gesamt', 'Insgesamt bestanden'), col('abgeschlossen', 'n (abgeschlossen)'), col('offen', 'Offen'), col('nichtErfasst', 'Nicht erfasst'),
    ],
    rows,
    note: SMALL_NOTE + '; 1. Versuch: Nenner sind Vorgänge mit absolviertem RUN1; insgesamt bestanden: Nenner sind abgeschlossene Vorgänge (bestanden + nicht bestanden); offen = Gesamtergebnis leer (läuft noch), nicht erfasst = Gesamtergebnis unlesbar',
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
    bestanden: formatPct(rates.bestanden.pct), nichtBestanden: formatPct(rates.nichtBestanden.pct), offen: rates.offen, nichtErfasst: rates.nichtErfasst,
    angetreten: rates.angetreten, failed1: formatPct(rates.failed1.pct), failed2: formatPct(rates.failed2.pct),
  };
}

export function oralRateTable(persons, key) {
  const rows = [oralRow('Gesamt', oralPassRates(persons))];
  for (const g of byGroup(persons, key, oralPassRates)) rows.push(oralRow(groupLabel(g.key), g.value));
  return {
    title: 'Bestehensquote mündlich nach ' + GROUP_LABELS[key],
    columns: [
      col('gruppe', GROUP_LABELS[key]), col('n', 'n (abgeschlossen)'), col('bestanden', 'Bestanden'), col('nichtBestanden', 'Nicht bestanden'), col('offen', 'Offen'), col('nichtErfasst', 'Nicht erfasst'),
      col('angetreten', 'n (angetreten)'), col('failed1', 'Im 1. Versuch durchgefallen'), col('failed2', '2× durchgefallen'),
    ],
    rows,
    note: SMALL_NOTE + '; bestanden / nicht bestanden: Nenner sind abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden); durchgefallen: Nenner sind angetretene Vorgänge (absolvierter, datierter OE1 RUN1)',
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
    personen: new Set(runs.map((r) => r.person.personKey)).size, // Menschen mit geplanten Terminen
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
      col('gesamt', 'Schriftlich insgesamt bestanden'), col('muendlich', 'Mündlich bestanden'), col('offen', 'Offen'),
    ],
    rows: o.byProfil.map((g) => ({
      gruppe: mark(groupLabel(g.key), g.small), n: g.n, small: g.small, personen: personCount(persons.filter((p) => (p.profil === undefined ? null : p.profil) === g.key)),
      erstversuch: formatPct(g.value.written.erstversuch.pct), durchgefallen: formatPct(g.value.written.erstversuchFailed.pct),
      gesamt: formatPct(g.value.written.gesamt.pct), muendlich: formatPct(g.value.oral.bestanden.pct), offen: g.value.written.offen,
    })),
    note: SMALL_NOTE + '; offen = Vorgänge ohne schriftliches Gesamtergebnis; Nenner der Quoten wie in den Kacheln',
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
export function openCasesTables(persons, today = new Date()) {
  const cases = openCases(persons, today);
  const byProfil = new Map();
  for (const c of cases) {
    const key = groupLabel(c.person.profil);
    const g = byProfil.get(key) || { profil: key, offen: 0, ohnePruefung: 0, schriftlich: 0, muendlich: 0, geplant: 0, kennzahlrelevant: 0 };
    g.offen += 1;
    if (!c.lastExam) g.ohnePruefung += 1;
    if (c.person.weStatus === STATUS.OFFEN) g.schriftlich += 1;
    if (c.person.oeStatus === STATUS.OFFEN) g.muendlich += 1;
    if (c.nextPlanned) g.geplant += 1;
    if (c.eligible) g.kennzahlrelevant += 1;
    byProfil.set(key, g);
  }
  const summary = {
    title: 'Offene Vorgänge je Profil',
    columns: [col('profil', 'Profil'), col('offen', 'Offen'), col('schriftlich', 'davon schriftlich offen'), col('muendlich', 'davon mündlich offen'), col('ohnePruefung', 'ohne Prüfung'), col('geplant', 'mit geplantem Termin'), col('kennzahlrelevant', 'kennzahlrelevant')],
    rows: [...byProfil.values()].sort((a, b) => b.offen - a.offen || collatorDe.compare(a.profil, b.profil)),
    note: 'Offen = Gesamtergebnis leer (schriftlich und/oder mündlich), kein «no» und kein unlesbarer Wert. Kennzahlrelevant = mindestens ein absolvierter, datierter schriftlicher Run.',
  };
  const details = {
    title: 'Offene Vorgänge – Teilnehmende',
    columns: [
      col('name', 'Name'), col('bank', 'Bank'), col('profil', 'Profil'), col('sprache', 'Sprache'), col('offen', 'Offen'), col('letzte', 'Letzte Prüfung'),
      col('tage', 'Tage seit letzter Prüfung'), col('naechste', 'Nächster Termin'), col('versuche', 'Versuche'), col('sheet', 'Sheet'), col('row', 'Zeile'),
    ],
    rows: cases.map((c) => ({
      name: personName(c.person), bank: c.person.employerCanon || '', profil: groupLabel(c.person.profil), sprache: groupLabel(c.person.sprache), offen: c.offen,
      letzte: fmtDate(c.lastExam), tage: c.daysSinceLastExam === null ? '' : c.daysSinceLastExam, naechste: fmtDate(c.nextPlanned), versuche: c.attempts,
      sheet: c.person.sheetName, row: c.person.row,
    })),
    note: 'Sortiert nach letzter Prüfung (älteste zuerst); Vorgänge ohne Prüfung am Ende.',
  };
  return { summary, details, total: cases.length, ohnePruefung: cases.filter((c) => !c.lastExam).length, mitTermin: cases.filter((c) => c.nextPlanned).length };
}
