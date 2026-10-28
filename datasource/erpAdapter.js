// datasource/erpAdapter.js – zweite Datenquelle (CONFIG.datasource = 'erp'): Vorgänge aus dem bbz-ERP statt Reporting_KUBA.xlsx.
//
// GET {CONFIG.erp.baseUrl}{CONFIG.erp.exportPath} (Standard /saq/export/kuba, Admin-Rolle im ERP) mit Entra-ID-Token für
// CONFIG.erp.scopes. Antwort: JSON-Array, ein Objekt je Zertifizierungsvorgang mit den logischen Feldschlüsseln aus
// config.js HEADER_FIELDS (lastName, we1.passed, we1.run1.date …) und erpFallId. Passed-Werte yes/no/leer, Resultat als
// Anteil 0–1, Datum als «JJJJ-MM-TT», fehlende Werte leer.
//
// Ausgabe = derselbe Eingabevertrag von store.normalizeWorkbook wie beim fileAdapter: { sheets, comments, meta }. Der
// Adapter dekodiert nur das Transportformat (ISO-Datum → lokales Date wie SheetJS mit cellDates) und gibt alle übrigen
// Werte roh weiter. Normalisierung, Duplikate, Status und Data-Quality-Log bleiben in store.js – ein Wert, den der Adapter
// nicht dekodieren kann (z. B. «2026-02-30»), landet dort wie eine unlesbare Excel-Zelle im Log.
// - Kopfzeile: erster Header-Name je Feld aus HEADER_FIELDS; store.js mappt darüber wie bei der Datei (Regel 2).
//   Fehlt ein Pflichtfeld im Export → ErpSchemaError, kein Fallback (wie ein fehlender Pflicht-Header).
// - Sheet: Vorgang mit Zertifikat (certStart gefüllt) → 'issued' wie «Ausgestellte Zertifikate», sonst 'first'.
// - Fundstelle im Data-Quality-Log: Sheet «bbz-ERP», Zeile = Position des Vorgangs im Export (1-basiert).
// - VSS/VSM: der Export enthält keine Kennzeichnung – comments bleibt leer.
// Nichts wird im Browser gespeichert (nur Memory).

import { CONFIG, HEADER_FIELDS, requiredFieldKeys } from '../config.js';

export const ERP_SHEET = 'bbz-ERP';
export const ERP_FILE_NAME = 'SAQ-Export'; // erscheint als «Datenstand: SAQ-Export», Quelle «bbz-ERP»

export class ErpError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ErpError';
    this.status = status;
  }
}

export class ErpConfigError extends ErpError {
  constructor(message) {
    super(message);
    this.name = 'ErpConfigError';
  }
}

