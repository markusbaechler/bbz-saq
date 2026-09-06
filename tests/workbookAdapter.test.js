// tests/workbookAdapter.test.js – Schreibpfad (PROMPT-2 Paket E, E.2): workbookAdapter.write(change) mit Graph-Mock:
// Request-Reihenfolge, Konfliktpfade (Datei, Zelle, gesperrt), 403, fehlender Header, Audit neu und bestehend, Schreibweise je Feld.
import { test, assert, assertEqual } from './runner.js';
import { GraphError, NotFoundError } from '../graph.js';
import { createWorkbookAdapter, WriteConflictError, WriteForbiddenError, WriteHeaderError } from '../datasource/workbookAdapter.js';

const CFG = {
  sheets: { first: 'First Certification', issued: 'Ausgestellte Zertifikate' },
  sharepoint: { siteHost: 'h.sharepoint.com', sitePath: '/sites/x', filePath: 'General/07_KUBA/Test_Reporting_KUBA.xlsx', auditPath: 'General/07_KUBA/Test_Reporting_KUBA.changes.json' },
};
const HEADERS = ['Nr', 'Last Name', 'First Name', 'Role', 'Employer', 'OE1 RUN1 Location', 'OE1 RUN1 Passed', 'OE1 RUN1 Date', 'OE1 RUN1 Result'];

// Fake-Graph: Routen (method + Teilstring des Pfads) mit Antwort-Warteschlange; zeichnet alle Aufrufe auf. Error-Objekte werden geworfen.
function fakeGraph(routes) {
  const calls = [];
  async function request(path, options = {}) {
    const method = options.method || 'GET';
    calls.push({ method, path, body: options.body, headers: options.headers || {}, responseType: options.responseType || 'json' });
    const route = routes.find((r) => r.method === method && path.includes(r.includes) && r.responses.length);
    if (!route) throw new Error('Test: keine Antwort für ' + method + ' ' + path);
    const next = route.responses.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(options) : next;
  }
  return { request, getJson: (path, options = {}) => request(path, { ...options, responseType: 'json' }), calls };
}

function cells(rows) {
  // rows: [{ v, t, f, x }] → Range-Antwort (values, valueTypes, numberFormat, text)
  return { values: rows.map((r) => [r.v]), valueTypes: rows.map((r) => [r.t || 'String']), numberFormat: rows.map((r) => [r.f || 'General']), text: rows.map((r) => [r.x === undefined ? String(r.v === null ? '' : r.v) : r.x]) };
}

function routes(overrides = {}) {
  const base = {
    site: { method: 'GET', includes: '/sites/h.sharepoint.com:/sites/x', responses: [{ id: 'site1' }] },
    drive: { method: 'GET', includes: '/sites/site1/drive', responses: [{ id: 'd1' }] },
    item: { method: 'GET', includes: '/root:/General/07_KUBA/Test_Reporting_KUBA.xlsx', responses: [{ id: 'i1' }] },
    version: { method: 'GET', includes: '/items/i1?$select=', responses: [{ eTag: 'e1', lastModifiedDateTime: '2026-09-06T10:00:00Z', name: 'Test_Reporting_KUBA.xlsx' }, { eTag: 'e2', lastModifiedDateTime: '2026-09-06T10:05:00Z', name: 'Test_Reporting_KUBA.xlsx' }] },
    header: { method: 'GET', includes: "range(address='A10:ZZ10')", responses: [{ values: [HEADERS] }] },
    cells: { method: 'GET', includes: "range(address='F18:F21')", responses: [cells([{ v: 'Bern' }, { v: 'Zürich' }, { v: 'Bern' }, { v: 'Zürich' }])] },
    session: { method: 'POST', includes: '/workbook/createSession', responses: [{ id: 's1', persistChanges: true }] },
    patch: { method: 'PATCH', includes: "range(address='F21')", responses: [{ values: [['Bern']], text: [['Bern']] }] },
    close: { method: 'POST', includes: '/workbook/closeSession', responses: [null] },
    auditMeta: { method: 'GET', includes: '/root:/General/07_KUBA/Test_Reporting_KUBA.changes.json', responses: [new NotFoundError('nicht da')] },
    auditPut: { method: 'PUT', includes: 'Test_Reporting_KUBA.changes.json:/content', responses: [{ id: 'a1' }] },
  };
  return Object.values({ ...base, ...overrides });
}

function change(extra = {}) {
  return { sheet: 'First Certification', row: 21, field: 'location', header: 'OE1 RUN1 Location', value: 'Bern', expected: 'Zürich', expectedItem: { eTag: 'e1', lastModified: '2026-09-06T10:00:00Z' }, reason: 'Ort korrigiert', ...extra };
}

