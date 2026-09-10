// tests/signals.test.js – Signalregeln (Paket D, B-06). Reine Funktionen, deshalb je Regel drei Fälle:
// knapp darunter, knapp darüber und der Randfall. Dazu die Sortierung, die nach Wirkung ordnet und nicht nach Stufe.
import { test, assert, assertEqual } from './runner.js';
import {
  signals, betroffeneVorgaenge, SIGNAL_REGELN, SIGNAL_JAHRE_MIN_N, SIGNAL_JAHRE_MIN, SIGNAL_ABFALL_PP, SIGNAL_PASSIV_ANTEIL, SMALL_N,
} from '../metrics.js';
import { makePerson } from './fixtures.js';

// Ein Vorgang mit schriftlichem Erstversuch im Jahr y: passed bestimmt die Erstversuchsquote.
const we1 = (y, passed, extra = {}) => makePerson({
  we: { 1: [{ passed, date: new Date(y, 5, 1), result: passed ? 0.85 : 0.5 }] },
  weAllPassed: passed, oeAllPassed: passed, ...extra,
});
// n Vorgänge eines Jahres, davon «bestanden» viele im ersten Versuch bestanden
const jahr = (y, n, bestanden, extra = {}) => Array.from({ length: n }, (_, i) => we1(y, i < bestanden, extra));
const finde = (r, id) => r.signale.find((s) => s.id === id) || null;

test('signals: unter der Mindestgruppengrösse feuert nichts, die geprüften Regeln werden trotzdem genannt', () => {
  const r = signals(jahr(2024, SMALL_N - 1, 1));
  assertEqual(r.signale.length, 0);
  assertEqual(r.zuKlein, true);
  assertEqual(r.geprueft, SIGNAL_REGELN, 'auch ohne Signal ist nachvollziehbar, was geprüft wurde');
  assertEqual(signals([]).n, 0, 'ohne Daten kein Absturz');
});

// ---------------------------------------------------------------------------
// Regel 1: Jahrestrend
// ---------------------------------------------------------------------------

// vier Jahre à n = 20; die Quote fällt von 100 % auf (100 − abfall) %
const trend = (abfallPp) => [
  ...jahr(2021, SIGNAL_JAHRE_MIN_N, SIGNAL_JAHRE_MIN_N),
  ...jahr(2022, SIGNAL_JAHRE_MIN_N, SIGNAL_JAHRE_MIN_N),
  ...jahr(2023, SIGNAL_JAHRE_MIN_N, SIGNAL_JAHRE_MIN_N),
  ...jahr(2024, SIGNAL_JAHRE_MIN_N, SIGNAL_JAHRE_MIN_N - (abfallPp / 100) * SIGNAL_JAHRE_MIN_N),
];

test('signals Regel 1: der Trend feuert ab ' + SIGNAL_ABFALL_PP + ' pp, knapp darunter nicht', () => {
  assertEqual(finde(signals(trend(5)), 'jahrestrend'), null, '5 pp Abfall: kein Signal');
  const s = finde(signals(trend(10)), 'jahrestrend');
  assert(s, '10 pp Abfall: Signal');
  assertEqual(s.stufe, 'kritisch');
  assert(/10 pp/.test(s.detail), 'der Abfall steht im Text: ' + s.detail);
  assert(s.schwelle.includes(String(SIGNAL_ABFALL_PP)), 'die eigene Schwelle steht im Signal');
  assertEqual(s.weg, { kind: 'view', view: 'zeitverlauf' }, 'der Weg ist ein Datensatz, kein Rückruf');
  // Gewicht = Abfall × auswertbare Vorgänge / 100; hier 4 Jahre à 20
  assertEqual(Math.round(s.gewicht * 100) / 100, (10 * 80) / 100);
});

