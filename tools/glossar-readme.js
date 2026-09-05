#!/usr/bin/env node
// tools/glossar-readme.js – erzeugt den Abschnitt «Kennzahl-Definitionen» für README.md aus glossary.js
// (zwischen den Markern <!-- glossar:start --> und <!-- glossar:end -->). Aufruf: node tools/glossar-readme.js [--write]

import { readFileSync, writeFileSync } from 'node:fs';
import { GLOSSARY } from '../glossary.js';

function cell(s) {
  return String(s).replace(/\|/g, '\\|');
}

const lines = [];
lines.push('### Begriffe', '', '| Begriff | Definition | Grenzfälle / Hinweise |', '|---|---|---|');
for (const g of GLOSSARY.filter((x) => x.kind === 'Begriff')) lines.push('| **' + cell(g.term) + '** | ' + cell(g.definition) + ' | ' + cell(g.grenzfaelle) + ' |');
lines.push('', '### Kennzahlen', '', '| Kennzahl | Definition | Nenner | Grenzfälle / Hinweise |', '|---|---|---|---|');
for (const g of GLOSSARY.filter((x) => x.kind === 'Kennzahl')) lines.push('| **' + cell(g.term) + '** | ' + cell(g.definition) + ' | ' + cell(g.nenner) + ' | ' + cell(g.grenzfaelle) + ' |');
const section = lines.join('\n');

if (process.argv.includes('--write')) {
  const path = new URL('../README.md', import.meta.url);
  const readme = readFileSync(path, 'utf8');
  const start = readme.indexOf('<!-- glossar:start -->');
  const end = readme.indexOf('<!-- glossar:end -->');
  if (start < 0 || end < 0) {
    console.error('Marker <!-- glossar:start --> / <!-- glossar:end --> fehlen in README.md');
    process.exit(1);
  }
  writeFileSync(path, readme.slice(0, start) + '<!-- glossar:start -->\n' + section + '\n' + readme.slice(end));
  console.log('README.md aktualisiert');
} else {
  console.log(section);
}
