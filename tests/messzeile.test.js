// tests/messzeile.test.js – Modell der Messzeile (Paket MESSZEILE, M1). Reine Funktion: Modell rein, Zahlen raus,
// kein DOM. Geprüft werden die Randfälle, an denen eine gemeinsame Skala sonst lügt: keine Vorgänge, ein einziges
// Jahr, ein Wert unter dem Skalenbeginn und eine Quote ohne Zähler (also ohne Intervall).
import { test, assert, assertEqual } from './runner.js';
import { messzeileModell, MESSZEILE_MIN, MESSZEILE_DELTA_TON_PP, MESSZEILE_JAHRE_MIN } from '../views/common.js';
import { SMALL_N, wilsonInterval } from '../metrics.js';

const jahr = (year, pct, n = 20) => ({ year, pct, n });
// Das laufende Jahr steht in den Tests ausdrücklich: Ein Test, der vom Datum des Laufs abhängt, ist keiner.
const JETZT = 2026;
const modell = (eingabe) => messzeileModell({ laufendesJahr: JETZT, ...eingabe });

test('messzeile: Normalfall – Wert, Intervall aus metrics, Verlauf, letztes Jahr, Delta gegen das Jahr davor', () => {
  const m = modell({
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
  const m = modell({ label: 'Mündlich, 1. Versuch bestanden', count: 0, n: 0 });
  assertEqual(m.wert.text, '–');
  assertEqual(m.wert.pct, null);
  assertEqual(m.intervall, null);
  assertEqual(m.skala.pos, null);
  assertEqual(m.verlauf, null);
  assertEqual(m.letztesJahr, null);
  assertEqual(m.delta, null);
  assertEqual(m.klein, false); // ohne Vorgänge ist die Gruppe nicht «klein», sondern leer
  // Seit Paket OPTIK (O4) nennt auch das gesprochene Label Zähler UND Nenner – wie die sichtbare Spalte
  // «Anzahl». Vorher stand dort «n gleich 0», also nur der Nenner; genau die Doppeldeutigkeit, die an jeder
  // anderen Stelle schon behoben war.
  assert(/kein Wert/.test(m.ariaLabel) && /0 von 0/.test(m.ariaLabel), m.ariaLabel);
  assertEqual(m.anzahl, '0 von 0', 'sichtbare Spalte und gesprochenes Label sagen dasselbe');
});

test('messzeile: ein einziges Jahr – keine Sparkline, kein Delta, aber der Wert bleibt', () => {
  const m = modell({ label: 'Nur ein Jahr', count: 9, n: 12, jahre: [jahr(2024, 0.75)] });
  assertEqual(m.wert.text, '75.0 %');
  assertEqual(m.verlauf, null, 'unter ' + MESSZEILE_JAHRE_MIN + ' Jahren keine Sparkline');
  assertEqual(m.delta, null, 'ein Jahr hat kein Vorjahr');
  assertEqual(m.letztesJahr.year, 2024);
  // Zwei Jahre ergeben ein Delta, aber weiterhin keine Sparkline
  const zwei = modell({ label: 'Zwei Jahre', count: 9, n: 12, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(zwei.verlauf, null);
  assertEqual(zwei.delta.pp, -5);
  // Jahre unter der Mindestgruppengrösse zählen nicht mit
  const klein = modell({ label: 'Kleine Jahre', count: 9, n: 12, jahre: [jahr(2022, 0.9, SMALL_N - 1), jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(klein.verlauf, null, 'zwei auswertbare Jahre reichen nicht für den Verlauf');
  assertEqual(klein.delta.gegen, 2023);
});

test('messzeile: Wert unter dem Skalenbeginn – am Anschlag statt abgeschnitten, und die Zeile sagt es', () => {
  const m = modell({ label: 'Unter der Skala', count: 12, n: 40 }); // 30 %
  assertEqual(m.wert.text, '30.0 %', 'der Wert selbst wird nie beschnitten');
  assertEqual(m.skala.pos, 0);
  assertEqual(m.skala.anschlag, true);
  assert(m.intervall.von >= 0 && m.intervall.bis <= 100, 'auch der Balken bleibt in der Spur');
  assert(/unter 50 %, am Anschlag der Spur/.test(m.ariaLabel), m.ariaLabel);
  // Genau auf der Grenze ist kein Anschlag
  const grenze = modell({ label: 'Genau 50 %', count: 20, n: 40 });
  assertEqual(grenze.wert.pct, MESSZEILE_MIN);
  assertEqual(grenze.skala.anschlag, false);
  assertEqual(grenze.skala.pos, 0);
});

test('messzeile: eigene Spur je Block – Durchfallquoten liegen auf 0 bis 50 %', () => {
  const skala = { min: 0, max: 0.5 };
  const m = modell({ label: 'Im 1. Versuch durchgefallen', count: 191, n: 977, richtung: 'down', skala });
  assertEqual(m.wert.text, '19.5 %');
  assertEqual(Math.round(m.skala.pos), 39, '19.5 % von 0–50 % liegt bei 39 % der Spur');
  assertEqual([m.skala.min, m.skala.max], [0, 0.5]);
  assertEqual(m.skala.anschlag, false);
  assertEqual(m.anzahl, '191 von 977', 'Zähler und Grundgesamtheit, nicht nur der Nenner');
  // Auch nach oben wird geklemmt statt abgeschnitten, und die Zeile sagt es
  const hoch = modell({ label: 'Mehr als die Hälfte', count: 60, n: 100, richtung: 'down', skala });
  assertEqual(hoch.skala.pos, 100);
  assertEqual(hoch.skala.anschlagOben, true);
  assertEqual(hoch.skala.anschlagText, 'über 50 %');
  assert(/über 50 %, am Anschlag der Spur/.test(hoch.ariaLabel), hoch.ariaLabel);
  // Das Intervall wird auf dieselbe Spur gerechnet
  assert(m.intervall.von > 30 && m.intervall.bis < 50, JSON.stringify(m.intervall));
});

test('messzeile: Quote ohne Zähler – Punkt ja, Intervall nein; Referenzmarke und Ton nach Richtung', () => {
  const m = modell({ label: 'Ø Resultat', pct: 0.78, n: 120, referenz: { pct: 0.82, label: 'Benchmark: alle Banken' } });
  assertEqual(m.wert.text, '78.0 %');
  assertEqual(m.intervall, null, 'ohne Zähler kein Wilson-Intervall');
  assertEqual(Math.round(m.skala.pos), 56);
  assertEqual(Math.round(m.referenz.pos), 64);
  assert(/kein Intervall/.test(m.ariaLabel) && /Benchmark: alle Banken/.test(m.ariaLabel), m.ariaLabel);
  // Ton erst ab der Schwelle, und die Richtung dreht ihn um
  const leise = modell({ label: 'Rauschen', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.819)] });
  assertEqual(leise.delta.pp, 1.9);
  assertEqual(leise.delta.ton, 'neutral', 'unter ' + MESSZEILE_DELTA_TON_PP + ' pp bleibt es neutral');
  const runter = modell({ label: 'Tiefer ist besser', richtung: 'down', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(runter.delta.ton, 'pos');
  const ohne = modell({ label: 'Ohne Richtung', richtung: 'neutral', count: 50, n: 100, jahre: [jahr(2023, 0.8), jahr(2024, 0.75)] });
  assertEqual(ohne.delta.ton, 'neutral');
});

test('messzeile: Abstand zum Benchmark als eigenes Feld, Ton nach der Regel der Kacheln (0.5 pp)', () => {
  const m = modell({ label: 'Mit Benchmark', count: 847, n: 1000, referenz: { pct: 0.81, label: 'Benchmark: Testbank' } });
  assertEqual(m.benchmark.pp, 3.7);
  assertEqual(m.benchmark.text, '▲ +3.7 pp');
  assertEqual(m.benchmark.ton, 'pos');
  assert(/Abstand plus 3\.7 Prozentpunkte/.test(m.ariaLabel), m.ariaLabel);
  // Unter 0.5 pp neutral – dieselbe Schwelle wie auf den Kacheln und in der Vergleichstabelle
  const knapp = modell({ label: 'Knapp', count: 812, n: 1000, referenz: { pct: 0.81, label: 'Benchmark' } });
  assertEqual(knapp.benchmark.pp, 0.2);
  assertEqual(knapp.benchmark.ton, 'neutral');
  assertEqual(knapp.benchmark.text, '● +0.2 pp'); // formatPp setzt das Vorzeichen, das Symbol trägt die Wertung
  // «Tiefer ist besser» dreht den Ton; ohne Referenz gibt es das Feld nicht
  const runter = modell({ label: 'Durchfall', count: 847, n: 1000, richtung: 'down', referenz: { pct: 0.81, label: 'Benchmark' } });
  assertEqual(runter.benchmark.ton, 'neg');
  assertEqual(modell({ label: 'Ohne', count: 5, n: 10 }).benchmark, null);
});

test('messzeile: das laufende Jahr ist kein Vergleichsjahr – es ist unfertig', () => {
  const reihe = [jahr(2023, 0.90), jahr(2024, 0.88), jahr(2025, 0.86), jahr(2026, 0.69)];
  const m = modell({ label: 'Mit laufendem Jahr', count: 847, n: 1000, jahre: reihe });
  // «Letztes Jahr» ist das jüngste abgeschlossene Jahr, nicht das angefangene
  assertEqual(m.letztesJahr.year, 2025);
  assertEqual(m.letztesJahr.text, '86.0 %');
  assertEqual(m.delta.gegen, 2024, 'das Delta rechnet 2025 gegen 2024');
  assertEqual(m.delta.pp, -2, 'nicht −17 pp gegen das unfertige 2026');
  // Im Verlauf bleibt das laufende Jahr sichtbar, aber als offener Punkt
  assertEqual(m.verlauf.jahre, 4);
  assertEqual(m.verlauf.laufend, true);
  assertEqual(m.verlauf.punkte.map((p) => p.laufend), [false, false, false, true]);
  assert(/laufende Jahr 2026 ist unvollständig/.test(m.ariaLabel), m.ariaLabel);
  // Ohne abgeschlossenes Jahr gibt es weder letztes Jahr noch Delta – erfunden wird nichts
  const nurLaufend = modell({ label: 'Nur laufendes Jahr', count: 8, n: 10, jahre: [jahr(2026, 0.8)] });
  assertEqual(nurLaufend.letztesJahr, null);
  assertEqual(nurLaufend.delta, null);
});

test('messzeile: kleine Gruppe wird gekennzeichnet, nicht verschwiegen', () => {
  const m = modell({ label: 'Kleine Gruppe', count: 3, n: SMALL_N - 1 });
  assertEqual(m.klein, true);
  assert(/kleine Gruppe/.test(m.ariaLabel), m.ariaLabel);
  assert(m.intervall !== null, 'das Intervall wird gerade dann gezeigt, wenn n klein ist');
});
