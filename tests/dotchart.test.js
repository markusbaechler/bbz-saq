// tests/dotchart.test.js – Modell des Profil-Punktdiagramms (Paket MESSZEILE, M2). Reine Funktion, kein DOM.
// Die ganze Ablesung hängt an einer Frage: Berührt der Wilson-Balken die Linie auf dem Gesamtwert oder nicht?
import { test, assert, assertEqual } from './runner.js';
import { dotChartModel } from '../views/chart.js';
import { wilsonInterval } from '../metrics.js';

const punkt = (label, pct, n, extra = {}) => ({ label, pct, n, ...extra });
const mitIv = (label, count, n) => {
  const iv = wilsonInterval(count, n);
  return { label, pct: count / n, n, low: iv.low, high: iv.high, small: n < 5 };
};

test('dotchart: Achse folgt dem Wertebereich, Referenz und Punkte liegen darauf', () => {
  const m = dotChartModel([punkt('PK', 0.88, 640), punkt('KMU', 0.72, 302)], { referenz: { pct: 0.814, label: 'Gesamt' } });
  assertEqual(m.xMin, 0.7, 'kleinster Wert 72 % → Achse ab 70 %, nicht ab 0');
  assertEqual(m.ticks[0], 0.7);
  assertEqual(m.xMax, 1);
  assertEqual(Math.round(m.zeilen[0].x), 60, 'PK bei (0.88 − 0.7) / 0.3');
  assertEqual(Math.round(m.zeilen[1].x), 7);
  assertEqual(Math.round(m.referenz.x), 38);
});

test('dotchart: gesichert heisst, das Intervall enthält den Gesamtwert nicht – unten wie oben', () => {
  const m = dotChartModel([mitIv('KMU', 219, 302), mitIv('PK', 564, 640), mitIv('IK', 41, 50)], { referenz: { pct: 0.814, label: 'Gesamt' } });
  const nach = Object.fromEntries(m.zeilen.map((z) => [z.label, z]));
  assertEqual(nach.KMU.gesichert, true, '72.5 % mit n = 302 liegt gesichert unter 81.4 %');
  assertEqual(nach.PK.gesichert, true, '88.1 % mit n = 640 liegt gesichert darüber');
  assertEqual(nach.IK.gesichert, false, '82.0 % mit n = 50 – das Intervall überlappt den Gesamtwert');
  // Die Beschriftung sagt es in Worten, nicht nur über die Grafik
  assert(/n = 302 · −8\.9 pp · gesichert/.test(nach.KMU.text), nach.KMU.text);
  assert(/n = 50 · \+0\.6 pp$/.test(nach.IK.text), nach.IK.text);
});

test('dotchart: ohne Referenz keine Differenz und nichts «gesichert»', () => {
  const m = dotChartModel([mitIv('KMU', 219, 302)], {});
  assertEqual(m.referenz, null);
  assertEqual(m.zeilen[0].diffPp, null);
  assertEqual(m.zeilen[0].gesichert, false);
  assertEqual(m.zeilen[0].text, 'n = 302');
});

test('dotchart: kleine Gruppe bleibt drin und wird markiert; Punkte ohne Wert fallen weg', () => {
  const m = dotChartModel([mitIv('Klein', 3, 4), punkt('Ohne Wert', null, 12), mitIv('Gross', 500, 600)], { referenz: { pct: 0.8, label: 'Gesamt' } });
  assertEqual(m.zeilen.length, 2, 'nur der Punkt ohne Wert fällt weg');
  const klein = m.zeilen.find((z) => z.label === 'Klein');
  assertEqual(klein.small, true);
  assert(/\*$/.test(klein.text), 'kleine Gruppe trägt die Marke: «' + klein.text + '»');
  assertEqual(klein.gesichert, false, 'bei n = 4 ist das Intervall zu breit für eine gesicherte Aussage');
});

test('dotchart: Intervall ausserhalb der Achse wird geklemmt, nicht abgeschnitten', () => {
  const m = dotChartModel([mitIv('Rand', 1, 6)], { referenz: { pct: 0.9, label: 'Gesamt' } });
  const z = m.zeilen[0];
  assert(z.intervall.von >= 0 && z.intervall.bis <= 100, 'Balken bleibt im Plot: ' + JSON.stringify(z.intervall));
  assertEqual(m.xMin, 0, 'ein Wert bei 16.7 % zieht die Achse auf 0');
});
