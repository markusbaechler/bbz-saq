// metrics.js – reine Funktionen: (Vorgänge[], Filter/Modus) → Kennzahlen.
// Kein DOM, kein Graph, keine Seiteneffekte. Alle Quoten mit n (Nenner); Gruppen n<5 gekennzeichnet.
// Voraussetzung: die Einträge stammen aus store.js (eine Zeile = ein Zertifizierungsvorgang, Parametername historisch
// «persons») und wurden mit filterPersons() gefiltert. Menschen (Personen) liefert groupByPerson() über den Personenschlüssel.
//
// Modell (Entscheide E1–E4):
// - Duplikate (duplicateOf gesetzt) sind keine Vorgänge und fliessen nie in Kennzahlen.
// - Status je Vorgang: bestanden / nicht bestanden / offen (läuft noch) / nicht erfasst (unlesbar).
//   Nenner der Bestehensquoten «insgesamt bestanden» und «mündlich bestanden» = abgeschlossene Vorgänge (bestanden + nicht bestanden).
//   Offene und nicht erfasste Vorgänge werden als eigene Zahlen ausgewiesen.
//
// Fachliche Regeln (PROMPT.md):
// - Referenzdatum: Datum des bestandenen OE-Runs, sonst letztes Prüfungsdatum (store.js, refDate).
// - Versuchsmodus: ERSTVERSUCH = nur RUN1 zählt; BESTANDEN = der bestandene Run zählt.
//   Im Modus BESTANDEN hat eine Person nur dann einen Wert, wenn alle vorhandenen Teilprüfungen
//   bestanden sind (Auftraggeber: «es müssen alle Teilprüfungen bestanden werden»).
// - Voraussetzung für mündlich ist die bestandene schriftliche Prüfung (Konsistenzprüfung in store.js → DQ-Log).
// - Filter «Versuche»: alle | erstversuch (kein RUN2/RUN3 absolviert) | mehrere (≥1 RUN2/RUN3 absolviert).
// - Geplante Prüfungen: Runs mit Datum in der Zukunft ohne Passed-Wert (store.js setzt run.planned), nach Tag und Ort.
// - Schriftlich: Erstversuchsquote (alle vorhandenen WE RUN1 bestanden) UND Gesamterfolgsquote (WE All Passed).
// - Mündlich: Bestehensquote = OE All Passed; 1× durchgefallen = OE1 RUN1=false; 2× = OE1 RUN1=false ∧ RUN2=false;
//   Nenner = Personen mit OE1 RUN1-Datum.
// - Award = 0.5·Schriftlich + 0.5·Mündlich, nur mit bestandener OE; Tie-Break: weniger Versuche, früheres Referenzdatum.

import { CONFIG, PROFILES } from './config.js';

export const MODE = Object.freeze({ ERSTVERSUCH: 'erstversuch', BESTANDEN: 'bestanden' });

// Status eines Vorgangs bzw. seiner Teile (E4)
export const STATUS = Object.freeze({ BESTANDEN: 'bestanden', NICHT_BESTANDEN: 'nicht bestanden', OFFEN: 'offen', NICHT_ERFASST: 'nicht erfasst' });

export const SMALL_N = 5; // Gruppen mit n < 5 kennzeichnen

export const DEFAULT_FILTER = Object.freeze({
  from: null,          // Date | null – wirkt auf Referenzdatum
  to: null,            // Date | null – inklusive (Tagesende)
  profil: [],          // [] = alle
  sprache: [],         // [] = alle
  bank: [],            // employerCanon, [] = alle
  vssVsm: 'alle',      // 'alle' | 'vss' | 'vsm' | 'ohne'
  versuche: 'alle',    // 'alle' | 'erstversuch' | 'mehrere'
  onlyIssued: false,   // nur source = 'issued'
  mode: MODE.ERSTVERSUCH,
});

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

