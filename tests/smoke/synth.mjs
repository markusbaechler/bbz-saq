// tests/smoke/synth.mjs – synthetische Excel-Datei für den Smoke-Test: erfundene Namen, beide Sheets, alle Fallarten
// (bestanden, offen, passiv, geplant schriftlich/mündlich, Wiederholung, Duplikat über Sheets, Zertifikat, Score-Anomalie,
// zweite Bank). Wird zur Laufzeit in ein Temp-Verzeichnis geschrieben (*.xlsx ist gitignored) – nie ins Repo.
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

const d = (y, m, day, h = 0, min = 0) => new Date(y, m - 1, day, h, min);
const leerOe = runValues('oe', { 1: [{ passed: '', date: '', score: '', result: '' }] });

// Grundfall: PK, WE1 und OE1 bestanden
const base = (o) => ({
  lastName: 'Muster', firstName: 'Anna', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE', birthDate: '15.03.1985',
  weAllPassed: 'yes', oeAllPassed: 'yes',
  ...runValues('we', { 1: [{ passed: 'yes', date: d(2024, 3, 1), score: 50, result: 85 }] }), // Result 85 → Umdeutung /100 (Hinweis)
  ...runValues('oe', { 1: [{ passed: 'yes', date: d(2024, 6, 1), score: 5, result: 0.9 }] }),
  ...o,
});

export function buildSynthWorkbook() {
  const wb = XLSX.utils.book_new();
  const add = (source, rows) => {
    const header = headerRowFor(source);
    const filler = Array.from({ length: CONFIG.headerRow - 1 }, () => []);
    const aoa = filler.concat([header], rows.map((v) => cellsFor(source, header, v)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), CONFIG.sheets[source]);
  };
  add('first', [
    base({}),
    // IK offen, OE1 nicht bestanden 2024, kein Termin → passiv
    base({ lastName: 'Beispiel', firstName: 'Ben', profil: 'IK', birthDate: '01.01.1990', weAllPassed: '', oeAllPassed: '', ...runValues('oe', { 1: [{ passed: 'no', date: d(2024, 6, 1), score: 2, result: 0.4 }] }) }),
    // dieselbe Person, zweites Profil (CWMA) bestanden 2026, Score-Anomalie «x» → nicht ausgewertet (E6)
    base({ lastName: 'Beispiel', firstName: 'Ben', profil: 'CWMA', birthDate: '01.01.1990', ...runValues('we', { 1: [{ passed: 'yes', date: d(2026, 3, 1), score: 'x', result: 0.7 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2026, 5, 1), score: 5, result: 0.8 }] }) }),
    // KMU offen, WE1 bestanden, mündlich noch nichts → passiv
    base({ lastName: 'Offen', firstName: 'Olga', profil: 'KMU', birthDate: '02.02.1992', weAllPassed: '', oeAllPassed: '', ...leerOe }),
    // PK offen, WE1 nicht bestanden 2024, kein Termin → passiv
    base({ lastName: 'Passiv', firstName: 'Paul', profil: 'PK', birthDate: '05.05.1995', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: 'no', date: d(2024, 1, 10), score: 20, result: 0.4 }] }), ...leerOe }),
    // PK offen: WE1 RUN1 nicht bestanden, RUN2 geplant (Wiederholung), WE2 geplant, OE1 geplant
    base({ lastName: 'Plan', firstName: 'Petra', employer: 'Musterbank', profil: 'PK', birthDate: '06.06.1996', weAllPassed: '', oeAllPassed: '',
      ...runValues('we', { 1: [{ passed: 'no', date: d(2026, 1, 10), score: 20, result: 0.4 }, { passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }], 2: [{ passed: '', date: d(2026, 10, 1, 9, 0), score: '', result: '', location: 'Bern' }] }),
      ...runValues('oe', { 1: [{ passed: '', date: d(2026, 11, 5, 8, 0), score: '', result: '', location: 'Zürich' }] }) }),
    // IK ohne Prüfung, nur geplanter Termin
    base({ lastName: 'Termin', firstName: 'Tom', employer: 'Musterbank', profil: 'IK', sprache: 'FR', birthDate: '07.07.1997', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: '', date: d(2026, 10, 1, 13, 30), score: '', result: '', location: 'Bern' }] }), ...leerOe }),
    // PK ohne Prüfung, Termin ohne Uhrzeit
    base({ lastName: 'Neu', firstName: 'Nora', profil: 'PK', birthDate: '03.03.1993', weAllPassed: '', oeAllPassed: '', ...runValues('we', { 1: [{ passed: '', date: d(2027, 1, 10), score: '', result: '' }] }), ...leerOe }),
    // zweite Bank, bestanden 2025
    base({ lastName: 'Bank', firstName: 'Bea', employer: 'Musterbank', profil: 'PK', birthDate: '08.08.1998', ...runValues('we', { 1: [{ passed: 'yes', date: d(2025, 3, 1), score: 60, result: 0.9 }] }), ...runValues('oe', { 1: [{ passed: 'yes', date: d(2025, 6, 1), score: 5, result: 0.95 }] }) }),
  ]);
  add('issued', [
    base({ certStart: '01.07.2024', certNumber: 'Z-1' }), // Duplikat von Muster Anna PK (E1)
    base({ lastName: 'Zertifikat', firstName: 'Zoe', profil: 'AFFL', birthDate: '04.04.1994', certStart: '01.07.2024', certNumber: 'Z-2', weAllPassed: '', oeAllPassed: '' }),
  ]);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function writeSynthWorkbook(path) {
  const out = path || join(mkdtempSync(join(tmpdir(), 'bbz-smoke-')), 'synth.xlsx');
  writeFileSync(out, buildSynthWorkbook());
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(writeSynthWorkbook(process.argv[2]));
}
