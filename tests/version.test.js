// tests/version.test.js – Fassungsmarke gegen alte Dateien aus dem Cache (tools/version.js). Reine Funktionen.
// Der Anlass: GitHub Pages liefert mit «max-age=600» aus, die Modulverweise trugen keine Version – nach einem
// Deploy zeigte der Browser bis zu zehn Minuten alte Module, teils gemischt mit neuen.
import { test, assert, assertEqual } from './runner.js';
import { fnv1a, fingerprint, versionModul, versionAusModul, erzeugterBlock, inHtmlEinsetzen, MARKE_START, MARKE_ENDE } from '../tools/version.js';

const datei = (pfad, inhalt) => ({ pfad, inhalt });

test('version.fnv1a: gleicher Text gleicher Wert, ein Zeichen anders anderer Wert', () => {
  assertEqual(fnv1a('abc'), fnv1a('abc'));
  assert(fnv1a('abc') !== fnv1a('abd'), 'ein Zeichen genügt');
  assert(fnv1a('') >= 0 && Number.isInteger(fnv1a('x')), 'immer eine ganze Zahl ohne Vorzeichen');
});

test('version.fingerprint: ändert sich bei jeder Änderung – auch bei blosser Umbenennung', () => {
  const a = [datei('app.js', 'const a = 1;'), datei('views/tables.js', 'export const b = 2;')];
  assertEqual(fingerprint(a), fingerprint([...a].reverse()), 'die Reihenfolge der Dateien darf nichts ändern');
  assert(fingerprint(a) !== fingerprint([datei('app.js', 'const a = 2;'), a[1]]), 'anderer Inhalt');
  assert(fingerprint(a) !== fingerprint([datei('app2.js', 'const a = 1;'), a[1]]), 'anderer Pfad bei gleichem Inhalt');
  assert(fingerprint(a) !== fingerprint(a.concat([datei('neu.js', '')])), 'eine Datei mehr');
  assert(/^[0-9a-f]{8}[0-9a-z]+$/.test(fingerprint(a)), 'kurz und URL-tauglich: ' + fingerprint(a));
});

test('version.versionModul / versionAusModul: schreiben und wieder lesen', () => {
  const text = versionModul('abc123');
  assertEqual(versionAusModul(text), 'abc123');
  assertEqual(versionAusModul('kein Modul'), null);
  assertEqual(versionAusModul(null), null);
});

test('version.erzeugterBlock: jede Modul-URL, jede Bibliothek und das Stylesheet tragen die Marke', () => {
  const block = erzeugterBlock(['app.js', 'views/tables.js', 'metrics.js'], ['lib/xlsx.full.min.js'], 'v1');
  // Die Import-Map bildet aufgelöste URLs ab – deshalb reicht ein Eintrag je Datei, ohne einen import anzufassen
  assert(block.includes('"./views/tables.js": "./views/tables.js?v=v1"'), block);
  assert(block.includes('href="styles.css?v=v1"'), 'Stylesheet');
  assert(block.includes('src="lib/xlsx.full.min.js?v=v1"'), 'Bibliothek');
  // Das Einstiegsmodul ist keine Modul-URL im Sinn der Map und braucht die Marke am src selbst
  assert(block.includes('<script type="module" src="app.js?v=v1">'), 'Einstieg');
  const mapStart = block.indexOf('<script type="importmap">');
  assert(mapStart >= 0 && mapStart < block.indexOf('type="module"'), 'die Map muss vor dem ersten Modul stehen');
  assert(block.startsWith(MARKE_START) && block.trim().endsWith(MARKE_ENDE), 'Marken aussen');
  assert(JSON.parse(block.slice(block.indexOf('{', mapStart), block.lastIndexOf('}') + 1)).imports['./app.js'] === './app.js?v=v1',
    'die Map ist gültiges JSON');
});

test('version.inHtmlEinsetzen: ersetzt genau den erzeugten Bereich und bleibt beim zweiten Lauf gleich', () => {
  const html = '<head>\n  <title>x</title>\n  ' + MARKE_START + '\n  <p>alt</p>\n  ' + MARKE_ENDE + '\n</head>\n';
  const neu = inHtmlEinsetzen(html, MARKE_START + '\n  <p>neu</p>\n  ' + MARKE_ENDE);
  assert(neu.includes('<title>x</title>'), 'was daneben steht, bleibt');
  assert(neu.includes('<p>neu</p>') && !neu.includes('<p>alt</p>'), neu);
  assertEqual(inHtmlEinsetzen(neu, MARKE_START + '\n  <p>neu</p>\n  ' + MARKE_ENDE), neu, 'zweiter Lauf ändert nichts');
  let fehler = null;
  try { inHtmlEinsetzen('<head></head>', 'x'); } catch (e) { fehler = e.message; }
  assert(fehler && /Marken fehlen/.test(fehler), 'ohne Marken ein harter Fehler statt stillem Nichtstun: ' + fehler);
});
