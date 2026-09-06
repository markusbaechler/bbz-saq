// views/personen.js – Ansicht «Personen» (PROMPT-2 Paket C): Suche, Trefferliste, Detail je Person (Kopf, Pfad, Karten je Vorgang mit
// Stammdaten, Status, Prüfungsraster, Zeitachse, Datenqualität, Export). Namen erscheinen hier (E7). Suchtext und gewählte Person
// liegen nur im Memory (store.ui.personen), nie in der URL. Zeitraum, Versuche und Wertung wirken nicht (Entscheid 06.09.2026).

import { CONFIG } from '../config.js';
import { personSearchIndex, searchPersons, personPath, openCaseState, earlyWarnings, durationDays, certificateDays, exclusionReason, PASSIVE_DAYS, examGrid } from '../metrics.js';
import { openEditDialog } from './editDialog.js';
import { personResultsTable, personGridTable, personTimelineTable, personDqTable, vorgangExportTables, groupLabel, statusTone } from './tables.js';
import { el, renderTable, renderExpandableTable, renderExportMenu, section, hinted } from './common.js';
import { fmtDate } from '../export.js';

export const id = 'personen';
export const label = 'Personen';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Eine Person suchen und ihren Weg durch die Zertifizierung nachvollziehen: Vorgänge, Prüfungen, Status, Zertifikat, Datenqualität; mit Namen.';
export const glossar = 'Pfad einer Person';
export const noPersonExport = true; // eigener Export «Diese Person» je Detail (Entscheid 4)
export const SEARCH_DEBOUNCE_MS = 150;
export const RESULT_LIMIT = 50;

// Anhängiger Neuaufbau der Trefferliste (Debounce); ein Neuaufbau der ganzen Ansicht (Filterwechsel) verwirft ihn.
// Der Suchtext selbst wird bei jeder Eingabe sofort in den Store geschrieben (silent), damit ein Neuaufbau ihn kennt.
let renderTimer = null;

function badge(text) {
  const tone = statusTone(text);
  return tone ? el('span', { class: 'badge status-' + tone, text }) : el('span', { text });
}

// Definitionsliste; Paare mit leerem Wert werden ausgelassen
function dl(pairs) {
  return el('dl', { class: 'person-dl' }, pairs.flatMap(([k, v]) => (v === null || v === undefined || v === '' ? [] : [el('dt', { text: k }), el('dd', { text: v })])));
}

// Ein Schritt der Pfad-Leiste: «PK · 2019 · bestanden · Zertifikat Z-1» / «CWMA · 2026 · offen · 2 Teile fehlen · Passerelle möglich (AFFL)»
function stepText(s) {
  const parts = [s.profil, s.jahr ? String(s.jahr) : null, s.passiv ? 'passiv' : s.status, s.issued ? 'Zertifikat' + (s.certNumber ? ' ' + s.certNumber : '') : null];
  if (s.status === 'offen' && s.missing && s.missing.length) parts.push(s.missing.length + (s.missing.length === 1 ? ' Teil fehlt' : ' Teile fehlen'));
  if (s.passerelle) parts.push('Passerelle möglich (' + s.passerelle + ')');
  return parts.filter(Boolean).join(' · ');
}

