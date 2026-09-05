import { test, assert, assertEqual, assertThrows } from './runner.js';
import { CONFIG } from '../config.js';
import {
  parsePassed, parseLanguage, parseProfile, parseEmployer, parseResult, parseScore, parseDate, parseVssVsm,
  resolveHeaders, HeaderError, MissingHeaderError, DuplicateHeaderError,
  normalizeSheet, normalizeWorkbook,
} from '../store.js';
import { makeSheet, headerRowFor, runValues } from './fixtures.js';

// ---------------------------------------------------------------------------
// Normalisierungstabelle – Einzelfunktionen ({ value, reason }; reason = null wenn ok)
// ---------------------------------------------------------------------------

test('parsePassed: Whitelist → true/false, leer → null ohne Grund', () => {
  for (const v of ['yes', 'YES', 'Yes', 'PASSED', 'fulfilled', 'FULFILLED', '  yes  ']) {
    assertEqual(parsePassed(v), { value: true, reason: null }, v);
  }
  for (const v of ['no', 'No', 'FAILED', ' FAILED ']) {
    assertEqual(parsePassed(v), { value: false, reason: null }, v);
  }
  for (const v of ['', '   ', null, undefined]) {
    assertEqual(parsePassed(v), { value: null, reason: null }, String(v));
  }
});

test('parsePassed: unbekannte Werte → null + Grund (auch NO, Passed, Booleans, Zahlen)', () => {
  for (const v of ['NO', 'Passed', 'maybe', 'x', true, false, 1, 0]) {
    const r = parsePassed(v);
    assertEqual(r.value, null, String(v));
    assert(typeof r.reason === 'string' && r.reason.length > 0, 'Grund fehlt für ' + String(v));
  }
});

test('parseLanguage: trim + upper → DE/FR/IT/EN, sonst null + Grund', () => {
  assertEqual(parseLanguage('de'), { value: 'DE', reason: null });
  assertEqual(parseLanguage(' Fr '), { value: 'FR', reason: null });
  assertEqual(parseLanguage('IT'), { value: 'IT', reason: null });
  assertEqual(parseLanguage('en'), { value: 'EN', reason: null });
  assertEqual(parseLanguage(''), { value: null, reason: null });
  assertEqual(parseLanguage(null), { value: null, reason: null });
  assertEqual(parseLanguage('ES').value, null);
  assert(parseLanguage('ES').reason);
  assert(parseLanguage(42).reason);
  assert(parseLanguage('Deutsch').reason);
});

test('parseProfile: kanonisch, Alias-Map, case-insensitiv; unbekannt → Rohwert + Grund', () => {
  assertEqual(parseProfile('PK'), { value: 'PK', reason: null });
  assertEqual(parseProfile(' kmu '), { value: 'KMU', reason: null });
  assertEqual(parseProfile('ccob'), { value: 'CCoB', reason: null });
  assertEqual(parseProfile('CCOB'), { value: 'CCoB', reason: null });
  assertEqual(parseProfile('CCoB'), { value: 'CCoB', reason: null });
  assertEqual(parseProfile('Affluent'), { value: 'AFFL', reason: null });
  assertEqual(parseProfile('AFFLUENT'), { value: 'AFFL', reason: null });
  assertEqual(parseProfile('CWMA'), { value: 'CWMA', reason: null });
  assertEqual(parseProfile(''), { value: null, reason: null });
  const unknown = parseProfile(' XYZ ');
  assertEqual(unknown.value, 'XYZ', 'Rohwert (getrimmt) bleibt erhalten');
  assert(unknown.reason);
  assertEqual(parseProfile(7).value, '7');
  assert(parseProfile(7).reason);
});

