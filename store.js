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
//   level 'fehler'            = Zelle nicht interpretierbar (Wert wird null)
//   level 'hinweis'           = Wert wurde interpretiert oder abgeleitet, weicht aber von der Erwartung ab,
//                               bzw. Konsistenzregel verletzt (z. B. mündlich erfasst ohne bestandene schriftliche Prüfung)
//   level 'nicht-ausgewertet' = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score, Entscheid E6 offen)
//
// Modell (Entscheide E1–E4 des Auftraggebers):
// - Eine Zeile ist ein Zertifizierungsvorgang (kurz Vorgang). Eine Person (Mensch) hat n Vorgänge – z. B. IK und CWMA.
// - Personenschlüssel (E2): normalisiert aus Last Name, First Name, Geburtsdatum. Nicht Employer (Bankwechsel = dieselbe Person).
// - Duplikat (E1): zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten sind derselbe
//   Vorgang – meist einmal in «First Certification» und einmal in «Ausgestellte Zertifikate». Die App führt sie zu einem
//   Vorgang zusammen (Lücken auffüllen, nie überschreiben), meldet das im DQ-Log und zählt nichts doppelt.
// - Status je Vorgang (E4): bestanden / nicht bestanden / offen (Gesamtergebnis leer = Prozess läuft noch) /
//   nicht erfasst (Gesamtergebnis vorhanden, aber unlesbar → DQ-Fehler). Getrennt für schriftlich (weStatus), mündlich (oeStatus)
//   und den Vorgang (status).
//
// Fachliche Festlegungen (mit dem Auftraggeber abgestimmt bzw. aus der Datei abgeleitet):
// - Ein Run gilt als absolviert, wenn ein Passed-Wert vorhanden ist. Nur ein Datum (geplanter Termin) oder
//   nur Score/Result (Formelvorgaben 0) machen keinen Versuch.
// - Ohne Namen (Last Name und First Name leer) keine Person; Zeilen ohne Inhalt in gemappten Spalten sind leer.
// - Sheet «Ausgestellte Zertifikate»: leere Gesamtergebnisse «WE All yes» / «OE All yes» gelten als bestanden
//   (Zertifikat setzt schriftlich und mündlich voraus) – mit Hinweis im DQ-Log. Ein «no» bleibt ein «no».

import {
  CONFIG, HEADER_FIELDS, PROFILES, PROFILE_ALIASES, LANGUAGES, LANGUAGE_ALIASES, PROFILE_LANGUAGE_HINTS,
  PASSED_TRUE, PASSED_FALSE, EMPLOYER_ALIASES, VSS_REGEX, VSM_REGEX, DATE_RULES, BIRTH_DATE_RULES, requiredFieldKeys, headerCandidates, partKey, runKey,
} from './config.js';
import { DEFAULT_FILTER, STATUS, PASSIVE_DAYS, filterPersons, eligible, groupBy, groupByPerson, dayKey, partsByProfile, missingParts, profileParts, partsOutsideProfile, personIndex, passerelleFrom, normalizeNamePart } from './metrics.js';

// normalizeNamePart liegt seit Paket C in metrics.js (Personensuche); hier weiterhin exportiert (Personenschlüssel, Tests)
export { normalizeNamePart };
import { DEFAULT_UI } from './urlState.js';

export const LEVEL = Object.freeze({ FEHLER: 'fehler', HINWEIS: 'hinweis', NICHT_AUSGEWERTET: 'nicht-ausgewertet' });

// Wirkungsklasse eines DQ-Eintrags (Befund 7): was sich ändert, wenn die Zelle korrigiert wird.
//   unsichtbar = die Zeile fehlt deswegen in allen Kennzahlen (kein Name, kein absolvierter datierter WE-Run)
//   kennzahl   = die Zeile ist sichtbar, aber ein Wert, eine Gruppe oder eine Zählung hängt an der Zelle
//   keine      = reine Interpretation oder nicht ausgewertetes Feld – keine Zahl im Cockpit ändert sich
export const IMPACT = Object.freeze({ UNSICHTBAR: 'unsichtbar', KENNZAHL: 'kennzahl', KEINE: 'keine' });
export const IMPACT_LABELS = Object.freeze({ unsichtbar: 'macht Zeile unsichtbar', kennzahl: 'verändert Kennzahl', keine: 'ohne Kennzahlwirkung' });
export const IMPACT_ORDER = Object.freeze({ unsichtbar: 0, kennzahl: 1, keine: 2 });

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

