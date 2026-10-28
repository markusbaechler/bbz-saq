// tests/erpExport.js – Testhilfe: Sheets im Eingabevertrag von store.normalizeWorkbook (fileAdapter, fixtures.makeSheet)
// → Vorgänge im Format des ERP-Exports GET /saq/export/kuba (logische Feldschlüssel aus HEADER_FIELDS, Datum «JJJJ-MM-TT»,
// leere Zellen ''). Bildet nur das Transportformat ab, nicht die Fachlogik des ERP: Werte bleiben roh, damit derselbe
// Inhalt über beide Quellen durch store.js läuft. Nur synthetische Daten, keine Personendaten.

import { HEADER_FIELDS } from '../config.js';
import { resolveHeaders, isBlank } from '../store.js';

function isoDay(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// Zellwert → Exportwert: Datum als «JJJJ-MM-TT» (Uhrzeit entfällt wie im ERP), leer als '', sonst unverändert
function exportValue(v) {
  if (v instanceof Date) return isoDay(v);
  return v === null || v === undefined ? '' : v;
}

// { sheets } → [{ lastName, …, 'we1.run1.date': '2024-03-01', …, erpFallId }]; Zeilen ohne Inhalt in gemappten Spalten entfallen
export function erpRowsFromSheets(sheets) {
  const out = [];
  for (const { source, sheetName, headerRow, rows } of sheets) {
    const map = resolveHeaders(headerRow, source, sheetName);
    for (const { row, cells } of rows) {
      if (!cells || !Object.values(map).some((i) => !isBlank(cells[i]))) continue;
      const r = {};
      for (const f of HEADER_FIELDS) {
        if (map[f.key] !== undefined) r[f.key] = exportValue(cells[map[f.key]]);
      }
      // Sheet-Zuordnung im erpAdapter über certStart; Fixtures ohne Zertifikatsspalten tragen sie leer
      if (!('certStart' in r)) r.certStart = '';
      r.erpFallId = 'synth-' + (out.length + 1);
      out.push(r);
    }
  }
  return out;
}
