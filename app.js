// app.js – Shell: Anmeldung, Laden, Status, Filterleiste, Navigation, Fehleranzeige. Views rendern in #view.

import { getAuth, AuthConfigError } from './auth.js';
import { GraphError, AuthExpiredError } from './graph.js';
import { load, loadFromFile } from './datasource/index.js';
import { FileNotFoundError, SheetMissingError } from './datasource/fileAdapter.js';
import { createStore, MissingHeaderError, DuplicateHeaderError } from './store.js';
import { filterPersons, eligible, benchmarkFilter, BENCHMARKS, personCount, isVorgang, expertRuns } from './metrics.js';
import { headerCandidates, runKey } from './config.js';
import { filterLines, fmtDateTime, fmtTime, MODE_LABELS } from './export.js';
import { parseHash, buildHash, sameFilter, parseDay, formatDay } from './urlState.js';
import { filterChips, yearOf } from './filterChips.js';
import { el, renderExportMenu, renderCollapsible, renderEmptyState, isPhone, onViewportChange, initials } from './views/common.js';
import { glossarySlug } from './glossary.js';
import { vorgangExportTables, expertRunExportTable } from './views/tables.js';
import { renderDataQuality } from './views/dataQuality.js';
import * as overview from './views/overview.js';
import * as written from './views/written.js';
import * as oral from './views/oral.js';
import * as vssVsm from './views/vssVsm.js';
import * as ranking from './views/ranking.js';
import * as planned from './views/planned.js';
import * as personen from './views/personen.js';
import * as experten from './views/experten.js';
import * as offen from './views/offen.js';
import * as zeitverlauf from './views/zeitverlauf.js';
import * as historie from './views/historie.js';
import * as bankReport from './views/bankReport.js';
import * as glossar from './views/glossar.js';

const KPI_VIEWS = [overview, written, oral, vssVsm, zeitverlauf, bankReport, personen, offen, planned, ranking, experten, historie];
const VIEWS = KPI_VIEWS.map((v) => ({ id: v.id, label: v.label, group: v.group, intro: v.intro, glossar: v.glossar, build: v.build, noPersonExport: !!v.noPersonExport }))
  .concat([
    {
      id: 'datenqualitaet', label: 'Datenqualität', group: 'Daten', glossar: 'Data-Quality-Stufen',
      intro: 'Jede nicht interpretierbare oder auffällige Zelle mit Wirkung, Stufe, Fundstelle und Grund; unabhängig vom Filter.',
      hints: [
        'Jede Zelle, die nicht interpretierbar ist (Fehler) oder von der Erwartung abweicht bzw. abgeleitet wurde (Hinweis), erscheint hier mit ihrer Wirkung auf die Kennzahlen, Stufe, Sheet, Excel-Zeile, Header, Rohwert und Grund – Wichtigstes zuerst. Unabhängig vom Filter.',
        'Nicht in den Kennzahlen – Zeilen: Zeilen ohne absolvierten, datierten schriftlichen Run sowie zusammengeführte Duplikate. Zeilen ohne Namen erscheinen nur im Log (Fehler «Name fehlt»).',
      ],
    },
    { id: glossar.id, label: glossar.label, group: glossar.group, intro: glossar.intro, build: glossar.build, isStatic: true },
  ]);
// Navigationsgruppen (PROMPT-2 A.2, Entscheid 06.09.2026); Gruppen ohne Ansicht (Experten bis Paket D) werden nicht gerendert
const NAV_GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten'];

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
  const groups = NAV_GROUPS.map((name) => ({ name, views: VIEWS.filter((v) => v.group === name) })).filter((g) => g.views.length);
  // Phone (PROMPT-2 B.2): Auswahlfeld mit optgroup je Gruppe; die Links bleiben im DOM und sind auf Phone per CSS ausgeblendet
  const select = el('select', { id: 'nav-select', class: 'nav-select', 'aria-label': 'Ansicht', onchange: (ev) => { location.hash = buildHash(ev.target.value, filter, uiState); } },
    groups.map((g) => el('optgroup', { label: g.name }, g.views.map((v) => el('option', { value: v.id, text: v.label })))));
  select.value = current;
  ui.nav.replaceChildren(select, ...groups.map((g) => el('div', { class: 'nav-group', role: 'group', 'aria-label': g.name }, [
    el('span', { class: 'nav-group-label', 'aria-hidden': 'true', text: g.name }),
    el('div', { class: 'nav-links' }, g.views.map((v) => {
      // Links tragen den Filterzustand mit, damit der Ansichtswechsel ihn behält
      const a = el('a', { href: buildHash(v.id, filter, uiState), text: v.label, class: v.id === current ? 'active' : null });
      if (v.id === current) a.setAttribute('aria-current', 'page');
      return a;
    })),
  ])));
}

