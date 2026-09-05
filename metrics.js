// metrics.js – reine Funktionen: (Personen[], Filter/Modus) → Kennzahlen.
// Kein DOM, kein Graph, keine Seiteneffekte. Alle Quoten mit n (Nenner); Gruppen n<5 gekennzeichnet.
// Voraussetzung: Personen stammen aus store.js (Personenmodell) und wurden mit filterPersons() gefiltert.
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

// In Kennzahlen fliessen nur Personen mit ≥1 WE-RUN-Datum.
export function eligible(persons) {
  return persons.filter((p) => p.hasWeDate);
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
  return (eligibleOnly ? eligible(persons) : persons).filter((p) => {
    if (f.onlyIssued && p.source !== 'issued') return false;
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
  { id: 'gesamt', label: 'Gesamt (nur Zeitraum)', hint: 'alle Personen im Zeitraum, ohne weitere Filter' },
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

// erstversuch / erstversuchFailed: Nenner = Personen mit mindestens einem absolvierten WE RUN1;
// gesamt: Nenner = alle Personen im Filter
export function writtenPassRates(persons) {
  const withRun1 = persons.filter((p) => firstAttemptPassed(p) !== null);
  return {
    erstversuch: ratio(withRun1.filter((p) => firstAttemptPassed(p) === true).length, withRun1.length),
    erstversuchFailed: ratio(withRun1.filter((p) => firstAttemptPassed(p) === false).length, withRun1.length),
    gesamt: ratio(persons.filter((p) => p.weAllPassed === true).length, persons.length),
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

// Nenner: Personen mit absolviertem, datiertem OE1 RUN1 (geplante oder ausstehende Termine zählen nicht)
export function oralPassRates(persons) {
  const base = persons.filter((p) => oe1Run(p, 1) && oe1Run(p, 1).taken && oe1Run(p, 1).date !== null);
  const n = base.length;
  const failed1 = base.filter((p) => oe1Run(p, 1).passed === false);
  const failed2 = failed1.filter((p) => oe1Run(p, 2) && oe1Run(p, 2).passed === false);
  return {
    bestanden: ratio(base.filter((p) => p.oeAllPassed === true).length, n),
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

function rankByProfile(persons, entryFn, k) {
  return groupBy(persons, 'profil').map((g) => {
    const entries = g.persons
      .map(entryFn)
      .filter((e) => e && isNum(e.score))
      .sort(compareEntries)
      .slice(0, k)
      .map((e, i) => ({ rank: i + 1, ...e }));
    return { profil: g.key, n: g.persons.length, entries };
  });
}

function baseEntry(person, score) {
  return { person, score, attempts: person.attemptsTotal, refDate: person.refDate };
}

export function topWritten(persons, mode, k = 5) {
  return rankByProfile(persons, (p) => baseEntry(p, writtenScore(p, mode)), k);
}

export function topOral(persons, mode, k = 5) {
  return rankByProfile(persons, (p) => baseEntry(p, oralScore(p, mode)), k);
}

// Award-Score: 0.5·Schriftlich + 0.5·Mündlich; nur Personen mit bestandener OE, beide Werte nötig
export function awardScore(person, mode) {
  if (person.oeAllPassed !== true) return null;
  const w = writtenScore(person, mode);
  const o = oralScore(person, mode);
  if (!isNum(w) || !isNum(o)) return null;
  return 0.5 * w + 0.5 * o;
}

export function awardRanking(persons, mode, k = 5) {
  return rankByProfile(persons, (p) => {
    const score = awardScore(p, mode);
    if (score === null) return null;
    return { ...baseEntry(p, score), written: writtenScore(p, mode), oral: oralScore(p, mode) };
  }, k);
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
    n: persons.length,
    small: persons.length < SMALL_N,
    written: writtenPassRates(persons),
    writtenPerf: writtenPerformance(persons, mode),
    oral: oralPassRates(persons),
    oralPerf: oralPerformance(persons, mode),
    vss: persons.filter((p) => p.vss).length,
    vsm: persons.filter((p) => p.vsm).length,
    issued: persons.filter((p) => p.source === 'issued').length,
    byProfil: byGroup(persons, 'profil', (ps) => ({ written: writtenPassRates(ps), oral: oralPassRates(ps) })),
  };
}
