// tools/theme.js – Spiegelt die dunkle Palette in den Block für die manuelle Wahl (Paket OPTIK, O3a).
//
// Warum überhaupt zwei Blöcke: Der Themenschalter kennt drei Zustände (System · Hell · Dunkel). «Dunkel bei hellem
// System» kann eine Media-Abfrage nicht liefern – dafür braucht es einen Selektor auf dem Attribut. Die Werte
// dürfen aber nicht an zwei Orten stehen, die auseinanderlaufen.
//
// Warum erzeugt und nicht von Hand verdoppelt: O3 schreibt die dunkle Palette neu, also 30 Werte – von Hand wären
// das 30 Werte zweimal, und genau dort entsteht Drift. Erzeugt liegt der Wert einmal in der Media-Abfrage; der
// zweite Block ist eine Kopie, die niemand pflegt. Dasselbe Muster wie das README-Glossar und die Import-Map.
// tools/contrast.js prüft zusätzlich, dass beide Blöcke gleich sind – wer den Generator überspringt, wird rot.
//
// Aufruf: node tools/theme.js --write   (Block schreiben)
//         node tools/theme.js           (nur prüfen; Exit-Code 1, wenn er veraltet ist)

export const MARKE_START = '/* erzeugt von tools/theme.js – nicht von Hand ändern */';
export const MARKE_ENDE = '/* /erzeugt */';
export const MEDIA_DUNKEL = '@media (prefers-color-scheme: dark)';
export const SELEKTOR_DUNKEL = ':root[data-theme="dark"]';

// Inhalt des :root-Blocks der dunklen Media-Abfrage – inklusive Wächter, der Selektor selbst wird nicht gebraucht.
export function dunkleDeklarationen(css) {
  const text = String(css || '');
  const von = text.indexOf(MEDIA_DUNKEL);
  if (von < 0) return null;
  const wurzel = text.indexOf(':root', von);
  if (wurzel < 0) return null;
  const auf = text.indexOf('{', wurzel);
  let tiefe = 0;
  for (let i = auf; i < text.length; i++) {
    if (text[i] === '{') tiefe++;
    if (text[i] === '}' && --tiefe === 0) return text.slice(auf + 1, i);
  }
  return null;
}

// Der erzeugte Block: dieselben Deklarationen unter dem Attribut-Selektor, um eine Einrückungsstufe zurückgesetzt.
export function erzeugterBlock(deklarationen) {
  const zeilen = String(deklarationen || '').split('\n')
    .map((z) => (z.startsWith('  ') ? z.slice(2) : z))
    .filter((z, i, a) => z.trim() !== '' || (i > 0 && i < a.length - 1));
  return [
    MARKE_START,
    '/* Dieselben Werte wie die Media-Abfrage darüber, nur für die manuelle Wahl «Dunkel» bei hellem System.',
    '   Quelle ist die Media-Abfrage; hier wird nichts von Hand gepflegt. */',
    SELEKTOR_DUNKEL + ' {',
    ...zeilen,
    '}',
    MARKE_ENDE,
  ].join('\n');
}

export function inCssEinsetzen(css, block) {
  const text = String(css || '');
  const von = text.indexOf(MARKE_START);
  if (von < 0) throw new Error('styles.css: erzeugter Bereich nicht gefunden – Marken fehlen');
  const bis = text.indexOf(MARKE_ENDE, von);
  if (bis < 0) throw new Error('styles.css: Startmarke ohne Endmarke');
  const zeilenStart = text.lastIndexOf('\n', von) + 1;
  return text.slice(0, zeilenStart) + block + text.slice(bis + MARKE_ENDE.length);
}

// Deklarationen als { token: wert } – für den Gleichheitsvergleich in tools/contrast.js
export function alsPaare(deklarationen) {
  const out = {};
  for (const teil of String(deklarationen || '').replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = teil.indexOf(':');
    if (i < 0) continue;
    const k = teil.slice(0, i).trim();
    if (k) out[k] = teil.slice(i + 1).trim();
  }
  return out;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]
  && process.argv[1].split(String.fromCharCode(92)).join('/').endsWith('tools/theme.js')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const pfad = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'styles.css');
  const alt = readFileSync(pfad, 'utf8');
  const dekl = dunkleDeklarationen(alt);
  if (!dekl) { console.error('Dunkler Media-Block nicht gefunden.'); process.exitCode = 1; }
  else {
    const neu = inCssEinsetzen(alt, erzeugterBlock(dekl));
    const anzahl = Object.keys(alsPaare(dekl)).length;
    if (process.argv.includes('--write')) {
      if (neu !== alt) writeFileSync(pfad, neu);
      console.log('Manuelle Dunkelfassung: ' + anzahl + ' Deklarationen' + (neu === alt ? ' (unverändert)' : ' (geschrieben)'));
    } else if (neu !== alt) {
      console.error('Manuelle Dunkelfassung veraltet – lokal «node tools/theme.js --write» ausführen und committen.');
      process.exitCode = 1;
    } else {
      console.log('Manuelle Dunkelfassung aktuell: ' + anzahl + ' Deklarationen');
    }
  }
}
