// app.js – Shell: Anmeldung, Laden, Status, Filterleiste, Navigation, Fehleranzeige. Views rendern in #view.

import { getAuth, AuthConfigError } from './auth.js';
import { GraphError, AuthExpiredError } from './graph.js';
import { load, loadFromFile } from './datasource/index.js';
import { FileNotFoundError, SheetMissingError } from './datasource/fileAdapter.js';
import { createStore, MissingHeaderError, DuplicateHeaderError } from './store.js';
import { filterPersons, eligible, benchmarkFilter, BENCHMARKS, personCount } from './metrics.js';
import { filterLines, fmtDateTime, fmtTime, MODE_LABELS } from './export.js';
import { parseHash, buildHash, sameFilter, parseDay, formatDay } from './urlState.js';
import { el, exportBar } from './views/common.js';
import { vorgangExportTables } from './views/tables.js';
import { renderDataQuality } from './views/dataQuality.js';
import * as overview from './views/overview.js';
import * as written from './views/written.js';
import * as oral from './views/oral.js';
import * as vssVsm from './views/vssVsm.js';
import * as ranking from './views/ranking.js';
import * as planned from './views/planned.js';
import * as offen from './views/offen.js';
import * as zeitverlauf from './views/zeitverlauf.js';
import * as glossar from './views/glossar.js';

const KPI_VIEWS = [overview, written, oral, vssVsm, zeitverlauf, ranking, offen, planned];
const VIEWS = KPI_VIEWS.map((v) => ({ id: v.id, label: v.label, build: v.build }))
  .concat([{ id: 'datenqualitaet', label: 'Datenqualität' }, { id: glossar.id, label: glossar.label, build: glossar.build, isStatic: true }]);

// Aller Zustand liegt im Store (Filter, Anzeigezustand, Daten); app.js hält nur DOM-Referenzen und Lauf-Flags (Befund 16).
const store = createStore();
const auth = getAuth();
const ui = {};
let authReady = false;
let busy = false;

function $(id) {
  return document.getElementById(id);
}

function hasData() {
  const { meta } = store.getState();
  return !!(meta && meta.fileName);
}

function viewFromHash() {
  const id = parseHash(location.hash).view;
  return VIEWS.some((v) => v.id === id) ? id : VIEWS[0].id;
}

// ---------------------------------------------------------------------------
// URL: #ansicht?filter… – Filter- und Anzeigezustand teilbar (Befund 8), keine Personendaten
// ---------------------------------------------------------------------------

// Zustand → URL (replaceState: keine History-Einträge je Filterklick, kein hashchange)
function syncHash() {
  const { filter, ui: uiState } = store.getState();
  const target = buildHash(viewFromHash(), filter, uiState);
  if (location.hash !== target) history.replaceState(null, '', target);
}

// URL → Zustand: bei Parametern Filter/Anzeige übernehmen (ein Store-Update), sonst nur die Ansicht wechseln
function applyHash() {
  const parsed = parseHash(location.hash);
  const { filter, ui: uiState } = store.getState();
  const filterChanged = parsed.hasParams && !sameFilter(parsed.filter, filter);
  const uiChanged = parsed.hasParams && parsed.ui.benchmark !== uiState.benchmark;
  if (filterChanged || uiChanged) {
    store.update({ filter: filterChanged ? parsed.filter : null, ui: uiChanged ? { benchmark: parsed.ui.benchmark } : null });
  } else {
    renderAll();
  }
}

// ---------------------------------------------------------------------------
// Kopf, Status, Navigation
// ---------------------------------------------------------------------------

function renderNav() {
  const current = viewFromHash();
  const { filter, ui: uiState } = store.getState();
  ui.nav.replaceChildren(...VIEWS.map((v) => {
    // Links tragen den Filterzustand mit, damit der Ansichtswechsel ihn behält
    const a = el('a', { href: buildHash(v.id, filter, uiState), text: v.label, class: v.id === current ? 'active' : null });
    if (v.id === current) a.setAttribute('aria-current', 'page');
    return a;
  }));
}

