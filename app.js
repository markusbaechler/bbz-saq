// app.js – Shell: Anmeldung, Laden, Status, Filterleiste, Navigation, Fehleranzeige. Views rendern in #view.

import { getAuth, AuthConfigError } from './auth.js';
import { GraphError, AuthExpiredError } from './graph.js';
import { load, loadFromFile } from './datasource/index.js';
import { FileNotFoundError, SheetMissingError } from './datasource/fileAdapter.js';
import { createStore, MissingHeaderError, DuplicateHeaderError } from './store.js';
import { filterPersons, eligible, dayKey, benchmarkFilter, BENCHMARKS, personCount } from './metrics.js';
import { filterLines, fmtDateTime, fmtTime, MODE_LABELS } from './export.js';
import { el, exportBar } from './views/common.js';
import { renderDataQuality, DEFAULT_DQ_STATE } from './views/dataQuality.js';
import * as overview from './views/overview.js';
import * as written from './views/written.js';
import * as oral from './views/oral.js';
import * as vssVsm from './views/vssVsm.js';
import * as ranking from './views/ranking.js';
import * as planned from './views/planned.js';
import * as glossar from './views/glossar.js';

const KPI_VIEWS = [overview, written, oral, vssVsm, ranking, planned];
const VIEWS = KPI_VIEWS.map((v) => ({ id: v.id, label: v.label, build: v.build }))
  .concat([{ id: 'datenqualitaet', label: 'Datenqualität' }, { id: glossar.id, label: glossar.label, build: glossar.build, isStatic: true }]);

const store = createStore();
const auth = getAuth();
const ui = {};
let authReady = false;
let busy = false;
let dqState = { ...DEFAULT_DQ_STATE };
let benchmarkKind = 'bank';

function $(id) {
  return document.getElementById(id);
}

function hasData() {
  const { meta } = store.getState();
  return !!(meta && meta.fileName);
}

