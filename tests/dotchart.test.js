// tests/dotchart.test.js – Modell des Profil-Punktdiagramms (Paket MESSZEILE, M2). Reine Funktion, kein DOM.
// Die ganze Ablesung hängt an einer Frage: Berührt der Wilson-Balken die Linie auf dem Gesamtwert oder nicht?
import { test, assert, assertEqual } from './runner.js';
import { dotChartModel } from '../views/chart.js';
import { wilsonInterval } from '../metrics.js';

const punkt = (label, pct, n, extra = {}) => ({ label, pct, n, ...extra });
const mitIv = (label, count, n) => {
  const iv = wilsonInterval(count, n);
  // count gehört zum Punkt, seit der Satz je Zeile «59 von 132» nennt statt nur «n = 132» (P4)
  return { label, pct: count / n, count, n, low: iv.low, high: iv.high, small: n < 5 };
};

test('dotchart: Achse beginnt bei 0 und endet über dem grössten Wert, Referenz und Punkte liegen darauf', () => {
  const m = dotChartModel([punkt('PK', 0.88, 640), punkt('KMU', 0.72, 302)], { referenz: { pct: 0.814, label: 'Gesamt' } });
  assertEqual(m.xMin, 0, 'gemeinsamer Nullpunkt wie in der Messzeile – nicht der Wertebereich');
  assertEqual(m.ticks[0], 0);
  assertEqual(m.xMax, 0.9, 'grösster Wert 88 % → nächste 5-%-Stufe echt darüber (P2)');
  assertEqual(Math.round(m.zeilen[0].x), 98, 'PK bei 0.88 / 0.9');
  assertEqual(Math.round(m.zeilen[1].x), 80);
  assertEqual(Math.round(m.referenz.x), 90);
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

test('dotchart: die Richtung sagt, ob ein gesicherter Abstand gut oder schlecht ist (Paket I, P1)', () => {
  const punkte = [mitIv('Viel Durchfall', 219, 302), mitIv('Wenig Durchfall', 60, 302)];
  const ref = { pct: 0.5, label: 'Gesamt' };
  // Durchfallquote: tiefer ist besser – ein Plus ist die schlechte Nachricht
  const runter = dotChartModel(punkte, { referenz: ref, richtung: 'down' });
  const viel = runter.zeilen[0];
  const wenig = runter.zeilen[1];
  assertEqual([viel.gesichert, viel.bewertung], [true, 'ungünstig']);
  assertEqual([wenig.gesichert, wenig.bewertung], [true, 'günstig']);
  assert(/· gesichert ungünstig$/.test(viel.text), viel.text);
  assert(/· gesichert günstig$/.test(wenig.text), wenig.text);
  // Bestehensquote: höher ist besser – dieselbe Zahl, umgekehrte Wertung
  const hoch = dotChartModel(punkte, { referenz: ref, richtung: 'up' });
  assertEqual([hoch.zeilen[0].bewertung, hoch.zeilen[1].bewertung], ['günstig', 'ungünstig']);
  // Ohne Richtung keine Wertung – etwa bei den Experten, wo nicht gewertet wird (E9)
  const neutral = dotChartModel(punkte, { referenz: ref, richtung: 'neutral' });
  assertEqual(neutral.zeilen[0].bewertung, null);
  assert(/· gesichert$/.test(neutral.zeilen[0].text), neutral.zeilen[0].text);
  // Unter 0.5 pp keine Wertung – dieselbe Schwelle wie bei den Kacheln und in der Vergleichstabelle
  const knapp = dotChartModel([mitIv('Knapp', 151, 302)], { referenz: { pct: 0.5, label: 'Gesamt' }, richtung: 'down' });
  assertEqual(knapp.zeilen[0].bewertung, null);
  // Ein nicht gesicherter Abstand trägt das Wort nicht – «gesichert» und die Wertung gehören zusammen
  const unsicher = dotChartModel([mitIv('Klein', 3, 4)], { referenz: ref, richtung: 'down' });
  assertEqual(unsicher.zeilen[0].gesichert, false);
  assert(!/günstig/.test(unsicher.zeilen[0].text), unsicher.zeilen[0].text);
});

// P4: Jede Zeile trägt ihren eigenen Satz – Mouseover-Text und Name im Accessibility-Baum in einem. Vorher hing
// ein einziger <title> am SVG, und alle sechs Gruppen zeigten denselben Text: den Titel des Diagramms.
test('dotchart: der Satz je Zeile nennt Gruppe, Quote, Zähler MIT Nenner, Intervall, Abstand und ob er gesichert ist', () => {
  const m = dotChartModel([mitIv('IK', 59, 132)], { referenz: { pct: 178 / 952, label: 'Gesamt' }, richtung: 'down' });
  assertEqual(m.zeilen[0].titel,
    'IK · 44.7 % · 59 von 132 Vorgängen · 95-%-Intervall 36.5 bis 53.2 % · +26.0 pp gegenüber Gesamt 18.7 % · gesichert ungünstig');
});

test('dotchart: der Satz lässt weg, was nicht dasteht – und zählt richtig in der Einzahl', () => {
  // Ohne Bezugslinie gibt es keinen Abstand und damit auch kein «gesichert» – das wäre eine Aussage ohne Bezug
  const ohneRef = dotChartModel([mitIv('WE1', 8, 52)]);
  assertEqual(ohneRef.zeilen[0].titel, 'WE1 · 15.4 % · 8 von 52 Vorgängen · 95-%-Intervall 8.0 bis 27.5 %');
  // Ohne Zähler bleibt nur der Nenner; die Kurzform ist dann ausdrücklich als n gekennzeichnet
  const ohneCount = dotChartModel([punkt('PK', 0.13, 600)]);
  assertEqual(ohneCount.zeilen[0].titel, 'PK · 13.0 % · n = 600');
  // «0 von 1 Vorgängen» ist falsches Deutsch; die Einheit kommt aus dem Punkt (Experten zählen Einsätze)
  const eins = dotChartModel([{ label: 'Neu', pct: 0, count: 0, n: 1, small: true }]);
  assertEqual(eins.zeilen[0].titel, 'Neu · 0.0 % · 0 von 1 Vorgang · Gruppe mit n < 5');
  const experte = dotChartModel([{ label: 'E1', pct: 0.5, count: 1, n: 2, unit: 'Einsätzen', unitSg: 'Einsatz' },
    { label: 'E2', pct: 1, count: 1, n: 1, unit: 'Einsätzen', unitSg: 'Einsatz' }]);
  assert(/1 von 2 Einsätzen/.test(experte.zeilen[0].titel), experte.zeilen[0].titel);
  assertEqual(experte.zeilen[1].titel, 'E2 · 100.0 % · 1 von 1 Einsatz');
});

test('dotchart: kleine Gruppen und neutrale Richtung im Satz je Zeile', () => {
  const klein = dotChartModel([mitIv('Neu', 2, 4)], { referenz: { pct: 0.2, label: 'Gesamt' }, richtung: 'down' });
  assert(/· Gruppe mit n < 5$/.test(klein.zeilen[0].titel), 'die kleine Gruppe wird benannt, nicht weggelassen: ' + klein.zeilen[0].titel);
  assert(/nicht gesichert/.test(klein.zeilen[0].titel), 'bei n = 4 ist nichts gesichert: ' + klein.zeilen[0].titel);
  // Neutral (Experten, E9): gesichert ja, aber ohne Wertung – hier werden Menschen verglichen
  const neutral = dotChartModel([mitIv('E1', 59, 132)], { referenz: { pct: 0.187, label: 'Alle Experten' }, richtung: 'neutral' });
  assert(/· gesichert$/.test(neutral.zeilen[0].titel), 'gesichert ohne Wertung: ' + neutral.zeilen[0].titel);
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

// P2: Die Achse wird aus DEN GLEICHEN Werten gebaut, gegen die sie gelesen wird. Vorher endete sie fest bei 100 %;
// ein Balken darüber hinaus wurde geklemmt und sah aus, als endete er genau am Rand.
test('dotchart: das Intervallende bestimmt die Achse, nicht nur der Punkt', () => {
  const m = dotChartModel([mitIv('Klein', 1, 8)]);
  assertEqual(m.xMax, 0.5, 'Punkt bei 12.5 %, Intervall bis 47.1 % → Achse bis 50 %');
  const z = m.zeilen[0];
  assert(z.intervall.bis < 100, 'das Ende liegt echt im Plot, nichts wird geklemmt: ' + JSON.stringify(z.intervall));
});

test('dotchart: die Bezugslinie zieht die Achse mit, wenn sie über allen Punkten liegt', () => {
  const m = dotChartModel([mitIv('Rand', 1, 6)], { referenz: { pct: 0.9, label: 'Gesamt' } });
  assertEqual(m.xMax, 0.95, 'Gesamtwert 90 % → Achse bis 95 %, sonst klebte die Linie am Rand');
  assert(m.referenz.x < 100, 'die Linie steht im Plot, nicht auf dem Rahmen: ' + m.referenz.x);
  const z = m.zeilen[0];
  assert(z.intervall.von >= 0 && z.intervall.bis <= 100, 'Balken bleibt im Plot: ' + JSON.stringify(z.intervall));
});

test('dotchart: mindestens 10 pp Spanne, und bei 100 % endet die Achse bei 100 %', () => {
  const winzig = dotChartModel([punkt('A', 0.004, 900), punkt('B', 0.007, 900)]);
  assertEqual(winzig.xMax, 0.1, 'zwei Werte unter 1 % ergäben sonst eine Achse bis 5 % – Rauschen als Balken');
  const voll = dotChartModel([punkt('Alle', 1, 3)]);
  assertEqual(voll.xMax, 1, 'über 100 % gibt es nichts; nur hier darf der Punkt auf dem Rand liegen');
  assertEqual(Math.round(voll.zeilen[0].x), 100);
});
