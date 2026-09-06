// spike/mutation.js – Spike E.1 (PROMPT-2 Paket E): Schreibtest über die Graph-Workbook-API, ausschliesslich auf der Testkopie.
// Läuft nur lokal; Scope Files.ReadWrite.All nur auf dieser Seite. Das Protokoll enthält keine Personendaten (Werte der
// Felder «Expert» werden maskiert), keine Speicherung im Browser (Regel 4). Die Excel-Struktur wird nie verändert (E10).

import { CONFIG } from '../config.js';
import { createAuth } from '../auth.js';
import { createGraphClient } from '../graph.js';
import { resolveDriveItem } from '../datasource/fileAdapter.js';
import { rangeAddress, workbookPaths, columnLetter, writePlan, conflictOf, auditEntry, appendAuditJson } from '../datasource/workbookApi.js';

const TEST_PATH = 'General/07_KUBA/Test_Reporting_KUBA.xlsx';
const AUDIT_PATH = 'General/07_KUBA/Test_Reporting_KUBA.changes.json';
const SHEET = CONFIG.sheets.first;
const ITEM_SELECT = 'id,name,size,lastModifiedDateTime,eTag';

const $ = (id) => document.getElementById(id);
const auth = createAuth({ msal: globalThis.msal, authConfig: { ...CONFIG.auth, scopes: ['Files.ReadWrite.All'] } });
const graph = createGraphClient({ getToken: (o) => auth.getToken(o) });
const state = { cache: {}, item: null, colIndex: null, field: null, header: null, row: null, original: null, style: {}, lastVersion: null };

function log(text) {
  const t = new Date().toISOString().slice(11, 19);
  $('log').textContent += '[' + t + '] ' + text + '\n';
}

function mask(field, value) {
  if (value === null || value === undefined || value === '') return '(leer)';
  return field.startsWith('expert') ? '(Text, ' + String(value).length + ' Zeichen)' : JSON.stringify(value);
}

function fail(e) {
  log('FEHLER ' + (e && e.name ? e.name : 'Error') + (e && e.status ? ' HTTP ' + e.status : '') + ': ' + (e && e.message ? e.message : String(e)));
}

async function step(name, fn) {
  try {
    log('— ' + name);
    await fn();
  } catch (e) {
    fail(e);
  }
}

function itemPath() {
  return '/drives/' + state.cache.driveId + '/items/' + state.cache.itemId;
}

async function readItem() {
  const item = await graph.getJson(itemPath() + '?$select=' + ITEM_SELECT);
  return { eTag: item.eTag, lastModified: item.lastModifiedDateTime, name: item.name, size: item.size };
}

async function readRange(address, select = 'values,valueTypes,numberFormat,text') {
  const p = workbookPaths(state.cache.driveId, state.cache.itemId, SHEET, address);
  return graph.getJson(p.range + '?$select=' + select);
}

async function writeCell(value) {
  const change = { sheet: SHEET, row: state.row, header: state.header, colIndex: state.colIndex, field: state.field, value };
  const plan0 = writePlan(change, { driveId: state.cache.driveId, itemId: state.cache.itemId });
  const session = await graph.request(plan0[0].path, { method: 'POST', body: plan0[0].body });
  log('createSession → id vorhanden: ' + !!(session && session.id) + ', persistChanges: ' + (session && session.persistChanges));
  const plan = writePlan(change, { driveId: state.cache.driveId, itemId: state.cache.itemId, sessionId: session.id });
  try {
    const patched = await graph.request(plan[1].path, { method: 'PATCH', body: plan[1].body, headers: plan[1].headers });
    log('PATCH ' + rangeAddress(state.colIndex, state.row) + ' → valueTypes ' + JSON.stringify(patched && patched.valueTypes) + ', text ' + mask(state.field, patched && patched.text && patched.text[0][0]));
  } finally {
    const closed = await graph.request(plan[2].path, { method: 'POST', headers: plan[2].headers, responseType: 'response' });
    log('closeSession → HTTP ' + (closed ? closed.status : '204'));
  }
  const after = await readItem();
  const cell = await readRange(rangeAddress(state.colIndex, state.row));
  log('nachher: Zelle ' + mask(state.field, cell.values[0][0]) + ' (Typ ' + cell.valueTypes[0][0] + ', Format ' + JSON.stringify(cell.numberFormat[0][0]) + '); Datei lastModified ' + after.lastModified + ', eTag geändert: ' + (after.eTag !== (state.lastVersion || {}).eTag));
  state.lastVersion = after;
}

$('test-path').textContent = TEST_PATH;

$('btn-login').onclick = () => step('Anmelden', async () => {
  await auth.init();
  const account = auth.getAccount() || await auth.signIn();
  $('login-state').textContent = account ? 'angemeldet' : 'nicht angemeldet';
  log('angemeldet: ' + !!account + ' (Scope Files.ReadWrite.All nur auf dieser Seite)');
  $('btn-resolve').disabled = !account;
});

