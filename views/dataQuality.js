// views/dataQuality.js – View «Datenqualität»: Wirkung, Stufe, Sheet, Zeile, Header, Rohwert, Grund – sortier- und
// filterbar, nach Wirkung priorisiert (Befund 7). Oben: «Nicht in den Kennzahlen» mit Grund je Zeile (Blocker 2).
// Reine Helfer (sortDq, filterDq, formatRaw, summarizeDq) sind in tests/dataQuality.test.js getestet; render* baut das DOM.

import { CONFIG } from '../config.js';
import { IMPACT_LABELS, IMPACT_ORDER } from '../store.js';
import { excludedTables } from './tables.js';
import { renderTable } from './common.js';

// Stufen: Fehler (nicht interpretierbar, Wert ignoriert), Hinweis (interpretiert/abgeleitet, auffällig),
// Nicht ausgewertet (nicht interpretierbar, aber Feld fliesst in keine Kennzahl – Score, Entscheid E6 offen)
export const LEVEL_LABELS = { fehler: 'Fehler', hinweis: 'Hinweis', 'nicht-ausgewertet': 'Nicht ausgewertet' };

export function levelOf(entry) {
  return entry && LEVEL_LABELS[entry.level] ? entry.level : 'fehler';
}

export function impactOf(entry) {
  return entry && IMPACT_ORDER[entry.impact] !== undefined ? entry.impact : 'kennzahl';
}

// prio (PROMPT-2 A.5, Anhang A1): 1 = immer sichtbar, 2 = ab Tablet, 3 = ab Desktop
export const DQ_COLUMNS = [
  { key: 'impact', label: 'Wirkung', prio: 1 },
  { key: 'level', label: 'Stufe', prio: 1 },
  { key: 'sheet', label: 'Sheet', prio: 2 },
  { key: 'row', label: 'Zeile', prio: 1 },
  { key: 'header', label: 'Header', prio: 2 },
  { key: 'raw', label: 'Rohwert', prio: 3 },
  { key: 'reason', label: 'Grund', prio: 1 },
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

const LEVEL_ORDER = { fehler: 0, hinweis: 1, 'nicht-ausgewertet': 2 };

// Priorität: Wirkung (unsichtbar, Kennzahl, keine), dann Stufe (Fehler, Hinweis, nicht ausgewertet), dann Sheet/Zeile
function comparePriority(a, b) {
  return IMPACT_ORDER[impactOf(a)] - IMPACT_ORDER[impactOf(b)] || LEVEL_ORDER[levelOf(a)] - LEVEL_ORDER[levelOf(b)]
    || compareValues(a.sheet, b.sheet) || compareValues(a.row, b.row);
}

// Stabil sortierte Kopie; key 'impact' = Priorität (Wirkung, Stufe, Sheet, Zeile), key 'level' nach Stufenreihenfolge
export function sortDq(entries, key = 'impact', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const cmp = key === 'impact' ? comparePriority
    : key === 'level' ? (a, b) => LEVEL_ORDER[levelOf(a)] - LEVEL_ORDER[levelOf(b)]
      : (a, b) => compareValues(a[key], b[key]);
  return entries
    .map((e, i) => ({ e, i }))
    .sort((x, y) => sign * cmp(x.e, y.e) || x.i - y.i)
    .map((x) => x.e);
}

export function filterDq(entries, { text = '', sheet = '', level = '', impact = '' } = {}) {
  const needle = String(text || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (sheet && e.sheet !== sheet) return false;
    if (level && levelOf(e) !== level) return false;
    if (impact && impactOf(e) !== impact) return false;
    if (!needle) return true;
    return DQ_COLUMNS.some((c) => {
      const shown = c.key === 'impact' ? IMPACT_LABELS[impactOf(e)] : c.key === 'level' ? LEVEL_LABELS[levelOf(e)] : formatRaw(e[c.key]);
      return String(shown).toLowerCase().includes(needle);
    });
  });
}

// Sheets, die im Log vorkommen, in Konfigurationsreihenfolge (unbekannte danach)
export function sheetOptions(entries) {
  const present = new Set(entries.map((e) => e.sheet));
  const known = Object.values(CONFIG.sheets).filter((n) => present.has(n));
  const other = [...present].filter((n) => !known.includes(n)).sort(collator.compare);
  return known.concat(other);
}

const NAME_FIELDS = new Set(['lastName', 'firstName']);
const MAX_EXAMPLES = 3;

