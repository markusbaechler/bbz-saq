// snapshot.js – Historisierung (b7) ohne Backend und ohne Persistenz im Browser.
// Ein Snapshot ist eine JSON-Datei mit Aggregaten zum Stichtag: Datei-Zähler, Kennzahlen gesamt, je Profil und je Jahr –
// ohne Namen, ohne Zeilen, ohne Personenbezug. Der Auftraggeber legt die Datei selbst ab (z. B. SharePoint neben der Excel)
// und lädt sie später zum Vergleich wieder ins Cockpit (nur Memory). Reine Funktionen: kein DOM, kein Graph.
// Beim Import werden nur bekannte Felder übernommen (Whitelist); alles andere wird verworfen.

import { MODE, eligible, overview, writtenPerformance, oralPerformance, multiProfilePersons, groupBy, yearsOf, refYear, dayKey } from './metrics.js';

export const SNAPSHOT_FORMAT = 'bbz-cockpit-snapshot';
export const SNAPSHOT_VERSION = 1;

// Kennzahlen-Katalog: Schlüssel stabil (Dateiformat), Beschriftung wie die Kacheln der Übersicht. kind: count | ratio | mean
export const SNAPSHOT_KPIS = Object.freeze([
  { key: 'vorgaenge', label: 'Vorgänge', kind: 'count' },
  { key: 'personen', label: 'Personen', kind: 'count' },
  { key: 'offen', label: 'Vorgänge offen', kind: 'count' },
  { key: 'passiv', label: 'Vorgänge passiv (> 365 Tage)', kind: 'count' },
  { key: 'nichtErfasst', label: 'Vorgänge nicht erfasst', kind: 'count' },
  { key: 'weErstversuch', label: 'Schriftlich: im 1. Versuch bestanden', kind: 'ratio' },
  { key: 'weErstversuchFailed', label: 'Schriftlich: im 1. Versuch durchgefallen', kind: 'ratio' },
  { key: 'weGesamt', label: 'Schriftlich: insgesamt bestanden', kind: 'ratio' },
  { key: 'wePerf1', label: 'Schriftlich: Ø Resultat 1. Versuch', kind: 'mean' },
  { key: 'wePerf2', label: 'Schriftlich: Ø Resultat bestandener Run', kind: 'mean' },
  { key: 'oeBestanden', label: 'Mündlich: bestanden', kind: 'ratio' },
  { key: 'oeFailed1', label: 'Mündlich: im 1. Versuch durchgefallen', kind: 'ratio' },
  { key: 'oeFailed2', label: 'Mündlich: 2× durchgefallen', kind: 'ratio' },
  { key: 'oePerf1', label: 'Mündlich: Ø Resultat 1. Versuch', kind: 'mean' },
  { key: 'oePerf2', label: 'Mündlich: Ø Resultat bestandener Run', kind: 'mean' },
  { key: 'zertifikate', label: 'Ausgestellte Zertifikate', kind: 'count' },
  { key: 'mehrereProfile', label: 'Personen mit mehreren Profilen', kind: 'count' },
]);

// Datei-Zähler aus meta.counts (Zustand der Excel-Datei am Stichtag, inkl. Datenqualität)
export const SNAPSHOT_COUNTS = Object.freeze([
  { key: 'zeilen', label: 'Zeilen (beide Sheets)' },
  { key: 'vorgaenge', label: 'Vorgänge (ohne Duplikate)' },
  { key: 'personen', label: 'Personen' },
  { key: 'duplikate', label: 'Duplikate zusammengeführt' },
  { key: 'bestanden', label: 'Status bestanden' },
  { key: 'nichtBestanden', label: 'Status nicht bestanden' },
  { key: 'offen', label: 'Status offen' },
  { key: 'passiv', label: 'davon passiv (> 365 Tage)' },
  { key: 'nichtErfasst', label: 'Status nicht erfasst' },
  { key: 'vollstaendigOhneGesamtergebnis', label: 'Alle Teile bestanden, Gesamtergebnis leer' },
  { key: 'teileAusserhalbVorgabe', label: 'Vorgänge mit Teilen ausserhalb der Vorgabe' },
  { key: 'fehler', label: 'Data-Quality: Fehler' },
  { key: 'hinweise', label: 'Data-Quality: Hinweise' },
  { key: 'nichtAusgewertet', label: 'Data-Quality: nicht ausgewertet' },
]);

export class SnapshotFormatError extends Error {}

