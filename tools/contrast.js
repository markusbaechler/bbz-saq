#!/usr/bin/env node
// tools/contrast.js – Kontrastprüfung der Farb-Tokens in styles.css (Light, Dark, Druck) nach WCAG 2.x.
// Reine Funktionen (auch im Browser-Testlauf importierbar); die CLI läuft nur unter Node:
//   node tools/contrast.js [styles.css]
// Exit-Code 1, sobald ein Paar sein Minimum unterschreitet (Text 4.5:1, Linien und Marker 3:1). Aufruf im CI-Job «tests».

export const PAIRS = [
  // Text auf Fläche (≥ 4.5:1)
  ...['--bg', '--panel', '--panel-2', '--th-bg', '--hover', '--nav-bg'].map((bg) => ({ fg: '--text', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--muted', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--accent', bg, min: 4.5 })),
  { fg: '--on-accent', bg: '--accent', min: 4.5 },
  { fg: '--on-accent', bg: '--accent-dark', min: 4.5 },
  { fg: '--danger', bg: '--danger-bg', min: 4.5 },
  { fg: '--danger', bg: '--panel', min: 4.5 },
  { fg: '--warn', bg: '--warn-bg', min: 4.5 },
  { fg: '--warn', bg: '--panel', min: 4.5 },
  { fg: '--ok', bg: '--panel', min: 4.5 },
  ...['bestanden', 'nicht', 'offen', 'passiv', 'geplant'].flatMap((s) => [
    { fg: '--status-' + s, bg: '--status-' + s + '-bg', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel-2', min: 4.5 },
  ]),
  ...['pos', 'neg', 'neutral'].flatMap((d) => [
    { fg: '--delta-' + d, bg: '--panel', min: 4.5 },
    { fg: '--delta-' + d, bg: '--panel-2', min: 4.5 },
  ]),
  // Linien und Marker (≥ 3:1): aktiver Unterstrich, Diagrammreihen, Achsenbeschriftung
  { fg: '--accent', bg: '--panel', min: 3 },
  ...['--series-1', '--series-2', '--series-3'].map((fg) => ({ fg, bg: '--panel', min: 3 })),
  { fg: '--viz-tick', bg: '--panel', min: 3, note: 'Achsenbeschriftung im Diagramm (Datenviz-Konvention 3:1, bestehende Palette)' },
];

function channel(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error('Farbe erwartet (#rrggbb): ' + hex);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// «--token: wert;»-Deklarationen eines Blocks
function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

// Inhalt des ersten :root-Blocks eines Textausschnitts (Klammern gezählt)
function rootBlock(text) {
  const start = text.indexOf(':root');
  if (start < 0) return '';
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return '';
}

function fromQuery(text, query) {
  const start = text.indexOf(query);
  return start < 0 ? '' : text.slice(start);
}

// Themes: Light = erster :root; Dark und Druck = Light plus die Überschreibungen im jeweiligen @media-Block. Kommentare vorher entfernt.
export function parseThemes(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = declarations(rootBlock(clean));
  const dark = { ...light, ...declarations(rootBlock(fromQuery(clean, '@media (prefers-color-scheme: dark)'))) };
  const print = { ...light, ...declarations(rootBlock(fromQuery(clean, '@media print'))) };
  return { light, dark, print };
}

// Wert → #rrggbb (var()-Ketten aufgelöst); color-mix, transparente und unbekannte Werte → null (nicht prüfbar)
export function resolveColor(tokens, value, depth = 0) {
  if (!value || depth > 10) return null;
  const v = String(value).trim();
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(v);
  if (ref) return resolveColor(tokens, tokens[ref[1]], depth + 1);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return ('#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*1(?:\.0+)?\s*)?\)$/i.exec(v);
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return null;
}

export function checkContrast(cssText) {
  const themes = parseThemes(cssText);
  const results = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const p of PAIRS) {
      const fg = resolveColor(tokens, tokens[p.fg]);
      const bg = resolveColor(tokens, tokens[p.bg]);
      if (!fg || !bg) {
        results.push({ theme, fg: p.fg, bg: p.bg, ratio: null, min: p.min, ok: false, note: 'Token fehlt oder nicht auflösbar' });
        continue;
      }
      const ratio = contrastRatio(fg, bg);
      results.push({ theme, fg: p.fg, bg: p.bg, ratio, min: p.min, ok: ratio >= p.min, note: p.note || '' });
    }
  }
  return { results, failures: results.filter((r) => !r.ok) };
}

// CLI nur unter Node und nur, wenn diese Datei direkt gestartet wurde (Pfadtrenner beider Betriebssysteme)
const isMain = typeof process !== 'undefined' && Array.isArray(process.argv) && String(process.argv[1] || '').endsWith('contrast.js');
if (isMain) {
  const { readFileSync } = await import('node:fs');
  const path = process.argv[2] || new URL('../styles.css', import.meta.url);
  const { results, failures } = checkContrast(readFileSync(path, 'utf8'));
  for (const r of results) {
    console.log((r.ok ? '  ok   ' : '  FAIL ') + r.theme.padEnd(5) + ' ' + r.fg + ' auf ' + r.bg + ': ' + (r.ratio ? r.ratio.toFixed(2) + ':1' : '–') + ' (min ' + r.min + ')' + (r.note ? ' – ' + r.note : ''));
  }
  console.log('\n' + (results.length - failures.length) + '/' + results.length + ' Paare erfüllen das Minimum.');
  process.exit(failures.length ? 1 : 0);
}
