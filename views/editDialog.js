// views/editDialog.js – Schreibpfad (PROMPT-2 Paket E, E.3): Dialog «Zelle bearbeiten» je Run-Zelle, nur mit CONFIG.features.write.
// Feldwahl (Passed, Datum, Resultat, Ort; mündlich zusätzlich Experte 1/2), Validierung mit den Parsern aus store.js,
// Vorschau «alt → neu», Grund als Pflichtfeld, Bestätigung, Schreiben über ctx.onWrite (Adapter), danach lädt die App neu.
// Kein optimistisches Update im Memory; Fehler (Konflikt, kein Schreibrecht, gesperrt) erscheinen im Dialog.

import { headerCandidates, runKey } from '../config.js';
import { parsePassed, parseDate, parseResult, parseExpert, asText } from '../store.js';
import { formatPct } from '../metrics.js';
import { fmtDate } from '../export.js';
import { el } from './common.js';

export const FIELD_LABELS = Object.freeze({
  passed: 'Bestanden (yes / no)', date: 'Prüfungsdatum (dd.mm.yyyy)', result: 'Resultat (0–1 oder Prozent)', location: 'Ort', expert1: 'Experte 1', expert2: 'Experte 2',
});

// Editierbare Felder je Art: Run-Felder (E.0); mündlich zusätzlich die Experten (Paket D)
export function fieldsFor(kind) {
  return kind === 'oe' ? ['passed', 'date', 'result', 'location', 'expert1', 'expert2'] : ['passed', 'date', 'result', 'location'];
}

// Aktueller Wert aus dem Personenmodell
export function currentValue(field, run) {
  if (!run) return null;
  if (field === 'expert1' || field === 'expert2') {
    const e = (run.experts || []).find((x) => x.role === (field === 'expert1' ? 1 : 2));
    return e ? e.name : null;
  }
  return run[field] === undefined ? null : run[field];
}

// Anzeige eines Werts (alt oder neu): leer, ja/nein, Datum, Prozent, Text
export function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return 'leer';
  if (field === 'passed') return value === true ? 'ja' : value === false ? 'nein' : String(value);
  if (field === 'date') return value instanceof Date ? fmtDate(value) : String(value);
  if (field === 'result') return typeof value === 'number' ? formatPct(value) : String(value);
  return String(value);
}

// Eingabe prüfen wie beim Laden (dieselben Parser): { ok, value, message }; leer ist keine gültige Eingabe (erste Stufe schreibt nur Werte)
export function validateField(field, raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!text) return { ok: false, value: null, message: 'Bitte einen Wert eingeben.' };
  let r;
  if (field === 'passed') r = parsePassed(text);
  else if (field === 'date') r = parseDate(text);
  else if (field === 'result') r = parseResult(/^\d+([.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : text);
  else if (field === 'expert1' || field === 'expert2') r = parseExpert(text);
  else return { ok: true, value: asText(text), message: '' };
  if (r.value === null || r.value === undefined) return { ok: false, value: null, message: r.reason || 'Wert nicht interpretierbar.' };
  const value = field === 'expert1' || field === 'expert2' ? r.value.name : r.value;
  return { ok: true, value, message: r.reason && r.level !== 'fehler' ? 'Hinweis: ' + r.reason : '' };
}

// Dialog öffnen: vorgang = Personenmodell-Zeile, kind 'we'|'oe', part 1…, run 1…3, onWrite(change) → Promise<{ written }>
export function openEditDialog({ vorgang: v, kind, part, run, onWrite }) {
  const runObj = v[kind][part - 1] ? v[kind][part - 1].runs[run - 1] : null;
  const label = kind.toUpperCase() + part + ' RUN' + run;
  const dialog = el('dialog', { class: 'edit-dialog', 'aria-label': 'Zelle bearbeiten' });
  const select = el('select', { class: 'edit-field' }, fieldsFor(kind).map((f) => el('option', { value: f, text: FIELD_LABELS[f] })));
  const current = el('span', { class: 'edit-current' });
  const input = el('input', { type: 'text', class: 'edit-value', autocomplete: 'off', 'aria-label': 'Neuer Wert' });
  const reason = el('input', { type: 'text', class: 'edit-reason', autocomplete: 'off', placeholder: 'Grund (Pflicht)', 'aria-label': 'Grund' });
  const preview = el('p', { class: 'edit-preview', 'aria-live': 'polite' });
  const error = el('p', { class: 'edit-error', role: 'alert' });
  const status = el('p', { class: 'edit-status', 'aria-live': 'polite' });
  const confirm = el('button', { type: 'button', class: 'edit-confirm', disabled: true, text: 'In die Datei schreiben' });
  const cancel = el('button', { type: 'button', class: 'secondary edit-cancel', text: 'Abbrechen' });
  let parsed = { ok: false, value: null, message: '' };

  function refresh() {
    const field = select.value;
    current.textContent = formatValue(field, currentValue(field, runObj));
    parsed = validateField(field, input.value);
    error.textContent = parsed.ok ? '' : (input.value.trim() ? parsed.message : '');
    preview.textContent = parsed.ok ? formatValue(field, currentValue(field, runObj)) + ' → ' + formatValue(field, parsed.value) + (parsed.message ? ' (' + parsed.message + ')' : '') : '';
    confirm.disabled = !(parsed.ok && reason.value.trim() !== '');
  }
  select.addEventListener('change', () => { input.value = ''; refresh(); });
  input.addEventListener('input', refresh);
  reason.addEventListener('input', refresh);

  confirm.addEventListener('click', async () => {
    const field = select.value;
    const change = { sheet: v.sheetName, row: v.row, field, candidates: headerCandidates(runKey(kind, part, run, field)) || [], value: parsed.value, reason: reason.value.trim() };
    if (field === 'location' || field === 'expert1' || field === 'expert2') change.expected = currentValue(field, runObj) || '';
    confirm.disabled = true;
    cancel.disabled = true;
    error.textContent = '';
    status.textContent = 'Schreibe in die Datei …';
    try {
      const result = await onWrite(change);
      status.textContent = 'Gespeichert: ' + result.written.sheet + ', Zeile ' + result.written.row + ', ' + result.written.header + ' → ' + formatValue(field, parsed.value) + '. Die Datei wurde neu geladen.';
      cancel.textContent = 'Schliessen';
      cancel.disabled = false;
    } catch (e) {
      status.textContent = '';
      cancel.disabled = false;
      refresh(); // Eingaben bleiben, Bestätigen wieder möglich
      error.textContent = e && e.message ? e.message : String(e); // nach refresh(), sonst überschrieben
    }
  });
  const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  cancel.addEventListener('click', close);
  dialog.addEventListener('close', () => dialog.remove());

  dialog.append(
    el('h3', { text: label + ' – ' + v.sheetName + ', Zeile ' + v.row }),
    el('p', { class: 'meta-list', text: 'Nur diese Zelle wird geändert; die Struktur der Datei bleibt unverändert. Nach dem Schreiben lädt die App die Datei neu.' }),
    el('label', {}, ['Feld ', select]),
    el('p', { class: 'meta-list' }, ['Aktuell: ', current]),
    el('label', {}, ['Neuer Wert ', input]),
    preview,
    error,
    el('label', {}, ['Grund ', reason]),
    status,
    el('div', { class: 'edit-actions' }, [confirm, cancel]),
  );
  document.body.appendChild(dialog);
  dialog.showModal();
  refresh();
  input.focus();
  return dialog;
}