export function ratio(count, n) {
  return { count, n, pct: n > 0 ? count / n : null, small: n < SMALL_N };
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function mean(values) {
  const nums = values.filter(isNum);
  if (!nums.length) return { mean: null, n: 0 };
  return { mean: nums.reduce((a, b) => a + b, 0) / nums.length, n: nums.length };
}

// Anteil 0..1 → «83.3 %»; null → «–»
export function formatPct(value, digits = 1) {
  if (!isNum(value)) return '–';
  const factor = Math.pow(10, digits);
  return (Math.round(value * 100 * factor + 1e-9) / factor).toFixed(digits) + ' %';
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

// Kein Duplikat (E1)
export function isVorgang(p) {
  return !p.duplicateOf;
}

// In Kennzahlen fliessen nur Vorgänge (keine Duplikate) mit ≥1 absolviertem, datiertem WE-Run.
export function eligible(persons) {
  return persons.filter((p) => isVorgang(p) && p.hasWeDate);
}

// Ausschlussgrund einer Zeile (null = kennzahlrelevant)
export function exclusionReason(p) {
  if (p.duplicateOf) return 'Duplikat (zusammengeführt mit «' + p.duplicateOf.sheet + '» Zeile ' + p.duplicateOf.row + ')';
  if (!p.hasWeDate) {
    const anyTaken = p.we.concat(p.oe).some((part) => part.runs.some((r) => r.taken));
    const anyWeTaken = p.we.some((part) => part.runs.some((r) => r.taken));
    const anyPlanned = p.we.concat(p.oe).some((part) => part.runs.some((r) => r.planned));
    if (anyWeTaken) return 'Schriftlicher Run ohne Prüfungsdatum';
    if (anyTaken) return 'Nur mündliche Runs erfasst, kein schriftlicher Run';
    if (anyPlanned) return 'Noch keine Prüfung absolviert (nur geplante Termine)';
    return 'Noch keine Prüfung absolviert';
  }
  return null;
}

// Alle Zeilen, die nicht in die Kennzahlen fliessen, mit Grund (Blocker 2): [{ person, reason }]
export function excludedRows(persons) {
  return persons.map((p) => ({ person: p, reason: exclusionReason(p) })).filter((x) => x.reason !== null);
}

// Offene Vorgänge (E4): Vorgang läuft noch. Zustand je Vorgang für die Ansicht «Offene Vorgänge».
export function openCaseState(p, today = new Date()) {
  const runs = p.we.concat(p.oe).flatMap((part) => part.runs);
  const dated = runs.filter((r) => r.taken && r.date).map((r) => r.date.getTime());
  const planned = runs.filter((r) => r.planned && r.date).map((r) => r.date.getTime());
  const lastExam = dated.length ? new Date(Math.max(...dated)) : null;
  const nextPlanned = planned.length ? new Date(Math.min(...planned)) : null;
  const open = [];
  if (p.weStatus === STATUS.OFFEN) open.push('schriftlich');
  if (p.oeStatus === STATUS.OFFEN) open.push('mündlich');
  return {
    lastExam,
    nextPlanned,
    offen: open.join(' und '),
    attempts: p.attemptsTotal,
    eligible: isVorgang(p) && p.hasWeDate,
    daysSinceLastExam: lastExam ? Math.floor((today.getTime() - lastExam.getTime()) / 86400000) : null,
  };
}

// [{ person, ...openCaseState }] – nur Vorgänge (keine Duplikate) mit Status offen; älteste letzte Prüfung zuerst,
// Vorgänge ohne Prüfung danach (Zeilenreihenfolge).
export function openCases(persons, today = new Date()) {
  return persons
    .filter((p) => isVorgang(p) && p.status === STATUS.OFFEN)
    .map((p) => ({ person: p, ...openCaseState(p, today) }))
    .sort((a, b) => (a.lastExam ? a.lastExam.getTime() : Infinity) - (b.lastExam ? b.lastExam.getTime() : Infinity) || a.person.row - b.person.row);
}

// Status-Zähler über ein Statusfeld ('status' | 'weStatus' | 'oeStatus'); abgeschlossen = bestanden + nicht bestanden
export function statusCounts(persons, field = 'status') {
  const c = { n: persons.length, bestanden: 0, nichtBestanden: 0, offen: 0, nichtErfasst: 0, abgeschlossen: 0 };
  for (const p of persons) {
    const st = p[field];
    if (st === STATUS.BESTANDEN) c.bestanden += 1;
    else if (st === STATUS.NICHT_BESTANDEN) c.nichtBestanden += 1;
    else if (st === STATUS.NICHT_ERFASST) c.nichtErfasst += 1;
    else c.offen += 1;
  }
  c.abgeschlossen = c.bestanden + c.nichtBestanden;
  return c;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// options.eligibleOnly (Standard true): nur Personen mit absolviertem, datiertem WE-Run
// options.period (Standard true): Zeitraum auf Referenzdatum anwenden
export function filterPersons(persons, filter = DEFAULT_FILTER, { eligibleOnly = true, period = true } = {}) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const from = period && f.from ? new Date(f.from).getTime() : null;
  const to = period && f.to ? endOfDay(f.to).getTime() : null;
  return (eligibleOnly ? eligible(persons) : persons.filter(isVorgang)).filter((p) => {
    if (f.onlyIssued && !p.issued) return false;
    if (f.profil.length && !f.profil.includes(p.profil)) return false;
    if (f.sprache.length && !f.sprache.includes(p.sprache)) return false;
    if (f.bank.length && !f.bank.includes(p.employerCanon)) return false;
    if (f.vssVsm === 'vss' && !p.vss) return false;
    if (f.vssVsm === 'vsm' && !p.vsm) return false;
    if (f.vssVsm === 'ohne' && (p.vss || p.vsm)) return false;
    if (f.versuche === 'erstversuch' && hasRetry(p)) return false;
    if (f.versuche === 'mehrere' && !hasRetry(p)) return false;
    if (from !== null || to !== null) {
      if (!p.refDate) return false;
      const t = p.refDate.getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
    }
    return true;
  });
}

// Benchmark (Übersicht): gleiche Filter wie die Auswahl, aber ohne die gewählte Einschränkung
export const BENCHMARKS = [
  { id: 'bank', label: 'Alle Banken', hint: 'gleicher Zeitraum und gleiche übrigen Filter, ohne Bank-Filter' },
  { id: 'profil', label: 'Alle Profile', hint: 'gleicher Zeitraum und gleiche übrigen Filter, ohne Profil-Filter' },
  { id: 'sprache', label: 'Alle Sprachen', hint: 'gleicher Zeitraum und gleiche übrigen Filter, ohne Sprach-Filter' },
  { id: 'gesamt', label: 'Gesamt (nur Zeitraum)', hint: 'alle Vorgänge im Zeitraum, ohne weitere Filter' },
];

export function benchmarkFilter(filter, kind = 'bank') {
  const f = { ...DEFAULT_FILTER, ...filter };
  switch (kind) {
    case 'profil': return { ...f, profil: [] };
    case 'sprache': return { ...f, sprache: [] };
    case 'gesamt': return { ...f, profil: [], sprache: [], bank: [], vssVsm: 'alle', versuche: 'alle', onlyIssued: false };
    default: return { ...f, bank: [] };
  }
}

// ---------------------------------------------------------------------------
// Pro Person (Versuchsmodus)
// ---------------------------------------------------------------------------

// Result-% einer Teilprüfung gemäss Modus; null wenn kein Wert
export function partResult(part, mode) {
  if (mode === MODE.BESTANDEN) {
    const passedRun = part.runs.find((r) => r.passed === true);
    return passedRun && isNum(passedRun.result) ? passedRun.result : null;
  }
  const run1 = part.runs[0];
  return run1 && run1.taken && isNum(run1.result) ? run1.result : null;
}

// Mittel über vorhandene Teilprüfungen. BESTANDEN: nur wenn alle absolvierten Teile einen bestandenen Run haben.
function partsScore(parts, mode) {
  if (mode === MODE.BESTANDEN) {
    const taken = parts.filter((part) => part.runs.some((r) => r.taken));
    if (!taken.length || !taken.every((part) => part.runs.some((r) => r.passed === true))) return null;
  }
  return mean(parts.map((part) => partResult(part, mode))).mean;
}

export function writtenScore(person, mode) {
  return partsScore(person.we, mode);
}

export function oralScore(person, mode) {
  return partsScore(person.oe, mode);
}

// Mehrere Versuche: mindestens eine Teilprüfung (WE oder OE) mit absolviertem RUN2/RUN3
export function hasRetry(person) {
  return person.we.concat(person.oe).some((part) => part.runs.slice(1).some((r) => r.taken));
}

// Erstversuch bestanden: alle vorhandenen WE RUN1 mit passed=true. null = kein WE RUN1 vorhanden.
export function firstAttemptPassed(person) {
  const run1s = person.we.map((part) => part.runs[0]).filter((r) => r && r.taken);
  if (!run1s.length) return null;
  return run1s.every((r) => r.passed === true);
}

// ---------------------------------------------------------------------------
// Schriftlich
// ---------------------------------------------------------------------------

// erstversuch / erstversuchFailed: Nenner = Vorgänge mit mindestens einem absolvierten WE RUN1;
// gesamt / nichtBestanden: Nenner = abgeschlossene Vorgänge schriftlich (weStatus bestanden oder nicht bestanden, E4);
// offen / nichtErfasst: Anzahl Vorgänge ohne bzw. mit unlesbarem schriftlichem Gesamtergebnis
export function writtenPassRates(persons) {
  const withRun1 = persons.filter((p) => firstAttemptPassed(p) !== null);
  const st = statusCounts(persons, 'weStatus');
  return {
    erstversuch: ratio(withRun1.filter((p) => firstAttemptPassed(p) === true).length, withRun1.length),
    erstversuchFailed: ratio(withRun1.filter((p) => firstAttemptPassed(p) === false).length, withRun1.length),
    gesamt: ratio(st.bestanden, st.abgeschlossen),
    nichtBestanden: ratio(st.nichtBestanden, st.abgeschlossen),
    offen: st.offen,
    nichtErfasst: st.nichtErfasst,
  };
}

// Je Teilprüfung (kind 'we' | 'oe'): n = Personen mit absolviertem RUN1 des Teils;
// passed/failed = RUN1 bestanden/nicht bestanden; anyPassed = irgendein Run des Teils bestanden;
// meanFirst/meanPassed = Ø Resultat des ersten bzw. des bestandenen Runs
export function partFirstAttempt(persons, kind = 'we') {
  const count = CONFIG[kind].parts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const withRun1 = persons.filter((p) => p[kind][i] && p[kind][i].runs[0].taken);
    const n = withRun1.length;
    out.push({
      part: i + 1,
      label: kind.toUpperCase() + (i + 1),
      n,
      passed: ratio(withRun1.filter((p) => p[kind][i].runs[0].passed === true).length, n),
      failed: ratio(withRun1.filter((p) => p[kind][i].runs[0].passed === false).length, n),
      anyPassed: ratio(withRun1.filter((p) => p[kind][i].runs.some((r) => r.passed === true)).length, n),
      meanFirst: mean(withRun1.map((p) => partResult(p[kind][i], MODE.ERSTVERSUCH))),
      meanPassed: mean(withRun1.map((p) => partResult(p[kind][i], MODE.BESTANDEN))),
    });
  }
  return out;
}

export function writtenPerformance(persons, mode) {
  return mean(persons.map((p) => writtenScore(p, mode)));
}

export function writtenPerformanceByPart(persons, mode) {
  const partCount = persons.length ? persons[0].we.length : 6;
  const out = [];
  for (let i = 0; i < partCount; i++) {
    const m = mean(persons.map((p) => (p.we[i] ? partResult(p.we[i], mode) : null)));
    out.push({ part: i + 1, mean: m.mean, n: m.n });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mündlich
// ---------------------------------------------------------------------------

function oe1Run(person, n) {
  return person.oe[0] && person.oe[0].runs[n - 1];
}

// bestanden / nichtBestanden: Nenner = abgeschlossene Vorgänge mündlich (oeStatus bestanden oder nicht bestanden, E4);
// failed1 / failed2: Nenner = Vorgänge mit absolviertem, datiertem OE1 RUN1 (angetreten; geplante oder ausstehende
// Termine zählen nicht) – ein Fehlversuch ist unabhängig davon, ob der Vorgang schon abgeschlossen ist.
export function oralPassRates(persons) {
  const base = persons.filter((p) => oe1Run(p, 1) && oe1Run(p, 1).taken && oe1Run(p, 1).date !== null);
  const n = base.length;
  const failed1 = base.filter((p) => oe1Run(p, 1).passed === false);
  const failed2 = failed1.filter((p) => oe1Run(p, 2) && oe1Run(p, 2).passed === false);
  const st = statusCounts(persons, 'oeStatus');
  return {
    bestanden: ratio(st.bestanden, st.abgeschlossen),
    nichtBestanden: ratio(st.nichtBestanden, st.abgeschlossen),
    offen: st.offen,
    nichtErfasst: st.nichtErfasst,
    angetreten: n,
    failed1: ratio(failed1.length, n),
    failed2: ratio(failed2.length, n),
  };
}

export function oralPerformance(persons, mode) {
  return mean(persons.map((p) => oralScore(p, mode)));
}

// ---------------------------------------------------------------------------
// Gruppierung
// ---------------------------------------------------------------------------

const collator = new Intl.Collator('de-CH');

function compareKeys(key, a, b) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (key === 'profil') {
    const ia = PROFILES.indexOf(a);
    const ib = PROFILES.indexOf(b);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
  }
  return collator.compare(String(a), String(b));
}

// key: 'profil' | 'sprache' | 'employerCanon' (oder ein anderes Personenfeld) → [{ key, persons }]
export function groupBy(persons, key) {
  const groups = new Map();
  for (const p of persons) {
    const k = p[key] === undefined || p[key] === '' ? null : p[key];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups.entries()]
    .map(([k, ps]) => ({ key: k, persons: ps }))
    .sort((a, b) => compareKeys(key, a.key, b.key));
}

// Kennzahl je Gruppe: [{ key, n, small, value }]
export function byGroup(persons, key, fn) {
  return groupBy(persons, key).map((g) => ({ key: g.key, n: g.persons.length, small: g.persons.length < SMALL_N, value: fn(g.persons) }));
}

// ---------------------------------------------------------------------------
// Personen (Menschen) aus Vorgängen (E2, E3)
// ---------------------------------------------------------------------------

function firstExamTime(p) {
  return p.firstExamDate ? p.firstExamDate.getTime() : Infinity;
}

// [{ key, lastName, firstName, birthDate, vorgaenge, profiles }] – profiles in zeitlicher Reihenfolge des ersten
// Prüfungsdatums (ohne Datum zuletzt, dann Zeilenreihenfolge), Profil null als null. Duplikate werden ignoriert.
export function groupByPerson(persons) {
  const map = new Map();
  for (const p of persons) {
    if (!isVorgang(p)) continue;
    let g = map.get(p.personKey);
    if (!g) {
      g = { key: p.personKey, lastName: p.lastName, firstName: p.firstName, birthDate: p.birthDate || null, vorgaenge: [], profiles: [] };
      map.set(p.personKey, g);
    }
    g.vorgaenge.push(p);
  }
  for (const g of map.values()) {
    const ordered = g.vorgaenge.slice().sort((a, b) => firstExamTime(a) - firstExamTime(b) || a.row - b.row);
    g.profiles = [...new Set(ordered.map((v) => (v.profil === undefined ? null : v.profil)))];
  }
  return [...map.values()];
}

export function personCount(persons) {
  return groupByPerson(persons).length;
}

// Kennzahl «Personen mit mehreren Profilen»: [{ ...person, sequence: 'IK → CWMA' }], nach Name sortiert
export function multiProfilePersons(persons) {
  return groupByPerson(persons)
    .filter((g) => g.profiles.length > 1)
    .map((g) => ({ ...g, sequence: g.profiles.map((x) => (x === null ? 'unbekannt' : x)).join(' → ') }))
    .sort((a, b) => collator.compare((a.lastName || '') + ' ' + (a.firstName || ''), (b.lastName || '') + ' ' + (b.firstName || '')));
}

// ---------------------------------------------------------------------------
// VSS / VSM
// ---------------------------------------------------------------------------

function passRatesBlock(persons) {
  return {
    n: persons.length,
    small: persons.length < SMALL_N,
    written: writtenPassRates(persons),
    oral: oralPassRates(persons),
    byProfil: byGroup(persons, 'profil', (ps) => ({ written: writtenPassRates(ps), oral: oralPassRates(ps) })),
  };
}

// Bestehensquoten schriftlich + mündlich für VSS / VSM / ohne (Person mit beidem zählt in beiden Gruppen)
export function vssVsmBreakdown(persons) {
  return {
    vss: passRatesBlock(persons.filter((p) => p.vss)),
    vsm: passRatesBlock(persons.filter((p) => p.vsm)),
    ohne: passRatesBlock(persons.filter((p) => !p.vss && !p.vsm)),
  };
}

// ---------------------------------------------------------------------------
// Bestenlisten / bbz-Award
// ---------------------------------------------------------------------------

const EPS = 1e-9;

// Sortierung: Score absteigend; Tie-Break 1: weniger Versuche; Tie-Break 2: früheres Referenzdatum; dann Name.
function compareEntries(a, b) {
  if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
  if (a.attempts !== b.attempts) return a.attempts - b.attempts;
  const ta = a.refDate ? a.refDate.getTime() : Infinity;
  const tb = b.refDate ? b.refDate.getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return collator.compare((a.person.lastName || '') + ' ' + (a.person.firstName || ''), (b.person.lastName || '') + ' ' + (b.person.firstName || ''));
}

// Mindestgruppengrösse und dynamische Länge der Bestenlisten (Befund 4, E5): unter SMALL_N Vorgängen keine Liste,
// sonst höchstens die Hälfte der Gruppe (maximal kMax) – eine «Bestenliste» wird so nie zur vollständigen Rangliste.
export function rankingLimit(n, kMax = 5) {
  if (n < SMALL_N) return 0;
  return Math.max(1, Math.min(kMax, Math.floor(n / 2)));
}

// Begründung eines Rangs gegenüber dem nächsten gewerteten Vorgang (Award-Dossier, b3):
// { by: 'score' | 'attempts' | 'refDate' | 'none' | 'last', vsRank, next: { score, attempts, refDate } | null }
export function rankReason(entry, next, vsRank) {
  if (!next) return { by: 'last', vsRank: null, next: null };
  const info = { vsRank, next: { score: next.score, attempts: next.attempts, refDate: next.refDate } };
  if (Math.abs(entry.score - next.score) > EPS) return { by: 'score', ...info };
  if (entry.attempts !== next.attempts) return { by: 'attempts', ...info };
  const ta = entry.refDate ? entry.refDate.getTime() : Infinity;
  const tb = next.refDate ? next.refDate.getTime() : Infinity;
  if (ta !== tb) return { by: 'refDate', ...info };
  return { by: 'none', ...info };
}

// options.dynamic (Standard true): Mindestgruppengrösse und dynamisches k anwenden; false = feste Länge k
function rankByProfile(persons, entryFn, k, { dynamic = true } = {}) {
  return groupBy(persons, 'profil').map((g) => {
    const sorted = g.persons.map(entryFn).filter((e) => e && isNum(e.score)).sort(compareEntries);
    const limit = dynamic ? rankingLimit(g.persons.length, k) : k;
    const entries = sorted.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e, reason: rankReason(e, sorted[i + 1], i + 2) }));
    return { profil: g.key, n: g.persons.length, k: limit, suppressed: dynamic && limit === 0, candidates: sorted.length, entries };
  });
}

