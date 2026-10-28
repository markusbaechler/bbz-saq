#!/usr/bin/env node
// tools/snapshot-synth.js – Snapshot der synthetischen Smoke-Datei (tests/smoke/synth.mjs) mit festem Stichtag, im Format
// von «Historie → Snapshot erzeugen» (snapshot.js). Dient dem Vergleich vor/nach Umbauten ohne fachliche Änderung
// (PROMPT-2.md, Abschnitt 0.4): identische Ausgabe = identische Zahlen. Nur synthetische Daten, keine Personendaten.
//
// Aufruf:  node tools/snapshot-synth.js                        → JSON nach stdout
//          node tools/snapshot-synth.js ausgabe.json           → JSON in Datei
//          node tools/snapshot-synth.js --vergleich basis.json → Vergleich mit einer früheren Ausgabe; Exit-Code 1 bei Abweichung
// Option:  --stichtag JJJJ-MM-TT (Standard 2026-09-06; bestimmt «geplant», «passiv» und die Jahresgruppen)
//          --quelle excel|erp (Standard excel). erp: dieselbe synthetische Datei im Format des ERP-Exports
//          (tests/erpExport.js) über datasource/erpAdapter.js – gleicher Inhalt über die zweite Quelle, gleiche Zahlen erwartet.
//          --erp export.json: statt der umgewandelten Datei einen echten Export des bbz-ERP (GET /saq/export/kuba) verwenden,
//          z. B. nachdem die synthetische Datei (node tests/smoke/synth.mjs) mit «npm run kuba:import» ins ERP importiert wurde.
//          --nur-kennzahlen: Vergleich ohne Datei-Zähler (zaehler: Zeilen, Duplikate, Data-Quality …) – für einen echten
//          ERP-Export, dessen Import Duplikate bereits zusammenführt und Zellen bereinigt.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseWorkbook } from '../datasource/fileAdapter.js';
import { rowsToWorkbook } from '../datasource/erpAdapter.js';
import { normalizeWorkbook } from '../store.js';
import { buildSnapshot, snapshotJson } from '../snapshot.js';
import { buildSynthWorkbook } from '../tests/smoke/synth.mjs';
import { erpRowsFromSheets } from '../tests/erpExport.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const stichtag = option('--stichtag', '2026-09-06');
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stichtag);
if (!m) {
  console.error('Ungültiger Stichtag «' + stichtag + '» (erwartet JJJJ-MM-TT).');
  process.exit(2);
}
const today = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
const vergleich = option('--vergleich', null);
const erpExport = option('--erp', null);
const quelle = erpExport ? 'erp' : option('--quelle', 'excel');
if (quelle !== 'excel' && quelle !== 'erp') {
  console.error('Unbekannte Quelle «' + quelle + '» (erwartet excel oder erp).');
  process.exit(2);
}
const FLAGS = ['--nur-kennzahlen']; // Optionen ohne Wert
const nurKennzahlen = args.includes('--nur-kennzahlen');
const outPath = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || FLAGS.includes(args[i - 1]))) || null;

const require = createRequire(import.meta.url);
const libs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };

const parsed = parseWorkbook(new Uint8Array(buildSynthWorkbook()), libs);
const erpRows = () => (erpExport ? JSON.parse(readFileSync(erpExport, 'utf8')) : erpRowsFromSheets(parsed.sheets));
const { persons, meta } = normalizeWorkbook(quelle === 'erp' ? rowsToWorkbook(erpRows()) : parsed, { today });
const snapshot = buildSnapshot({ persons, meta: { ...meta, fileName: 'synth.xlsx', lastModified: null }, today });

// Vergleich ohne Zeitstempel-Felder (stichtag, erstellt, quelle.geaendert); alles andere muss identisch sein
function strip(obj) {
  const o = JSON.parse(JSON.stringify(obj));
  delete o.stichtag;
  delete o.erstellt;
  if (o.quelle) delete o.quelle.geaendert;
  if (nurKennzahlen) delete o.zaehler;
  return o;
}

function diff(a, b, path = '') {
  if (a === b) return [];
  // Gleitkomma: Summen in anderer Reihenfolge (der ERP-Export ist nach Namen sortiert) weichen in der letzten Stelle ab
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return [path + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b)];
  }
  const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))];
  return keys.flatMap((k) => diff(a[k], b[k], path ? path + '.' + k : k));
}

if (vergleich) {
  const basis = JSON.parse(readFileSync(vergleich, 'utf8'));
  const changes = diff(strip(basis), strip(snapshot));
  if (changes.length) {
    console.error('Snapshot weicht von ' + vergleich + ' ab (' + changes.length + ' Felder):');
    for (const c of changes) console.error('  ' + c);
    process.exit(1);
  }
  console.log((nurKennzahlen ? 'Kennzahlen' : 'Snapshot') + ' identisch mit ' + vergleich + ' (ohne Zeitstempel-Felder' + (nurKennzahlen ? ' und Datei-Zähler' : '') + ').');
} else if (outPath) {
  writeFileSync(outPath, snapshotJson(snapshot) + '\n');
  console.log(outPath + ' geschrieben (Stichtag ' + stichtag + ').');
} else {
  process.stdout.write(snapshotJson(snapshot) + '\n');
}
