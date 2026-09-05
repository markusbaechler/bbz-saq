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
//
// Data-Quality-Log (DQ): ein Eintrag { level, sheet, row, header, field, raw, reason } pro Zelle.
//   level 'fehler'  = Zelle nicht interpretierbar (Wert wird null)
//   level 'hinweis' = Wert wurde interpretiert oder abgeleitet, weicht aber von der Erwartung ab,
//                     bzw. Konsistenzregel verletzt (z. B. mündlich erfasst ohne bestandene schriftliche Prüfung)
//
// Fachliche Festlegungen (mit dem Auftraggeber abgestimmt bzw. aus der Datei abgeleitet):
// - Ein Run gilt als absolviert, wenn ein Passed-Wert vorhanden ist. Nur ein Datum (geplanter Termin) oder
//   nur Score/Result (Formelvorgaben 0) machen keinen Versuch.
// - Ohne Namen (Last Name und First Name leer) keine Person; Zeilen ohne Inhalt in gemappten Spalten sind leer.
// - Sheet «Ausgestellte Zertifikate»: leeres «WE All yes» gilt als bestanden (Zertifikat setzt schriftlich
//   und mündlich voraus) – mit Hinweis im DQ-Log.

import {
  CONFIG, HEADER_FIELDS, PROFILES, PROFILE_ALIASES, LANGUAGES, LANGUAGE_ALIASES, PROFILE_LANGUAGE_HINTS,
  PASSED_TRUE, PASSED_FALSE, EMPLOYER_ALIASES, VSS_REGEX, VSM_REGEX, DATE_RULES, requiredFieldKeys, headerCandidates, partKey, runKey,
} from './config.js';
import { DEFAULT_FILTER, filterPersons, eligible, groupBy } from './metrics.js';

export const LEVEL = Object.freeze({ FEHLER: 'fehler', HINWEIS: 'hinweis' });

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function ok(value) {
  return { value, reason: null };
}

function bad(value, reason) {
  return { value, reason, level: LEVEL.FEHLER };
}

function note(value, reason) {
  return { value, reason, level: LEVEL.HINWEIS };
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
// Normalisierungstabelle (PROMPT.md) – reine Funktionen, Rückgabe { value, reason[, level] }
// reason = null, wenn der Wert interpretierbar ist (leer gilt als interpretierbar → null).
// ---------------------------------------------------------------------------

const PASSED_TRUE_LC = PASSED_TRUE.map((s) => s.toLowerCase());
const PASSED_FALSE_LC = PASSED_FALSE.map((s) => s.toLowerCase());

export function parsePassed(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw !== 'string') return bad(null, 'Passed-Wert ist kein Text (' + typeName(raw) + ')');
  const t = raw.trim().toLowerCase();
  if (PASSED_TRUE_LC.includes(t)) return ok(true);
  if (PASSED_FALSE_LC.includes(t)) return ok(false);
  return bad(null, 'Passed-Wert nicht in Whitelist (' + PASSED_TRUE.join('/') + ' bzw. ' + PASSED_FALSE.join('/') + ', Gross-/Kleinschreibung egal)');
}

export function parseLanguage(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw !== 'string') return bad(null, 'Sprache ist kein Text (' + typeName(raw) + ')');
  const t = raw.trim().toUpperCase();
  if (LANGUAGES.includes(t)) return ok(t);
  if (LANGUAGE_ALIASES[t]) return ok(LANGUAGE_ALIASES[t]);
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

// Zahl als Text, optional mit (auch mehrfachem) Prozentzeichen: «89.00%», «71.59», «66%%», «89,5%»
const RESULT_TEXT = /^\s*(\d+(?:[.,]\d+)?)\s*(%*)\s*$/;

function resultFromNumber(n) {
  if (n >= 0 && n <= 1) return ok(n);
  if (n > 1 && n <= 100) return ok(n / 100);
  return bad(null, 'Result ausserhalb 0–100');
}

