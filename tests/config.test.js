import { test, assert, assertEqual } from './runner.js';
import {
  CONFIG, PROFILES, PROFILE_ALIASES, LANGUAGES, PASSED_TRUE, PASSED_FALSE, EMPLOYER_ALIASES,
  VSS_REGEX, VSM_REGEX, HEADER_FIELDS, headerCandidates, requiredFieldKeys, partKey, runKey, DATE_RULES,
  LANGUAGE_ALIASES, PROFILE_LANGUAGE_HINTS, EXPERT_ALIASES,
} from '../config.js';

test('config: Sheet-Namen und Header-Zeile gemäss Spezifikation', () => {
  assertEqual(CONFIG.sheets, { first: 'First Certification', issued: 'Ausgestellte Zertifikate' });
  assertEqual(CONFIG.headerRow, 10);
  assertEqual(CONFIG.dataStartRow, 11);
  assertEqual(CONFIG.commentColumn, 'B');
  assertEqual(CONFIG.we, { parts: 6, runs: 3 });
  assertEqual(CONFIG.oe, { parts: 2, runs: 3 });
});

test('config: Datei-Referenz ohne hardcodierte Item-IDs', () => {
  assertEqual(CONFIG.sharepoint.siteHost, 'bbzsg.sharepoint.com');
  assertEqual(CONFIG.sharepoint.sitePath, '/sites/bbz-Zertifizierung');
  assertEqual(CONFIG.sharepoint.filePath, 'General/07_KUBA/Reporting_KUBA.xlsx');
  assert(!('itemId' in CONFIG.sharepoint) && !('driveId' in CONFIG.sharepoint), 'keine IDs in config');
  assertEqual(CONFIG.auth.scopes, ['Files.Read.All']);
});

test('config: Whitelists der Normalisierungstabelle', () => {
  assertEqual(PROFILES, ['PK', 'IK', 'CWMA', 'KMU', 'AFFL', 'CCoB']);
  assertEqual(PROFILE_ALIASES, { CCOB: 'CCoB', Affluent: 'AFFL', Affl: 'AFFL', AFF: 'AFFL', AF: 'AFFL', 'PK FRZ': 'PK' });
  assertEqual(LANGUAGES, ['DE', 'FR', 'IT', 'EN']);
  assertEqual(LANGUAGE_ALIASES, { D: 'DE', F: 'FR', I: 'IT', E: 'EN' });
  assertEqual(PROFILE_LANGUAGE_HINTS, { 'PK FRZ': 'FR' });
  assertEqual(PASSED_TRUE, ['yes', 'YES', 'Yes', 'PASSED', 'fulfilled', 'FULFILLED']);
  assertEqual(PASSED_FALSE, ['no', 'No', 'FAILED']);
  assertEqual(EMPLOYER_ALIASES['BEKB'], 'Berner Kantonalbank AG');
  assertEqual(EMPLOYER_ALIASES['Raiffeisen KB'], 'Raiffeisen');
  assertEqual(EMPLOYER_ALIASES['SZKB'], 'Schwyzer Kantonalbank (SZKB)');
  assertEqual(EMPLOYER_ALIASES['BKB'], 'Basler Kantonalbank');
  assertEqual(EMPLOYER_ALIASES['GKB'], 'Graubündner Kantonalbank');
  assertEqual(EMPLOYER_ALIASES['LUKB'], 'Luzerner Kantonalbank AG');
  assertEqual(EMPLOYER_ALIASES['TKB'], 'Thurgauer Kantonalbank');
  assertEqual(EMPLOYER_ALIASES['UKB'], 'Urner Kantonalbank (UKB)');
  assertEqual(EMPLOYER_ALIASES['Hypothekarbank Lenzburg'], 'Hypothekarbank Lenzburg AG');
  assertEqual(EMPLOYER_ALIASES['Zuger KB'], 'Zuger Kantonalbank');
  assertEqual(DATE_RULES, { minYear: 2000, maxYear: 2100, serialMin: 36526, serialMax: 60000 });
});

test('config: VSS/VSM-Regex erkennt ganze Wörter, case-insensitiv', () => {
  assert(VSS_REGEX.test('VSS 07.05.2026: Name'));
  assert(VSM_REGEX.test('VSM 8718 28.08./05.09.24: Name'));
  assert(VSS_REGEX.test('vss'));
  assert(!VSS_REGEX.test('VSSX'));
  assert(!VSM_REGEX.test('VSS 07.05.2026: Name'));
});

test('config: Schlüssel-Helfer für Teilprüfungen und Runs', () => {
  assertEqual(partKey('we', 3), 'we3.passed');
  assertEqual(partKey('oe', 1), 'oe1.passed');
  assertEqual(runKey('we', 3, 2, 'date'), 'we3.run2.date');
  assertEqual(runKey('oe', 2, 1, 'result'), 'oe2.run1.result');
});

