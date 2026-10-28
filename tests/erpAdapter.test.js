// Tests der Datenquelle bbz-ERP (datasource/erpAdapter.js). Synthetische Daten – erfundene Namen und Banken.
import { test, assert, assertEqual } from './runner.js';
import { CONFIG, HEADER_FIELDS } from '../config.js';
import { normalizeWorkbook, LEVEL } from '../store.js';
import { buildSnapshot } from '../snapshot.js';
import {
  rowsToWorkbook, createErpAdapter, decodeIsoDate, isDateField, ErpError, ErpConfigError, ErpSchemaError, ERP_SHEET, ERP_FILE_NAME,
} from '../datasource/erpAdapter.js';
import { datasourceKind } from '../datasource/index.js';
import { makeSheet, runValues, d } from './fixtures.js';
import { erpRowsFromSheets } from './erpExport.js';

async function rejects(promise, check) {
  try {
    await promise;
  } catch (e) {
    if (typeof check === 'function' && !check(e)) throw new Error('falscher Fehler: ' + (e && e.message));
    return e;
  }
  throw new Error('Fehler erwartet, keiner geworfen');
}

// Vorgang im Format von GET /saq/export/kuba: alle Felder leer, dann Grundwerte und Überschreibungen
function erpRow(values = {}) {
  const leer = Object.fromEntries(HEADER_FIELDS.map((f) => [f.key, '']));
  return {
    ...leer, lastName: 'Muster', firstName: 'Anna', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE',
    birthDate: '1985-03-15', erpFallId: 'f-1', ...values,
  };
}

const ERP_CONFIG = { ...CONFIG, erp: { baseUrl: 'https://erp.example.test/', exportPath: '/saq/export/kuba', scopes: ['api://erp-test/access_as_user'] } };

// fetch-Attrappe: antwortet der Reihe nach mit den angegebenen Antworten ({ status, body } oder Error), zeichnet Aufrufe auf
function fakeFetch(responses) {
  const calls = [];
  const queue = responses.slice();
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => {
        if (next.body === undefined) throw new SyntaxError('Unexpected end of JSON input');
        return next.body;
      },
    };
  };
  return { fetch, calls };
}

function tokenSpy() {
  const calls = [];
  return { calls, getToken: async (options) => { calls.push(options); return 'tok-' + calls.length; } };
}

test('erpAdapter.decodeIsoDate: «JJJJ-MM-TT» → lokales Date; kein gültiger Kalendertag oder anderes Format bleibt roh', () => {
  assertEqual(decodeIsoDate('2024-03-01'), d('2024-03-01'));
  assertEqual(decodeIsoDate('1985-03-15'), d('1985-03-15'));
  for (const raw of ['2026-02-30', '2024-13-01', '01.03.2024', '2024-03-01T09:00', ' 2024-03-01', '', null, 45000]) {
    assertEqual(decodeIsoDate(raw), raw, String(raw));
  }
  assert(['birthDate', 'certStart', 'certEnd', 'we1.run1.date', 'oe2.run3.date'].every(isDateField), 'Datumsfelder');
  assert(!['lastName', 'we1.run1.result', 'we1.run1.score', 'oe1.run1.expert1', 'weAllPassed'].some(isDateField), 'keine Datumsfelder');
});

test('erpAdapter.rowsToWorkbook: Kopfzeile aus HEADER_FIELDS, Sheet nach Zertifikat, Zeile = Position im Export, Datum dekodiert', () => {
  const rows = [
    erpRow({ lastName: 'Erst', 'we1.run1.passed': 'yes', 'we1.run1.date': '2024-03-01', 'we1.run1.result': 0.85, 'we1.run1.score': 50 }),
    erpRow({ lastName: 'Zertifikat', certStart: '2024-07-01', certEnd: '2027-07-01', certNumber: 'Z-1' }),
    erpRow({ lastName: 'Dritt' }),
  ];
  const wb = rowsToWorkbook(rows);
  assertEqual(wb.sheets.map((s) => [s.source, s.sheetName, s.rows.map((r) => r.row)]), [['first', ERP_SHEET, [1, 3]], ['issued', ERP_SHEET, [2]]]);
  assertEqual(wb.sheets[0].headerRow, HEADER_FIELDS.map((f) => f.candidates[0]));
  assertEqual(wb.comments, {});
  assertEqual(wb.meta, { sheetNames: [ERP_SHEET] });
  const header = wb.sheets[0].headerRow;
  const cell = (sheet, i, key) => sheet.rows[i].cells[header.indexOf(HEADER_FIELDS.find((f) => f.key === key).candidates[0])];
  assertEqual(cell(wb.sheets[0], 0, 'we1.run1.date'), d('2024-03-01'));
  assertEqual(cell(wb.sheets[0], 0, 'birthDate'), d('1985-03-15'));
  assertEqual(cell(wb.sheets[0], 0, 'we1.run1.result'), 0.85, 'Resultat roh (Anteil)');
  assertEqual(cell(wb.sheets[0], 0, 'we1.run1.passed'), 'yes', 'Passed roh');
  assertEqual(cell(wb.sheets[1], 0, 'certStart'), d('2024-07-01'));
  assertEqual(cell(wb.sheets[1], 0, 'certNumber'), 'Z-1');
});

