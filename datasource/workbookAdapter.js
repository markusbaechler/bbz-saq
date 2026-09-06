// datasource/workbookAdapter.js – Phase 2 (PROMPT-2 Paket E, E.2): Schreibpfad über die Graph-Workbook-API.
// write(change) ändert genau eine Run-Zelle in einer bestehenden Spalte: Auflösung wie der Lesepfad, Konfliktprüfung (Datei-Version,
// Zellwert), Header der Zeile 10 zur Laufzeit (nie Spaltenbuchstaben raten), Schreibweise aus den Nachbarzellen, Session → PATCH →
// closeSession, Audit-Eintrag in der JSON-Datei neben der Excel (If-Match), neue Version. Die Struktur der Datei bleibt unverändert (E10).
// Fehler: WriteConflictError (file | cell | locked), WriteForbiddenError (403), WriteHeaderError (Header fehlt).

import { CONFIG } from '../config.js';
import { GraphError, NotFoundError } from '../graph.js';
import { resolveDriveItem } from './fileAdapter.js';
import { workbookPaths, columnLetter, cellValueFor, detectStyle, conflictOf, auditEntry, appendAuditJson } from './workbookApi.js';

export class WriteConflictError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'WriteConflictError';
    this.kind = kind;
  }
}

export class WriteForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WriteForbiddenError';
  }
}

export class WriteHeaderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WriteHeaderError';
  }
}

const ITEM_SELECT = 'eTag,lastModifiedDateTime,name';
const TEXT_FIELDS = new Set(['location', 'expert1', 'expert2', 'passed']); // Zellvergleich über den angezeigten Text; Datum/Result über die Datei-Version

function normHeader(h) {
  return String(h === null || h === undefined ? '' : h).trim().toLowerCase().replace(/\s+/g, ' ');
}

function encodePath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

// Graph-Fehler in verständliche Schreibfehler übersetzen; alles andere unverändert weiterreichen
function translate(e) {
  if (e instanceof GraphError) {
    if (e.status === 403) return new WriteForbiddenError('Kein Schreibrecht auf die Datei (HTTP 403) – SharePoint-Berechtigung prüfen; nichts wurde geändert.');
    if (e.status === 423 || e.status === 409) return new WriteConflictError('locked', 'Die Datei ist gesperrt, vermutlich in Excel geöffnet (HTTP ' + e.status + ') – schliessen und erneut versuchen.');
  }
  return e;
}