export function parseResult(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad(null, 'Result ist keine gültige Zahl');
    return resultFromNumber(raw);
  }
  if (typeof raw === 'string') {
    const m = RESULT_TEXT.exec(raw);
    if (!m) return bad(null, 'Result-Text nicht interpretierbar (erwartet z. B. «89.00%» oder eine Zahl)');
    const n = parseFloat(m[1].replace(',', '.'));
    if (m[2]) {
      if (n < 0 || n > 100) return bad(null, 'Result ausserhalb 0–100 %');
      return ok(n / 100);
    }
    return resultFromNumber(n);
  }
  return bad(null, 'Result hat unerwarteten Typ (' + typeName(raw) + ')');
}

export function parseScore(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return ok(raw);
  return bad(null, 'Score ist keine ganze Zahl ≥ 0');
}

// dd.mm.yy(yy) [ / hh.mm | hh:mm ] [h | Uhr]; Trenner Punkt oder Komma
const DATE_TEXT = /^\s*(\d{1,2})[.,](\d{1,2})[.,](\d{2}|\d{4})(?:\s*\/\s*(\d{1,2})[.:](\d{2})\s*(?:h|uhr)?)?\s*$/i;
const DATE_NO_YEAR = /^\s*\d{1,2}\.\d{1,2}\.\s*(?:\/.*)?$/;
const DATE_3DIGIT_YEAR = /^\s*\d{1,2}[.,]\d{1,2}[.,]\d{3}\s*(?:\/.*)?$/;

function yearPlausible(year) {
  return year >= DATE_RULES.minYear && year <= DATE_RULES.maxYear;
}

// Excel-Serienzahl (Tage seit 1899-12-30) → lokales Datum
function serialToDate(serial) {
  const utc = new Date(Math.round((serial - 25569) * 86400000));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes());
}

