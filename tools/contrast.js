#!/usr/bin/env node
// tools/contrast.js – Kontrastprüfung der Farb-Tokens in styles.css (Light, Dark, Druck) nach WCAG 2.x.
// Reine Funktionen (auch im Browser-Testlauf importierbar); die CLI läuft nur unter Node:
//   node tools/contrast.js [styles.css]
// Exit-Code 1, sobald ein Paar sein Minimum unterschreitet (Text 4.5:1, Linien und Marker 3:1). Aufruf im CI-Job «tests».

export const PAIRS = [
  // Text auf Fläche (≥ 4.5:1)
  ...['--bg', '--panel', '--panel-2', '--th-bg', '--hover'].map((bg) => ({ fg: '--text', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--muted', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--accent', bg, min: 4.5 })),
  { fg: '--on-accent', bg: '--accent', min: 4.5 },
  { fg: '--on-accent', bg: '--accent-dark', min: 4.5 },
  { fg: '--danger', bg: '--danger-bg', min: 4.5 },
  { fg: '--danger', bg: '--panel', min: 4.5 },
  { fg: '--warn', bg: '--warn-bg', min: 4.5 },
  { fg: '--warn', bg: '--panel', min: 4.5 },
  { fg: '--ok', bg: '--panel', min: 4.5 },
  // Gemessen in Paket OPTIK (O2): --ok traegt Text im Status-Badge, und das Badge sitzt auf --panel-2, nicht auf
  // --panel. Das Paar fehlte – geprueft wurde nur die Flaeche, auf der die Farbe NICHT steht.
  { fg: '--ok', bg: '--panel-2', min: 4.5 },
  ...['bestanden', 'nicht', 'offen', 'passiv', 'geplant'].flatMap((s) => [
    { fg: '--status-' + s, bg: '--status-' + s + '-bg', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel-2', min: 4.5 },
  ]),
  ...['pos', 'neg', 'neutral'].flatMap((d) => [
    { fg: '--delta-' + d, bg: '--panel', min: 4.5 },
    { fg: '--delta-' + d, bg: '--panel-2', min: 4.5 },
  ]),
  // Bedienelemente und Linien (≥ 3:1, WCAG 2.1 SC 1.4.11): aktiver Unterstrich, Fokusrahmen, Feldrahmen,
  // Diagrammreihen, Achsenbeschriftung. Ein Eingabefeld hat dieselbe Füllfarbe wie seine Umgebung und ist allein
  // durch seinen Rahmen erkennbar – deshalb --field-border statt des dezenten --border (Paket A, A4).
  { fg: '--accent', bg: '--panel', min: 3 },
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--field-border', bg, min: 3, note: 'Rahmen der Eingabefelder, einzige Abgrenzung zur Umgebung' })),
  ...['--bg', '--panel'].map((bg) => ({ fg: '--accent-dark', bg, min: 3, note: 'Fokusrahmen der Schaltflächen' })),
  ...['--series-1', '--series-2', '--series-3'].map((fg) => ({ fg, bg: '--panel', min: 3 })),
  { fg: '--viz-tick', bg: '--panel', min: 3, note: 'Achsenbeschriftung im Diagramm (Datenviz-Konvention 3:1, bestehende Palette)' },
];

// Paare, die aus gestalterischen Gründen unter 3:1 bleiben. Sie werden nicht aus der Prüfung genommen, sondern mit Wert
// und Fundstelle gemeldet (Paket A, A4): Jeder CI-Lauf zeigt sie, eine Verschlechterung fällt auf. Sie sind erlaubt, weil
// sie nach WCAG 2.1 SC 1.4.11 rein dekorativ sind – der Inhalt ist ohne sie vollständig erkennbar und bedienbar. Sobald
// ein Token hier ein Bedienelement abgrenzt, gehört es in PAIRS (so entstand --field-border).
export const DECOR = [
  { fg: '--border', bg: '--panel', use: 'Rahmen von Tabellen, Karten, Kacheln und Kopfzeilen (styles.css: table.data, .kpi, .view, .app-header) – Struktur, keine Bedienung; Eingabefelder tragen --field-border' },
  { fg: '--viz-grid', bg: '--panel', use: 'Gitterlinien im Diagramm (views/chart.js) und Spur der Messzeile (styles.css: .mz-spur) – die Werte stehen als Text in derselben Zeile bzw. in der Zwillingstabelle' },
  { fg: '--viz-axis', bg: '--panel', use: 'Achsenlinie im Diagramm (views/chart.js) und Referenzmarke der Messzeile (styles.css: .mz-referenz) – die Marke trägt einen title, der aria-label der Zeile nennt sie in Worten' },
  { fg: '--bar', bg: '--panel', use: 'Datenbalken in Prozentspalten (B5) und Wilson-Balken der Messzeile (styles.css: .mz-intervall) – beide liegen hinter bzw. neben dem Zahlenwert, das Intervall steht zusätzlich im aria-label der Zeile. Halbtransparent (18 % Deckung), deshalb ohne berechenbares Verhältnis' },
  { fg: '--danger-border', bg: '--danger-bg', use: 'Rahmen der Fehlermeldung (styles.css: .error) – Text und Titel tragen --danger mit 4.5:1' },
];

// [{ fg, bg, use, ratios: { light, dark, print } }] – reine Meldung, nie ein Fehler
export function decorRatios(cssText) {
  const themes = parseThemes(cssText);
  return DECOR.map((d) => ({
    ...d,
    ratios: Object.fromEntries(Object.entries(themes).map(([theme, tokens]) => {
      const fg = resolveColor(tokens, tokens[d.fg]);
      const bg = resolveColor(tokens, tokens[d.bg]);
      return [theme, fg && bg ? contrastRatio(fg, bg) : null];
    })),
  }));
}

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

// Alle :root-Deklarationen einer Medienabfrage – über ALLE Blöcke dieser Abfrage hinweg, in Dokumentreihenfolge
// zusammengeführt. So steht es auch im Browser: «@media print» kommt in styles.css mehrfach vor, und jeder Block
// gilt.
//
// Früher nahm die Prüfung den Rest der Datei ab dem ersten Vorkommen und daraus den ersten :root – also
// möglicherweise einen, der lange nach dem Block stand. Ein einzelnes :root zwischen zwei Medienabfragen liess sie
// dreissig Tokens als «fehlt im Druck-Block» melden, die alle dastanden; umgekehrt hätte sie einen wirklich
// fehlenden Token still übersehen, sobald der erste Block der Abfrage kein :root trägt (gefunden in Paket I).
function mediaDeclarations(text, query) {
  const out = {};
  for (let von = text.indexOf(query); von >= 0; von = text.indexOf(query, von + query.length)) {
    const open = text.indexOf('{', von);
    if (open < 0) break;
    let depth = 0;
    let ende = text.length;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      if (text[i] === '}' && --depth === 0) { ende = i; break; }
    }
    Object.assign(out, declarations(rootBlock(text.slice(open + 1, ende))));
  }
  return out;
}

