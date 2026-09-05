// store.js – Normalisierung (Rohzeilen → Personenmodell), Data-Quality-Log, State.
//
// Eingabe (vom Datasource-Adapter, datasource/index.js load()):
//   {
//     sheets: [{ source: 'first'|'issued', sheetName, headerRow: any[], rows: [{ row: number, cells: any[] }] }],
//     comments: { [sheetName]: { 'B14': 'VSM …' } },   // Threaded Comments je Zelle
//     meta: { … }
//   }
// headerRow = Zeile 10 des Sheets, rows = Zeilen ab 11 (row = Excel-Zeilennummer, 1-basiert).
//
// Regeln (CLAUDE.md): Spalten nur über Header-Namen; fehlender Pflicht-Header = harter Fehler;
// jede nicht interpretierbare Zelle → Data-Quality-Log; keine Persistenz im Browser (nur Memory).
// Data-Quality-Log (DQ): ein Eintrag { sheet, row, header, field, raw, reason } pro Zelle, die nicht
// interpretierbar ist oder eine Konsistenzregel verletzt. Wird in der View «Datenqualität» angezeigt.

import {
  CONFIG, HEADER_FIELDS, PROFILES, PROFILE_ALIASES, LANGUAGES, PASSED_TRUE, PASSED_FALSE, EMPLOYER_ALIASES,
  VSS_REGEX, VSM_REGEX, requiredFieldKeys, headerCandidates, partKey, runKey,
} from './config.js';
import { DEFAULT_FILTER, filterPersons, eligible, groupBy } from './metrics.js';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function ok(value) {
  return { value, reason: null };
}

function bad(value, reason) {
  return { value, reason };
}

export function isBlank(raw) {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

// Freitext: trim, leer → null
export function asText(raw) {
  return isBlank(raw) ? null : String(raw).trim();
}

function typeName(raw) {
  if (raw instanceof Date) return 'Datum';
  if (typeof raw === 'boolean') return 'Boolean';
  if (typeof raw === 'number') return 'Zahl';
  return typeof raw;
}

// ---------------------------------------------------------------------------
// Normalisierungstabelle (PROMPT.md) – reine Funktionen, Rückgabe { value, reason }
// reason = null, wenn der Wert interpretierbar ist (leer gilt als interpretierbar → null).
// ---------------------------------------------------------------------------

export function parsePassed(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw !== 'string') return bad(null, 'Passed-Wert ist kein Text (' + typeName(raw) + ')');
  const t = raw.trim();
  if (PASSED_TRUE.includes(t)) return ok(true);
  if (PASSED_FALSE.includes(t)) return ok(false);
  return bad(null, 'Passed-Wert nicht in Whitelist (' + PASSED_TRUE.join('/') + ' bzw. ' + PASSED_FALSE.join('/') + ')');
}

export function parseLanguage(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw !== 'string') return bad(null, 'Sprache ist kein Text (' + typeName(raw) + ')');
  const t = raw.trim().toUpperCase();
  if (LANGUAGES.includes(t)) return ok(t);
  return bad(null, 'Sprache unbekannt (erlaubt: ' + LANGUAGES.join(', ') + ')');
}

const PROFILE_LOOKUP = new Map([
  ...PROFILES.map((p) => [p.toUpperCase(), p]),
  ...Object.entries(PROFILE_ALIASES).map(([alias, canon]) => [alias.toUpperCase(), canon]),
]);

export function parseProfile(raw) {
  if (isBlank(raw)) return ok(null);
  const t = String(raw).trim();
  const canon = PROFILE_LOOKUP.get(t.toUpperCase());
  if (canon) return ok(canon);
  return bad(t, 'Profil unbekannt (erlaubt: ' + PROFILES.join(', ') + ' sowie Aliase)');
}

const EMPLOYER_LOOKUP = new Map([
  ...Object.values(EMPLOYER_ALIASES).map((canon) => [canon.toUpperCase(), canon]),
  ...Object.entries(EMPLOYER_ALIASES).map(([alias, canon]) => [alias.toUpperCase(), canon]),
]);