// Karte je Vorgang (C.3): Stammdaten, Status, Prüfungsraster, Zeitachse, Datenqualität; der jüngste Vorgang ist offen
function vorgangCard(v, ctx, open) {
  const today = ctx.today || new Date();
  const oc = openCaseState(v, today);
  const warn = earlyWarnings([v]);
  const dur = durationDays(v);
  const cert = certificateDays(v);
  const reason = exclusionReason(v);
  const stamm = dl([
    ['Profil', groupLabel(v.profil)], ['Sprache', groupLabel(v.sprache) + (v.spracheDerived ? ' (abgeleitet)' : '')],
    ['Bank', (v.employerCanon || '–') + (v.employer && v.employer !== v.employerCanon ? ' (Rohwert: ' + v.employer + ')' : '')], ['Role', v.role || ''],
    ['Fundstelle', v.sheetName + ', Zeile ' + v.row], ['Zusammengeführte Zeilen', (v.duplicates || []).map((d) => d.sheet + ' Zeile ' + d.row).join('; ')],
    ['VSS / VSM', [v.vss ? 'VSS' : null, v.vsm ? 'VSM' : null].filter(Boolean).join(', ') || 'ohne'],
    ['Zertifikat', v.issued ? ['ausgestellt', v.certNumber, v.certStart ? 'Beginn ' + fmtDate(v.certStart) : null, v.certEnd ? 'Ende ' + fmtDate(v.certEnd) : null].filter(Boolean).join(' · ') : 'nicht ausgestellt'],
    ['Kennzahlrelevant', reason ? 'nein – ' + reason : 'ja'],
  ]);
  const status = el('div', { class: 'person-status' }, [
    'schriftlich ', badge(v.weStatus), ' mündlich ', badge(v.oeStatus), ' gesamt ', badge(v.passiv ? 'passiv' : v.status),
  ]);
  const facts = dl([
    ['Referenzdatum', v.refDate ? fmtDate(v.refDate) + (v.refDateSource === 'oe' ? ' (bestandene mündliche Prüfung)' : ' (letzte Prüfung)') : '–'],
    ['Durchlaufzeit', dur === null ? null : dur + ' Tage'], ['Tage bis Zertifikat', cert === null ? null : cert + ' Tage'],
    ['Passiv', v.passiv ? 'ja – seit ' + oc.daysSinceLastExam + ' Tagen keine Prüfung (> ' + PASSIVE_DAYS + '), kein Termin' : null],
    ['Frühwarnung', warn.length ? warn.map((w) => w.label + ': ' + w.stage).join('; ') : null], ['Versuche gesamt', String(v.attemptsTotal)],
    ['Nächster Termin', oc.nextPlanned ? fmtDate(oc.nextPlanned) : null],
  ]);
  const grid = el('div', { class: 'person-grid' }, [renderTable(personGridTable(v))]);
  if (CONFIG.features && CONFIG.features.write && ctx.onWrite) {
    // Schreibpfad (Paket E, E.3): «Bearbeiten» je Run-Zelle (RUN1–RUN3, Zeilen wie examGrid) öffnet den Dialog; nur mit Feature-Flag
    const specRows = examGrid(v).rows;
    grid.querySelectorAll('tbody tr').forEach((tr, i) => {
      const spec = specRows[i];
      if (!spec) return;
      tr.querySelectorAll('td').forEach((td, j) => {
        if (j < 1 || j > 3) return;
        td.appendChild(el('button', {
          type: 'button', class: 'secondary run-edit', title: 'Zelle in der Datei ändern', 'aria-label': 'Bearbeiten ' + spec.label + ' RUN' + j, text: 'Bearbeiten',
          onclick: () => openEditDialog({ vorgang: v, kind: spec.kind, part: spec.part, run: j, onWrite: ctx.onWrite }),
        }));
      });
    });
  }
  const dq = personDqTable(ctx.dq || [], [v]);
  const nodes = [
    section('Stammdaten', [stamm]), section('Status', [status, facts]),
    section('Prüfungsraster', [grid], { phoneCollapsed: true }), section('Zeitachse', [renderTable(personTimelineTable(v))]),
  ];
  if (dq.rows.length) nodes.push(section('Datenqualität (' + dq.rows.length + ')', [renderTable(dq)], { phoneCollapsed: true }));
  const summary = el('summary', {}, [groupLabel(v.profil) + ' · ' + v.sheetName + ', Zeile ' + v.row + ' · ', badge(v.passiv ? 'passiv' : v.status)]);
  return el('details', { class: 'vorgang-card', open: open || null }, [summary].concat(nodes));
}

// Detail einer Person: Kopf, Pfad-Leiste, Karten je Vorgang, Export «Diese Person» (Entscheid 4), Rücksprung zur Liste
function renderDetail(entry, ctx) {
  const latest = entry.latest;
  const head = el('div', { class: 'person-head' }, [
    el('h4', { text: entry.name }),
    el('span', { class: 'meta-list', text: (entry.bank || 'ohne Bank') + (entry.formerBanks.length ? ' (früher: ' + entry.formerBanks.join(', ') + ')' : '') + ' · ' + entry.vorgaenge.length + (entry.vorgaenge.length === 1 ? ' Vorgang' : ' Vorgänge') + ' · ' }),
    badge(entry.passiv ? 'passiv' : entry.status),
    el('span', { class: 'meta-list', text: ' · Schlüssel: ' + (entry.keyLevel === 'full' ? 'Name + Geburtsdatum' : 'ohne Geburtsdatum (Namensgleiche fallen zusammen)') + (latest.role ? ' · ' + latest.role : '') }),
  ]);
  const path = el('ol', { class: 'person-path', 'aria-label': 'Pfad' }, personPath(entry).map((s) => el('li', { class: 'status-' + (statusTone(s.passiv ? 'passiv' : s.status) || 'offen'), text: stepText(s) })));
  const cards = entry.vorgaenge.map((v) => vorgangCard(v, ctx, v === latest));
  const exportMenu = renderExportMenu({
    viewId: 'personen-vorgang', tables: vorgangExportTables(entry.vorgaenge), headerLines: ctx.headerLines || [],
    label: 'Diese Person exportieren', note: 'Vorgänge und Runs dieser Person, mit Namen, nur intern; Dateiname ohne Namen',
  });
  const back = el('button', {
    type: 'button', class: 'secondary person-back', text: 'Zur Liste',
    onclick: (ev) => { const row = ev.target.closest('tr.event-detail'); const tr = row && row.previousElementSibling; if (tr) { tr.click(); tr.scrollIntoView({ block: 'center' }); tr.focus(); } },
  });
  return el('div', { class: 'person-detail' }, [head, path].concat(cards, [el('div', { class: 'view-actions person-actions' }, [exportMenu, back])]));
}

