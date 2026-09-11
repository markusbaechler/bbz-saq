// tests/messzeile.test.js – Modell der Messzeile (Paket MESSZEILE, M1). Reine Funktion: Modell rein, Zahlen raus,
// kein DOM. Geprüft werden die Randfälle, an denen eine gemeinsame Skala sonst lügt: keine Vorgänge, ein einziges
// Jahr, ein Wert unter dem Skalenbeginn und eine Quote ohne Zähler (also ohne Intervall).
import { test, assert, assertEqual } from './runner.js';
import { messzeileModell, MESSZEILE_MIN, MESSZEILE_DELTA_TON_PP, MESSZEILE_JAHRE_MIN } from '../views/common.js';
import { SMALL_N, wilsonInterval } from '../metrics.js';

const jahr = (year, pct, n = 20) => ({ year, pct, n });

test('messzeile: Normalfall – Wert, Intervall aus metrics, Verlauf, letztes Jahr, Delta gegen das Jahr davor', () => {
  const m = messzeileModell({
    label: 'Schriftlich, 1. Versuch bestanden',
    count: 847, n: 1000,
    jahre: [jahr(2021, 0.9), jahr(2022, 0.88), jahr(2023, 0.86), jahr(2024, 0.822)],
  });
  assertEqual(m.wert.text, '84.7 %');
  assertEqual(m.n, 1000);
  assertEqual(m.klein, false);
  // Das Intervall wird nicht neu gerechnet, sondern aus metrics.js übernommen
  const iv = wilsonInterval(847, 1000);
  assertEqual(m.intervall.low, iv.low);
  assertEqual(m.intervall.high, iv.high);
  assert(/^±\d+\.\d pp$/.test(m.intervall.text), 'Intervalltext «' + m.intervall.text + '»');
  // Skala: 50–100 %, 84.7 % liegt bei (0.847 − 0.5) / 0.5 = 69.4 %
  assertEqual(Math.round(m.skala.pos * 10) / 10, 69.4);
  assertEqual(m.skala.anschlag, false);
  assertEqual(m.verlauf.jahre, 4);
  assertEqual(m.verlauf.punkte[0].x, 0);
  assertEqual(m.verlauf.punkte[3].x, 100);
  assertEqual(m.letztesJahr.year, 2024);
  assertEqual(m.letztesJahr.text, '82.2 %');
  assertEqual(m.delta.pp, -3.8);
  assertEqual(m.delta.gegen, 2023);
  assertEqual(m.delta.ton, 'neg'); // höher ist besser, also ist ein Rückgang ungünstig
  assert(/^▼ −3\.8 pp$/.test(m.delta.text), 'Deltatext «' + m.delta.text + '»');
});

test('messzeile: n = 0 – kein Wert, kein Intervall, kein Punkt auf der Skala, aria-label sagt es', () => {
  const m = messzeileModell({ label: 'Mündlich, 1. Versuch bestanden', count: 0, n: 0 });
  assertEqual(m.wert.text, '–');
  assertEqual(m.wert.pct, null);
  assertEqual(m.intervall, null);
  assertEqual(m.skala.pos, null);
  assertEqual(m.verlauf, null);
  assertEqual(m.letztesJahr, null);
  assertEqual(m.delta, null);
  assertEqual(m.klein, false); // ohne Vorgänge ist die Gruppe nicht «klein», sondern leer
  assert(/kein Wert/.test(m.ariaLabel) && /n gleich 0/.test(m.ariaLabel), m.ariaLabel);
});