// Themes: Light = erster :root; Dark = Light plus dunkler Block. Druck = hell → dunkel → Druck (Paket A, A4):
// Beim Drucken mit dunkler Systemeinstellung gilt der Dark-Block weiter, der Druck-Block überschreibt ihn nur teilweise.
// Wer Druck als «hell + Druck» modelliert, prüft eine Kaskade, die es im Browser nicht gibt.
// Kommentare vorher entfernt.
export function parseThemes(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = declarations(rootBlock(clean));
  const darkOnly = mediaDeclarations(clean, '@media (prefers-color-scheme: dark)');
  const printOnly = mediaDeclarations(clean, '@media print');
  return { light, dark: { ...light, ...darkOnly }, print: { ...light, ...darkOnly, ...printOnly } };
}

// Tokens, die der Dark-Block setzt, der Druck-Block aber nicht zurücksetzt – jedes davon bleibt beim Drucken dunkel.
export function darkLeftovers(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const darkOnly = mediaDeclarations(clean, '@media (prefers-color-scheme: dark)');
  const printOnly = mediaDeclarations(clean, '@media print');
  return Object.keys(darkOnly).filter((k) => !(k in printOnly));
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
  const css = readFileSync(path, 'utf8');
  const { results, failures } = checkContrast(css);
  for (const r of results) {
    console.log((r.ok ? '  ok   ' : '  FAIL ') + r.theme.padEnd(5) + ' ' + r.fg + ' auf ' + r.bg + ': ' + (r.ratio ? r.ratio.toFixed(2) + ':1' : '–') + ' (min ' + r.min + ')' + (r.note ? ' – ' + r.note : ''));
  }
  // Dokumentierte Deko-Paare unter 3:1: mit Wert und Fundstelle gemeldet, nie ein Fehler (Paket A, A4)
  console.log('');
  console.log('Dekorative Paare unter 3:1 (SC 1.4.11 nicht anwendbar) – mit Wert gemeldet, kein Fehler:');
  for (const d of decorRatios(css)) {
    const werte = ['light', 'dark', 'print'].map((t) => t + ' ' + (d.ratios[t] ? d.ratios[t].toFixed(2) : '–')).join(' · ');
    console.log('  info  ' + d.fg + ' auf ' + d.bg + ': ' + werte + ' – ' + d.use);
  }
  console.log('');
  // Der Druck-Block muss jedes Token zurücksetzen, das der Dark-Block setzt – sonst druckt eine dunkle Systemeinstellung
  // dunkle Farben auf weisses Papier. Die Paare oben finden das nur, wo ein Token in einem geprüften Paar vorkommt.
  const leftovers = darkLeftovers(css);
  console.log((leftovers.length ? '  FAIL ' : '  ok   ') + 'print  setzt jedes Token des Dark-Blocks zurück'
    + (leftovers.length ? ': ' + leftovers.join(', ') + ' fehlen im Druck-Block' : ''));
  console.log('\n' + (results.length - failures.length) + '/' + results.length + ' Paare erfüllen das Minimum.');
  process.exit(failures.length || leftovers.length ? 1 : 0);
}