$('btn-resolve').onclick = () => step('Testkopie auflösen', async () => {
  await resolveDriveItem(graph, { ...CONFIG.sharepoint, filePath: TEST_PATH }, state.cache);
  const item = await readItem();
  if (!String(item.name).startsWith('Test_')) {
    $('guard').hidden = false;
    state.cache = {};
    throw new Error('Dateiname «' + item.name + '» beginnt nicht mit Test_ – kein Schreibtest.');
  }
  state.item = item;
  state.lastVersion = item;
  log('Item: ' + item.name + ', ' + item.size + ' Bytes, lastModified ' + item.lastModified + ', eTag vorhanden: ' + !!item.eTag);
  $('btn-headers').disabled = false;
});

$('btn-headers').onclick = () => step('Header lesen', async () => {
  const [header, field] = $('field').value.split('|');
  const head = await readRange('A10:ZZ10', 'values');
  const values = head.values[0].map((v) => (v === null || v === undefined ? '' : String(v).trim()));
  const idx = values.findIndex((v) => v.toLowerCase() === header.toLowerCase());
  if (idx < 0) throw new Error('Header «' + header + '» nicht in Zeile 10 gefunden – kein Raten.');
  const used = await graph.getJson(workbookPaths(state.cache.driveId, state.cache.itemId, SHEET, 'A1').item + "/workbook/worksheets('" + encodeURIComponent(SHEET) + "')/usedRange(valuesOnly=true)?$select=address,rowCount");
  const m = /:[A-Z]+(\d+)$/.exec(used.address || '');
  state.header = header;
  state.field = field;
  state.colIndex = idx;
  state.row = Number($('row').value) || 11;
  log('Header «' + header + '» → Spalte ' + columnLetter(idx) + ' (Index ' + idx + '); usedRange ' + used.address + (m ? ' (letzte Zeile ' + m[1] + ')' : '') + '; gewählte Zeile ' + state.row);
  $('btn-read').disabled = false;
});

$('btn-read').onclick = () => step('Zelle lesen', async () => {
  const address = rangeAddress(state.colIndex, state.row);
  const cell = await readRange(address);
  state.original = cell.values[0][0];
  log('Zelle ' + address + ': Wert ' + mask(state.field, state.original) + ', Typ ' + cell.valueTypes[0][0] + ', Format ' + JSON.stringify(cell.numberFormat[0][0]) + ', Text ' + mask(state.field, cell.text[0][0]));
  const from = Math.max(11, state.row - 3);
  if (from < state.row) {
    const col = columnLetter(state.colIndex);
    const nb = await readRange(col + from + ':' + col + (state.row - 1), 'valueTypes,numberFormat,text');
    nb.valueTypes.forEach((t, i) => log('Nachbarzelle ' + col + (from + i) + ': Typ ' + t[0] + ', Format ' + JSON.stringify(nb.numberFormat[i][0]) + ', Text ' + mask(state.field, nb.text[i][0])));
  }
  $('btn-write').disabled = false;
  $('btn-conflict').disabled = false;
  $('btn-audit').disabled = false;
});

$('btn-write').onclick = () => step('Schreiben', async () => {
  const raw = $('value').value;
  const value = state.field === 'result' && /^[0-9.,]+$/.test(raw) ? Number(raw.replace(',', '.')) : raw;
  await writeCell(value);
  $('btn-restore').disabled = false;
});

$('btn-restore').onclick = () => step('Zurückschreiben', async () => {
  await writeCell(state.original === null || state.original === undefined ? '' : state.original);
  const cell = await readRange(rangeAddress(state.colIndex, state.row), 'values');
  log('wiederhergestellt: ' + (String(cell.values[0][0] === null ? '' : cell.values[0][0]) === String(state.original === null ? '' : state.original)));
});

$('btn-conflict').onclick = () => step('Konfliktprüfung', async () => {
  const now = await readItem();
  const c = conflictOf({ expectedEtag: state.lastVersion.eTag, actualEtag: now.eTag, expectedModified: state.lastVersion.lastModified, actualModified: now.lastModified, expectedValue: null, actualValue: null });
  log('Stand ' + state.lastVersion.lastModified + ' gegen aktuell ' + now.lastModified + ' → ' + (c ? c.kind + ': ' + c.message : 'kein Konflikt'));
});

$('btn-audit').onclick = () => step('Audit anhängen', async () => {
  const path = '/drives/' + state.cache.driveId + '/root:/' + AUDIT_PATH.split('/').map(encodeURIComponent).join('/') + ':/content';
  let text = '';
  try {
    text = await graph.request(path, { responseType: 'text' });
    log('Audit-Datei vorhanden (' + text.length + ' Zeichen)');
  } catch (e) {
    if (e && e.status === 404) log('Audit-Datei fehlt noch (404) – wird angelegt');
    else throw e;
  }
  const entry = auditEntry({ sheet: SHEET, row: state.row, header: state.header, colIndex: state.colIndex, field: state.field, value: '(Spike)', expected: '(Spike)', reason: 'Spike E.1' }, auth.getAccount());
  const next = appendAuditJson(text, entry);
  const resp = await graph.request(path, { method: 'PUT', body: next, headers: { 'Content-Type': 'application/json' }, responseType: 'response' });
  log('PUT Audit → HTTP ' + resp.status + ', Einträge: ' + JSON.parse(next).length);
});

$('btn-copy').onclick = async () => {
  await navigator.clipboard.writeText($('log').textContent);
  log('Protokoll in die Zwischenablage kopiert');
};
$('btn-clear').onclick = () => { $('log').textContent = ''; };