export function parseDate(raw) {
  if (isBlank(raw)) return ok(null);
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return bad(null, 'Datum ungültig (Invalid Date)');
    if (!yearPlausible(raw.getFullYear())) return bad(null, 'Jahr unplausibel (' + raw.getFullYear() + '), erwartet ' + DATE_RULES.minYear + '–' + DATE_RULES.maxYear);
    return ok(raw);
  }
  if (typeof raw === 'number') {
    if (Number.isFinite(raw) && raw >= DATE_RULES.serialMin && raw <= DATE_RULES.serialMax) {
      return note(serialToDate(raw), 'Datum als Zahl ohne Datumsformat (' + raw + '), als Excel-Serienzahl interpretiert');
    }
    return bad(null, 'Datum liegt als Zahl vor (' + raw + '), keine plausible Excel-Serienzahl');
  }
  if (typeof raw !== 'string') return bad(null, 'Datum hat unerwarteten Typ (' + typeName(raw) + ')');
  const m = DATE_TEXT.exec(raw);
  if (!m) {
    if (DATE_NO_YEAR.test(raw)) return bad(null, 'Datum ohne Jahr (z. B. «27.04. / 09:00») – Jahr in der Datei ergänzen');
    if (DATE_3DIGIT_YEAR.test(raw)) return bad(null, 'Datum mit dreistelligem Jahr (Tippfehler)');
    return bad(null, 'Datum nicht interpretierbar (erwartet dd.mm.yy(yy)[ / hh.mm])');
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const daysInMonth = new Date(year, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return bad(null, 'Datum ungültig (Tag/Monat)');
  if (hour > 23 || minute > 59) return bad(null, 'Uhrzeit ungültig');
  if (!yearPlausible(year)) return bad(null, 'Jahr unplausibel (' + year + '), erwartet ' + DATE_RULES.minYear + '–' + DATE_RULES.maxYear);
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
  return String(h === null || h === undefined ? '' : h).trim().replace(/\s+/g, ' ').toLowerCase();
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

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// options.today: Stichtag für «geplant» (Datum in der Zukunft); Standard: jetzt
export function normalizeSheet(sheet, comments = {}, options = {}) {
  const { source, sheetName, headerRow, rows } = sheet;
  if (!SOURCES.includes(source)) {
    throw new Error('Unbekanntes Sheet «' + sheetName + '» – erlaubt sind nur ' + Object.values(CONFIG.sheets).join(', '));
  }
  const horizon = endOfDay(options.today || new Date());
  const map = resolveHeaders(headerRow, source, sheetName);
  const mappedIndices = Object.values(map);
  const headerNameOf = (key) => (map[key] === undefined ? headerCandidates(key)[0] : String(headerRow[map[key]]).trim());
  const persons = [];
  const dq = [];

  for (const { row, cells } of rows) {
    if (!cells) continue;
    // Leer = kein Inhalt in einer gemappten Spalte (Hilfsspalten wie Nummerierungen zählen nicht)
    if (!mappedIndices.some((i) => !isBlank(cells[i]))) continue;

    const get = (key) => (map[key] === undefined ? undefined : cells[map[key]]);
    const logDq = (key, raw, reason, level) => dq.push({ level, sheet: sheetName, row, header: headerNameOf(key), field: key, raw, reason });
    const hint = (key, raw, reason) => logDq(key, raw, reason, LEVEL.HINWEIS);
    const field = (key, parser) => {
      const raw = get(key);
      const r = parser(raw);
      if (r.reason) logDq(key, raw, r.reason, r.level || LEVEL.FEHLER);
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
      logDq('lastName', get('lastName'), 'Name fehlt (Daten in: ' + shown + ') – Zeile wird nicht als Person gezählt', LEVEL.FEHLER);
      continue;
    }

    const { employer, employerCanon } = parseEmployer(get('employer'));

    const buildParts = (kind, cfg) => {
      const parts = [];
      for (let p = 1; p <= cfg.parts; p++) {
        const runs = [];
        for (let r = 1; r <= cfg.runs; r++) {
          const passedKey = runKey(kind, p, r, 'passed');
          const dateKey = runKey(kind, p, r, 'date');
          const locationKey = runKey(kind, p, r, 'location');
          const run = {
            n: r,
            passed: field(passedKey, parsePassed),
            date: field(dateKey, parseDate),
            score: field(runKey(kind, p, r, 'score'), parseScore),
            result: field(runKey(kind, p, r, 'result'), parseResult),
            location: map[locationKey] === undefined ? null : asText(get(locationKey)),
          };
          // Absolviert = Passed-Wert vorhanden. Datum allein ist ein Termin (geplant oder ausstehend).
          run.taken = run.passed !== null;
          run.planned = !run.taken && run.date !== null && run.date > horizon;
          const rawPassed = get(passedKey);
          const rawDate = get(dateKey);
          if (!run.taken && isBlank(rawPassed) && run.date !== null && run.date <= horizon) {
            hint(passedKey, rawPassed, 'Prüfungsdatum vergangen, aber kein Passed-Wert (Ergebnis ausstehend oder nicht erfasst) – Run zählt nicht als Versuch');
          }
          if (run.taken && run.date === null && isBlank(rawDate)) {
            hint(dateKey, rawDate, 'Passed-Wert erfasst, aber kein Prüfungsdatum');
          }
          if (run.taken && run.date !== null && run.date > horizon) {
            hint(dateKey, rawDate, 'Passed-Wert erfasst, aber Prüfungsdatum liegt in der Zukunft');
          }
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
      spracheDerived: false,
      ...parseVssVsm(comments[CONFIG.commentColumn + row]),
      certStart: map.certStart === undefined ? null : field('certStart', parseDate),
      certNumber: map.certNumber === undefined ? null : asText(get('certNumber')),
      we: buildParts('we', CONFIG.we),
      oe: buildParts('oe', CONFIG.oe),
      weAllPassed: field('weAllPassed', parsePassed),
      weAllDerived: false,
      oeAllPassed: field('oeAllPassed', parsePassed),
      refDate: null,
      refDateSource: null,
      attemptsTotal: 0,
      hasWeDate: false,
    };

    // Sprache ableiten, wenn «Certificate Language» leer: 1. Programmbezeichnung (z. B. «PK FRZ»),
    // 2. «Communication Language» (Auftraggeber: sinngemäss übernehmen)
    if (person.sprache === null && isBlank(get('sprache'))) {
      const profilRaw = asText(get('profil'));
      const hinted = profilRaw ? PROFILE_LANGUAGE_HINTS[profilRaw.toUpperCase()] || PROFILE_LANGUAGE_HINTS[profilRaw] : undefined;
      if (hinted) {
        person.sprache = hinted;
        person.spracheDerived = true;
        hint('sprache', get('sprache'), 'Certificate Language leer – Sprache aus Programmbezeichnung «' + profilRaw + '» übernommen (' + hinted + ')');
      } else if (map.commLanguage !== undefined && !isBlank(get('commLanguage'))) {
        const comm = parseLanguage(get('commLanguage'));
        if (comm.value) {
          person.sprache = comm.value;
          person.spracheDerived = true;
          hint('sprache', get('sprache'), 'Certificate Language leer – Sprache aus «Communication Language» übernommen (' + comm.value + ')');
        } else {
          hint('commLanguage', get('commLanguage'), 'Certificate Language leer und Communication Language nicht deutbar');
        }
      }
    }

    // Abgeleitete Felder
    const weRuns = person.we.flatMap((part) => part.runs);
    const oeRuns = person.oe.flatMap((part) => part.runs);
    const takenRuns = weRuns.concat(oeRuns).filter((r) => r.taken);
    person.attemptsTotal = takenRuns.length;
    person.hasWeDate = weRuns.some((r) => r.taken && r.date !== null);

    // Referenzdatum: Datum des bestandenen OE-Runs (letzter mit passed=true);
    // ohne bestandene OE: letztes Datum eines absolvierten Runs.
    const passedOe = latest(oeRuns.filter((r) => r.taken && r.passed === true && r.date).map((r) => r.date));
    if (passedOe) {
      person.refDate = passedOe;
      person.refDateSource = 'oe';
    } else {
      const lastExam = latest(takenRuns.filter((r) => r.date).map((r) => r.date));
      if (lastExam) {
        person.refDate = lastExam;
        person.refDateSource = 'lastExam';
      }
    }

    // Konsistenzregel: Voraussetzung für mündlich ist die bestandene schriftliche Prüfung.
    // Nur bei tatsächlich absolvierter OE; nicht interpretierbare Werte sind bereits als Fehler geloggt.
    const weAllRaw = get('weAllPassed');
    if (oeRuns.some((r) => r.taken) && person.weAllPassed !== true) {
      if (source === 'issued' && isBlank(weAllRaw)) {
        person.weAllPassed = true;
        person.weAllDerived = true;
        hint('weAllPassed', weAllRaw, 'WE All leer bei ausgestelltem Zertifikat – schriftlich als bestanden übernommen (Zertifikat setzt schriftlich und mündlich voraus)');
      } else if (person.weAllPassed === false || isBlank(weAllRaw)) {
        hint('weAllPassed', weAllRaw, 'Mündliche Prüfung mit Ergebnis erfasst, aber schriftliche Prüfung nicht als bestanden markiert (Voraussetzung für mündlich)');
      }
    }

    persons.push(person);
  }

  return { persons, dq };
}

// Beide Sheets → eine Personenliste + gesammeltes Data-Quality-Log
export function normalizeWorkbook({ sheets = [], comments = {}, meta = {} } = {}, options = {}) {
  const persons = [];
  const dq = [];
  const counts = { first: 0, issued: 0, persons: 0, dq: 0, fehler: 0, hinweise: 0 };
  for (const sheet of sheets) {
    if (!SOURCES.includes(sheet.source)) {
      throw new Error('Unbekanntes Sheet «' + sheet.sheetName + '» – erlaubt sind nur ' + Object.values(CONFIG.sheets).join(', '));
    }
    const result = normalizeSheet(sheet, (comments && comments[sheet.sheetName]) || {}, options);
    persons.push(...result.persons);
    dq.push(...result.dq);
    counts[sheet.source] += result.persons.length;
  }
  counts.persons = persons.length;
  counts.dq = dq.length;
  counts.fehler = dq.filter((e) => e.level === LEVEL.FEHLER).length;
  counts.hinweise = dq.filter((e) => e.level === LEVEL.HINWEIS).length;
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

    // loadResult = Ergebnis von datasource.load(): { sheets, comments, meta }; options.today optional
    setData(loadResult, options = {}) {
      const { persons, dq, meta } = normalizeWorkbook(loadResult, options);
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