async function rejects(promise, check) {
  try { await promise; } catch (e) { if (check && !check(e)) throw new Error('falscher Fehler: ' + e.name + ' ' + e.message); return e; }
  throw new Error('Fehler erwartet');
}

test('workbookAdapter.write: Erfolgspfad – Reihenfolge Auflösung, Version, Header, Zelle, Session, PATCH, Close, Audit neu, Version; Ergebnis', async () => {
  const graph = fakeGraph(routes());
  const adapter = createWorkbookAdapter({ graph, config: CFG, now: () => new Date(Date.UTC(2026, 8, 6, 12)), account: () => ({ username: 'konto@example.org' }) });
  const result = await adapter.write(change());
  const expectedSequence = [
    'GET /sites/h.sharepoint.com:/sites/x',
    'GET /sites/site1/drive',
    'GET /drives/d1/root:/General/07_KUBA/Test_Reporting_KUBA.xlsx',
    'GET /drives/d1/items/i1?$select=eTag,lastModifiedDateTime,name',
    "GET /drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='A10:ZZ10')",
    "GET /drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='F18:F21')",
    'POST /drives/d1/items/i1/workbook/createSession',
    "PATCH /drives/d1/items/i1/workbook/worksheets('First%20Certification')/range(address='F21')",
    'POST /drives/d1/items/i1/workbook/closeSession',
    'GET /drives/d1/root:/General/07_KUBA/Test_Reporting_KUBA.changes.json',
    'PUT /drives/d1/root:/General/07_KUBA/Test_Reporting_KUBA.changes.json:/content',
    'GET /drives/d1/items/i1?$select=eTag,lastModifiedDateTime,name',
  ];
  const sequence = graph.calls.map((c) => c.method + ' ' + c.path);
  assertEqual(sequence.length, expectedSequence.length, sequence.join('\n'));
  expectedSequence.forEach((prefix, i) => assert(sequence[i].startsWith(prefix), 'Request ' + (i + 1) + ': ' + sequence[i] + ' erwartet ' + prefix));
  const patch = graph.calls.find((c) => c.method === 'PATCH');
  assertEqual(patch.body, { values: [['Bern']] });
  assertEqual(patch.headers['workbook-session-id'], 's1');
  assertEqual(graph.calls.find((c) => c.path.endsWith('closeSession')).headers['workbook-session-id'], 's1');
  const put = graph.calls.find((c) => c.method === 'PUT');
  const audit = JSON.parse(put.body);
  assertEqual(audit.length, 1);
  assertEqual([audit[0].sheet, audit[0].row, audit[0].header, audit[0].address, audit[0].old, audit[0].new, audit[0].reason, audit[0].user, audit[0].at], ['First Certification', 21, 'OE1 RUN1 Location', 'F21', 'Zürich', 'Bern', 'Ort korrigiert', 'konto@example.org', '2026-09-06T12:00:00.000Z']);
  assertEqual(put.headers['Content-Type'], 'application/json');
  assert(!('If-Match' in put.headers), 'neue Audit-Datei ohne If-Match');
  assertEqual(result, { ok: true, written: { sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'F21', value: 'Bern' }, conflict: null, itemVersion: { eTag: 'e2', lastModified: '2026-09-06T10:05:00Z' }, audit: { entries: 1 } });
});

test('workbookAdapter.write: Datei zwischenzeitlich geändert → WriteConflictError (file), keine Session', async () => {
  const graph = fakeGraph(routes({ version: { method: 'GET', includes: '/items/i1?$select=', responses: [{ eTag: 'e9', lastModifiedDateTime: '2026-09-06T11:00:00Z', name: 'Test_Reporting_KUBA.xlsx' }] } }));
  const e = await rejects(createWorkbookAdapter({ graph, config: CFG }).write(change()), (x) => x instanceof WriteConflictError);
  assertEqual(e.kind, 'file');
  assert(/neu laden/i.test(e.message));
  assert(!graph.calls.some((c) => c.path.endsWith('createSession')), 'nichts geschrieben');
});

test('workbookAdapter.write: Zelle weicht vom erwarteten Wert ab → WriteConflictError (cell)', async () => {
  const graph = fakeGraph(routes({ cells: { method: 'GET', includes: "range(address='F18:F21')", responses: [cells([{ v: 'Bern' }, { v: 'Bern' }, { v: 'Bern' }, { v: 'Basel' }])] } }));
  const e = await rejects(createWorkbookAdapter({ graph, config: CFG }).write(change()), (x) => x instanceof WriteConflictError);
  assertEqual(e.kind, 'cell');
  assert(!graph.calls.some((c) => c.method === 'PATCH'));
});