function num(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

// Kennzahlen einer Vorgangsmenge: { key: { value, count, n } } – value bei ratio/mean als Anteil 0..1, bei count als Zahl,
// count = Zähler des Anteils (null bei Mittelwerten und Zählungen), n = Nenner bzw. Bezugsmenge
export function kennzahlenOf(persons) {
  const o = overview(persons, MODE.ERSTVERSUCH);
  const count = (v, n) => ({ value: v, count: null, n });
  const ratio = (r) => ({ value: num(r.pct), count: r.count, n: r.n });
  const mean = (m) => ({ value: num(m.mean), count: null, n: m.n });
  return {
    vorgaenge: count(o.n, o.n),
    personen: count(o.personen, o.n),
    offen: count(o.status.offen, o.n),
    passiv: count(o.status.passiv, o.n),
    nichtErfasst: count(o.status.nichtErfasst, o.n),
    weErstversuch: ratio(o.written.erstversuch),
    weErstversuchFailed: ratio(o.written.erstversuchFailed),
    weGesamt: ratio(o.written.gesamt),
    wePerf1: mean(writtenPerformance(persons, MODE.ERSTVERSUCH)),
    wePerf2: mean(writtenPerformance(persons, MODE.BESTANDEN)),
    oeBestanden: ratio(o.oral.bestanden),
    oeFailed1: ratio(o.oral.failed1),
    oeFailed2: ratio(o.oral.failed2),
    oePerf1: mean(oralPerformance(persons, MODE.ERSTVERSUCH)),
    oePerf2: mean(oralPerformance(persons, MODE.BESTANDEN)),
    zertifikate: count(o.issued, o.n),
    mehrereProfile: count(multiProfilePersons(persons).length, o.personen),
  };
}

function isoOrNull(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return typeof v === 'string' && v ? v : null;
}

// Snapshot des aktuellen Zustands: kennzahlrelevante Vorgänge ohne Filter (Stand der Datei), Zähler aus meta.counts
export function buildSnapshot({ persons, meta = null, today = new Date() }) {
  const vorgaenge = eligible(persons || []);
  const counts = (meta && meta.counts) || {};
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    stichtag: dayKey(today),
    erstellt: today.toISOString(),
    quelle: { dateiname: meta && meta.fileName ? String(meta.fileName) : null, geaendert: isoOrNull(meta && meta.lastModified) },
    zaehler: Object.fromEntries(SNAPSHOT_COUNTS.map((c) => [c.key, num(counts[c.key])])),
    kennzahlen: kennzahlenOf(vorgaenge),
    jeProfil: groupBy(vorgaenge, 'profil').map((g) => ({ profil: g.key === undefined ? null : g.key, kennzahlen: kennzahlenOf(g.persons) })),
    jeJahr: yearsOf(vorgaenge).map((jahr) => ({ jahr, kennzahlen: kennzahlenOf(vorgaenge.filter((p) => refYear(p) === jahr)) })),
    hinweis: 'Aggregate ohne Personendaten: kennzahlrelevante Vorgänge ohne Filter (Stand der Datei am Stichtag). Erzeugt vom bbz Zertifizierungs-Cockpit.',
  };
}

export function snapshotFileName(snapshot) {
  return 'cockpit-snapshot-' + snapshot.stichtag + '.json';
}

export function snapshotJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

