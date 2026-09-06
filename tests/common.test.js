// tests/common.test.js – reine Helfer aus views/common.js (kein DOM): Geräteklasse und Initialen (PROMPT-2 B.2)
import { test, assertEqual } from './runner.js';
import { initials, isPhone, onViewportChange } from '../views/common.js';

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
