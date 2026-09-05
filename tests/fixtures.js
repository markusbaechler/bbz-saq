// Synthetische Testdaten – ausschliesslich erfundene Namen und Banken. Keine Personendaten.
import { CONFIG, HEADER_FIELDS, headerCandidates, partKey, runKey } from '../config.js';

// Header-Name für ein Feld je Sheet-Variante:
// 'first'  → erste Variante («… Passed»), 'issued' → zweite Variante («… yes»), falls vorhanden.
export function headerFor(source, key) {
  const c = headerCandidates(key);
  if (!c) throw new Error('unbekanntes Feld: ' + key);
  return source === 'issued' && c.length > 1 ? c[1] : c[0];
}

// Header-Zeile (Zeile 10) eines Sheets in plausibler Spaltenreihenfolge.
// Sheet 1: zusätzlich «WE6 RUN1 Location»; Sheet 2: zusätzlich Certificate Number/Start/End.
export function headerRowFor(source) {
  const h = (key) => headerFor(source, key);
  const row = ['Nr', h('lastName'), h('firstName'), h('role'), h('employer'), h('profil'), h('sprache'), h('commLanguage'), h('birthDate')];
  if (source === 'issued') row.push(h('certNumber'), h('certStart'), h('certEnd'));
  for (const [kind, cfg] of [['we', CONFIG.we], ['oe', CONFIG.oe]]) {
    row.push(h(kind + 'AllPassed'));
    for (let p = 1; p <= cfg.parts; p++) {
      row.push(h(partKey(kind, p)));
      for (let r = 1; r <= cfg.runs; r++) {
        row.push(h(runKey(kind, p, r, 'passed')), h(runKey(kind, p, r, 'date')),
          h(runKey(kind, p, r, 'score')), h(runKey(kind, p, r, 'result')));
        // Ort je Run; «WE6 RUN1 Location» fehlt in Sheet 2 (Spezifikation)
        if (!(kind === 'we' && p === 6 && r === 1 && source === 'issued')) row.push(h(runKey(kind, p, r, 'location')));
      }
    }
  }
  row.push('Bemerkung');
  return row;
}

// Zellen-Array aus { feldSchlüssel: wert } oder { 'Header-Name': wert } (beides erlaubt).
export function cellsFor(source, headerRow, values) {
  const cells = new Array(headerRow.length).fill(null);
  for (const [k, v] of Object.entries(values)) {
    const header = headerCandidates(k) ? headerFor(source, k) : k;
    const idx = headerRow.indexOf(header);
    if (idx < 0) throw new Error('Header nicht in Fixture-Zeile: ' + header);
    cells[idx] = v;
  }
  return cells;
}

// Sheet-Objekt, wie es der Datasource-Adapter liefert (rows ab Zeile 11).
// extraFields: optionale Felder, deren Header zusätzlich in Zeile 10 stehen soll (z. B. 'birthDate' → «Date of Birth»).
export function makeSheet(source, rowValues, { startRow = CONFIG.dataStartRow, extraFields = [] } = {}) {
  const headerRow = headerRowFor(source).concat(extraFields.map((key) => headerFor(source, key)));
  const rows = rowValues.map((values, i) => ({ row: startRow + i, cells: cellsFor(source, headerRow, values) }));
  return { source, sheetName: CONFIG.sheets[source], headerRow, rows };
}

// Kompakte Run-Angaben → Feldwerte. we: { 1: [{ passed, date, score, result }, …], … }
export function runValues(kind, parts) {
  const out = {};
  for (const [p, runs] of Object.entries(parts)) {
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (!r) continue;
      for (const what of ['passed', 'date', 'score', 'result', 'location']) {
        if (r[what] !== undefined) out[runKey(kind, Number(p), i + 1, what)] = r[what];
      }
    }
  }
  return out;
}

export const ALL_FIELD_KEYS = HEADER_FIELDS.map((f) => f.key);

// ---------------------------------------------------------------------------
// Personenmodell direkt (für metrics-Tests). Vollständig, alle Teile/Runs vorhanden.
// ---------------------------------------------------------------------------

function emptyRun(n) {
  return { n, passed: null, date: null, score: null, result: null, location: null, taken: false, planned: false };
}

function emptyPart(part, runs) {
  return { part, passed: null, runs: Array.from({ length: runs }, (_, i) => emptyRun(i + 1)) };
}

let personSeq = 0;