export class ErpSchemaError extends ErpError {
  constructor(message) {
    super(message);
    this.name = 'ErpSchemaError';
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Felder, die das ERP als «JJJJ-MM-TT» liefert: Geburtsdatum, Zertifikat Start/Ende, Run-Datum
export function isDateField(key) {
  return key === 'birthDate' || key === 'certStart' || key === 'certEnd' || key.endsWith('.date');
}

// «JJJJ-MM-TT» → lokales Date (Tagesanfang); kein ISO-Datum oder kein gültiger Kalendertag → Wert unverändert
export function decodeIsoDate(value) {
  const m = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!m) return value;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : value;
}

// ERP-Export (Array von Vorgängen) → { sheets, comments, meta: { sheetNames } } für store.normalizeWorkbook
export function rowsToWorkbook(rows, config = CONFIG) {
  if (!Array.isArray(rows)) throw new ErpSchemaError('Antwort des ERP ist keine Liste von Vorgängen (erwartet ein JSON-Array).');
  const notObject = rows.findIndex((r) => r === null || typeof r !== 'object' || Array.isArray(r));
  if (notObject >= 0) throw new ErpSchemaError('Vorgang ' + (notObject + 1) + ' im ERP-Export ist kein Objekt.');
  // Pflichtfelder beider Sheets; certStart entscheidet über das Sheet und ist deshalb immer Pflicht
  const required = requiredFieldKeys('issued');
  const missing = required.filter((key) => rows.some((r) => !(key in r)));
  if (missing.length) {
    throw new ErpSchemaError('ERP-Export: Pflichtfelder fehlen (' + missing.join(', ') + '). Feldschema des ERP mit config.js HEADER_FIELDS abgleichen.');
  }
  // Optionale Felder nur, wenn der Export sie führt – wie eine Datei ohne die optionale Spalte
  const fields = HEADER_FIELDS.filter((f) => required.includes(f.key) || rows.some((r) => f.key in r));
  const headerRow = fields.map((f) => f.candidates[0]);
  const bySource = Object.fromEntries(Object.keys(config.sheets).map((source) => [source, []]));
  rows.forEach((r, i) => {
    const cells = fields.map((f) => {
      const raw = r[f.key] === undefined ? null : r[f.key];
      return isDateField(f.key) ? decodeIsoDate(raw) : raw;
    });
    bySource[isBlank(r.certStart) ? 'first' : 'issued'].push({ row: i + 1, cells });
  });
  const sheets = Object.entries(bySource).map(([source, list]) => ({ source, sheetName: ERP_SHEET, headerRow, rows: list }));
  return { sheets, comments: {}, meta: { sheetNames: [ERP_SHEET] } };
}

// Fehlertext aus der ERP-Antwort ({ error: '…' }), sonst leer
async function serverMessage(resp) {
  try {
    const body = await resp.json();
    return body && typeof body.error === 'string' ? ' – ' + body.error : '';
  } catch {
    return '';
  }
}

// getToken({ scopes, forceRefresh }) → Promise<string> (auth.getToken)
export function createErpAdapter({ getToken, fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined, config = CONFIG, now = () => new Date() }) {
  const erp = config.erp || {};

  function exportUrl() {
    const base = typeof erp.baseUrl === 'string' ? erp.baseUrl.trim().replace(/\/+$/, '') : '';
    if (!base || !Array.isArray(erp.scopes) || !erp.scopes.length) {
      throw new ErpConfigError('ERP-Anbindung nicht konfiguriert: CONFIG.erp.baseUrl und CONFIG.erp.scopes in config.js eintragen.');
    }
    return base + (erp.exportPath || '/saq/export/kuba');
  }

  async function get(url, forceRefresh) {
    const token = await getToken({ scopes: erp.scopes, forceRefresh });
    try {
      return await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store' });
    } catch {
      throw new ErpError('bbz-ERP nicht erreichbar (' + url + ') – Netzwerk, Basis-URL in config.js oder CORS-Freigabe des ERP für diese Seite prüfen.');
    }
  }

  async function load() {
    const url = exportUrl();
    let resp = await get(url, false);
    if (resp.status === 401) resp = await get(url, true); // Token abgelaufen: einmal erneuern
    if (!resp.ok) {
      const detail = await serverMessage(resp);
      if (resp.status === 401) throw new ErpError('Anmeldung am bbz-ERP abgelehnt (HTTP 401)' + detail + '. Scope in CONFIG.erp.scopes und Audience des ERP prüfen.', 401);
      if (resp.status === 403) throw new ErpError('Kein Zugriff auf den ERP-Export (HTTP 403)' + detail + '. Der Export verlangt ein freigeschaltetes bbz-Konto mit Admin-Rolle.', 403);
      if (resp.status === 404) throw new ErpError('ERP-Export nicht gefunden (HTTP 404): ' + url + '. CONFIG.erp.exportPath prüfen.', 404);
      throw new ErpError('Fehler des bbz-ERP (HTTP ' + resp.status + ')' + detail + '.', resp.status);
    }
    let rows;
    try {
      rows = await resp.json();
    } catch {
      throw new ErpSchemaError('Antwort des ERP ist kein gültiges JSON.');
    }
    const parsed = rowsToWorkbook(rows, config);
    return {
      ...parsed,
      meta: {
        ...parsed.meta,
        fileName: ERP_FILE_NAME,
        size: null,
        lastModified: null,
        eTag: null,
        webUrl: null,
        source: 'erp',
        loadedAt: now(),
        erp: { url, vorgaenge: rows.length },
      },
    };
  }

  // Das Änderungsprotokoll gehört zum Schreibpfad der Excel-Datei; die ERP-Quelle hat keines
  async function loadAudit() {
    return [];
  }

  return { load, loadAudit };
}
