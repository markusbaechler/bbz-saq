#!/usr/bin/env node
// tools/modellbericht.js – Modellbericht P1 auf einer lokalen Kopie der Excel-Datei.
//
// Aufruf:  node tools/modellbericht.js /pfad/zu/Reporting_KUBA.xlsx
// Ausgabe: ausschliesslich Zähler und Quoten (keine Namen, keine Zeileninhalte ausser Score-Beispielwerten für E6).
// Die Datei wird nur gelesen; nichts wird gespeichert oder übertragen. Gleiche Parse- und Normalisierungslogik wie die App.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseWorkbook } from '../datasource/fileAdapter.js';
import { normalizeWorkbook, LEVEL } from '../store.js';
import { modelComparison, multiProfilePersons, formatPct, exclusionReason, isVorgang } from '../metrics.js';

const path = process.argv[2];
if (!path) {
  console.error('Aufruf: node tools/modellbericht.js <Reporting_KUBA.xlsx>');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const libs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };
const parsed = parseWorkbook(new Uint8Array(readFileSync(path)), libs);
const { persons, dq, meta } = normalizeWorkbook(parsed);
const c = meta.counts;

function pct(r) {
  return formatPct(r.pct) + ' (' + r.count + '/' + r.n + ')';
}

function line(...cells) {
  console.log(cells.map((x) => String(x)).join(' | '));
}

console.log('# Modellbericht P1 – ' + path.split(/[\\/]/).pop());
console.log('');
console.log('## Zähler');
line('Zeilen (beide Sheets)', c.zeilen, 'First Certification ' + c.first + ', Ausgestellte Zertifikate ' + c.issued);
line('Vorgänge (ohne Duplikate)', c.vorgaenge);
line('Personen (Personenschlüssel)', c.personen);
line('Duplikate zusammengeführt (E1)', c.duplikate);
line('Gleiches Profil, widersprüchliche Daten (eigene Vorgänge)', c.profilKonflikte);
line('Personen mit mehreren Profilen (E3)', c.mehrereProfile);
line('Status Vorgänge (E4)', 'bestanden ' + c.bestanden, 'nicht bestanden ' + c.nichtBestanden, 'offen ' + c.offen, 'nicht erfasst ' + c.nichtErfasst);
line('Kennzahlrelevant (≥1 absolvierter, datierter WE-Run, kein Duplikat)', persons.filter((p) => isVorgang(p) && p.hasWeDate).length);
line('Schlüssel ohne Geburtsdatum (name-only)', c.schluesselOhneGeburtsdatum);
line('Geburtsdatum-Header gefunden', JSON.stringify(meta.personKey.birthDateHeaders));
line('DQ-Log', 'Fehler ' + c.fehler, 'Hinweise ' + c.hinweise, 'nicht ausgewertet ' + c.nichtAusgewertet);
console.log('');

console.log('## Ausschlussgründe (Zeilen nicht in den Kennzahlen)');
const reasons = new Map();
for (const p of persons) {
  const r = exclusionReason(p);
  if (!r) continue;
  const key = r.replace(/\s*\(zusammengeführt.*$/, '').trim(); // Verweis auf Zeile entfernen → Gruppe
  reasons.set(key, (reasons.get(key) || 0) + 1);
}
for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) line(n, reason);
console.log('');

console.log('## Score (E6): Header und Beispielwerte nicht interpretierbarer Zellen');
const scoreEntries = dq.filter((e) => e.level === LEVEL.NICHT_AUSGEWERTET);
const headers = [...new Set(scoreEntries.map((e) => e.header))].sort();
const examples = [...new Set(scoreEntries.map((e) => (e.raw instanceof Date ? e.raw.toISOString() : String(e.raw))))].slice(0, 3);
line('Header mit Einträgen', headers.join(', ') || '–');
line('Anzahl Einträge', scoreEntries.length);
line('Beispielwerte (max. 3)', examples.join(' | ') || '–');
console.log('');

console.log('## Bestehensquoten alt → neu je Profil');
console.log('alt: Zeile = Person, Duplikate zählen, «insgesamt bestanden» = WE All yes / alle, mündlich = OE All yes / mit OE1 RUN1-Datum');
console.log('neu: Duplikate zusammengeführt, Nenner = abgeschlossene Vorgänge (bestanden + nicht bestanden), offen separat');
const cmp = modelComparison(persons);
line('Profil', 'n alt', 'n neu (Vorgänge)', 'Personen', 'schriftlich alt', 'schriftlich neu', 'mündlich alt', 'mündlich neu', 'offen', 'nicht erfasst');
for (const r of [cmp.gesamt, ...cmp.byProfil]) {
  line(r.key === null ? 'unbekannt' : r.key, r.alt.n, r.neu.n, r.neu.personen, pct(r.alt.written), pct(r.neu.written), pct(r.alt.oral), pct(r.neu.oral), r.neu.status.offen, r.neu.status.nichtErfasst);
}
console.log('');

console.log('## Profil-Abfolgen (Personen mit mehreren Profilen)');
const sequences = new Map();
for (const m of multiProfilePersons(persons)) sequences.set(m.sequence, (sequences.get(m.sequence) || 0) + 1);
for (const [seq, n] of [...sequences.entries()].sort((a, b) => b[1] - a[1])) line(n, seq);
if (!sequences.size) console.log('–');
