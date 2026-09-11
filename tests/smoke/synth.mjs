// tests/smoke/synth.mjs – synthetische Excel-Datei für den Smoke-Test: erfundene Namen, beide Sheets, alle Fallarten
// (bestanden, offen, passiv, geplant schriftlich/mündlich, Wiederholung, Duplikat über Sheets, Zertifikat, Score-Anomalie,
// zweite Bank; Paket C: Bankwechsel, Namensgleiche, ohne Geburtsdatum; Paket D: Experten je OE-Run – «Prüfer Pia», «Experte Emil»,
// «Beisitz Bruno», ein Einsatz mit einem Experten, einer mit gleichem Namen in beiden Rollen, ein Run ohne Experten). Wird zur Laufzeit in ein Temp-Verzeichnis geschrieben (*.xlsx ist gitignored) – nie ins Repo.
// Aufruf: node tests/smoke/synth.mjs [pfad.xlsx]

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../../config.js';
import { headerRowFor, cellsFor, runValues } from '../fixtures.js';

const require = createRequire(import.meta.url);
const XLSX = require('../../lib/xlsx.full.min.js');
const fflate = require('../../lib/fflate.umd.js');

const d = (y, m, day, h = 0, min = 0) => new Date(y, m - 1, day, h, min);
const leerOe = runValues('oe', { 1: [{ passed: '', date: '', score: '', result: '', expert1: '', expert2: '' }] });

// Grundfall: PK, WE1 und OE1 bestanden
const base = (o) => ({
  lastName: 'Muster', firstName: 'Anna', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE', birthDate: '15.03.1985',
  weAllPassed: 'yes', oeAllPassed: 'yes',
  ...runValues('we', { 1: [{ passed: 'yes', date: d(2024, 3, 1), score: 50, result: 85 }] }), // Result 85 → Umdeutung /100 (Hinweis)
  ...runValues('oe', { 1: [{ passed: 'yes', date: d(2024, 6, 1), score: 5, result: 0.9, expert1: 'Prüfer Pia', expert2: 'Experte Emil' }] }),
  ...o,
});

