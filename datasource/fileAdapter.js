// datasource/fileAdapter.js – Phase 1: Datei-Download via Microsoft Graph + Parse mit SheetJS.
//
// Auflösung zur Laufzeit (Zwischenresultate nur im Memory):
//   GET /sites/{siteHost}:{sitePath}          → siteId
//   GET /sites/{siteId}/drive                 → driveId
//   GET /drives/{driveId}/root:/{filePath}    → itemId
//   GET /drives/{driveId}/items/{itemId}?$select=…,@microsoft.graph.downloadUrl → Download-URL (CORS-fähig, ohne Token)
//   Fallback: GET /drives/{driveId}/items/{itemId}/content
// Gelesen werden ausschliesslich die Sheets aus CONFIG.sheets (SheetJS-Option «sheets»).
// Ausgabe = Eingabevertrag von store.normalizeWorkbook: { sheets, comments, meta }.

import { CONFIG } from '../config.js';
import { NotFoundError } from '../graph.js';
import { extractThreadedComments } from './threadedComments.js';

export const DRIVE_ITEM_SELECT = 'id,name,size,lastModifiedDateTime,eTag,webUrl,@microsoft.graph.downloadUrl'; // eTag: Konfliktprüfung des Schreibpfads (Paket E)

export class FileNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

export class SheetMissingError extends Error {
  constructor(sheetName) {
    super('Sheet «' + sheetName + '» fehlt in der Excel-Datei. Erwartet werden die Sheets ' + Object.values(CONFIG.sheets).map((n) => '«' + n + '»').join(' und ') + '.');
    this.name = 'SheetMissingError';
    this.sheetName = sheetName;
  }
}

export class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

function encodePath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

// Site → Drive → Item; cache = { siteId, driveId, itemId } (Memory)
export async function resolveDriveItem(graph, sp = CONFIG.sharepoint, cache = {}) {
  if (!cache.siteId) {
    try {
      cache.siteId = (await graph.getJson('/sites/' + sp.siteHost + ':' + sp.sitePath)).id;
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new FileNotFoundError('SharePoint-Site nicht gefunden: ' + sp.siteHost + sp.sitePath + ' – Site-Pfad in config.js und Zugriffsrechte prüfen.');
      }
      throw e;
    }
  }
  if (!cache.driveId) {
    cache.driveId = (await graph.getJson('/sites/' + cache.siteId + '/drive')).id;
  }
  if (!cache.itemId) {
    try {
      cache.itemId = (await graph.getJson('/drives/' + cache.driveId + '/root:/' + encodePath(sp.filePath))).id;
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new FileNotFoundError('Datei nicht gefunden: «' + sp.filePath + '» in der Dokumentbibliothek der Site ' + sp.sitePath + ' – Dateipfad in config.js und Zugriffsrechte prüfen.');
      }
      throw e;
    }
  }
  return { siteId: cache.siteId, driveId: cache.driveId, itemId: cache.itemId };
}

const PACKAGE_XML = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/_rels\/[^/]+\.rels|threadedComments\/[^/]+\.xml)$/;

function readPackageXml(data, fflate) {
  const unzipped = fflate.unzipSync(data, { filter: (file) => PACKAGE_XML.test(file.name) });
  const files = {};
  for (const [path, bytes] of Object.entries(unzipped)) files[path] = fflate.strFromU8(bytes);
  return files;
}

// Zellen exakt auf Header-Breite (Spalten ohne Header werden nie gelesen)
function padRow(cells, width) {
  const out = [];
  for (let i = 0; i < width; i++) out.push(cells[i] === undefined ? null : cells[i]);
  return out;
}

// Header-Zeile bis zum letzten nicht leeren Header (Excel-Blattbereiche reichen oft bis Spalte XFD)
function trimHeader(rawHeader) {
  let last = rawHeader.length - 1;
  while (last >= 0 && (rawHeader[last] === null || rawHeader[last] === undefined || String(rawHeader[last]).trim() === '')) last -= 1;
  return rawHeader.slice(0, last + 1).map((v) => (v === null || v === undefined ? '' : v));
}

// ArrayBuffer/Uint8Array → { sheets, comments, meta: { sheetNames } }
export function parseWorkbook(buffer, { XLSX, fflate, config = CONFIG }) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const entries = Object.entries(config.sheets); // [['first', name], ['issued', name]]
  const sheetNames = entries.map(([, name]) => name);

  const wb = XLSX.read(data, { type: 'array', cellDates: true, sheets: sheetNames });
  const sheets = [];
  for (const [source, sheetName] of entries) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new SheetMissingError(sheetName);
    // Nur bis zur letzten nicht leeren Header-Zelle lesen: Blattbereiche reichen oft bis Spalte XFD,
    // und sheet_to_json würde sonst je Zeile Tausende leere Zellen erzeugen.
    const full = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const headerIndex = config.headerRow - 1;
    let lastCol = -1;
    for (let c = full.s.c; c <= full.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerIndex, c })];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') lastCol = c;
    }
    const range = { s: { r: headerIndex, c: full.s.c }, e: { r: Math.max(full.e.r, headerIndex), c: Math.max(lastCol, full.s.c) } };
    const aoa = lastCol < 0 ? [] : XLSX.utils.sheet_to_json(ws, { header: 1, range, defval: null, blankrows: true, raw: true });
    const headerRow = trimHeader(aoa[0] || []);
    const rows = aoa.slice(1).map((cells, i) => ({ row: config.headerRow + 1 + i, cells: padRow(cells, headerRow.length) }));
    sheets.push({ source, sheetName, headerRow, rows });
  }

  const comments = extractThreadedComments(readPackageXml(data, fflate), sheetNames);
  return { sheets, comments, meta: { sheetNames } };
}

export function createFileAdapter({ graph, XLSX, fflate, config = CONFIG }) {
  const cache = {};

  async function fetchItem() {
    const { driveId, itemId } = await resolveDriveItem(graph, config.sharepoint, cache);
    const item = await graph.getJson('/drives/' + driveId + '/items/' + itemId + '?$select=' + DRIVE_ITEM_SELECT);
    return { driveId, itemId, item };
  }

  async function load() {
    let info;
    try {
      info = await fetchItem();
    } catch (e) {
      // Item-ID veraltet (Datei ersetzt/verschoben): einmal neu auflösen
      if (e instanceof NotFoundError && cache.itemId) {
        delete cache.itemId;
        info = await fetchItem();
      } else {
        throw e;
      }
    }
    const { driveId, itemId, item } = info;
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    const buffer = downloadUrl
      ? await graph.request(downloadUrl, { auth: false, responseType: 'arraybuffer' })
      : await graph.getBinary('/drives/' + driveId + '/items/' + itemId + '/content');

    const parsed = parseWorkbook(buffer, { XLSX, fflate, config });
    return {
      ...parsed,
      meta: {
        ...parsed.meta,
        fileName: item.name,
        size: item.size === undefined ? null : item.size,
        lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
        eTag: item.eTag || null,
        webUrl: item.webUrl === undefined ? null : item.webUrl,
        source: 'graph',
        loadedAt: new Date(),
      },
    };
  }

  async function write() {
    throw new NotImplementedError('Schreiben ist erst in Phase 2 (Workbook-API) vorgesehen.');
  }

  return {
    load,
    write,
    parseBuffer: (buffer) => parseWorkbook(buffer, { XLSX, fflate, config }),
  };
}