function baseEntry(person, score) {
  return { person, score, attempts: person.attemptsTotal, refDate: person.refDate };
}

export function topWritten(persons, mode, k = 5, options = {}) {
  return rankByProfile(persons, (p) => baseEntry(p, writtenScore(p, mode)), k, options);
}

export function topOral(persons, mode, k = 5, options = {}) {
  return rankByProfile(persons, (p) => baseEntry(p, oralScore(p, mode)), k, options);
}

// Award-Score: 0.5·Schriftlich + 0.5·Mündlich; nur Personen mit bestandener OE, beide Werte nötig
export function awardScore(person, mode) {
  if (person.oeAllPassed !== true) return null;
  const w = writtenScore(person, mode);
  const o = oralScore(person, mode);
  if (!isNum(w) || !isNum(o)) return null;
  return 0.5 * w + 0.5 * o;
}

export function awardRanking(persons, mode, k = 5, options = {}) {
  return rankByProfile(persons, (p) => {
    const score = awardScore(p, mode);
    if (score === null) return null;
    return { ...baseEntry(p, score), written: writtenScore(p, mode), oral: oralScore(p, mode) };
  }, k, options);
}

// ---------------------------------------------------------------------------
// Geplante Prüfungen
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dayKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function personName(p) {
  return (p.lastName || '') + ' ' + (p.firstName || '');
}