export function build(ctx) {
  const state = { query: '', selectedKey: null, ...(ctx.personen || {}) };
  const filter = ctx.filter || {};
  const fullIndex = personSearchIndex(ctx.allVorgaenge || []);
  const inFilter = new Set(personSearchIndex(ctx.personVorgaenge || []).map((e) => e.key));
  const index = fullIndex.filter((e) => inFilter.has(e.key)); // Trefferliste nach globalem Filter, Detail mit allen Vorgängen (Entscheid 2)
  const byKey = new Map(index.map((e) => [e.key, e]));
  const hints = [
    'Suche ab 2 Zeichen in Nachname, Vorname, Bank, Profil, Sprache, Zertifikatsnummer und Status (bestanden, offen, passiv, nicht bestanden); mehrere Begriffe müssen alle zutreffen. Ohne Suchtext bleibt die Liste leer, ausser in der Filterleiste ist eine Bank gewählt: dann erscheinen alle Personen dieser Bank. Höchstens ' + RESULT_LIMIT + ' Treffer.',
    'Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» schränken die Trefferliste ein; Zeitraum, Versuche und Wertung wirken nicht. Das Detail zeigt immer alle Vorgänge der Person. Suchtext und gewählte Person stehen nie in der URL und werden beim Neuladen der Daten geleert.',
  ];
  const sec = hinted(hints);
  const results = el('div', { class: 'person-results' });
  const tables = [];
  clearTimeout(renderTimer);
  renderTimer = null;
  const commit = () => ctx.onPersonenChange && ctx.onPersonenChange({ query: state.query, selectedKey: state.selectedKey });
  const input = el('input', {
    type: 'search', class: 'person-search', placeholder: 'Name, Bank, Profil, Sprache, Zertifikat-Nr., Status …', 'aria-label': 'Person suchen', autocomplete: 'off', value: state.query,
    oninput: (ev) => { state.query = ev.target.value; commit(); clearTimeout(renderTimer); renderTimer = setTimeout(renderResults, SEARCH_DEBOUNCE_MS); },
  });
  // Nur die Trefferliste wird neu gezeichnet; das Suchfeld bleibt stehen und behält den Fokus
  function renderResults() {
    const found = searchPersons(index, state.query, { limit: RESULT_LIMIT, all: (filter.bank || []).length > 0 });
    const table = personResultsTable(found.persons);
    tables.splice(0, tables.length, table);
    const nodes = [];
    if (found.tooShort) nodes.push(el('p', { class: 'empty', text: 'Mindestens 2 Zeichen eingeben.' }));
    else if (!found.persons.length && !state.query.trim()) nodes.push(el('p', { class: 'empty', text: 'Suchtext eingeben – oder in der Filterleiste eine Bank wählen, dann erscheinen alle Personen dieser Bank.' }));
    else {
      nodes.push(el('p', { class: 'meta-list person-count', text: found.truncated ? 'Suche eingrenzen (' + found.total + ' Treffer, die ersten ' + RESULT_LIMIT + ' angezeigt)' : found.total + (found.total === 1 ? ' Person' : ' Personen') }));
      nodes.push(renderExpandableTable(table, {
        detail: (row) => renderDetail(byKey.get(row.key), ctx), hint: 'Zeile anklicken (oder Enter): Detail der Person.',
        isOpen: (row) => row.key === state.selectedKey, onToggle: (row, open) => { state.selectedKey = open ? row.key : null; commit(); },
      }));
    }
    results.replaceChildren(...nodes);
  }
  renderResults();
  return {
    nodes: [sec('Suche', [
      input,
      el('p', { class: 'person-hint', text: 'Ab 2 Zeichen: Name, Bank, Profil, Sprache, Zertifikat-Nr., Status. Filter: Profil, Sprache, Bank, VSS/VSM, Zertifikate – nicht Zeitraum, Versuche, Wertung.' }),
      results,
    ])],
    tables,
    hints,
  };
}
