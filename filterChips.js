// filterChips.js – aktive Filter als Chips (reine Funktionen, kein DOM; PROMPT-2 A.2). Ein Chip je Einschränkung gegenüber
// DEFAULT_FILTER; reset = Teilzustand für store.setFilter(), der genau diesen Chip entfernt. Die Wertung (nur Bestenlisten)
// ist nie ein Chip. Beschriftungen wie die Optionen der Auswahlfelder in app.js.

import { DEFAULT_FILTER } from './metrics.js';
import { fmtDate } from './export.js';

const VSS_VSM_LABELS = { vss: 'Nur VSS', vsm: 'Nur VSM', ohne: 'Ohne VSS/VSM' };
const VERSUCHE_LABELS = { erstversuch: 'Nur 1. Versuch', mehrere: 'Mehrere Versuche' };
const LIST_LABELS = { profil: 'Profil', sprache: 'Sprache', bank: 'Bank' };

function isDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

// Jahr, wenn der Zeitraum genau vom 1.1. bis 31.12. desselben Jahres reicht; sonst null
export function yearOf(filter) {
  const { from, to } = filter;
  if (!isDate(from) || !isDate(to)) return null;
  const y = from.getFullYear();
  const wholeYear = from.getMonth() === 0 && from.getDate() === 1 && to.getFullYear() === y && to.getMonth() === 11 && to.getDate() === 31;
  return wholeYear ? y : null;
}

function periodLabel(filter) {
  const y = yearOf(filter);
  if (y) return String(y);
  const from = isDate(filter.from) ? fmtDate(filter.from) : null;
  const to = isDate(filter.to) ? fmtDate(filter.to) : null;
  if (from && to) return from + ' – ' + to;
  return from ? 'ab ' + from : 'bis ' + to;
}

const chip = (key, label, reset) => ({ key, label, ariaLabel: 'Filter ' + label + ' entfernen', reset });

// [{ key, label, ariaLabel, reset }] in der Reihenfolge der Filterleiste
export function filterChips(filter) {
  const out = [];
  if (isDate(filter.from) || isDate(filter.to)) out.push(chip('zeitraum', periodLabel(filter), { from: null, to: null }));
  for (const key of ['profil', 'sprache', 'bank']) {
    for (const v of filter[key] || []) out.push(chip(key + ':' + v, LIST_LABELS[key] + ' ' + v, { [key]: filter[key].filter((x) => x !== v) }));
  }
  if (filter.vssVsm !== DEFAULT_FILTER.vssVsm) out.push(chip('vssVsm', VSS_VSM_LABELS[filter.vssVsm] || filter.vssVsm, { vssVsm: DEFAULT_FILTER.vssVsm }));
  if (filter.versuche !== DEFAULT_FILTER.versuche) out.push(chip('versuche', VERSUCHE_LABELS[filter.versuche] || filter.versuche, { versuche: DEFAULT_FILTER.versuche }));
  if (filter.onlyIssued) out.push(chip('zertifikate', 'Nur ausgestellte Zertifikate', { onlyIssued: false }));
  return out;
}
