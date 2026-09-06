// urlState.js – Filter- und Anzeigezustand in der URL (Hash), reine Funktionen (Befund 8 / a4).
// Erlaubt gemäss CLAUDE.md: ein Filter enthält keine Personendaten. Personendaten stehen nie in der URL.
//
// Format: #<ansicht>?von=2025-01-01&bis=2025-12-31&profil=PK&sprache=DE&bank=Testbank+AG&vss=vsm&versuche=erstversuch
//         &zertifikate=1&wertung=bestanden&benchmark=profil
// Nur vom Standard abweichende Werte werden geschrieben; unbekannte oder ungültige Werte werden ignoriert.

import { DEFAULT_FILTER, MODE, BENCHMARKS, dayKey } from './metrics.js';

// compare: zwei Jahre für den Zeitraumvergleich (a6), null = automatisch die zwei jüngsten Jahre mit Daten
// snapshots / snapshotErrors (Historie, b7): nur im Memory, nie in der URL (Aggregate, aber Datei-Inhalte gehören nicht in Links)
// personen: Suchtext und gewählte Person der Ansicht «Personen» (Paket C) – nur im Memory, nie in der URL (C.4)
// experten: Sortierung der Experten-Tabelle (Paket D) – nur im Memory, nie in der URL
export const DEFAULT_UI = Object.freeze({ benchmark: 'bank', dq: null, compare: null, snapshots: [], snapshotErrors: [], personen: null, experten: null, editMode: false });
// editMode: Bearbeitungsmodus des Schreibpfads (Paket E) – Schalter im Kopf, Standard aus, nur im Memory

const VSS_VALUES = ['alle', 'vss', 'vsm', 'ohne'];
const VERSUCHE_VALUES = ['alle', 'erstversuch', 'mehrere'];
const MODE_VALUES = Object.values(MODE);
const BENCHMARK_VALUES = BENCHMARKS.map((b) => b.id);

// 'YYYY-MM-DD' → lokales Datum (kein Zeitzonenversatz); ungültig → null
export function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, day);
  // Kein Überlauf (2025-13-40 würde sonst zum Februar 2026)
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day ? d : null;
}

export function formatDay(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? dayKey(date) : '';
}

// Zustand → Query-String (ohne '?'); leer, wenn alles Standard ist
export function serializeState(filter = DEFAULT_FILTER, ui = DEFAULT_UI) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const u = { ...DEFAULT_UI, ...ui };
  const p = new URLSearchParams();
  if (f.from) p.set('von', formatDay(f.from));
  if (f.to) p.set('bis', formatDay(f.to));
  for (const v of f.profil) p.append('profil', v);
  for (const v of f.sprache) p.append('sprache', v);
  for (const v of f.bank) p.append('bank', v);
  if (f.vssVsm !== DEFAULT_FILTER.vssVsm) p.set('vss', f.vssVsm);
  if (f.versuche !== DEFAULT_FILTER.versuche) p.set('versuche', f.versuche);
  if (f.onlyIssued) p.set('zertifikate', '1');
  if (f.mode !== DEFAULT_FILTER.mode) p.set('wertung', f.mode);
  if (u.benchmark !== DEFAULT_UI.benchmark) p.set('benchmark', u.benchmark);
  if (u.compare && Number.isInteger(u.compare.a) && Number.isInteger(u.compare.b)) p.set('vergleich', u.compare.a + '-' + u.compare.b);
  return p.toString();
}

export function buildHash(view, filter, ui) {
  const q = serializeState(filter, ui);
  return '#' + (view || '') + (q ? '?' + q : '');
}

// Hash (mit oder ohne '#') → { view, hasParams, filter (vollständig, Standard + URL), ui }
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const q = raw.indexOf('?');
  const view = q >= 0 ? raw.slice(0, q) : raw;
  const p = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  const filter = { ...DEFAULT_FILTER, profil: [], sprache: [], bank: [] };
  const ui = { ...DEFAULT_UI };
  const oneOf = (key, values) => (values.includes(p.get(key)) ? p.get(key) : null);
  const from = parseDay(p.get('von'));
  const to = parseDay(p.get('bis'));
  if (from) filter.from = from;
  if (to) filter.to = to;
  filter.profil = p.getAll('profil').filter((v) => v);
  filter.sprache = p.getAll('sprache').filter((v) => v);
  filter.bank = p.getAll('bank').filter((v) => v);
  const vss = oneOf('vss', VSS_VALUES);
  if (vss) filter.vssVsm = vss;
  const versuche = oneOf('versuche', VERSUCHE_VALUES);
  if (versuche) filter.versuche = versuche;
  filter.onlyIssued = p.get('zertifikate') === '1';
  const mode = oneOf('wertung', MODE_VALUES);
  if (mode) filter.mode = mode;
  const benchmark = oneOf('benchmark', BENCHMARK_VALUES);
  if (benchmark) ui.benchmark = benchmark;
  const cmp = /^(\d{4})-(\d{4})$/.exec(p.get('vergleich') || '');
  if (cmp) ui.compare = { a: Number(cmp[1]), b: Number(cmp[2]) };
  return { view, hasParams: q >= 0, filter, ui };
}

// Zwei Filterzustände gleich? (Datumswerte über den Tag verglichen)
export function sameFilter(a, b) {
  return serializeState(a, DEFAULT_UI) === serializeState(b, DEFAULT_UI);
}