test('signals Regel 1: zu wenige Jahre und zu kleine Jahre zählen nicht (Randfälle)', () => {
  const dreiJahre = [...jahr(2022, 20, 20), ...jahr(2023, 20, 20), ...jahr(2024, 20, 10)];
  assertEqual(finde(signals(dreiJahre), 'jahrestrend'), null, 'nur drei Jahre über der Mindestgrösse');
  const kleineJahre = [2021, 2022, 2023, 2024].flatMap((y) => jahr(y, SIGNAL_JAHRE_MIN_N - 1, y === 2024 ? 0 : SIGNAL_JAHRE_MIN_N - 1));
  assertEqual(finde(signals(kleineJahre), 'jahrestrend'), null, 'vier Jahre, aber jedes unter n = ' + SIGNAL_JAHRE_MIN_N);
  const einJahr = jahr(2024, 40, 10);
  assertEqual(finde(signals(einJahr), 'jahrestrend'), null, 'ein einziges Jahr ergibt keinen Trend');
});

// ---------------------------------------------------------------------------
// Regeln 2 und 6: Profil unter / über dem Gesamtwert
// ---------------------------------------------------------------------------

// Ein Profil mit n Vorgängen und «bestanden» Erfolgen, dazu eine Vergleichsgruppe
const profil = (key, n, bestanden) => Array.from({ length: n }, (_, i) => we1(2024, i < bestanden, { profil: key }));

test('signals Regel 2: ein Profil feuert erst, wenn sein Wilson-Intervall den Gesamtwert nicht mehr enthält', () => {
  // knapp: kleine Gruppe, breites Intervall → kein Signal, obwohl die Quote tiefer liegt
  const knapp = [...profil('PK', 60, 54), ...profil('KMU', 10, 8)]; // 90 % gegen 80 %
  assertEqual(finde(signals(knapp), 'profil-unter-KMU'), null, 'n = 10: das Intervall enthält den Gesamtwert noch');
  // deutlich: grosse Gruppe, schmales Intervall → Signal
  const deutlich = [...profil('PK', 200, 180), ...profil('KMU', 100, 60)];
  const s = finde(signals(deutlich), 'profil-unter-KMU');
  assert(s, 'n = 100 und 20 pp Abstand: Signal');
  assertEqual(s.stufe, 'kritisch');
  assertEqual(s.weg, { kind: 'filter', patch: { profil: ['KMU'] } }, 'der Weg ist ein Filter als Datensatz');
  assert(/n = 100/.test(s.detail) && /Wilson-Halbbreite/.test(s.detail), 'Text nennt n und Halbbreite: ' + s.detail);
  assert(/Vorgänge\.$/.test(s.detail), 'Text rechnet den Abstand in Vorgänge um: ' + s.detail);
  assert(s.schwelle.includes('Wilson'), 'die eigene Schwelle steht im Signal');
});

test('signals Regel 2: Gruppen unter der Mindestgrösse bleiben stumm (Randfall)', () => {
  const winzig = [...profil('PK', 200, 180), ...profil('IK', SMALL_N - 1, 0)];
  assertEqual(finde(signals(winzig), 'profil-unter-IK'), null, 'n < ' + SMALL_N + ' ergibt nie ein Signal');
});

test('signals Regel 6: ein Profil über dem Gesamtwert ist günstig, wiegt −1 und nennt «kein Handlungsbedarf»', () => {
  const r = signals([...profil('PK', 200, 100), ...profil('CWMA', 100, 95)]);
  const s = finde(r, 'profil-ueber-CWMA');
  assert(s, 'deutlich über dem Gesamtwert: Signal');
  assertEqual(s.stufe, 'guenstig');
  assertEqual(s.gewicht, -1);
  assert(/kein Handlungsbedarf/.test(s.detail), s.detail);
  assertEqual(r.signale[r.signale.length - 1].id, s.id, 'günstige Signale stehen immer zuletzt');
});

// ---------------------------------------------------------------------------
// Regel 3: Data-Quality-Fehler
// ---------------------------------------------------------------------------

