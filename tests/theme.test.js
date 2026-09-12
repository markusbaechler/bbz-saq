// tests/theme.test.js – Spiegelung der dunklen Palette für die manuelle Wahl (Paket OPTIK, O3a).
// Der Punkt: Die Werte dürfen nicht an zwei Orten stehen, die auseinanderlaufen. Ein zweiter Block bliebe sonst
// ungeprüft – 150/150 grün, während der manuelle Dunkelmodus danebenläuft.
import { test, assert, assertEqual } from './runner.js';
import { dunkleDeklarationen, erzeugterBlock, inCssEinsetzen, alsPaare, MARKE_START, MARKE_ENDE, SELEKTOR_DUNKEL } from '../tools/theme.js';
import { dunkelAbweichungen } from '../tools/contrast.js';

const CSS = [
  ':root { --bg: #fff; --text: #000; }',
  '@media (prefers-color-scheme: dark) {',
  '  :root:not([data-theme="light"]) {',
  '    color-scheme: dark;',
  '    --bg: #111;',
  '    --text: #eee;',
  '  }',
  '}',
  '',
  MARKE_START,
  MARKE_ENDE,
  '',
  '@media print { :root[data-theme], :root:not([data-theme]) { --bg: #fff; --text: #000; } }',
].join('\n');

test('theme.dunkleDeklarationen: liest den Block der Media-Abfrage, auch mit Wächter am Selektor', () => {
  const d = dunkleDeklarationen(CSS);
  assertEqual(alsPaare(d), { 'color-scheme': 'dark', '--bg': '#111', '--text': '#eee' });
  assertEqual(dunkleDeklarationen(':root { --a: 1; }'), null, 'ohne dunkle Media-Abfrage nichts');
});

test('theme.erzeugterBlock: dieselben Werte unter dem Attribut-Selektor, eine Stufe zurückgesetzt', () => {
  const b = erzeugterBlock(dunkleDeklarationen(CSS));
  assert(b.startsWith(MARKE_START) && b.trimEnd().endsWith(MARKE_ENDE), 'Marken aussen');
  assert(b.includes(SELEKTOR_DUNKEL + ' {'), b);
  assert(/\n  --bg: #111;/.test(b), 'zwei Leerzeichen Einrückung, nicht vier: ' + JSON.stringify(b.slice(0, 240)));
  assertEqual(alsPaare(b.slice(b.indexOf('{') + 1)), alsPaare(dunkleDeklarationen(CSS)), 'Wert für Wert gleich');
});

test('theme.inCssEinsetzen: ersetzt nur den erzeugten Bereich und bleibt beim zweiten Lauf gleich', () => {
  const eins = inCssEinsetzen(CSS, erzeugterBlock(dunkleDeklarationen(CSS)));
  assert(eins.includes('@media print'), 'was daneben steht, bleibt');
  assertEqual(inCssEinsetzen(eins, erzeugterBlock(dunkleDeklarationen(eins))), eins, 'zweiter Lauf ändert nichts');
  let fehler = null;
  try { inCssEinsetzen(':root { }', 'x'); } catch (e) { fehler = e.message; }
  assert(fehler && /Marken fehlen/.test(fehler), 'ohne Marken ein harter Fehler statt stillem Nichtstun');
});

test('contrast.dunkelAbweichungen: meldet jede Abweichung der manuellen Fassung – und das Fehlen des Blocks', () => {
  const gut = inCssEinsetzen(CSS, erzeugterBlock(dunkleDeklarationen(CSS)));
  assertEqual(dunkelAbweichungen(gut).length, 0, 'erzeugt heisst deckungsgleich');
  // Ein Wert von Hand verändert: genau der Fall, den der Generator verhindern soll
  const drift = gut.replace(SELEKTOR_DUNKEL + ' {\n  color-scheme: dark;\n  --bg: #111;', SELEKTOR_DUNKEL + ' {\n  color-scheme: dark;\n  --bg: #222;');
  assert(dunkelAbweichungen(drift).some((x) => /--bg/.test(x)), dunkelAbweichungen(drift).join(' | '));
  // Ein Token fehlt in der manuellen Fassung
  const fehlt = gut.replace('\n  --text: #eee;\n}\n' + MARKE_ENDE, '\n}\n' + MARKE_ENDE);
  assert(dunkelAbweichungen(fehlt).some((x) => /--text/.test(x)), dunkelAbweichungen(fehlt).join(' | '));
  assertEqual(dunkelAbweichungen(CSS.replace(MARKE_START + '\n' + MARKE_ENDE, '')).length, 1, 'ohne Block eine Meldung');
});
