// views/common.js – gemeinsame DOM-Helfer der Views (Tabellen, KPI-Kacheln, Abschnitte, Export-Leiste).
// Nur Rendering; Zahlen und Texte kommen aus views/tables.js.

import { downloadCsv, downloadXlsx, exportFileName, printPage, tablesToCsv } from '../export.js';
import { numericColumns } from './tables.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function cellText(v) {
  return v === null || v === undefined ? '' : String(v);
}

// Tabellenmodell → <div class="table-wrap"><table>…; Zeilen mit small=true erhalten die Klasse «small»
export function renderTable(table, { caption = true } = {}) {
  const numeric = numericColumns(table); // Befund 13: Zahlen- und Prozentspalten rechtsbündig
  const thead = el('thead', {}, [el('tr', {}, table.columns.map((c) => el('th', { scope: 'col', class: numeric.has(c.key) ? 'num' : null, text: c.label })))]);
  const tbody = el('tbody', {}, table.rows.map((row) => el('tr', { class: row.small ? 'small' : null }, table.columns.map((c) => el('td', { class: numeric.has(c.key) ? 'num' : null, text: cellText(row[c.key]) })))));
  const children = [];
  if (caption && table.title) children.push(el('caption', { text: table.title }));
  children.push(thead, tbody);
  const wrap = el('div', { class: 'table-wrap' }, [el('table', { class: 'data' }, children)]);
  if (!table.rows.length) wrap.appendChild(el('p', { class: 'empty', text: table.empty || 'Keine Daten für den aktiven Filter.' }));
  if (table.note) wrap.appendChild(el('p', { class: 'note', text: table.note }));
  return wrap;
}

// Tabelle mit aufklappbaren Zeilen: detail(row, i) liefert den Inhalt unter der Zeile (oder null → nicht aufklappbar).
// Die Zeile ist ein Button (Klick, Enter, Leertaste) mit aria-expanded/aria-controls; die Detailzeile ist bis zum Aufklappen hidden.
let expandableSeq = 0;
export function renderExpandableTable(table, { detail, hint = null } = {}) {
  const numeric = numericColumns(table);
  const cols = table.columns;
  const thead = el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', class: 'toggle', 'aria-label': 'Aufklappen' })]
    .concat(cols.map((c) => el('th', { scope: 'col', class: numeric.has(c.key) ? 'num' : null, text: c.label }))))]);
  const tbody = el('tbody');
  table.rows.forEach((row, i) => {
    const content = detail ? detail(row, i) : null;
    const id = 'xp-' + (++expandableSeq);
    const tr = el('tr', {
      class: 'expandable' + (row.small ? ' small' : ''),
      role: content ? 'button' : null, tabindex: content ? '0' : null, 'aria-expanded': content ? 'false' : null, 'aria-controls': content ? id : null,
    }, [el('td', { class: 'toggle' })].concat(cols.map((c) => el('td', { class: numeric.has(c.key) ? 'num' : null, text: cellText(row[c.key]) }))));
    tbody.appendChild(tr);
    if (!content) return;
    const detailRow = el('tr', { class: 'event-detail', id, hidden: true }, [el('td', { colspan: String(cols.length + 1) }, [content])]);
    tbody.appendChild(detailRow);
    const toggle = () => {
      const open = detailRow.hidden;
      detailRow.hidden = !open;
      tr.setAttribute('aria-expanded', String(open));
    };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
  });
  const children = [];
  if (table.title) children.push(el('caption', { text: table.title }));
  children.push(thead, tbody);
  const wrap = el('div', { class: 'table-wrap' }, [el('table', { class: 'data expandable-table' }, children)]);
  if (!table.rows.length) wrap.appendChild(el('p', { class: 'empty', text: table.empty || 'Keine Daten für den aktiven Filter.' }));
  const note = [table.rows.length && hint ? hint : null, table.note].filter(Boolean).join(' ');
  if (note) wrap.appendChild(el('p', { class: 'note', text: note }));
  return wrap;
}

// Einklappbarer Block (<details>). printOpen: wird für den Druck automatisch geöffnet (app.js, beforeprint).
export function renderCollapsible(summaryText, nodes, { open = false, printOpen = true } = {}) {
  return el('details', { class: 'fold' + (printOpen ? ' print-open' : ''), open: open ? '' : null }, [el('summary', { text: summaryText })].concat(nodes));
}

// KPI-Kacheln: [{ label, value, n, small }]
export function renderKpis(kpis) {
  return el('div', { class: 'kpis' }, kpis.map((k) => el('div', { class: 'kpi' + (k.small ? ' small' : ''), title: k.hint || null }, [
    el('div', { class: 'kpi-label', text: k.label }),
    el('div', { class: 'kpi-value', text: k.value }),
    el('div', { class: 'kpi-n', text: (k.count !== null && k.count !== undefined ? k.count + ' von ' + k.n + ' Vorgängen' : 'n = ' + k.n) + (k.small ? ' *' : '') }),
    k.benchmark ? el('div', { class: 'kpi-bench', text: 'Benchmark: ' + k.benchmark }) : null,
    k.hint ? el('div', { class: 'kpi-hint', text: k.hint }) : null,
  ])));
}

export function section(title, nodes, { intro = null } = {}) {
  const children = [el('h3', { text: title })];
  if (intro) children.push(el('p', { class: 'meta-list', text: intro }));
  return el('section', { class: 'block' }, children.concat(nodes));
}

// Export-Leiste: CSV (alle Tabellen in einer Datei), XLSX (ein Sheet je Tabelle), Druckansicht.
// extra = { label, tables }: zusätzlicher Export auf Vorgangsebene (a7), eigene Dateien mit Suffix «-vorgaenge».
export function exportBar({ viewId, tables, headerLines, extra = null }) {
  const disabled = !tables.length;
  const children = [
    el('span', { class: 'meta-list', text: 'Export (Aggregate dieser Ansicht, Filterzustand im Kopf):' }),
    el('button', { type: 'button', class: 'secondary small-button', disabled, text: 'CSV', onclick: () => downloadCsv(exportFileName(viewId, 'csv'), tablesToCsv(tables, headerLines)) }),
    el('button', { type: 'button', class: 'secondary small-button', disabled, text: 'XLSX', onclick: () => downloadXlsx(exportFileName(viewId, 'xlsx'), tables, headerLines) }),
    el('button', { type: 'button', class: 'secondary small-button', text: 'Druckansicht', onclick: () => printPage() }),
  ];
  if (extra && extra.tables && extra.tables.length) {
    const rows = extra.tables[0].rows.length;
    children.push(
      el('span', { class: 'meta-list', text: '· ' + extra.label + ' (' + rows + ' Vorgänge, mit Namen):' }),
      el('button', { type: 'button', class: 'secondary small-button', disabled: !rows, text: 'CSV', onclick: () => downloadCsv(exportFileName(viewId + '-vorgaenge', 'csv'), tablesToCsv(extra.tables, headerLines)) }),
      el('button', { type: 'button', class: 'secondary small-button', disabled: !rows, text: 'XLSX', onclick: () => downloadXlsx(exportFileName(viewId + '-vorgaenge', 'xlsx'), extra.tables, headerLines) }),
    );
  }
  return el('div', { class: 'toolbar export-bar' }, children);
}
