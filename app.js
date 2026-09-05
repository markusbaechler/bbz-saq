// app.js – Shell: Anmeldung, Laden, Status, Navigation, Fehleranzeige. Views rendern in #view.
// Schritt 2: View «Datenqualität» aktiv; Views 1–5 folgen in Schritt 3.

import { getAuth, AuthConfigError } from './auth.js';
import { GraphError, AuthExpiredError } from './graph.js';
import { load, loadFromFile } from './datasource/index.js';
import { FileNotFoundError, SheetMissingError } from './datasource/fileAdapter.js';
import { createStore, MissingHeaderError, DuplicateHeaderError } from './store.js';
import { renderDataQuality, DEFAULT_DQ_STATE } from './views/dataQuality.js';

const VIEWS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'schriftlich', label: 'Schriftlich' },
  { id: 'muendlich', label: 'Mündlich' },
  { id: 'vss-vsm', label: 'VSS/VSM' },
  { id: 'bestenlisten', label: 'Bestenlisten' },
  { id: 'datenqualitaet', label: 'Datenqualität' },
];

const store = createStore();
const auth = getAuth();
const el = {};
let authReady = false;
let busy = false;
let dqState = { ...DEFAULT_DQ_STATE };

function $(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '–';
  return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtTime(d) {
  return d instanceof Date ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : '–';
}

function viewFromHash() {
  const id = (location.hash || '').replace(/^#/, '');
  return VIEWS.some((v) => v.id === id) ? id : VIEWS[0].id;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderNav() {
  const current = viewFromHash();
  el.nav.replaceChildren(...VIEWS.map((v) => {
    const a = document.createElement('a');
    a.href = '#' + v.id;
    a.textContent = v.label;
    if (v.id === current) {
      a.className = 'active';
      a.setAttribute('aria-current', 'page');
    }
    return a;
  }));
}

function renderSession() {
  const account = auth.getAccount();
  el.account.textContent = account ? (account.name || account.username || '') : (authReady ? 'Nicht angemeldet' : '');
  el.signin.hidden = !authReady || !!account;
  el.signout.hidden = !account;
  el.load.disabled = busy || !account;
  el.load.title = account ? '' : (authReady ? 'Zuerst anmelden' : 'Azure-Konfiguration fehlt (config.js)');
}

function renderStatus(text) {
  el.status.classList.toggle('busy', busy);
  if (text) {
    el.status.textContent = text;
    return;
  }
  const { meta, persons, dq } = store.getState();
  if (!meta || !meta.fileName) {
    el.status.textContent = 'Keine Daten geladen.';
    return;
  }
  const source = meta.source === 'file' ? 'lokale Datei (nur im Browser)' : 'SharePoint';
  const counts = meta.counts || { first: 0, issued: 0 };
  el.status.textContent = meta.fileName + ' (' + source + ') · geändert ' + fmtDateTime(meta.lastModified) + ' · geladen ' + fmtTime(meta.loadedAt)
    + ' · ' + persons.length + ' Personen (' + counts.first + ' First Certification, ' + counts.issued + ' Ausgestellte Zertifikate) · Data-Quality-Log: ' + (counts.fehler || 0) + ' Fehler, ' + (counts.hinweise || 0) + ' Hinweise';
}

// Nur die DQ-Tabelle neu rendern (nicht die ganze View), damit der Fokus im Suchfeld erhalten bleibt
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
  const container = el.view;
  container.replaceChildren();
  const h2 = document.createElement('h2');
  h2.textContent = view.label;
  container.appendChild(h2);

  const state = store.getState();
  if (current === 'datenqualitaet') {
    const intro = document.createElement('p');
    intro.className = 'meta-list';
    intro.textContent = 'Jede Zelle, die nicht interpretierbar ist oder eine Konsistenzregel verletzt, erscheint hier mit Sheet, Excel-Zeile, Header, Rohwert und Grund. Namen erscheinen nur hier und in den Bestenlisten.';
    container.appendChild(intro);
    const table = document.createElement('div');
    container.appendChild(table);
    if (!state.meta || !state.meta.fileName) {
      table.innerHTML = '<p class="empty">Noch keine Daten geladen.</p>';
      return;
    }
    renderDq(table);
    return;
  }

  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = 'Diese Ansicht folgt in Schritt 3.' + (state.meta && state.meta.fileName ? ' Aktuell geladen: ' + store.getFilteredPersons().length + ' Personen mit mindestens einem WE-RUN-Datum.' : '');
  container.appendChild(p);
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
  const box = el.error;
  box.replaceChildren();
  const h3 = document.createElement('h3');
  h3.textContent = d.title;
  box.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = d.message;
  box.appendChild(p);
  if (d.list) {
    const ul = document.createElement('ul');
    for (const item of d.list) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  if (d.hint) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = d.hint;
    box.appendChild(hint);
  }
  if (d.retry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Erneut versuchen';
    btn.addEventListener('click', () => run(loadGraph));
    box.appendChild(btn);
  }
  if (d.signIn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Erneut anmelden';
    btn.addEventListener('click', () => run(signIn));
    box.appendChild(btn);
  }
  box.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.replaceChildren();
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
  const data = await load();
  store.setData(data);
}

async function loadLocal(file) {
  renderStatus('Lese ' + file.name + ' (nur im Browser) …');
  const data = await loadFromFile(file);
  store.setData(data);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function init() {
  el.account = $('account');
  el.signin = $('btn-signin');
  el.signout = $('btn-signout');
  el.load = $('btn-load');
  el.file = $('file-input');
  el.status = $('status');
  el.error = $('error');
  el.nav = $('nav');
  el.view = $('view');

  el.signin.addEventListener('click', () => run(signIn));
  el.signout.addEventListener('click', () => run(signOut));
  el.load.addEventListener('click', () => run(loadGraph));
  el.file.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (file) run(() => loadLocal(file));
  });
  window.addEventListener('hashchange', renderView);
  store.subscribe(() => {
    renderStatus();
    renderView();
  });

  renderView();
  renderStatus();
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
