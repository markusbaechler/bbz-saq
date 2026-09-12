// views/common.js – gemeinsame DOM-Helfer der Views (Tabellen, KPI-Kacheln, Abschnitte, Export-Leiste).
// Nur Rendering; Zahlen und Texte kommen aus views/tables.js.

import { downloadCsv, downloadXlsx, exportFileName, printPage, tablesToCsv } from '../export.js';
import { numericColumns, deltaView, isDeltaColumn, statusTone, STATUS_COLUMN_LABELS, sortTableRows, SMALL_MARK, SMALL_NOTE } from './tables.js';
import { glossaryEntry, glossarySlug } from '../glossary.js';
import { SMALL_N, formatPct, wilsonInterval } from '../metrics.js';

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
// (row.direction, sonst column.direction); Statuszellen als Badge; Prozentwerte mit Datenbalken (--v, ausser column.bar === false);
// column.toneKey: Ton (pos | neg | neutral) aus einer Zeilen-Eigenschaft, z. B. «Einordnung» (Paket G). Farbe nie allein.
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
  // Raster-Zellen (Paket C): «12.03.2026 · 82.0 % · bestanden» → Text plus Badge auf dem Ergebnis; «geplant · 29.09.2026» → Badge vorn
  if (c.status && text && text !== '–') {
    const parts = text.split(' · ');
    const statusIndex = parts[0] === 'geplant' ? 0 : parts.length - 1;
    const tone = statusTone(parts[statusIndex]);
    if (tone) {
      const rest = parts.filter((_, i) => i !== statusIndex).join(' · ');
      return el('td', { ...attrs, class: cls.concat(['status-cell']).join(' ') }, [el('span', { class: 'badge status-' + tone, text: parts[statusIndex] }), rest ? ' ' + rest : '']);
    }
  }
  if (STATUS_COLUMN_LABELS.includes(c.label)) {
    const tone = statusTone(text, c.label);
    if (tone) return el('td', { ...attrs, class: cls.join(' ') || null }, [el('span', { class: 'badge status-' + tone, text })]);
  }
  // Einordnung (Paket G): Ton wie Δ aus row[c.toneKey] (pos | neg | neutral), der Text trägt die Bedeutung; Strich ohne Ton
  if (c.toneKey && text && text !== '–' && ['pos', 'neg', 'neutral'].includes(row[c.toneKey])) {
    return el('td', { ...attrs, class: cls.concat(['tone', row[c.toneKey]]).join(' ') }, [text]);
  }
  const pct = !isDeltaColumn(c) && c.bar !== false && PCT.exec(text); // bar: false → Lagewerte (Median, Quartile) ohne Datenbalken (Paket G)
  if (pct) {
    cls.push('pct');
    attrs.style = '--v: ' + Math.min(100, Number(pct[1].replace(',', '.')));
  }
  return el('td', { ...attrs, class: cls.join(' ') || null, text });
}

// ---------------------------------------------------------------------------
// Sortierung (Paket B, B4): eine Implementierung für alle Tabellen
// Vorher waren von 43 Tabellenmodellen zwei sortierbar, mit zwei getrennten Implementierungen und verschiedenem
// Verhalten (Experten: Button, Text aufsteigend / Zahlen absteigend, aria-label; Data-Quality: Handler am th, immer
// aufsteigend zuerst, ohne aria-label). Jetzt trägt jede Kopfzelle denselben Button, dasselbe aria-sort und dieselbe
// Erstrichtung. Die fachliche Ausgangssortierung bleibt der Standard – Teilprüfungen, Profile und Jahre haben eine
// Reihenfolge, die Bedeutung trägt; «Sortierung zurücksetzen» stellt sie wieder her.
// ---------------------------------------------------------------------------

// Erste Richtung beim Klick auf eine noch nicht sortierte Spalte: Text aufsteigend, Zahlen absteigend (grösstes zuerst),
// wie in der Experten-Tabelle. Ist die Spalte bereits aktiv, kehrt der Klick die Richtung um.
export function nextSortDir(column, numeric, current) {
  if (current && current.key === column.key) return current.dir === 'asc' ? 'desc' : 'asc';
  return numeric.has(column.key) ? 'desc' : 'asc';
}

// Kennung einer Tabelle für den Sortierzustand in der URL: aus dem Titel. Tabellen ohne Titel sortieren nur lokal.
export function tableSortId(table) {
  if (table.sortId) return String(table.sortId);
  if (!table.title) return null;
  return glossarySlug(table.title);
}

// Sortierzustand der aktiven Ansicht. app.js setzt ihn vor jedem Aufbau (Zustand aus der URL) und nimmt Änderungen
// entgegen; ohne Kontext sortiert eine Tabelle nur im DOM und meldet nichts.
let sortContext = { state: null, onChange: null };
export function setSortContext(state, onChange) {
  sortContext = { state: state || null, onChange: onChange || null };
}
function sortFor(id) {
  const s = sortContext.state;
  return id && s && s.table === id && s.key ? { key: s.key, dir: s.dir === 'desc' ? 'desc' : 'asc' } : null;
}
function reportSort(id, sort) {
  if (id && sortContext.onChange) sortContext.onChange(sort ? { table: id, key: sort.key, dir: sort.dir } : null);
}