// Alle geplanten Runs (run.planned) als flache Liste, sortiert nach Datum, Ort, Name
export function plannedRuns(persons) {
  const out = [];
  for (const p of persons) {
    for (const kind of ['we', 'oe']) {
      for (const part of p[kind]) {
        for (const r of part.runs) {
          if (!r.planned) continue;
          out.push({ person: p, kind, part: part.part, run: r.n, label: kind.toUpperCase() + part.part + ' RUN' + r.n, date: r.date, location: r.location });
        }
      }
    }
  }
  return out.sort((a, b) => a.date - b.date || collator.compare(a.location || '', b.location || '') || collator.compare(personName(a.person), personName(b.person)));
}

// Gruppen je Tag und Ort: [{ dayKey, day, location, count, exams, entries }]
export function plannedGroups(runs) {
  const groups = new Map();
  for (const r of runs) {
    const key = dayKey(r.date) + '|' + (r.location || '');
    let g = groups.get(key);
    if (!g) {
      g = { dayKey: dayKey(r.date), day: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()), location: r.location, count: 0, exams: [], entries: [] };
      groups.set(key, g);
    }
    g.count += 1;
    g.entries.push(r);
    if (!g.exams.includes(r.label)) g.exams.push(r.label);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, exams: g.exams.slice().sort(collator.compare) }))
    .sort((a, b) => a.day - b.day || collator.compare(a.location || '', b.location || ''));
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