// Zusammenfassung ohne Zeilen: [{ impact, level, sheet, header, reason, count, examples }], priorisiert nach Wirkung,
// dann Anzahl absteigend. examples = bis zu 3 verschiedene Rohwerte (formatiert), nie aus Namensspalten.
export function summarizeDq(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = [impactOf(e), levelOf(e), e.sheet, e.header, e.reason].join('|');
    const g = groups.get(key) || { impact: impactOf(e), level: levelOf(e), sheet: e.sheet, header: e.header, reason: e.reason, count: 0, examples: [] };
    g.count += 1;
    if (!NAME_FIELDS.has(e.field)) {
      const shown = formatRaw(e.raw);
      if (shown !== '' && g.examples.length < MAX_EXAMPLES && !g.examples.includes(shown)) g.examples.push(shown);
    }
    groups.set(key, g);
  }
  const order = Object.values(CONFIG.sheets);
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  return [...groups.values()].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.count - a.count
    || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || rank(a.sheet) - rank(b.sheet)
    || collator.compare(a.header, b.header) || collator.compare(a.reason, b.reason));
}

const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);

export function summaryAsText(summary) {
  return [['Wirkung', 'Stufe', 'Sheet', 'Header', 'Grund', 'Anzahl', 'Beispiele'].join(TAB)]
    .concat(summary.map((r) => [IMPACT_LABELS[r.impact], r.level, r.sheet, r.header, r.reason, r.count, r.examples.join(' | ')].join(TAB))).join(NL);
}

export const DEFAULT_DQ_STATE = Object.freeze({ sortKey: 'impact', sortDir: 'asc', text: '', sheet: '', level: '', impact: '' });

// Volltextsuche entprellt (Befund 14): erst 150 ms nach dem letzten Tastendruck neu rendern
export const SEARCH_DEBOUNCE_MS = 150;
let searchTimer = null;

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

