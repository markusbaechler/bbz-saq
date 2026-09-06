#!/usr/bin/env node
// tools/headers.js – Header-Übersicht beider Sheets einer lokalen Excel-Kopie (PROMPT-2 D.2, Header-Verifikation vor jedem Mapping):
// je Header Spaltenbuchstabe, Anzahl gefüllte Zellen, Anzahl unterschiedlicher Werte und eine Markierung für Experten-Header.
// Gibt NIE Zellwerte aus (keine Personendaten). Die Datei wird nur gelesen; nichts wird gespeichert oder übertragen.
// Aufruf: node tools/headers.js local/Reporting_KUBA.xlsx

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CONFIG } from '../config.js';

export const EXPERT_HEADER_REGEX = /expert|examiner|experte|prüfer|pruefer/i;

// 0 → A, 25 → Z, 26 → AA (Excel-Spaltenbuchstaben)
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

function blank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// sheet = { source, sheetName, headerRow, rows: [{ row, cells }] } (Parser-Format aus datasource/fileAdapter.js)
export function headerSummary(sheet) {
  return sheet.headerRow.map((h, i) => {
    const header = h === null || h === undefined ? '' : String(h).trim();
    const values = new Set();
    let filled = 0;
    for (const { cells } of sheet.rows) {
      const v = cells ? cells[i] : null;
      if (blank(v)) continue;
      filled += 1;
      values.add(v instanceof Date ? v.getTime() : String(v).trim().toLowerCase());
    }
    return { column: columnLetter(i), index: i, header, filled, distinct: values.size, expert: EXPERT_HEADER_REGEX.test(header) };
  });
}

// Markdown-Bericht je Sheet: nur Header und Zahlen
export function formatSummary(sheets) {
  const out = [];
  for (const sheet of sheets) {
    out.push('## ' + sheet.sheetName + ' (' + sheet.rows.length + ' Zeilen ab Zeile ' + CONFIG.dataStartRow + ')', '', '| Spalte | Header | gefüllt | unterschiedlich | Experte? |', '|---|---|---|---|---|');
    for (const s of headerSummary(sheet)) out.push('| ' + s.column + ' | ' + (s.header || '(leer)') + ' | ' + s.filled + ' | ' + s.distinct + ' | ' + (s.expert ? '**ja**' : '') + ' |');
    out.push('');
  }
  return out.join('\n');
}

const isMain = typeof process !== 'undefined' && process.argv && String(process.argv[1] || '').replace(/\\/g, '/').endsWith('tools/headers.js');
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error('Aufruf: node tools/headers.js <Reporting_KUBA.xlsx>');
    process.exit(2);
  }
  const require = createRequire(import.meta.url);
  const { parseWorkbook } = await import('../datasource/fileAdapter.js');
  const libs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };
  const parsed = parseWorkbook(new Uint8Array(readFileSync(path)), libs);
  console.log('# Header-Übersicht – ' + path.split(/[\\/]/).pop() + ' (nur Header und Zahlen, keine Zellwerte)');
  console.log('');
  console.log(formatSummary(parsed.sheets));
}
