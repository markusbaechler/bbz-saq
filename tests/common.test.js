// tests/common.test.js – reine Helfer aus views/common.js (kein DOM): Geräteklasse und Initialen (PROMPT-2 B.2)
import { test, assertEqual } from './runner.js';
import { initials, isPhone, onViewportChange, nextSortDir, tableSortId } from '../views/common.js';

const mm = (matches) => () => ({ matches, addEventListener() {}, removeEventListener() {} });

// Steuerbare MediaQueryList: matches setzen und «change» auslösen
function fakeMql(matches) {
  const listeners = [];
  const mql = { matches, addEventListener: (type, h) => listeners.push(h), removeEventListener: (type, h) => listeners.splice(listeners.indexOf(h), 1) };
  return { mm: () => mql, set: (m) => { mql.matches = m; listeners.forEach((h) => h({ matches: m })); }, listeners };
}
const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('common.onViewportChange: entprellt – kurzer Hin-und-her-Wechsel löst nichts aus, dauerhafter Wechsel einmal', async () => {
  const q = fakeMql(false);
  const calls = [];
  const stop = onViewportChange((phone) => calls.push(phone), q.mm, { delay: 10 });
  q.set(true);
  q.set(false); // sofort zurück (z. B. Vollseiten-Screenshot): kein Aufruf
  await tick(30);
  assertEqual(calls, []);
  q.set(true); // dauerhaft Phone: genau ein Aufruf
  await tick(30);
  assertEqual(calls, [true]);
  q.set(true); // erneutes Ereignis ohne Änderung: kein Aufruf
  await tick(30);
  assertEqual(calls, [true]);
  stop();
  assertEqual(q.listeners.length, 0, 'abgemeldet');
});

test('common.initials: zwei Buchstaben aus Vor- und Nachname, E-Mail-Fallback, leer → ?', () => {
  assertEqual(initials('Anna Muster'), 'AM');
  assertEqual(initials('Muster, Anna'), 'MA');
  assertEqual(initials('anna.muster@example.org'), 'AM');
  assertEqual(initials('Anna-Lena Muster-Beispiel'), 'AL');
  assertEqual(initials('Anna'), 'A');
  assertEqual(initials(''), '?');
  assertEqual(initials(null), '?');
});

test('common.isPhone: matchMedia (max-width: 600px); ohne matchMedia (Node) nie Phone', () => {
  assertEqual(isPhone(mm(true)), true);
  assertEqual(isPhone(mm(false)), false);
  assertEqual(isPhone(undefined), false);
});

// Paket B (B4): eine Sortier-Implementierung für alle Tabellen. Vorher gab es zwei mit verschiedenem Verhalten –
// Experten (Text aufsteigend, Zahlen absteigend) und Data-Quality (immer aufsteigend zuerst).
test('common.nextSortDir: Text aufsteigend, Zahlen absteigend, aktive Spalte kehrt um (B4)', () => {
  const numeric = new Set(['einsaetze', 'fail1']);
  assertEqual(nextSortDir({ key: 'experte' }, numeric, null), 'asc', 'Textspalte startet aufsteigend');
  assertEqual(nextSortDir({ key: 'einsaetze' }, numeric, null), 'desc', 'Zahlenspalte startet mit dem grössten Wert');
  assertEqual(nextSortDir({ key: 'einsaetze' }, numeric, { key: 'einsaetze', dir: 'desc' }), 'asc', 'zweiter Klick kehrt um');
  assertEqual(nextSortDir({ key: 'einsaetze' }, numeric, { key: 'einsaetze', dir: 'asc' }), 'desc', 'dritter Klick kehrt zurück');
  assertEqual(nextSortDir({ key: 'experte' }, numeric, { key: 'einsaetze', dir: 'asc' }), 'asc', 'andere Spalte beginnt neu');
});

test('common.tableSortId: Titel-Slug als Kennung, ohne Titel keine Kennung (B4)', () => {
  assertEqual(tableSortId({ title: 'Kennzahlen je Profil' }), 'kennzahlen-je-profil');
  assertEqual(tableSortId({ title: 'Ø Resultat (Experten)' }), 'resultat-experten', 'Sonderzeichen fallen weg (glossarySlug)');
  assertEqual(tableSortId({ title: 'Trefferliste', sortId: 'eigene-kennung' }), 'eigene-kennung', 'ein Modell darf die Kennung setzen');
  assertEqual(tableSortId({ rows: [] }), null, 'ohne Titel sortiert die Tabelle nur im Speicher');
});