test('signals Regel 3: feuert ab einem Fehler, nennt das Betroffene und was dadurch fehlt', () => {
  const menge = profil('PK', 20, 18);
  assertEqual(finde(signals(menge, { dq: [] }), 'datenqualitaet'), null, 'kein Fehler: kein Signal');
  assertEqual(finde(signals(menge, { dq: [{ level: 'hinweis', header: 'WE1 RUN1 Result', sheet: menge[0].sheetName, row: menge[0].row }] }), 'datenqualitaet'), null,
    'nur Hinweise zählen nicht');
  const dq = [
    { level: 'fehler', header: 'Certificate Language', sheet: menge[0].sheetName, row: menge[0].row },
    { level: 'fehler', header: 'Certificate Language', sheet: menge[1].sheetName, row: menge[1].row },
    { level: 'fehler', header: 'WE1 RUN1 Date', sheet: menge[2].sheetName, row: menge[2].row },
  ];
  const s = finde(signals(menge, { dq }), 'datenqualitaet');
  assert(s, 'drei Fehler: Signal');
  assertEqual(s.stufe, 'beachten');
  assertEqual(s.gewicht, 0.6);
  assert(/Certificate Language \(2\)/.test(s.detail), 'häufigster Header zuerst: ' + s.detail);
  assert(/3 Vorgänge/.test(s.detail), 'betroffene Vorgänge im Filter: ' + s.detail);
  assertEqual(s.weg, { kind: 'view', view: 'datenqualitaet' });
});

// ---------------------------------------------------------------------------
// Regel 4: passive offene Vorgänge
// ---------------------------------------------------------------------------

const offen = (passiv) => makePerson({
  we: { 1: [{ passed: true, date: new Date(2024, 1, 1), result: 0.8 }] },
  weAllPassed: true, oeAllPassed: null, passiv,
});

test('signals Regel 4: der Anteil muss über ' + Math.round(SIGNAL_PASSIV_ANTEIL * 100) + ' % liegen, genau darauf nicht', () => {
  const genau = [...profil('PK', 20, 18), ...Array.from({ length: 9 }, () => offen(false)), offen(true)]; // 1 von 10 = 10.0 %
  assertEqual(finde(signals(genau), 'passiv'), null, 'genau 10 % feuert nicht');
  const drueber = [...profil('PK', 20, 18), ...Array.from({ length: 8 }, () => offen(false)), offen(true), offen(true)]; // 2 von 10 = 20 %
  const s = finde(signals(drueber), 'passiv');
  assert(s, '20 % feuert');
  assertEqual(s.gewicht, 0.9);
  assert(/2 von 10/.test(s.titel), s.titel);
  assert(s.schwelle.includes('10 %'), 'die eigene Schwelle steht im Signal');
});

test('signals Regel 4: ohne offene Vorgänge kein Signal (Randfall)', () => {
  assertEqual(finde(signals(profil('PK', 20, 18)), 'passiv'), null, 'alle abgeschlossen');
});

// ---------------------------------------------------------------------------
// Regel 5: vor dem letzten mündlichen Versuch
// ---------------------------------------------------------------------------

// zwei mündliche Fehlversuche, ein Slot frei → «letzter Versuch»
const vorLetztem = () => makePerson({
  we: { 1: [{ passed: true, date: new Date(2024, 1, 1), result: 0.8 }] },
  oe: { 1: [{ passed: false, date: new Date(2024, 3, 1), result: 0.5 }, { passed: false, date: new Date(2024, 6, 1), result: 0.55 }] },
  weAllPassed: true, oeAllPassed: null,
});