test('parseEmployer: trim + Alias-Map (case-insensitiv); unbekannt → Rohwert, kein Grund', () => {
  assertEqual(parseEmployer('BEKB'), { employer: 'BEKB', employerCanon: 'Berner Kantonalbank AG' });
  assertEqual(parseEmployer(' bekb '), { employer: 'bekb', employerCanon: 'Berner Kantonalbank AG' });
  assertEqual(parseEmployer('Berner Kantonalbank AG'), { employer: 'Berner Kantonalbank AG', employerCanon: 'Berner Kantonalbank AG' });
  assertEqual(parseEmployer('Raiffeisen KB'), { employer: 'Raiffeisen KB', employerCanon: 'Raiffeisen' });
  assertEqual(parseEmployer('SZKB'), { employer: 'SZKB', employerCanon: 'Schwyzer Kantonalbank (SZKB)' });
  assertEqual(parseEmployer(' Testbank AG '), { employer: 'Testbank AG', employerCanon: 'Testbank AG' });
  assertEqual(parseEmployer(''), { employer: null, employerCanon: null });
  assertEqual(parseEmployer(null), { employer: null, employerCanon: null });
});

test('parseResult: Zahl 0–1 direkt, >1 und ≤100 → /100, Text «89.00%» → 0.89', () => {
  assertEqual(parseResult(0.85), { value: 0.85, reason: null });
  assertEqual(parseResult(0), { value: 0, reason: null });
  assertEqual(parseResult(1), { value: 1, reason: null });
  assertEqual(parseResult(85), { value: 0.85, reason: null });
  assertEqual(parseResult(100), { value: 1, reason: null });
  assertEqual(parseResult('89.00%'), { value: 0.89, reason: null });
  assertEqual(parseResult(' 89 % '), { value: 0.89, reason: null });
  assertEqual(parseResult('89,5%'), { value: 0.895, reason: null });
  assertEqual(parseResult('100%'), { value: 1, reason: null });
  assertEqual(parseResult(''), { value: null, reason: null });
  assertEqual(parseResult(null), { value: null, reason: null });
});

