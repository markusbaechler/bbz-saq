// tests/regeln.test.js – compareRules() aus tools/regeln-abgleich.js (reine Funktion, kein Dateizugriff).
// CLAUDE.md und AGENTS.md tragen dieselben Projektregeln; welche ein Agent liest, hängt vom Harness ab. Der Abgleich
// der echten Dateien läuft im CI-Job «tests» über «node tools/regeln-abgleich.js».
import { test, assertEqual } from './runner.js';
import { compareRules } from '../tools/regeln-abgleich.js';

const REGELN = ['', '## Unverhandelbar', '1. Struktur nie ändern.', ''];
const CLAUDE = ['# CLAUDE.md – Projektregeln bbz-saq'].concat(REGELN).join('\n');
const AGENTS = ['# AGENTS.md – Projektregeln bbz-saq'].concat(REGELN).join('\n');

test('regeln.compareRules: nur die Titelzeile darf abweichen', () => {
  assertEqual(compareRules(CLAUDE, AGENTS).length, 0, 'gleiche Regeln, andere Titelzeile');
  const geaendert = compareRules(CLAUDE, AGENTS.replace('nie ändern', 'manchmal ändern'));
  assertEqual(geaendert.length, 1, 'geänderte Regel fällt auf');
  assertEqual(geaendert[0].line, 4, 'Zeilennummer der Datei (1-basiert)');
  assertEqual(geaendert[0].b, '1. Struktur manchmal ändern.', 'beide Fassungen im Befund');
});

// Der Vergleich ist zeilenweise nach Position, kein Diff: Eine weggelassene Zeile verschiebt alle folgenden und ergibt
// deshalb mehrere Befunde. Das genügt hier – gemeldet werden soll, dass die Dateien auseinanderlaufen, nicht wie wenig.
test('regeln.compareRules: fehlende und zusätzliche Zeilen, Zeilenenden vereinheitlicht', () => {
  const kurz = compareRules(CLAUDE, ['# AGENTS.md – Projektregeln bbz-saq', '', '## Unverhandelbar', ''].join('\n'));
  assertEqual(kurz[0].line, 4, 'ab der weggelassenen Regel');
  assertEqual(kurz[0].a, '1. Struktur nie ändern.', 'die fehlende Regel wird genannt');
  assertEqual(kurz[kurz.length - 1].b, undefined, 'die kürzere Datei endet früher');
  assertEqual(compareRules(CLAUDE, AGENTS + 'zusätzlich').length, 1, 'zusätzliche Zeile fällt auf');
  assertEqual(compareRules(CLAUDE, AGENTS.split('\n').join('\r\n')).length, 0, 'CRLF ändert nichts');
});