export function overview(persons, mode) {
  return {
    n: persons.length,                 // Vorgänge im Filter
    personen: personCount(persons),    // Menschen im Filter (Personenschlüssel)
    small: persons.length < SMALL_N,
    status: statusCounts(persons),
    written: writtenPassRates(persons),
    writtenPerf: writtenPerformance(persons, mode),
    oral: oralPassRates(persons),
    oralPerf: oralPerformance(persons, mode),
    vss: persons.filter((p) => p.vss).length,
    vsm: persons.filter((p) => p.vsm).length,
    issued: persons.filter((p) => p.issued).length,
    byProfil: byGroup(persons, 'profil', (ps) => ({ written: writtenPassRates(ps), oral: oralPassRates(ps) })),
  };
}

// ---------------------------------------------------------------------------
// Zeit (P6): Zeitverlauf je Kennzahl (a1), Schwierigkeit je Teilprüfung (b6)
// ---------------------------------------------------------------------------

// Jahr des Referenzdatums (null ohne Referenzdatum)
export function refYear(p) {
  return p.refDate ? p.refDate.getFullYear() : null;
}

// Jahre mit Vorgängen (aufsteigend)
export function yearsOf(persons) {
  return [...new Set(persons.map(refYear).filter((y) => y !== null))].sort((a, b) => a - b);
}