function renderSession() {
  const account = auth.getAccount();
  const name = account ? (account.name || account.username || '') : '';
  ui.account.textContent = account ? name : (authReady ? 'Nicht angemeldet' : '');
  ui.signin.hidden = !authReady || !!account;
  ui.signout.hidden = !account;
  // Phone (B.2): Konto als Initialen-Button mit Menü (Name, Abmelden)
  ui.accountMenu.hidden = !account;
  ui.accountInitials.textContent = account ? initials(name) : '';
  ui.accountInitials.title = name;
  ui.accountMenuName.textContent = name;
  ui.load.disabled = busy || !account;
  ui.load.title = account ? '' : (authReady ? 'Zuerst anmelden' : 'Azure-Konfiguration fehlt (config.js)');
}

function renderStatus(text) {
  ui.status.classList.toggle('busy', busy);
  if (text) {
    ui.status.textContent = text;
    renderDatastand(false);
    return;
  }
  const { meta, persons } = store.getState();
  if (!hasData()) {
    ui.status.textContent = 'Keine Daten geladen.';
    renderDatastand(false);
    return;
  }
  const source = meta.source === 'file' ? 'lokale Datei (nur im Browser)' : 'SharePoint';
  const counts = meta.counts || {};
  const keyNote = counts.schluesselOhneGeburtsdatum ? ' · ' + counts.schluesselOhneGeburtsdatum + ' Vorgänge ohne Geburtsdatum (Schlüssel nur aus Namen)' : '';
  ui.status.textContent = meta.fileName + ' (' + source + ') · geändert ' + (fmtDateTime(meta.lastModified) || '–') + ' · geladen ' + (fmtTime(meta.loadedAt) || '–')
    + ' · ' + (counts.zeilen || persons.length) + ' Zeilen (' + (counts.first || 0) + ' First Certification, ' + (counts.issued || 0) + ' Ausgestellte Zertifikate)'
    + ' · ' + (counts.vorgaenge || 0) + ' Vorgänge, ' + (counts.personen || 0) + ' Personen, ' + (counts.duplikate || 0) + ' Duplikate'
    + ' · kennzahlrelevant ' + eligible(persons).length + ' · offen ' + (counts.offen || 0) + ' · nicht erfasst ' + (counts.nichtErfasst || 0)
    + ' · Data-Quality-Log: ' + (counts.fehler || 0) + ' Fehler, ' + (counts.hinweise || 0) + ' Hinweise, ' + (counts.nichtAusgewertet || 0) + ' nicht ausgewertet'
    + keyNote;
  renderDatastand(true);
}

