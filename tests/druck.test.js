// tests/druck.test.js – Druckansicht des Bank-Reports (PROMPT-3, E12–E15, P7.2d).
// Geprüft wird das Modell: Seitenzahl, Zuschnitt der Seiten, Textökonomie nach E14 und die Methodik ohne Doppelung.
// Den DOM-Teil (Kopfband je Seite, Umbrüche, keine Überbreite) prüft der Browser-Smoke-Test.
import { test, assert, assertEqual } from './runner.js';
import { SMALL_N } from '../metrics.js';
import { bankReportPrintModel, METHODIK_BEGRIFFE, FUSSNOTE_MAX, VERTRAULICH } from '../views/print.js';
import { glossaryEntry } from '../glossary.js';
import { makePerson } from './fixtures.js';

function vorgang(bank, { durchgefallen = false, sprache = 'DE', profil = 'PK' } = {}) {
  return makePerson({
    employerCanon: bank, sprache, profil,
    weAllPassed: true, oeAllPassed: true,
    we: {
      1: durchgefallen
        ? [{ passed: false, date: '2024-03-01', result: 0.5 }, { passed: true, date: '2024-06-01', result: 0.8 }]
        : [{ passed: true, date: '2024-03-01', result: 0.8 }],
    },
    oe: { 1: [{ passed: true, date: '2024-09-01', result: 0.9 }] },
  });
}

const menge = () => Array.from({ length: 9 }, (_, i) => vorgang('Bank A', { durchgefallen: i < 3 }))
  .concat(Array.from({ length: 8 }, (_, i) => vorgang('Bank B', { durchgefallen: i < 1, profil: 'IK' })))
  .concat(Array.from({ length: 6 }, () => vorgang('Bank C', { sprache: 'FR' })));

const modellVon = (extra = {}) => bankReportPrintModel({
  fokus: 'Bank A', vergleich: ['Bank B'], persons: menge(),
  kopfzeilen: ['Zeitraum: alle', 'Profil: alle'], stand: '12.09.2026 14:20', ...extra,
});

// ---------------------------------------------------------------------------
// E13 – Aufbau
// ---------------------------------------------------------------------------

test('Druck: fünf Seiten, kein Deckblatt, jede Seite mit Titel', () => {
  const m = modellVon();
  // E13 nannte vier Seiten. Gemessen an der echten Datei mit vier Vergleichsbanken brauchte die Vergleichstabelle
  // 211 mm und die Detailseite 209 mm bei 186 mm Satzspiegel; der Auftraggeber hat am 12.09.2026 entschieden,
  // den Umfang auf fünf Seiten zu öffnen statt Kennzahlen zu streichen oder die Schrift zu verkleinern.
  assertEqual(m.seiten.length, 5);
  assertEqual(m.seiten.map((s) => s.id), ['kennzahlen', 'leistung', 'sprache', 'detail', 'methodik']);
  for (const s of m.seiten) assert(typeof s.titel === 'string' && s.titel.length > 0, s.id + ': Titel');
  assert(!m.seiten.some((s) => s.id === 'deckblatt'), 'kein Deckblatt');
});

test('Druck: die Vergleichstabelle ist auf drei Seiten geteilt, alle mit vollem Kopf und ohne verlorene Zeile', () => {
  const m = modellVon();
  const teile = [0, 1, 2].map((i) => m.seiten[i].bloecke.find((b) => b.art === 'tabelle').tabelle);
  const kopf = teile[0].columns.map((c) => c.key);
  for (const t of teile) assertEqual(t.columns.map((c) => c.key), kopf, 'gleicher Kopf auf jeder Seite');
  assert(teile[0].rows.every((r) => /^(we|oe)\.v\d$/.test(r.id)), 'Seite 1: Durchfallquoten');
  assert(teile[1].rows.every((r) => /^(we|oe)\.(perf|versuche)|^kontext\./.test(r.id)), 'Seite 2: Leistung und Kontext');
  assert(teile[2].rows.every((r) => r.id.startsWith('sprache.')), 'Seite 3: Sprache');
  assertEqual(teile.reduce((a, t) => a + t.rows.length, 0), 6 + 4 + 2 + 5 + 4, 'keine Zeile geht verloren');
  for (const t of teile) assert(t.rows.length <= 26, t.title + ': ' + t.rows.length + ' Zeilen');
});

test('Druck: die Profile stehen auf Seite 4 und nur über der Schwelle', () => {
  const seite = modellVon().seiten[3].bloecke.filter((b) => b.art === 'tabelle');
  assertEqual(seite.map((b) => b.tabelle.title.slice(0, 9)), ['Je Profil', 'Nicht in '], 'Profile und Rand');
  const profile = seite[0].tabelle;
  assert(profile.rows.every((r) => r.n >= SMALL_N), profile.rows.map((r) => r.profil + ':' + r.n).join(' | '));
});

test('Druck: Sprache und Teilprüfungen auf einer Seite, die Methodik auf der letzten', () => {
  const m = modellVon();
  const titel = m.seiten[2].bloecke.filter((b) => b.art === 'tabelle').map((b) => b.tabelle.title);
  assertEqual(titel, ['Verteilung und Erstversuch je Sprache', 'Teilprüfungen der Fokusbank']);
  assertEqual(m.seiten[4].bloecke.map((b) => b.art), ['methodik']);
});