function renderSession() {
  const account = auth.getAccount();
  ui.account.textContent = account ? (account.name || account.username || '') : (authReady ? 'Nicht angemeldet' : '');
  ui.signin.hidden = !authReady || !!account;
  ui.signout.hidden = !account;
  ui.load.disabled = busy || !account;
  ui.load.title = account ? '' : (authReady ? 'Zuerst anmelden' : 'Azure-Konfiguration fehlt (config.js)');
}

function renderStatus(text) {
  ui.status.classList.toggle('busy', busy);
  if (text) {
    ui.status.textContent = text;
    return;
  }
  const { meta, persons } = store.getState();
  if (!hasData()) {
    ui.status.textContent = 'Keine Daten geladen.';
    return;
  }
  const source = meta.source === 'file' ? 'lokale Datei (nur im Browser)' : 'SharePoint';
  const counts = meta.counts || {};
  const keyNote = meta.personKey && !meta.personKey.complete ? ' · Personenschlüssel nur aus Namen (Geburtsdatum-Header nicht gefunden)' : '';
  ui.status.textContent = meta.fileName + ' (' + source + ') · geändert ' + (fmtDateTime(meta.lastModified) || '–') + ' · geladen ' + (fmtTime(meta.loadedAt) || '–')
    + ' · ' + (counts.zeilen || persons.length) + ' Zeilen (' + (counts.first || 0) + ' First Certification, ' + (counts.issued || 0) + ' Ausgestellte Zertifikate)'
    + ' · ' + (counts.vorgaenge || 0) + ' Vorgänge, ' + (counts.personen || 0) + ' Personen, ' + (counts.duplikate || 0) + ' Duplikate'
    + ' · kennzahlrelevant ' + eligible(persons).length + ' · offen ' + (counts.offen || 0) + ' · nicht erfasst ' + (counts.nichtErfasst || 0)
    + ' · Data-Quality-Log: ' + (counts.fehler || 0) + ' Fehler, ' + (counts.hinweise || 0) + ' Hinweise, ' + (counts.nichtAusgewertet || 0) + ' nicht ausgewertet'
    + keyNote;
}

// ---------------------------------------------------------------------------
// Filterleiste – einmal je Datenstand gebaut; Filteränderungen aktualisieren nur Werte und Zusammenfassung,
// damit der Tastaturfokus auf dem bedienten Element bleibt (Befund 9)
// ---------------------------------------------------------------------------

const filterBar = { dataKey: null, controls: null };

function isYear(filter, year) {
  return !!(filter.from && filter.to && filter.from.getTime() === new Date(year, 0, 1).getTime() && filter.to.getTime() === new Date(year, 11, 31).getTime());
}

function selectControl(labelText, options, onChange) {
  const select = el('select', { onchange: (ev) => onChange(ev.target.value) }, options.map((o) => el('option', { value: o.value, text: o.label })));
  return { node: el('label', {}, [labelText, select]), select };
}

// Wert setzen; ein Wert, der nicht in den Optionen ist (z. B. aus einer URL), wird als eigene Option gezeigt
function setSelect(select, value) {
  if (![...select.options].some((o) => o.value === value)) {
    select.appendChild(el('option', { value, text: value + ' (nicht in den Daten)' }));
  }
  select.value = value;
}

