// views/dataQuality.js – View 6 «Datenqualität»: Sheet, Zeile, Header, Rohwert, Grund – sortier- und filterbar.
// Reine Helfer (sortDq, filterDq, formatRaw) sind in tests/dataQuality.test.js getestet; render* baut das DOM.

import { CONFIG } from '../config.js';

export const DQ_COLUMNS = [
  { key: 'sheet', label: 'Sheet' },
  { key: 'row', label: 'Zeile' },
  { key: 'header', label: 'Header' },
  { key: 'raw', label: 'Rohwert' },
  { key: 'reason', label: 'Grund' },
];

const collator = new Intl.Collator('de-CH', { numeric: true });

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatRaw(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return 'Invalid Date';
    return pad2(raw.getDate()) + '.' + pad2(raw.getMonth() + 1) + '.' + raw.getFullYear() + ' ' + pad2(raw.getHours()) + ':' + pad2(raw.getMinutes());
  }
  if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE';
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function compareValues(a, b) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : (aEmpty ? -1 : 1);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(formatRaw(a), formatRaw(b));
}

// Stabil sortierte Kopie
export function sortDq(entries, key = 'row', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return entries
    .map((e, i) => ({ e, i }))
    .sort((x, y) => sign * compareValues(x.e[key], y.e[key]) || x.i - y.i)
    .map((x) => x.e);
}

export function filterDq(entries, { text = '', sheet = '' } = {}) {
  const needle = String(text || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (sheet && e.sheet !== sheet) return false;
    if (!needle) return true;
    return DQ_COLUMNS.some((c) => formatRaw(e[c.key]).toLowerCase().includes(needle));
  });
}

// Sheets, die im Log vorkommen, in Konfigurationsreihenfolge (unbekannte danach)
export function sheetOptions(entries) {
  const present = new Set(entries.map((e) => e.sheet));
  const known = Object.values(CONFIG.sheets).filter((n) => present.has(n));
  const other = [...present].filter((n) => !known.includes(n)).sort(collator.compare);
  return known.concat(other);
}

export const DEFAULT_DQ_STATE = Object.freeze({ sortKey: 'row', sortDir: 'asc', text: '', sheet: '' });

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

// container: Element; entries: DQ-Einträge; state: { sortKey, sortDir, text, sheet }; onChange(newState)
export function renderDataQuality(container, entries, state = DEFAULT_DQ_STATE, onChange = () => {}) {
  const s = { ...DEFAULT_DQ_STATE, ...state };
  const visible = sortDq(filterDq(entries, s), s.sortKey, s.sortDir);
  // Fokus im Suchfeld über das Neu-Rendern hinweg erhalten (Eingabe Zeichen für Zeichen)
  const focused = document.activeElement;
  const restoreFocus = !!(focused && focused.classList && focused.classList.contains('dq-text') && container.contains(focused));
  const caret = restoreFocus ? focused.selectionStart : null;
  container.replaceChildren();

  const sheetSelect = el('select', { class: 'dq-sheet', 'aria-label': 'Sheet filtern', onchange: (ev) => onChange({ ...s, sheet: ev.target.value }) }, [
    el('option', { value: '', text: 'Alle Sheets' }),
    ...sheetOptions(entries).map((name) => el('option', { value: name, text: name })),
  ]);
  sheetSelect.value = s.sheet;
  const textInput = el('input', {
    type: 'search', class: 'dq-text', placeholder: 'Suchen (Header, Rohwert, Grund …)', 'aria-label': 'Volltext filtern', value: s.text,
    oninput: (ev) => onChange({ ...s, text: ev.target.value }),
  });
  const count = el('span', { class: 'dq-count', text: visible.length + ' von ' + entries.length + ' Einträgen' });
  container.appendChild(el('div', { class: 'toolbar dq-toolbar' }, [sheetSelect, textInput, count]));
  if (restoreFocus) {
    textInput.focus();
    if (typeof caret === 'number') textInput.setSelectionRange(caret, caret);
  }

  if (!entries.length) {
    container.appendChild(el('p', { class: 'empty', text: 'Keine Einträge im Data-Quality-Log. Alle Zellen der beiden Sheets waren interpretierbar.' }));
    return;
  }

  const headRow = el('tr', {}, DQ_COLUMNS.map((c) => {
    const active = s.sortKey === c.key;
    const arrow = active ? (s.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return el('th', {
      scope: 'col', class: 'sortable' + (active ? ' active' : ''), 'aria-sort': active ? (s.sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
      onclick: () => onChange({ ...s, sortKey: c.key, sortDir: active && s.sortDir === 'asc' ? 'desc' : 'asc' }),
    }, [el('button', { type: 'button', text: c.label + arrow })]);
  }));
  const body = el('tbody', {}, visible.map((e) => el('tr', {}, DQ_COLUMNS.map((c) => {
    const td = el('td', { class: 'col-' + c.key, text: formatRaw(e[c.key]) });
    if (c.key === 'raw' && formatRaw(e.raw) === '') td.textContent = '(leer)';
    return td;
  }))));
  container.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'dq-table' }, [el('thead', {}, [headRow]), body])]));
}
