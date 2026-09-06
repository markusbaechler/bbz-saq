// datasource/index.js – einziges Interface der Datenschicht nach aussen.
//   load()            → { sheets, comments, meta }   Phase 1: fileAdapter (Download via Graph + Parse)
//   loadFromFile(file)→ { sheets, comments, meta }   gleiche Parse-Logik für eine lokal gewählte Datei (nur Browser-Memory)
//   write({ sheet, row, header, value, expected, reason }) → { ok, written, conflict, itemVersion }
//                     Phase 2 (Paket E): wirft bis dahin NotImplementedError; nur mit CONFIG.features.write
// Views und Metrics greifen nie direkt auf Graph zu.

import { getAuth } from '../auth.js';
import { createGraphClient } from '../graph.js';
import { createFileAdapter, parseWorkbook, NotImplementedError } from './fileAdapter.js';

export { NotImplementedError };

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

// Phase 2 (PROMPT-2 C.8, Paket E): genau eine Zelle in einer bestehenden Spalte (Header-Name, nie Spaltenbuchstabe) über die
// Graph-Workbook-API; expected = erwarteter aktueller Zellwert (Konfliktprüfung), reason = Begründung fürs Audit-Protokoll.
// Rückgabe { ok, written, conflict, itemVersion }. Bis zur Umsetzung NotImplementedError; die Struktur der Datei bleibt unverändert (E10).
export async function write({ sheet, row, header, value, expected = null, reason = '' } = {}) {
  void sheet; void row; void header; void value; void expected; void reason;
  throw new NotImplementedError('Schreiben ist erst in Phase 2 (Workbook-API) vorgesehen.');
}