// runs: [{ passed, date: 'YYYY-MM-DD', result }, …] pro Teil; Angaben werden ins Modell übernommen.
export function makePerson(overrides = {}) {
  personSeq += 1;
  const p = {
    source: 'first',
    sheetName: CONFIG.sheets.first,
    row: 10 + personSeq,
    lastName: 'Muster' + personSeq,
    firstName: 'Test',
    role: 'Kundenberater/in',
    employer: 'Testbank AG',
    employerCanon: 'Testbank AG',
    profil: 'PK',
    sprache: 'DE',
    spracheDerived: false,
    birthDate: null,
    personKey: null,
    personKeyLevel: 'name-only',
    vss: false,
    vsm: false,
    certStart: null,
    certNumber: null,
    issued: undefined,
    we: Array.from({ length: CONFIG.we.parts }, (_, i) => emptyPart(i + 1, CONFIG.we.runs)),
    oe: Array.from({ length: CONFIG.oe.parts }, (_, i) => emptyPart(i + 1, CONFIG.oe.runs)),
    weAllPassed: null,
    weAllDerived: false,
    oeAllPassed: null,
    oeAllDerived: false,
    weStatus: undefined,
    oeStatus: undefined,
    status: undefined,
    passiv: false,
    weAllHeader: 'WE All Passed',
    oeAllHeader: 'OE All Passed',
    refDate: null,
    refDateSource: null,
    firstExamDate: null,
    attemptsTotal: 0,
    hasWeDate: false,
    duplicateOf: null,
    duplicates: [],
  };
  const { we, oe, ...rest } = overrides;
  Object.assign(p, rest);
  applyRuns(p.we, we);
  applyRuns(p.oe, oe);
  // abgeleitete Felder wie in store.js (bewusst nachgebaut, damit Tests unabhängig bleiben)
  if (p.issued === undefined) p.issued = p.source === 'issued';
  if (p.personKey === null) p.personKey = keyPart(p.lastName) + '|' + keyPart(p.firstName) + '|' + (p.birthDate ? isoDay(p.birthDate) : '');
  if (p.birthDate) p.personKeyLevel = 'full';
  // Status (E4): yes → bestanden, no → nicht bestanden, leer → offen; «nicht erfasst» nur über Override weStatus/oeStatus
  if (p.weStatus === undefined) p.weStatus = statusFromFlag(p.weAllPassed);
  if (p.oeStatus === undefined) p.oeStatus = statusFromFlag(p.oeAllPassed);
  if (p.status === undefined) p.status = combine(p.weStatus, p.oeStatus);
  const allRuns = [...p.we, ...p.oe].flatMap((part) => part.runs);
  p.attemptsTotal = allRuns.filter((r) => r.taken).length;
  p.hasWeDate = p.we.some((part) => part.runs.some((r) => r.taken && r.date));
  const datedTaken = allRuns.filter((r) => r.taken && r.date);
  p.firstExamDate = datedTaken.length ? new Date(Math.min(...datedTaken.map((r) => r.date.getTime()))) : null;
  if (overrides.refDate === undefined) {
    const passedOe = p.oe.flatMap((part) => part.runs).filter((r) => r.taken && r.passed === true && r.date);
    if (passedOe.length) {
      p.refDate = new Date(Math.max(...passedOe.map((r) => r.date.getTime())));
      p.refDateSource = 'oe';
    } else {
      const dated = allRuns.filter((r) => r.taken && r.date);
      if (dated.length) {
        p.refDate = new Date(Math.max(...dated.map((r) => r.date.getTime())));
        p.refDateSource = 'lastExam';
      }
    }
  }
  return p;
}

function applyRuns(parts, spec) {
  if (!spec) return;
  for (const [partNo, entry] of Object.entries(spec)) {
    const part = parts[Number(partNo) - 1];
    // entry: Array von Runs  ODER  { passed, runs: [...] }
    const list = Array.isArray(entry) ? entry : (entry.runs || []);
    list.forEach((r, i) => {
      if (!r) return;
      const run = part.runs[i];
      if (r.passed !== undefined) run.passed = r.passed;
      if (r.date !== undefined) run.date = typeof r.date === 'string' ? d(r.date) : r.date;
      if (r.score !== undefined) run.score = r.score;
      if (r.result !== undefined) run.result = r.result;
      if (r.location !== undefined) run.location = r.location;
      run.taken = run.passed !== null;
      run.planned = r.planned === undefined ? false : !!r.planned;
    });
    if (!Array.isArray(entry) && entry.passed !== undefined) {
      part.passed = entry.passed;
    } else if (list.some((r) => r && r.passed === true)) {
      part.passed = true;
    } else if (list.some((r) => r && r.passed === false)) {
      part.passed = false;
    }
  }
}

// Lokales Datum aus 'YYYY-MM-DD' (keine Zeitzonen-Überraschungen).
export function d(iso) {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function isoDay(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function keyPart(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function statusFromFlag(flag) {
  if (flag === true) return 'bestanden';
  if (flag === false) return 'nicht bestanden';
  return 'offen';
}

function combine(we, oe) {
  if (we === 'nicht bestanden' || oe === 'nicht bestanden') return 'nicht bestanden';
  if (we === 'bestanden' && oe === 'bestanden') return 'bestanden';
  if (we === 'nicht erfasst' || oe === 'nicht erfasst') return 'nicht erfasst';
  return 'offen';
}