function viewFromHash() {
  const id = (location.hash || '').replace(/^#/, '');
  return VIEWS.some((v) => v.id === id) ? id : VIEWS[0].id;
}

// ---------------------------------------------------------------------------
// Kopf, Status, Navigation
// ---------------------------------------------------------------------------

function renderNav() {
  const current = viewFromHash();
  ui.nav.replaceChildren(...VIEWS.map((v) => {
    const a = el('a', { href: '#' + v.id, text: v.label, class: v.id === current ? 'active' : null });
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
// Filterleiste
// ---------------------------------------------------------------------------

function toInputDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? dayKey(d) : '';
}

function fromInputDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function isYear(filter, year) {
  return !!(filter.from && filter.to && filter.from.getTime() === new Date(year, 0, 1).getTime() && filter.to.getTime() === new Date(year, 11, 31).getTime());
}

function selectControl(labelText, value, options, onChange) {
  const select = el('select', { onchange: (ev) => onChange(ev.target.value) }, options.map((o) => el('option', { value: o.value, text: o.label })));
  select.value = value;
  return el('label', {}, [labelText, select]);
}

function renderFilterBar() {
  const bar = ui.filterbar;
  bar.hidden = !hasData();
  bar.replaceChildren();
  if (!hasData()) return;
  const { filter, persons } = store.getState();
  const opts = store.getFilterOptions();
  const years = [...new Set(eligible(persons).filter((p) => p.refDate).map((p) => p.refDate.getFullYear()))].sort((a, b) => b - a);
  const set = (partial) => store.setFilter(partial);
  const listOptions = (values) => [{ value: '', label: 'Alle' }].concat(values.map((v) => ({ value: v, label: v })));
  const single = (list) => (list && list.length === 1 ? list[0] : '');

  bar.append(
    el('label', {}, ['Von', el('input', { type: 'date', value: toInputDate(filter.from), onchange: (ev) => set({ from: fromInputDate(ev.target.value) }) })]),
    el('label', {}, ['Bis', el('input', { type: 'date', value: toInputDate(filter.to), onchange: (ev) => set({ to: fromInputDate(ev.target.value) }) })]),
    el('label', {}, ['Jahr', el('div', { class: 'years' }, [
      el('button', { type: 'button', class: 'secondary' + (!filter.from && !filter.to ? ' active' : ''), text: 'Alle', onclick: () => set({ from: null, to: null }) }),
      ...years.map((y) => el('button', { type: 'button', class: 'secondary' + (isYear(filter, y) ? ' active' : ''), text: String(y), onclick: () => set({ from: new Date(y, 0, 1), to: new Date(y, 11, 31) }) })),
    ])]),
    selectControl('Profil', single(filter.profil), listOptions(opts.profil), (v) => set({ profil: v ? [v] : [] })),
    selectControl('Sprache', single(filter.sprache), listOptions(opts.sprache), (v) => set({ sprache: v ? [v] : [] })),
    selectControl('Bank', single(filter.bank), listOptions(opts.bank), (v) => set({ bank: v ? [v] : [] })),
    selectControl('VSS/VSM', filter.vssVsm, [{ value: 'alle', label: 'Alle' }, { value: 'vss', label: 'Nur VSS' }, { value: 'vsm', label: 'Nur VSM' }, { value: 'ohne', label: 'Ohne VSS/VSM' }], (v) => set({ vssVsm: v })),
    selectControl('Versuche', filter.versuche, [{ value: 'alle', label: 'Alle' }, { value: 'erstversuch', label: 'Nur 1. Versuch' }, { value: 'mehrere', label: 'Mehrere Versuche' }], (v) => set({ versuche: v })),
    el('label', { class: 'check' }, [el('input', { type: 'checkbox', onchange: (ev) => set({ onlyIssued: ev.target.checked }) }), 'Nur ausgestellte Zertifikate']),
    el('button', { type: 'button', class: 'secondary reset', text: 'Filter zurücksetzen', onclick: () => store.resetFilter() }),
  );
  bar.querySelector('input[type="checkbox"]').checked = !!filter.onlyIssued;
  const filtered = store.getFilteredPersons();
  bar.appendChild(el('div', { class: 'summary', text: filtered.length + ' Vorgänge (' + personCount(filtered) + ' Personen) im Filter, mit absolviertem, datiertem WE-Run · ' + filterLines(filter, store.getState().meta).slice(1).filter((l) => !l.startsWith('Wertung')).join(' · ') }));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function renderDq(table) {
  renderDataQuality(table, store.getState().dq, dqState, (next) => {
    dqState = next;
    renderDq(table);
  });
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
    container.appendChild(el('p', { class: 'meta-list', text: 'Jede Zelle, die nicht interpretierbar ist (Fehler) oder von der Erwartung abweicht bzw. abgeleitet wurde (Hinweis), erscheint hier mit Sheet, Excel-Zeile, Header, Rohwert und Grund. Unabhängig vom Filter.' }));
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
    mode: filter.mode,
    modeLabel: MODE_LABELS[filter.mode] || filter.mode,
    filter,
    meta: state.meta,
    headerLines,
    benchmark: {
      kind: benchmarkKind,
      label: (BENCHMARKS.find((b) => b.id === benchmarkKind) || BENCHMARKS[0]).label,
      persons: filterPersons(state.persons, benchmarkFilter(filter, benchmarkKind)),
    },
    onBenchmarkChange: (kind) => {
      benchmarkKind = kind;
      renderView();
    },
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
  container.appendChild(exportBar({ viewId: view.id, tables: built.tables, headerLines }));
  for (const node of built.nodes) container.appendChild(node);
}

function renderAll() {
  renderStatus();
  renderFilterBar();
  renderView();
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
  window.addEventListener('hashchange', renderView);
  store.subscribe(renderAll);

  renderAll();
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