// Import: JSON-Text → Snapshot mit ausschliesslich bekannten Feldern; wirft SnapshotFormatError mit lesbarem Grund
export function parseSnapshot(text, fileName = '') {
  const where = fileName ? fileName + ': ' : '';
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SnapshotFormatError(where + 'kein gültiges JSON');
  }
  if (!raw || typeof raw !== 'object' || raw.format !== SNAPSHOT_FORMAT) throw new SnapshotFormatError(where + 'kein Cockpit-Snapshot (Feld «format» fehlt oder falsch)');
  if (raw.version !== SNAPSHOT_VERSION) throw new SnapshotFormatError(where + 'Snapshot-Version ' + raw.version + ' wird nicht unterstützt (erwartet ' + SNAPSHOT_VERSION + ')');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.stichtag))) throw new SnapshotFormatError(where + 'Stichtag fehlt oder ist ungültig (erwartet JJJJ-MM-TT)');
  if (!raw.kennzahlen || typeof raw.kennzahlen !== 'object') throw new SnapshotFormatError(where + 'Kennzahlen fehlen');
  const kz = (obj) => Object.fromEntries(SNAPSHOT_KPIS.map((k) => {
    const v = obj && typeof obj === 'object' ? obj[k.key] : null;
    return [k.key, v && typeof v === 'object' ? { value: num(v.value), count: num(v.count), n: num(v.n) || 0 } : { value: null, count: null, n: 0 }];
  }));
  const groups = (list, keyName, toKey) => (Array.isArray(list) ? list.filter((g) => g && typeof g === 'object').map((g) => ({ [keyName]: toKey(g[keyName]), kennzahlen: kz(g.kennzahlen) })) : []);
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    stichtag: String(raw.stichtag),
    erstellt: typeof raw.erstellt === 'string' ? raw.erstellt : null,
    quelle: {
      dateiname: raw.quelle && typeof raw.quelle.dateiname === 'string' ? raw.quelle.dateiname : null,
      geaendert: raw.quelle && typeof raw.quelle.geaendert === 'string' ? raw.quelle.geaendert : null,
    },
    zaehler: Object.fromEntries(SNAPSHOT_COUNTS.map((c) => [c.key, num(raw.zaehler && typeof raw.zaehler === 'object' ? raw.zaehler[c.key] : null)])),
    kennzahlen: kz(raw.kennzahlen),
    jeProfil: groups(raw.jeProfil, 'profil', (v) => (v === null || v === undefined ? null : String(v))),
    jeJahr: groups(raw.jeJahr, 'jahr', (v) => num(v)),
    datei: fileName || null,
  };
}

// Snapshots chronologisch (Stichtag, dann Erstellzeit)
export function sortSnapshots(snapshots) {
  return snapshots.slice().sort((a, b) => a.stichtag.localeCompare(b.stichtag) || String(a.erstellt || '').localeCompare(String(b.erstellt || '')));
}

function delta(kind, cur, prev) {
  if (!cur || !prev || cur.value === null || cur.value === undefined || prev.value === null || prev.value === undefined) return null;
  return kind === 'count' ? cur.value - prev.value : (cur.value - prev.value) * 100; // Anteile in Prozentpunkten
}

// Kennzahlen je Stichtag: [{ key, label, kind, cells: [je Snapshot], current, delta }] – delta = heute gegenüber dem
// jüngsten Snapshot (count absolut, ratio/mean in Prozentpunkten), null ohne Vergleichswert
export function compareKennzahlen(snapshots, current) {
  const list = sortSnapshots(snapshots);
  const last = list.length ? list[list.length - 1] : null;
  return SNAPSHOT_KPIS.map((k) => {
    const cur = current ? current.kennzahlen[k.key] : null;
    return { key: k.key, label: k.label, kind: k.kind, cells: list.map((s) => s.kennzahlen[k.key]), current: cur, delta: delta(k.kind, cur, last ? last.kennzahlen[k.key] : null) };
  });
}

// Datei-Zähler je Stichtag: [{ key, label, cells: [Zahl|null], current, delta }]
export function compareZaehler(snapshots, current) {
  const list = sortSnapshots(snapshots);
  const last = list.length ? list[list.length - 1] : null;
  return SNAPSHOT_COUNTS.map((c) => {
    const cur = current ? current.zaehler[c.key] : null;
    const prev = last ? last.zaehler[c.key] : null;
    return { key: c.key, label: c.label, cells: list.map((s) => s.zaehler[c.key]), current: cur, delta: cur !== null && cur !== undefined && prev !== null && prev !== undefined ? cur - prev : null };
  });
}

// Eine Kennzahl je Gruppe (Profil oder Jahr) und Stichtag: [{ group, cells, current, delta }]; Gruppen = Vereinigung aller Stichtage
export function compareByGroup(snapshots, current, groupList, groupKey, kpiKey) {
  const kind = (SNAPSHOT_KPIS.find((k) => k.key === kpiKey) || {}).kind || 'count';
  const list = sortSnapshots(snapshots);
  const last = list.length ? list[list.length - 1] : null;
  const find = (snap, group) => (snap && Array.isArray(snap[groupList]) ? snap[groupList].find((g) => g[groupKey] === group) : null);
  const groups = [];
  for (const snap of list.concat(current ? [current] : [])) for (const g of snap[groupList] || []) if (!groups.includes(g[groupKey])) groups.push(g[groupKey]);
  groups.sort((a, b) => (a === null) - (b === null) || (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'de')));
  return groups.map((group) => {
    const val = (snap) => { const g = find(snap, group); return g ? g.kennzahlen[kpiKey] : null; };
    const cur = val(current);
    return { group, cells: list.map(val), current: cur, delta: delta(kind, cur, val(last)) };
  });
}