// Employer: kein DQ-Eintrag bei unbekanntem Wert (Rohwert bleibt, Alias-Map ist erweiterbar).
export function parseEmployer(raw) {
  const t = asText(raw);
  if (t === null) return { employer: null, employerCanon: null };
  return { employer: t, employerCanon: EMPLOYER_LOOKUP.get(t.toUpperCase()) || t };
}

const RESULT_TEXT = /^\s*(\d+(?:[.,]\d+)?)\s*%\s*$/;

export function parseResult(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad(null, 'Result ist keine gültige Zahl');
    if (raw >= 0 && raw <= 1) return ok(raw);
    if (raw > 1 && raw <= 100) return ok(raw / 100);
    return bad(null, 'Result ausserhalb 0–100');
  }
  if (typeof raw === 'string') {
    const m = RESULT_TEXT.exec(raw);
    if (!m) return bad(null, 'Result-Text nicht interpretierbar (erwartet z. B. «89.00%»)');
    const pct = parseFloat(m[1].replace(',', '.'));
    if (pct < 0 || pct > 100) return bad(null, 'Result ausserhalb 0–100 %');
    return ok(pct / 100);
  }
  return bad(null, 'Result hat unerwarteten Typ (' + typeName(raw) + ')');
}

export function parseScore(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return ok(raw);
  return bad(null, 'Score ist keine ganze Zahl ≥ 0');
}

const DATE_TEXT = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:\s*\/\s*(\d{1,2})[.:](\d{2}))?\s*$/;

export function parseDate(raw) {
  if (isBlank(raw)) return ok(null);
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? bad(null, 'Datum ungültig (Invalid Date)') : ok(raw);
  }
  if (typeof raw === 'number') return bad(null, 'Datum liegt als Zahl vor (Zelle ohne Datumsformat)');
  if (typeof raw !== 'string') return bad(null, 'Datum hat unerwarteten Typ (' + typeName(raw) + ')');
  const m = DATE_TEXT.exec(raw);
  if (!m) return bad(null, 'Datum nicht interpretierbar (erwartet dd.mm.yy(yy)[ / hh.mm])');
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const daysInMonth = new Date(year, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return bad(null, 'Datum ungültig (Tag/Monat)');
  if (hour > 23 || minute > 59) return bad(null, 'Uhrzeit ungültig');
  return ok(new Date(year, month - 1, day, hour, minute));
}

// VSS/VSM aus Threaded-Comment-Text (beides möglich)
export function parseVssVsm(text) {
  const t = typeof text === 'string' ? text : '';
  return { vss: VSS_REGEX.test(t), vsm: VSM_REGEX.test(t) };
}

// ---------------------------------------------------------------------------
// Header-Auflösung – ausschliesslich über Header-Namen der Zeile 10
// ---------------------------------------------------------------------------

export class HeaderError extends Error {
  constructor(message, sheet) {
    super(message);
    this.name = 'HeaderError';
    this.sheet = sheet;
  }
}

export class MissingHeaderError extends HeaderError {
  constructor(sheet, missing) {
    const list = missing.map((m) => '«' + m.candidates.join('» | «') + '»').join(', ');
    super('Sheet «' + sheet + '»: Pflicht-Header fehlen: ' + list, sheet);
    this.name = 'MissingHeaderError';
    this.missing = missing;
  }
}

export class DuplicateHeaderError extends HeaderError {
  constructor(sheet, duplicates) {
    const list = duplicates.map((d) => '«' + d.headers.join('», «') + '»').join('; ');
    super('Sheet «' + sheet + '»: Header mehrdeutig (mehrfach vorhanden): ' + list, sheet);
    this.name = 'DuplicateHeaderError';
    this.duplicates = duplicates;
  }
}