function buildFilterBar() {
  const bar = ui.filterbar;
  bar.replaceChildren();
  const { persons } = store.getState();
  const opts = store.getFilterOptions();
  const years = [...new Set(eligible(persons).filter((p) => p.refDate).map((p) => p.refDate.getFullYear()))].sort((a, b) => b - a);
  const set = (partial) => store.setFilter(partial);
  const listOptions = (values) => [{ value: '', label: 'Alle' }].concat(values.map((v) => ({ value: v, label: v })));
  const c = {};
  c.from = el('input', { type: 'date', onchange: (ev) => set({ from: parseDay(ev.target.value) }) });
  c.to = el('input', { type: 'date', onchange: (ev) => set({ to: parseDay(ev.target.value) }) });
  c.years = [{ year: null, button: el('button', { type: 'button', class: 'secondary', text: 'Alle', onclick: () => set({ from: null, to: null }) }) }]
    .concat(years.map((y) => ({ year: y, button: el('button', { type: 'button', class: 'secondary', text: String(y), onclick: () => set({ from: new Date(y, 0, 1), to: new Date(y, 11, 31) }) }) })));
  const profil = selectControl('Profil', listOptions(opts.profil), (v) => set({ profil: v ? [v] : [] }));
  const sprache = selectControl('Sprache', listOptions(opts.sprache), (v) => set({ sprache: v ? [v] : [] }));
  const bank = selectControl('Bank', listOptions(opts.bank), (v) => set({ bank: v ? [v] : [] }));
  const vssVsm = selectControl('VSS/VSM', [{ value: 'alle', label: 'Alle' }, { value: 'vss', label: 'Nur VSS' }, { value: 'vsm', label: 'Nur VSM' }, { value: 'ohne', label: 'Ohne VSS/VSM' }], (v) => set({ vssVsm: v }));
  const versuche = selectControl('Versuche', [{ value: 'alle', label: 'Alle' }, { value: 'erstversuch', label: 'Nur 1. Versuch' }, { value: 'mehrere', label: 'Mehrere Versuche' }], (v) => set({ versuche: v }));
  Object.assign(c, { profil: profil.select, sprache: sprache.select, bank: bank.select, vssVsm: vssVsm.select, versuche: versuche.select });
  c.onlyIssued = el('input', { type: 'checkbox', onchange: (ev) => set({ onlyIssued: ev.target.checked }) });
  c.summary = el('div', { class: 'summary' });
  bar.append(
    el('label', {}, ['Von', c.from]),
    el('label', {}, ['Bis', c.to]),
    el('label', {}, ['Jahr', el('div', { class: 'years' }, c.years.map((y) => y.button))]),
    profil.node, sprache.node, bank.node, vssVsm.node, versuche.node,
    el('label', { class: 'check' }, [c.onlyIssued, 'Nur ausgestellte Zertifikate']),
    el('button', { type: 'button', class: 'secondary reset', text: 'Filter zurücksetzen', onclick: () => store.resetFilter() }),
    c.summary,
  );
  filterBar.controls = c;
}

