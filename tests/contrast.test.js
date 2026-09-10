import { test, assert, assertEqual, assertClose } from './runner.js';
import { luminance, contrastRatio, parseThemes, resolveColor, checkContrast, darkLeftovers, PAIRS } from '../tools/contrast.js';

const CSS = `
:root { --panel: #ffffff; --text: #1f2933; --accent: #0b5fa5; --status-offen: var(--accent); --status-offen-bg: #e6f0fa; --bar: color-mix(in srgb, var(--accent) 18%, transparent); }
@media (prefers-color-scheme: dark) { :root { --panel: #1e2126; --text: #e6e8eb; --accent: #6aa6e6; --status-offen-bg: #1f2f44; } }
@media print { :root { --panel: #ffffff; --text: #1f2933; --accent: #0b5fa5; } }
`;

test('contrast.luminance / contrastRatio: Schwarz auf Weiss 21:1, gleiche Farbe 1:1', () => {
  assertClose(luminance('#ffffff'), 1, 1e-6);
  assertClose(luminance('#000000'), 0, 1e-6);
  assertClose(contrastRatio('#000000', '#ffffff'), 21, 1e-6);
  assertClose(contrastRatio('#ffffff', '#ffffff'), 1, 1e-6);
  assertClose(contrastRatio('#0b5fa5', '#ffffff'), 6.58, 0.05);
});

test('contrast.parseThemes: Light, Dark (mit Light gemischt) und Druck; Kommentare ignoriert', () => {
  const t = parseThemes(CSS + '/* --text: #000000; */');
  assertEqual(t.light['--panel'], '#ffffff');
  assertEqual(t.dark['--panel'], '#1e2126');
  assertEqual(t.dark['--status-offen'], 'var(--accent)', 'nicht überschriebene Tokens kommen aus Light');
  assertEqual(t.light['--text'], '#1f2933', 'Kommentar überschreibt nichts');
});

// Paket A (A4): Im Browser gilt beim Drucken mit dunkler Systemeinstellung die Kaskade hell → dunkel → Druck.
// Wer Druck als «hell + Druck» modelliert, prüft eine Kaskade, die es nicht gibt, und übersieht jedes dunkle Token,
// das der Druck-Block nicht zurücksetzt.
test('contrast.parseThemes: Druck ist hell → dunkel → Druck, nicht hell → Druck (A4)', () => {
  const t = parseThemes(CSS);
  assertEqual(t.print['--panel'], '#ffffff', 'der Druck-Block setzt --panel zurück');
  assertEqual(t.print['--status-offen-bg'], '#1f2f44', 'der Druck-Block setzt --status-offen-bg nicht zurück: der dunkle Wert bleibt stehen');
  const dunkelGedruckt = parseThemes(CSS.replace('@media print { :root {', '@media print { :root { --status-offen-bg: #e6f0fa;'));
  assertEqual(dunkelGedruckt.print['--status-offen-bg'], '#e6f0fa', 'zurückgesetzt gewinnt wieder der helle Wert');
});

test('contrast.darkLeftovers: nennt die Tokens, die der Druck-Block nicht zurücksetzt (A4)', () => {
  assertEqual(darkLeftovers(CSS).join(','), '--status-offen-bg');
  assertEqual(darkLeftovers(CSS.replace('@media print { :root {', '@media print { :root { --status-offen-bg: #e6f0fa;')).length, 0);
  assertEqual(darkLeftovers(':root { --a: #fff; }').length, 0, 'ohne Dark-Block keine Reste');
});

test('contrast.PAIRS: der Feldrahmen wird gegen jede Fläche geprüft (A4, WCAG 2.1 SC 1.4.11)', () => {
  const feld = PAIRS.filter((p) => p.fg === '--field-border');
  assertEqual(feld.length, 3, '--field-border gegen --bg, --panel und --panel-2');
  assert(feld.every((p) => p.min === 3), 'Bedienelemente brauchen 3:1');
  assert(!PAIRS.some((p) => p.fg === '--nav-bg' || p.bg === '--nav-bg'), '--nav-bg ist entfernt (im CSS nie verwendet)');
});

test('contrast.resolveColor: var()-Ketten, rgb(), Kurzform; color-mix und unbekannte Werte → null', () => {
  const t = parseThemes(CSS);
  assertEqual(resolveColor(t.dark, 'var(--status-offen)'), '#6aa6e6');
  assertEqual(resolveColor(t.light, 'rgb(11, 95, 165)'), '#0b5fa5');
  assertEqual(resolveColor(t.light, '#fff'), '#ffffff');
  assertEqual(resolveColor(t.light, 'var(--bar)'), null);
  assertEqual(resolveColor(t.light, 'var(--gibt-es-nicht)'), null);
});

test('contrast.checkContrast: alle Paare je Theme geprüft, Unterschreitung als failure', () => {
  const bad = CSS.replace('--text: #1f2933', '--text: #cccccc');
  const r = checkContrast(bad);
  assert(r.failures.some((f) => f.theme === 'light' && f.fg === '--text' && f.bg === '--panel'), 'grauer Text auf Weiss fällt durch');
  assert(PAIRS.length >= 30);
  assert(r.results.every((x) => ['light', 'dark', 'print'].includes(x.theme)));
  assertEqual(r.results.length, PAIRS.length * 3);
});