// graph = Client mit Schreib-Scopes (createGraphClient); account() liefert das MSAL-Konto für das Audit; now() für Tests
export function createWorkbookAdapter({ graph, config = CONFIG, now = () => new Date(), account = () => null } = {}) {
  const cache = {};
  const headerRow = config.headerRow || 10;
  const firstDataRow = config.dataStartRow || headerRow + 1;

  async function readVersion(itemPath) {
    const item = await graph.getJson(itemPath + '?$select=' + ITEM_SELECT);
    return { eTag: item.eTag || null, lastModified: item.lastModifiedDateTime || null, name: item.name || null };
  }

  // Spaltenindex des Headers (erster Kandidat, der in Zeile 10 steht); Vergleich wie resolveHeaders (trim, Kleinschreibung, Leerraum)
  async function findColumn(driveId, itemId, sheet, candidates) {
    const address = 'A' + headerRow + ':ZZ' + headerRow;
    const head = await graph.getJson(workbookPaths(driveId, itemId, sheet, address).range + '?$select=values');
    const values = (head && head.values && head.values[0]) || [];
    for (const candidate of candidates) {
      const wanted = normHeader(candidate);
      const index = values.findIndex((v) => normHeader(v) === wanted);
      if (index >= 0) return { colIndex: index, header: String(values[index]).trim() };
    }
    throw new WriteHeaderError('Header «' + candidates.join('» / «') + '» nicht in Zeile ' + headerRow + ' von «' + sheet + '» gefunden – Struktur der Datei prüfen; nichts wurde geschrieben.');
  }

  // Zielzelle und bis zu drei Zellen darüber: Wert, Typ, Format, Text (Schreibweise der Spalte)
  async function readCells(driveId, itemId, sheet, col, row) {
    const from = Math.max(firstDataRow, row - 3);
    const block = await graph.getJson(workbookPaths(driveId, itemId, sheet, col + from + ':' + col + row).range + '?$select=values,valueTypes,numberFormat,text');
    const n = block.values.length;
    const cells = block.values.map((_, i) => ({ type: block.valueTypes[i][0], format: block.numberFormat[i][0], text: block.text[i][0] }));
    return { cells, target: { value: block.values[n - 1][0], type: block.valueTypes[n - 1][0], text: block.text[n - 1][0] } };
  }

  async function appendAudit(driveId, change) {
    const metaPath = '/drives/' + driveId + '/root:/' + encodePath(config.sharepoint.auditPath);
    let etag = null;
    let text = '';
    try {
      const meta = await graph.getJson(metaPath);
      etag = meta.eTag || null;
      text = await graph.request(metaPath + ':/content', { responseType: 'text' });
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e; // fehlt → neue Datei
    }
    const next = appendAuditJson(text, auditEntry(change, account(), now()));
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag; // zwei gleichzeitige Schreiber: der zweite erhält 412 und lädt neu
    await graph.request(metaPath + ':/content', { method: 'PUT', body: next, headers });
    return { entries: JSON.parse(next).length };
  }

  // change = { sheet, row, field, header | candidates, value, expected?, expectedItem?: { eTag, lastModified }, reason }
  async function write(change) {
    if (!change || !change.sheet || !Number.isInteger(change.row) || !change.field) throw new Error('Änderung unvollständig – Sheet, Zeile und Feld sind nötig.');
    const candidates = (change.header ? [change.header] : []).concat(Array.isArray(change.candidates) ? change.candidates : []);
    if (!candidates.length) throw new WriteHeaderError('Kein Header angegeben – nichts wurde geschrieben.');
    try {
      const { driveId, itemId } = await resolveDriveItem(graph, config.sharepoint, cache);
      const itemPath = '/drives/' + driveId + '/items/' + itemId;
      const before = await readVersion(itemPath);
      if (change.expectedItem) {
        const c = conflictOf({ expectedEtag: change.expectedItem.eTag || null, actualEtag: before.eTag, expectedModified: change.expectedItem.lastModified || null, actualModified: before.lastModified });
        if (c) throw new WriteConflictError(c.kind, c.message);
      }
      const { colIndex, header } = await findColumn(driveId, itemId, change.sheet, candidates);
      const col = columnLetter(colIndex);
      const address = col + change.row;
      const { cells, target } = await readCells(driveId, itemId, change.sheet, col, change.row);
      if (change.expected !== undefined && TEXT_FIELDS.has(change.field)) {
        const c = conflictOf({ expectedValue: change.expected, actualValue: target.text });
        if (c) throw new WriteConflictError('cell', c.message);
      }
      const value = cellValueFor(change.field, change.value, detectStyle(change.field, cells));
      const paths = workbookPaths(driveId, itemId, change.sheet, address);
      const session = await graph.request(paths.session, { method: 'POST', body: { persistChanges: true } });
      const sessionHeaders = { 'workbook-session-id': session && session.id };
      try {
        await graph.request(paths.range, { method: 'PATCH', body: { values: [[value]] }, headers: sessionHeaders });
      } finally {
        try {
          await graph.request(paths.close, { method: 'POST', headers: sessionHeaders });
        } catch {
          // Session läuft serverseitig aus; der Schreibfehler (falls einer) hat Vorrang
        }
      }
      const audit = await appendAudit(driveId, { ...change, header, address, colIndex, value, expected: change.expected === undefined ? target.text : change.expected });
      const after = await readVersion(itemPath);
      return { ok: true, written: { sheet: change.sheet, row: change.row, header, address, value }, conflict: null, itemVersion: { eTag: after.eTag, lastModified: after.lastModified }, audit };
    } catch (e) {
      throw translate(e);
    }
  }

  return { write };
}