test('erpAdapter: derselbe Inhalt über ERP-Export und Excel ergibt dieselben Vorgänge und Kennzahlen (store.js unverändert)', () => {
  const today = d('2026-09-06');
  const pk = { lastName: 'Muster', firstName: 'Anna', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE', birthDate: d('1985-03-15'),
    weAllPassed: 'yes', oeAllPassed: 'yes', 'we1.passed': 'yes', 'oe1.passed': 'yes',
    ...runValues('we', { 1: [{ passed: 'yes', date: d('2024-03-01'), score: 50, result: 0.85 }] }),
    ...runValues('oe', { 1: [{ passed: 'yes', date: d('2024-06-01'), score: 5, result: 0.9, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] }) };
  const sheets = [
    makeSheet('first', [
      pk,
      // offen: WE1 nicht bestanden, Wiederholung geplant; Passed «no» bei Resultat 78 % → Hinweis (A6)
      { ...pk, lastName: 'Plan', firstName: 'Petra', birthDate: d('1996-06-06'), weAllPassed: '', oeAllPassed: '', 'we1.passed': '', 'oe1.passed': '',
        ...runValues('we', { 1: [{ passed: 'no', date: d('2026-01-10'), score: 20, result: 0.78 }, { passed: '', date: d('2026-10-01'), location: 'Bern' }] }),
        ...runValues('oe', { 1: [{ passed: '', date: '', score: '', result: '', expert1: '', expert2: '' }] }) },
      // mündlich nicht bestanden, ohne Geburtsdatum, unlesbarer Score
      { ...pk, lastName: 'Datumlos', firstName: 'Otto', birthDate: '', oeAllPassed: 'no', 'oe1.passed': 'no',
        ...runValues('we', { 1: [{ passed: 'yes', date: d('2025-05-01'), score: 'x', result: 0.8 }] }),
        ...runValues('oe', { 1: [{ passed: 'no', date: d('2025-08-01'), score: 2, result: 0.5, expert1: 'Experte Emil', expert2: '' }] }) },
    ], { experts: true }),
    makeSheet('issued', [
      { ...pk, certStart: d('2024-07-01'), certNumber: 'Z-1' }, // Duplikat von Muster Anna (E1)
      { ...pk, lastName: 'Zertifikat', firstName: 'Zoe', profil: 'AFFL', birthDate: d('1994-04-04'), certStart: d('2024-07-01'), certNumber: 'Z-2', weAllPassed: '', oeAllPassed: '' },
    ], { experts: true }),
  ];
  const excel = normalizeWorkbook({ sheets, comments: {}, meta: {} }, { today });
  const erp = normalizeWorkbook(rowsToWorkbook(erpRowsFromSheets(sheets)), { today });
  // Fundstelle (Sheet, Zeile) und Header-Varianten unterscheiden sich naturgemäss; alles andere muss gleich sein
  const ohneFundstelle = (p) => ({ ...p, sheetName: null, row: null, weAllHeader: null, oeAllHeader: null, duplicateOf: !!p.duplicateOf, duplicates: p.duplicates.length });
  const sortiert = (list) => list.map(ohneFundstelle).sort((a, b) => (a.lastName + a.profil + a.source).localeCompare(b.lastName + b.profil + b.source));
  assertEqual(sortiert(erp.persons), sortiert(excel.persons));
  const dq = (list) => list.map((e) => [e.level, e.impact, e.field, e.reason.replace(/«[^»]*» Zeile \d+/, 'Fundstelle')].join('|')).sort();
  assertEqual(dq(erp.dq), dq(excel.dq));
  assert(erp.dq.length >= 5, 'Log nicht leer: ' + erp.dq.length);
  const snapshot = (r) => {
    const s = buildSnapshot({ persons: r.persons, meta: { ...r.meta, fileName: 'synth', lastModified: null }, today });
    return { zaehler: s.zaehler, kennzahlen: s.kennzahlen, jeProfil: s.jeProfil, jeJahr: s.jeJahr };
  };
  assertEqual(snapshot(erp), snapshot(excel));
  assertEqual([erp.meta.counts.first, erp.meta.counts.issued, erp.meta.counts.duplikate], [3, 2, 1]);
});

test('erpAdapter: Data-Quality-Log bleibt wirksam – unlesbarer Wert mit Sheet «bbz-ERP», Zeile = Position im Export, Header-Name', () => {
  const rows = [
    erpRow({ weAllPassed: 'yes', 'we1.passed': 'yes', 'we1.run1.passed': 'yes', 'we1.run1.date': '2024-03-01', 'we1.run1.result': 0.8 }),
    erpRow({ lastName: 'Beispiel', firstName: 'Ben', erpFallId: 'f-2', 'we1.run1.passed': 'maybe', 'we1.run1.date': '2026-02-30', 'we1.run1.result': 'abc', profil: 'XYZ' }),
  ];
  const { dq, persons } = normalizeWorkbook(rowsToWorkbook(rows), { today: d('2026-09-06') });
  const zeile2 = dq.filter((e) => e.row === 2 && e.level === LEVEL.FEHLER);
  assertEqual(zeile2.map((e) => [e.sheet, e.header, e.raw]).sort(), [
    [ERP_SHEET, 'Certificate Program', 'XYZ'],
    [ERP_SHEET, 'WE1 RUN1 Date', '2026-02-30'],
    [ERP_SHEET, 'WE1 RUN1 Passed', 'maybe'],
    [ERP_SHEET, 'WE1 RUN1 Result', 'abc'],
  ]);
  assert(zeile2.find((e) => e.field === 'we1.run1.date').reason.startsWith('Datum nicht interpretierbar'), 'Grund Datum');
  assertEqual(dq.filter((e) => e.row === 1).length, 0, 'saubere Zeile ohne Eintrag');
  assertEqual(persons.length, 2, 'beide Vorgänge bleiben erhalten');
});

test('erpAdapter.rowsToWorkbook: fehlendes Pflichtfeld → ErpSchemaError, kein Fallback; fehlendes optionales Feld → Spalte entfällt', () => {
  const ohne = (row, ...keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
  let e = null;
  try { rowsToWorkbook([erpRow(), ohne(erpRow(), 'we1.run1.score', 'certStart')]); } catch (err) { e = err; }
  assert(e instanceof ErpSchemaError && e instanceof ErpError, 'ErpSchemaError erwartet');
  assert(e.message.includes('we1.run1.score') && e.message.includes('certStart'), e.message);
  for (const bad of [null, {}, 'text', [null], [[1]]]) {
    let err = null;
    try { rowsToWorkbook(bad); } catch (x) { err = x; }
    assert(err instanceof ErpSchemaError, 'kein Vorgangs-Array: ' + JSON.stringify(bad));
  }
  const expertKeys = HEADER_FIELDS.filter((f) => /\.expert[12]$/.test(f.key)).map((f) => f.key);
  const wb = rowsToWorkbook([ohne(erpRow(), ...expertKeys, 'commLanguage')]);
  assert(!wb.sheets[0].headerRow.includes('OE1 RUN1 Expert 1') && !wb.sheets[0].headerRow.includes('Communication Language'), 'optionale Spalten entfallen');
  const { meta } = normalizeWorkbook(wb, { today: d('2026-09-06') });
  assertEqual(meta.experts.columns, false, 'ohne Expertenfelder wie eine Datei ohne Expertenspalten');
  assertEqual(rowsToWorkbook([]).sheets.map((s) => s.rows.length), [0, 0], 'leerer Export');
});

test('erpAdapter.load: GET {baseUrl}{exportPath} mit Bearer-Token für CONFIG.erp.scopes; meta mit Quelle «erp», nichts gespeichert', async () => {
  const { fetch, calls } = fakeFetch([{ status: 200, body: [erpRow(), erpRow({ lastName: 'Zertifikat', certStart: '2024-07-01' })] }]);
  const token = tokenSpy();
  const loadedAt = new Date(2026, 9, 28, 10, 0);
  const adapter = createErpAdapter({ getToken: token.getToken, fetch, config: ERP_CONFIG, now: () => loadedAt });
  const result = await adapter.load();
  assertEqual(calls.length, 1);
  assertEqual(calls[0].url, 'https://erp.example.test/saq/export/kuba');
  assertEqual(calls[0].init.headers, { Authorization: 'Bearer tok-1', Accept: 'application/json' });
  assertEqual(token.calls, [{ scopes: ['api://erp-test/access_as_user'], forceRefresh: false }]);
  assertEqual(result.sheets.map((s) => s.rows.length), [1, 1]);
  assertEqual(result.meta, {
    sheetNames: [ERP_SHEET], fileName: ERP_FILE_NAME, size: null, lastModified: null, eTag: null, webUrl: null, source: 'erp', loadedAt,
    erp: { url: 'https://erp.example.test/saq/export/kuba', vorgaenge: 2 },
  });
  assertEqual(await adapter.loadAudit(), [], 'kein Änderungsprotokoll bei der ERP-Quelle');
});

test('erpAdapter.load: 401 → Token einmal erneuern; 401/403/404/500, Netzwerkfehler und kein JSON → ErpError mit Status und Servertext', async () => {
  const load = (responses, token = tokenSpy()) => createErpAdapter({ getToken: token.getToken, fetch: fakeFetch(responses).fetch, config: ERP_CONFIG }).load();
  const token = tokenSpy();
  const ok = await load([{ status: 401, body: { error: 'Token ungueltig oder abgelaufen' } }, { status: 200, body: [erpRow()] }], token);
  assertEqual(token.calls.map((c) => c.forceRefresh), [false, true]);
  assertEqual(ok.meta.erp.vorgaenge, 1);
  const status = (e) => e instanceof ErpError && !(e instanceof ErpSchemaError) ? e.status : 'kein ErpError';
  const e401 = await rejects(load([{ status: 401, body: { error: 'Token ungueltig oder abgelaufen' } }]));
  assertEqual(status(e401), 401);
  assert(e401.message.includes('Token ungueltig oder abgelaufen') && e401.message.includes('CONFIG.erp.scopes'), e401.message);
  const e403 = await rejects(load([{ status: 403, body: { error: 'Nur Admin' } }]));
  assertEqual(status(e403), 403);
  assert(e403.message.includes('Nur Admin') && e403.message.includes('Admin-Rolle'), e403.message);
  assertEqual(status(await rejects(load([{ status: 404 }]))), 404);
  assertEqual(status(await rejects(load([{ status: 500, body: { error: 'Datenbankfehler' } }]))), 500);
  const net = await rejects(load([new TypeError('Failed to fetch')]));
  assertEqual(status(net), 0);
  assert(net.message.includes('nicht erreichbar') && net.message.includes('CORS'), net.message);
  assert(await rejects(load([{ status: 200 }])) instanceof ErpSchemaError, 'kein JSON');
  assert(await rejects(load([{ status: 200, body: { error: 'kein Array' } }])) instanceof ErpSchemaError, 'kein Array');
});

test('erpAdapter.load: ohne Basis-URL oder Scope → ErpConfigError, kein Token, kein Netzwerkzugriff', async () => {
  for (const erp of [{ ...ERP_CONFIG.erp, baseUrl: '' }, { ...ERP_CONFIG.erp, baseUrl: '  ' }, { ...ERP_CONFIG.erp, scopes: [] }, undefined]) {
    const { fetch, calls } = fakeFetch([{ status: 200, body: [] }]);
    const token = tokenSpy();
    const e = await rejects(createErpAdapter({ getToken: token.getToken, fetch, config: { ...CONFIG, erp } }).load());
    assert(e instanceof ErpConfigError && e.message.includes('CONFIG.erp.baseUrl'), e.message);
    assertEqual([calls.length, token.calls.length], [0, 0]);
  }
});

test('datasource.datasourceKind: Standard excel, erp wählbar, jeder andere Wert ist ein Konfigurationsfehler', () => {
  assertEqual(datasourceKind(CONFIG), 'excel');
  assertEqual(datasourceKind({}), 'excel');
  assertEqual(datasourceKind({ datasource: 'erp' }), 'erp');
  for (const v of ['ERP', 'sql', '', null]) {
    let err = null;
    try { datasourceKind({ datasource: v }); } catch (e) { err = e; }
    assert(err && err.message.includes('CONFIG.datasource'), 'Fehler erwartet für ' + JSON.stringify(v));
  }
});
