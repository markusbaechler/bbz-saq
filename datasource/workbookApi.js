// datasource/workbookApi.js – reine Helfer des Schreibpfads (PROMPT-2 Paket E, Phase 2): Range-Adressen, Graph-Pfade der
// Workbook-API, Zellwert je Feldtyp, Session-Ablauf als Request-Liste, Konfliktprüfung und Audit-Eintrag. Kein Netz, kein DOM.
// Die Excel-Struktur wird nie verändert (E10): nur Zellwerte in bestehenden Spalten, adressiert über den Header der Zeile 10.

// 0 → A, 25 → Z, 26 → AA (wie tools/headers.js)
export function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Spaltenindex (0-basiert, aus dem Header-Mapping) + Excel-Zeile → Adresse «GB21»
export function rangeAddress(colIndex, row) {
  return columnLetter(colIndex) + row;
}

// Graph-Pfade: Item, Session, Range; Sheet-Name URL-kodiert, Apostroph verdoppelt (OData)
export function workbookPaths(driveId, itemId, sheetName, address) {
  const item = '/drives/' + driveId + '/items/' + itemId;
  const sheet = encodeURIComponent(String(sheetName).replace(/'/g, "''"));
  return {
    item,
    session: item + '/workbook/createSession',
    close: item + '/workbook/closeSession',
    range: item + "/workbook/worksheets('" + sheet + "')/range(address='" + address + "')",
  };
}

const MS_PER_DAY = 86400000;

// Excel-Serienzahl (Tage seit 1899-12-30) eines lokalen Datums
export function excelSerial(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / MS_PER_DAY);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Zellwert je Feldtyp gemäss Schreibweise des Sheets (style aus den Nachbarzellen, Spike E.1):
//   passed: passedStyle [yes, no]; date: dateStyle 'text' (dd.mm.yyyy) | 'serial'; result: resultStyle 'fraction' (0–1) | 'percent' («85 %»)
export function cellValueFor(field, value, style = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (field === 'passed') {
    const [yes, no] = Array.isArray(style.passedStyle) && style.passedStyle.length === 2 ? style.passedStyle : ['yes', 'no'];
    return value === true ? yes : no;
  }
  if (field === 'date') {
    const d = value instanceof Date ? value : new Date(value);
    return style.dateStyle === 'serial' ? excelSerial(d) : pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  if (field === 'result') {
    const v = Number(value);
    return style.resultStyle === 'percent' ? Math.round(v * 100) + ' %' : v;
  }
  return String(value);
}

// Ablauf eines Schreibvorgangs als Request-Liste: createSession (persistChanges) → PATCH range → closeSession.
// ctx = { driveId, itemId, sessionId? } – die Session-Id kennt der Adapter erst nach createSession und setzt sie in die Folge-Requests.
export function writePlan(change, ctx) {
  const address = change.address || rangeAddress(change.colIndex, change.row);
  const paths = workbookPaths(ctx.driveId, ctx.itemId, change.sheet, address);
  const session = ctx.sessionId ? { 'workbook-session-id': ctx.sessionId } : {};
  return [
    { method: 'POST', path: paths.session, body: { persistChanges: true }, headers: {} },
    { method: 'PATCH', path: paths.range, body: { values: [[change.value]] }, headers: session },
    { method: 'POST', path: paths.close, body: undefined, headers: session },
  ];
}

function norm(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function timeOf(v) {
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? String(v) : t;
}

// Konfliktprüfung vor dem Schreiben: Datei zwischenzeitlich geändert (eTag, sonst lastModified) → 'file';
// Zellwert weicht vom erwarteten ab → 'cell'; sonst null. Ohne erwarteten eTag/Zeitstempel keine Dateiprüfung.
export function conflictOf({ expectedModified = null, actualModified = null, expectedEtag = null, actualEtag = null, expectedValue = null, actualValue = null } = {}) {
  const fileChanged = (expectedEtag && actualEtag && expectedEtag !== actualEtag)
    || (expectedModified && actualModified && timeOf(expectedModified) !== timeOf(actualModified));
  if (fileChanged) return { kind: 'file', message: 'Die Datei wurde zwischenzeitlich geändert – bitte neu laden und die Änderung wiederholen.' };
  if (norm(expectedValue) !== norm(actualValue)) {
    return { kind: 'cell', message: 'Die Zelle enthält nicht mehr den erwarteten Wert («' + norm(expectedValue) + '» erwartet, «' + norm(actualValue) + '» vorhanden) – bitte neu laden.' };
  }
  return null;
}

// Audit-Eintrag je Änderung (Entscheid vor Start Paket E, Frage 2): Zeitpunkt, Konto, Fundstelle, alt, neu, Grund – kein Kandidatenname
export function auditEntry(change, account, now = new Date()) {
  const address = change.address || (Number.isInteger(change.colIndex) ? rangeAddress(change.colIndex, change.row) : '');
  return {
    at: now.toISOString(),
    user: account ? String(account.username || account.name || '') : '',
    sheet: change.sheet,
    row: change.row,
    header: change.header,
    address,
    old: change.expected === undefined ? null : change.expected,
    new: change.value === undefined ? null : change.value,
    reason: change.reason || '',
    source: 'bbz-saq',
  };
}

// Audit-Datei (JSON-Array) um einen Eintrag ergänzen; leer → neues Array; ungültiges JSON wird nie überschrieben (wirft)
export function appendAuditJson(text, entry) {
  const arr = text && String(text).trim() ? JSON.parse(text) : [];
  if (!Array.isArray(arr)) throw new Error('Audit-Datei ist kein JSON-Array');
  arr.push(entry);
  return JSON.stringify(arr, null, 2) + '\n';
}
