// export.js – CSV, XLSX (SheetJS) und Druckansicht. Reine Helfer (toCsv, tableToAoa, filterLines) sind getestet;
// download*/printPage laufen nur im Browser.
//
// Tabellenmodell: { title, columns: [{ key, label }], rows: [{ [key]: value }], note? }
// Der Filterzustand steht als Kopfzeilen über jeder exportierten Tabelle.

import { DEFAULT_FILTER, MODE, dayKey } from './metrics.js';

const CRLF = '\r\n';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function fmtDate(d) {
  return validDate(d) ? pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() : '';
}

export function fmtTime(d) {
  return validDate(d) ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : '';
}

export function fmtDateTime(d) {
  return validDate(d) ? fmtDate(d) + ' ' + fmtTime(d) : '';
}

// ---------------------------------------------------------------------------
// CSV (Semikolon, CRLF – Excel de-CH)
// ---------------------------------------------------------------------------

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return fmtDate(value);
  const s = String(value);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(table, headerLines = []) {
  const lines = headerLines.map((h) => csvEscape(h));
  if (headerLines.length) lines.push('');
  lines.push(table.columns.map((c) => csvEscape(c.label)).join(';'));
  for (const row of table.rows) lines.push(table.columns.map((c) => csvEscape(row[c.key])).join(';'));
  return lines.join(CRLF);
}

// Mehrere Tabellen in einer CSV-Datei: Kopfzeilen einmal, je Tabelle Titelzeile + Tabelle, durch Leerzeile getrennt
export function tablesToCsv(tables, headerLines = []) {
  const head = headerLines.length ? headerLines.map((h) => csvEscape(h)).join(CRLF) + CRLF + CRLF : '';
  const blocks = tables.map((t) => (t.title ? csvEscape(t.title) + CRLF : '') + toCsv(t));
  return head + blocks.join(CRLF + CRLF);
}

// Array-of-Arrays für SheetJS (Zahlen bleiben Zahlen)
export function tableToAoa(table, headerLines = []) {
  const aoa = headerLines.map((h) => [h]);
  if (headerLines.length) aoa.push([]);
  aoa.push(table.columns.map((c) => c.label));
  for (const row of table.rows) {
    aoa.push(table.columns.map((c) => {
      const v = row[c.key];
      return v === null || v === undefined ? '' : v;
    }));
  }
  return aoa;
}

// ---------------------------------------------------------------------------
// Filterzustand als Textzeilen
// ---------------------------------------------------------------------------

const VSS_VSM_LABELS = { alle: 'alle', vss: 'nur VSS', vsm: 'nur VSM', ohne: 'ohne VSS/VSM' };
const VERSUCHE_LABELS = { alle: 'alle', erstversuch: 'nur 1. Versuch', mehrere: 'mehrere Versuche' };
export const MODE_LABELS = { [MODE.ERSTVERSUCH]: 'Erstversuch (nur RUN1 zählt)', [MODE.BESTANDEN]: 'Bestanden (der bestandene Run zählt)' };

function listOrAll(list) {
  return Array.isArray(list) && list.length ? list.join(', ') : 'alle';
}

export function filterLines(filter, meta = {}) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const source = meta.source === 'file' ? 'lokale Datei' : 'SharePoint';
  let file = 'Datei: ' + (meta.fileName || '–') + ' (' + source + ')';
  if (validDate(meta.lastModified)) file += ', geändert ' + fmtDateTime(meta.lastModified);
  if (validDate(meta.loadedAt)) file += ', geladen ' + fmtDateTime(meta.loadedAt);

  let period = 'alle';
  if (f.from && f.to) period = fmtDate(f.from) + ' – ' + fmtDate(f.to);
  else if (f.from) period = 'ab ' + fmtDate(f.from);
  else if (f.to) period = 'bis ' + fmtDate(f.to);

  return [
    file,
    'Zeitraum: ' + period,
    'Profil: ' + listOrAll(f.profil),
    'Sprache: ' + listOrAll(f.sprache),
    'Bank: ' + listOrAll(f.bank),
    'VSS/VSM: ' + (VSS_VSM_LABELS[f.vssVsm] || f.vssVsm),
    'Versuche: ' + (VERSUCHE_LABELS[f.versuche] || f.versuche),
    'Versuchsmodus: ' + (MODE_LABELS[f.mode] || f.mode),
    'Nur ausgestellte Zertifikate: ' + (f.onlyIssued ? 'ja' : 'nein'),
  ];
}

export function exportFileName(view, ext, now = new Date()) {
  return 'bbz-saq_' + view + '_' + dayKey(now) + '.' + ext;
}

// ---------------------------------------------------------------------------
// Browser: Download und Druck
// ---------------------------------------------------------------------------

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// csv: fertiger CSV-Text (toCsv / tablesToCsv); mit BOM für Excel
export function downloadCsv(filename, csv) {
  downloadBlob(filename, new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
}

function sheetName(title, index, used) {
  let base = String(title || 'Tabelle ' + (index + 1)).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Tabelle ' + (index + 1);
  let name = base;
  let i = 2;
  while (used.has(name)) name = base.slice(0, 25) + ' ' + i++;
  used.add(name);
  return name;
}

// tables: [{ title, columns, rows }] → eine Arbeitsmappe mit einem Sheet je Tabelle
export function downloadXlsx(filename, tables, headerLines = [], XLSX = globalThis.XLSX) {
  if (!XLSX) throw new Error('SheetJS (lib/xlsx.full.min.js) nicht geladen');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  tables.forEach((t, i) => {
    const aoa = tableToAoa(t, headerLines);
    if (t.note) aoa.push([], [t.note]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName(t.title, i, used));
  });
  XLSX.writeFile(wb, filename);
}

export function printPage() {
  window.print();
}
