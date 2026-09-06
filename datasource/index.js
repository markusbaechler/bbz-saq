// datasource/index.js – einziges Interface der Datenschicht nach aussen.
//   load()            → { sheets, comments, meta }   Phase 1: fileAdapter (Download via Graph + Parse)
//   loadFromFile(file)→ { sheets, comments, meta }   gleiche Parse-Logik für eine lokal gewählte Datei (nur Browser-Memory)
//   write(change)     → { ok, written, conflict, itemVersion, audit }   Phase 2: workbookAdapter (Workbook-API), nur mit CONFIG.features.write
// Views und Metrics greifen nie direkt auf Graph zu.

import { getAuth } from '../auth.js';
import { createGraphClient } from '../graph.js';
import { createFileAdapter, parseWorkbook, NotImplementedError } from './fileAdapter.js';
import { createWorkbookAdapter, WriteConflictError, WriteForbiddenError, WriteHeaderError } from './workbookAdapter.js';
import { CONFIG } from '../config.js';

export { NotImplementedError, WriteConflictError, WriteForbiddenError, WriteHeaderError };

function libs() {
  const XLSX = globalThis.XLSX;
  const fflate = globalThis.fflate;
  if (!XLSX || !fflate) {
    throw new Error('Bibliotheken nicht geladen – lib/xlsx.full.min.js und lib/fflate.umd.js müssen in index.html eingebunden sein.');
  }
  return { XLSX, fflate };
}

let adapter = null;

function getAdapter() {
  if (!adapter) {
    const auth = getAuth();
    const graph = createGraphClient({ getToken: (options) => auth.getToken(options) });
    adapter = createFileAdapter({ graph, ...libs() });
  }
  return adapter;
}

export async function load() {
  return getAdapter().load();
}

export async function loadFromFile(file) {
  const buffer = await file.arrayBuffer();
  const parsed = parseWorkbook(buffer, libs());
  return {
    ...parsed,
    meta: {
      ...parsed.meta,
      fileName: file.name,
      size: file.size,
      lastModified: file.lastModified ? new Date(file.lastModified) : null,
      webUrl: null,
      source: 'file',
      loadedAt: new Date(),
    },
  };
}

// Schreibpfad (Paket E, E.2): write(change) → workbookAdapter mit Schreib-Scopes (inkrementelle Zustimmung beim ersten Schreiben).
// change = { sheet, row, field, header | candidates, value, expected?, expectedItem?, reason } → { ok, written, conflict, itemVersion, audit }
let writeAdapter = null;

function getWriteAdapter() {
  if (!writeAdapter) {
    const auth = getAuth();
    const graph = createGraphClient({ getToken: (options) => auth.getToken({ ...(options || {}), scopes: CONFIG.auth.writeScopes }) });
    writeAdapter = createWorkbookAdapter({ graph, account: () => auth.getAccount() });
  }
  return writeAdapter;
}

export async function write(change = {}) {
  return getWriteAdapter().write(change);
}
