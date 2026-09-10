// tests/chart.test.js – Achsenberechnung des Liniendiagramms (Paket B, B1). Reine Funktionen, kein DOM.
// Von null zu rechnen drängt Quoten, die real zwischen 66 % und 100 % liegen, ins obere Drittel und verdeckt jede
// Bewegung. Für Balken gilt das Gegenteil – renderBarChart rechnet weiter von null (siehe Test unten).
import { test, assert, assertEqual } from './runner.js';
import { autoYMin, yTicks, endLabelGutter } from '../views/chart.js';

const reihe = (values) => [{ label: 'Reihe', points: values.map((y, i) => ({ x: String(2018 + i), y, n: 10, small: false })) }];

test('chart.autoYMin: der Wertebereich bestimmt den Achsenbeginn, abgerundet auf 5 % (B1)', () => {
  assertEqual(autoYMin(reihe([0.66, 0.72, 0.81, 1.0])), 0.65, 'Werte 66–100 % → Achse ab 65 %, nicht ab 0');
  assertEqual(autoYMin(reihe([0.02, 0.5, 0.98])), 0, 'Werte 2–98 % → Achse ab 0');
  assertEqual(autoYMin(reihe([0.65, 0.9])), 0.65, 'ein Wert genau auf der Stufe bleibt auf der Stufe');
  assertEqual(autoYMin(reihe([0.6499, 0.9])), 0.6, 'knapp darunter rundet auf die nächste Stufe ab');
});

test('chart.autoYMin: mindestens 10 pp Spanne, nie über yMax, nie unter 0 (B1)', () => {
  assertEqual(autoYMin(reihe([0.98, 0.99, 1.0])), 0.9, 'enge Reihe wird auf 10 pp Spanne aufgezogen');
  assertEqual(autoYMin(reihe([0.5, 0.5])), 0.5, 'konstante Reihe: Achse auf dem Wert, Spanne bis yMax');
  assertEqual(autoYMin(reihe([0.9]), 0.95), 0.85, 'kleineres yMax zieht den Beginn mit');
  assertEqual(autoYMin(reihe([0.02]), 0.05), 0, 'nie unter 0');
});

test('chart.autoYMin: fehlende und ungültige Werte zählen nicht, ohne Werte Achse ab 0 (B1)', () => {
  assertEqual(autoYMin(reihe([null, 0.8, undefined, 0.9])), 0.8, 'Lücken werden übersprungen');
  assertEqual(autoYMin(reihe([null, null])), 0, 'keine Werte → 0');
  assertEqual(autoYMin([]), 0, 'keine Reihen → 0');
  assertEqual(autoYMin(reihe([Number.NaN, 0.75])), 0.75, 'NaN zählt nicht');
});

test('chart.yTicks: erster Tick ist der Achsenbeginn, darüber runde Vielfache, höchstens sechs Abschnitte (B1)', () => {
  assertEqual(yTicks(0.65, 1).join(','), '0.65,0.7,0.8,0.9,1', 'Achse ab 65 %, Gitter in Zehnteln');
  assertEqual(yTicks(0, 1).join(','), '0,0.2,0.4,0.6,0.8,1', 'volle Skala in Fünfteln');
  assertEqual(yTicks(0.9, 1).join(','), '0.9,0.95,1', 'enge Spanne in 5-%-Schritten');
  for (const [min, max] of [[0.65, 1], [0, 1], [0.9, 1], [0.3, 1], [0.5, 0.8]]) {
    const t = yTicks(min, max);
    assertEqual(t[0], min, 'erster Tick ist der Achsenbeginn (' + min + '–' + max + ')');
    assert(t.length <= 7, 'höchstens sieben Linien (' + min + '–' + max + '): ' + t.join(','));
    assert(t[t.length - 1] <= max + 1e-9, 'kein Tick über yMax (' + min + '–' + max + ')');
    assert(t.every((v, i) => i === 0 || v > t[i - 1]), 'aufsteigend (' + min + '–' + max + ')');
  }
});

// Paket B (B2): Der Rand rechts trug 250 von 820 Einheiten – 30 % der Zeichenfläche – für Endbeschriftungen, die den
// Reihennamen wiederholten, den die Legende darunter ohnehin nennt. Er richtet sich jetzt nach der Länge der Werte.
test('chart.endLabelGutter: Rand rechts folgt der längsten Endbeschriftung (B2)', () => {
  const alt = 250;
  const g = endLabelGutter(['100 %', '75 %', '64 %']);
  assert(g < alt / 2, 'deutlich schmaler als die früheren ' + alt + ' Einheiten (jetzt ' + g + ')');
  assertEqual(g, endLabelGutter(['100 %']), 'die längste Beschriftung bestimmt den Rand');
  assert(endLabelGutter(['100.0 %']) > g, 'eine Dezimale mehr braucht mehr Rand');
  assertEqual(endLabelGutter([]), 24, 'ohne Endbeschriftung nur der Rand gegen Überlauf');
  assertEqual(endLabelGutter(['', null, undefined]), 24, 'leere Werte zählen nicht');
});

test('chart.endLabelGutter: die Plotbreite wächst messbar (B2)', () => {
  const breite = 820;
  const links = 48;
  const vorher = breite - links - 250;
  const nachher = breite - links - endLabelGutter(['100 %', '75 %']);
  assert(nachher > vorher * 1.25, 'mindestens ein Viertel mehr Plotbreite: ' + vorher + ' → ' + nachher);
});
