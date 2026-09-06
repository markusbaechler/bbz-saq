import { test, assert, assertEqual, assertClose, assertThrows } from './runner.js';
import { CONFIG } from '../config.js';
import {
  parsePassed, parseLanguage, parseProfile, parseEmployer, parseResult, parseScore, parseDate, parseBirthDate, parseVssVsm,
  normalizeNamePart, personKeyOf, statusOf, combineStatus, dqImpact,
  resolveHeaders, HeaderError, MissingHeaderError, DuplicateHeaderError,
  normalizeSheet, normalizeWorkbook, mergeVorgang, parseExpert,
} from '../store.js';
import { DEFAULT_FILTER, eligible, filterPersons, exclusionReason, groupByPerson } from '../metrics.js';
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

test('parsePassed: Vergleich case-insensitiv (NO, Passed, Fulfilled)', () => {
  assertEqual(parsePassed('NO'), { value: false, reason: null });
  assertEqual(parsePassed('Passed'), { value: true, reason: null });
  assertEqual(parsePassed('Fulfilled '), { value: true, reason: null });
  assertEqual(parsePassed('failed'), { value: false, reason: null });
});

test('parsePassed: unbekannte Werte → null + Grund (Tippfehler, Booleans, Zahlen)', () => {
  for (const v of ['yyes', 'ys', 'maybe', 'x', true, false, 1, 0]) {
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
  assertEqual(parseLanguage('D'), { value: 'DE', reason: null }, 'eindeutiges Kürzel');
  assertEqual(parseLanguage(' f '), { value: 'FR', reason: null });
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
  assertEqual(parseProfile('AF'), { value: 'AFFL', reason: null }, 'Auftraggeber: AF ist Affluent');
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

test('parseResult: Zahl 0–1 direkt (1 = 100 %), Text mit Prozentzeichen direkt, leer → null', () => {
  assertEqual(parseResult(0.85), { value: 0.85, reason: null });
  assertEqual(parseResult(0), { value: 0, reason: null });
  assertEqual(parseResult(1), { value: 1, reason: null }, 'Grenzfall 1 = 100 % (Anteil), kein Hinweis');
  assertEqual(parseResult('89.00%'), { value: 0.89, reason: null });
  assertEqual(parseResult(' 89 % '), { value: 0.89, reason: null });
  assertEqual(parseResult('89,5%'), { value: 0.895, reason: null });
  assertEqual(parseResult('100%'), { value: 1, reason: null });
  assertEqual(parseResult('0.89'), { value: 0.89, reason: null });
  assertEqual(parseResult('66%%'), { value: 0.66, reason: null }, 'doppeltes Prozentzeichen');
  assertEqual(parseResult(''), { value: null, reason: null });
  assertEqual(parseResult(null), { value: null, reason: null });
});

test('parseResult: Zahl > 1 ohne Prozentzeichen → /100 mit Hinweis (Umdeutung wird geloggt, Befund 11)', () => {
  for (const [raw, value] of [[85, 0.85], [100, 1], ['71.59', 0.7159], ['85', 0.85], [1.5, 0.015]]) {
    const r = parseResult(raw);
    assertClose(r.value, value, 1e-12, String(raw));
    assertEqual(r.level, 'hinweis', String(raw));
    assert(/Prozentwert interpretiert/.test(r.reason), r.reason);
    assert(r.reason.includes(String(raw).trim()), 'Rohwert im Grund: ' + r.reason);
  }
});

test('parseResult: ausserhalb Bereich oder nicht interpretierbar → null + Grund', () => {
  for (const v of [101, -0.1, 250, NaN, '101', 'abc', '110%', '-5%', 'Luzern', 'missed', true]) {
    const r = parseResult(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
  }
});

test('parseScore: ganze Zahl ≥ 0; sonst null + Grund auf Stufe «nicht ausgewertet» (E6 offen)', () => {
  assertEqual(parseScore(12), { value: 12, reason: null });
  assertEqual(parseScore(0), { value: 0, reason: null });
  assertEqual(parseScore(''), { value: null, reason: null });
  assertEqual(parseScore(null), { value: null, reason: null });
  for (const v of [12.5, -1, '12', 'abc', NaN, true]) {
    const r = parseScore(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
    assertEqual(r.level, 'nicht-ausgewertet', String(v));
    assert(/nicht ausgewertet/.test(r.reason) && /Result ist massgebend/.test(r.reason), r.reason);
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
  assertEqual(parseDate('19.04.2018 / 09:00h'), { value: new Date(2018, 3, 19, 9, 0), reason: null }, 'Suffix h');
  assertEqual(parseDate('13.6.18 / 9.00 Uhr'), { value: new Date(2018, 5, 13, 9, 0), reason: null }, 'Suffix Uhr');
  assertEqual(parseDate('4.6.18 / 15:00 Uhr'), { value: new Date(2018, 5, 4, 15, 0), reason: null });
  assertEqual(parseDate('28,04,2023'), { value: new Date(2023, 3, 28), reason: null }, 'Kommas als Trenner');
  assertEqual(parseDate(''), { value: null, reason: null });
  assertEqual(parseDate(null), { value: null, reason: null });
});

test('parseDate: ungültige Kalenderdaten, ISO-Text und Zahlen → null + Grund', () => {
  for (const v of ['31.02.2024', '00.01.2024', '01.13.2024', '2024-09-05', '05/09/2024', 2020, 12.2021, 87, 'Mo 05.09.', '05.09.2024 / 25.00', 'HFBF 2016', 'Sept/Okt 2017']) {
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
      1: [{ passed: 'no', date: new Date(2024, 2, 1), score: 40, result: 0.55 }, { passed: 'yes', date: '15.04.24', score: 61, result: '82.50%' }],
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
  assertEqual(p.we[0].runs[0], { n: 1, passed: false, date: new Date(2024, 2, 1), score: 40, result: 0.55, location: null, taken: true, planned: false, experts: [] });
  assertEqual(p.we[0].runs[1], { n: 2, passed: true, date: new Date(2024, 3, 15), score: 61, result: 0.825, location: null, taken: true, planned: false, experts: [] });
  assertEqual(p.we[0].runs[2], { n: 3, passed: null, date: null, score: null, result: null, location: null, taken: false, planned: false, experts: [] });
  assertEqual(p.we[1].runs[0].result, 0.9);
  assertEqual(p.we[2].passed, null);
  assertEqual(p.oe[0].runs[0], { n: 1, passed: false, date: new Date(2024, 4, 2, 9, 30), score: 3, result: 0.4, location: null, taken: true, planned: false, experts: [] });
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

test('normalizeSheet: absolviert = Passed-Wert vorhanden; nur Datum oder nur Result/Score zählt nicht', () => {
  const row = { lastName: 'A', firstName: 'B', ...runValues('we', { 1: [{ date: new Date(2024, 2, 1) }], 2: [{ result: 0.7, score: 0 }], 3: [{ passed: 'yes' }] }) };
  const { persons } = normalizeSheet(makeSheet('first', [row]), {}, { today: new Date(2026, 8, 5) });
  const p = persons[0];
  assertEqual([p.we[0].runs[0].taken, p.we[1].runs[0].taken, p.we[2].runs[0].taken], [false, false, true]);
  assertEqual(p.attemptsTotal, 1);
  assertEqual(p.hasWeDate, false, 'absolvierter Run ohne Datum');
  assertEqual(p.refDate, null, 'nur geplante/ausstehende Daten ergeben kein Referenzdatum');
});

test('normalizeSheet: Hinweise – Datum vergangen ohne Passed, Passed ohne Datum, Passed mit Zukunftsdatum, geplant ohne Eintrag', () => {
  const today = new Date(2026, 8, 5);
  const row = fullRow({
    ...runValues('we', { 3: [{ date: new Date(2026, 7, 1) }] }),
    ...runValues('we', { 4: [{ passed: 'yes', result: 0.8 }] }),
    ...runValues('we', { 5: [{ passed: 'yes', date: new Date(2026, 10, 1) }] }),
    ...runValues('we', { 6: [{ date: new Date(2027, 1, 1), score: 0, result: 0 }] }),
  });
  const { persons, dq } = normalizeSheet(makeSheet('first', [row]), {}, { today });
  assertEqual(dq.filter((e) => e.level === 'fehler'), []);
  assertEqual(dq.filter((e) => e.level === 'hinweis').map((e) => e.header).sort(), ['WE3 RUN1 Passed', 'WE4 RUN1 Date', 'WE5 RUN1 Date']);
  assertEqual(persons[0].we[5].runs[0].taken, false, 'geplanter Run');
  assertEqual(persons[0].we[4].runs[0].taken, true);
  assertEqual(persons[0].we[2].runs[0].taken, false, 'vergangenes Datum ohne Passed ist nicht absolviert');
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

test('normalizeSheet: Zeile mit Daten aber ohne Namen → keine Person, aber DQ-Fehler', () => {
  const sheet = makeSheet('first', [{ profil: 'PK' }]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(persons.length, 0);
  assertEqual(dq.length, 1);
  assertEqual(dq[0].level, 'fehler');
  assertEqual(dq[0].header, 'Last Name');
  assertEqual(dq[0].row, 11);
  assert(dq[0].reason.includes('Certificate Program'), 'Grund nennt die gefüllten Spalten: ' + dq[0].reason);
});

test('normalizeSheet: Zeile nur mit Inhalt in nicht gemappten Spalten gilt als leer', () => {
  const sheet = makeSheet('first', [{ Nr: 17 }, { Bemerkung: 'x' }]);
  assertEqual(normalizeSheet(sheet, {}), { persons: [], dq: [], headers: { birthDate: 'Birth Date', experts: [] } });
});

test('normalizeSheet: «Name fehlt» nennt auch nicht gemappte Spalten mit Inhalt', () => {
  const sheet = makeSheet('first', [{ Nr: 17, profil: 'PK', Bemerkung: 'x' }]);
  const { persons, dq } = normalizeSheet(sheet, {});
  assertEqual(persons.length, 0);
  assertEqual(dq.length, 1);
  assert(dq[0].reason.includes('Nr') && dq[0].reason.includes('Bemerkung'), dq[0].reason);
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
  assertEqual(dq.filter((e) => e.level === 'fehler').length, 5);
  assertEqual(dq.filter((e) => e.level === 'nicht-ausgewertet').map((e) => e.header), ['WE2 RUN1 Score'], 'Score: nicht ausgewertet statt Fehler (E6)');
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

test('normalizeSheet: mündliche Prüfung ohne bestandene schriftliche Prüfung → DQ-Hinweis (Konsistenzregel)', () => {
  const { persons, dq } = normalizeSheet(makeSheet('first', [fullRow({ weAllPassed: 'no' })]), {});
  assertEqual(persons[0].weAllPassed, false);
  assertEqual(persons[0].weAllDerived, false);
  assertEqual(dq.length, 1);
  assertEqual(dq[0].level, 'hinweis');
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
  assertEqual(result.meta.counts, {
    first: 2, issued: 1, zeilen: 3, vorgaenge: 3, personen: 3, duplikate: 0, profilKonflikte: 0, mehrereProfile: 0,
    bestanden: 3, nichtBestanden: 0, offen: 0, passiv: 0, nichtErfasst: 0, vollstaendigOhneGesamtergebnis: 0, teileAusserhalbVorgabe: 0, passerelleMoeglich: 0, schluesselOhneGeburtsdatum: 3,
    dq: 1, fehler: 1, hinweise: 0, nichtAusgewertet: 0,
    wirkungUnsichtbar: 0, wirkungKennzahl: 1, wirkungKeine: 0,
  });
  assertEqual(result.meta.personKey.complete, true);
  assertEqual(result.meta.personKey.birthDateHeaders, { first: 'Birth Date', issued: 'Birth Date' });
});

test('normalizeWorkbook: unbekanntes Sheet wird abgewiesen', () => {
  const sheet = { ...makeSheet('first', [fullRow()]), source: 'other', sheetName: 'Irgendwas' };
  assertThrows(() => normalizeWorkbook({ sheets: [sheet], comments: {}, meta: {} }), (e) => /Irgendwas/.test(e.message));
});

test('normalizeWorkbook: Personen ohne Kommentare, wenn comments fehlt', () => {
  const result = normalizeWorkbook({ sheets: [makeSheet('first', [fullRow()])] });
  assertEqual(result.persons[0].vss, false);
  assertEqual(result.meta.counts.zeilen, 1);
});

test('parseDate: Datum ohne Jahr und dreistelliges Jahr → spezifischer Grund', () => {
  for (const v of ['27.04. / 09:00', '11.04. / 13:30', '07.05.']) {
    const r = parseDate(v);
    assertEqual(r.value, null, v);
    assert(/ohne Jahr/.test(r.reason), v + ': ' + r.reason);
  }
  for (const v of ['03.12.024', '03.02.207', '23.9.021']) {
    const r = parseDate(v);
    assertEqual(r.value, null, v);
    assert(/dreistellig/.test(r.reason), v + ': ' + r.reason);
  }
});

test('parseDate: Excel-Serienzahl ohne Datumsformat → Datum mit Hinweis', () => {
  const r = parseDate(44125);
  assertEqual(r.value, new Date(2020, 9, 21));
  assertEqual(r.level, 'hinweis');
  assert(/Serienzahl/.test(r.reason), r.reason);
  assertEqual(parseDate(36526).value, new Date(2000, 0, 1));
  assertEqual(parseDate(36525).value, null, 'unter serialMin');
  assertEqual(parseDate(60001).value, null, 'über serialMax');
});

test('parseDate: Jahr ausserhalb 2000–2100 → Fehler (auch bei Date-Objekten)', () => {
  const r = parseDate(new Date(1900, 0, 1));
  assertEqual(r.value, null);
  assert(/Jahr/.test(r.reason), r.reason);
  assertEqual(parseDate('01.01.1999').value, null);
  assertEqual(parseDate('01.01.2000').value, new Date(2000, 0, 1));
});

test('parse*: Fehler haben level «fehler», Hinweise level «hinweis», ok kein level', () => {
  assertEqual(parsePassed('maybe').level, 'fehler');
  assertEqual(parseDate('x').level, 'fehler');
  assertEqual(parseDate(44125).level, 'hinweis');
  assertEqual(parseDate('01.01.2024').level, undefined);
  assertEqual(parseResult('abc').level, 'fehler');
});

test('normalizeSheet: Konsistenzregel nur bei absolvierter OE (geplante OE löst nichts aus)', () => {
  const planned = fullRow({ weAllPassed: '', 'oe1.passed': '', oeAllPassed: '', ...runValues('oe', { 1: [{ passed: '', date: new Date(2027, 0, 1), score: 0, result: 0 }, { passed: '', date: '', score: '', result: '' }] }) });
  const { dq } = normalizeSheet(makeSheet('first', [planned]), {}, { today: new Date(2026, 8, 5) });
  assertEqual(dq, []);
});

test('normalizeSheet: Sheet 2 – WE All yes leer bei Zertifikat → schriftlich als bestanden übernommen + Hinweis', () => {
  const { persons, dq } = normalizeSheet(makeSheet('issued', [fullRow({ weAllPassed: '', certStart: '01.07.2024' })]), {});
  assertEqual(persons[0].weAllPassed, true);
  assertEqual(persons[0].weAllDerived, true);
  assertEqual(dq.length, 1);
  assertEqual([dq[0].level, dq[0].header], ['hinweis', 'WE All yes']);
  assert(/Zertifikat/.test(dq[0].reason), dq[0].reason);
  const no = normalizeSheet(makeSheet('issued', [fullRow({ weAllPassed: 'no', certStart: '01.07.2024' })]), {});
  assertEqual([no.persons[0].weAllPassed, no.persons[0].weAllDerived, no.dq[0].level], [false, false, 'hinweis']);
});

test('normalizeWorkbook: today wird durchgereicht (geplante Runs)', () => {
  const row = fullRow({ ...runValues('we', { 3: [{ date: new Date(2026, 7, 1) }] }) });
  const late = normalizeWorkbook({ sheets: [makeSheet('first', [row])] }, { today: new Date(2026, 8, 5) });
  const early = normalizeWorkbook({ sheets: [makeSheet('first', [row])] }, { today: new Date(2026, 6, 1) });
  assertEqual(late.meta.counts.hinweise, 1, 'vergangen ohne Passed');
  assertEqual(early.meta.counts.hinweise, 0, 'noch geplant');
});

test('normalizeSheet: Sprache leer → aus «Communication Language» übernommen (Hinweis)', () => {
  const { persons, dq } = normalizeSheet(makeSheet('issued', [fullRow({ sprache: '', commLanguage: 'fr', certStart: '01.07.2024' })]), {});
  assertEqual(persons[0].sprache, 'FR');
  assertEqual(persons[0].spracheDerived, true);
  assertEqual(dq.length, 1);
  assertEqual([dq[0].level, dq[0].header], ['hinweis', 'Certificate Language']);
  assert(/Communication Language/.test(dq[0].reason), dq[0].reason);
  const given = normalizeSheet(makeSheet('issued', [fullRow({ sprache: 'DE', commLanguage: 'fr', certStart: '01.07.2024' })]), {});
  assertEqual([given.persons[0].sprache, given.persons[0].spracheDerived, given.dq.length], ['DE', false, 0], 'vorhandene Sprache hat Vorrang');
  const none = normalizeSheet(makeSheet('issued', [fullRow({ sprache: '', commLanguage: '', certStart: '01.07.2024' })]), {});
  assertEqual([none.persons[0].sprache, none.dq.length], [null, 0], 'ohne beides bleibt null ohne Eintrag');
  const odd = normalizeSheet(makeSheet('issued', [fullRow({ sprache: '', commLanguage: 'Deutsch', certStart: '01.07.2024' })]), {});
  assertEqual(odd.persons[0].sprache, null);
  assertEqual([odd.dq[0].level, odd.dq[0].header], ['hinweis', 'Communication Language'], 'nicht deutbare Kommunikationssprache ist nur ein Hinweis');
});

test('normalizeSheet: «PK FRZ» → Profil PK und Sprache FR (Hinweis), Sprache aus Zelle hat Vorrang', () => {
  const { persons, dq } = normalizeSheet(makeSheet('first', [fullRow({ profil: 'PK FRZ', sprache: '', commLanguage: 'de' })]), {});
  assertEqual([persons[0].profil, persons[0].sprache, persons[0].spracheDerived], ['PK', 'FR', true], 'Programmbezeichnung vor Kommunikationssprache');
  assertEqual(dq.length, 1);
  assert(/PK FRZ/.test(dq[0].reason), dq[0].reason);
  const given = normalizeSheet(makeSheet('first', [fullRow({ profil: 'PK FRZ', sprache: 'DE' })]), {});
  assertEqual([given.persons[0].profil, given.persons[0].sprache, given.dq.length], ['PK', 'DE', 0]);
});

test('normalizeSheet: Ort je Run und Kennzeichen «geplant» (Datum in der Zukunft ohne Passed)', () => {
  const today = new Date(2026, 8, 5);
  const row = fullRow({
    ...runValues('we', { 1: [{ location: ' Bern ' }], 3: [{ date: new Date(2026, 9, 15, 9, 0), location: 'Zürich' }] }),
    ...runValues('oe', { 2: [{ date: new Date(2026, 10, 5, 13, 30), location: 'Luzern', score: 0, result: 0 }] }),
  });
  const { persons, dq } = normalizeSheet(makeSheet('first', [row]), {}, { today });
  const p = persons[0];
  assertEqual([p.we[0].runs[0].location, p.we[0].runs[0].planned], ['Bern', false], 'absolvierter Run mit Ort');
  assertEqual([p.we[2].runs[0].location, p.we[2].runs[0].planned, p.we[2].runs[0].taken], ['Zürich', true, false]);
  assertEqual([p.oe[1].runs[0].location, p.oe[1].runs[0].planned], ['Luzern', true]);
  assertEqual(p.we[1].runs[0].planned, false, 'ohne Datum nicht geplant');
  assertEqual(dq, [], 'geplante Termine sind keine Auffälligkeit');
});

test('normalizeSheet: Sheet 2 ohne «WE6 RUN1 Location» → Ort null, kein Fehler', () => {
  const { persons, dq } = normalizeSheet(makeSheet('issued', [fullRow({ certStart: '01.07.2024', ...runValues('we', { 6: [{ passed: 'yes', date: new Date(2024, 1, 1) }] }) })]), {});
  assertEqual(persons[0].we[5].runs[0].location, null);
  assertEqual(dq, []);
});

// ---------------------------------------------------------------------------
// P1 – Personenschlüssel (E2), Status (E4), Duplikate über Sheets (E1)
// ---------------------------------------------------------------------------

test('parseBirthDate: Jahrgänge 1920–2010 als Text, Date oder Serienzahl (Hinweis); Jahreszahl allein → Fehler', () => {
  assertEqual(parseBirthDate('15.03.1985'), { value: new Date(1985, 2, 15), reason: null });
  assertEqual(parseBirthDate(new Date(1985, 2, 15)), { value: new Date(1985, 2, 15), reason: null });
  const serial = parseBirthDate(31121);
  assertEqual(serial.value, new Date(1985, 2, 15));
  assertEqual(serial.level, 'hinweis');
  for (const v of [1985, '15.03.2015', '15.03.1899', 'abc', new Date(1900, 0, 1)]) {
    const r = parseBirthDate(v);
    assertEqual(r.value, null, String(v));
    assert(r.reason, 'Grund fehlt für ' + String(v));
  }
  assertEqual(parseBirthDate(''), { value: null, reason: null });
  assertEqual(parseDate('15.03.1985').value, null, 'Prüfungsdaten behalten ihre eigenen Jahresgrenzen');
});

test('normalizeNamePart / personKeyOf: Akzente, Bindestrich, Gross-/Kleinschreibung, ß; Geburtsdatum unterscheidet, Employer nicht', () => {
  assertEqual(normalizeNamePart(' Müller-Meier '), 'muller meier');
  assertEqual(normalizeNamePart('MULLER   MEIER'), 'muller meier');
  assertEqual(normalizeNamePart('Strauß'), 'strauss');
  assertEqual(normalizeNamePart('Çelik Öztürk'), 'celik ozturk');
  assertEqual(normalizeNamePart(null), '');
  const key = personKeyOf({ lastName: 'Müller-Meier', firstName: 'Anna', birthDate: new Date(1985, 2, 15) });
  assertEqual(key, 'muller meier|anna|1985-03-15');
  assertEqual(personKeyOf({ lastName: 'muller meier', firstName: 'ANNA', birthDate: new Date(1985, 2, 15) }), key);
  assertEqual(personKeyOf({ lastName: 'Muster', firstName: 'Anna', birthDate: null }), 'muster|anna|', 'ohne Geburtsdatum bleibt der dritte Teil leer');
  assert(personKeyOf({ lastName: 'Muster', firstName: 'Anna', birthDate: new Date(1985, 2, 15) })
    !== personKeyOf({ lastName: 'Muster', firstName: 'Anna', birthDate: new Date(1986, 2, 15) }), 'anderes Geburtsdatum = andere Person');
});

test('normalizeSheet: «Birth Date» ist Pflicht-Header → Schlüssel mit Datum (full); Zelle leer oder unlesbar → nur Name (name-only)', () => {
  const r = normalizeSheet(makeSheet('first', [fullRow({ birthDate: '15.03.1985' }), fullRow({ lastName: 'Zwei' })]), {});
  assertEqual(r.headers.birthDate, 'Birth Date');
  assertEqual(r.persons[0].birthDate, new Date(1985, 2, 15));
  assertEqual([r.persons[0].personKey, r.persons[0].personKeyLevel], ['muster|anna|1985-03-15', 'full']);
  assertEqual([r.persons[1].personKey, r.persons[1].personKeyLevel], ['zwei|anna|', 'name-only'], 'Zelle leer → name-only');
  const without = makeSheet('first', [fullRow()]);
  without.headerRow = without.headerRow.map((h) => (h === 'Birth Date' ? 'Geburtstag' : h));
  assertThrows(() => normalizeSheet(without, {}), (e) => e instanceof MissingHeaderError && /Birth Date/.test(e.message), 'fehlender Pflicht-Header = harter Fehler');
  const bad = normalizeSheet(makeSheet('first', [fullRow({ birthDate: 1985 })]), {});
  assertEqual([bad.dq[0].level, bad.dq[0].header, bad.dq[0].raw], ['fehler', 'Birth Date', 1985]);
  assertEqual(bad.persons[0].personKeyLevel, 'name-only');
});

test('normalizeSheet: Status (E4) – yes/no/leer/unlesbar → bestanden/nicht bestanden/offen/nicht erfasst, je Teil und je Vorgang', () => {
  const rows = [
    fullRow(),
    fullRow({ weAllPassed: 'no' }),
    fullRow({ oeAllPassed: '' }),
    fullRow({ oeAllPassed: 'maybe' }),
    fullRow({ weAllPassed: '', oeAllPassed: 'no' }),
    fullRow({ weAllPassed: 'maybe', oeAllPassed: '' }),
  ];
  const { persons } = normalizeSheet(makeSheet('first', rows), {});
  assertEqual(persons.map((p) => [p.weStatus, p.oeStatus, p.status]), [
    ['bestanden', 'bestanden', 'bestanden'],
    ['nicht bestanden', 'bestanden', 'nicht bestanden'],
    ['bestanden', 'offen', 'offen'],
    ['bestanden', 'nicht erfasst', 'nicht erfasst'],
    ['offen', 'nicht bestanden', 'nicht bestanden'],
    ['nicht erfasst', 'offen', 'nicht erfasst'],
  ]);
  assertEqual(combineStatus('offen', 'offen'), 'offen');
  assertEqual(statusOf(null, '  '), 'offen');
  assertEqual(statusOf(null, 'x'), 'nicht erfasst');
  assertEqual(statusOf(true, 'yes'), 'bestanden');
  assertEqual(statusOf(false, 'no'), 'nicht bestanden');
});

test('normalizeSheet: Sheet 2 – leeres OE All gilt als bestanden (Hinweis), «no» bleibt; WE All leer auch ohne OE-Runs abgeleitet', () => {
  const blank = normalizeSheet(makeSheet('issued', [fullRow({ oeAllPassed: '', certStart: '01.07.2024' })]), {});
  assertEqual([blank.persons[0].oeAllPassed, blank.persons[0].oeAllDerived, blank.persons[0].oeStatus, blank.persons[0].status], [true, true, 'bestanden', 'bestanden']);
  assertEqual(blank.dq.map((e) => [e.level, e.header]), [['hinweis', 'OE All yes']]);
  const no = normalizeSheet(makeSheet('issued', [fullRow({ oeAllPassed: 'no', certStart: '01.07.2024' })]), {});
  assertEqual([no.persons[0].oeStatus, no.persons[0].status, no.dq.length], ['nicht bestanden', 'nicht bestanden', 0]);
  const summaryOnly = { lastName: 'A', firstName: 'B', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 10, result: 0.9 }] }) };
  const issued = normalizeSheet(makeSheet('issued', [{ ...summaryOnly, certStart: '01.07.2024' }]), {});
  assertEqual([issued.persons[0].weAllDerived, issued.persons[0].oeAllDerived, issued.persons[0].status], [true, true, 'bestanden'], 'Zertifikat ausgestellt → bestanden, auch ohne OE-Runs');
  assertEqual(issued.dq.length, 2);
  const first = normalizeSheet(makeSheet('first', [summaryOnly]), {});
  assertEqual([first.persons[0].status, first.dq.length], ['offen', 0], 'Sheet 1: leer bleibt offen, keine Ableitung');
});

function bothSheets(firstRows, issuedRows, extraFields = []) {
  return { sheets: [makeSheet('first', firstRows, { extraFields }), makeSheet('issued', issuedRows, { extraFields })], comments: {}, meta: {} };
}

test('normalizeWorkbook: dieselbe Person in beiden Sheets mit gleichem Profil → ein Vorgang, Duplikat im DQ-Log (E1)', () => {
  const r = normalizeWorkbook(bothSheets([fullRow({ birthDate: '15.03.1985' })], [fullRow({ birthDate: '15.03.1985', certStart: '01.07.2024', certNumber: 'Z-1' })]));
  assertEqual([r.meta.counts.zeilen, r.meta.counts.vorgaenge, r.meta.counts.personen, r.meta.counts.duplikate], [2, 1, 1, 1]);
  const kept = r.persons.find((p) => !p.duplicateOf);
  const dup = r.persons.find((p) => p.duplicateOf);
  assertEqual(kept.source, 'issued', 'Gleichstand bei absolvierten Runs → Zeile aus «Ausgestellte Zertifikate» bleibt');
  assertEqual(dup.duplicateOf, { sheet: CONFIG.sheets.issued, row: 11 });
  assertEqual(kept.duplicates, [{ sheet: CONFIG.sheets.first, row: 11 }]);
  assertEqual([kept.issued, kept.certNumber, kept.status], [true, 'Z-1', 'bestanden']);
  const hint = r.dq.find((e) => e.field === 'duplikat');
  assertEqual([hint.level, hint.sheet, hint.row, hint.header, hint.raw], ['hinweis', CONFIG.sheets.first, 11, 'Last Name', null]);
  assert(/Zeile 11/.test(hint.reason) && /nicht doppelt/.test(hint.reason), hint.reason);
  assertEqual(r.meta.personKey.complete, true);
  assertEqual(r.meta.personKey.birthDateHeaders, { first: 'Birth Date', issued: 'Birth Date' });
  assertEqual(r.meta.counts.bestanden, 1);
});

test('normalizeWorkbook: Zusammenführung füllt Lücken (Gesamtergebnis, Runs, Zertifikat), überschreibt nie', () => {
  // Sheet 1: alle Prüfungsdaten, OE All leer (offen). Sheet 2: Zusammenfassung mit Zertifikat und OE All yes, andere Bank.
  const first = fullRow({ birthDate: '15.03.1985', oeAllPassed: '' });
  const issued = {
    lastName: 'Muster', firstName: 'Anna', birthDate: '15.03.1985', profil: 'CCoB', employer: 'Andere Bank AG', weAllPassed: 'yes', oeAllPassed: 'yes',
    certStart: '01.07.2024', certNumber: 'Z-2', ...runValues('oe', { 1: [null, { passed: 'PASSED', date: '20.06.2024 / 10:00' }] }),
  };
  const r = normalizeWorkbook(bothSheets([first], [issued]));
  const kept = r.persons.find((p) => !p.duplicateOf);
  assertEqual(kept.source, 'first', 'Zeile mit mehr absolvierten Runs bleibt');
  assertEqual([kept.oeAllPassed, kept.oeStatus, kept.status], [true, 'bestanden', 'bestanden'], 'Gesamtergebnis aus Sheet 2 übernommen');
  assertEqual([kept.issued, kept.certNumber, kept.certStart], [true, 'Z-2', new Date(2024, 6, 1)]);
  assertEqual(kept.employerCanon, 'Berner Kantonalbank AG', 'Bankwechsel: Employer der behaltenen Zeile bleibt, dieselbe Person (E2)');
  assertEqual(kept.attemptsTotal, 5);
  assertEqual(kept.refDate, new Date(2024, 5, 20, 10, 0));
  assertEqual(kept.we[0].runs[0].result, 0.55, 'vorhandene Werte bleiben');
  assertEqual([r.meta.counts.vorgaenge, r.meta.counts.personen, r.meta.counts.duplikate, r.meta.counts.offen, r.meta.counts.bestanden], [1, 1, 1, 0, 1]);
});

test('normalizeWorkbook: dieselbe Person mit anderem Profil → zwei Vorgänge, eine Person, Profil-Abfolge nach erstem Prüfungsdatum (E3)', () => {
  const ik = fullRow({ birthDate: '15.03.1985', profil: 'IK' });
  const cwma = fullRow({
    birthDate: '15.03.1985', profil: 'CWMA', employer: 'Andere Bank AG',
    ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2026', score: 50, result: 0.9 }, { passed: '', date: '', score: '', result: '' }], 2: [{ passed: 'yes', date: '01.03.2026', score: 70, result: 0.9 }] }),
    ...runValues('oe', { 1: [{ passed: 'yes', date: '01.05.2026', score: 5, result: 0.8 }, { passed: '', date: '', score: '', result: '' }] }),
  });
  const r = normalizeWorkbook(bothSheets([cwma], [{ ...ik, certStart: '01.06.2024' }]));
  assertEqual([r.meta.counts.vorgaenge, r.meta.counts.personen, r.meta.counts.duplikate, r.meta.counts.mehrereProfile], [2, 1, 0, 1]);
  assertEqual(r.dq.filter((e) => e.field === 'duplikat' || e.field === 'profilKonflikt'), []);
  const people = groupByPerson(r.persons);
  assertEqual(people.length, 1);
  assertEqual(people[0].profiles, ['IK', 'CWMA'], 'zeitliche Reihenfolge, nicht Zeilenreihenfolge');
});

test('normalizeWorkbook: gleiches Profil, aber widersprüchliche Prüfungsdaten → zwei Vorgänge + Hinweis, keine Zusammenführung', () => {
  const a = fullRow({ birthDate: '15.03.1985' });
  const b = fullRow({ birthDate: '15.03.1985', ...runValues('we', { 1: [{ passed: 'no', date: '01.03.2020', score: 40, result: 0.5 }] }) });
  const r = normalizeWorkbook(bothSheets([a, b], []));
  assertEqual([r.meta.counts.vorgaenge, r.meta.counts.personen, r.meta.counts.duplikate, r.meta.counts.profilKonflikte], [2, 1, 0, 1]);
  const hint = r.dq.find((e) => e.field === 'profilKonflikt');
  assertEqual([hint.level, hint.sheet, hint.row, hint.header, hint.raw], ['hinweis', CONFIG.sheets.first, 12, 'Certificate Program', 'CCoB']);
  assert(/WE1 RUN1 Date/.test(hint.reason) && /Zeile 11/.test(hint.reason), hint.reason);
  assertEqual(r.persons.filter((p) => p.duplicateOf), []);
});

test('normalizeWorkbook: gleicher Name, anderes Geburtsdatum → zwei Personen; ohne Geburtsdatum-Zelle entscheidet der Name', () => {
  const r = normalizeWorkbook(bothSheets([fullRow({ birthDate: '15.03.1985' })], [fullRow({ birthDate: '16.03.1985', certStart: '01.07.2024' })]));
  assertEqual([r.meta.counts.vorgaenge, r.meta.counts.personen, r.meta.counts.duplikate, r.meta.counts.schluesselOhneGeburtsdatum], [2, 2, 0, 0]);
  const nameOnly = normalizeWorkbook({ sheets: [makeSheet('first', [fullRow()]), makeSheet('issued', [fullRow({ certStart: '01.07.2024' })])] });
  assertEqual([nameOnly.meta.counts.vorgaenge, nameOnly.meta.counts.personen, nameOnly.meta.counts.duplikate, nameOnly.meta.counts.schluesselOhneGeburtsdatum], [1, 1, 1, 1]);
  assertEqual(nameOnly.meta.personKey.complete, true, 'Header vorhanden, Zellen leer');
});

test('normalizeWorkbook: Duplikate fliessen nicht in Kennzahlen (eligible, filterPersons), Ausschlussgrund benannt', () => {
  const r = normalizeWorkbook(bothSheets([fullRow({ birthDate: '15.03.1985' })], [fullRow({ birthDate: '15.03.1985', certStart: '01.07.2024' })]));
  assertEqual(r.persons.length, 2);
  assertEqual(eligible(r.persons).length, 1);
  assertEqual(filterPersons(r.persons, DEFAULT_FILTER, { eligibleOnly: false }).length, 1);
  assertEqual(filterPersons(r.persons, { ...DEFAULT_FILTER, onlyIssued: true }).length, 1, 'zusammengeführter Vorgang gilt als ausgestellt');
  const dup = r.persons.find((p) => p.duplicateOf);
  assert(exclusionReason(dup).startsWith('Duplikat'), exclusionReason(dup));
  assertEqual(exclusionReason(r.persons.find((p) => !p.duplicateOf)), null);
});

// ---------------------------------------------------------------------------
// P3 – Wirkungsklasse je DQ-Eintrag (Befund 7)
// ---------------------------------------------------------------------------

test('normalizeWorkbook: Wirkungsklasse – unsichtbar / kennzahl / keine je nach Feld, Stufe und Zeilenzustand', () => {
  const rows = [
    { profil: 'PK' },                                                                              // kein Name → unsichtbar
    fullRow({ 'we2.run1.score': 12.5 }),                                                           // Score → keine
    fullRow({ lastName: 'Umdeutung', 'we2.run1.result': 85 }),                                     // Result > 1 → keine (Interpretation)
    fullRow({ lastName: 'Serie', 'we2.run1.date': 44125 }),                                        // Serienzahl → keine
    fullRow({ lastName: 'Sprache', sprache: 'ES' }),                                               // Sprache → kennzahl
    fullRow({ lastName: 'Datum', 'we1.run1.date': '31.02.2024' }),                                 // Datumsfehler, Zeile bleibt sichtbar (WE2 datiert) → kennzahl
    { lastName: 'Nur', firstName: 'Datumsfehler', ...runValues('we', { 1: [{ passed: 'yes', date: 'kaputt', score: 1, result: 0.5 }] }) }, // einziger WE-Run → unsichtbar
    { lastName: 'Ohne', firstName: 'Datum', ...runValues('we', { 1: [{ passed: 'yes', score: 1, result: 0.5 }] }) },                 // Passed ohne Datum → unsichtbar
  ];
  const r = normalizeWorkbook({ sheets: [makeSheet('first', rows)] });
  const by = (row, field) => r.dq.find((e) => e.row === row && e.field === field);
  assertEqual(by(11, 'lastName').impact, 'unsichtbar');
  assertEqual(by(12, 'we2.run1.score').impact, 'keine');
  assertEqual(by(13, 'we2.run1.result').impact, 'keine');
  assertEqual(by(14, 'we2.run1.date').impact, 'keine');
  assertEqual(by(15, 'sprache').impact, 'kennzahl');
  assertEqual(by(16, 'we1.run1.date').impact, 'kennzahl', 'Zeile bleibt kennzahlrelevant');
  assertEqual(by(17, 'we1.run1.date').impact, 'unsichtbar', 'einziger schriftlicher Run ohne gültiges Datum');
  assertEqual(by(18, 'we1.run1.date').impact, 'unsichtbar', 'Passed ohne Datum');
  assert(r.dq.every((e) => ['unsichtbar', 'kennzahl', 'keine'].includes(e.impact)), 'jeder Eintrag hat eine Wirkungsklasse');
  assertEqual([r.meta.counts.wirkungUnsichtbar, r.meta.counts.wirkungKeine], [3, 3]);
  assertEqual(r.meta.counts.wirkungKennzahl, r.dq.length - 6);
});

test('normalizeWorkbook: Duplikat-Hinweise gelten als «verändert Kennzahl», auch wenn die Zeile unsichtbar ist', () => {
  const r = normalizeWorkbook(bothSheets([fullRow({ birthDate: '15.03.1985' })], [fullRow({ birthDate: '15.03.1985', certStart: '01.07.2024' })]));
  assertEqual(r.dq.find((e) => e.field === 'duplikat').impact, 'kennzahl');
  assertEqual(dqImpact({ level: 'hinweis', field: 'we1.run1.date', reason: 'x' }, { duplicateOf: { sheet: 'x', row: 1 }, hasWeDate: false }), 'kennzahl', 'Daten des Duplikats leben im behaltenen Vorgang weiter');
  assertEqual(dqImpact({ level: 'fehler', field: 'we1.run1.date', reason: 'x' }, null), 'unsichtbar', 'ohne Zeile: unsichtbar');
  assertEqual(dqImpact({ level: 'fehler', field: 'oe1.run1.date', reason: 'x' }, { hasWeDate: false, duplicateOf: null }), 'kennzahl', 'mündliche Daten machen nie unsichtbar');
});

// ---------------------------------------------------------------------------
// Entscheide 05.09.2026: passiv, Teilprüfungen je Profil
// ---------------------------------------------------------------------------

test('normalizeSheet: passiv = offen, letzte Prüfung > 365 Tage vor dem Stichtag, kein Termin (Stichtag options.today)', () => {
  const today = new Date(2026, 8, 5);
  const rows = [
    { lastName: 'Alt', firstName: 'A', profil: 'PK', ...runValues('we', { 1: [{ passed: 'no', date: '10.01.2024', score: 1, result: 0.4 }] }) },                       // > 365 Tage, kein Termin → passiv
    { lastName: 'Neu', firstName: 'N', profil: 'PK', ...runValues('we', { 1: [{ passed: 'yes', date: '10.03.2026', score: 1, result: 0.8 }] }) },                      // frisch → nicht passiv
    { lastName: 'Termin', firstName: 'T', profil: 'PK', ...runValues('we', { 1: [{ passed: 'no', date: '10.01.2024', score: 1, result: 0.4 }, { date: new Date(2026, 10, 1) }] }) }, // Termin geplant → nicht passiv
    { lastName: 'Nie', firstName: 'X', profil: 'PK', weAllPassed: '' },                                                                                                  // ohne Prüfung → nie passiv
    { lastName: 'Fertig', firstName: 'F', profil: 'PK', weAllPassed: 'no', ...runValues('we', { 1: [{ passed: 'no', date: '10.01.2024', score: 1, result: 0.4 }] }) },   // nicht bestanden → nicht passiv
  ];
  const { persons } = normalizeSheet(makeSheet('first', rows), {}, { today });
  assertEqual(persons.map((p) => [p.lastName, p.status, p.passiv]), [['Alt', 'offen', true], ['Neu', 'offen', false], ['Termin', 'offen', false], ['Nie', 'offen', false], ['Fertig', 'nicht bestanden', false]]);
  const early = normalizeSheet(makeSheet('first', rows), {}, { today: new Date(2024, 6, 1) });
  assertEqual(early.persons[0].passiv, false, 'am früheren Stichtag noch nicht passiv');
  const wb = normalizeWorkbook({ sheets: [makeSheet('first', rows)] }, { today });
  assertEqual([wb.meta.counts.offen, wb.meta.counts.passiv], [4, 1]);
});

test('normalizeWorkbook: Hinweis, wenn alle Teilprüfungen der Vorgabe bestanden sind, aber das Gesamtergebnis leer ist (Entscheid 3)', () => {
  const done = (name, extra = {}) => ({ lastName: name, firstName: 'D', profil: 'AFFL', weAllPassed: 'yes', oeAllPassed: 'yes',
    ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 1, result: 0.8 }], 2: [{ passed: 'yes', date: '01.03.2024', score: 1, result: 0.7 }] }),
    ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024', score: 1, result: 0.9 }] }), ...extra });
  const rows = ['A', 'B', 'C', 'D', 'E'].map((n) => done(n));                    // AFFL: Vorgabe WE1, WE2, OE1 (config.PROFILE_PARTS)
  rows.push(done('Vergessen', { weAllPassed: '' }));                             // alle WE-Teile bestanden, WE All leer → Hinweis
  rows.push(done('Unterwegs', { weAllPassed: '', 'we2.run1.passed': 'no' }));    // WE2 nicht bestanden → kein Hinweis
  rows.push(done('Mund', { oeAllPassed: '' }));                                  // OE1 bestanden, OE All leer → Hinweis
  const wb = normalizeWorkbook({ sheets: [makeSheet('first', rows)] }, { today: new Date(2026, 8, 5) });
  const hints = wb.dq.filter((e) => /Gesamtergebnis leer/.test(e.reason));
  assertEqual(hints.map((e) => [e.row, e.header, e.level, e.impact]), [[16, 'WE All Passed', 'hinweis', 'kennzahl'], [18, 'OE All Passed', 'hinweis', 'kennzahl']]);
  assert(/AFFL \(WE1, WE2\)/.test(hints[0].reason) && /OE1/.test(hints[1].reason), hints[0].reason);
  assertEqual([wb.meta.counts.vollstaendigOhneGesamtergebnis, wb.meta.counts.teileAusserhalbVorgabe], [2, 0]);
  assertEqual(wb.persons[5].status, 'offen', 'Status bleibt offen (E4), keine Ableitung');
});

test('normalizeWorkbook: Vorgabe gilt unabhängig von der Gruppengrösse; absolvierte Runs ausserhalb der Vorgabe → Hinweis ohne Kennzahlwirkung', () => {
  // PK: Vorgabe WE1, OE1. Ein einzelner Vorgang genügt (keine Mindestzahl wie bei der Datenableitung).
  const rows = [
    { lastName: 'Einzeln', firstName: 'E', profil: 'PK', weAllPassed: '', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 1, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024', score: 1, result: 0.9 }] }) },
    { lastName: 'Zuviel', firstName: 'Z', profil: 'PK', weAllPassed: 'yes', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 1, result: 0.8 }], 4: [{ passed: 'no', date: '02.03.2024', score: 1, result: 0.3 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024', score: 1, result: 0.9 }], 2: [{ passed: 'yes', date: '02.06.2024', score: 1, result: 0.9 }] }) },
  ];
  const wb = normalizeWorkbook({ sheets: [makeSheet('first', rows)] }, { today: new Date(2026, 8, 5) });
  const voll = wb.dq.filter((e) => /Gesamtergebnis leer/.test(e.reason));
  assertEqual(voll.map((e) => [e.row, e.header]), [[11, 'WE All Passed']], 'WE1 bestanden = Vorgabe PK vollständig');
  const outside = wb.dq.filter((e) => /ausserhalb|Vorgabe für PK umfasst/.test(e.reason));
  assertEqual(outside.map((e) => [e.row, e.header, e.field, e.level, e.impact]), [[12, 'WE4 Passed', 'we4.passed', 'hinweis', 'keine'], [12, 'OE2 Passed', 'oe2.passed', 'hinweis', 'keine']]);
  assert(/nur WE1/.test(outside[0].reason) && /nur OE1/.test(outside[1].reason), outside[0].reason);
  assertEqual([wb.meta.counts.vollstaendigOhneGesamtergebnis, wb.meta.counts.teileAusserhalbVorgabe, wb.meta.counts.passerelleMoeglich], [1, 1, 0]);
});

test('normalizeWorkbook: Passerelle möglich, wenn dieselbe Person das Vorgängerprofil bestanden hat (PK→IK, AFFL→CWMA, KMU→CCoB)', () => {
  const base = (o) => ({ lastName: 'Weiter', firstName: 'W', birthDate: '01.01.1990', weAllPassed: '', oeAllPassed: '',
    ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2026', score: 1, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: '', date: '', score: '', result: '' }] }), ...o });
  const rows = [
    base({ profil: 'PK', weAllPassed: 'yes', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2024', score: 1, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024', score: 1, result: 0.9 }] }) }), // PK bestanden
    base({ profil: 'IK' }),                                                                       // IK offen, Vorgänger PK bestanden → Passerelle möglich
    base({ lastName: 'Direkt', firstName: 'D', birthDate: '02.02.1992', profil: 'IK' }),         // IK ohne PK → nicht
    base({ lastName: 'Falsch', firstName: 'F', birthDate: '03.03.1993', profil: 'CWMA' }),       // CWMA ohne AFFL → nicht
  ];
  const wb = normalizeWorkbook({ sheets: [makeSheet('first', rows)] }, { today: new Date(2026, 8, 5) });
  assertEqual(wb.meta.counts.passerelleMoeglich, 1);
  assertEqual(wb.persons.map((p) => p.status), ['bestanden', 'offen', 'offen', 'offen']);
});

test('normalizeSheet: certEnd (Certificate End Date) wird gelesen, in Sheet 1 ohne Header null; mergeVorgang füllt certEnd auf (Paket C)', () => {
  const issued = makeSheet('issued', [{ lastName: 'Muster', firstName: 'Anna', profil: 'PK', certStart: '01.07.2024', certEnd: '30.06.2029', weAllPassed: 'yes', oeAllPassed: 'yes' }]);
  const p = normalizeSheet(issued).persons[0];
  assertEqual(p.certEnd, new Date(2029, 5, 30));
  const first = makeSheet('first', [{ lastName: 'Muster', firstName: 'Anna', profil: 'PK', weAllPassed: 'yes', oeAllPassed: 'yes' }]);
  const q = normalizeSheet(first).persons[0];
  assertEqual(q.certEnd, null, 'Sheet 1 hat keinen Header Certificate End Date');
  mergeVorgang(q, p);
  assertEqual(q.certEnd, new Date(2029, 5, 30), 'Lücke aus dem Duplikat aufgefüllt');
});

// ---------------------------------------------------------------------------
// Paket D: Experten je OE-Run (bestätigtes Mapping 06.09.2026: «OE{p} RUN{r} Expert 1/2», optional, experts.from 2018-01-01)
// ---------------------------------------------------------------------------

test('parseExpert: Text → { name, key }; Mehrfach-Leerzeichen; leer → null ohne Hinweis; Zahl/Datum → Fehler', () => {
  assertEqual(parseExpert('  Prüfer   Pia '), { value: { name: 'Prüfer Pia', key: 'prufer pia' }, reason: null });
  assertEqual(parseExpert('').value, null);
  assertEqual(parseExpert(null).reason, null);
  const n = parseExpert(42);
  assert(n.value === null && /nicht lesbar/.test(n.reason) && n.level === 'fehler', JSON.stringify(n));
  assert(parseExpert(new Date(2024, 0, 1)).value === null);
  assert(parseExpert('12.5').value === null, 'Zahl als Text');
});

test('normalizeSheet: Experten je OE-Run mit Rolle; Hinweise «fehlt» (ab experts.from), «ohne Run» (weder Datum noch Ergebnis), «1 = 2»; ohne Spalten leere Liste', () => {
  const rows = [
    { lastName: 'Muster', firstName: 'Anna', weAllPassed: 'yes', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2025', result: 0.8 }] }),
      ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] }) },
    { lastName: 'Beispiel', firstName: 'Ben', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'no', date: '01.07.2025', result: 0.4, expert1: 'Prüfer Pia' }] }) },
    { lastName: 'Fehlt', firstName: 'Fritz', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.08.2025', result: 0.7 }] }) },
    { lastName: 'Alt', firstName: 'Anton', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2017', result: 0.7 }] }) },
    { lastName: 'Ohne', firstName: 'Run', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: '', date: '', expert1: 'Beisitz Bruno' }] }) },
    { lastName: 'Gleich', firstName: 'Gerda', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.09.2025', result: 0.8, expert1: 'Experte Emil', expert2: 'experte  emil' }] }) },
    { lastName: 'Termin', firstName: 'Tina', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: '', date: '01.01.2025', expert1: 'Beisitz Bruno' }] }) },
    { lastName: 'Undatiert', firstName: 'Uwe', weAllPassed: 'yes', ...runValues('oe', { 1: [{ passed: 'yes', date: '', result: 0.6, expert1: 'Prüfer Pia' }] }) },
  ];
  const { persons, dq } = normalizeSheet(makeSheet('first', rows, { experts: true }), {}, { today: new Date(2026, 8, 6) });
  assertEqual(persons[0].oe[0].runs[0].experts, [{ role: 1, name: 'Prüfer Pia', key: 'prufer pia' }, { role: 2, name: 'Experte Emil', key: 'experte emil' }]);
  assertEqual(persons[1].oe[0].runs[0].experts, [{ role: 1, name: 'Prüfer Pia', key: 'prufer pia' }]);
  assertEqual(persons[0].we[0].runs[0].experts, [], 'schriftliche Runs ohne Experten');
  assertEqual(persons[0].oe[0].runs[1].experts, [], 'nicht absolvierter Run: leere Liste');
  const reasons = dq.filter((e) => /^Experte/.test(e.reason)).map((e) => [e.row - 11, e.level, e.impact, e.reason.slice(0, 20)]);
  assertEqual(reasons, [
    [2, 'hinweis', 'keine', 'Experte fehlt – abso'],
    [4, 'hinweis', 'keine', 'Experte ohne Run – F'],
    [5, 'hinweis', 'keine', 'Experte 1 = Experte '],
  ], 'Alt Anton (2017, vor experts.from), Termin Tina (Datum ohne Ergebnis) und Undatiert Uwe ohne Experten-Hinweis');
  assertEqual(persons[7].oe[0].runs[0].experts.length, 1, 'undatierter Run mit Ergebnis behält den Experten');
  const plain = normalizeSheet(makeSheet('first', [rows[2]], { experts: false }));
  assertEqual(plain.persons[0].oe[0].runs[0].experts, []);
  assert(!plain.dq.some((e) => /^Experte/.test(e.reason)), 'ohne Spalten keine Experten-Hinweise');
});