// Kennzahlen je Jahr (Referenzdatum): [{ year, n, personen, written, oral, writtenPerf1, writtenPerf2, oralPerf1, oralPerf2, status }]
// Vorgänge ohne Referenzdatum fehlen (kein Jahr zuordenbar); der Zeitraumfilter soll hier nicht angewendet sein.
export function timeSeries(persons) {
  return yearsOf(persons).map((year) => {
    const ps = persons.filter((p) => refYear(p) === year);
    return {
      year,
      n: ps.length,
      small: ps.length < SMALL_N,
      personen: personCount(ps),
      written: writtenPassRates(ps),
      oral: oralPassRates(ps),
      writtenPerf1: writtenPerformance(ps, MODE.ERSTVERSUCH),
      writtenPerf2: writtenPerformance(ps, MODE.BESTANDEN),
      oralPerf1: oralPerformance(ps, MODE.ERSTVERSUCH),
      oralPerf2: oralPerformance(ps, MODE.BESTANDEN),
      status: statusCounts(ps),
    };
  });
}

// Zeitverlauf je Gruppe (z. B. Profil): [{ key, series: timeSeries }]
export function timeSeriesBy(persons, key) {
  return groupBy(persons, key).map((g) => ({ key: g.key, series: timeSeries(g.persons) }));
}

