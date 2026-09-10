#!/usr/bin/env node
// tools/regeln-abgleich.js – hält CLAUDE.md und AGENTS.md deckungsgleich.
// Beide Dateien tragen dieselben Projektregeln; welche ein Agent liest, hängt allein vom Harness ab. Driften sie
// auseinander, arbeiten zwei Agenten am selben Repo nach verschiedenen Regeln – und die unverhandelbaren stehen
// zufällig nur in einer. Abweichen darf einzig die erste Zeile: Sie benennt die Datei.
// Aufruf: node tools/regeln-abgleich.js   (Exit-Code 1 bei Abweichung, mit der ersten unterschiedlichen Zeile)
// Reine Funktion compareRules(); die CLI läuft nur unter Node. Aufruf im CI-Job «tests».

// [{ line, a, b }] der abweichenden Zeilen ab Zeile 2 (1-basiert), leer = deckungsgleich.
// Die erste Zeile bleibt ausgenommen; Zeilenenden werden vorher vereinheitlicht.
export function compareRules(claude, agents) {
  const lines = (text) => String(text).replace(/\r\n/g, '\n').split('\n').slice(1);
  const a = lines(claude);
  const b = lines(agents);
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push({ line: i + 2, a: a[i], b: b[i] });
  }
  return out;
}

const isMain = typeof process !== 'undefined' && Array.isArray(process.argv) && String(process.argv[1] || '').endsWith('regeln-abgleich.js');
if (isMain) {
  const { readFileSync } = await import('node:fs');
  const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const diff = compareRules(read('CLAUDE.md'), read('AGENTS.md'));
  if (!diff.length) {
    console.log('  ok   CLAUDE.md und AGENTS.md sind ab Zeile 2 identisch.');
    process.exit(0);
  }
  console.log('  FAIL CLAUDE.md und AGENTS.md weichen ab ' + diff.length + ' Zeile(n) voneinander ab:');
  for (const d of diff.slice(0, 5)) {
    console.log('    Zeile ' + d.line);
    console.log('      CLAUDE.md: ' + (d.a === undefined ? '(fehlt)' : d.a));
    console.log('      AGENTS.md: ' + (d.b === undefined ? '(fehlt)' : d.b));
  }
  if (diff.length > 5) console.log('    … und ' + (diff.length - 5) + ' weitere');
  console.log('  Beide Dateien tragen dieselben Regeln – Änderungen immer in beiden.');
  process.exit(1);
}