export function buildSynthWorkbook() {
  const wb = XLSX.utils.book_new();
  const add = (source, rows) => {
    const header = headerRowFor(source, { experts: true });
    const filler = Array.from({ length: CONFIG.headerRow - 1 }, () => []);
    const aoa = filler.concat([header], rows.map((v) => cellsFor(source, header, v)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), CONFIG.sheets[source]);
  };
  add('first', [
    base({}),
    // Zeile ohne Namen (Fehler «Name fehlt»): kein Vorgang, keine Person – Data-Quality-Eintrag mit Zeile, aber ohne Sprungziel (Hotfix 07.09.2026)
    base({ lastName: '', firstName: '', birthDate: '' }),
    // IK offen, OE1 nicht bestanden 2024, kein Termin → passiv
    base({ lastName: 'Beispiel', firstName: 'Ben', profil: 'IK', birthDate: '01.01.1990', weAllPassed: '', oeAllPassed: '', ...runValues('oe', { 1: [{ passed: 'no', date: d(2024, 6, 1), score: 2, result: 0.4, expert1: 'Experte Emil', expert2: 'Beisitz Bruno' }] }) }),
    // dieselbe Person, zweites Profil (CWMA) bestanden 2026, Score-Anomalie «x» → nicht ausgewertet (E6)
    base({ lastName: 'Beispiel', firstName: 'Ben', profil: 'CWMA', birthDate: '01.01.1990', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 3, 1), score: 'x', result: 0.7 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2026, 5, 1), score: 5, result: 0.8, expert1: 'Prüfer Pia', expert2: 'Beisitz Bruno' }] }) }),
    // KMU offen, WE1 bestanden, mündlich noch nichts → passiv
    base({ lastName: 'Offen', firstName: 'Olga', profil: 'KMU', birthDate: '02.02.1992', weAllPassed: '', oeAllPassed: '', ...leerOe }),
    // PK offen, WE1 nicht bestanden 2024, kein Termin → passiv.
    // Zugleich der Widerspruch für Paket A (A6): «no», aber Resultat 78 % über der Bestehensgrenze von 70 % → Hinweis im Log
    base({ lastName: 'Passiv', firstName: 'Paul', profil: 'PK', birthDate: '05.05.1995', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'no', date: d(2024, 1, 10), score: 20, result: 0.78 }] }), ...leerOe }),
    // PK offen: WE1 RUN1 nicht bestanden, RUN2 geplant (Wiederholung), WE2 geplant, OE1 geplant
    base({ lastName: 'Plan', firstName: 'Petra', employer: 'Musterbank', profil: 'PK', birthDate: '06.06.1996', weAllPassed: '', oeAllPassed: '',
      ...runValues('we', { 1: [{ passed: 'no', date: d(2026, 1, 10), score: 20, result: 0.4 }, { passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }], 2: [{ passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }] }),
      ...runValues('oe', { 1: [{ passed: '', date: d(2026, 11, 5, 8, 0), score: '', result: '', location: 'Zürich', expert1: 'Prüfer Pia', expert2: 'Beisitz Bruno' }] }) }),
    // IK ohne Prüfung, nur geplanter Termin
    base({ lastName: 'Termin', firstName: 'Tom', employer: 'Musterbank', profil: 'IK', sprache: 'FR', birthDate: '07.07.1997', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: '', date: d(2026, 10, 1, 13, 30), score: '', result: '', location: 'Bern' }] }), ...leerOe }),
    // PK ohne Prüfung, Termin ohne Uhrzeit
    base({ lastName: 'Neu', firstName: 'Nora', profil: 'PK', birthDate: '03.03.1993', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: '', date: d(2027, 1, 10), score: '', result: '' }] }), ...leerOe }),
    // zweite Bank, bestanden 2025
    base({ lastName: 'Bank', firstName: 'Bea', employer: 'Musterbank', profil: 'PK', birthDate: '08.08.1998', ...runValues('we', { 1: [{ passed: 'yes', date: d(2025, 3, 1), score: 60, result: 0.9 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2025, 6, 1), score: 5, result: 0.95, expert1: 'Prüfer Pia', expert2: '' }] }) }),
    // Paket C (Anhang A5): Bankwechsel – PK bei Testbank AG bestanden 2023 (Zertifikat Z-7 in Sheet 2), IK bei Musterbank offen 2026 (Passerelle möglich)
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', ...runValues('we', { 1: [{ passed: 'yes', date: d(2023, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2023, 6, 1), score: 5, result: 0.85, expert1: '', expert2: '' }] }) }),
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', employer: 'Musterbank', profil: 'IK', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 2, 1), score: 50, result: 0.75 }] }), ...leerOe }),
    // Namensgleiche mit unterschiedlichem Geburtsdatum (Entscheid 3: Geburtsjahr nur bei Namensgleichen)
    base({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: '01.01.1980', ...runValues('we', { 1: [{ passed: 'yes', date: d(2024, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2024, 6, 1), score: 5, result: 0.9, expert1: 'Beisitz Bruno', expert2: 'Experte Emil' }] }) }),
    base({ lastName: 'Zwilling', firstName: 'Gabi', birthDate: '05.05.1991', employer: 'Musterbank', profil: 'KMU', sprache: 'FR', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 4, 1), score: 50, result: 0.7 }], 2: [{ passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }] }), ...leerOe }),
    // ohne Geburtsdatum (Schlüssel nur aus dem Namen), mündlich nicht bestanden
    base({ lastName: 'Datumlos', firstName: 'Otto', birthDate: '', oeAllPassed: 'no', ...runValues('we', { 1: [{ passed: 'yes', date: d(2025, 5, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'no', date: d(2025, 8, 1), score: 2, result: 0.5, expert1: 'Experte Emil', expert2: 'Experte Emil' }] }) }),
  ]);
  add('issued', [
    base({ certStart: '01.07.2024', certNumber: 'Z-1' }), // Duplikat von Muster Anna PK (E1)
    base({ lastName: 'Zertifikat', firstName: 'Zoe', profil: 'AFFL', birthDate: '04.04.1994', certStart: '01.07.2024', certNumber: 'Z-2', weAllPassed: '', oeAllPassed: '' }),
    // Zertifikat zu Wechsel Willi PK (Duplikat der Sheet-1-Zeile, E1) mit Zertifikatsende (certEnd, Paket C)
    base({ lastName: 'Wechsel', firstName: 'Willi', birthDate: '09.09.1989', certStart: '01.07.2023', certNumber: 'Z-7', certEnd: '30.06.2028', ...runValues('we', { 1: [{ passed: 'yes', date: d(2023, 3, 1), score: 50, result: 0.8 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2023, 6, 1), score: 5, result: 0.85, expert1: '', expert2: '' }] }) }),
  ]);
  return mitThreadedComments(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// VSS/VSM stehen in der echten Datei als Threaded Comments auf der Namenszelle (B{Zeile}). SheetJS schreibt solche
// Kommentare nicht, also werden die Paketteile danach eingelegt – dieselben vier, die fileAdapter liest:
// xl/worksheets/_rels/sheetN.xml.rels (Beziehung) und xl/threadedComments/threadedComment1.xml (ref + Text).
// Ohne sie waren VSS und VSM im Smoke-Test IMMER leer: Die Ansicht «VSS/VSM» zeigte nur die Gruppe «ohne»,
// und keine Prüfung konnte zeigen, dass es drei Gruppen sind (Paket I, P5).
// Kopfzeile ist Zeile 10, die Daten beginnen bei 11 – jede Zeile hier ist ein Vorgang mit auswertbarem ersten
// Versuch schriftlich UND mündlich, damit beide Prüfungsteile einen Wert haben.
export const SYNTH_KENNZEICHNUNGEN = [
  { ref: 'B11', text: 'VSS 2024 bewilligt' },          // Muster Anna, PK, beides bestanden
  { ref: 'B13', text: 'VSM – Nachteilsausgleich' },      // Beispiel Ben, IK, mündlich nicht bestanden
  { ref: 'B20', text: 'VSS ab 2025' },                 // Bank Bea, PK, beides bestanden
  { ref: 'B23', text: 'VSS und VSM bewilligt' },       // Zwilling Gabi, PK – zählt in BEIDEN Gruppen
  { ref: 'B25', text: 'VSM 2025' },                    // Datumlos Otto, mündlich nicht bestanden
];

const REL_TC = 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment';

function mitThreadedComments(buffer) {
  const dateien = fflate.unzipSync(new Uint8Array(buffer));
  // Sheet-Datei des ersten Sheets über workbook.xml → workbook.xml.rels auflösen, statt sheet1.xml zu raten
  const wbXml = fflate.strFromU8(dateien['xl/workbook.xml']);
  const rId = (/<sheet[^>]*name="[^"]*"[^>]*r:id="([^"]+)"/.exec(wbXml) || [])[1];
  const relsXml = fflate.strFromU8(dateien['xl/_rels/workbook.xml.rels']);
  const ziel = (new RegExp('<Relationship[^>]*Id="' + rId + '"[^>]*Target="([^"]+)"').exec(relsXml) || [])[1];
  const datei = String(ziel || 'worksheets/sheet1.xml').replace(/^\/?(xl\/)?/, '');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">'
    + SYNTH_KENNZEICHNUNGEN.map((k, i) => '<threadedComment ref="' + k.ref + '" dT="2026-01-01T00:00:00Z" personId="{P}" id="{C' + i + '}">'
      + '<text>' + k.text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></threadedComment>').join('')
    + '</ThreadedComments>';
  dateien['xl/threadedComments/threadedComment1.xml'] = fflate.strToU8(xml);
  dateien['xl/' + datei.replace(/([^/]+)$/, '_rels/$1.rels')] = fflate.strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdTC1" Type="' + REL_TC + '" Target="../threadedComments/threadedComment1.xml"/>'
    + '</Relationships>');
  return Buffer.from(fflate.zipSync(dateien));
}

export function writeSynthWorkbook(path) {
  const out = path || join(mkdtempSync(join(tmpdir(), 'bbz-smoke-')), 'synth.xlsx');
  writeFileSync(out, buildSynthWorkbook());
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(writeSynthWorkbook(process.argv[2]));
}
