#!/usr/bin/env node
// tools/snapshot-synth.js – Snapshot der synthetischen Smoke-Datei (tests/smoke/synth.mjs) mit festem Stichtag, im Format
// von «Historie → Snapshot erzeugen» (snapshot.js). Dient dem Vergleich vor/nach Umbauten ohne fachliche Änderung
// (PROMPT-2.md, Abschnitt 0.4): identische Ausgabe = identische Zahlen. Nur synthetische Daten, keine Personendaten.
//
// Aufruf:  node tools/snapshot-synth.js                        → JSON nach stdout
//          node tools/snapshot-synth.js ausgabe.json           → JSON in Datei
//          node tools/snapshot-synth.js --vergleich basis.json → Vergleich mit einer früheren Ausgabe; Exit-Code 1 bei Abweichung
// Option:  --stichtag JJJJ-MM-TT (Standard 2026-09-06; bestimmt «geplant», «passiv» und die Jahresgruppen)

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseWorkbook } from '../datasource/fileAdapter.js';
import { normalizeWorkbook } from '../store.js';
import { buildSnapshot, snapshotJson } from '../snapshot.js';
import { buildSynthWorkbook } from '../tests/smoke/synth.mjs';

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
const outPath = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--'))) || null;

const require = createRequire(import.meta.url);
const libs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };

const parsed = parseWorkbook(new Uint8Array(buildSynthWorkbook()), libs);
const { persons, meta } = normalizeWorkbook(parsed, { today });
const snapshot = buildSnapshot({ persons, meta: { ...meta, fileName: 'synth.xlsx', lastModified: null }, today });

// Vergleich ohne Zeitstempel-Felder (stichtag, erstellt, quelle.geaendert); alles andere muss identisch sein
function strip(obj) {
  const o = JSON.parse(JSON.stringify(obj));
  delete o.stichtag;
  delete o.erstellt;
  if (o.quelle) delete o.quelle.geaendert;
  return o;
}

function diff(a, b, path = '') {
  if (a === b) return [];
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
  console.log('Snapshot identisch mit ' + vergleich + ' (ohne Zeitstempel-Felder).');
} else if (outPath) {
  writeFileSync(outPath, snapshotJson(snapshot) + '\n');
  console.log(outPath + ' geschrieben (Stichtag ' + stichtag + ').');
} else {
  process.stdout.write(snapshotJson(snapshot) + '\n');
}