function headerCell(c, numeric, sortOpts = null) {
  const attrs = { scope: 'col', 'data-prio': String(c.prio || 2), class: numeric.has(c.key) ? 'num' : null, 'data-key': c.key };
  if (!sortOpts) return el('th', { ...attrs, text: c.label });
  const active = sortOpts.sort && sortOpts.sort.key === c.key;
  const pfeil = active ? (sortOpts.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return el('th', {
    ...attrs,
    class: [attrs.class, 'sortable', active ? 'active' : null].filter(Boolean).join(' '),
    'aria-sort': active ? (sortOpts.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
  }, [el('button', {
    type: 'button', text: c.label + pfeil, 'aria-label': 'Sortieren nach ' + c.label,
    onclick: () => sortOpts.onSort(c),
  })]);
}

// Sortierbare Kopfzelle für Tabellen ausserhalb des Modell-Renderings (Data-Quality-Log): dieselbe Bedienung,
// dasselbe aria-sort, dieselbe Erstrichtung. Die Vergleichsfunktion bleibt dort eigen – «Wirkung» und «Stufe» haben
// eine fachliche Reihenfolge, die eine alphabetische Sortierung zerstören würde.
export function sortableHeadCell(column, { sort, onSort, numeric = new Set() }) {
  return headerCell(column, numeric, { sort, onSort });
}

// Schalter «Sortierung zurücksetzen»: nur sichtbar, solange eine Sortierung aktiv ist
function resetSortButton(onReset) {
  return el('button', { type: 'button', class: 'link reset-sort', text: 'Sortierung zurücksetzen', hidden: true, onclick: onReset });
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
// table.wide = true (breite Tabellen, z. B. Experten mit 13 Spalten): Klasse «wide» am Rahmen, Prio 3 erst ab 1900 px, Full HD (F.2, Paket G).
// Fussnoten (note) erscheinen nicht mehr unter der Tabelle, sondern als ⓘ am Titel und in der Legende der View.
// Leere Tabelle (Paket B, B3): Bei null Zeilen wird gar keine Tabelle gerendert – nur die Meldung. Vorher stand die
// Meldung hinter der vollständig gerenderten Kopfzeile: auf «Bestenlisten» mit einem Institut-Filter 12 leere Tabellen
// mit zusammen über 2000 px Spaltenüberschriften ohne einen einzigen Wert. Der Titel bleibt vor der Meldung, damit sie
// zuzuordnen ist; section() entfernt ihn wieder, wenn er den Abschnittstitel wiederholt.
function emptyTable(table) {
  const text = table.empty || 'Keine Daten für den aktiven Filter.';
  return el('p', {
    class: 'empty table-empty', 'data-title': table.title || null, 'data-empty': text,
    text: table.title ? table.title + ' – ' + text : text,
  });
}

export function renderTable(table, { caption = true, sortable = true } = {}) {
  if (!table.rows.length) return emptyTable(table);
  const numeric = numericColumns(table); // Befund 13: Zahlen- und Prozentspalten rechtsbündig
  const id = sortable ? tableSortId(table) : null;
  const node = el('table', { class: 'data' });
  const wrap = el('div', { class: 'table-wrap' + (table.wide ? ' wide' : '') }, [node]);
  const toggle = allColumnsToggle(wrap, table.columns);
  if (toggle) wrap.appendChild(toggle);
  const reset = sortable ? resetSortButton(() => draw(null, null, true)) : null;
  if (reset) wrap.appendChild(reset);
  // sort = { key, dir } | null (null = fachliche Ausgangssortierung des Modells); focusKey hält den Tastaturfokus
  // auf der bedienten Kopfzelle, melden = Zustand an die Ansicht weitergeben (URL)
  function draw(sort, focusKey, melden) {
    const rows = sort ? sortTableRows(table.rows, sort.key, sort.dir) : table.rows;
    const sortOpts = sortable ? { sort, onSort: (c) => draw({ key: c.key, dir: nextSortDir(c, numeric, sort) }, c.key, true) } : null;
    const children = [];
    if (caption && table.title) children.push(captionNode(table.title, table.note));
    children.push(el('thead', {}, [el('tr', {}, table.columns.map((c) => headerCell(c, numeric, sortOpts)))]));
    children.push(el('tbody', {}, rows.map((row) => el('tr', { class: row.small ? 'small' : null }, table.columns.map((c) => cell(c, row, numeric))))));
    node.replaceChildren(...children);
    if (reset) reset.hidden = !sort;
    if (melden) reportSort(id, sort);
    if (focusKey) {
      const btn = node.querySelector('th[data-key="' + focusKey + '"] button');
      if (btn) btn.focus();
    }
  }
  draw(sortFor(id), null, false);
  return wrap;
}

// Tabelle mit aufklappbaren Zeilen: detail(row, i) liefert den Inhalt unter der Zeile (oder null → nicht aufklappbar).
// Die Zeile ist ein Button (Klick, Enter, Leertaste) mit aria-expanded/aria-controls; die Detailzeile ist bis zum Aufklappen hidden.
// hint: Bedienhinweis, erscheint mit der Fussnote als ⓘ am Titel.
let expandableSeq = 0;
// isOpen(row) → Zeile initial aufgeklappt (z. B. gewählte Person); onToggle(row, open) nach jedem Umschalten (Paket C)
export function renderExpandableTable(table, { detail, hint = null, isOpen = null, onToggle = null, sortable = true } = {}) {
  if (!table.rows.length) return emptyTable(table); // B3: keine Kopfzeile ohne Zeilen
  const numeric = numericColumns(table);
  const cols = table.columns;
  const id = sortable ? tableSortId(table) : null;
  const node = el('table', { class: 'data expandable-table' });
  const wrap = el('div', { class: 'table-wrap' + (table.wide ? ' wide' : '') }, [node]);
  const columnsToggle = allColumnsToggle(wrap, cols);
  if (columnsToggle) wrap.appendChild(columnsToggle);
  const reset = sortable ? resetSortButton(() => draw(null, null, true)) : null;
  if (reset) wrap.appendChild(reset);

  function draw(sort, focusKey, melden) {
    const rows = sort ? sortTableRows(table.rows, sort.key, sort.dir) : table.rows;
    const sortOpts = sortable ? { sort, onSort: (c) => draw({ key: c.key, dir: nextSortDir(c, numeric, sort) }, c.key, true) } : null;
    const thead = el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', class: 'toggle', 'data-prio': '1', 'aria-label': 'Aufklappen' })].concat(cols.map((c) => headerCell(c, numeric, sortOpts))))]);
    const tbody = el('tbody');
    rows.forEach((row, i) => {
      const content = detail ? detail(row, i) : null;
      const rowId = 'xp-' + (++expandableSeq);
      const tr = el('tr', {
        class: 'expandable' + (row.small ? ' small' : ''),
        role: content ? 'button' : null, tabindex: content ? '0' : null, 'aria-expanded': content ? 'false' : null, 'aria-controls': content ? rowId : null,
      }, [el('td', { class: 'toggle', 'data-prio': '1' })].concat(cols.map((c) => cell(c, row, numeric))));
      tbody.appendChild(tr);
      if (!content) return;
      const detailRow = el('tr', { class: 'event-detail', id: rowId, hidden: true }, [el('td', { colspan: String(cols.length + 1) }, [content])]);
      tbody.appendChild(detailRow);
      if (isOpen && isOpen(row)) {
        detailRow.hidden = false;
        tr.setAttribute('aria-expanded', 'true');
      }
      const toggle = () => {
        const open = detailRow.hidden;
        detailRow.hidden = !open;
        tr.setAttribute('aria-expanded', String(open));
        if (onToggle) onToggle(row, open);
      };
      tr.addEventListener('click', toggle);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    });
    const children = [];
    const info = [hint, table.note].filter(Boolean).join(' ');
    if (table.title) children.push(captionNode(table.title, info || null));
    children.push(thead, tbody);
    node.replaceChildren(...children);
    if (reset) reset.hidden = !sort;
    if (melden) reportSort(id, sort);
    if (focusKey) {
      const btn = node.querySelector('th[data-key="' + focusKey + '"] button');
      if (btn) btn.focus();
    }
  }
  draw(sortFor(id), null, false);
  return wrap;
}

// Einklappbarer Block (<details>). printOpen: wird für den Druck automatisch geöffnet (app.js, beforeprint).
export function renderCollapsible(summaryText, nodes, { open = false, printOpen = true } = {}) {
  return el('details', { class: 'fold' + (printOpen ? ' print-open' : ''), open: open ? '' : null }, [el('summary', { text: summaryText })].concat(nodes));
}

// KPI-Kachel (PROMPT-2 A.4): Wert zuerst, darunter die Beschriftung als Glossar-Link (wenn ein Eintrag mit dieser
// Beschriftung existiert und glossaryHref gegeben ist) plus ⓘ mit der Definition, darunter n, zuletzt die Differenz zum
// Benchmark mit Symbol, Vorzeichen und Farbe nach Richtung. Mengen (kind count oder ohne kind) sind kleinere Kacheln ohne Differenz.
// Der Wert steht oben (Paket A, A3), damit die Werte einer Reihe unabhängig vom Umbruch der Beschriftung auf einer Linie
// liegen; die Mindesthöhe der Beschriftung (styles.css) richtet zusätzlich n und Delta darunter aus.
function kpiTile(k, glossaryHref) {
  const isCount = !k.kind || k.kind === 'count';
  const label = glossaryHref && glossaryEntry(k.label) ? el('a', { href: glossaryHref(k.label), text: k.label }) : k.label;
  const d = !isCount && typeof k.delta === 'number' && Number.isFinite(k.delta) ? deltaView(k.delta, k.direction) : null;
  return el('div', { class: 'kpi' + (k.small ? ' small' : '') + (isCount ? ' count' : '') }, [
    el('div', { class: 'kpi-value', text: k.value }),
    el('div', { class: 'kpi-label' }, [label, k.hint ? infoIcon(k.hint, 'Definition: ') : null]),
    // Mengen tragen keine zweite Zahl: Ihr Wert IST die Anzahl, und die Grundmenge der Auswahl daneben meint etwas
    // anderes als die Kachel («Personen 970 · n = 977» zählt Vorgänge). Quoten nennen Zähler von Nenner mit Einheit,
    // Mittelwerte nur den Nenner.
    el('div', { class: 'kpi-n', text: (isCount ? '' : (k.count !== null && k.count !== undefined ? k.count + ' von ' + k.n + ' ' + (k.unit || 'Vorgängen') : 'n = ' + k.n)) + (k.small ? ' *' : '') }),
    // Streuung (PROMPT-2 Paket G): Zweitzeile der Ø-Kacheln «σ 9.8 pp · Median 76.0 % (P25 70.0 · P75 84.5)»; Phone nur «σ 9.8 pp» (Entscheid 6)
    k.spread ? el('div', { class: 'kpi-spread' }, [el('span', { class: 'kpi-spread-full', text: k.spread.text }), el('span', { class: 'kpi-spread-short', text: k.spread.short })]) : null,
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
// vorne: je Block ein Knoten, der vor den Kacheln steht (M3: die Messzeilen der Quoten; die Kacheln bleiben für
// Mengen und für die Ø-Kennzahlen, die ihre Streuungszeile tragen).
export function renderKpis(kpis, { glossaryHref = null, phone = isPhone(), vorne = {}, gruppen = ['Mengen', 'Schriftlich', 'Mündlich'] } = {}) {
  const tile = (k) => kpiTile(k, glossaryHref);
  const groups = gruppen.map((g) => ({ g, list: kpis.filter((k) => k.group === g) })).filter((x) => x.list.length || vorne[x.g]);
  if (!groups.length) return el('div', { class: 'kpis' }, kpis.map(tile));
  if (phone) {
    return el('div', { class: 'kpi-groups' }, groups.map(({ g, list }) => el('details', { class: 'kpi-group print-open', open: g === gruppen[0] ? null : '' }, [
      el('summary', { text: g }), vorne[g] || null, list.length ? el('div', { class: 'kpis' }, list.map(tile)) : null,
    ].filter(Boolean))));
  }
  return el('div', { class: 'kpi-groups' }, groups.map(({ g, list }) => el('section', { class: 'kpi-group' }, [
    el('h3', { text: g }), vorne[g] || null, list.length ? el('div', { class: 'kpis' }, list.map(tile)) : null,
  ].filter(Boolean))));
}

// ---------------------------------------------------------------------------
// Horizontal scrollende Tabellen (Paket C, C2)
// Ein Tabellenkopf kann nur seitenweit kleben, wenn kein Vorfahre ein Scroll-Container ist. «overflow-x: auto» am
// .table-wrap macht ihn zu einem – gemessen: der Kopf klebt dann nie (Paket B, B6). Zugleich läuft nur ein kleiner Teil
// der Tabellen überhaupt horizontal über: bei 1400 px 3 von 60, und keine der 7 Tabellen über 500 px Höhe. Der
// Scroll-Container entsteht deshalb nur dort, wo er gebraucht wird – die Klasse «scrolls-x» wird gemessen gesetzt.
// ---------------------------------------------------------------------------
export function markScrollingTables(root = document) {
  for (const wrap of root.querySelectorAll('.table-wrap')) {
    const table = wrap.querySelector('table');
    if (!table) continue;
    // Ohne die Klasse misst der Vergleich die natürliche Breite, mit ihr die Scrollbreite – beides ergibt dasselbe Urteil
    const braucht = table.scrollWidth > wrap.clientWidth + 1;
    wrap.classList.toggle('scrolls-x', braucht);
  }
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
// phoneCollapsed (B.4): auf Phone als eingeklappter Block (details), im Druck geöffnet; auf Desktop/Tablet normaler Abschnitt
// collapsed: unabhängig von der Geräteklasse eingeklappt (Paket A, A2: Vergleichstabelle ohne aktiven Filter)
export function section(title, nodes, { info = null, meta = null, collapsed: alwaysCollapsed = false, phoneCollapsed = false, phone = isPhone() } = {}) {
  const collapsed = alwaysCollapsed || (phone && phoneCollapsed);
  const head = el(collapsed ? 'summary' : 'h3', {}, [title, info ? infoIcon(info) : null, meta ? el('span', { class: 'section-meta', text: meta }) : null]);
  const node = collapsed
    ? el('details', { class: 'fold print-open block' }, [head].concat(nodes))
    : el('section', { class: 'block' }, [head].concat(nodes));
  // Kein Doppeltitel, auch bei leeren Tabellen (B3): Die Meldung trägt den Tabellentitel nur, solange er sich vom
  // Abschnittstitel unterscheidet – sonst bleibt der reine Meldungstext.
  for (const p of node.querySelectorAll('p.table-empty[data-title]')) {
    if (p.getAttribute('data-title') === title) p.textContent = p.getAttribute('data-empty');
  }
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

// Sammelt Abschnitts-Erklärungen für die Legende der View (app.js): sec(title, nodes, intro, meta, { phoneCollapsed })
export function hinted(hints) {
  return (title, nodes, intro = null, meta = null, opts = {}) => {
    if (intro) hints.push(title + ': ' + intro);
    return section(title, nodes, { info: intro, meta, ...opts });
  };
}

// Export-Menü (PROMPT-2 A.3, Befund B5): ein Aufklappmenü statt Button-Leiste – CSV (alle Tabellen in einer Datei),
// XLSX (ein Blatt je Tabelle), Druckansicht; extra = { label, tables }: Vorgangsebene (mit Namen, nur intern), eigene
// Dateien mit Suffix «-vorgaenge». Per Tastatur bedienbar (details/summary); schliesst nach der Wahl.
// label/note (Paket C): eigener Titel und Hinweis, z. B. Export «Diese Person»
export function renderExportMenu({ viewId, tables, headerLines, extra = null, label = 'Export', note = 'Aggregate dieser Ansicht, Filterzustand im Kopf' }) {
  const disabled = !tables.length;
  const menu = el('details', { class: 'menu export-menu' });
  const item = (text, onclick, dis = false) => el('button', { type: 'button', class: 'menu-item', disabled: dis, text, onclick: () => { menu.open = false; onclick(); } });
  const items = [
    el('div', { class: 'menu-note', text: note }),
    item('CSV', () => downloadCsv(exportFileName(viewId, 'csv'), tablesToCsv(tables, headerLines)), disabled),
    item('XLSX', () => downloadXlsx(exportFileName(viewId, 'xlsx'), tables, headerLines), disabled),
    item('Druckansicht', () => printPage()),
  ];
  if (extra && extra.tables && extra.tables.length) {
    const rows = extra.tables[0].rows.length;
    const suffix = extra.suffix || '-vorgaenge'; // Paket D: Einsatzebene mit eigenem Suffix und eigener Einheit
    const unit = extra.unit || 'Vorgänge';
    items.push(
      el('div', { class: 'menu-note', text: extra.label + ' (' + rows + ' ' + unit + ', mit Namen, nur intern)' }),
      item('CSV (' + extra.label + ')', () => downloadCsv(exportFileName(viewId + suffix, 'csv'), tablesToCsv(extra.tables, headerLines)), !rows),
      item('XLSX (' + extra.label + ')', () => downloadXlsx(exportFileName(viewId + suffix, 'xlsx'), extra.tables, headerLines), !rows),
    );
  }
  menu.append(el('summary', { text: label }), el('div', { class: 'menu-list', role: 'group', 'aria-label': label }, items));
  return menu;
}

// Signalblock (Paket D, D2): erster Inhalt der Übersicht, über «Mengen». Er beantwortet «worauf schaue ich heute» –
// das gehört nicht unter zwölf Kacheln. Farbe trägt nie allein: Rang und Stufenwort stehen immer daneben.
// Der Block verschwindet nie: Feuert keine Regel, nennt er, was geprüft wurde und ruhig blieb – ein verschwindender
// Block ist von einem kaputten nicht zu unterscheiden.
// Höhenbudget (gemessen bei 1400 × 900, sechs Signale): sechs offene Zeilen ergaben 339 px und die erste Mengen-Kachel
// bei y = 699 – zu knapp. Offen bleiben deshalb die drei schwersten; die übrigen Detailzeilen bleiben im DOM und sind
// über einen Schalter im Kopf erreichbar. Weggelassen wird nichts: Zahl und Schwelle jedes Signals sind einen Klick weit.
const STUFE_WORT = { kritisch: 'kritisch', beachten: 'beachten', guenstig: 'günstig' };
export const SIGNAL_DETAILS_OFFEN = 3; // gemessen, nicht geschätzt – siehe Kommentar oben

function signalZeile(s, rang, onWeg, detailOffen) {
  return el('li', { class: 'signal stufe-' + s.stufe }, [
    el('span', { class: 'signal-rang', text: String(rang) }),
    el('span', { class: 'signal-stufe', text: STUFE_WORT[s.stufe] || s.stufe }),
    el('span', { class: 'signal-titel', text: s.titel }),
    onWeg ? el('button', { type: 'button', class: 'linklike signal-weg', text: s.wegText, onclick: () => onWeg(s.weg) }) : null,
    el('p', {
      class: 'signal-detail',
      text: s.detail + ' ' + s.schwelle + '.',
      hidden: !detailOffen,
      'data-zusatz': detailOffen ? null : 'true',
    }),
  ]);
}

export function signalBlock(ergebnis, { onWeg = null, filterKurz = 'kein Filter' } = {}) {
  const liste = (ergebnis && ergebnis.signale) || [];
  const offen = liste.filter((s) => s.stufe !== 'guenstig').length;
  const grundlage = 'gerechnet auf ' + ((ergebnis && ergebnis.n) || 0) + ' Vorgängen · ' + filterKurz;
  const kopf = el('div', { class: 'signale-kopf' }, [
    el('h3', { text: 'Signale' }),
    el('span', { class: 'signale-meta', text: liste.length
      ? offen + ' offen · nach Wirkung sortiert · ' + grundlage
      : 'nichts Auffälliges · ' + grundlage }),
  ]);
  const inhalt = liste.length
    ? el('ol', { class: 'signal-liste' }, liste.map((s, i) => signalZeile(s, i + 1, onWeg, i < SIGNAL_DETAILS_OFFEN)))
    : el('div', { class: 'signale-ruhig' }, [
      el('p', { class: 'empty', text: (ergebnis && ergebnis.zuKlein)
        ? 'Zu wenige Vorgänge im Filter für Signale (Mindestgruppengrösse ' + SMALL_N + ').'
        : 'Keine Regel hat ausgelöst. Geprüft wurde:' }),
      el('ul', { class: 'signale-geprueft' }, ((ergebnis && ergebnis.geprueft) || []).map((r) => el('li', { text: r.titel }))),
    ]);
  const block = el('section', { class: 'block signale', 'aria-label': 'Signale' }, [kopf, inhalt]);
  if (liste.length > SIGNAL_DETAILS_OFFEN) {
    const schalter = el('button', {
      type: 'button',
      class: 'linklike signale-mehr',
      text: 'Alle Details zeigen',
      'aria-expanded': 'false',
      onclick: () => {
        const zeigen = schalter.getAttribute('aria-expanded') === 'false';
        for (const p of block.querySelectorAll('.signal-detail[data-zusatz="true"]')) p.hidden = !zeigen;
        schalter.setAttribute('aria-expanded', zeigen ? 'true' : 'false');
        schalter.textContent = zeigen ? 'Details einklappen' : 'Alle Details zeigen';
      },
    });
    kopf.appendChild(schalter);
  }
  return block;
}

// ---------------------------------------------------------------------------
// Messzeile (Paket MESSZEILE, M1): eine Quote als Zeile statt als Kachel.
// Sieben Felder: Beschriftung · Skala · Wert · n · Verlauf · Wert letztes Jahr · Delta.
//
// Der Punkt ist die GEMEINSAME SKALA 50–100 % für alle Quoten: Zwei Messzeilen untereinander sind vergleichbar,
// zwei Kacheln sind es nicht. Werte unter 50 % stehen am linken Anschlag und die Zeile sagt es – abgeschnitten
// wird nichts. Auf der Skala liegen das 95-%-Wilson-Intervall als Balken (aus metrics.js, hier wird nichts neu
// gerechnet), der Wert als Punkt und, wenn eine Referenz gilt, deren Marke.
//
// Die Messzeile ersetzt Kacheln für QUOTEN. Für MENGEN bleibt die Kachel: Eine Anzahl hat keine Skala von 50 bis
// 100 %, und eine erfundene wäre schlimmer als keine.
//
// Farbe trägt nie allein: Richtung steht als Zeichen und als Zahl da, die Stufe als Wort im aria-label.
// messzeileModell() ist rein – Modell rein, Knoten raus; die Geometrie ist damit ohne DOM prüfbar.
// ---------------------------------------------------------------------------

export const MESSZEILE_MIN = 0.5;          // Voreinstellung: gemeinsame Skala der Bestehensquoten
export const MESSZEILE_DELTA_TON_PP = 2;   // darunter neutral – sonst färbt sich Rauschen ein
export const MESSZEILE_JAHRE_MIN = 3;      // weniger Jahre → keine Sparkline, kein leerer Platz

const mzNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mzPp = (v) => Math.round(v * 10) / 10;
// Anteil → Position auf der Spur in Prozent; ausserhalb wird geklemmt, nicht abgeschnitten. Die Spur beginnt und
// endet dort, wo die Kennzahlen des Blocks liegen: Bestehensquoten 50–100 %, Durchfallquoten 0–50 %. Entscheidend
// ist, dass ALLE Zeilen eines Blocks dieselbe Spur tragen – sonst sind zwei Zeilen untereinander nicht vergleichbar.
const mzPos = (pct, min = MESSZEILE_MIN, max = 1) => Math.max(0, Math.min(100, ((pct - min) / Math.max(max - min, 1e-9)) * 100));
const mzVorzeichen = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toFixed(1);
const mzWorte = (pct) => (mzNum(pct) ? formatPct(pct).replace(' %', ' Prozent') : 'kein Wert');

// Jahre, die zählen: auswertbar und mindestens SMALL_N Vorgänge, aufsteigend.
function mzJahre(jahre) {
  return (jahre || []).filter((j) => j && mzNum(j.pct) && (j.n || 0) >= SMALL_N).slice().sort((a, b) => a.year - b.year);
}

// Modell einer Messzeile – reine Daten, kein DOM.
// Eingabe: { label, glossar, count, n, pct, richtung: 'up'|'down'|'neutral', referenz: { pct, label }, jahre: [{ year, pct, n }] }
// «Wert» ist die Lage im aktiven Filter (alle Jahre), «Wert letztes Jahr» das jüngste auswertbare Jahr und «Delta»
// dessen Abstand zum Jahr davor. Den Gesamtwert gegen ein einzelnes Jahr zu rechnen, würde zwei Nenner vermischen.
export function messzeileModell({ label = '', glossar = null, hint = null, count = null, n = 0, pct = null, richtung = 'up', referenz = null, jahre = [], laufendesJahr = new Date().getFullYear(), skala = {} } = {}) {
  const skalaMin = typeof skala.min === 'number' ? skala.min : MESSZEILE_MIN;
  const skalaMax = typeof skala.max === 'number' ? skala.max : 1;
  const pos = (v) => mzPos(v, skalaMin, skalaMax);
  const wertPct = mzNum(pct) ? pct : (mzNum(count) && n > 0 ? count / n : null);
  const iv = mzNum(count) && n > 0 ? wilsonInterval(count, n) : { low: null, high: null, half: null };
  const reihe = mzJahre(jahre);
  // «Letztes Jahr» ist das jüngste ABGESCHLOSSENE Jahr. Das laufende Jahr ist unfertig – ihm fehlen Wiederholungen
  // und Nachträge; es gegen ein volles Jahr zu rechnen ergibt einen Abfall, den es nicht gibt. Im Verlauf bleibt es
  // sichtbar, aber als offener Punkt markiert: Verschweigen wäre die andere Lüge.
  const fertig = reihe.filter((j) => j.year < laufendesJahr);
  const letzte = fertig.length ? fertig[fertig.length - 1] : null;
  const davor = fertig.length > 1 ? fertig[fertig.length - 2] : null;
  const dPp = letzte && davor ? mzPp((letzte.pct - davor.pct) * 100) : null;
  const guenstig = richtung === 'down' ? -1 : richtung === 'neutral' ? 0 : 1;
  const modell = {
    label,
    glossar,
    hint,
    wert: { pct: wertPct, text: formatPct(wertPct) },
    n,
    klein: (n || 0) > 0 && n < SMALL_N,
    skala: {
      min: skalaMin,
      max: skalaMax,
      pos: wertPct === null ? null : pos(wertPct),
      // Ausserhalb der Spur wird nichts abgeschnitten: Der Punkt steht am Anschlag, und die Zeile sagt, an welchem
      anschlag: wertPct !== null && wertPct < skalaMin,
      anschlagOben: wertPct !== null && wertPct > skalaMax,
      anschlagText: wertPct === null ? '' : (wertPct < skalaMin ? 'unter ' + formatPct(skalaMin, 0) : wertPct > skalaMax ? 'über ' + formatPct(skalaMax, 0) : ''),
    },
    intervall: iv.low === null ? null : {
      low: iv.low, high: iv.high, half: iv.half,
      von: pos(iv.low), bis: pos(iv.high),
      text: '±' + mzPp(iv.half * 100).toFixed(1) + ' pp',
    },
    referenz: referenz && mzNum(referenz.pct) ? {
      pct: referenz.pct, pos: pos(referenz.pct), label: referenz.label || 'Referenz', text: formatPct(referenz.pct),
      // Abstand zur Referenz in pp: Die Kachel nannte ihn als Delta-Zeile; in der Messzeile steht er an der Marke
      abstand: wertPct === null ? null : mzPp((wertPct - referenz.pct) * 100),
    } : null,
    verlauf: reihe.length >= MESSZEILE_JAHRE_MIN ? {
      von: reihe[0].year, bis: letzte.year, jahre: reihe.length,
      laufend: reihe[reihe.length - 1].year >= laufendesJahr,
      punkte: reihe.map((j, i) => ({ year: j.year, pct: j.pct, laufend: j.year >= laufendesJahr, x: (i / (reihe.length - 1)) * 100, y: 100 - pos(j.pct) })),
    } : null,
    letztesJahr: letzte ? { year: letzte.year, pct: letzte.pct, text: formatPct(letzte.pct) } : null,
    delta: dPp === null ? null : {
      pp: dPp,
      zeichen: dPp > 0 ? '▲' : dPp < 0 ? '▼' : '●',
      text: (dPp > 0 ? '▲' : dPp < 0 ? '▼' : '●') + ' ' + mzVorzeichen(dPp) + ' pp',
      ton: Math.abs(dPp) < MESSZEILE_DELTA_TON_PP || guenstig === 0 ? 'neutral' : (dPp * guenstig > 0 ? 'pos' : 'neg'),
      gegen: davor ? davor.year : null,
    },
  };
  // Abstand zum Benchmark als eigenes Feld: Die Kachel nannte ihn als Zahl, die Messzeile tut es wieder. Der Ton
  // folgt der Regel der Kacheln und der Vergleichstabelle (unter 0.5 pp neutral), damit dieselbe Zahl auf der Seite
  // nicht zweierlei Farbe trägt. Für den Jahresabstand gilt die strengere 2-pp-Schwelle aus dem Auftrag.
  // Anzahl: Zähler und Grundgesamtheit – «191 von 977». Nur den Nenner zu nennen, war die Doppeldeutigkeit, die
  // in der Vergleichstabelle und auf den Kacheln schon behoben ist.
  modell.anzahl = mzNum(count) ? count + ' von ' + (n || 0) : 'n = ' + (n || 0);
  modell.benchmark = modell.referenz && modell.referenz.abstand !== null && modell.referenz.abstand !== undefined
    ? (() => {
      const d = deltaView(modell.referenz.abstand, richtung);
      return { pp: modell.referenz.abstand, zeichen: d.symbol, text: d.symbol + ' ' + d.text, ton: d.tone, label: modell.referenz.label };
    })()
    : null;
  // Der Satz für den Mouseover auf der GANZEN Zeile (Paket OPTIK, O4). Vorher trugen nur der Intervallbalken und
  // die Referenzmarke ein title – zwei Ziele von wenigen Pixeln in einer Zeile von 30 px. Dieselbe Ablesung wie
  // der Satz je Zeile im Punktdiagramm (Paket I, P4): Wert, Zähler MIT Nenner, Intervall von–bis, Jahreswert.
  modell.titel = [
    label,
    modell.wert.text,
    modell.anzahl,
    modell.intervall ? '95-%-Intervall ' + formatPct(modell.intervall.low) + ' bis ' + formatPct(modell.intervall.high) : null,
    modell.referenz ? modell.referenz.label + ' ' + modell.referenz.text : null,
    modell.letztesJahr ? modell.letztesJahr.year + ': ' + modell.letztesJahr.text : null,
    modell.klein ? 'kleine Gruppe (n < ' + SMALL_N + ')' : null,
  ].filter(Boolean).join(' · ');
  modell.ariaLabel = [
    label + ': ' + mzWorte(wertPct),
    // «n gleich 977» nannte nur den Nenner – dieselbe Doppeldeutigkeit, die die Spalte «Anzahl» längst behoben hat.
    // Der Auftraggeber liest n als Grundgesamtheit; ohne Zähler ist das an JEDER Stelle ein Mangel. Gesprochen
    // wird ausgeschrieben: «2 von 13», und ohne Zähler «n gleich 13» – ein «=» liest nicht jedes Hilfsmittel vor.
    (mzNum(count) ? count + ' von ' + (n || 0) : 'n gleich ' + (n || 0)) + (modell.klein ? ', kleine Gruppe' : ''),
    modell.intervall ? '95-Prozent-Intervall ' + mzWorte(modell.intervall.low) + ' bis ' + mzWorte(modell.intervall.high) : 'kein Intervall',
    modell.skala.anschlagText ? modell.skala.anschlagText + ', am Anschlag der Spur' : null,
    modell.referenz ? modell.referenz.label + ' ' + mzWorte(modell.referenz.pct) + (modell.referenz.abstand === null ? '' : ', Abstand ' + (modell.referenz.abstand > 0 ? 'plus ' : modell.referenz.abstand < 0 ? 'minus ' : '') + Math.abs(modell.referenz.abstand).toFixed(1) + ' Prozentpunkte') : null,
    modell.letztesJahr ? 'letztes abgeschlossenes Jahr ' + modell.letztesJahr.year + ' ' + mzWorte(modell.letztesJahr.pct) : null,
    modell.verlauf && modell.verlauf.laufend ? 'das laufende Jahr ' + modell.verlauf.punkte[modell.verlauf.punkte.length - 1].year + ' ist unvollständig und zählt nicht für den Vergleich' : null,
    modell.delta ? 'Veränderung gegen ' + modell.delta.gegen + ' ' + (modell.delta.pp > 0 ? 'plus ' : modell.delta.pp < 0 ? 'minus ' : '') + Math.abs(modell.delta.pp).toFixed(1) + ' Prozentpunkte' : null,
  ].filter(Boolean).join(', ') + '.';
  return modell;
}

// Sparkline: role="img" mit Text, kein dekoratives SVG. Letzter Punkt markiert.
function mzVerlauf(verlauf) {
  if (!verlauf) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const w = 64;
  const h = 20;
  const rand = 3; // Platz für den Endpunkt, sonst wird der Kreis am Rahmen beschnitten
  const px = (p) => rand + (p.x / 100) * (w - 2 * rand);
  const py = (p) => rand + (p.y / 100) * (h - 2 * rand);
  const fertig = verlauf.punkte.filter((p) => !p.laufend);
  const punkte = fertig.map((p) => px(p) + ',' + py(p)).join(' ');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('class', 'mz-verlauf');
  svg.setAttribute('role', 'img');
  svg.setAttribute('focusable', 'false');
  const titel = document.createElementNS(NS, 'title');
  const ende = verlauf.punkte[verlauf.punkte.length - 1];
  titel.textContent = 'Verlauf ' + verlauf.von + ' bis ' + verlauf.bis + ' (' + verlauf.jahre + ' Jahre mit n ≥ ' + SMALL_N + '), zuletzt '
    + formatPct(ende.pct) + (ende.laufend ? ' – ' + ende.year + ' läuft noch und ist unvollständig' : '');
  const linie = document.createElementNS(NS, 'polyline');
  linie.setAttribute('points', punkte);
  linie.setAttribute('class', 'mz-verlauf-linie');
  // Das laufende Jahr hängt als gestricheltes Stück an der Linie und trägt eine Raute – dasselbe Zeichen wie im
  // Liniendiagramm (Paket H). Der hohle Marker bleibt dort «n < 5» vorbehalten.
  const laufend = verlauf.punkte.find((p) => p.laufend);
  const stueck = laufend && fertig.length ? document.createElementNS(NS, 'polyline') : null;
  if (stueck) {
    const vor = fertig[fertig.length - 1];
    stueck.setAttribute('points', px(vor) + ',' + py(vor) + ' ' + px(laufend) + ',' + py(laufend));
    stueck.setAttribute('class', 'mz-verlauf-linie-laufend');
  }
  const d = 3;
  const punkt = ende.laufend ? document.createElementNS(NS, 'polygon') : document.createElementNS(NS, 'circle');
  if (ende.laufend) {
    const x = px(ende);
    const y = py(ende);
    punkt.setAttribute('points', [[x, y - d], [x + d, y], [x, y + d], [x - d, y]].map((p) => p.join(',')).join(' '));
    punkt.setAttribute('class', 'mz-verlauf-ende mz-verlauf-laufend');
  } else {
    punkt.setAttribute('cx', px(ende));
    punkt.setAttribute('cy', py(ende));
    punkt.setAttribute('r', 2.5);
    punkt.setAttribute('class', 'mz-verlauf-ende');
  }
  svg.append(titel, linie, ...(stueck ? [stueck] : []), punkt);
  return svg;
}

// Skalenzelle: Spur, Wilson-Balken, Referenzmarke, Wertpunkt. Ohne Wert bleibt die Spur leer.
function mzSkala(m) {
  const kinder = [el('span', { class: 'mz-spur' })];
  if (m.intervall) kinder.push(el('span', { class: 'mz-intervall', style: 'left:' + m.intervall.von + '%;right:' + (100 - m.intervall.bis) + '%', title: '95-%-Intervall ' + m.intervall.text }));
  if (m.referenz) {
    const abstand = m.referenz.abstand === null || m.referenz.abstand === undefined ? '' : ' (' + (m.referenz.abstand > 0 ? '+' : m.referenz.abstand < 0 ? '−' : '±') + Math.abs(m.referenz.abstand).toFixed(1) + ' pp)';
    kinder.push(el('span', { class: 'mz-referenz', style: 'left:' + m.referenz.pos + '%', title: m.referenz.label + ': ' + m.referenz.text + abstand }));
  }
  if (m.skala.pos !== null) kinder.push(el('span', { class: 'mz-punkt' + (m.skala.anschlag || m.skala.anschlagOben ? ' am-anschlag' : ''), style: 'left:' + m.skala.pos + '%' }));
  // Ausserhalb der Spur wird nichts abgeschnitten: Der Punkt steht am Anschlag, und daneben steht, dass er das tut.
  if (m.skala.anschlagText) kinder.push(el('span', { class: 'mz-anschlag' + (m.skala.anschlagOben ? ' oben' : ''), text: m.skala.anschlagText }));
  // Was nur die Grafik zeigt, steht zusätzlich als Text da: Ein aria-label auf einem <li> sagen nicht alle
  // Hilfsmittel verlässlich an, der versteckte Satz schon.
  const worte = [
    m.intervall ? '95-Prozent-Intervall ' + formatPct(m.intervall.low) + ' bis ' + formatPct(m.intervall.high) : null,
    m.referenz ? m.referenz.label + ' ' + m.referenz.text + (m.referenz.abstand === null ? '' : ', Abstand ' + (m.referenz.abstand > 0 ? 'plus ' : m.referenz.abstand < 0 ? 'minus ' : '') + Math.abs(m.referenz.abstand).toFixed(1) + ' Prozentpunkte') : null,
    m.skala.anschlagText ? 'Wert ' + m.skala.anschlagText + ', am Anschlag der Spur' : null,
  ].filter(Boolean).join('; ');
  if (worte) kinder.push(el('span', { class: 'visually-hidden', text: worte + '.' }));
  return el('div', { class: 'mz-skala' }, kinder);
}

export function messzeile(m) {
  const wert = el('span', { class: 'mz-wert' }, [m.wert.text, m.klein ? el('span', { class: 'mz-klein', title: SMALL_NOTE, text: ' ' + SMALL_MARK }) : null]);
  // Die ganze Zeile ist die Trefferfläche, nicht der 2-px-Balken darin – aber der title hängt NICHT am <li>:
  // Dort wäre er die «description» neben dem aria-label, und beide sagen dasselbe in anderen Worten (gemessen im
  // Accessibility-Baum). Stattdessen eine eigene, durchsichtige Fläche über der Zeile, für Hilfsmittel versteckt –
  // dieselbe Lösung wie beim Punktdiagramm in Paket I (P4).
  return el('li', { class: 'messzeile', role: 'listitem', 'aria-label': m.ariaLabel }, [
    el('span', { class: 'mz-treffer', title: m.titel, 'aria-hidden': 'true' }),
    el('span', { class: 'mz-label' }, [m.label, m.hint ? infoIcon(m.hint, 'Definition: ') : null]),
    mzSkala(m),
    wert,
    el('span', { class: 'mz-n', text: m.anzahl }),
    el('span', { class: 'mz-verlauf-zelle' }, [mzVerlauf(m.verlauf)]),
    el('span', { class: 'mz-vorjahr', text: m.letztesJahr ? m.letztesJahr.year + ': ' + m.letztesJahr.text : '' }),
    el('span', { class: 'mz-delta ton-' + (m.delta ? m.delta.ton : 'neutral'), text: m.delta ? m.delta.text : '' }),
    el('span', { class: 'mz-bench ton-' + (m.benchmark ? m.benchmark.ton : 'neutral'), text: m.benchmark ? m.benchmark.text : '', title: m.benchmark ? 'Abstand zum ' + m.benchmark.label : null }),
  ]);
}

// Bestandsband (Paket OPTIK, O4a): ein Band über die Vorgänge, Breite nach Menge. Rollenstruktur wie beim
// Punktdiagramm in Paket I (P4): eine Liste mit einem Eintrag je Abschnitt, der title je Eintrag ist der
// Mouseover-Text UND der Name im Accessibility-Baum – einmal geschrieben, nicht zweimal. Die Legende nennt jeden
// Abschnitt zusätzlich in Worten, damit die Aussage nicht nur an der Farbe hängt.
export function bestandsband(modell) {
  if (!modell || !modell.abschnitte.length) return null;
  const band = el('div', { class: 'bb-band', role: 'list', 'aria-label': modell.titel + ', ' + modell.abschnitte.length + ' Abschnitte' },
    modell.abschnitte.map((a) => el('span', {
      class: 'bb-teil bb-' + a.key, role: 'listitem', title: a.text,
      style: 'flex-grow:' + Math.max(a.anteil, 0.0001),
    })));
  const legende = el('div', { class: 'bb-legende' }, modell.abschnitte.map((a) => el('span', { class: 'bb-legende-item' }, [
    el('span', { class: 'bb-key bb-' + a.key }),
    a.label + ' ' + a.anzahl,
    infoIcon(a.hint, 'Definition: '),
  ])));
  return el('section', { class: 'bb block' }, [
    el('h3', { text: modell.titel }),
    band,
    legende,
    el('p', { class: 'bb-note', text: modell.note }),
  ]);
}

// Block mehrerer Messzeilen: die Skala steht einmal darüber, sie gilt für alle Zeilen darunter.
export function messzeilenBlock(titel, modelle, { referenzLabel = null, skala = {} } = {}) {
  const min = typeof skala.min === 'number' ? skala.min : ((modelle && modelle[0] && modelle[0].skala.min) ?? MESSZEILE_MIN);
  const max = typeof skala.max === 'number' ? skala.max : ((modelle && modelle[0] && modelle[0].skala.max) ?? 1);
  // Die Mitte der Spur ist nicht immer eine ganze Zahl (0–25 % → 12.5 %); eine Dezimale nur, wo sie nötig ist
  const markeText = (v) => formatPct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 1);
  const marken = [min, (min + max) / 2, max].map((v) => el('span', { class: 'mz-marke', style: 'left:' + mzPos(v, min, max) + '%', text: markeText(v) }));
  // Der Titel ist eine echte Überschrift – jeder Block der Ansicht trägt eine, und sie steht in der Kopfzeile der
  // Spur, kostet also keine eigene Zeile.
  const kopf = el('div', { class: 'mz-kopf' }, [
    titel ? el('h3', { class: 'mz-label mz-titel', text: titel }) : el('span', { class: 'mz-label' }),
    el('div', { class: 'mz-skala mz-achse' }, marken),
    // Zwei Abstände nebeneinander brauchen zwei Namen, sonst heisst «▲ +3.7 pp» zweimal etwas anderes
    el('span', { class: 'mz-wert', text: 'Wert' }),
    el('span', { class: 'mz-n', text: 'Anzahl' }),
    el('span', { class: 'mz-verlauf-zelle', text: 'Verlauf' }),
    el('span', { class: 'mz-vorjahr', text: 'letztes Jahr' }),
    el('span', { class: 'mz-delta', text: 'Δ Vorjahr' }),
    el('span', { class: 'mz-bench', text: referenzLabel ? 'Δ Benchmark' : '' , title: referenzLabel ? 'Abstand zum Benchmark «' + referenzLabel + '»' : null }),
  ]);
  return el('section', { class: 'block messzeilen' }, [
    kopf,
    el('ol', { class: 'messzeilen-liste', role: 'list' }, (modelle || []).map((m) => messzeile(m))),
  ]);
}