test('messzeile: ein einziges Jahr – keine Sparkline, kein Delta, aber der Wert bleibt', () => {
  const m = messzeileModell({ label: 'Nur ein Jahr', count: 9, n: 12, jahre: [jahr(2024, 0.75)] });
  assertEqual(m.wert.text, '75.0 %');
  assertEqual(m.verlauf, null, 'unter ' + MESSZEILE_JAHRE_MIN + ' Jahren keine Sparkline');
  assertEqual(m.delta, null, 'ein Jahr hat kein Vorjahr');
  assertEqual(m.letztesJahr.year, 2024);
  // Zwei Jahre ergeben ein Delta, aber weiterhin keine Sparkline
  const zwei = messzeileModell({ label: 'Zwei Jahre', count: 9, n: 12, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(zwei.verlauf, null);
  assertEqual(zwei.delta.pp, -5);
  // Jahre unter der Mindestgruppengrösse zählen nicht mit
  const klein = messzeileModell({ label: 'Kleine Jahre', count: 9, n: 12, jahre: [jahr(2022, 0.9, SMALL_N - 1), jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(klein.verlauf, null, 'zwei auswertbare Jahre reichen nicht für den Verlauf');
  assertEqual(klein.delta.gegen, 2023);
});

test('messzeile: Wert unter dem Skalenbeginn – am Anschlag statt abgeschnitten, und die Zeile sagt es', () => {
  const m = messzeileModell({ label: 'Unter der Skala', count: 12, n: 40 }); // 30 %
  assertEqual(m.wert.text, '30.0 %', 'der Wert selbst wird nie beschnitten');
  assertEqual(m.skala.pos, 0);
  assertEqual(m.skala.anschlag, true);
  assert(m.intervall.von >= 0 && m.intervall.bis <= 100, 'auch der Balken bleibt in der Spur');
  assert(/am linken Anschlag/.test(m.ariaLabel), m.ariaLabel);
  // Genau auf der Grenze ist kein Anschlag
  const grenze = messzeileModell({ label: 'Genau 50 %', count: 20, n: 40 });
  assertEqual(grenze.wert.pct, MESSZEILE_MIN);
  assertEqual(grenze.skala.anschlag, false);
  assertEqual(grenze.skala.pos, 0);
});

test('messzeile: Quote ohne Zähler – Punkt ja, Intervall nein; Referenzmarke und Ton nach Richtung', () => {
  const m = messzeileModell({ label: 'Ø Resultat', pct: 0.78, n: 120, referenz: { pct: 0.82, label: 'Benchmark: alle Banken' } });
  assertEqual(m.wert.text, '78.0 %');
  assertEqual(m.intervall, null, 'ohne Zähler kein Wilson-Intervall');
  assertEqual(Math.round(m.skala.pos), 56);
  assertEqual(Math.round(m.referenz.pos), 64);
  assert(/kein Intervall/.test(m.ariaLabel) && /Benchmark: alle Banken/.test(m.ariaLabel), m.ariaLabel);
  // Ton erst ab der Schwelle, und die Richtung dreht ihn um
  const leise = messzeileModell({ label: 'Rauschen', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.819)] });
  assertEqual(leise.delta.pp, 1.9);
  assertEqual(leise.delta.ton, 'neutral', 'unter ' + MESSZEILE_DELTA_TON_PP + ' pp bleibt es neutral');
  const runter = messzeileModell({ label: 'Tiefer ist besser', richtung: 'down', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(runter.delta.ton, 'pos');
  const ohne = messzeileModell({ label: 'Ohne Richtung', richtung: 'neutral', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(ohne.delta.ton, 'neutral');
});

test('messzeile: Abstand zum Benchmark als eigenes Feld, Ton nach der Regel der Kacheln (0.5 pp)', () => {
  const m = messzeileModell({ label: 'Mit Benchmark', count: 847, n: 1000, referenz: { pct: 0.81, label: 'Benchmark: Testbank' } });
  assertEqual(m.benchmark.pp, 3.7);
  assertEqual(m.benchmark.text, '▲ +3.7 pp');
  assertEqual(m.benchmark.ton, 'pos');
  assert(/Abstand plus 3\.7 Prozentpunkte/.test(m.ariaLabel), m.ariaLabel);
  // Unter 0.5 pp neutral – dieselbe Schwelle wie auf den Kacheln und in der Vergleichstabelle
  const knapp = messzeileModell({ label: 'Knapp', count: 812, n: 1000, referenz: { pct: 0.81, label: 'Benchmark' } });
  assertEqual(knapp.benchmark.pp, 0.2);
  assertEqual(knapp.benchmark.ton, 'neutral');
  assertEqual(knapp.benchmark.text, '● +0.2 pp'); // formatPp setzt das Vorzeichen, das Symbol trägt die Wertung
  // «Tiefer ist besser» dreht den Ton; ohne Referenz gibt es das Feld nicht
  const runter = messzeileModell({ label: 'Durchfall', count: 847, n: 1000, richtung: 'down', referenz: { pct: 0.81, label: 'Benchmark' } });
  assertEqual(runter.benchmark.ton, 'neg');
  assertEqual(messzeileModell({ label: 'Ohne', count: 5, n: 10 }).benchmark, null);
});

test('messzeile: kleine Gruppe wird gekennzeichnet, nicht verschwiegen', () => {
  const m = messzeileModell({ label: 'Kleine Gruppe', count: 3, n: SMALL_N - 1 });
  assertEqual(m.klein, true);
  assert(/kleine Gruppe/.test(m.ariaLabel), m.ariaLabel);
  assert(m.intervall !== null, 'das Intervall wird gerade dann gezeigt, wenn n klein ist');
});