test('parseResult: ausserhalb Bereich oder nicht interpretierbar → null + Grund', () => {
  for (const v of [101, -0.1, 250, NaN, '0.89', 'abc', '110%', '-5%', true]) {
    const r = parseResult(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
  }
});

test('parseScore: ganze Zahl ≥ 0; sonst null + Grund', () => {
  assertEqual(parseScore(12), { value: 12, reason: null });
  assertEqual(parseScore(0), { value: 0, reason: null });
  assertEqual(parseScore(''), { value: null, reason: null });
  assertEqual(parseScore(null), { value: null, reason: null });
  for (const v of [12.5, -1, '12', 'abc', NaN, true]) {
    const r = parseScore(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
  }
});

test('parseDate: Date-Objekt wird übernommen, ungültiges Date → Grund', () => {
  const dt = new Date(2024, 7, 28);
  assertEqual(parseDate(dt), { value: dt, reason: null });
  const bad = parseDate(new Date('nope'));
  assertEqual(bad.value, null);
  assert(bad.reason);
});

test('parseDate: Text dd.mm.yy(yy)[ / hh.mm|hh:mm] → Date (lokal)', () => {
  assertEqual(parseDate('28.08.24'), { value: new Date(2024, 7, 28), reason: null });
  assertEqual(parseDate('05.09.2024'), { value: new Date(2024, 8, 5), reason: null });
  assertEqual(parseDate('5.9.24'), { value: new Date(2024, 8, 5), reason: null });
  assertEqual(parseDate('05.09.2024 / 14.30'), { value: new Date(2024, 8, 5, 14, 30), reason: null });
  assertEqual(parseDate('05.09.2024 / 14:30'), { value: new Date(2024, 8, 5, 14, 30), reason: null });
  assertEqual(parseDate('05.09.2024/14:30'), { value: new Date(2024, 8, 5, 14, 30), reason: null });
  assertEqual(parseDate(' 01.01.2025 '), { value: new Date(2025, 0, 1), reason: null });
  assertEqual(parseDate(''), { value: null, reason: null });
  assertEqual(parseDate(null), { value: null, reason: null });
});

test('parseDate: ungültige Kalenderdaten, ISO-Text und Zahlen → null + Grund', () => {
  for (const v of ['31.02.2024', '00.01.2024', '01.13.2024', '2024-09-05', '05/09/2024', 45000, 'Mo 05.09.', '05.09.2024 / 25.00']) {
    const r = parseDate(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
  }
});

test('parseVssVsm: Regex auf Kommentartext, beides möglich', () => {
  assertEqual(parseVssVsm('VSM 8718 28.08./05.09.24: Name'), { vss: false, vsm: true });
  assertEqual(parseVssVsm('VSS 07.05.2026: Name'), { vss: true, vsm: false });
  assertEqual(parseVssVsm('VSS und VSM absolviert'), { vss: true, vsm: true });
  assertEqual(parseVssVsm('vsm'), { vss: false, vsm: true });
  assertEqual(parseVssVsm('Beliebiger Text'), { vss: false, vsm: false });
  assertEqual(parseVssVsm(null), { vss: false, vsm: false });
  assertEqual(parseVssVsm(''), { vss: false, vsm: false });
});

// ---------------------------------------------------------------------------
// Header-Auflösung (nur über Header-Namen der Zeile 10)
// ---------------------------------------------------------------------------

test('resolveHeaders: mappt Feldschlüssel auf Spaltenindex über Header-Namen', () => {
  const header = headerRowFor('first');
  const map = resolveHeaders(header, 'first', CONFIG.sheets.first);
  assertEqual(map.lastName, header.indexOf('Last Name'));
  assertEqual(map['we1.run1.passed'], header.indexOf('WE1 RUN1 Passed'));
  assertEqual(map['oe2.run3.result'], header.indexOf('OE2 RUN3 Result'));
  assertEqual(map.certStart, undefined, 'certStart in Sheet 1 nicht vorhanden');
});

test('resolveHeaders: Sheet 2 nutzt «yes»-Varianten und hat certStart', () => {
  const header = headerRowFor('issued');
  const map = resolveHeaders(header, 'issued', CONFIG.sheets.issued);
  assertEqual(map.weAllPassed, header.indexOf('WE All yes'));
  assertEqual(map['we3.run2.passed'], header.indexOf('WE3 RUN2 yes'));
  assertEqual(map.certStart, header.indexOf('Certificate Start Date'));
  assertEqual(map.certNumber, header.indexOf('Certificate Number'));
});

test('resolveHeaders: Header-Vergleich toleriert Leerraum und Gross-/Kleinschreibung', () => {
  const header = headerRowFor('first').map((h) => (h === 'Last Name' ? '  last name ' : h === 'WE1 RUN1 Date' ? 'WE1  RUN1 date' : h));
  const map = resolveHeaders(header, 'first', CONFIG.sheets.first);
  assertEqual(map.lastName, header.indexOf('  last name '));
  assertEqual(map['we1.run1.date'], header.indexOf('WE1  RUN1 date'));
});

test('resolveHeaders: Spaltenverschiebung ist irrelevant (Reihenfolge egal)', () => {
  const header = headerRowFor('first').slice().reverse();
  const map = resolveHeaders(header, 'first', CONFIG.sheets.first);
  assertEqual(map.firstName, header.indexOf('First Name'));
  assertEqual(map['we6.run1.score'], header.indexOf('WE6 RUN1 Score'));
});

test('resolveHeaders: fehlender Pflicht-Header → MissingHeaderError mit Sheet und Liste', () => {
  const header = headerRowFor('first').filter((h) => h !== 'WE3 RUN2 Date' && h !== 'Employer');
  const err = assertThrows(() => resolveHeaders(header, 'first', CONFIG.sheets.first), (e) => e instanceof MissingHeaderError);
  assert(err instanceof HeaderError);
  assertEqual(err.sheet, CONFIG.sheets.first);
  assertEqual(err.missing.map((m) => m.key).sort(), ['employer', 'we3.run2.date']);
  assertEqual(err.missing.find((m) => m.key === 'employer').candidates, ['Employer']);
  assert(err.message.includes('WE3 RUN2 Date') && err.message.includes('Employer') && err.message.includes(CONFIG.sheets.first));
});

test('resolveHeaders: certStart fehlt nur in Sheet 2 hart', () => {
  const header = headerRowFor('issued').filter((h) => h !== 'Certificate Start Date');
  assertThrows(() => resolveHeaders(header, 'issued', CONFIG.sheets.issued), (e) => e instanceof MissingHeaderError);
  const map = resolveHeaders(headerRowFor('first'), 'first', CONFIG.sheets.first);
  assertEqual(map.certStart, undefined);
});

test('resolveHeaders: doppelter Header → DuplicateHeaderError (kein Raten)', () => {
  const header = headerRowFor('first').concat(['Last Name']);
  const err = assertThrows(() => resolveHeaders(header, 'first', CONFIG.sheets.first), (e) => e instanceof DuplicateHeaderError);
  assert(err.message.includes('Last Name'));
  assertEqual(err.sheet, CONFIG.sheets.first);
});

test('resolveHeaders: beide Varianten desselben Feldes vorhanden → DuplicateHeaderError', () => {
  const header = headerRowFor('first').concat(['WE All yes']);
  assertThrows(() => resolveHeaders(header, 'first', CONFIG.sheets.first), (e) => e instanceof DuplicateHeaderError);
});

// ---------------------------------------------------------------------------
// Zeilen → Personenmodell
// ---------------------------------------------------------------------------

function fullRow(overrides = {}) {
  return {
    lastName: ' Muster ', firstName: 'Anna', role: 'Kundenberaterin', employer: 'BEKB', profil: 'ccob', sprache: 'de',
    weAllPassed: 'yes', oeAllPassed: 'yes',
    'we1.passed': 'yes', 'we2.passed': 'yes',
    ...runValues('we', {
      1: [{ passed: 'no', date: new Date(2024, 2, 1), score: 40, result: 55 }, { passed: 'yes', date: '15.04.24', score: 61, result: '82.50%' }],
      2: [{ passed: 'yes', date: new Date(2024, 2, 1), score: 70, result: 0.9 }],
    }),
    'oe1.passed': 'yes',
    ...runValues('oe', {
      1: [{ passed: 'FAILED', date: '02.05.2024 / 09.30', score: 3, result: 0.4 }, { passed: 'PASSED', date: '20.06.2024 / 10:00', score: 5, result: 0.75 }],
    }),
    ...overrides,
  };
}

test('normalizeSheet: vollständige Zeile aus Sheet 1 → Personenmodell', () => {
  const sheet = makeSheet('first', [fullRow()]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(dq, [], 'keine DQ-Einträge');
  assertEqual(persons.length, 1);
  const p = persons[0];
  assertEqual(p.source, 'first');
  assertEqual(p.sheetName, CONFIG.sheets.first);
  assertEqual(p.row, 11);
  assertEqual(p.lastName, 'Muster');
  assertEqual(p.firstName, 'Anna');
  assertEqual(p.role, 'Kundenberaterin');
  assertEqual(p.employer, 'BEKB');
  assertEqual(p.employerCanon, 'Berner Kantonalbank AG');
  assertEqual(p.profil, 'CCoB');
  assertEqual(p.sprache, 'DE');
  assertEqual(p.vss, false);
  assertEqual(p.vsm, false);
  assertEqual(p.certStart, null);
  assertEqual(p.weAllPassed, true);
  assertEqual(p.oeAllPassed, true);
  assertEqual(p.we.length, 6);
  assertEqual(p.oe.length, 2);
  assertEqual(p.we[0].part, 1);
  assertEqual(p.we[0].passed, true);
  assertEqual(p.we[0].runs.length, 3);
  assertEqual(p.we[0].runs[0], { n: 1, passed: false, date: new Date(2024, 2, 1), score: 40, result: 0.55, taken: true });
  assertEqual(p.we[0].runs[1], { n: 2, passed: true, date: new Date(2024, 3, 15), score: 61, result: 0.825, taken: true });
  assertEqual(p.we[0].runs[2], { n: 3, passed: null, date: null, score: null, result: null, taken: false });
  assertEqual(p.we[1].runs[0].result, 0.9);
  assertEqual(p.we[2].passed, null);
  assertEqual(p.oe[0].runs[0], { n: 1, passed: false, date: new Date(2024, 4, 2, 9, 30), score: 3, result: 0.4, taken: true });
  assertEqual(p.oe[0].runs[1].passed, true);
  assertEqual(p.oe[1].passed, null);
});

test('normalizeSheet: Referenzdatum = Datum des bestandenen OE-Runs', () => {
  const { persons } = normalizeSheet(makeSheet('first', [fullRow()]), {});
  assertEqual(persons[0].refDate, new Date(2024, 5, 20, 10, 0));
  assertEqual(persons[0].refDateSource, 'oe');
});

test('normalizeSheet: ohne bestandene OE → letztes Prüfungsdatum als Referenz', () => {
  const row = fullRow({ oeAllPassed: 'no', 'oe1.passed': 'no', ...runValues('oe', { 1: [{ passed: 'no', date: '02.05.2024', score: 3, result: 0.4 }, { passed: 'no', date: '20.06.2024', score: 4, result: 0.5 }] }) });
  const { persons } = normalizeSheet(makeSheet('first', [row]), {});
  assertEqual(persons[0].refDate, new Date(2024, 5, 20));
  assertEqual(persons[0].refDateSource, 'lastExam');
  assertEqual(persons[0].oeAllPassed, false);
});

test('normalizeSheet: ohne Daten kein Referenzdatum', () => {
  const { persons } = normalizeSheet(makeSheet('first', [{ lastName: 'Ohne', firstName: 'Daten' }]), {});
  assertEqual(persons[0].refDate, null);
  assertEqual(persons[0].refDateSource, null);
  assertEqual(persons[0].hasWeDate, false);
  assertEqual(persons[0].attemptsTotal, 0);
});

test('normalizeSheet: attemptsTotal zählt absolvierte Runs (WE + OE), hasWeDate', () => {
  const { persons } = normalizeSheet(makeSheet('first', [fullRow()]), {});
  assertEqual(persons[0].attemptsTotal, 5); // WE1: 2, WE2: 1, OE1: 2
  assertEqual(persons[0].hasWeDate, true);
});

test('normalizeSheet: Run ohne Datum, aber mit Result gilt als absolviert', () => {
  const row = { lastName: 'A', firstName: 'B', ...runValues('we', { 3: [{ result: 0.7 }] }) };
  const { persons } = normalizeSheet(makeSheet('first', [row]), {});
  assertEqual(persons[0].we[2].runs[0].taken, true);
  assertEqual(persons[0].attemptsTotal, 1);
  assertEqual(persons[0].hasWeDate, false);
});

test('normalizeSheet: Sheet 2 («yes»-Varianten, certStart) → source issued', () => {
  const sheet = makeSheet('issued', [fullRow({ certStart: '01.07.2024', certNumber: 'Z-0001' })]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(dq, []);
  assertEqual(persons[0].source, 'issued');
  assertEqual(persons[0].sheetName, CONFIG.sheets.issued);
  assertEqual(persons[0].certStart, new Date(2024, 6, 1));
  assertEqual(persons[0].certNumber, 'Z-0001');
  assertEqual(persons[0].weAllPassed, true);
  assertEqual(persons[0].we[0].runs[1].passed, true);
});

test('normalizeSheet: VSS/VSM aus Threaded Comment auf B{row}', () => {
  const sheet = makeSheet('first', [fullRow(), fullRow({ lastName: 'Beispiel' }), fullRow({ lastName: 'Dritte' })]);
  const comments = { B11: 'VSM 8718 28.08./05.09.24: Testperson', B12: 'VSS 07.05.2026: Testperson', C13: 'VSS irrelevant (falsche Spalte)' };
  const { persons } = normalizeSheet(sheet, comments);
  assertEqual([persons[0].vss, persons[0].vsm], [false, true]);
  assertEqual([persons[1].vss, persons[1].vsm], [true, false]);
  assertEqual([persons[2].vss, persons[2].vsm], [false, false]);
});

test('normalizeSheet: komplett leere Zeilen werden übersprungen (ohne DQ)', () => {
  const sheet = makeSheet('first', [{}, fullRow(), { Nr: '' }]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(persons.length, 1);
  assertEqual(persons[0].row, 12);
  assertEqual(dq, []);
});

test('normalizeSheet: Zeile mit Daten aber ohne Namen → Person + DQ-Eintrag', () => {
  const sheet = makeSheet('first', [{ profil: 'PK' }]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(persons.length, 1);
  assertEqual(persons[0].lastName, null);
  assertEqual(dq.length, 1);
  assertEqual(dq[0].header, 'Last Name');
  assertEqual(dq[0].row, 11);
});

test('normalizeSheet: nicht interpretierbare Zellen → Data-Quality-Log mit Sheet/Zeile/Header/Rohwert/Grund', () => {
  const row = fullRow({
    'we1.run1.passed': 'maybe',      // Passed unbekannt
    sprache: 'ES',                   // Sprache unbekannt
    profil: 'XYZ',                   // Profil unbekannt (Rohwert bleibt)
    'we2.run1.result': 250,          // Result ausserhalb
    'we2.run1.score': 12.5,          // Score nicht ganzzahlig
    'oe1.run1.date': '31.02.2024',   // Datum ungültig
  });
  const { persons, dq } = normalizeSheet(makeSheet('first', [row]), {});
  const p = persons[0];
  assertEqual(p.we[0].runs[0].passed, null);
  assertEqual(p.sprache, null);
  assertEqual(p.profil, 'XYZ');
  assertEqual(p.we[1].runs[0].result, null);
  assertEqual(p.we[1].runs[0].score, null);
  assertEqual(p.oe[0].runs[0].date, null);
  assertEqual(dq.length, 6);
  for (const e of dq) {
    assertEqual(e.sheet, CONFIG.sheets.first);
    assertEqual(e.row, 11);
    assert(typeof e.header === 'string' && e.header, 'Header fehlt');
    assert('raw' in e, 'Rohwert fehlt');
    assert(typeof e.reason === 'string' && e.reason, 'Grund fehlt');
    assert(typeof e.field === 'string' && e.field, 'Feldschlüssel fehlt');
  }
  const byHeader = Object.fromEntries(dq.map((e) => [e.header, e]));
  assertEqual(byHeader['WE1 RUN1 Passed'].raw, 'maybe');
  assertEqual(byHeader['Certificate Language'].raw, 'ES');
  assertEqual(byHeader['Certificate Program'].raw, 'XYZ');
  assertEqual(byHeader['WE2 RUN1 Result'].raw, 250);
  assertEqual(byHeader['WE2 RUN1 Score'].raw, 12.5);
  assertEqual(byHeader['OE1 RUN1 Date'].raw, '31.02.2024');
});

test('normalizeSheet: mündliche Prüfung ohne bestandene schriftliche Prüfung → DQ-Eintrag (Konsistenzregel)', () => {
  const { persons, dq } = normalizeSheet(makeSheet('first', [fullRow({ weAllPassed: 'no' })]), {});
  assertEqual(persons[0].weAllPassed, false);
  assertEqual(dq.length, 1);
  assertEqual(dq[0].header, 'WE All Passed');
  assertEqual(dq[0].field, 'weAllPassed');
  assertEqual(dq[0].raw, 'no');
  assert(/schriftlich/i.test(dq[0].reason), 'Grund nennt die Voraussetzung');
  assertEqual(normalizeSheet(makeSheet('first', [fullRow({ weAllPassed: '' })]), {}).dq.length, 1, 'leer ebenfalls');
  const noOral = { lastName: 'A', firstName: 'B', weAllPassed: 'no', ...runValues('we', { 1: [{ passed: 'no', date: '01.03.2024', score: 10, result: 0.3 }] }) };
  assertEqual(normalizeSheet(makeSheet('first', [noOral]), {}).dq, [], 'ohne mündliche Prüfung kein Eintrag');
  const unreadable = normalizeSheet(makeSheet('first', [fullRow({ weAllPassed: 'maybe' })]), {}).dq;
  assertEqual(unreadable.length, 1, 'nicht interpretierbarer Wert wird nur einmal gemeldet');
});

test('normalizeSheet: DQ-Header verwendet die im Sheet tatsächlich vorhandene Variante', () => {
  const row = fullRow({ 'we1.run1.passed': 'maybe' });
  const { dq } = normalizeSheet(makeSheet('issued', [row]), {});
  assertEqual(dq.length, 1);
  assertEqual(dq[0].header, 'WE1 RUN1 yes');
  assertEqual(dq[0].sheet, CONFIG.sheets.issued);
});

test('normalizeSheet: fehlender Pflicht-Header wirft hart, kein Fallback', () => {
  const sheet = makeSheet('first', [fullRow()]);
  sheet.headerRow = sheet.headerRow.map((h) => (h === 'Role' ? 'Funktion' : h));
  assertThrows(() => normalizeSheet(sheet, {}), (e) => e instanceof MissingHeaderError);
});

test('normalizeWorkbook: beide Sheets → eine Personenliste, DQ gesammelt, Meta ergänzt', () => {
  const first = makeSheet('first', [fullRow(), fullRow({ lastName: 'Zwei', 'we1.run1.passed': '?' })]);
  const issued = makeSheet('issued', [fullRow({ lastName: 'Drei', certStart: new Date(2024, 8, 1) })]);
  const comments = { [CONFIG.sheets.first]: { B12: 'VSS 01.01.2025: X' }, [CONFIG.sheets.issued]: { B11: 'VSM 1: X' } };
  const result = normalizeWorkbook({ sheets: [first, issued], comments, meta: { fileName: 'Reporting_KUBA.xlsx' } });
  assertEqual(result.persons.length, 3);
  assertEqual(result.persons.map((p) => p.source), ['first', 'first', 'issued']);
  assertEqual(result.persons[1].vss, true);
  assertEqual(result.persons[2].vsm, true);
  assertEqual(result.dq.length, 1);
  assertEqual(result.dq[0].sheet, CONFIG.sheets.first);
  assertEqual(result.dq[0].row, 12);
  assertEqual(result.meta.fileName, 'Reporting_KUBA.xlsx');
  assertEqual(result.meta.counts, { first: 2, issued: 1, persons: 3, dq: 1 });
});

test('normalizeWorkbook: unbekanntes Sheet wird abgewiesen', () => {
  const sheet = { ...makeSheet('first', [fullRow()]), source: 'other', sheetName: 'Irgendwas' };
  assertThrows(() => normalizeWorkbook({ sheets: [sheet], comments: {}, meta: {} }), (e) => /Irgendwas/.test(e.message));
});

test('normalizeWorkbook: Personen ohne Kommentare, wenn comments fehlt', () => {
  const result = normalizeWorkbook({ sheets: [makeSheet('first', [fullRow()])] });
  assertEqual(result.persons[0].vss, false);
  assertEqual(result.meta.counts.persons, 1);
});