// Hinweis für eine verlustfreie Interpretation (Wert eindeutig ableitbar): ohne Kennzahlwirkung
function interpreted(value, reason) {
  return { value, reason, level: LEVEL.HINWEIS, impact: IMPACT.KEINE };
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

// Zahl ohne Prozentzeichen: 0–1 gilt als Anteil (Grenzfall 1 = 100 %, nicht 1 %); > 1 bis 100 gilt als Prozentwert
// und wird durch 100 geteilt – diese Umdeutung wird als Hinweis geloggt (Befund 11, analog zur Excel-Serienzahl).
function resultFromNumber(n, shown) {
  if (n >= 0 && n <= 1) return ok(n);
  if (n > 1 && n <= 100) return interpreted(n / 100, 'Result «' + shown + '» ohne Prozentzeichen und > 1 – als Prozentwert interpretiert (' + n + ' % → ' + (n / 100) + ')');
  return bad(null, 'Result ausserhalb 0–100');
}

export function parseResult(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad(null, 'Result ist keine gültige Zahl');
    return resultFromNumber(raw, String(raw));
  }
  if (typeof raw === 'string') {
    const m = RESULT_TEXT.exec(raw);
    if (!m) return bad(null, 'Result-Text nicht interpretierbar (erwartet z. B. «89.00%» oder eine Zahl)');
    const n = parseFloat(m[1].replace(',', '.'));
    if (m[2]) {
      if (n < 0 || n > 100) return bad(null, 'Result ausserhalb 0–100 %');
      return ok(n / 100);
    }
    return resultFromNumber(n, raw.trim());
  }
  return bad(null, 'Result hat unerwarteten Typ (' + typeName(raw) + ')');
}

// Score (Header «WE{n} RUN{r} Score» / «OE{n} RUN{r} Score») fliesst in keine Kennzahl (Entscheid E6, 05.09.2026: Result ist
// massgebend). Geparst wird weiterhin, damit unlesbare Werte – am File meist verrutschte Zellen – sichtbar bleiben: Stufe «nicht ausgewertet».
export function parseScore(raw) {
  if (isBlank(raw)) return ok(null);
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return ok(raw);
  return { value: null, reason: 'Score ist keine ganze Zahl ≥ 0 – Feld wird nicht ausgewertet (Entscheid 05.09.2026: Result ist massgebend; Eintrag zeigt vermutlich verrutschte Zellen)', level: LEVEL.NICHT_AUSGEWERTET, impact: IMPACT.KEINE };
}

// dd.mm.yy(yy) [ / hh.mm | hh:mm ] [h | Uhr]; Trenner Punkt oder Komma
const DATE_TEXT = /^\s*(\d{1,2})[.,](\d{1,2})[.,](\d{2}|\d{4})(?:\s*\/\s*(\d{1,2})[.:](\d{2})\s*(?:h|uhr)?)?\s*$/i;
const DATE_NO_YEAR = /^\s*\d{1,2}\.\d{1,2}\.\s*(?:\/.*)?$/;
const DATE_3DIGIT_YEAR = /^\s*\d{1,2}[.,]\d{1,2}[.,]\d{3}\s*(?:\/.*)?$/;

function yearPlausible(year, rules) {
  return year >= rules.minYear && year <= rules.maxYear;
}

// Excel-Serienzahl (Tage seit 1899-12-30) → lokales Datum
function serialToDate(serial) {
  const utc = new Date(Math.round((serial - 25569) * 86400000));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes());
}

