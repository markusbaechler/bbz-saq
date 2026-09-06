// views/common.js – gemeinsame DOM-Helfer der Views (Tabellen, KPI-Kacheln, Abschnitte, Export-Leiste).
// Nur Rendering; Zahlen und Texte kommen aus views/tables.js.

import { downloadCsv, downloadXlsx, exportFileName, printPage, tablesToCsv } from '../export.js';
import { numericColumns, deltaView, isDeltaColumn, statusTone, STATUS_COLUMN_LABELS } from './tables.js';
import { glossaryEntry } from '../glossary.js';

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

const PCT = /^\s*(\d+(?:[.,]\d+)?)\s*%/;

// Zelle eines Tabellenmodells (PROMPT-2 A.5): data-prio; Differenzen mit Symbol, Vorzeichen und Farbe nach Richtung
// (row.direction, sonst column.direction); Statuszellen als Badge; Prozentwerte mit Datenbalken (--v). Farbe nie allein.
function cell(c, row, numeric) {
  const text = cellText(row[c.key]);
  const attrs = { 'data-prio': String(c.prio || 2) };
  const cls = numeric.has(c.key) ? ['num'] : [];
  if (isDeltaColumn(c) && /\d/.test(text)) {
    const value = Number(text.replace('−', '-').replace('±', '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(value)) {
      const d = deltaView(value, row.direction || c.direction || 'neutral');
      return el('td', { ...attrs, class: cls.concat(['delta', d.tone]).join(' ') }, [el('span', { class: 'delta-symbol', 'aria-hidden': 'true', text: d.symbol + ' ' }), text]);
    }
  }
  if (STATUS_COLUMN_LABELS.includes(c.label)) {
    const tone = statusTone(text, c.label);
    if (tone) return el('td', { ...attrs, class: cls.join(' ') || null }, [el('span', { class: 'badge status-' + tone, text })]);
  }
  const pct = !isDeltaColumn(c) && PCT.exec(text);
  if (pct) {
    cls.push('pct');
    attrs.style = '--v: ' + Math.min(100, Number(pct[1].replace(',', '.')));
  }
  return el('td', { ...attrs, class: cls.join(' ') || null, text });
}

function headerCell(c, numeric) {
  return el('th', { scope: 'col', 'data-prio': String(c.prio || 2), class: numeric.has(c.key) ? 'num' : null, text: c.label });
}

// Tabellentitel mit ⓘ (Fussnote als Tooltip; der Text steht zusätzlich in der Legende der View, Befund B9)
function captionNode(title, note) {
  return el('caption', {}, [el('span', { class: 'caption-text', text: title }), note ? infoIcon(note) : null]);
}

// Schalter «Alle Spalten»: hebt die Ausblendung nach data-prio auf (Paket B blendet Prio 2/3 per Breakpoint aus;
// auf dem Desktop sind alle Spalten sichtbar und der Schalter ist ausgeblendet)
function allColumnsToggle(wrap, columns) {
  if (!columns.some((c) => (c.prio || 2) > 1)) return null;
  const btn = el('button', { type: 'button', class: 'link all-columns', 'aria-pressed': 'false', text: 'Alle Spalten' });
  btn.addEventListener('click', () => {
    const on = wrap.classList.toggle('all-columns');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Weniger Spalten' : 'Alle Spalten';
  });
  return btn;
}

// Tabellenmodell → <div class="table-wrap"><table>…; Zeilen mit small=true erhalten die Klasse «small».
// Fussnoten (note) erscheinen nicht mehr unter der Tabelle, sondern als ⓘ am Titel und in der Legende der View.
export function renderTable(table, { caption = true } = {}) {
  const numeric = numericColumns(table); // Befund 13: Zahlen- und Prozentspalten rechtsbündig
  const thead = el('thead', {}, [el('tr', {}, table.columns.map((c) => headerCell(c, numeric)))]);
  const tbody = el('tbody', {}, table.rows.map((row) => el('tr', { class: row.small ? 'small' : null }, table.columns.map((c) => cell(c, row, numeric)))));
  const children = [];
  if (caption && table.title) children.push(captionNode(table.title, table.note));
  children.push(thead, tbody);
  const wrap = el('div', { class: 'table-wrap' }, [el('table', { class: 'data' }, children)]);
  const toggle = allColumnsToggle(wrap, table.columns);
  if (toggle) wrap.appendChild(toggle);
  if (!table.rows.length) wrap.appendChild(el('p', { class: 'empty', text: table.empty || 'Keine Daten für den aktiven Filter.' }));
  return wrap;
}

// Tabelle mit aufklappbaren Zeilen: detail(row, i) liefert den Inhalt unter der Zeile (oder null → nicht aufklappbar).
// Die Zeile ist ein Button (Klick, Enter, Leertaste) mit aria-expanded/aria-controls; die Detailzeile ist bis zum Aufklappen hidden.
// hint: Bedienhinweis, erscheint mit der Fussnote als ⓘ am Titel.
let expandableSeq = 0;
export function renderExpandableTable(table, { detail, hint = null } = {}) {
  const numeric = numericColumns(table);
  const cols = table.columns;
  const thead = el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', class: 'toggle', 'data-prio': '1', 'aria-label': 'Aufklappen' })].concat(cols.map((c) => headerCell(c, numeric))))]);
  const tbody = el('tbody');
  table.rows.forEach((row, i) => {
    const content = detail ? detail(row, i) : null;
    const id = 'xp-' + (++expandableSeq);
    const tr = el('tr', {
      class: 'expandable' + (row.small ? ' small' : ''),
      role: content ? 'button' : null, tabindex: content ? '0' : null, 'aria-expanded': content ? 'false' : null, 'aria-controls': content ? id : null,
    }, [el('td', { class: 'toggle', 'data-prio': '1' })].concat(cols.map((c) => cell(c, row, numeric))));
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
  const info = [table.rows.length && hint ? hint : null, table.note].filter(Boolean).join(' ');
  if (table.title) children.push(captionNode(table.title, info || null));
  children.push(thead, tbody);
  const wrap = el('div', { class: 'table-wrap' }, [el('table', { class: 'data expandable-table' }, children)]);
  const columnsToggle = allColumnsToggle(wrap, cols);
  if (columnsToggle) wrap.appendChild(columnsToggle);
  if (!table.rows.length) wrap.appendChild(el('p', { class: 'empty', text: table.empty || 'Keine Daten für den aktiven Filter.' }));
  return wrap;
}

// Einklappbarer Block (<details>). printOpen: wird für den Druck automatisch geöffnet (app.js, beforeprint).
export function renderCollapsible(summaryText, nodes, { open = false, printOpen = true } = {}) {
  return el('details', { class: 'fold' + (printOpen ? ' print-open' : ''), open: open ? '' : null }, [el('summary', { text: summaryText })].concat(nodes));
}

// KPI-Kachel (PROMPT-2 A.4): Label als Glossar-Link (wenn ein Eintrag mit dieser Beschriftung existiert und glossaryHref
// gegeben ist) plus ⓘ mit der Definition; Wert; n; Differenz zum Benchmark mit Symbol, Vorzeichen und Farbe nach Richtung.
// Mengen (kind count oder ohne kind) sind kleinere Kacheln ohne Differenz.
function kpiTile(k, glossaryHref) {
  const isCount = !k.kind || k.kind === 'count';
  const label = glossaryHref && glossaryEntry(k.label) ? el('a', { href: glossaryHref(k.label), text: k.label }) : k.label;
  const d = !isCount && typeof k.delta === 'number' && Number.isFinite(k.delta) ? deltaView(k.delta, k.direction) : null;
  return el('div', { class: 'kpi' + (k.small ? ' small' : '') + (isCount ? ' count' : '') }, [
    el('div', { class: 'kpi-label' }, [label, k.hint ? infoIcon(k.hint, 'Definition: ') : null]),
    el('div', { class: 'kpi-value', text: k.value }),
    el('div', { class: 'kpi-n', text: (k.count !== null && k.count !== undefined ? k.count + ' von ' + k.n + ' Vorgängen' : 'n = ' + k.n) + (k.small ? ' *' : '') }),
    d ? el('div', { class: 'kpi-delta ' + d.tone }, [
      el('span', { class: 'kpi-delta-symbol', 'aria-hidden': 'true', text: d.symbol + ' ' }),
      el('span', { class: 'kpi-delta-value', text: d.text }),
      el('span', { class: 'kpi-delta-vs', text: ' vs. ' + (k.benchmarkLabel || 'Benchmark') + (k.benchmark ? ' (' + k.benchmark + ')' : '') }), // auf Phone ausgeblendet (B.3)
    ]) : null,
  ]);
}

// KPI-Kacheln: [{ label, value, n, small, hint, kind, group, direction, delta, benchmark, benchmarkLabel }]
// Mit group werden Blöcke Mengen · Schriftlich · Mündlich mit h3 gerendert; ohne group eine einzelne Reihe.
// Auf Phone (B.3) sind die Blöcke aufklappbare details: Schriftlich und Mündlich offen, Mengen zu; im Druck alle offen.
export function renderKpis(kpis, { glossaryHref = null, phone = isPhone() } = {}) {
  const tile = (k) => kpiTile(k, glossaryHref);
  const groups = ['Mengen', 'Schriftlich', 'Mündlich'].map((g) => ({ g, list: kpis.filter((k) => k.group === g) })).filter((x) => x.list.length);
  if (!groups.length) return el('div', { class: 'kpis' }, kpis.map(tile));
  if (phone) {
    return el('div', { class: 'kpi-groups' }, groups.map(({ g, list }) => el('details', { class: 'kpi-group print-open', open: g === 'Mengen' ? null : '' }, [
      el('summary', { text: g }), el('div', { class: 'kpis' }, list.map(tile)),
    ])));
  }
  return el('div', { class: 'kpi-groups' }, groups.map(({ g, list }) => el('section', { class: 'kpi-group' }, [el('h3', { text: g }), el('div', { class: 'kpis' }, list.map(tile))])));
}

// Geräteklasse (PROMPT-2 B.1): Phone ≤ 600 px über matchMedia (nur Bildschirm, nicht im Druck); in Node (kein matchMedia) nie Phone
const PHONE_QUERY = 'screen and (max-width: 600px)';
export function isPhone(mm = globalThis.matchMedia) {
  return typeof mm === 'function' ? !!mm(PHONE_QUERY).matches : false;
}

// Ruft fn(phone) auf, wenn die Geräteklasse dauerhaft wechselt (Phone ↔ grösser); gibt eine Abmeldefunktion zurück.
// Entprellt (delay): kurze Hin-und-her-Wechsel (z. B. Vollseiten-Screenshots, Browser-Leisten) lösen kein Neurendern aus.
export function onViewportChange(fn, mm = globalThis.matchMedia, { delay = 150, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {}) {
  if (typeof mm !== 'function') return () => {};
  const mql = mm(PHONE_QUERY);
  let last = !!mql.matches;
  let timer = null;
  const handler = () => {
    clearTimer(timer);
    timer = setTimer(() => {
      const now = !!mql.matches;
      if (now === last) return;
      last = now;
      fn(now);
    }, delay);
  };
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else if (mql.addListener) mql.addListener(handler);
  return () => {
    clearTimer(timer);
    if (mql.removeEventListener) mql.removeEventListener('change', handler);
    else if (mql.removeListener) mql.removeListener(handler);
  };
}

// Initialen für den Konto-Button auf Phone (B.2): «Anna Muster» → AM, «Muster, Anna» → MA, «anna.muster@…» → AM, leer → ?
export function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const local = s.includes('@') ? s.split('@')[0] : s;
  const parts = local.split(/[\s.,_-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

// Leerzustand (PROMPT-2 A.7): eine Karte mit zwei Aktionen statt Fliesstext. canLoad = Azure-Konfiguration vorhanden.
export function renderEmptyState({ canLoad = true, onLoad, onFile }) {
  return el('div', { class: 'empty-card', role: 'region', 'aria-label': 'Keine Daten geladen' }, [
    el('h3', { text: 'Noch keine Daten geladen' }),
    el('p', { text: 'Die Excel-Datei wird nur im Browser gehalten; nichts wird gespeichert oder hochgeladen.' }),
    el('div', { class: 'actions' }, [
      el('button', { type: 'button', text: 'Anmelden und laden', disabled: !canLoad, title: canLoad ? null : 'Azure-Konfiguration fehlt (config.js)', onclick: onLoad }),
      el('button', { type: 'button', class: 'secondary', text: 'Lokale Excel-Datei prüfen', onclick: onFile }),
    ]),
  ]);
}

// ⓘ mit Tooltip; für Screenreader als Bild mit Beschriftung
export function infoIcon(text, prefix = 'Hinweis: ') {
  return el('span', { class: 'info', title: text, role: 'img', 'aria-label': prefix + text, text: 'ⓘ' });
}

// Abschnitt (PROMPT-2 A.3): h3 mit optionalem ⓘ (info = Erklärung als Tooltip; der Text steht zusätzlich in der Legende
// der View) und optionalem Kurzwert (meta, z. B. «5 Termine an 3 Prüfungstagen»). Keine Erklärungsabsätze mehr im Fluss.
export function section(title, nodes, { info = null, meta = null } = {}) {
  const head = el('h3', {}, [title, info ? infoIcon(info) : null, meta ? el('span', { class: 'section-meta', text: meta }) : null]);
  const node = el('section', { class: 'block' }, [head].concat(nodes));
  // Kein Doppeltitel (Befund B8): eine caption mit dem Titel des Abschnitts bleibt nur für Screenreader; ihr ⓘ wandert an den Titel
  for (const cap of node.querySelectorAll('table > caption')) {
    const text = cap.querySelector('.caption-text');
    if (!text || text.textContent !== title) continue;
    cap.classList.add('visually-hidden');
    const icon = cap.querySelector('.info');
    if (icon && !head.querySelector('.info')) head.insertBefore(icon, head.querySelector('.section-meta'));
  }
  return node;
}

// Sammelt Abschnitts-Erklärungen für die Legende der View (app.js): sec(title, nodes, intro, meta)
export function hinted(hints) {
  return (title, nodes, intro = null, meta = null) => {
    if (intro) hints.push(title + ': ' + intro);
    return section(title, nodes, { info: intro, meta });
  };
}

// Export-Menü (PROMPT-2 A.3, Befund B5): ein Aufklappmenü statt Button-Leiste – CSV (alle Tabellen in einer Datei),
// XLSX (ein Blatt je Tabelle), Druckansicht; extra = { label, tables }: Vorgangsebene (mit Namen, nur intern), eigene
// Dateien mit Suffix «-vorgaenge». Per Tastatur bedienbar (details/summary); schliesst nach der Wahl.
export function renderExportMenu({ viewId, tables, headerLines, extra = null }) {
  const disabled = !tables.length;
  const menu = el('details', { class: 'menu export-menu' });
  const item = (text, onclick, dis = false) => el('button', { type: 'button', class: 'menu-item', disabled: dis, text, onclick: () => { menu.open = false; onclick(); } });
  const items = [
    el('div', { class: 'menu-note', text: 'Aggregate dieser Ansicht, Filterzustand im Kopf' }),
    item('CSV', () => downloadCsv(exportFileName(viewId, 'csv'), tablesToCsv(tables, headerLines)), disabled),
    item('XLSX', () => downloadXlsx(exportFileName(viewId, 'xlsx'), tables, headerLines), disabled),
    item('Druckansicht', () => printPage()),
  ];
  if (extra && extra.tables && extra.tables.length) {
    const rows = extra.tables[0].rows.length;
    items.push(
      el('div', { class: 'menu-note', text: extra.label + ' (' + rows + ' Vorgänge, mit Namen, nur intern)' }),
      item('CSV (Vorgangsebene)', () => downloadCsv(exportFileName(viewId + '-vorgaenge', 'csv'), tablesToCsv(extra.tables, headerLines)), !rows),
      item('XLSX (Vorgangsebene)', () => downloadXlsx(exportFileName(viewId + '-vorgaenge', 'xlsx'), extra.tables, headerLines), !rows),
    );
  }
  menu.append(el('summary', { text: 'Export' }), el('div', { class: 'menu-list', role: 'group', 'aria-label': 'Export' }, items));
  return menu;
}
