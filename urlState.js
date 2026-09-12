// urlState.js – Filter- und Anzeigezustand in der URL (Hash), reine Funktionen (Befund 8 / a4).
// Erlaubt gemäss CLAUDE.md: ein Filter enthält keine Personendaten. Personendaten stehen nie in der URL.
//
// Format: #<ansicht>?von=2025-01-01&bis=2025-12-31&profil=PK&sprache=DE&bank=Testbank+AG&vss=vsm&versuche=erstversuch
//         &zertifikate=1&wertung=bestanden&benchmark=profil&sort=experten.einsaetze.desc
// Nur vom Standard abweichende Werte werden geschrieben; unbekannte oder ungültige Werte werden ignoriert.

import { DEFAULT_FILTER, MODE, BENCHMARKS, COMPARE_MAX, dayKey } from './metrics.js';

// compare: zwei Jahre für den Zeitraumvergleich (a6), null = automatisch die zwei jüngsten Jahre mit Daten
// snapshots / snapshotErrors (Historie, b7): nur im Memory, nie in der URL (Aggregate, aber Datei-Inhalte gehören nicht in Links)
// personen: Suchtext und gewählte Person der Ansicht «Personen» (Paket C) – nur im Memory, nie in der URL (C.4)
// sort: Sortierung der Ansicht (Paket B, B4) – { view, table, key, dir }. Steht in der URL, weil ein geteilter Link
// sonst etwas anderes zeigt als der Absender sieht. Ein Zustand je Ansicht; «table» ist der Titel-Slug der Tabelle,
// damit klar ist, welche der Tabellen einer Ansicht gemeint ist. Enthält nie Personendaten (Spaltenschlüssel).
export const DEFAULT_UI = Object.freeze({ benchmark: 'bank', dq: null, compare: null, snapshots: [], snapshotErrors: [], personen: null, sort: null, editMode: false, fokus: null, vergleichsbanken: [] });
// editMode: Bearbeitungsmodus des Schreibpfads (Paket E) – Schalter im Kopf, Standard aus, nur im Memory

// sort=<tabelle>.<spalte>.<asc|desc>: Tabelle = Titel-Slug (a–z, 0–9, Bindestrich), Spalte = Schlüssel des Modells
const SORT_PARAM = /^([a-z0-9-]+)\.([A-Za-z0-9_]+)\.(asc|desc)$/;

// Die Bankauswahl gehört zum Bank-Report, nicht zur App: sie steht nur im Hash dieser Ansicht. Ohne Ansichtsbezug
// (view === null) bleibt sie erhalten – gleiche Regel wie beim Sortierzustand.
const BANK_REPORT_VIEW = 'bank-report';

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
// view: nötig für den Sortierzustand – er gilt je Ansicht und darf beim Wechsel nicht mitwandern.
export function serializeState(filter = DEFAULT_FILTER, ui = DEFAULT_UI, view = null) {
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
  // Bank-Report (P7.2c): Fokusbank und bis zu vier Vergleichsbanken. Banknamen sind keine Personendaten (CLAUDE.md).
  if (view === null || view === BANK_REPORT_VIEW) {
    if (u.fokus) p.set('fokus', u.fokus);
    for (const v of (u.vergleichsbanken || []).slice(0, COMPARE_MAX)) if (v) p.append('vergleichsbank', v);
  }
  if (u.compare && Number.isInteger(u.compare.a) && Number.isInteger(u.compare.b)) p.set('vergleich', u.compare.a + '-' + u.compare.b);
  const st = u.sort;
  if (st && st.table && st.key && (view === null || st.view === view)) p.set('sort', st.table + '.' + st.key + '.' + (st.dir === 'desc' ? 'desc' : 'asc'));
  return p.toString();
}

export function buildHash(view, filter, ui) {
  const q = serializeState(filter, ui, view);
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
  // Bank-Report (P7.2c): Fokusbank und bis zu vier Vergleichsbanken; unbekannte oder leere Werte fallen weg.
  ui.fokus = p.get('fokus') || null;
  ui.vergleichsbanken = p.getAll('vergleichsbank').filter((v) => v).slice(0, COMPARE_MAX);
  const cmp = /^(\d{4})-(\d{4})$/.exec(p.get('vergleich') || '');
  if (cmp) ui.compare = { a: Number(cmp[1]), b: Number(cmp[2]) };
  const st = SORT_PARAM.exec(p.get('sort') || '');
  if (st) ui.sort = { view, table: st[1], key: st[2], dir: st[3] };
  return { view, hasParams: q >= 0, filter, ui };
}

// Zwei Filterzustände gleich? (Datumswerte über den Tag verglichen)
export function sameFilter(a, b) {
  return serializeState(a, DEFAULT_UI) === serializeState(b, DEFAULT_UI);
}

// MSAL-Antwort im Hash (Hotfix Anmeldung 07.09.2026): nach dem Login schreibt Entra die Antwort als #code=…&state=… (oder
// #error=…, Token-Formen) in die Redirect-URI. Solange ein solcher Hash steht, darf die App ihn weder lesen noch per
// replaceState überschreiben – im Popup liest ihn das Elternfenster, im Redirect-Flow handleRedirectPromise().
const AUTH_HASH_START = /^#(code|state|error|error_description|id_token|access_token|client_info)=/;
const AUTH_HASH_STATE = /[#&]state=/;
export function isAuthResponseHash(hash) {
  if (typeof hash !== 'string' || !hash) return false;
  return AUTH_HASH_START.test(hash) || AUTH_HASH_STATE.test(hash);
}