test('Druck: das Kopfband nennt Fokusbank, Vergleichsbanken, Zeitraum und Stand', () => {
  const k = modellVon().kopfband;
  assertEqual(k.fokus, 'Bank A');
  assertEqual(k.vergleich, ['Bank B']);
  assertEqual(k.stand, '12.09.2026 14:20');
  assert(k.filter.includes('Zeitraum: alle'), k.filter);
  assert(k.zeilen.length <= 3, 'höchstens drei Zeilen: ' + k.zeilen.length);
});

test('Druck: Seite 1 trägt höchstens sechs Leitkennzahlen in einer Zeile', () => {
  const kacheln = modellVon().seiten[0].bloecke.find((b) => b.art === 'kacheln').kacheln;
  assert(kacheln.length <= 6, kacheln.length + ' Kacheln');
  assert(kacheln.every((kk) => typeof kk.label === 'string' && typeof kk.wert === 'string'), 'Label und Wert je Kachel');
  assert(kacheln.some((kk) => kk.delta), 'die Fokusbank trägt Deltas');
});

// ---------------------------------------------------------------------------
// E14 – Textökonomie
// ---------------------------------------------------------------------------

test('Druck: jede Fussnote ist ein Satz und bleibt unter der Längengrenze', () => {
  for (const s of modellVon().seiten) {
    for (const f of s.fussnoten) {
      assert(f.length <= FUSSNOTE_MAX, s.id + ': ' + f.length + ' Zeichen – «' + f + '»');
      assertEqual((f.match(/\./g) || []).length, 1, s.id + ': mehr als ein Satz – «' + f + '»');
      assert(f.endsWith('.'), s.id + ': Satzende fehlt – «' + f + '»');
    }
  }
});

test('Druck: keine Fliesstextabsätze – nur Kacheln, Tabellen, Methodik und Fussnoten', () => {
  const erlaubt = new Set(['kacheln', 'tabelle', 'methodik']);
  for (const s of modellVon().seiten) {
    for (const b of s.bloecke) assert(erlaubt.has(b.art), s.id + ': unerlaubter Block «' + b.art + '»');
  }
});

test('Druck: die Methodik nennt jede Definition genau einmal und jeder Begriff steht im Glossar', () => {
  const zeilen = modellVon().seiten[4].bloecke.find((b) => b.art === 'methodik').zeilen;
  assertEqual(zeilen.length, METHODIK_BEGRIFFE.length);
  assertEqual(new Set(zeilen.map((z) => z.kennzahl)).size, zeilen.length, 'kein Begriff doppelt');
  assertEqual(new Set(zeilen.map((z) => z.definition)).size, zeilen.length, 'keine Definition doppelt');
  for (const begriff of METHODIK_BEGRIFFE) assert(glossaryEntry(begriff), 'kein Glossar-Eintrag für «' + begriff + '»');
});

test('Druck: die Methodik deckt jede Kennzahlgruppe der Vergleichstabelle ab', () => {
  const m = modellVon();
  const zeilen = m.seiten[4].bloecke.find((b) => b.art === 'methodik').zeilen;
  const text = zeilen.map((z) => z.kennzahl + ' ' + z.definition).join(' ').toLowerCase();
  for (const wort of ['durchfallquote', 'resultat', 'versuche bis bestanden', 'sprach', 'bankübergreifend', 'maskiert', 'angetreten']) {
    assert(text.includes(wort), 'Methodik ohne «' + wort + '»');
  }
});

test('Druck: keine Wertung, nur regelbasierte Faktensätze', () => {
  const text = JSON.stringify(modellVon()).toLowerCase();
  for (const wort of ['empfehlung', 'empfehlen', 'auffällig', 'problematisch', 'handlungsbedarf', 'schlecht', 'gut aufgestellt']) {
    assert(!text.includes(wort), 'Wertung im Report: «' + wort + '»');
  }
});

// ---------------------------------------------------------------------------
// E9 / E15 – Vertraulichkeit und Logo
// ---------------------------------------------------------------------------

test('Druck: die Vertraulichkeitszeile steht fest und gehört zu jeder Seite', () => {
  const m = modellVon();
  assertEqual(m.vertraulich, VERTRAULICH);
  assert(VERTRAULICH.includes('bbz-intern') && VERTRAULICH.includes('nicht zur Weitergabe'), VERTRAULICH);
});

test('Druck: der Logo-Slot hat feste Masse, auch ohne Datei', () => {
  const logo = modellVon().kopfband.logo;
  assertEqual([logo.breiteMm, logo.hoeheMm], [24, 12]);
  assertEqual(logo.quelle, 'assets/logo.svg');
});

test('Druck: ohne Fokusbank entsteht kein Report', () => {
  assertEqual(bankReportPrintModel({ fokus: null, persons: menge() }), null);
});

// E14: Die Gruppe steht einmal als Zwischenzeile, nicht vor jeder Zeile erneut. «Sprache: im 1. Versuch
// durchgefallen (schriftlich) – FR» brach im Druck auf drei Zeilen und trieb Seite 2 auf 219 mm.
test('Druck: die Kennzahlspalte trägt nur die Zeile, die Gruppe steht als eigene Zwischenzeile', () => {
  const t = modellVon().seiten[2].bloecke.find((b) => b.art === 'tabelle').tabelle;
  for (const r of t.rows) {
    assert(typeof r.gruppe === 'string' && r.gruppe.length > 0, r.id + ': Gruppe fehlt');
    assert(typeof r.bezeichnung === 'string' && !r.bezeichnung.includes(' – '), r.id + ': «' + r.bezeichnung + '»');
    assert(r.bezeichnung.length <= 24, r.id + ': ' + r.bezeichnung.length + ' Zeichen – «' + r.bezeichnung + '»');
  }
});
