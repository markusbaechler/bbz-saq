// tests/workbookApi.test.js – reine Helfer des Schreibpfads (PROMPT-2 Paket E): Range-Adressen, Pfade, Zellwerte je Feld,
// Session-Ablauf als Request-Liste, Konfliktprüfung, Audit-Eintrag ohne Personendaten
import { test, assert, assertEqual } from './runner.js';
import { rangeAddress, workbookPaths, cellValueFor, writePlan, conflictOf, auditEntry, appendAuditJson } from '../datasource/workbookApi.js';

test('workbookApi.rangeAddress: Spaltenindex + Excel-Zeile → Adresse', () => {
  assertEqual([rangeAddress(0, 12), rangeAddress(25, 11), rangeAddress(26, 500), rangeAddress(183, 21)], ['A12', 'Z11', 'AA500', 'GB21']);
});

test('workbookApi.workbookPaths: Pfade für Item, Session und Range; Sheet-Name kodiert, Apostroph verdoppelt', () => {
  const p = workbookPaths('d1', 'i1', 'First Certification', 'GB21');
  assertEqual(p.item, '/drives/d1/items/i1');
  assertEqual(p.session, '/drives/d1/items/i1/workbook/createSession');
  assertEqual(p.close, '/drives/d1/items/i1/workbook/closeSession');
  assertEqual(p.range, "/drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='GB21')");
  assert(workbookPaths('d', 'i', "O'Brien", 'A1').range.includes("worksheets('O''Brien')"));
});

test('workbookApi.cellValueFor: Datentyp je Feld gemäss Schreibweise im Sheet', () => {
  assertEqual(cellValueFor('passed', true, { passedStyle: ['yes', 'no'] }), 'yes');
  assertEqual(cellValueFor('passed', false, { passedStyle: ['Yes', 'No'] }), 'No');
  assertEqual(cellValueFor('date', new Date(2026, 8, 6), { dateStyle: 'text' }), '06.09.2026');
  assertEqual(cellValueFor('date', new Date(2026, 8, 6), { dateStyle: 'serial' }), 46271);
  assertEqual(cellValueFor('result', 0.85, { resultStyle: 'fraction' }), 0.85);
  assertEqual(cellValueFor('result', 0.85, { resultStyle: 'percent' }), '85 %');
  assertEqual(cellValueFor('location', 'Bern', {}), 'Bern');
  assertEqual(cellValueFor('expert1', 'Prüfer Pia', {}), 'Prüfer Pia');
  assertEqual(cellValueFor('passed', null, {}), '');
});

test('workbookApi.writePlan: createSession → PATCH range → closeSession, Session-Id im Header', () => {
  const change = { sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', colIndex: 183, field: 'location', value: 'Bern', expected: 'Zürich', reason: 'Test' };
  const plan = writePlan(change, { driveId: 'd1', itemId: 'i1', sessionId: 's1' });
  assertEqual(plan.map((r) => [r.method, r.path]), [
    ['POST', '/drives/d1/items/i1/workbook/createSession'],
    ['PATCH', "/drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='GB21')"],
    ['POST', '/drives/d1/items/i1/workbook/closeSession'],
  ]);
  assertEqual(plan[0].body, { persistChanges: true });
  assertEqual(plan[1].body, { values: [['Bern']] });
  assertEqual(plan[1].headers, { 'workbook-session-id': 's1' });
  assertEqual(plan[2].headers, { 'workbook-session-id': 's1' });
  assertEqual(plan[0].headers, {}, 'createSession ohne Session-Header');
});

test('workbookApi.conflictOf: Datei geändert (eTag/lastModified) oder Zelle abweichend → Konflikt, sonst null', () => {
  const base = { expectedModified: '2026-09-06T10:00:00Z', actualModified: '2026-09-06T10:00:00Z', expectedEtag: 'e1', actualEtag: 'e1', expectedValue: 'Zürich', actualValue: 'Zürich' };
  assertEqual(conflictOf(base), null);
  assertEqual(conflictOf({ ...base, actualEtag: 'e2' }).kind, 'file');
  assertEqual(conflictOf({ ...base, actualModified: '2026-09-06T11:00:00Z' }).kind, 'file');
  assertEqual(conflictOf({ ...base, actualValue: 'Bern' }).kind, 'cell');
  assert(/neu laden/i.test(conflictOf({ ...base, actualEtag: 'e2' }).message));
  assertEqual(conflictOf({ ...base, expectedValue: null, actualValue: '' }), null, 'leer = leer');
  assertEqual(conflictOf({ ...base, expectedEtag: null, actualEtag: 'e9' }), null, 'ohne erwarteten eTag keine Dateiprüfung');
});

test('workbookApi.auditEntry / appendAuditJson: Eintrag ohne Kandidatennamen, Append auf leerem und bestehendem JSON', () => {
  const change = { sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'GB21', field: 'location', value: 'Bern', expected: 'Zürich', reason: 'Ort korrigiert', personName: 'Muster Anna' };
  const e = auditEntry(change, { username: 'konto@example.org' }, new Date(Date.UTC(2026, 8, 6, 12, 0, 0)));
  assertEqual(e, { at: '2026-09-06T12:00:00.000Z', user: 'konto@example.org', sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'GB21', old: 'Zürich', new: 'Bern', reason: 'Ort korrigiert', source: 'bbz-saq' });
  assert(!JSON.stringify(e).includes('Muster'), 'kein Kandidatenname im Audit');
  assertEqual(auditEntry(change, null).user, '');
  const first = appendAuditJson('', e);
  assertEqual(JSON.parse(first).length, 1);
  const second = appendAuditJson(first, { ...e, reason: 'zweiter' });
  assertEqual(JSON.parse(second).map((x) => x.reason), ['Ort korrigiert', 'zweiter']);
  assert(second.endsWith('\n'));
  let threw = false;
  try { appendAuditJson('{kaputt', e); } catch { threw = true; }
  assert(threw, 'ungültiges JSON wird nicht überschrieben');
});