// rules: DATE_RULES (Prüfungsdaten) oder BIRTH_DATE_RULES (Geburtsdatum)
export function parseDateWith(raw, rules = DATE_RULES) {
  if (isBlank(raw)) return ok(null);
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return bad(null, 'Datum ungültig (Invalid Date)');
    if (!yearPlausible(raw.getFullYear(), rules)) return bad(null, 'Jahr unplausibel (' + raw.getFullYear() + '), erwartet ' + rules.minYear + '–' + rules.maxYear);
    return ok(raw);
  }
  if (typeof raw === 'number') {
    if (Number.isFinite(raw) && raw >= rules.serialMin && raw <= rules.serialMax) {
      return interpreted(serialToDate(raw), 'Datum als Zahl ohne Datumsformat (' + raw + '), als Excel-Serienzahl interpretiert');
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
  if (!yearPlausible(year, rules)) return bad(null, 'Jahr unplausibel (' + year + '), erwartet ' + rules.minYear + '–' + rules.maxYear);
  return ok(new Date(year, month - 1, day, hour, minute));
}

export function parseDate(raw) {
  return parseDateWith(raw, DATE_RULES);
}

export function parseBirthDate(raw) {
  return parseDateWith(raw, BIRTH_DATE_RULES);
}

// VSS/VSM aus Threaded-Comment-Text (beides möglich)
export function parseVssVsm(text) {
  const t = typeof text === 'string' ? text : '';
  return { vss: VSS_REGEX.test(t), vsm: VSM_REGEX.test(t) };
}

// ---------------------------------------------------------------------------
// Personenschlüssel (E2) und Status (E4)
// ---------------------------------------------------------------------------


// Schlüssel «nachname|vorname|YYYY-MM-DD». Ohne Geburtsdatum bleibt der dritte Teil leer (Stufe «name-only»).
export function personKeyOf({ lastName, firstName, birthDate }) {
  const bd = birthDate instanceof Date && !Number.isNaN(birthDate.getTime()) ? dayKey(birthDate) : '';
  return normalizeNamePart(lastName) + '|' + normalizeNamePart(firstName) + '|' + bd;
}

// Status aus einer Gesamtergebnis-Zelle (WE All / OE All): yes → bestanden, no → nicht bestanden,
// leer → offen (Prozess läuft noch, E4), nicht leer und unlesbar → nicht erfasst (DQ-Fehler)
export function statusOf(value, raw) {
  if (value === true) return STATUS.BESTANDEN;
  if (value === false) return STATUS.NICHT_BESTANDEN;
  return isBlank(raw) ? STATUS.OFFEN : STATUS.NICHT_ERFASST;
}

// Status des Vorgangs: nicht bestanden, sobald ein Teil nicht bestanden ist; bestanden nur, wenn beide bestanden sind;
// nicht erfasst, wenn ein Teil unlesbar ist und keiner nicht bestanden; sonst offen.
export function combineStatus(weStatus, oeStatus) {
  if (weStatus === STATUS.NICHT_BESTANDEN || oeStatus === STATUS.NICHT_BESTANDEN) return STATUS.NICHT_BESTANDEN;
  if (weStatus === STATUS.BESTANDEN && oeStatus === STATUS.BESTANDEN) return STATUS.BESTANDEN;
  if (weStatus === STATUS.NICHT_ERFASST || oeStatus === STATUS.NICHT_ERFASST) return STATUS.NICHT_ERFASST;
  return STATUS.OFFEN;
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
    const logDq = (key, raw, reason, level, impact = null) => dq.push({ level, impact, sheet: sheetName, row, header: headerNameOf(key), field: key, raw, reason });
    const hint = (key, raw, reason) => logDq(key, raw, reason, LEVEL.HINWEIS);
    const field = (key, parser) => {
      const raw = get(key);
      const r = parser(raw);
      if (r.reason) logDq(key, raw, r.reason, r.level || LEVEL.FEHLER, r.impact || null);
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
      birthDate: map.birthDate === undefined ? null : field('birthDate', parseBirthDate),
      personKey: null,          // E2: nachname|vorname|geburtsdatum (siehe personKeyOf)
      personKeyLevel: null,     // 'full' (mit Geburtsdatum) | 'name-only'
      ...parseVssVsm(comments[CONFIG.commentColumn + row]),
      certStart: map.certStart === undefined ? null : field('certStart', parseDate),
      certEnd: map.certEnd === undefined ? null : field('certEnd', parseDate), // Header «Certificate End Date» (optional, Paket C)
      certNumber: map.certNumber === undefined ? null : asText(get('certNumber')),
      issued: source === 'issued', // Zertifikat ausgestellt (Sheet 2 oder mit einer Sheet-2-Zeile zusammengeführt)
      we: buildParts('we', CONFIG.we),
      oe: buildParts('oe', CONFIG.oe),
      weAllPassed: field('weAllPassed', parsePassed),
      weAllDerived: false,
      oeAllPassed: field('oeAllPassed', parsePassed),
      oeAllDerived: false,
      weStatus: null,           // E4: bestanden | nicht bestanden | offen | nicht erfasst
      oeStatus: null,
      status: null,
      passiv: false,            // offen, letzte Prüfung > PASSIVE_DAYS Tage zurück, kein Termin (Stichtag options.today)
      weAllHeader: headerNameOf('weAllPassed'),
      oeAllHeader: headerNameOf('oeAllPassed'),
      refDate: null,
      refDateSource: null,
      firstExamDate: null,
      attemptsTotal: 0,
      hasWeDate: false,
      duplicateOf: null,        // E1: { sheet, row } des Vorgangs, in den diese Zeile zusammengeführt wurde
      duplicates: [],           // E1: zusammengeführte Zeilen [{ sheet, row }]
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

    const oeRuns = person.oe.flatMap((part) => part.runs);
    const weAllRaw = get('weAllPassed');
    const oeAllRaw = get('oeAllPassed');

    // Sheet «Ausgestellte Zertifikate»: ein Zertifikat setzt schriftlich und mündlich bestanden voraus (Festlegung
    // Auftraggeber). Leere Gesamtergebnisse gelten dort als bestanden (Hinweis) – nicht als «offen» (E4). «no» bleibt «no».
    if (source === 'issued') {
      if (isBlank(weAllRaw)) {
        person.weAllPassed = true;
        person.weAllDerived = true;
        hint('weAllPassed', weAllRaw, 'WE All leer bei ausgestelltem Zertifikat – schriftlich als bestanden übernommen (Zertifikat setzt schriftlich und mündlich voraus)');
      }
      if (isBlank(oeAllRaw)) {
        person.oeAllPassed = true;
        person.oeAllDerived = true;
        hint('oeAllPassed', oeAllRaw, 'OE All leer bei ausgestelltem Zertifikat – mündlich als bestanden übernommen (Zertifikat setzt schriftlich und mündlich voraus)');
      }
    }

    // Konsistenzregel: Voraussetzung für mündlich ist die bestandene schriftliche Prüfung.
    // Nur bei tatsächlich absolvierter OE; nicht interpretierbare Werte sind bereits als Fehler geloggt.
    if (oeRuns.some((r) => r.taken) && person.weAllPassed !== true && (person.weAllPassed === false || isBlank(weAllRaw))) {
      hint('weAllPassed', weAllRaw, 'Mündliche Prüfung mit Ergebnis erfasst, aber schriftliche Prüfung nicht als bestanden markiert (Voraussetzung für mündlich)');
    }

    // Status (E4), Personenschlüssel (E2), abgeleitete Felder
    person.weStatus = statusOf(person.weAllPassed, weAllRaw);
    person.oeStatus = statusOf(person.oeAllPassed, oeAllRaw);
    person.personKey = personKeyOf(person);
    person.personKeyLevel = person.birthDate ? 'full' : 'name-only';
    deriveFields(person, horizon);

    persons.push(person);
  }

  return { persons, dq, headers: { birthDate: map.birthDate === undefined ? null : String(headerRow[map.birthDate]).trim() } };
}

// Abgeleitete Felder eines Vorgangs (nach Normalisierung und nach jeder Zusammenführung neu berechnet);
// today = Stichtag für «passiv» (Tagesende)
export function deriveFields(person, today = new Date()) {
  const weRuns = person.we.flatMap((part) => part.runs);
  const oeRuns = person.oe.flatMap((part) => part.runs);
  const takenRuns = weRuns.concat(oeRuns).filter((r) => r.taken);
  person.attemptsTotal = takenRuns.length;
  person.hasWeDate = weRuns.some((r) => r.taken && r.date !== null);
  const dated = takenRuns.filter((r) => r.date).map((r) => r.date);
  person.firstExamDate = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;

  // Referenzdatum: Datum des bestandenen OE-Runs (letzter mit passed=true);
  // ohne bestandene OE: letztes Datum eines absolvierten Runs.
  const passedOe = latest(oeRuns.filter((r) => r.taken && r.passed === true && r.date).map((r) => r.date));
  if (passedOe) {
    person.refDate = passedOe;
    person.refDateSource = 'oe';
  } else {
    const lastExam = latest(dated);
    person.refDate = lastExam;
    person.refDateSource = lastExam ? 'lastExam' : null;
  }
  person.status = combineStatus(person.weStatus, person.oeStatus);
  // Passiv (Entscheid 05.09.2026): offen, letzte Prüfung > PASSIVE_DAYS Tage vor dem Stichtag, kein geplanter Termin
  const lastExam = latest(dated);
  const hasPlanned = weRuns.concat(oeRuns).some((r) => r.planned);
  person.passiv = person.status === STATUS.OFFEN && lastExam !== null && !hasPlanned
    && (today.getTime() - lastExam.getTime()) / 86400000 > PASSIVE_DAYS;
  return person;
}

// ---------------------------------------------------------------------------
// Personen und Duplikate über beide Sheets (E1, E2, E3)
// ---------------------------------------------------------------------------

function runList(person) {
  const out = [];
  for (const kind of ['we', 'oe']) {
    for (const part of person[kind]) {
      for (const r of part.runs) out.push({ label: kind.toUpperCase() + part.part + ' RUN' + r.n, kind, part, run: r });
    }
  }
  return out;
}

// Widersprüche zwischen zwei Zeilen: derselbe Run hat in beiden ein Datum bzw. einen Passed-Wert, und diese weichen ab.
// Leere Felder widersprechen nie (die Zeilen ergänzen sich dann).
export function runConflicts(a, b) {
  const other = new Map(runList(b).map((x) => [x.label, x.run]));
  const conflicts = [];
  for (const { label, run } of runList(a)) {
    const o = other.get(label);
    if (!o) continue;
    if (run.date && o.date && dayKey(run.date) !== dayKey(o.date)) conflicts.push(label + ' Date');
    if (run.passed !== null && o.passed !== null && run.passed !== o.passed) conflicts.push(label + ' Passed');
  }
  return conflicts;
}

function fillRun(target, sourceRun) {
  for (const what of ['passed', 'date', 'score', 'result', 'location']) {
    if (target[what] === null && sourceRun[what] !== null) target[what] = sourceRun[what];
  }
  target.taken = target.passed !== null;
  target.planned = !target.taken && (target.planned || sourceRun.planned);
}

// Lücken des behaltenen Vorgangs aus dem Duplikat auffüllen – nie überschreiben (Widersprüche wurden vorher ausgeschlossen).
export function mergeVorgang(keep, dup, today = new Date()) {
  for (const kind of ['we', 'oe']) {
    keep[kind].forEach((part, i) => {
      const otherPart = dup[kind][i];
      if (!otherPart) return;
      if (part.passed === null && otherPart.passed !== null) part.passed = otherPart.passed;
      part.runs.forEach((run, r) => { if (otherPart.runs[r]) fillRun(run, otherPart.runs[r]); });
    });
  }
  // Gesamtergebnis: ein vorhandenes Ergebnis (bestanden / nicht bestanden) ersetzt «offen» oder «nicht erfasst»
  for (const [flag, status, derived] of [['weAllPassed', 'weStatus', 'weAllDerived'], ['oeAllPassed', 'oeStatus', 'oeAllDerived']]) {
    if (keep[flag] === null && dup[flag] !== null) {
      keep[flag] = dup[flag];
      keep[status] = dup[status];
      keep[derived] = dup[derived];
    }
  }
  for (const key of ['certNumber', 'certStart', 'certEnd', 'birthDate', 'profil', 'sprache', 'employer', 'employerCanon', 'role']) {
    if (keep[key] === null && dup[key] !== null) keep[key] = dup[key];
  }
  keep.vss = keep.vss || dup.vss;
  keep.vsm = keep.vsm || dup.vsm;
  keep.issued = keep.issued || dup.issued;
  keep.duplicates.push({ sheet: dup.sheetName, row: dup.row });
  dup.duplicateOf = { sheet: keep.sheetName, row: keep.row };
  deriveFields(keep, today);
  return keep;
}

// Zeilen derselben Person (E2) mit gleichem Profil sind Kandidaten für denselben Vorgang (E1). Kompatible Zeilen
// (keine widersprüchlichen Prüfungsdaten) werden zusammengeführt: behalten wird die Zeile mit den meisten absolvierten
// Runs, bei Gleichstand die aus «Ausgestellte Zertifikate», sonst die frühere. Widersprüchliche Zeilen bleiben eigene
// Vorgänge (z. B. Wiederholung desselben Profils) und erhalten einen Hinweis.
export function linkPersons(persons, dq, today = new Date()) {
  const byKey = new Map();
  persons.forEach((p, index) => {
    p.duplicateOf = null;
    p.duplicates = [];
    if (!byKey.has(p.personKey)) byKey.set(p.personKey, []);
    byKey.get(p.personKey).push({ p, index });
  });
  let duplikate = 0;
  let profilKonflikte = 0;
  for (const items of byKey.values()) {
    if (items.length < 2) continue;
    const byProfile = new Map();
    for (const item of items) {
      const k = item.p.profil === null ? '' : String(item.p.profil);
      if (!byProfile.has(k)) byProfile.set(k, []);
      byProfile.get(k).push(item);
    }
    for (const candidates of byProfile.values()) {
      if (candidates.length < 2) continue;
      // Cluster kompatibler Zeilen: jede Zeile kommt zum ersten Cluster, dem sie nicht widerspricht
      const clusters = [];
      for (const item of candidates) {
        const target = clusters.find((c) => c.every((o) => runConflicts(item.p, o.p).length === 0));
        if (target) target.push(item);
        else clusters.push([item]);
      }
      if (clusters.length > 1) {
        const first = clusters[0][0].p;
        for (const cluster of clusters.slice(1)) {
          const p = cluster[0].p;
          const conflicts = runConflicts(p, first);
          profilKonflikte += 1;
          dq.push({
            level: LEVEL.HINWEIS, impact: IMPACT.KENNZAHL, sheet: p.sheetName, row: p.row, header: 'Certificate Program', field: 'profilKonflikt', raw: p.profil,
            reason: 'Gleiche Person und gleiches Profil wie «' + first.sheetName + '» Zeile ' + first.row + ', aber abweichende Prüfungsdaten (' + conflicts.join(', ') + ') – als eigener Vorgang gezählt (Wiederholung?)',
          });
        }
      }
      for (const cluster of clusters) {
        if (cluster.length < 2) continue;
        const sorted = cluster.slice().sort((a, b) => (b.p.attemptsTotal - a.p.attemptsTotal) || ((b.p.source === 'issued') - (a.p.source === 'issued')) || (a.index - b.index));
        const keep = sorted[0].p;
        for (const { p: dup } of sorted.slice(1)) {
          mergeVorgang(keep, dup, today);
          duplikate += 1;
          dq.push({
            level: LEVEL.HINWEIS, impact: IMPACT.KENNZAHL, sheet: dup.sheetName, row: dup.row, header: 'Last Name', field: 'duplikat', raw: null,
            reason: 'Duplikat: derselbe Zertifizierungsvorgang wie «' + keep.sheetName + '» Zeile ' + keep.row + ' (gleiche Person, gleiches Profil, keine abweichenden Prüfungsdaten) – zusammengeführt, zählt nicht doppelt',
          });
        }
      }
    }
  }
  return { duplikate, profilKonflikte };
}

// Wirkungsklasse eines Eintrags aus Feld, Stufe und Endzustand der Zeile (row = Vorgang oder null, wenn die Zeile
// keine Person ergab). Parser-Vorgaben (impact) haben Vorrang.
export function dqImpact(entry, row) {
  if (entry.impact) return entry.impact;
  if (entry.level === LEVEL.NICHT_AUSGEWERTET) return IMPACT.KEINE;
  if (entry.field === 'lastName' || entry.field === 'firstName') return IMPACT.UNSICHTBAR;
  // Zeile nicht kennzahlrelevant (Duplikate sind gewollt unsichtbar, ihre Daten leben im behaltenen Vorgang weiter)
  const invisible = !row || (!row.duplicateOf && !row.hasWeDate);
  if (invisible && /^we\d+\.run\d+\.(date|passed)$/.test(entry.field)) return IMPACT.UNSICHTBAR;
  return IMPACT.KENNZAHL;
}

export function classifyDq(dq, persons) {
  const byRow = new Map(persons.map((p) => [p.sheetName + '|' + p.row, p]));
  for (const e of dq) e.impact = dqImpact(e, byRow.get(e.sheet + '|' + e.row) || null);
  return dq;
}

// Beide Sheets → eine Liste von Vorgängen (persons[]; Duplikate bleiben mit duplicateOf markiert enthalten)
// + gesammeltes Data-Quality-Log + Zähler. Kennzahlen arbeiten nur auf Vorgängen ohne duplicateOf (metrics.eligible/filterPersons).
export function normalizeWorkbook({ sheets = [], comments = {}, meta = {} } = {}, options = {}) {
  const persons = [];
  const dq = [];
  const birthDateHeaders = {};
  const counts = { first: 0, issued: 0 };
  for (const sheet of sheets) {
    if (!SOURCES.includes(sheet.source)) {
      throw new Error('Unbekanntes Sheet «' + sheet.sheetName + '» – erlaubt sind nur ' + Object.values(CONFIG.sheets).join(', '));
    }
    const result = normalizeSheet(sheet, (comments && comments[sheet.sheetName]) || {}, options);
    persons.push(...result.persons);
    dq.push(...result.dq);
    counts[sheet.source] += result.persons.length;
    birthDateHeaders[sheet.source] = result.headers.birthDate;
  }
  const horizon = endOfDay(options.today || new Date());
  const { duplikate, profilKonflikte } = linkPersons(persons, dq, horizon);
  const vorgaenge = persons.filter((p) => !p.duplicateOf);
  // Teilprüfungen je Profil laut Vorgabe (config.PROFILE_PARTS, Auftraggeber 05.09.2026).
  // Hinweis (Entscheid 3): alle Teile der Vorgabe bestanden, aber Gesamtergebnis leer → bleibt offen (E4), vermutlich fehlt «yes».
  // Hinweis (Kontrolle der Vorgabe): absolvierte Runs in Teilen ausserhalb der Vorgabe (z. B. WE2 bei PK) – ohne Kennzahlwirkung.
  const parts = profileParts();
  const index = personIndex(vorgaenge);
  let vollstaendigOhneGesamtergebnis = 0;
  let teileAusserhalbVorgabe = 0;
  let passerelleMoeglich = 0;
  const label = (kind, list) => list.map((n) => kind.toUpperCase() + n).join(', ');
  for (const p of vorgaenge) {
    const def = parts.find((x) => x.profil === p.profil);
    const outside = partsOutsideProfile(p, parts);
    if (outside && outside.length) {
      teileAusserhalbVorgabe += 1;
      for (const part of outside) {
        const kind = part.startsWith('WE') ? 'we' : 'oe';
        const key = partKey(kind, Number(part.slice(2)));
        dq.push({
          level: LEVEL.HINWEIS, impact: IMPACT.KEINE, sheet: p.sheetName, row: p.row, header: headerCandidates(key)[0], field: key, raw: null,
          reason: 'Absolvierter Run in ' + part + ', aber die Vorgabe für ' + p.profil + ' umfasst ' + (def[kind].length ? 'nur ' + label(kind, def[kind]) : 'keine ' + (kind === 'we' ? 'schriftliche' : 'mündliche') + ' Teile') + ' – Vorgabe (config.js, PROFILE_PARTS) oder Erfassung prüfen',
        });
      }
    }
    if (passerelleFrom(p, index)) passerelleMoeglich += 1;
    const missing = missingParts(p, parts);
    if (missing === null) continue;
    for (const [kind, status, flag, header] of [['we', 'weStatus', 'weAllPassed', p.weAllHeader], ['oe', 'oeStatus', 'oeAllPassed', p.oeAllHeader]]) {
      if (!def[kind].length || p[status] !== STATUS.OFFEN) continue;
      if (missing.some((m) => m.startsWith(kind.toUpperCase()))) continue;
      vollstaendigOhneGesamtergebnis += 1;
      dq.push({
        level: LEVEL.HINWEIS, impact: IMPACT.KENNZAHL, sheet: p.sheetName, row: p.row, header, field: flag, raw: null,
        reason: 'Alle Teilprüfungen der Vorgabe für ' + p.profil + ' (' + label(kind, def[kind]) + ') bestanden, aber Gesamtergebnis leer – Vorgang gilt als offen (E4); vermutlich fehlt «yes»',
      });
    }
  }
  classifyDq(dq, persons);
  const people = groupByPerson(vorgaenge);
  const byStatus = (st) => vorgaenge.filter((p) => p.status === st).length;
  Object.assign(counts, {
    zeilen: persons.length,
    vorgaenge: vorgaenge.length,
    personen: people.length,
    duplikate,
    profilKonflikte,
    mehrereProfile: people.filter((g) => g.profiles.length > 1).length,
    bestanden: byStatus(STATUS.BESTANDEN),
    nichtBestanden: byStatus(STATUS.NICHT_BESTANDEN),
    offen: byStatus(STATUS.OFFEN),
    passiv: vorgaenge.filter((p) => p.passiv).length,
    nichtErfasst: byStatus(STATUS.NICHT_ERFASST),
    vollstaendigOhneGesamtergebnis,
    teileAusserhalbVorgabe,
    passerelleMoeglich,
    schluesselOhneGeburtsdatum: vorgaenge.filter((p) => p.personKeyLevel !== 'full').length,
    dq: dq.length,
    fehler: dq.filter((e) => e.level === LEVEL.FEHLER).length,
    hinweise: dq.filter((e) => e.level === LEVEL.HINWEIS).length,
    nichtAusgewertet: dq.filter((e) => e.level === LEVEL.NICHT_AUSGEWERTET).length,
    wirkungUnsichtbar: dq.filter((e) => e.impact === IMPACT.UNSICHTBAR).length,
    wirkungKennzahl: dq.filter((e) => e.impact === IMPACT.KENNZAHL).length,
    wirkungKeine: dq.filter((e) => e.impact === IMPACT.KEINE).length,
  });
  const personKey = { fields: ['Last Name', 'First Name', 'Geburtsdatum'], birthDateHeaders, complete: Object.values(birthDateHeaders).every((h) => h !== null) };
  return { persons, dq, meta: { ...meta, counts, personKey } };
}

// ---------------------------------------------------------------------------
// State (nur im Memory – keine Persistenz von Personendaten oder Aggregaten im Browser)
// ---------------------------------------------------------------------------

// state.ui: Anzeigezustand ohne Personendaten (Benchmark-Art, Sortierung/Filter des DQ-Logs) – ein Ort für allen State (Befund 16)
export function createStore() {
  const state = {
    persons: [],
    dq: [],
    meta: null,
    filter: { ...DEFAULT_FILTER },
    ui: { ...DEFAULT_UI },
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

    // options.silent: Zustand merken, ohne alle Abonnenten neu rendern zu lassen (z. B. Sortierung/Suche im DQ-Log,
    // die nur ihren eigenen Block betrifft und deren Eingabefeld den Fokus behalten muss)
    setUi(partial, { silent = false } = {}) {
      state.ui = { ...state.ui, ...partial };
      if (!silent) notify();
    },

    // Filter und Anzeigezustand zusammen setzen (z. B. aus der URL), eine Benachrichtigung
    update({ filter = null, ui = null } = {}) {
      if (filter) state.filter = { ...state.filter, ...filter };
      if (ui) state.ui = { ...state.ui, ...ui };
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
