import { test, assert, assertEqual, assertClose } from './runner.js';
import { luminance, contrastRatio, parseThemes, resolveColor, checkContrast, PAIRS } from '../tools/contrast.js';

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
  assertEqual(t.print['--status-offen-bg'], '#e6f0fa');
  assertEqual(t.light['--text'], '#1f2933', 'Kommentar überschreibt nichts');
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