function normalizeHeaderName(h) {
  return String(h ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Liefert { feldSchlüssel: spaltenIndex }. Optionale Felder ohne Header fehlen im Resultat.
export function resolveHeaders(headerRow, source, sheetName) {
  const positions = new Map(); // normalisierter Header-Name → [Spaltenindizes]
  headerRow.forEach((h, idx) => {
    const name = normalizeHeaderName(h);
    if (!name) return;
    if (!positions.has(name)) positions.set(name, []);
    positions.get(name).push(idx);
  });

  const required = new Set(requiredFieldKeys(source));
  const map = {};
  const missing = [];
  const duplicates = [];

  for (const field of HEADER_FIELDS) {
    const hits = [];
    for (const candidate of field.candidates) {
      for (const idx of positions.get(normalizeHeaderName(candidate)) || []) hits.push({ idx, candidate });
    }
    if (hits.length > 1) {
      duplicates.push({ key: field.key, headers: hits.map((h) => String(headerRow[h.idx]).trim()) });
    } else if (hits.length === 1) {
      map[field.key] = hits[0].idx;
    } else if (required.has(field.key)) {
      missing.push({ key: field.key, candidates: field.candidates.slice() });
    }
  }

  if (duplicates.length) throw new DuplicateHeaderError(sheetName, duplicates);
  if (missing.length) throw new MissingHeaderError(sheetName, missing);
  return map;
}

// ---------------------------------------------------------------------------
// Zeilen → Personenmodell
// ---------------------------------------------------------------------------

const SOURCES = Object.keys(CONFIG.sheets); // ['first', 'issued']

function latest(dates) {
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

export function normalizeSheet(sheet, comments = {}) {
  const { source, sheetName, headerRow, rows } = sheet;
  if (!SOURCES.includes(source)) {
    throw new Error('Unbekanntes Sheet «' + sheetName + '» – erlaubt sind nur ' + Object.values(CONFIG.sheets).join(', '));
  }
  const map = resolveHeaders(headerRow, source, sheetName);
  const headerNameOf = (key) => (map[key] === undefined ? headerCandidates(key)[0] : String(headerRow[map[key]]).trim());
  const persons = [];
  const dq = [];

  for (const { row, cells } of rows) {
    if (!cells || cells.every(isBlank)) continue; // komplett leere Zeile: keine Daten, kein DQ

    const get = (key) => (map[key] === undefined ? undefined : cells[map[key]]);
    const logDq = (key, raw, reason) => dq.push({ sheet: sheetName, row, header: headerNameOf(key), field: key, raw, reason });
    const field = (key, parser) => {
      const raw = get(key);
      const r = parser(raw);
      if (r.reason) logDq(key, raw, r.reason);
      return r.value;
    };

    const lastName = asText(get('lastName'));
    const firstName = asText(get('firstName'));
    if (lastName === null && firstName === null) {
      const filled = [];
      cells.forEach((cell, idx) => {
        if (!isBlank(cell)) filled.push(String(headerRow[idx] === undefined || headerRow[idx] === null ? '' : headerRow[idx]).trim() || ('Spalte ' + (idx + 1)));
      });
      const shown = filled.slice(0, 6).join(', ') + (filled.length > 6 ? ' …' : '');
      logDq('lastName', get('lastName'), 'Name fehlt (Daten in: ' + shown + ')');
    }

    const { employer, employerCanon } = parseEmployer(get('employer'));

    const buildParts = (kind, cfg) => {
      const parts = [];
      for (let p = 1; p <= cfg.parts; p++) {
        const runs = [];
        for (let r = 1; r <= cfg.runs; r++) {
          const run = {
            n: r,
            passed: field(runKey(kind, p, r, 'passed'), parsePassed),
            date: field(runKey(kind, p, r, 'date'), parseDate),
            score: field(runKey(kind, p, r, 'score'), parseScore),
            result: field(runKey(kind, p, r, 'result'), parseResult),
          };
          run.taken = run.date !== null || run.passed !== null || run.score !== null || run.result !== null;
          runs.push(run);
        }
        parts.push({ part: p, passed: field(partKey(kind, p), parsePassed), runs });
      }
      return parts;
    };

    const person = {
      source,
      sheetName,
      row,
      lastName,
      firstName,
      role: asText(get('role')),
      employer,
      employerCanon,
      profil: field('profil', parseProfile),
      sprache: field('sprache', parseLanguage),
      ...parseVssVsm(comments[CONFIG.commentColumn + row]),
      certStart: map.certStart === undefined ? null : field('certStart', parseDate),
      certNumber: map.certNumber === undefined ? null : asText(get('certNumber')),
      we: buildParts('we', CONFIG.we),
      oe: buildParts('oe', CONFIG.oe),
      weAllPassed: field('weAllPassed', parsePassed),
      oeAllPassed: field('oeAllPassed', parsePassed),
      refDate: null,
      refDateSource: null,
      attemptsTotal: 0,
      hasWeDate: false,
    };

    // Abgeleitete Felder
    const weRuns = person.we.flatMap((part) => part.runs);
    const oeRuns = person.oe.flatMap((part) => part.runs);
    const allRuns = weRuns.concat(oeRuns);
    person.attemptsTotal = allRuns.filter((r) => r.taken).length;
    person.hasWeDate = weRuns.some((r) => r.date !== null);

    // Konsistenzregel (Auftraggeber): Voraussetzung für mündlich ist die bestandene schriftliche Prüfung.
    // Nur melden, wenn der Wert leer oder «nein» ist – nicht interpretierbare Werte sind bereits geloggt.
    const weAllRaw = get('weAllPassed');
    if (oeRuns.some((r) => r.taken) && (person.weAllPassed === false || isBlank(weAllRaw))) {
      logDq('weAllPassed', weAllRaw, 'Mündliche Prüfung erfasst, aber schriftliche Prüfung nicht als bestanden markiert (Voraussetzung für mündlich)');
    }

    // Referenzdatum: Datum des bestandenen OE-Runs (letzter mit passed=true);
    // ohne bestandene OE: letztes vorhandenes Prüfungsdatum.
    const passedOe = latest(oeRuns.filter((r) => r.passed === true && r.date).map((r) => r.date));
    if (passedOe) {
      person.refDate = passedOe;
      person.refDateSource = 'oe';
    } else {
      const lastExam = latest(allRuns.filter((r) => r.date).map((r) => r.date));
      if (lastExam) {
        person.refDate = lastExam;
        person.refDateSource = 'lastExam';
      }
    }

    persons.push(person);
  }

  return { persons, dq };
}

// Beide Sheets → eine Personenliste + gesammeltes Data-Quality-Log
export function normalizeWorkbook({ sheets = [], comments = {}, meta = {} } = {}) {
  const persons = [];
  const dq = [];
  const counts = { first: 0, issued: 0, persons: 0, dq: 0 };
  for (const sheet of sheets) {
    if (!SOURCES.includes(sheet.source)) {
      throw new Error('Unbekanntes Sheet «' + sheet.sheetName + '» – erlaubt sind nur ' + Object.values(CONFIG.sheets).join(', '));
    }
    const result = normalizeSheet(sheet, (comments && comments[sheet.sheetName]) || {});
    persons.push(...result.persons);
    dq.push(...result.dq);
    counts[sheet.source] += result.persons.length;
  }
  counts.persons = persons.length;
  counts.dq = dq.length;
  return { persons, dq, meta: { ...meta, counts } };
}

// ---------------------------------------------------------------------------
// State (nur im Memory – keine Persistenz von Personendaten oder Aggregaten im Browser)
// ---------------------------------------------------------------------------

export function createStore() {
  const state = {
    persons: [],
    dq: [],
    meta: null,
    filter: { ...DEFAULT_FILTER },
  };
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) fn(state);
  }

  return {
    getState() {
      return state;
    },

    // loadResult = Ergebnis von datasource.load(): { sheets, comments, meta }
    setData(loadResult) {
      const { persons, dq, meta } = normalizeWorkbook(loadResult);
      state.persons = persons;
      state.dq = dq;
      state.meta = meta;
      notify();
    },

    setFilter(partial) {
      state.filter = { ...state.filter, ...partial };
      notify();
    },

    // Daten aus dem Memory entfernen (z. B. beim Abmelden); Filter bleibt
    clear() {
      state.persons = [];
      state.dq = [];
      state.meta = null;
      notify();
    },

    resetFilter() {
      state.filter = { ...DEFAULT_FILTER };
      notify();
    },

    getFilteredPersons() {
      return filterPersons(state.persons, state.filter);
    },

    // Auswahlwerte für die Filterleiste aus den vorhandenen (kennzahlrelevanten) Personen
    getFilterOptions() {
      const base = eligible(state.persons);
      const keys = (field) => groupBy(base, field).map((g) => g.key).filter((k) => k !== null);
      return { profil: keys('profil'), sprache: keys('sprache'), bank: keys('employerCanon') };
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