// container: Element; entries: DQ-Einträge; state: { sortKey, sortDir, text, sheet, level, impact }; onChange(newState);
// options.persons: alle Zeilen (unfiltriert) für den Abschnitt «Nicht in den Kennzahlen»
export function renderDataQuality(container, entries, state = DEFAULT_DQ_STATE, onChange = () => {}, { persons = [] } = {}) {
  const s = { ...DEFAULT_DQ_STATE, ...state };
  const visible = sortDq(filterDq(entries, s), s.sortKey, s.sortDir);
  // Fokus im Suchfeld über das Neu-Rendern hinweg erhalten (Eingabe Zeichen für Zeichen)
  const focused = document.activeElement;
  const restoreFocus = !!(focused && focused.classList && focused.classList.contains('dq-text') && container.contains(focused));
  const caret = restoreFocus ? focused.selectionStart : null;
  container.replaceChildren();

  // Nicht in den Kennzahlen (Blocker 2): Grund je Zeile, unabhängig vom Filter
  if (persons.length) {
    const ex = excludedTables(persons, entries);
    container.appendChild(el('details', { class: 'dq-summary-box excluded-box', open: '' }, [
      el('summary', { text: 'Nicht in den Kennzahlen: ' + ex.total + ' von ' + ex.zeilen + ' Zeilen' }),
      el('p', { class: 'meta-list', text: 'Zeilen, die in keiner Kennzahl vorkommen, mit dem Grund. Kennzahlrelevant sind Vorgänge mit mindestens einem absolvierten, datierten schriftlichen Run; zusammengeführte Duplikate zählen im behaltenen Vorgang weiter. Die Log-Einträge einer Zeile finden sich über die Zeilennummer im Suchfeld.' }),
      renderTable(ex.summary),
      el('details', {}, [el('summary', { text: 'Zeilen einzeln (' + ex.rows + ', mit Namen)' }), renderTable(ex.details)]),
    ]));
  }

  const sheetSelect = el('select', { class: 'dq-sheet', 'aria-label': 'Sheet filtern', onchange: (ev) => onChange({ ...s, sheet: ev.target.value }) }, [
    el('option', { value: '', text: 'Alle Sheets' }),
    ...sheetOptions(entries).map((name) => el('option', { value: name, text: name })),
  ]);
  sheetSelect.value = s.sheet;
  const levelSelect = el('select', { class: 'dq-level', 'aria-label': 'Stufe filtern', onchange: (ev) => onChange({ ...s, level: ev.target.value }) }, [
    el('option', { value: '', text: 'Alle Stufen' }),
    el('option', { value: 'fehler', text: 'Nur Fehler' }),
    el('option', { value: 'hinweis', text: 'Nur Hinweise' }),
    el('option', { value: 'nicht-ausgewertet', text: 'Nur nicht ausgewertete' }),
  ]);
  levelSelect.value = s.level;
  const impactSelect = el('select', { class: 'dq-impact', 'aria-label': 'Wirkung filtern', onchange: (ev) => onChange({ ...s, impact: ev.target.value }) }, [
    el('option', { value: '', text: 'Alle Wirkungen' }),
    el('option', { value: 'unsichtbar', text: 'Nur: macht Zeile unsichtbar' }),
    el('option', { value: 'kennzahl', text: 'Nur: verändert Kennzahl' }),
    el('option', { value: 'keine', text: 'Nur: ohne Kennzahlwirkung' }),
  ]);
  impactSelect.value = s.impact;
  const textInput = el('input', {
    type: 'search', class: 'dq-text', placeholder: 'Suchen (Header, Rohwert, Grund …)', 'aria-label': 'Volltext filtern', value: s.text,
    oninput: (ev) => {
      const value = ev.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => onChange({ ...s, text: value }), SEARCH_DEBOUNCE_MS);
    },
  });
  const nFehler = entries.filter((e) => levelOf(e) === 'fehler').length;
  const nHinweise = entries.filter((e) => levelOf(e) === 'hinweis').length;
  const nNa = entries.length - nFehler - nHinweise;
  const nImpact = (k) => entries.filter((e) => impactOf(e) === k).length;
  const count = el('span', { class: 'dq-count', text: visible.length + ' von ' + entries.length + ' Einträgen (' + nFehler + ' Fehler, ' + nHinweise + ' Hinweise, ' + nNa + ' nicht ausgewertet) · Wirkung: '
    + nImpact('unsichtbar') + ' machen Zeilen unsichtbar, ' + nImpact('kennzahl') + ' verändern Kennzahlen, ' + nImpact('keine') + ' ohne Kennzahlwirkung' });
  container.appendChild(el('div', { class: 'toolbar dq-toolbar' }, [impactSelect, levelSelect, sheetSelect, textInput, count]));
  if (restoreFocus) {
    textInput.focus();
    if (typeof caret === 'number') textInput.setSelectionRange(caret, caret);
  }

  if (!entries.length) {
    container.appendChild(el('p', { class: 'empty', text: 'Keine Einträge im Data-Quality-Log. Alle Zellen der beiden Sheets waren interpretierbar.' }));
    return;
  }

  // Zusammenfassung (gefilterte Einträge) – ohne Rohwerte, daher ohne Personendaten
  const summary = summarizeDq(filterDq(entries, s));
  const copyButton = el('button', {
    type: 'button', class: 'secondary small-button', text: 'Zusammenfassung kopieren',
    onclick: (ev) => {
      const btn = ev.currentTarget;
      const done = () => { btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = 'Zusammenfassung kopieren'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(summaryAsText(summary)).then(done, () => {});
    },
  });
  const summaryTable = el('table', { class: 'dq-summary' }, [
    el('thead', {}, [el('tr', {}, ['Wirkung', 'Stufe', 'Sheet', 'Header', 'Grund', 'Anzahl', 'Beispiele'].map((t) => el('th', { scope: 'col', text: t })))]),
    el('tbody', {}, summary.map((r) => el('tr', { class: 'level-' + r.level + ' impact-' + r.impact }, [
      el('td', { class: 'col-impact', text: IMPACT_LABELS[r.impact] }), el('td', { class: 'col-level', text: LEVEL_LABELS[r.level] }), el('td', { text: r.sheet }), el('td', { text: r.header }), el('td', { text: r.reason }), el('td', { class: 'col-row', text: String(r.count) }),
      el('td', { class: 'col-raw', text: r.examples.join(' | ') }),
    ]))),
  ]);
  container.appendChild(el('details', { class: 'dq-summary-box', open: '' }, [
    el('summary', { text: 'Zusammenfassung nach Wirkung, Header und Grund (' + summary.length + ' Gruppen) – Arbeitsliste, Wichtigstes zuerst' }),
    el('div', { class: 'toolbar' }, [copyButton]),
    el('div', { class: 'table-wrap' }, [summaryTable]),
  ]));
  container.appendChild(el('h3', { text: 'Einzelne Einträge' }));

  const headRow = el('tr', {}, DQ_COLUMNS.map((c) => {
    const active = s.sortKey === c.key;
    const arrow = active ? (s.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return el('th', {
      scope: 'col', 'data-prio': String(c.prio), class: 'sortable' + (active ? ' active' : ''), 'aria-sort': active ? (s.sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
      onclick: () => onChange({ ...s, sortKey: c.key, sortDir: active && s.sortDir === 'asc' ? 'desc' : 'asc' }),
    }, [el('button', { type: 'button', text: c.label + arrow })]);
  }));
  const body = el('tbody', {}, visible.map((e) => el('tr', { class: 'level-' + levelOf(e) + ' impact-' + impactOf(e) }, DQ_COLUMNS.map((c) => {
    const td = el('td', { class: 'col-' + c.key, 'data-prio': String(c.prio), text: formatRaw(e[c.key]) });
    if (c.key === 'raw' && formatRaw(e.raw) === '') td.textContent = '(leer)';
    if (c.key === 'level') td.textContent = LEVEL_LABELS[levelOf(e)];
    if (c.key === 'impact') td.textContent = IMPACT_LABELS[impactOf(e)];
    return td;
  }))));
  container.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'dq-table' }, [el('thead', {}, [headRow]), body])]));
}