test('config: Header-Kandidaten führen Sheet-Varianten (Passed | yes)', () => {
  assertEqual(headerCandidates('lastName'), ['Last Name']);
  assertEqual(headerCandidates('firstName'), ['First Name']);
  assertEqual(headerCandidates('role'), ['Role']);
  assertEqual(headerCandidates('employer'), ['Employer']);
  assertEqual(headerCandidates('profil'), ['Certificate Program']);
  assertEqual(headerCandidates('sprache'), ['Certificate Language']);
  assertEqual(headerCandidates('certStart'), ['Certificate Start Date']);
  assertEqual(headerCandidates('commLanguage'), ['Communication Language'], 'optional, für Sprach-Ableitung');
  assertEqual(headerCandidates('weAllPassed'), ['WE All Passed', 'WE All yes']);
  assertEqual(headerCandidates('oeAllPassed'), ['OE All Passed', 'OE All yes']);
  assertEqual(headerCandidates('we3.passed'), ['WE3 Passed', 'WE3 yes']);
  assertEqual(headerCandidates('oe2.passed'), ['OE2 Passed', 'OE2 yes']);
  assertEqual(headerCandidates('we3.run2.passed'), ['WE3 RUN2 Passed', 'WE3 RUN2 yes']);
  assertEqual(headerCandidates('we3.run2.date'), ['WE3 RUN2 Date']);
  assertEqual(headerCandidates('we3.run2.score'), ['WE3 RUN2 Score']);
  assertEqual(headerCandidates('we3.run2.result'), ['WE3 RUN2 Result']);
  assertEqual(headerCandidates('oe1.run3.passed'), ['OE1 RUN3 Passed', 'OE1 RUN3 yes']);
  assertEqual(headerCandidates('we6.run1.location'), ['WE6 RUN1 Location'], 'Ort optional (fehlt in Sheet 2)');
  assertEqual(headerCandidates('oe2.run3.location'), ['OE2 RUN3 Location']);
  assertEqual(headerCandidates('gibtEsNicht'), null);
});

test('config: Pflicht-Header je Sheet (certStart nur bei «issued»)', () => {
  const first = requiredFieldKeys('first');
  const issued = requiredFieldKeys('issued');
  // 7 Stammdaten (inkl. Birth Date, E2) + WE All + 6×(1 + 3×4) + OE All + 2×(1 + 3×4) = 7 + 1 + 78 + 1 + 26 = 113
  assertEqual(first.length, 113, 'Anzahl Pflicht-Header First Certification');
  assertEqual(issued.length, 114, 'Anzahl Pflicht-Header Ausgestellte Zertifikate');
  assert(!first.includes('certStart'));
  assert(issued.includes('certStart'));
  assert(first.includes('birthDate') && issued.includes('birthDate'), 'Birth Date ist Pflicht in beiden Sheets');
  for (const k of ['lastName', 'firstName', 'role', 'employer', 'profil', 'sprache', 'weAllPassed', 'oeAllPassed',
    'we1.passed', 'we6.passed', 'oe1.passed', 'oe2.passed', 'we6.run3.result', 'oe2.run3.date']) {
    assert(first.includes(k), 'Pflicht-Header fehlt: ' + k);
  }
  assert(!first.includes('certNumber') && !first.includes('certEnd') && !first.includes('commLanguage'), 'optionale Felder nicht Pflicht');
  assert(!first.includes('we6.run1.location') && !issued.includes('we6.run1.location'), 'Location nie Pflicht');
  assert(!issued.includes('certNumber') && !issued.includes('certEnd'), 'optionale Felder nicht Pflicht');
});

test('config: HEADER_FIELDS ist vollständig und eindeutig', () => {
  const keys = HEADER_FIELDS.map((f) => f.key);
  assertEqual(new Set(keys).size, keys.length, 'Schlüssel eindeutig');
  const all = HEADER_FIELDS.flatMap((f) => f.candidates);
  assertEqual(new Set(all).size, all.length, 'Header-Namen eindeutig über alle Felder');
  assert(keys.includes('certNumber') && keys.includes('certEnd'), 'optionale Sheet-2-Felder vorhanden');
});

test('config.features: Schreibpfad (Phase 2) produktiv freigeschaltet (Auftraggeber, 06.09.2026); Abschalten über write: false', () => {
  assertEqual(CONFIG.features, { write: true });
});

test('config: Expertenfelder je OE-Run (optional, bestätigte Header «OE{p} RUN{r} Expert 1/2») und CONFIG.experts.from (PROMPT-2 D.3)', () => {
  assertEqual(headerCandidates(runKey('oe', 1, 1, 'expert1')), ['OE1 RUN1 Expert 1']);
  assertEqual(headerCandidates(runKey('oe', 2, 3, 'expert2')), ['OE2 RUN3 Expert 2']);
  assert(!requiredFieldKeys('first').includes(runKey('oe', 1, 1, 'expert1')) && !requiredFieldKeys('issued').includes(runKey('oe', 1, 1, 'expert2')), 'optional: ältere Dateien ohne Spalten laden weiterhin');
  assertEqual(CONFIG.experts, { from: '2018-01-01' });
  assertEqual(EXPERT_ALIASES, {});
  assertEqual(headerCandidates(runKey('we', 1, 1, 'expert1')), null, 'keine Expertenfelder für schriftliche Teile');
});

test('config: Schreibpfad – writeScopes für inkrementelle Zustimmung, Audit-Datei neben der Excel (Paket E)', () => {
  assertEqual(CONFIG.auth.scopes, ['Files.Read.All'], 'Lesepfad behält Files.Read.All');
  assertEqual(CONFIG.auth.writeScopes, ['Files.ReadWrite.All']);
  assertEqual(CONFIG.sharepoint.auditPath, 'General/07_KUBA/Reporting_KUBA.changes.json');
});