test('signals Regel 5: feuert ab einem Fall, sonst nicht', () => {
  assertEqual(finde(signals(profil('PK', 20, 18)), 'letzter-versuch'), null, 'kein Fall: kein Signal');
  const s = finde(signals([...profil('PK', 20, 18), vorLetztem()]), 'letzter-versuch');
  assert(s, 'ein Fall: Signal');
  assertEqual(s.gewicht, 0.8);
  assert(/1 Vorgang vor dem letzten Versuch/.test(s.titel), s.titel);
  assertEqual(s.weg, { kind: 'view', view: 'offene-vorgaenge' });
});

// ---------------------------------------------------------------------------
// Sortierung: nach Wirkung, nicht nach Stufe
// ---------------------------------------------------------------------------

test('signals: sortiert nach Gewicht – KMU (n = 302, 9 pp) vor CCoB (n = 80, 10.6 pp)', () => {
  // Gesamtwert so gelegt, dass beide Profile darunter liegen und beide Intervalle den Gesamtwert ausschliessen
  const menge = [
    ...profil('PK', 1200, 1080),  // 90 %, zieht den Gesamtwert nach oben
    ...profil('KMU', 302, 245),   // rund 81 %
    ...profil('CCoB', 80, 63),    // rund 79 %
  ];
  const r = signals(menge);
  const kmu = finde(r, 'profil-unter-KMU');
  const ccob = finde(r, 'profil-unter-CCoB');
  assert(kmu && ccob, 'beide Profile feuern');
  assert(kmu.gewicht > ccob.gewicht, 'KMU wiegt schwerer: ' + kmu.gewicht.toFixed(1) + ' gegen ' + ccob.gewicht.toFixed(1));
  assert(r.signale.indexOf(kmu) < r.signale.indexOf(ccob), 'und steht deshalb davor');
  // Die Reihenfolge folgt dem Gewicht, nicht der Stufe: ein «beachten» darf vor einem «kritisch» stehen
  const gewichte = r.signale.map((s) => s.gewicht);
  assert(gewichte.every((g, i) => i === 0 || g <= gewichte[i - 1]), 'absteigend nach Gewicht: ' + gewichte.map((g) => g.toFixed(1)).join(' ≥ '));
});

test('signals.betroffeneVorgaenge: Abstand in Prozentpunkten mal n, gerundet', () => {
  assertEqual(betroffeneVorgaenge(9, 302), 27);
  assertEqual(betroffeneVorgaenge(-9, 302), 27, 'das Vorzeichen zählt nicht');
  assertEqual(betroffeneVorgaenge(10.6, 80), 8);
  assertEqual(betroffeneVorgaenge(0, 100), 0);
});

test('signals: jedes Signal trägt Stufe, Gewicht, Schwelle, Zahl und Weg', () => {
  const r = signals([...profil('PK', 200, 180), ...profil('KMU', 100, 60), vorLetztem()],
    { dq: [{ level: 'fehler', header: 'Certificate Language', sheet: 'First Certification', row: 11 }] });
  assert(r.signale.length >= 3, 'mehrere Signale: ' + r.signale.length);
  for (const s of r.signale) {
    assert(['kritisch', 'beachten', 'guenstig'].includes(s.stufe), s.id + ': Stufe');
    assert(typeof s.gewicht === 'number' && Number.isFinite(s.gewicht), s.id + ': Gewicht');
    assert(/^Schwelle: /.test(s.schwelle), s.id + ': nennt die eigene Schwelle');
    assert(/\d/.test(s.titel + s.detail), s.id + ': trägt eine Zahl');
    assert(s.weg && (s.weg.kind === 'view' || s.weg.kind === 'filter'), s.id + ': trägt einen Weg als Datensatz');
    assert(typeof s.wegText === 'string' && s.wegText.length > 3, s.id + ': der Weg hat eine Beschriftung');
    assert(!/[<>]/.test(s.titel + s.detail + s.schwelle), s.id + ': kein Markup in den Texten');
    assert(!/ß/.test(s.titel + s.detail + s.schwelle + s.wegText), s.id + ': ss statt ß');
  }
});