// Schwierigkeit je Teilprüfung und Jahr (b6): Jahr = Datum des ersten Versuchs (RUN1) des Teils, nicht das Referenzdatum.
// [{ year, part: 'WE1', kind, n, failed (Quote), passed, meanFirst, meanPassed }]
export function partDifficultyByYear(persons) {
  const cells = new Map();
  for (const p of persons) {
    for (const kind of ['we', 'oe']) {
      for (const part of p[kind]) {
        const run1 = part.runs[0];
        if (!run1 || !run1.taken || !run1.date) continue;
        const year = run1.date.getFullYear();
        const label = kind.toUpperCase() + part.part;
        const key = year + '|' + label;
        let c = cells.get(key);
        if (!c) {
          c = { year, part: label, kind, n: 0, failedCount: 0, passedCount: 0, results1: [], resultsPassed: [] };
          cells.set(key, c);
        }
        c.n += 1;
        if (run1.passed === false) c.failedCount += 1;
        if (run1.passed === true) c.passedCount += 1;
        if (isNum(run1.result)) c.results1.push(run1.result);
        const passedRun = part.runs.find((r) => r.passed === true);
        if (passedRun && isNum(passedRun.result)) c.resultsPassed.push(passedRun.result);
      }
    }
  }
  return [...cells.values()]
    .map((c) => ({ year: c.year, part: c.part, kind: c.kind, n: c.n, small: c.n < SMALL_N, failed: ratio(c.failedCount, c.n), passed: ratio(c.passedCount, c.n), meanFirst: mean(c.results1), meanPassed: mean(c.resultsPassed) }))
    .sort((a, b) => a.year - b.year || (a.kind === b.kind ? 0 : a.kind === 'we' ? -1 : 1) || collator.compare(a.part, b.part, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Modellvergleich alt → neu (Übergangsbericht P1; auf allen Zeilen, auch Duplikaten)
// alt: Zeile = Person, Duplikate zählen mit, «insgesamt bestanden» = WE All yes / alle, «mündlich bestanden» = OE All yes /
//      Vorgänge mit absolviertem, datiertem OE1 RUN1.
// neu: Duplikate zusammengeführt, Nenner = abgeschlossene Vorgänge (E4).
// ---------------------------------------------------------------------------

function oldWritten(ps) {
  return ratio(ps.filter((p) => p.weAllPassed === true).length, ps.length);
}

function oldOral(ps) {
  const base = ps.filter((p) => oe1Run(p, 1) && oe1Run(p, 1).taken && oe1Run(p, 1).date !== null);
  return ratio(base.filter((p) => p.oeAllPassed === true).length, base.length);
}

export function modelComparison(allRows) {
  const oldBase = allRows.filter((p) => p.hasWeDate);
  const newBase = eligible(allRows);
  const row = (key, oldPs, newPs) => ({
    key,
    alt: { n: oldPs.length, written: oldWritten(oldPs), oral: oldOral(oldPs) },
    neu: { n: newPs.length, personen: personCount(newPs), written: writtenPassRates(newPs).gesamt, oral: oralPassRates(newPs).bestanden, status: statusCounts(newPs) },
  });
  const oldGroups = groupBy(oldBase, 'profil');
  const newGroups = new Map(groupBy(newBase, 'profil').map((g) => [g.key, g.persons]));
  return {
    gesamt: row('Gesamt', oldBase, newBase),
    byProfil: oldGroups.map((g) => row(g.key, g.persons, newGroups.get(g.key) || [])),
  };
}