function updateFilterBar() {
  const bar = ui.filterbar;
  bar.hidden = !hasData();
  if (!hasData()) {
    filterBar.dataKey = null;
    filterBar.controls = null;
    bar.replaceChildren();
    return;
  }
  const { meta, filter } = store.getState();
  const dataKey = meta.loadedAt instanceof Date ? meta.loadedAt.getTime() : meta.fileName;
  if (!filterBar.controls || filterBar.dataKey !== dataKey) {
    buildFilterBar();
    filterBar.dataKey = dataKey;
  }
  const c = filterBar.controls;
  const single = (list) => (list && list.length === 1 ? list[0] : '');
  c.from.value = formatDay(filter.from);
  c.to.value = formatDay(filter.to);
  for (const { year, button } of c.years) button.classList.toggle('active', year === null ? !filter.from && !filter.to : isYear(filter, year));
  setSelect(c.profil, single(filter.profil));
  setSelect(c.sprache, single(filter.sprache));
  setSelect(c.bank, single(filter.bank));
  c.vssVsm.value = filter.vssVsm;
  c.versuche.value = filter.versuche;
  c.onlyIssued.checked = !!filter.onlyIssued;
  const filtered = store.getFilteredPersons();
  const multi = ['profil', 'sprache', 'bank'].some((k) => filter[k].length > 1) ? ' · Mehrfachauswahl aus der URL (Auswahlfelder zeigen «Alle»)' : '';
  c.summary.textContent = filtered.length + ' Vorgänge (' + personCount(filtered) + ' Personen) im Filter, mit absolviertem, datiertem WE-Run · '
    + filterLines(filter, meta).slice(1).filter((l) => !l.startsWith('Wertung')).join(' · ') + multi;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function renderDq(table) {
  const { dq, persons, ui: uiState } = store.getState();
  renderDataQuality(table, dq, uiState.dq || {}, (next) => store.setUi({ dq: next }), { persons });
}

function renderView() {
  const current = viewFromHash();
  renderNav();
  const view = VIEWS.find((v) => v.id === current);
  const container = ui.view;
  container.replaceChildren();
  container.appendChild(el('h2', { text: view.label }));

  const state = store.getState();
  if (view.isStatic) {
    // Statische Ansicht (Glossar): unabhängig von Daten und Filter
    const built = view.build({});
    container.appendChild(exportBar({ viewId: view.id, tables: built.tables, headerLines: [] }));
    for (const node of built.nodes) container.appendChild(node);
    return;
  }
  if (!hasData()) {
    container.appendChild(el('p', { class: 'empty', text: 'Noch keine Daten geladen. Bitte anmelden und «Daten von SharePoint laden» oder eine lokale Excel-Datei prüfen.' }));
    return;
  }

  if (current === 'datenqualitaet') {
    container.appendChild(el('p', { class: 'meta-list', text: 'Jede Zelle, die nicht interpretierbar ist (Fehler) oder von der Erwartung abweicht bzw. abgeleitet wurde (Hinweis), erscheint hier mit ihrer Wirkung auf die Kennzahlen, Stufe, Sheet, Excel-Zeile, Header, Rohwert und Grund – Wichtigstes zuerst. Unabhängig vom Filter.' }));
    const table = el('div');
    container.appendChild(table);
    renderDq(table);
    return;
  }

  const filter = state.filter;
  const headerLines = filterLines(filter, state.meta);
  const ctx = {
    persons: store.getFilteredPersons(),
    allPersons: eligible(state.persons), // kennzahlrelevante Vorgänge ohne Filter (Personen mit mehreren Profilen)
    plannedPersons: filterPersons(state.persons, filter, { eligibleOnly: false, period: false }),
    timePersons: filterPersons(state.persons, filter, { period: false }), // kennzahlrelevant, alle Jahre (Zeitverlauf)
    compare: state.ui.compare,
    onCompareChange: (compare) => store.setUi({ compare }),
    mode: filter.mode,
    modeLabel: MODE_LABELS[filter.mode] || filter.mode,
    filter,
    meta: state.meta,
    headerLines,
    benchmark: {
      kind: state.ui.benchmark,
      label: (BENCHMARKS.find((b) => b.id === state.ui.benchmark) || BENCHMARKS[0]).label,
      persons: filterPersons(state.persons, benchmarkFilter(filter, state.ui.benchmark)),
    },
    onBenchmarkChange: (kind) => store.setUi({ benchmark: kind }),
    onModeChange: (mode) => store.setFilter({ mode }),
  };
  let built;
  try {
    built = view.build(ctx);
  } catch (e) {
    showError(e);
    return;
  }
  container.appendChild(el('div', { class: 'print-filter', text: headerLines.join(' · ') }));
  container.appendChild(exportBar({ viewId: view.id, tables: built.tables, headerLines, extra: { label: 'Vorgangsebene', tables: vorgangExportTables(ctx.persons) } }));
  for (const node of built.nodes) container.appendChild(node);
}

function renderAll() {
  renderStatus();
  updateFilterBar();
  renderView();
  syncHash();
}

// ---------------------------------------------------------------------------
// Fehleranzeige
// ---------------------------------------------------------------------------

function describeError(e) {
  if (e instanceof AuthConfigError) {
    return { title: 'Azure-Konfiguration fehlt', message: e.message, hint: 'Ohne Konfiguration kann keine Datei von SharePoint geladen werden. Eine lokale Excel-Datei kann trotzdem geprüft werden.' };
  }
  if (e instanceof MissingHeaderError) {
    return {
      title: 'Excel-Struktur weicht ab: Pflicht-Header fehlen (Sheet «' + e.sheet + '», Zeile 10)',
      message: 'Die Datei wird nicht verarbeitet, bis die Header vorhanden sind. Erwartete Header (Varianten mit |):',
      list: e.missing.map((m) => m.candidates.join(' | ')),
      hint: 'Die Excel-Datei wird von dieser App nie verändert. Bitte prüfen, ob Header umbenannt oder verschoben wurden.',
    };
  }
  if (e instanceof DuplicateHeaderError) {
    return { title: 'Excel-Struktur weicht ab: Header mehrdeutig', message: e.message, hint: 'Ein Header darf in Zeile 10 nur einmal vorkommen.' };
  }
  if (e instanceof SheetMissingError) return { title: 'Sheet fehlt', message: e.message };
  if (e instanceof FileNotFoundError) return { title: 'Datei nicht gefunden', message: e.message };
  if (e instanceof AuthExpiredError) return { title: 'Anmeldung abgelaufen', message: e.message, hint: 'Bitte erneut anmelden und den Ladevorgang wiederholen.', signIn: true };
  if (e instanceof GraphError) {
    return { title: e.retryable ? 'Dienst vorübergehend nicht verfügbar' : 'Fehler beim Zugriff auf Microsoft Graph', message: e.message, retry: e.retryable };
  }
  if (e && (e.errorCode === 'user_cancelled' || e.errorCode === 'popup_window_error' || e.errorCode === 'empty_window_error')) {
    return { title: 'Anmeldung nicht abgeschlossen', message: 'Das Anmeldefenster wurde geschlossen oder blockiert.', hint: 'Bitte Popups für diese Seite erlauben und erneut anmelden.' };
  }
  return { title: 'Fehler', message: (e && e.message) || String(e) };
}

function showError(e) {
  console.error(e);
  const d = describeError(e);
  const box = ui.error;
  box.replaceChildren(el('h3', { text: d.title }), el('p', { text: d.message }));
  if (d.list) box.appendChild(el('ul', {}, d.list.map((item) => el('li', { text: item }))));
  if (d.hint) box.appendChild(el('p', { class: 'hint', text: d.hint }));
  if (d.retry) box.appendChild(el('button', { type: 'button', text: 'Erneut versuchen', onclick: () => run(loadGraph) }));
  if (d.signIn) box.appendChild(el('button', { type: 'button', text: 'Erneut anmelden', onclick: () => run(signIn) }));
  box.hidden = false;
}

function clearError() {
  ui.error.hidden = true;
  ui.error.replaceChildren();
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

async function run(action) {
  if (busy) return;
  busy = true;
  clearError();
  renderSession();
  try {
    await action();
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    renderSession();
    renderStatus();
  }
}

async function signIn() {
  renderStatus('Anmeldung …');
  await auth.signIn();
}

async function signOut() {
  store.clear();
  await auth.signOut();
}

async function loadGraph() {
  renderStatus('Lade Reporting_KUBA.xlsx von SharePoint …');
  store.setData(await load());
}

async function loadLocal(file) {
  renderStatus('Lese ' + file.name + ' (nur im Browser) …');
  store.setData(await loadFromFile(file));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function init() {
  ui.account = $('account');
  ui.signin = $('btn-signin');
  ui.signout = $('btn-signout');
  ui.load = $('btn-load');
  ui.file = $('file-input');
  ui.status = $('status');
  ui.error = $('error');
  ui.nav = $('nav');
  ui.filterbar = $('filterbar');
  ui.view = $('view');

  ui.signin.addEventListener('click', () => run(signIn));
  ui.signout.addEventListener('click', () => run(signOut));
  ui.load.addEventListener('click', () => run(loadGraph));
  ui.file.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (file) run(() => loadLocal(file));
  });
  window.addEventListener('hashchange', applyHash);
  store.subscribe(renderAll);

  applyHash(); // Filter aus der URL übernehmen und erste Ansicht rendern
  try {
    await auth.init();
    authReady = true;
  } catch (e) {
    authReady = false;
    showError(e);
  }
  renderSession();
}

init();