test('normalizeWorkbook: meta.experts nennt Spalten und Startdatum; mergeVorgang füllt Experten aus dem Duplikat auf, nie überschreiben', () => {
  const row = { lastName: 'Muster', firstName: 'Anna', profil: 'PK', weAllPassed: 'yes', oeAllPassed: 'yes', ...runValues('we', { 1: [{ passed: 'yes', date: '01.03.2025', result: 0.8 }] }) };
  const first = makeSheet('first', [{ ...row, ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9 }] }) }], { experts: true });
  const issued = makeSheet('issued', [{ ...row, certStart: '01.07.2025', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2025', result: 0.9, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] }) }], { experts: true });
  const { persons, meta } = normalizeWorkbook({ sheets: [first, issued] });
  assertEqual(meta.experts.columns, true);
  assertEqual(meta.experts.from, new Date(2018, 0, 1));
  assert(meta.experts.headers.includes('OE1 RUN1 Expert 1'));
  const kept = persons.find((p) => !p.duplicateOf);
  assertEqual(kept.oe[0].runs[0].experts.map((x) => x.name), ['Prüfer Pia', 'Experte Emil'], 'Lücke aus dem Duplikat aufgefüllt');
  const none = normalizeWorkbook({ sheets: [makeSheet('first', [row])] });
  assertEqual(none.meta.experts.columns, false);
});