test('workbookAdapter.write: HTTP 403 beim Schreiben → WriteForbiddenError, Session wird trotzdem geschlossen', async () => {
  const graph = fakeGraph(routes({ patch: { method: 'PATCH', includes: "range(address='F21')", responses: [new GraphError('Zugriff verweigert (HTTP 403)', { status: 403 })] } }));
  const e = await rejects(createWorkbookAdapter({ graph, config: CFG }).write(change()), (x) => x instanceof WriteForbiddenError);
  assert(/Schreibrecht/.test(e.message), e.message);
  assert(graph.calls.some((c) => c.path.endsWith('closeSession')), 'closeSession trotz Fehler');
  assert(!graph.calls.some((c) => c.method === 'PUT'), 'kein Audit ohne Schreiben');
});

test('workbookAdapter.write: Datei gesperrt (HTTP 423) → WriteConflictError (locked)', async () => {
  const graph = fakeGraph(routes({ session: { method: 'POST', includes: '/workbook/createSession', responses: [new GraphError('Locked', { status: 423, code: 'resourceLocked' })] } }));
  const e = await rejects(createWorkbookAdapter({ graph, config: CFG }).write(change()), (x) => x instanceof WriteConflictError);
  assertEqual(e.kind, 'locked');
  assert(/Excel/.test(e.message));
});

test('workbookAdapter.write: Header nicht in Zeile 10 → WriteHeaderError, nichts geschrieben (kein Raten)', async () => {
  const graph = fakeGraph(routes());
  const e = await rejects(createWorkbookAdapter({ graph, config: CFG }).write(change({ header: 'OE1 RUN1 Expert 1', field: 'expert1' })), (x) => x instanceof WriteHeaderError);
  assert(/OE1 RUN1 Expert 1/.test(e.message));
  assert(!graph.calls.some((c) => c.path.endsWith('createSession')));
});

test('workbookAdapter.write: Header über Kandidatenliste (Sheet-Variante), Audit-Datei vorhanden → Append mit If-Match', async () => {
  const graph = fakeGraph(routes({
    auditMeta: { method: 'GET', includes: '/root:/General/07_KUBA/Test_Reporting_KUBA.changes.json', responses: [{ id: 'a1', eTag: 'a-etag' }] },
    auditGet: { method: 'GET', includes: 'Test_Reporting_KUBA.changes.json:/content', responses: ['[{"at":"2026-09-01T00:00:00.000Z","reason":"alt"}]'] },
  }));
  const result = await createWorkbookAdapter({ graph, config: CFG }).write(change({ header: undefined, candidates: ['OE1 RUN1 Ort', 'OE1 RUN1 Location'] }));
  const put = graph.calls.find((c) => c.method === 'PUT');
  assertEqual(put.headers['If-Match'], 'a-etag');
  assertEqual(JSON.parse(put.body).map((x) => x.reason), ['alt', 'Ort korrigiert']);
  assertEqual(result.audit.entries, 2);
  assertEqual(result.written.header, 'OE1 RUN1 Location');
});

test('workbookAdapter.write: Schreibweise aus den Nachbarzellen – Datum als Serienzahl, Passed in der Schreibweise des Sheets', async () => {
  const dateGraph = fakeGraph(routes({
    cells: { method: 'GET', includes: "range(address='H18:H21')", responses: [cells([{ v: 45000, t: 'Double', f: 'dd.mm.yyyy', x: '15.03.2023' }, { v: 45100, t: 'Double', f: 'dd.mm.yyyy', x: '23.06.2023' }, { v: null, t: 'Empty', f: 'General', x: '' }, { v: 45200, t: 'Double', f: 'dd.mm.yyyy', x: '01.10.2023' }])] },
    patch: { method: 'PATCH', includes: "range(address='H21')", responses: [{ values: [[46271]] }] },
  }));
  await createWorkbookAdapter({ graph: dateGraph, config: CFG }).write(change({ field: 'date', header: 'OE1 RUN1 Date', value: new Date(2026, 8, 6), expected: undefined }));
  assertEqual(dateGraph.calls.find((c) => c.method === 'PATCH').body, { values: [[46271]] });
  const passedGraph = fakeGraph(routes({
    cells: { method: 'GET', includes: "range(address='G18:G21')", responses: [cells([{ v: 'Yes' }, { v: 'No' }, { v: 'Yes' }, { v: 'No' }])] },
    patch: { method: 'PATCH', includes: "range(address='G21')", responses: [{ values: [['Yes']] }] },
  }));
  await createWorkbookAdapter({ graph: passedGraph, config: CFG }).write(change({ field: 'passed', header: 'OE1 RUN1 Passed', value: true, expected: 'No' }));
  assertEqual(passedGraph.calls.find((c) => c.method === 'PATCH').body, { values: [['Yes']] });
});