// Datenstand (PROMPT-2 A.2, Befund B2): sichtbar nur ein Einzeiler als summary, alle übrigen Zähler als aufklappbare
// zweispaltige Liste. Der Volltext bleibt in #status (aria-live, Smoke-Test), ist bei geladenen Daten aber nur für
// Screenreader sichtbar; beim Laden und ohne Daten zeigt #status wie bisher.
function renderDatastand(visible) {
  const box = ui.datastand;
  if (!visible) {
    box.hidden = true;
    box.replaceChildren();
    ui.status.classList.remove('visually-hidden');
    return;
  }
  const { meta, persons } = store.getState();
  const c = meta.counts || {};
  const fehler = c.fehler || 0;
  const summary = el('summary', {}, [
    'Datenstand: ' + meta.fileName + ' · geändert ' + (fmtDateTime(meta.lastModified) || '–') + ' · geladen ' + (fmtTime(meta.loadedAt) || '–')
      + ' · ' + (c.zeilen || persons.length) + ' Zeilen · ',
    el('span', { class: fehler ? 'warn' : null, text: 'DQ ' + fehler + ' Fehler' }),
  ]);
  const rows = [
    ['Quelle', meta.source === 'file' ? 'lokale Datei (nur im Browser)' : 'SharePoint'],
    ['Zeilen je Sheet', (c.first || 0) + ' First Certification · ' + (c.issued || 0) + ' Ausgestellte Zertifikate'],
    ['Vorgänge / Personen / Duplikate', (c.vorgaenge || 0) + ' / ' + (c.personen || 0) + ' / ' + (c.duplikate || 0)],
    ['Kennzahlrelevant', String(eligible(persons).length)],
    ['Offen / nicht erfasst', (c.offen || 0) + ' / ' + (c.nichtErfasst || 0)],
    ['Data-Quality-Log', fehler + ' Fehler · ' + (c.hinweise || 0) + ' Hinweise · ' + (c.nichtAusgewertet || 0) + ' nicht ausgewertet'],
    ['Schlüssel ohne Geburtsdatum', String(c.schluesselOhneGeburtsdatum || 0)],
  ];
  const open = box.open; // Auf-/Zuklappzustand beim Neurendern behalten
  box.replaceChildren(summary, el('dl', { class: 'datastand-list' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
  box.open = open;
  box.hidden = false;
  ui.status.classList.add('visually-hidden');
}

// ---------------------------------------------------------------------------
// Filterleiste – einmal je Datenstand gebaut; Filteränderungen aktualisieren nur Werte und Zusammenfassung,
// damit der Tastaturfokus auf dem bedienten Element bleibt (Befund 9)
// ---------------------------------------------------------------------------

const filterBar = { dataKey: null, controls: null };

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
  // Jahr als Auswahlfeld (PROMPT-2 A.2, Entscheid 06.09.2026): «Alle» + Jahre; setzt Von/Bis wie bisher die Buttons.
  // Die temporäre Option «Von–Bis» (updateFilterBar) ist nur Anzeige eines freien Zeitraums und löst nichts aus.
  const jahr = selectControl('Jahr', listOptions(years.map(String)), (v) => {
    if (v === '') set({ from: null, to: null });
    else if (v !== 'range') set({ from: new Date(Number(v), 0, 1), to: new Date(Number(v), 11, 31) });
  });
  const profil = selectControl('Profil', listOptions(opts.profil), (v) => set({ profil: v ? [v] : [] }));
  const sprache = selectControl('Sprache', listOptions(opts.sprache), (v) => set({ sprache: v ? [v] : [] }));
  const bank = selectControl('Bank', listOptions(opts.bank), (v) => set({ bank: v ? [v] : [] }));
  const vssVsm = selectControl('VSS/VSM', [{ value: 'alle', label: 'Alle' }, { value: 'vss', label: 'Nur VSS' }, { value: 'vsm', label: 'Nur VSM' }, { value: 'ohne', label: 'Ohne VSS/VSM' }], (v) => set({ vssVsm: v }));
  const versuche = selectControl('Versuche', [{ value: 'alle', label: 'Alle' }, { value: 'erstversuch', label: 'Nur 1. Versuch' }, { value: 'mehrere', label: 'Mehrere Versuche' }], (v) => set({ versuche: v }));
  Object.assign(c, { jahr: jahr.select, profil: profil.select, sprache: sprache.select, bank: bank.select, vssVsm: vssVsm.select, versuche: versuche.select });
  c.onlyIssued = el('input', { type: 'checkbox', onchange: (ev) => set({ onlyIssued: ev.target.checked }) });
  // Reset nur sichtbar, wenn ein Filter vom Standard abweicht; Zusammenfassung = Zähler + Chips je aktive Einschränkung
  c.reset = el('button', { type: 'button', class: 'secondary reset', text: 'Filter zurücksetzen', onclick: () => store.resetFilter() });
  c.count = el('span', { class: 'summary-count' });
  c.chips = el('span', { class: 'chips' });
  c.summary = el('div', { class: 'summary' }, [c.count, c.chips]);
  // Phone (B.2): Steuerelemente in einem Drawer (details), auf Phone zu; auf Desktop/Tablet offen mit unsichtbarer Kopfzeile
  c.drawerLabel = el('span', { text: 'Filter' });
  c.drawer = el('details', { class: 'filter-drawer', open: isPhone() ? null : '' }, [
    el('summary', { class: 'filter-summary' }, [c.drawerLabel]),
    el('div', { class: 'filter-controls' }, [
      el('label', {}, ['Von', c.from]),
      el('label', {}, ['Bis', c.to]),
      jahr.node,
      profil.node, sprache.node, bank.node, vssVsm.node, versuche.node,
      el('label', { class: 'check' }, [c.onlyIssued, 'Nur ausgestellte Zertifikate']),
      c.reset,
    ]),
  ]);
  bar.append(c.drawer, c.summary);
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
  // Jahr: ganzes Jahr → Jahr; freier Zeitraum → temporäre Option «Von–Bis»; kein Zeitraum → «Alle»
  const year = yearOf(filter);
  const custom = !year && !!(filter.from || filter.to);
  const rangeOption = c.jahr.querySelector('option[value="range"]');
  if (custom && !rangeOption) c.jahr.appendChild(el('option', { value: 'range', text: 'Von–Bis' }));
  else if (!custom && rangeOption) rangeOption.remove();
  if (custom) c.jahr.value = 'range';
  else setSelect(c.jahr, year ? String(year) : '');
  setSelect(c.profil, single(filter.profil));
  setSelect(c.sprache, single(filter.sprache));
  setSelect(c.bank, single(filter.bank));
  c.vssVsm.value = filter.vssVsm;
  c.versuche.value = filter.versuche;
  c.onlyIssued.checked = !!filter.onlyIssued;
  const filtered = store.getFilteredPersons();
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  c.count.textContent = plural(filtered.length, 'Vorgang', 'Vorgänge') + ' · ' + plural(personCount(filtered), 'Person', 'Personen');
  // Chips werden in ihrem eigenen Container ersetzt; die Steuerelemente bleiben stehen (Fokusregel)
  const chips = filterChips(filter);
  c.chips.replaceChildren(...chips.map((ch) => el('button', { type: 'button', class: 'chip', 'aria-label': ch.ariaLabel, onclick: () => store.setFilter(ch.reset) }, [
    ch.label, el('span', { class: 'chip-x', 'aria-hidden': 'true', text: '✕' }),
  ])));
  c.reset.hidden = chips.length === 0;
  c.drawerLabel.textContent = chips.length ? 'Filter (' + chips.length + ' aktiv)' : 'Filter';
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function renderDq(table) {
  const { dq, persons, ui: uiState } = store.getState();
  // Sortierung/Filter des Logs: im Store merken, aber nur diesen Block neu rendern – so bleibt der Fokus im Suchfeld
  renderDataQuality(table, dq, uiState.dq || {}, (next) => {
    store.setUi({ dq: next }, { silent: true });
    renderDq(table);
  }, { persons });
}

// Hash einer Ansicht mit dem aktuellen Filterzustand plus einem Zusatzparameter (Glossar-Sprung); urlState ignoriert ihn
function hashWithParam(viewId, key, value) {
  const { filter, ui: uiState } = store.getState();
  const base = buildHash(viewId, filter, uiState);
  return base + (base.includes('?') ? '&' : '?') + key + '=' + encodeURIComponent(value);
}

// Hinweise der View plus die eindeutigen Fussnoten ihrer Tabellen (Befund B9: nicht mehr unter jeder Tabelle)
function legendHints(built) {
  const notes = [...new Set((built.tables || []).map((t) => t && t.note).filter(Boolean))];
  return (built.hints || []).concat(notes);
}

// Legende am Ende der View (PROMPT-2 A.3/A.5): verschobene Einleitungs- und Abschnittstexte, Fussnoten; im Druck geöffnet
function appendLegend(container, hints) {
  if (!hints || !hints.length) return;
  const legend = renderCollapsible('Hinweise und Definitionen', [el('ul', { class: 'legend-list' }, hints.map((h) => el('li', { text: h })))], { printOpen: true });
  legend.classList.add('legend');
  container.appendChild(legend);
}

// Glossar-Sprung: #glossar?begriff=<slug> → Zeile fokussieren; syncHash() entfernt den Parameter danach wieder
function jumpToGlossaryTerm() {
  const begriff = new URLSearchParams(location.hash.split('?')[1] || '').get('begriff');
  const target = begriff ? document.getElementById('glossar-' + begriff) : null;
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}

function renderView() {
  const current = viewFromHash();
  renderNav();
  const view = VIEWS.find((v) => v.id === current);
  const container = ui.view;
  container.replaceChildren();
  // View-Kopf (PROMPT-2 A.3): Titel und Kurzbeschreibung links, rechts Export-Menü und Link «Definitionen» (Glossar-Anker)
  const actions = el('div', { class: 'view-actions' });
  container.appendChild(el('div', { class: 'view-head' }, [
    el('div', { class: 'view-title' }, [el('h2', { text: view.label }), view.intro ? el('p', { class: 'view-intro', text: view.intro }) : null]),
    actions,
  ]));
  const definitionen = view.glossar ? el('a', { class: 'link-definitionen', href: hashWithParam('glossar', 'begriff', glossarySlug(view.glossar)), text: 'Definitionen' }) : null;

  const state = store.getState();
  if (view.isStatic) {
    // Statische Ansicht (Glossar): unabhängig von Daten und Filter
    const built = view.build({});
    actions.append(renderExportMenu({ viewId: view.id, tables: built.tables, headerLines: [] }));
    for (const node of built.nodes) container.appendChild(node);
    appendLegend(container, legendHints(built));
    jumpToGlossaryTerm();
    return;
  }
  if (!hasData()) {
    container.appendChild(renderEmptyState({ canLoad: authReady, onLoad: () => run(signInAndLoad), onFile: () => ui.file.click() }));
    return;
  }

  if (current === 'datenqualitaet') {
    if (definitionen) actions.append(definitionen);
    const table = el('div');
    container.appendChild(table);
    renderDq(table);
    appendLegend(container, view.hints);
    return;
  }

  const filter = state.filter;
  const headerLines = filterLines(filter, state.meta);
  const ctx = {
    persons: store.getFilteredPersons(),
    allPersons: eligible(state.persons), // kennzahlrelevante Vorgänge ohne Filter (Personen mit mehreren Profilen)
    plannedPersons: filterPersons(state.persons, filter, { eligibleOnly: false, period: false }),
    timePersons: filterPersons(state.persons, filter, { period: false }), // kennzahlrelevant, alle Jahre (Zeitverlauf)
    bankBenchmarkPersons: filterPersons(state.persons, benchmarkFilter(filter, 'bank')), // Bank-Report: alle Banken
    today: new Date(),
    allVorgaenge: state.persons.filter(isVorgang), // Personen (C.4): das Detail zeigt immer alle Vorgänge der Person
    personVorgaenge: filterPersons(state.persons, { ...filter, versuche: 'alle' }, { eligibleOnly: false, period: false }), // Trefferliste: Profil, Sprache, Bank, VSS/VSM, Zertifikate
    dq: state.dq,
    personen: state.ui.personen,
    onPersonenChange: (next) => store.setUi({ personen: next }, { silent: true }), // nur Memory; kein Neurendern (Fokus bleibt im Suchfeld)
    // Experten (Paket D, D.6): Vorgänge des Filters ohne Zeitraum und ohne Versuche; der Zeitraum wirkt auf das Run-Datum des Einsatzes
    expertRuns: expertRuns(filterPersons(state.persons, { ...filter, versuche: 'alle' }, { period: false }), { from: filter.from, to: filter.to }),
    expertMeta: { ...(state.meta.experts || { columns: false, from: null, headers: [] }), expected: [headerCandidates(runKey('oe', 1, 1, 'expert1'))[0], headerCandidates(runKey('oe', 1, 1, 'expert2'))[0]] },
    experten: state.ui.experten,
    onExpertenChange: (next) => store.setUi({ experten: next }, { silent: true }), // Sortierung nur im Memory
    glossaryHref: (term) => hashWithParam('glossar', 'begriff', glossarySlug(term)), // Kachel-Label → Glossar, Filter bleibt
    compare: state.ui.compare,
    onCompareChange: (compare) => store.setUi({ compare }),
    snapshots: state.ui.snapshots || [],
    snapshotErrors: state.ui.snapshotErrors || [],
    onSnapshotsChange: (snapshots, snapshotErrors = []) => store.setUi({ snapshots, snapshotErrors }),
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
  // Export je Ebene: Vorgangsebene (Standard), Einsatzebene (Experten, Paket D), keine bei Ansichten mit eigenem Export (Personen)
  const extra = view.id === 'experten' && ctx.expertMeta.columns
    ? { label: 'Einsatzebene', tables: [expertRunExportTable(ctx.expertRuns)], suffix: '-einsaetze', unit: 'Einsätze' }
    : (view.noPersonExport ? null : { label: 'Vorgangsebene', tables: vorgangExportTables(ctx.persons) });
  actions.append(renderExportMenu({ viewId: view.id, tables: built.tables, headerLines, extra }));
  if (definitionen) actions.append(definitionen);
  container.appendChild(el('div', { class: 'print-filter', text: headerLines.join(' · ') }));
  for (const node of built.nodes) container.appendChild(node);
  appendLegend(container, legendHints(built));
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
  ui.view.setAttribute('aria-busy', 'true'); // Laden (A.7): Inhalt wird gerade ersetzt
  try {
    await action();
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    ui.view.removeAttribute('aria-busy');
    renderSession();
    renderStatus();
  }
}

async function signIn() {
  renderStatus('Anmeldung …');
  await auth.signIn();
}

// Leerzustand-Karte: erst anmelden (falls nötig), dann laden – ein Klick
async function signInAndLoad() {
  if (!auth.getAccount()) await signIn();
  await loadGraph();
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
  ui.datastand = $('datastand');
  ui.error = $('error');
  ui.nav = $('nav');
  ui.filterbar = $('filterbar');
  ui.view = $('view');
  ui.accountMenu = $('account-menu');
  ui.accountInitials = $('account-initials');
  ui.accountMenuName = $('account-menu-name');
  ui.signoutPhone = $('btn-signout-phone');

  ui.signin.addEventListener('click', () => run(signIn));
  ui.signout.addEventListener('click', () => run(signOut));
  ui.signoutPhone.addEventListener('click', () => { ui.accountMenu.open = false; run(signOut); });
  // Wechsel Phone ↔ grösser (Drehen, Fenstergrösse): Drawer-Zustand setzen und neu rendern (B.2)
  onViewportChange((phone) => {
    if (window.matchMedia('print').matches) return; // Druck: kein Neurendern, die geöffneten Blöcke bleiben
    if (filterBar.controls) filterBar.controls.drawer.open = !phone;
    renderAll();
  });
  ui.load.addEventListener('click', () => run(loadGraph));
  ui.file.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (file) run(() => loadLocal(file));
  });
  window.addEventListener('hashchange', applyHash);
  // Druck: eingeklappte Blöcke mit Klasse print-open öffnen, danach wieder schliessen
  window.addEventListener('beforeprint', () => {
    for (const d of document.querySelectorAll('details.print-open:not([open])')) { d.dataset.printOpened = '1'; d.open = true; }
  });
  window.addEventListener('afterprint', () => {
    for (const d of document.querySelectorAll('details[data-print-opened]')) { delete d.dataset.printOpened; d.open = false; }
  });
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
  if (!hasData()) renderView(); // Leerzustand-Karte kennt jetzt den Anmeldestatus («Anmelden und laden» aktiv)
}

init();
