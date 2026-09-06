# Paket A – Design-System und Informationsarchitektur: Umsetzungsplan

> **Für ausführende Agenten:** Plan Task für Task abarbeiten (superpowers:executing-plans oder subagent-driven-development). Schritte tragen Checkboxen. Nach jedem Task (= Schritt A.2 … A.8 aus `PROMPT-2.md`) Bericht nach Vorlage 0.8 und Freigabe abwarten.

**Ziel:** Dieselben Inhalte des Cockpits mit klarer Hierarchie (Shell → Filter → View-Kopf → Kennzahlen → Tabellen → Hinweise), weniger Text und visuellen Anhaltspunkten (Status-Badges, Datenbalken, Delta-Symbole) – ohne eine einzige Zahl zu ändern.

**Architektur:** Reine Modelle bleiben in `views/tables.js` (Spaltenpriorität, Richtung, Gruppe als Daten), Rendering in `views/common.js` und `app.js`, Gestaltung ausschliesslich über Tokens in `styles.css`. Neue reine Helfer als kleine Module (`filterChips.js`, `tools/contrast.js`) mit Tests. `metrics.js` wird nicht angefasst; der Snapshot der synthetischen Datei belegt «Zahlen unverändert».

**Tech Stack:** Vanilla JS ES-Module ohne Build, CSS Custom Properties, Node 22 (CI) / 24 (lokal) für Tests und Werkzeuge, Playwright 1.56 für den Smoke-Test.

## Globale Vorgaben (aus `PROMPT-2.md`)

- Kein Framework, kein Build-Schritt, keine CDN-Bibliothek; Bibliotheken nur unter `lib/`.
- Schichten: `datasource → store → metrics → views`; Views greifen nie auf Graph zu; `metrics.js` in Paket A unberührt.
- Sprache Deutsch (Schweiz), «ss» statt «ß»; Prozent mit 1 Dezimale und n; n < 5 mit «*».
- Keine Personendaten in Code, Tests, Fixtures, Screenshots, Commits, PR-Texten; synthetische Namen: «Muster Anna», «Beispiel Ben», «Testbank AG», «Musterbank».
- Farbe trägt nie allein Bedeutung: immer Symbol, Vorzeichen oder Text dazu. Kontrast Text ≥ 4.5:1, Flächen/Linien ≥ 3:1 (Light, Dark, Druck).
- Smoke-Test lokal: `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe node tests/smoke/run.mjs`.
- Snapshot-Vergleich nach jedem Task: `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json` → «identisch».
- Commits klein, deutsch, Imperativ, ein Task = ein oder wenige Commits; Push nach jedem Task (CI je Push).
- Selektoren, die der Smoke-Test heute prüft und die bleiben: `#nav a`, `#status` (Text mit «Vorgänge», «Duplikate», «Data-Quality-Log»), `#filterbar .summary`, `#filterbar label:has-text("Profil") select`, `#filterbar label:has-text("Bank") select`, `#filterbar button:has-text("Filter zurücksetzen")`, `#view h2`, `#view .kpi .kpi-label/.kpi-value/.kpi-n`, `#view table caption`, `tr.expandable`, `tr.event-detail`, `details.fold`, `.dq-text`, `.dq-count`, `table.dq-table`, `.snapshot-list`.

## Dateistruktur

| Datei | Verantwortung in Paket A |
|---|---|
| `styles.css` | Tokens (Abstände, Schriftgrade, Status, Delta, Datenbalken), Navigation mit Gruppen, Sticky-Filterleiste, Chips, View-Kopf, Export-Menü, KPI-Gruppen, Tabellen (Prio-Attribute, Balken, Delta, Badges, Sticky-Spalte, Zebra), Leerzustand, `visually-hidden`, `prefers-reduced-motion` |
| `tools/contrast.js` (neu) | Reine Kontrastprüfung der Tokens (Light, Dark, Druck) + CLI; kein `node:`-Import auf Modulebene, damit die Tests auch im Browser laufen |
| `tests/contrast.test.js` (neu) | Tests für Luminanz, Kontrast, CSS-Parsing, Token-Auflösung, Paarliste |
| `.github/workflows/tests.yml` | Schritt `node tools/contrast.js` im Job `tests` |
| `index.html` | Untertitel, `#datastand`-Container, Leerzustand-Karte wird per JS gerendert |
| `app.js` | `renderStatus()` mit Datenstand-Einzeiler + `details`, `renderNav()` mit Gruppen, Filterleiste mit Jahr-Select und Chips, `renderView()` mit View-Kopf, Export-Menü, Legende «Hinweise und Definitionen», Glossar-Sprung, `aria-busy` |
| `filterChips.js` (neu) | Reine Funktionen `filterChips(filter)` und `yearOf(filter)`: aktive Einschränkungen als Chips mit Rücksetz-Teilzustand |
| `tests/filterChips.test.js` (neu) | Tests für Chips und Jahr-Erkennung |
| `views/common.js` | `renderTable()`/`renderExpandableTable()` mit `data-prio`, Prozent-Balken, Delta- und Statuszellen, ⓘ, Schalter «Alle Spalten»; `renderKpis()` mit Gruppen, Delta, Glossar-Link; `section()` ohne Doppeltitel; `renderExportMenu()` ersetzt `exportBar()`; `renderEmptyState()` |
| `views/tables.js` | `col(key, label, prio, extra)` exportiert; Prioritäten gemäss Anhang A1; `overviewModel()` mit `group`/`direction`; `deltaView()`; `STATUS_COLUMN_LABELS`, `isDeltaColumn()` |
| `views/*.js` | je View `export const group`, `intro` (≤ 160 Zeichen), `glossar` (Begriff); Einleitungsabsätze → `hints`; Section-Intros → ⓘ + Legende |
| `views/glossar.js` | `id`-Attribute je Begriff (`glossar-<slug>`) |
| `glossary.js` | `glossarySlug(term)` |
| `tests/views-meta.test.js` (neu) | Metadaten aller Views: `id`, `label`, `group`, `intro` ≤ 160, `glossar` im Glossar |
| `tests/tables.test.js`, `tests/glossary.test.js`, `tests/urlState.test.js` | Erweiterungen |
| `tests/smoke/run.mjs` | Angepasste und neue Prüfungen (Gruppen, Chips, Jahr-Select, Export-Menü, KPI-Gruppen, Balken, Badges, Legende, Schalter, Dark-Screenshot Übersicht) |
| `README.md` | «Ansichten», «Globale Filter», Entscheid-Log E1–E10 (Abschnitt «Modell») |

---

### Task 1 (Schritt A.2): Design-Tokens und `tools/contrast.js`

**Dateien:**
- Ändern: `styles.css` (`:root`, Dark-Block, Print-Block)
- Erstellen: `tools/contrast.js`, `tests/contrast.test.js`
- Ändern: `tests/all.js`, `.github/workflows/tests.yml`

**Schnittstellen:**
- Erzeugt (CSS): `--space-1…6`, `--fs-xs…xl`, `--status-{bestanden,nicht,offen,passiv,geplant}` + `-bg`, `--delta-{pos,neg,neutral}`, `--bar`, `--bar-fallback` (siehe Schritt 3).
- Erzeugt (JS, `tools/contrast.js`): `luminance(hex) → number`, `contrastRatio(a, b) → number`, `parseThemes(cssText) → { light, dark, print }` (je ein Objekt `{ '--token': 'rohwert' }`, Dark und Print bereits mit Light zusammengeführt), `resolveColor(tokens, value) → '#rrggbb' | null`, `PAIRS` (Liste `{ fg, bg, min, note }`), `checkContrast(cssText) → { results: [{ theme, fg, bg, ratio, min, ok }], failures: [...] }`.

- [ ] **Schritt 1: Tests schreiben (`tests/contrast.test.js`)**

```js
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
  const t = parseThemes(CSS);
  assertEqual(t.light['--panel'], '#ffffff');
  assertEqual(t.dark['--panel'], '#1e2126');
  assertEqual(t.dark['--status-offen'], 'var(--accent)', 'nicht überschriebene Tokens kommen aus Light');
  assertEqual(t.print['--status-offen-bg'], '#e6f0fa');
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
});
```

In `tests/all.js` ergänzen: `import './contrast.test.js';`

- [ ] **Schritt 2: Tests laufen lassen → rot**

`node tests/run-node.js` → FAIL «Cannot find module …/tools/contrast.js».

- [ ] **Schritt 3: Tokens in `styles.css` ergänzen**

Im Light-`:root` nach `--radius`:

```css
  /* Abstände (4-px-Raster) und Schriftgrade (A.1) */
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem;
  --fs-xs: .75rem; --fs-sm: .85rem; --fs-md: 1rem; --fs-lg: 1.2rem; --fs-xl: 1.75rem; /* xl nur KPI-Wert */
  /* Status (semantisch, an bestehende Tokens gebunden); Flächen 12–15 % */
  --status-bestanden: var(--ok);      --status-bestanden-bg: #edf8f0;
  --status-nicht: var(--danger);      --status-nicht-bg: var(--danger-bg);
  --status-offen: var(--accent);      --status-offen-bg: #e6f0fa;
  --status-passiv: var(--warn);       --status-passiv-bg: var(--warn-bg);
  --status-geplant: #5b4bc4;          --status-geplant-bg: #eeebfb;
  /* Differenz zum Benchmark */
  --delta-pos: var(--ok); --delta-neg: var(--danger); --delta-neutral: var(--muted);
  /* Datenbalken in Tabellen: Fallback zuerst, color-mix überschreibt, wo unterstützt (Chrome/Edge ≥ 111) */
  --bar: rgba(11, 95, 165, .18);
```

und direkt nach dem `:root`-Block:

```css
@supports (color: color-mix(in srgb, red, blue)) {
  :root { --bar: color-mix(in srgb, var(--accent) 18%, transparent); }
}
```

Hinweis: `#6b5bd6` aus Anhang A2 erreicht auf `#eeebfb` nur ≈ 4.3:1; `#5b4bc4` liefert ≈ 5.5:1 (der Startwert wird durch das Werkzeug in Schritt 5 bestätigt). `#e3f5e8` mit `--ok` erreicht ≈ 4.5:1 knapp nicht; `#edf8f0` ≈ 4.7:1.

Im Dark-`:root` ergänzen:

```css
    --status-bestanden-bg: #1f3a2a; --status-nicht-bg: var(--danger-bg); --status-offen-bg: #1f2f44;
    --status-passiv-bg: var(--warn-bg); --status-geplant: #a89cf5; --status-geplant-bg: #2b2740;
    --bar: rgba(106, 166, 230, .22);
```

Im Print-`:root` ergänzen (Balken hell und grau, Status wie Light):

```css
    --bar: rgba(0, 0, 0, .12); --status-geplant: #5b4bc4; --status-geplant-bg: #eeebfb; --status-bestanden-bg: #edf8f0; --status-offen-bg: #e6f0fa;
```

- [ ] **Schritt 4: `tools/contrast.js` schreiben**

```js
#!/usr/bin/env node
// tools/contrast.js – Kontrastprüfung der Farb-Tokens in styles.css (Light, Dark, Druck) nach WCAG 2.x.
// Reine Funktionen (auch im Browser-Testlauf importierbar); CLI nur unter Node: node tools/contrast.js [styles.css]
// Exit-Code 1, sobald ein Paar sein Minimum unterschreitet. Aufruf im CI-Job «tests».

export const PAIRS = [
  // Text auf Fläche (≥ 4.5:1)
  ...['--bg', '--panel', '--panel-2', '--th-bg', '--hover', '--nav-bg'].map((bg) => ({ fg: '--text', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--muted', bg, min: 4.5 })),
  ...['--bg', '--panel', '--panel-2'].map((bg) => ({ fg: '--accent', bg, min: 4.5 })),
  { fg: '--on-accent', bg: '--accent', min: 4.5 }, { fg: '--on-accent', bg: '--accent-dark', min: 4.5 },
  { fg: '--danger', bg: '--danger-bg', min: 4.5 }, { fg: '--danger', bg: '--panel', min: 4.5 },
  { fg: '--warn', bg: '--warn-bg', min: 4.5 }, { fg: '--warn', bg: '--panel', min: 4.5 }, { fg: '--ok', bg: '--panel', min: 4.5 },
  ...['bestanden', 'nicht', 'offen', 'passiv', 'geplant'].flatMap((s) => [
    { fg: '--status-' + s, bg: '--status-' + s + '-bg', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel', min: 4.5 },
    { fg: '--status-' + s, bg: '--panel-2', min: 4.5 },
  ]),
  ...['pos', 'neg', 'neutral'].flatMap((d) => [{ fg: '--delta-' + d, bg: '--panel', min: 4.5 }, { fg: '--delta-' + d, bg: '--panel-2', min: 4.5 }]),
  // Linien und Marker (≥ 3:1): aktiver Unterstrich, Diagrammreihen, Statusmarker
  { fg: '--accent', bg: '--panel', min: 3 },
  ...['--series-1', '--series-2', '--series-3'].map((fg) => ({ fg, bg: '--panel', min: 3 })),
  { fg: '--viz-tick', bg: '--panel', min: 3, note: 'Achsenbeschriftung Diagramm (Datenviz-Konvention 3:1, bestehende Palette)' },
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

function declarations(block) {
  const out = {};
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

// Erster :root-Block eines Textausschnitts (Klammern gezählt)
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

function mediaBlock(text, query) {
  const start = text.indexOf(query);
  return start < 0 ? '' : text.slice(start);
}

export function parseThemes(cssText) {
  const light = declarations(rootBlock(cssText));
  const dark = { ...light, ...declarations(rootBlock(mediaBlock(cssText, '@media (prefers-color-scheme: dark)'))) };
  const print = { ...light, ...declarations(rootBlock(mediaBlock(cssText, '@media print'))) };
  return { light, dark, print };
}

export function resolveColor(tokens, value, depth = 0) {
  if (!value || depth > 10) return null;
  const v = value.trim();
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(v);
  if (ref) return resolveColor(tokens, tokens[ref[1]], depth + 1);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return ('#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]).toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*1(?:\.0+)?\s*)?\)$/i.exec(v);
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return null; // color-mix, transparente Werte und Unbekanntes: nicht prüfbar
}

export function checkContrast(cssText) {
  const themes = parseThemes(cssText);
  const results = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const p of PAIRS) {
      const fg = resolveColor(tokens, tokens[p.fg]);
      const bg = resolveColor(tokens, tokens[p.bg]);
      if (!fg || !bg) { results.push({ theme, fg: p.fg, bg: p.bg, ratio: null, min: p.min, ok: false, note: 'Token fehlt oder nicht auflösbar' }); continue; }
      const ratio = contrastRatio(fg, bg);
      results.push({ theme, fg: p.fg, bg: p.bg, ratio, min: p.min, ok: ratio >= p.min, note: p.note || '' });
    }
  }
  return { results, failures: results.filter((r) => !r.ok) };
}

const isMain = typeof process !== 'undefined' && Array.isArray(process.argv) && /contrast\.js$/.test(String(process.argv[1] || '').replace(/\\/g, '/'));
if (isMain) {
  const { readFileSync } = await import('node:fs');
  const path = process.argv[2] || new URL('../styles.css', import.meta.url);
  const { results, failures } = checkContrast(readFileSync(path, 'utf8'));
  for (const r of results) console.log((r.ok ? '  ok   ' : '  FAIL ') + r.theme.padEnd(5) + ' ' + r.fg + ' auf ' + r.bg + ': ' + (r.ratio ? r.ratio.toFixed(2) + ':1' : '–') + ' (min ' + r.min + ')' + (r.note ? ' – ' + r.note : ''));
  console.log('\n' + (results.length - failures.length) + '/' + results.length + ' Paare erfüllen das Minimum.');
  process.exit(failures.length ? 1 : 0);
}
```

- [ ] **Schritt 5: Tests und Werkzeug laufen lassen**

`node tests/run-node.js` → alle grün. `node tools/contrast.js` → alle Paare ok; fällt ein Paar durch, den Token-Wert anpassen (nicht das Minimum), bis das Werkzeug grün ist. Werte im Bericht nennen.

- [ ] **Schritt 6: CI-Schritt ergänzen** (`.github/workflows/tests.yml`, Job `tests`, nach «Tests (tests/run-node.js)»):

```yaml
      - name: Kontrast der Farb-Tokens (Light, Dark, Druck)
        run: node tools/contrast.js
```

- [ ] **Schritt 7: Smoke-Test, Snapshot, Commit**

`node tests/smoke/run.mjs` (mit `SMOKE_CHROMIUM`) grün, `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json` identisch.

```bash
git add styles.css tools/contrast.js tests/contrast.test.js tests/all.js .github/workflows/tests.yml
git commit -m "Design-Tokens für Abstände, Schriftgrade, Status, Delta und Datenbalken; Kontrastprüfung tools/contrast.js in der CI"
git push
```

---

### Task 2 (Schritt A.3): Shell – Datenstand, Navigation mit Gruppen, Untertitel

**Dateien:**
- Ändern: `index.html` (Untertitel, `#datastand`), `app.js` (`renderStatus()`, `renderNav()`, `VIEWS`, `KPI_VIEWS`), `styles.css` (`.datastand`, `.views`, `.nav-group`, `.view`, `.visually-hidden`), alle `views/*.js` (`export const group`), `tests/smoke/run.mjs`
- Erstellen: `tests/views-meta.test.js`

**Schnittstellen:**
- Erzeugt: je View-Modul `export const group = 'Kennzahlen' | 'Personen' | 'Experten' | 'Daten'`; in `app.js` `NAV_GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten']`, `VIEWS[i].group`; DOM `nav#nav > div.nav-group[aria-label] > span.nav-group-label + div.nav-links > a`; `details#datastand.datastand > summary + dl.datastand-list`; Klasse `.visually-hidden`.
- Nutzt: `meta.counts` (Schlüssel `zeilen, first, issued, vorgaenge, personen, duplikate, offen, nichtErfasst, fehler, hinweise, nichtAusgewertet, schluesselOhneGeburtsdatum`), `eligible(persons)`, `fmtDateTime`, `fmtTime`.

- [ ] **Schritt 1: Test für die View-Metadaten (`tests/views-meta.test.js`)**

```js
import { test, assert, assertEqual } from './runner.js';
import * as overview from '../views/overview.js';
import * as written from '../views/written.js';
import * as oral from '../views/oral.js';
import * as vssVsm from '../views/vssVsm.js';
import * as zeitverlauf from '../views/zeitverlauf.js';
import * as historie from '../views/historie.js';
import * as ranking from '../views/ranking.js';
import * as bankReport from '../views/bankReport.js';
import * as offen from '../views/offen.js';
import * as planned from '../views/planned.js';
import * as glossar from '../views/glossar.js';

export const VIEW_MODULES = { overview, written, oral, vssVsm, zeitverlauf, historie, ranking, bankReport, offen, planned, glossar };
const GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten'];

test('views: jede View hat id, label und eine der vier Navigationsgruppen (A.2)', () => {
  for (const [name, v] of Object.entries(VIEW_MODULES)) {
    assert(typeof v.id === 'string' && v.id && typeof v.label === 'string' && v.label, name);
    assert(GROUPS.includes(v.group), name + ': Gruppe «' + v.group + '»');
  }
  assertEqual(new Set(Object.values(VIEW_MODULES).map((v) => v.id)).size, Object.keys(VIEW_MODULES).length, 'ids eindeutig');
  assertEqual(overview.group, 'Kennzahlen');
  assertEqual(offen.group, 'Personen');
  assertEqual(historie.group, 'Daten');
});
```

In `tests/all.js` ergänzen: `import './views-meta.test.js';` (Views laden in Node, weil sie `document` nur in Funktionen verwenden; Kontrolle: `node tests/run-node.js` bricht nicht beim Import ab.)

- [ ] **Schritt 2: Test laufen lassen → rot** («Gruppe «undefined»»).

- [ ] **Schritt 3: `group` in jedem View-Modul exportieren**

`overview`, `written`, `oral`, `vssVsm`, `zeitverlauf`, `bankReport` → `'Kennzahlen'`; `offen`, `planned`, `ranking` → `'Personen'`; `historie`, `glossar` → `'Daten'`. In `app.js`:

```js
const KPI_VIEWS = [overview, written, oral, vssVsm, zeitverlauf, bankReport, offen, planned, ranking, historie];
const VIEWS = KPI_VIEWS.map((v) => ({ id: v.id, label: v.label, group: v.group, build: v.build, noPersonExport: !!v.noPersonExport }))
  .concat([{ id: 'datenqualitaet', label: 'Datenqualität', group: 'Daten' }, { id: glossar.id, label: glossar.label, group: glossar.group, build: glossar.build, isStatic: true }]);
const NAV_GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten'];
```

- [ ] **Schritt 4: `renderNav()` mit Gruppen**

```js
function renderNav() {
  const current = viewFromHash();
  const { filter, ui: uiState } = store.getState();
  const groups = NAV_GROUPS.map((name) => ({ name, views: VIEWS.filter((v) => v.group === name) })).filter((g) => g.views.length);
  ui.nav.replaceChildren(...groups.map((g) => el('div', { class: 'nav-group', role: 'group', 'aria-label': g.name }, [
    el('span', { class: 'nav-group-label', 'aria-hidden': 'true', text: g.name }),
    el('div', { class: 'nav-links' }, g.views.map((v) => {
      const a = el('a', { href: buildHash(v.id, filter, uiState), text: v.label, class: v.id === current ? 'active' : null });
      if (v.id === current) a.setAttribute('aria-current', 'page');
      return a;
    })),
  ])));
}
```

- [ ] **Schritt 5: Datenstand (`index.html`, `renderStatus()`)**

`index.html`: Untertitel `Reporting KUBA`; in `.databar` nach `#status`: `<details id="datastand" class="datastand" hidden></details>`.

`renderStatus(text)`: Volltext wie heute in `#status` (bleibt `aria-live`). Zusätzlich:

```js
function renderDatastand() {
  const { meta, persons } = store.getState();
  const box = ui.datastand;
  if (!hasData() || busy) { box.hidden = true; ui.status.classList.remove('visually-hidden'); return; }
  const c = meta.counts || {};
  const fehler = c.fehler || 0;
  const summary = el('summary', {}, [
    'Datenstand: ' + meta.fileName + ' · geändert ' + (fmtDateTime(meta.lastModified) || '–') + ' · geladen ' + (fmtTime(meta.loadedAt) || '–') + ' · ' + (c.zeilen || persons.length) + ' Zeilen · ',
    el('span', { class: fehler ? 'warn' : null, text: 'DQ ' + fehler + ' Fehler' }),
  ]);
  const rows = [
    ['Zeilen je Sheet', (c.first || 0) + ' First Certification · ' + (c.issued || 0) + ' Ausgestellte Zertifikate'],
    ['Vorgänge / Personen / Duplikate', (c.vorgaenge || 0) + ' / ' + (c.personen || 0) + ' / ' + (c.duplikate || 0)],
    ['Kennzahlrelevant', String(eligible(persons).length)],
    ['Offen / nicht erfasst', (c.offen || 0) + ' / ' + (c.nichtErfasst || 0)],
    ['Data-Quality-Log', fehler + ' Fehler · ' + (c.hinweise || 0) + ' Hinweise · ' + (c.nichtAusgewertet || 0) + ' nicht ausgewertet'],
    ['Schlüssel ohne Geburtsdatum', String(c.schluesselOhneGeburtsdatum || 0)],
    ['Quelle', meta.source === 'file' ? 'lokale Datei (nur im Browser)' : 'SharePoint'],
  ];
  box.replaceChildren(summary, el('dl', { class: 'datastand-list' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
  box.hidden = false;
  ui.status.classList.add('visually-hidden'); // Volltext bleibt für aria-live und Smoke-Test
}
```

Aufruf am Ende von `renderStatus()`; `ui.datastand = $('datastand')` in `init()`. Beim Laden (`text` gesetzt) bleibt `#status` sichtbar mit ⏳.

- [ ] **Schritt 6: CSS**

```css
.visually-hidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.datastand summary { cursor: pointer; color: var(--muted); }
.datastand summary .warn { color: var(--warn); font-weight: 600; }
.datastand-list { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-4); margin: var(--space-2) 0 0; font-size: var(--fs-sm); }
.datastand-list dt { color: var(--muted); } .datastand-list dd { margin: 0; }
/* Navigation: Gruppen in einer Zeile, darunter Links; nie umbrechend, horizontal scrollbar */
.views { display: flex; gap: var(--space-5); flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; padding: var(--space-2) 1.25rem 0; background: var(--panel); border-bottom: 1px solid var(--border); }
.nav-group { display: flex; flex-direction: column; gap: var(--space-1); scroll-snap-align: start; }
.nav-group-label { font-size: var(--fs-xs); letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.nav-links { display: flex; gap: var(--space-1); }
.views a { padding: var(--space-2) var(--space-3); border: none; border-bottom: 2px solid transparent; border-radius: 0; background: none; color: var(--text); text-decoration: none; white-space: nowrap; }
.views a:hover { background: var(--hover); }
.views a.active { color: var(--accent); font-weight: 600; border-bottom-color: var(--accent); background: none; }
.view { border-radius: var(--radius); margin-top: var(--space-4); }
```

Die bisherigen `.views a`-Regeln (Reiter-Optik) entfernen.

- [ ] **Schritt 7: Smoke-Test ergänzen** (nach «Navigation gerendert»):

```js
  check((await page.locator('#nav .nav-group').count()) >= 3 && (await page.locator('#nav .nav-group[aria-label="Kennzahlen"] a').count()) === 6, 'Navigation in Gruppen (Kennzahlen · Personen · Daten)');
```

und nach «Datei geladen»:

```js
  check((await page.locator('#datastand summary').textContent()).startsWith('Datenstand: synth.xlsx') && (await page.locator('#datastand dl dt').count()) >= 6, 'Datenstand: Einzeiler mit Details');
```

- [ ] **Schritt 8: Tests, Smoke, Snapshot, Commit**

```bash
git add index.html app.js styles.css views/*.js tests/views-meta.test.js tests/all.js tests/smoke/run.mjs
git commit -m "Shell: Datenstand als Einzeiler mit Details, Navigation in vier Gruppen, Untertitel «Reporting KUBA»"
git push
```

---

### Task 3 (Schritt A.4): Filterleiste – Jahr-Select, Sticky, Chips, Reset

**Dateien:**
- Erstellen: `filterChips.js`, `tests/filterChips.test.js`
- Ändern: `app.js` (`buildFilterBar()`, `updateFilterBar()`, `isYear()` entfällt), `styles.css`, `tests/smoke/run.mjs`, `tests/all.js`

**Schnittstellen:**
- Erzeugt (`filterChips.js`):
  - `yearOf(filter) → number | null` (Von = 1.1., Bis = 31.12. desselben Jahres).
  - `filterChips(filter, { modeVisible = false } = {}) → [{ key, label, ariaLabel, reset }]`, `reset` = Teilzustand für `store.setFilter()`. Reihenfolge: Zeitraum (`'2026'` bzw. `'01.01.2026 – 31.03.2026'`, reset `{ from: null, to: null }`), Profil je Wert (`'Profil PK'`, reset `{ profil: übrige }`), Sprache, Bank, VSS/VSM (`'Nur VSS'`), Versuche (`'Nur 1. Versuch'`), Zertifikate (`'Nur ausgestellte Zertifikate'`); Wertung nie (nur Bestenlisten).
  - `fmtDate` aus `export.js` für Datumsangaben, `DEFAULT_FILTER` aus `metrics.js`. Chip-Beschriftungen wie die Optionen der Auswahlfelder («Nur VSS», «Ohne VSS/VSM», «Nur 1. Versuch», «Mehrere Versuche») als lokale Maps in `filterChips.js`; die kleingeschriebenen Export-Beschriftungen in `export.js` (`nur VSS`, `ohne VSS/VSM`) bleiben unverändert.
- DOM: `#filterbar label:has-text("Jahr") select` (Optionen `''` = Alle, Jahre, bei freiem Zeitraum eine zusätzliche Option `'range'` «Von–Bis»), `#filterbar .summary` = `<span class="summary-count">479 Vorgänge · 479 Personen</span><span class="chips">…</span>`, Chips als `button.chip[aria-label="Filter Profil PK entfernen"]`, Reset `button.reset[hidden]` wenn keine Chips.

- [ ] **Schritt 1: Tests (`tests/filterChips.test.js`)**

```js
import { test, assertEqual } from './runner.js';
import { DEFAULT_FILTER } from '../metrics.js';
import { yearOf, filterChips } from '../filterChips.js';

const f = (o) => ({ ...DEFAULT_FILTER, profil: [], sprache: [], bank: [], ...o });

test('filterChips.yearOf: ganzes Jahr erkannt, sonst null', () => {
  assertEqual(yearOf(f({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) })), 2026);
  assertEqual(yearOf(f({ from: new Date(2026, 0, 1), to: new Date(2026, 2, 31) })), null);
  assertEqual(yearOf(f({})), null);
});

test('filterChips: keine Chips im Standard; je aktive Einschränkung ein Chip mit Rücksetz-Teilzustand', () => {
  assertEqual(filterChips(f({})), []);
  const chips = filterChips(f({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31), profil: ['PK', 'IK'], vssVsm: 'ohne', onlyIssued: true }));
  assertEqual(chips.map((c) => c.label), ['2026', 'Profil PK', 'Profil IK', 'Ohne VSS/VSM', 'Nur ausgestellte Zertifikate']);
  assertEqual(chips[0].reset, { from: null, to: null });
  assertEqual(chips[1].reset, { profil: ['IK'] });
  assertEqual(chips[3].reset, { vssVsm: 'alle' });
  assertEqual(chips[4].ariaLabel, 'Filter Nur ausgestellte Zertifikate entfernen');
});

test('filterChips: freier Zeitraum als Von–Bis, Wertung nie als Chip', () => {
  const chips = filterChips(f({ from: new Date(2026, 0, 1), to: new Date(2026, 2, 31), mode: 'bestanden' }));
  assertEqual(chips.map((c) => c.label), ['01.01.2026 – 31.03.2026']);
});
```

- [ ] **Schritt 2: rot** → **Schritt 3: `filterChips.js`**

```js
// filterChips.js – aktive Filter als Chips (reine Funktionen, kein DOM). Ein Chip je Einschränkung gegenüber DEFAULT_FILTER;
// reset = Teilzustand für store.setFilter(), der genau diesen Chip entfernt. Die Wertung (Bestenlisten) ist nie ein Chip.
import { DEFAULT_FILTER } from './metrics.js';
import { fmtDate } from './export.js';

// Beschriftungen wie die Optionen der Auswahlfelder in app.js
const VSS_VSM_LABELS = { vss: 'Nur VSS', vsm: 'Nur VSM', ohne: 'Ohne VSS/VSM' };
const VERSUCHE_LABELS = { erstversuch: 'Nur 1. Versuch', mehrere: 'Mehrere Versuche' };

export function yearOf(filter) {
  const { from, to } = filter;
  if (!(from instanceof Date) || !(to instanceof Date)) return null;
  const y = from.getFullYear();
  return from.getMonth() === 0 && from.getDate() === 1 && to.getFullYear() === y && to.getMonth() === 11 && to.getDate() === 31 ? y : null;
}

const chip = (key, label, reset) => ({ key, label, ariaLabel: 'Filter ' + label + ' entfernen', reset });

export function filterChips(filter) {
  const out = [];
  if (filter.from || filter.to) {
    const y = yearOf(filter);
    out.push(chip('zeitraum', y ? String(y) : (fmtDate(filter.from) || '…') + ' – ' + (fmtDate(filter.to) || '…'), { from: null, to: null }));
  }
  for (const [key, name] of [['profil', 'Profil'], ['sprache', 'Sprache'], ['bank', 'Bank']]) {
    for (const v of filter[key] || []) out.push(chip(key + ':' + v, name + ' ' + v, { [key]: filter[key].filter((x) => x !== v) }));
  }
  if (filter.vssVsm !== DEFAULT_FILTER.vssVsm) out.push(chip('vssVsm', VSS_VSM_LABELS[filter.vssVsm] || filter.vssVsm, { vssVsm: DEFAULT_FILTER.vssVsm }));
  if (filter.versuche !== DEFAULT_FILTER.versuche) out.push(chip('versuche', VERSUCHE_LABELS[filter.versuche] || filter.versuche, { versuche: DEFAULT_FILTER.versuche }));
  if (filter.onlyIssued) out.push(chip('zertifikate', 'Nur ausgestellte Zertifikate', { onlyIssued: false }));
  return out;
}
```

- [ ] **Schritt 4: `buildFilterBar()` / `updateFilterBar()` in `app.js`**

- Jahr: `c.jahr = el('select', { onchange: (ev) => { const v = ev.target.value; if (v === '') set({ from: null, to: null }); else if (v !== 'range') set({ from: new Date(Number(v), 0, 1), to: new Date(Number(v), 11, 31) }); } })` mit Optionen `''`/«Alle» + Jahre; `c.years`/`isYear()` entfernen.
- `updateFilterBar()`: `const y = yearOf(filter); const custom = !y && (filter.from || filter.to); const rangeOpt = c.jahr.querySelector('option[value="range"]'); if (custom && !rangeOpt) c.jahr.appendChild(el('option', { value: 'range', text: 'Von–Bis' })); else if (!custom && rangeOpt) rangeOpt.remove(); c.jahr.value = custom ? 'range' : (y ? String(y) : '');`
- Zusammenfassung: `c.summary` enthält `c.count = el('span', { class: 'summary-count' })` und `c.chips = el('span', { class: 'chips' })`; in `updateFilterBar()`: `c.count.textContent = filtered.length + ' Vorgänge · ' + personCount(filtered) + ' Personen' + multi;` und `c.chips.replaceChildren(...filterChips(filter).map((ch) => el('button', { type: 'button', class: 'chip', 'aria-label': ch.ariaLabel, onclick: () => set(ch.reset) }, [ch.label, el('span', { 'aria-hidden': 'true', text: ' ✕' })])))`; `c.reset.hidden = filterChips(filter).length === 0`.
- Reihenfolge der Steuerelemente: Von · Bis · Jahr · Profil · Sprache · Bank · VSS/VSM · Versuche · Zertifikate · Reset · Summary.
- Exporte behalten `filterLines()` (unverändert).

- [ ] **Schritt 5: CSS**

```css
.filterbar { position: sticky; top: 0; z-index: 3; box-shadow: 0 1px 0 var(--border); gap: var(--space-2) var(--space-3); }
.filterbar .summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: .15rem; padding: .1rem var(--space-2); border: 1px solid var(--accent); border-radius: 999px; background: var(--status-offen-bg); color: var(--accent); font-size: var(--fs-sm); cursor: pointer; }
.chip:hover { background: var(--hover); }
```

- [ ] **Schritt 6: Smoke-Test anpassen**

Zeile «Filter Profil = PK wirkt»: `check((await page.locator('#filterbar .chip', { hasText: 'Profil PK' }).count()) === 1 && /profil=PK/.test(page.url()), …)`; nach «Filter zurücksetzen»: `await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });` (ersetzt «Profil: alle» und «Bank: alle»). Neue Prüfungen: Jahr-Select wählt 2026 → Chip «2026» und URL `von=2026-01-01`; Klick auf ✕ des Chips entfernt nur diesen Filter; Reset-Button `hidden`, wenn keine Chips: `check(await page.locator('#filterbar button.reset').isHidden(), 'Reset nur bei aktivem Filter')`. Fokus: nach `selectOption` auf Profil bleibt `document.activeElement` das Profil-Select.

- [ ] **Schritt 7: Tests, Smoke, Snapshot, Commit**

```bash
git add filterChips.js tests/filterChips.test.js tests/all.js app.js export.js styles.css tests/smoke/run.mjs
git commit -m "Filterleiste: Jahr als Auswahlfeld, Chips für aktive Filter, Reset nur bei Abweichung, sticky"
git push
```

---

### Task 4 (Schritt A.5): View-Kopf – Kurzbeschreibung, Export-Menü, Glossar-Anker, Hinweise

**Dateien:**
- Ändern: `glossary.js` (`glossarySlug`), `views/glossar.js` (`id` je Begriff), `views/common.js` (`renderExportMenu()` ersetzt `exportBar()`, `section()` mit ⓘ), alle `views/*.js` (`intro`, `glossar`, `hints`), `app.js` (`renderView()`: View-Kopf, Legende, Glossar-Sprung), `styles.css`, `tests/glossary.test.js`, `tests/views-meta.test.js`, `tests/smoke/run.mjs`

**Schnittstellen:**
- `glossarySlug(term) → string`: Kleinschreibung, `ä ö ü → ae oe ue`, `ß → ss`, alles ausser `[a-z0-9]` → `-`, Mehrfach-`-` gekürzt, Ränder getrimmt. `glossaryAnchor(term) → 'glossar-' + slug`.
- View-Modul: `export const intro = '…'` (≤ 160 Zeichen, ein Satz), `export const glossar = '<Glossar-Begriff>'`; `build(ctx)` liefert zusätzlich `hints: string[]` (verschobene Einleitungs- und Section-Absätze).
- `renderExportMenu({ viewId, tables, headerLines, extra })` → `details.menu.export-menu`; `section(title, nodes, { info })` → `h3` mit `span.info[title=info]`, kein Absatz.
- Glossar-Sprung: Link `#glossar?begriff=<slug>`; `app.js` liest nach dem Rendern der Glossar-Ansicht `begriff` aus dem Hash und ruft `scrollIntoView()` + `focus()` auf dem Element `#glossar-<slug>` (`tabindex="-1"`); `syncHash()` entfernt den Parameter danach (kein Zustand in der URL).

- [ ] **Schritt 1: Tests**

`tests/glossary.test.js` ergänzen:

```js
import { glossarySlug } from '../glossary.js';
test('glossary.glossarySlug: Umlaute, ß, Sonderzeichen; Slugs aller Begriffe eindeutig', () => {
  assertEqual(glossarySlug('Mündlich: bestanden'), 'muendlich-bestanden');
  assertEqual(glossarySlug('Passiv (> 365 Tage)'), 'passiv-365-tage');
  assertEqual(glossarySlug('Wertung «Resultat 1. Versuch» / «Resultat bestandener Run»'), 'wertung-resultat-1-versuch-resultat-bestandener-run');
  const slugs = glossaryTerms().map(glossarySlug);
  assertEqual(new Set(slugs).size, slugs.length, 'Slugs eindeutig');
});
```

`tests/views-meta.test.js` ergänzen:

```js
import { glossaryEntry } from '../glossary.js';
test('views: Kurzbeschreibung ≤ 160 Zeichen und Glossar-Begriff vorhanden (A.3)', () => {
  for (const [name, v] of Object.entries(VIEW_MODULES)) {
    assert(typeof v.intro === 'string' && v.intro.length > 20 && v.intro.length <= 160, name + ': intro (' + (v.intro || '').length + ')');
    if (v.id !== 'glossar') assert(glossaryEntry(v.glossar), name + ': Glossar-Begriff «' + v.glossar + '»');
  }
});
```

- [ ] **Schritt 2: rot** → **Schritt 3: `glossarySlug`, Anker im Glossar**

`glossary.js`: `export function glossarySlug(term) { return String(term).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }` und `export const glossaryAnchor = (term) => 'glossar-' + glossarySlug(term);`

`views/glossar.js`: nach `renderTable(...)` je `tbody tr` das Attribut `id = glossaryAnchor(rows[i].term)` und `tabindex="-1"` setzen (Reihenfolge der Zeilen = Reihenfolge der Modelle).

- [ ] **Schritt 4: View-Metadaten und Hinweise je View**

Je Modul `intro` (≤ 160 Zeichen) und `glossar`:

| View | intro (Vorschlag) | glossar |
|---|---|---|
| overview | Kennzahlen der Vorgänge mit absolviertem schriftlichem Run im Filter; Quoten auf abgeschlossene Vorgänge, Personen zählen Menschen. | Kennzahlrelevant (Grundgesamtheit) |
| written | Bestehensquoten und Ø Resultat schriftlich nach Profil, Sprache, Bank und Teilprüfung; beide Wertungen nebeneinander. | Schriftlich: im 1. Versuch bestanden |
| oral | Bestehensquote mündlich, Anteil 1× und 2× durchgefallen, Ø Resultat nach Profil, Sprache und Bank. | Mündlich: bestanden |
| vssVsm | Bestehensquoten schriftlich und mündlich für VSS, VSM und ohne Kennzeichnung, je Profil. | VSS / VSM (Kennzeichnung) |
| zeitverlauf | Kennzahlen je Jahr des Referenzdatums, zwei Jahre im Vergleich, Schwierigkeit je Teilprüfung; der Zeitraumfilter wirkt hier nicht. | Zeitverlauf (Ansicht) |
| historie | Snapshots der Aggregate erzeugen, laden und Stichtage vergleichen; ohne Namen, ohne Filter, nichts im Browser gespeichert. | Snapshot (Historisierung) |
| ranking | Top-Listen je Profil für bbz-Award, schriftliche und mündliche Prüfung mit Begründung je Rang; mit Namen, nur intern. | bbz-Award |
| bankReport | Kennzahlen einer gewählten Bank gegen den anonymen Benchmark aller Banken; für die Weitergabe an das Institut. | Bank-Report |
| offen | Laufende Zertifizierungsprozesse mit fehlenden Teilen, Frühwarnung und passiven Vorgängen; Zeitraum und Versuche wirken nicht. | Offene Vorgänge (Ansicht) |
| planned | Termine in der Zukunft ohne Ergebnis, schriftlich und mündlich, je Tag und Ort mit Teilnehmenden; mit Namen. | Geplante Prüfung |
| glossar | Verbindliche Definitionen aller Begriffe und Kennzahlen, identisch mit README.md. | – |
| datenqualitaet (in `app.js`) | Jede nicht interpretierbare oder auffällige Zelle mit Wirkung, Stufe, Fundstelle und Grund; unabhängig vom Filter. | Data-Quality-Stufen |

In jedem `build()`: den ersten `p.meta-list` entfernen und seinen Text in `hints` aufnehmen; `section(title, nodes, { intro })` → `section(title, nodes, { info: intro })` und `hints.push(title + ': ' + intro)`; Rückgabe `{ nodes, tables, hints }`.

- [ ] **Schritt 5: `views/common.js`**

```js
export function section(title, nodes, { info = null } = {}) {
  const head = el('h3', {}, [title, info ? el('span', { class: 'info', title: info, 'aria-label': 'Hinweis: ' + info, text: ' ⓘ' }) : null]);
  return el('section', { class: 'block' }, [head].concat(nodes));
}

// Export-Menü (A.3): ein Aufklappmenü statt Button-Leiste; Vorgangsebene (mit Namen) getrennt gekennzeichnet
export function renderExportMenu({ viewId, tables, headerLines, extra = null }) {
  const disabled = !tables.length;
  const menu = el('details', { class: 'menu export-menu' });
  const item = (text, onclick, dis = false) => el('button', { type: 'button', class: 'menu-item', disabled: dis, text, onclick: () => { menu.open = false; onclick(); } });
  const items = [
    item('CSV (Aggregate)', () => downloadCsv(exportFileName(viewId, 'csv'), tablesToCsv(tables, headerLines)), disabled),
    item('XLSX (Aggregate)', () => downloadXlsx(exportFileName(viewId, 'xlsx'), tables, headerLines), disabled),
    item('Druckansicht', () => printPage()),
  ];
  if (extra && extra.tables && extra.tables.length) {
    const rows = extra.tables[0].rows.length;
    items.push(el('div', { class: 'menu-note', text: extra.label + ' (' + rows + ' Vorgänge, mit Namen, nur intern)' }),
      item('CSV (Vorgangsebene)', () => downloadCsv(exportFileName(viewId + '-vorgaenge', 'csv'), tablesToCsv(extra.tables, headerLines)), !rows),
      item('XLSX (Vorgangsebene)', () => downloadXlsx(exportFileName(viewId + '-vorgaenge', 'xlsx'), extra.tables, headerLines), !rows));
  }
  menu.append(el('summary', { text: 'Export' }), el('div', { class: 'menu-list', role: 'group', 'aria-label': 'Export' }, items));
  return menu;
}
```

`exportBar()` entfernen (Aufrufer: `app.js` zweimal).

- [ ] **Schritt 6: `renderView()` in `app.js`**

Nach `h2`: `el('div', { class: 'view-head' }, [el('div', {}, [h2, el('p', { class: 'view-intro', text: view.intro })]), el('div', { class: 'view-actions' }, [renderExportMenu(...), view.glossar ? el('a', { class: 'link-definitionen', href: '#glossar?begriff=' + glossarySlug(view.glossar), text: 'Definitionen' }) : null])])`. Für `datenqualitaet` `intro`/`glossar` aus der Tabelle oben in `VIEWS` eintragen. Am Ende der View: `const hints = (built.hints || []); if (hints.length) container.appendChild(renderCollapsible('Hinweise zu dieser Ansicht', hints.map((h) => el('p', { text: h })), { printOpen: true }));` (Task 6 führt diesen Block mit den Tabellen-Notizen zur einen Legende zusammen). Glossar-Sprung: nach dem Rendern der statischen Ansicht `const jump = new URLSearchParams((location.hash.split('?')[1] || '')).get('begriff'); if (jump) { const target = document.getElementById('glossar-' + jump); if (target) { target.scrollIntoView({ block: 'start' }); target.focus(); } }` – `parseHash()` ignoriert unbekannte Parameter (Test in `tests/urlState.test.js`: `parseHash('#glossar?begriff=vorgaenge').view === 'glossar'`).

- [ ] **Schritt 7: CSS**

```css
.view-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-3); }
.view-intro { color: var(--muted); margin: var(--space-1) 0 0; max-width: 60rem; }
.view-actions { display: flex; align-items: center; gap: var(--space-3); }
.menu { position: relative; } .menu > summary { list-style: none; cursor: pointer; padding: .35rem var(--space-3); border: 1px solid var(--accent); border-radius: var(--radius); color: var(--accent); background: var(--panel); }
.menu > summary::after { content: ' ▾'; } .menu[open] > summary { background: var(--hover); }
.menu-list { position: absolute; right: 0; z-index: 4; min-width: 16rem; margin-top: var(--space-1); padding: var(--space-1); background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 16px var(--shadow); display: flex; flex-direction: column; }
.menu-item { text-align: left; background: none; border: none; color: var(--text); padding: var(--space-2) var(--space-3); border-radius: var(--radius); }
.menu-item:hover:not(:disabled) { background: var(--hover); } .menu-note { color: var(--muted); font-size: var(--fs-xs); padding: var(--space-2) var(--space-3) 0; }
.info { color: var(--muted); font-size: var(--fs-sm); cursor: help; }
h3 .info { font-weight: 400; }
```

- [ ] **Schritt 8: Smoke-Test**

Nach der Ansichten-Schleife: `check((await page.locator('#view .view-intro').count()) === 1 && (await page.locator('#view p.meta-list').count()) === 0, 'View-Kopf: Kurzbeschreibung, kein Einleitungsabsatz')`; Export-Menü per Tastatur: `await page.focus('#view details.menu > summary'); await page.keyboard.press('Enter'); check(await page.locator('#view details.menu[open] .menu-item').first().isVisible(), 'Export-Menü per Tastatur geöffnet')`; Glossar-Sprung: `await page.click('#view a.link-definitionen'); await page.waitForSelector('#view tr[id^="glossar-"]'); check(await page.evaluate(() => document.activeElement && document.activeElement.id.startsWith('glossar-')), 'Definitionen: Sprung ins Glossar mit Fokus')`.

- [ ] **Schritt 9: Tests, Smoke, Snapshot, Commit**

```bash
git add glossary.js views/*.js app.js styles.css tests/glossary.test.js tests/views-meta.test.js tests/urlState.test.js tests/smoke/run.mjs
git commit -m "View-Kopf: Kurzbeschreibung, Export-Menü statt Button-Leiste, Link «Definitionen» mit Glossar-Anker; Einleitungsabsätze in die Hinweise"
git push
```

---

### Task 5 (Schritt A.6): KPI-Kacheln – Gruppen, Richtung, Delta, ⓘ

**Dateien:**
- Ändern: `views/tables.js` (`overviewModel()`, `deltaView()`), `views/overview.js` (Delta, Gruppe «Geplante Prüfungstermine»), `views/common.js` (`renderKpis()`), `styles.css`, `tests/tables.test.js`, `tests/smoke/run.mjs`

**Schnittstellen:**
- KPI-Modell (`overviewModel().kpis[i]`): bisherige Felder + `group: 'Mengen' | 'Schriftlich' | 'Mündlich'`, `direction: 'up' | 'down' | 'neutral'`; in `views/overview.js` zusätzlich `delta` (Zahl in pp, `null` ohne Benchmark oder bei `kind === 'count'`), `benchmarkLabel`.
- `deltaView(delta, direction) → { symbol: '▲' | '▼' | '●', tone: 'pos' | 'neg' | 'neutral', text }` – `|delta| < 0.5` → `●`/`neutral`; sonst Symbol nach Vorzeichen, Ton nach Richtung (`up`: + → pos, − → neg; `down`: umgekehrt; `neutral` → neutral). `text = formatPp(delta)`.
- `renderKpis(kpis, { benchmarkLabel } = {})`: Kacheln mit `group` werden in Blöcken `section.kpi-group > h3 + div.kpis` gerendert (Reihenfolge Mengen · Schriftlich · Mündlich), ohne `group` wie heute eine Reihe. Kachel: `div.kpi[.count][.small]` > `div.kpi-label` (Link `a[href="#glossar?begriff=…"]`, wenn `glossaryEntry(label)` existiert, sonst Text) + `span.info[title=hint]` · `div.kpi-value` · `div.kpi-n` · `div.kpi-delta.pos|neg|neutral` (`▲ +2.1 pp vs. Alle Banken (66.0 %)`). Kein `kpi-hint`-Absatz mehr.

- [ ] **Schritt 1: Tests (`tests/tables.test.js`)**

```js
import { deltaView } from '../views/tables.js';
test('tables.overviewModel: Gruppe und Richtung je Kachel (A.4)', () => {
  const m = overviewModel(cohort());
  const by = Object.fromEntries(m.kpis.map((k) => [k.label, k]));
  assertEqual(by['Vorgänge'].group, 'Mengen'); assertEqual(by['Vorgänge'].direction, 'neutral');
  assertEqual(by['Schriftlich: im 1. Versuch bestanden'].group, 'Schriftlich'); assertEqual(by['Schriftlich: im 1. Versuch bestanden'].direction, 'up');
  assertEqual(by['Schriftlich: im 1. Versuch durchgefallen'].direction, 'down');
  assertEqual(by['Mündlich: 2× durchgefallen'].group, 'Mündlich'); assertEqual(by['Mündlich: 2× durchgefallen'].direction, 'down');
  assertEqual(by['Vorgänge passiv (> 365 Tage)'].direction, 'down');
  assertEqual(by['Mündlich: Ø Resultat bestandener Run'].direction, 'up');
  assert(m.kpis.every((k) => ['Mengen', 'Schriftlich', 'Mündlich'].includes(k.group)));
  assertEqual(m.kpis.filter((k) => k.group === 'Schriftlich').length, 5);
  assertEqual(m.kpis.filter((k) => k.group === 'Mündlich').length, 5);
});

test('tables.deltaView: Symbol nach Vorzeichen, Ton nach Richtung, ±0.5 pp neutral', () => {
  assertEqual(deltaView(2.1, 'up'), { symbol: '▲', tone: 'pos', text: '+2.1 pp' });
  assertEqual(deltaView(2.1, 'down'), { symbol: '▲', tone: 'neg', text: '+2.1 pp' });
  assertEqual(deltaView(-3, 'down'), { symbol: '▼', tone: 'pos', text: '−3.0 pp' });
  assertEqual(deltaView(0.4, 'up'), { symbol: '●', tone: 'neutral', text: '+0.4 pp' });
  assertEqual(deltaView(5, 'neutral'), { symbol: '▲', tone: 'neutral', text: '+5.0 pp' });
});
```

- [ ] **Schritt 2: rot** → **Schritt 3: Modell**

In `overviewModel()` die Helfer erweitern: `kpi(label, value, n, hint, extra)` erhält `group` und `direction` aus `extra` (Standard `group: 'Mengen'`, `direction: 'neutral'`); `rate`/`avg` übergeben `group` (`'Schriftlich'` bzw. `'Mündlich'` je Block) und `direction` (`up` für bestanden/Ø Resultat, `down` für durchgefallen). Mengen: `passiv` und `nicht erfasst` → `direction: 'down'`, alle übrigen `neutral`. Export:

```js
export function deltaView(delta, direction = 'neutral') {
  const text = formatPp(delta);
  if (Math.abs(delta) < 0.5) return { symbol: '●', tone: 'neutral', text };
  const symbol = delta > 0 ? '▲' : '▼';
  const better = direction === 'up' ? delta > 0 : direction === 'down' ? delta < 0 : null;
  return { symbol, tone: better === null ? 'neutral' : (better ? 'pos' : 'neg'), text };
}
```

`views/overview.js`: bei Benchmark `k.delta = isFinite(k.raw) && isFinite(b.raw) ? (k.raw - b.raw) * 100 : null; k.benchmarkLabel = bench.label;` (bestehendes `k.benchmark = b.value` bleibt für die Vergleichstabelle); Kachel «Geplante Prüfungstermine» mit `group: 'Mengen', direction: 'neutral'`; der bisherige `p.note` «* Kennzahl auf Basis …» wandert in `hints`.

- [ ] **Schritt 4: `renderKpis()`**

```js
import { glossaryEntry, glossarySlug } from '../glossary.js';
import { deltaView } from './tables.js';

function kpiTile(k) {
  const label = glossaryEntry(k.label) ? el('a', { href: '#glossar?begriff=' + glossarySlug(k.label), text: k.label }) : k.label;
  const d = k.delta !== null && k.delta !== undefined && k.kind !== 'count' ? deltaView(k.delta, k.direction) : null;
  return el('div', { class: 'kpi' + (k.small ? ' small' : '') + (k.kind === 'count' || !k.kind ? ' count' : '') }, [
    el('div', { class: 'kpi-label' }, [label, k.hint ? el('span', { class: 'info', title: k.hint, 'aria-label': 'Definition: ' + k.hint, text: ' ⓘ' }) : null]),
    el('div', { class: 'kpi-value', text: k.value }),
    el('div', { class: 'kpi-n', text: (k.count !== null && k.count !== undefined ? k.count + ' von ' + k.n + ' Vorgängen' : 'n = ' + k.n) + (k.small ? ' *' : '') }),
    d ? el('div', { class: 'kpi-delta ' + d.tone, text: d.symbol + ' ' + d.text + ' vs. ' + (k.benchmarkLabel || 'Benchmark') + (k.benchmark ? ' (' + k.benchmark + ')' : '') }) : null,
  ]);
}

export function renderKpis(kpis) {
  const groups = ['Mengen', 'Schriftlich', 'Mündlich'].map((g) => ({ g, list: kpis.filter((k) => k.group === g) })).filter((x) => x.list.length);
  if (!groups.length) return el('div', { class: 'kpis' }, kpis.map(kpiTile));
  return el('div', { class: 'kpi-groups' }, groups.map(({ g, list }) => el('section', { class: 'kpi-group' }, [el('h3', { text: g }), el('div', { class: 'kpis' }, list.map(kpiTile))])));
}
```

Achtung `kind`: Kacheln ohne `kind` (Offene Vorgänge, Geplante Prüfungen, Historie) sind Mengen → Klasse `count`.

- [ ] **Schritt 5: CSS**

```css
.kpis { grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: var(--space-3); }
.kpi-group + .kpi-group { margin-top: var(--space-3); }
.kpi-value { font-size: var(--fs-xl); } .kpi.count .kpi-value { font-size: var(--fs-lg); }
.kpi-label a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--muted); } .kpi-label a:hover { color: var(--accent); }
.kpi-delta { font-size: var(--fs-sm); margin-top: var(--space-1); font-variant-numeric: tabular-nums; }
.kpi-delta.pos { color: var(--delta-pos); } .kpi-delta.neg { color: var(--delta-neg); } .kpi-delta.neutral { color: var(--delta-neutral); }
```

`.kpi-hint`- und `.kpi-bench`-Regeln entfernen.

- [ ] **Schritt 6: Smoke-Test**

Übersicht: `check((await page.$$eval('#view .kpi-group h3', (h) => h.map((x) => x.textContent))).join(',') === 'Mengen,Schriftlich,Mündlich', 'Kacheln in drei Gruppen')`; `check((await page.locator('#view .kpi-hint').count()) === 0 && (await page.locator('#view .kpi .info').count()) >= 10, 'Kacheln ohne Definitionsabsatz, mit ⓘ')`; Benchmark-Delta: Bank «Testbank AG» wählen → `check((await page.locator('#view .kpi-delta').count()) >= 5 && (await page.$$eval('#view .kpi-delta', (d) => d.every((x) => /^[▲▼●] [+−]?\d+\.\d pp/.test(x.textContent)))), 'Delta mit Symbol und Vorzeichen')`.

- [ ] **Schritt 7: Tests, Smoke, Snapshot, Commit**

```bash
git add views/tables.js views/overview.js views/common.js styles.css tests/tables.test.js tests/smoke/run.mjs
git commit -m "KPI-Kacheln: Gruppen Mengen/Schriftlich/Mündlich, Richtung je Kennzahl, Delta mit Symbol und Farbe, Definition als ⓘ und Glossar-Link"
git push
```

---

### Task 6 (Schritt A.7): Tabellen – Spaltenpriorität, Datenbalken, Delta- und Statuszellen, Sticky-Spalte, Legende

**Dateien:**
- Ändern: `views/tables.js` (`col()` exportiert mit `prio`, Prioritäten gemäss Anhang A1 in allen Tabellenfunktionen, `isDeltaColumn()`, `STATUS_COLUMN_LABELS`, `direction` an Differenzspalten), `views/common.js` (`renderTable()`, `renderExpandableTable()`, `section()`), `app.js` (`renderView()`: Legende), `styles.css`, `tests/tables.test.js`, `tests/smoke/run.mjs`

**Schnittstellen:**
- `export function col(key, label, prio = 2, extra = {}) → { key, label, prio, ...extra }`; Spalten ohne `prio` gelten als 2. `columns[i].direction` für Differenzspalten (`comparisonTable`: aus dem KPI-Modell je Zeile nicht möglich → Zeilen tragen `rows[i].direction`; `renderTable` nimmt `row.direction || column.direction || 'neutral'`).
- `export function isDeltaColumn(column) → boolean` (`key` beginnt mit `differenz`/`delta` oder Label beginnt mit «Differenz»/«Δ»).
- `export const STATUS_COLUMN_LABELS = ['Status', 'Status Vorgang', 'Status schriftlich', 'Status mündlich', 'Stufe', 'Bestanden', 'Passiv']`; `statusTone(text) → 'bestanden' | 'nicht' | 'offen' | 'passiv' | 'geplant' | null` (Textanfang: «bestanden» → bestanden, «nicht bestanden»/«nein»/«letzter Versuch»/«ausgeschöpft» → nicht, «offen»/«ja» bei Passiv → passiv, «geplant» → geplant, «offen» → offen).
- `renderTable(table, { caption = true, allColumnsToggle = true })`: `th`/`td` mit `data-prio`; Prozentzellen `td.num.pct[style="--v: 65.4"]`; Deltazellen `td.num.delta.pos|neg|neutral` (Symbol vorangestellt); Statuszellen `td > span.badge.status-<tone>`; `caption` erhält bei `table.note` ein `span.info[title=note]`; Schalter `button.link.all-columns` («Alle Spalten» ↔ «Weniger Spalten») nur wenn eine Spalte `prio > 1`; keine `p.note` mehr.
- `section(title, nodes, { info })`: `caption`, deren Text gleich `title` ist, erhält `visually-hidden`; ihr ⓘ wandert in das `h3`.
- `renderView()`: `renderCollapsible('Hinweise und Definitionen', […hints, …eindeutige notes], { printOpen: true })` genau einmal am Ende (`details.fold.legend`).

- [ ] **Schritt 1: Tests (`tests/tables.test.js`)**

```js
import { col, isDeltaColumn, statusTone, STATUS_COLUMN_LABELS } from '../views/tables.js';
test('tables.col: Priorität Standard 2, explizit 1 oder 3, Zusatzfelder', () => {
  assertEqual(col('n', 'n'), { key: 'n', label: 'n', prio: 2 });
  assertEqual(col('gruppe', 'Profil', 1), { key: 'gruppe', label: 'Profil', prio: 1 });
  assertEqual(col('differenz', 'Differenz', 1, { direction: 'up' }).direction, 'up');
});
test('tables: Prioritäten gemäss Anhang A1 – erste Spalte immer 1, Kernspalten 1, Details 3', () => {
  const pr = (t, key) => t.columns.find((c) => c.key === key).prio;
  const pass = passRateTable(cohort(), 'profil');
  assertEqual([pr(pass, 'gruppe'), pr(pass, 'n'), pr(pass, 'erstversuch'), pr(pass, 'gesamt')], [1, 1, 1, 1]);
  assertEqual(pr(pass, 'durchgefallen'), 2); assertEqual(pr(pass, 'passiv'), 3);
  const ov = overviewModel(cohort()).byProfil;
  assertEqual([pr(ov, 'gruppe'), pr(ov, 'n'), pr(ov, 'erstversuch'), pr(ov, 'muendlich')], [1, 1, 1, 1]);
  assertEqual(pr(ov, 'durchgefallen'), 3);
  for (const t of [pass, ov, oralRateTable(cohort(), 'profil'), partTable(cohort(), 'we'), vssVsmTable(cohort())]) assertEqual(t.columns[0].prio, 1, t.title + ': erste Spalte');
});
test('tables.isDeltaColumn / statusTone', () => {
  assert(isDeltaColumn({ key: 'differenz', label: 'Differenz' }) && isDeltaColumn({ key: 'x', label: 'Δ Durchfallquote' }) && !isDeltaColumn({ key: 'n', label: 'n' }));
  assertEqual(statusTone('bestanden'), 'bestanden'); assertEqual(statusTone('nicht bestanden'), 'nicht'); assertEqual(statusTone('offen'), 'offen');
  assertEqual(statusTone('geplant 29.09.2026'), 'geplant'); assertEqual(statusTone('letzter Versuch'), 'nicht'); assertEqual(statusTone('–'), null);
  assert(STATUS_COLUMN_LABELS.includes('Stufe'));
});
test('tables.comparisonTable: Differenzspalte trägt Richtung je Zeile für die Farbe', () => {
  const t = comparisonTable(overviewModel(cohort()).kpis, overviewModel(cohort()).kpis, 'Alle Banken');
  assert(t.rows.every((r) => ['up', 'down', 'neutral'].includes(r.direction)));
  assert(isDeltaColumn(t.columns.find((c) => c.key === 'differenz')));
});
```

- [ ] **Schritt 2: rot** → **Schritt 3: Modelle**

`col()` exportieren und in allen Tabellenfunktionen die Prioritäten aus Anhang A1 eintragen (Tabelle für Tabelle; Spaltenschlüssel am Code ablesen). Inline-Spalten `{ key, label }` (`overview.js` `kpiTable`, `glossar.js`, `historyTables`, `plannedTables`, DQ) über `col()` mit Prio versehen: `kpiTable` Kennzahl/Wert 1, Anzahl/n 2, Beschreibung 3; Glossar Begriff/Definition 1, Nenner/Grenzfälle 2; DQ gemäss A1 (`DQ_COLUMNS` in `views/dataQuality.js`: Wirkung, Stufe, Zeile, Grund = 1; Sheet, Header = 2; Rohwert = 3). `comparisonTable`: `rows[i].direction = k.direction`. Weitere Δ-Spalten (`yearComparisonTable`, `bankReportTables`, `historyTables`): `direction` je Zeile aus der Kennzahl (Label-Abgleich mit `overviewModel`-Richtungen über eine kleine Map `DIRECTION_BY_LABEL`), sonst `neutral`.

- [ ] **Schritt 4: Rendering (`views/common.js`)**

Zellen-Helfer:

```js
const PCT = /^\s*(\d+(?:[.,]\d+)?)\s*%/;
function cell(c, row, numeric) {
  const raw = row[c.key];
  const text = cellText(raw);
  const attrs = { 'data-prio': String(c.prio || 2) };
  const cls = [];
  if (numeric.has(c.key)) cls.push('num');
  if (isDeltaColumn(c) && /[−+-]?\d/.test(text)) {
    const value = Number(text.replace('−', '-').replace(/[^\d.-]/g, ''));
    const d = deltaView(value, row.direction || c.direction || 'neutral');
    cls.push('delta', d.tone);
    return el('td', { ...attrs, class: cls.join(' ') }, [el('span', { 'aria-hidden': 'true', text: d.symbol + ' ' }), text]);
  }
  const pct = !isDeltaColumn(c) && PCT.exec(text);
  if (pct) { cls.push('pct'); attrs.style = '--v: ' + Math.min(100, Number(pct[1].replace(',', '.'))); }
  if (STATUS_COLUMN_LABELS.includes(c.label)) {
    const tone = statusTone(text);
    return el('td', { ...attrs, class: cls.join(' ') || null }, [tone ? el('span', { class: 'badge status-' + tone, text }) : text]);
  }
  return el('td', { ...attrs, class: cls.join(' ') || null, text });
}
```

`renderTable`: `th` mit `data-prio`; `caption` = Titel + ⓘ (`table.note`); Schalter «Alle Spalten» als `button.link.all-columns` vor der Tabelle in `.table-wrap`, `onclick` toggelt `wrap.classList.toggle('all-columns')` und den Text; `p.note` entfällt (Legende). `renderExpandableTable`: dieselben Helfer; Toggle-Spalte `data-prio="1"`. `section()`: siehe Schnittstellen.

- [ ] **Schritt 5: Legende in `renderView()` (`app.js`)**

```js
  const notes = [...new Set(built.tables.map((t) => t.note).filter(Boolean))];
  const hints = (built.hints || []).concat(notes);
  if (hints.length) {
    const legend = renderCollapsible('Hinweise und Definitionen', [el('ul', { class: 'legend-list' }, hints.map((h) => el('li', { text: h })))], { printOpen: true });
    legend.classList.add('legend');
    container.appendChild(legend);
  }
```

Der Block aus Task 4 («Hinweise zu dieser Ansicht») geht darin auf – höchstens eine Legende je View.

- [ ] **Schritt 6: CSS**

```css
table.data { font-variant-numeric: tabular-nums; }
table.data th, table.data td { height: 2.25rem; }
table.data tbody tr:nth-child(even) td { background: var(--panel-2); }
.table-wrap th:first-child, .table-wrap td:first-child { position: sticky; left: 0; z-index: 1; background: var(--panel); }
.table-wrap th:first-child { z-index: 2; }
table.data tbody tr:nth-child(even) td:first-child { background: var(--panel-2); }
td.pct { background: linear-gradient(to right, var(--bar) calc(var(--v) * 1%), transparent 0); }
td.delta.pos { color: var(--delta-pos); } td.delta.neg { color: var(--delta-neg); } td.delta.neutral { color: var(--delta-neutral); }
.badge { display: inline-block; padding: .05rem var(--space-2); border-radius: 999px; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; }
.badge.status-bestanden { color: var(--status-bestanden); background: var(--status-bestanden-bg); }
.badge.status-nicht { color: var(--status-nicht); background: var(--status-nicht-bg); }
.badge.status-offen { color: var(--status-offen); background: var(--status-offen-bg); }
.badge.status-passiv { color: var(--status-passiv); background: var(--status-passiv-bg); }
.badge.status-geplant { color: var(--status-geplant); background: var(--status-geplant-bg); }
.table-wrap .all-columns { display: none; } /* Desktop: alle Spalten sichtbar; Paket B blendet Prio 2/3 per Breakpoint aus und zeigt den Schalter */
caption .info { margin-left: var(--space-1); }
.legend-list { margin: 0; padding-left: 1.2rem; color: var(--muted); font-size: var(--fs-sm); }
@media print { td.pct { background: linear-gradient(to right, var(--bar) calc(var(--v) * 1%), transparent 0); -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
```

- [ ] **Schritt 7: Smoke-Test**

Übersicht: `check((await page.locator('#view td.pct[style*="--v"]').count()) >= 4, 'Datenbalken in Prozentspalten')`; mit Bank «Testbank AG»: `check((await page.locator('#view td.delta').count()) >= 5 && (await page.$$eval('#view td.delta', (t) => t.every((x) => /^[▲▼●] /.test(x.textContent)))), 'Differenzspalte mit Symbol und Farbe')`; Offene Vorgänge: `check((await page.locator('#view .badge').count()) >= 1, 'Statuszellen als Badge')`; jede View: `check((await page.locator('#view details.fold.legend').count()) <= 1 && (await page.locator('#view p.note').count()) === 0, v + ': höchstens eine Legende, keine Fussnoten')`; Doppeltitel: `check(await page.evaluate(() => [...document.querySelectorAll('#view section.block')].every((s) => { const h = s.querySelector('h3'); const c = s.querySelector('caption'); return !c || c.textContent.replace(' ⓘ', '') !== h.textContent.replace(' ⓘ', '') || c.classList.contains('visually-hidden'); })), 'kein doppelter Tabellentitel')`. Bank-Report-Prüfung `#view table caption` bleibt gültig (versteckte Caption ist im DOM).

- [ ] **Schritt 8: Tests, Smoke, Snapshot, Commit**

```bash
git add views/tables.js views/common.js views/dataQuality.js views/overview.js views/glossar.js app.js styles.css tests/tables.test.js tests/smoke/run.mjs
git commit -m "Tabellen: Spaltenpriorität, Datenbalken, Delta- und Statuszellen, fixierte erste Spalte, kein Doppeltitel, eine Legende je Ansicht"
git push
```

---

### Task 7 (Schritt A.8): Zustände, Barrierefreiheit, Druck, Dark Mode, Snapshot, README, Abnahme

**Dateien:**
- Ändern: `app.js` (Leerzustand-Karte, `aria-busy`), `views/common.js` (`renderEmptyState()`), `styles.css` (`.empty-card`, `prefers-reduced-motion`, Druck), `tests/smoke/run.mjs` (Dark-Screenshot Übersicht, Leerzustand, Tastatur), `README.md` («Ansichten», «Globale Filter», Entscheid-Log E1–E10), `PROMPT-2.md` (Checkboxen A.1–A.8)

- [ ] **Schritt 1: Leerzustand und Laden**

`renderEmptyState({ onLoad, onFile })` in `views/common.js`: `div.empty-card` mit `h3` «Noch keine Daten geladen», zwei Buttons «Anmelden und laden» (`ui.load.click()` bzw. `signIn` + `loadGraph`, deaktiviert ohne Konto) und «Lokale Datei prüfen» (`ui.file.click()`), kurzer Satz «Die Datei bleibt im Browser; nichts wird gespeichert.». In `renderView()` statt `p.empty`. `run()` setzt `ui.view.setAttribute('aria-busy', 'true')` beim Start und entfernt es im `finally`.

CSS: `.empty-card { max-width: 32rem; margin: var(--space-6) auto; padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel-2); text-align: center; } .empty-card .actions { display: flex; gap: var(--space-3); justify-content: center; margin-top: var(--space-4); }`
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; } }`

- [ ] **Schritt 2: Barrierefreiheit prüfen**

`nav` Gruppen mit `aria-label` (Task 2), Chips mit `aria-label` (Task 3), Export-Menü `details/summary` (Task 4), Schalter «Alle Spalten» als Button (Task 6), Fokusringe bestehen. Smoke: Tab-Reihenfolge Navigation → Filter → Export-Menü: `await page.keyboard.press('Tab')` in Schleife bis `document.activeElement.closest('details.menu')`, dann Enter → geöffnet.

- [ ] **Schritt 3: Druck und Dark Mode**

Smoke: `await page.emulateMedia({ colorScheme: 'dark' }); await page.goto(server.url + '#uebersicht'); await shot(page, 'dark-uebersicht');` und `print-uebersicht` (Legende offen, Balken grau: `getComputedStyle(td.pct).backgroundImage` enthält `rgba(0, 0, 0, 0.12)`). `node tools/contrast.js` grün.

- [ ] **Schritt 4: Snapshot-Vergleich und Zahlen**

`node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json` → identisch. Zusätzlich die KPI-Werte der Übersicht im Smoke-Log mit dem Baseline-Log (Schritt 0) vergleichen: `Schriftlich: im 1. Versuch bestanden=75.0 %`, `Mündlich: bestanden=100.0 %`, `Vorgänge=8`, `Personen=7`.

- [ ] **Schritt 5: README und Entscheid-Log**

«Ansichten»: Navigationsgruppen und die drei KPI-Blöcke beschreiben; «Globale Filter»: Jahr als Auswahlfeld, Chips, Reset-Sichtbarkeit; Abschnitt «Modell» → Entscheid-Log als Liste E1–E10 (E1–E6 aus README/Glossar zusammengezogen, je ein Satz mit Datum 05.09.2026; E7–E10 aus `PROMPT-2.md` Anhang A4). `node tools/glossar-readme.js --write` → keine Änderung. `PROMPT-2.md`: Checkboxen A.1–A.8 abhaken.

- [ ] **Schritt 6: Abnahme**

Alle Tests grün (`run-node`, Smoke lokal, `contrast`), CI grün, PR #9 «Ready for review» mit abgehakter DoD-Checkliste, Abnahme-Bericht nach 0.8 inkl. Block «Entscheide vor Start» für Paket B.

```bash
git add app.js views/common.js styles.css tests/smoke/run.mjs README.md PROMPT-2.md
git commit -m "Zustände, Barrierefreiheit, Druck und Dark Mode geprüft; README und Entscheid-Log E1–E10 nachgeführt"
git push
gh pr ready 9
```

---

## Selbstprüfung gegen `PROMPT-2.md` Paket A

- A.1 Tokens, `color-mix` mit Fallback, `tools/contrast.js` + CI → Task 1. Offen bleibt die Kontrastprüfung auf dem Zielgerät (Hypothese Edge/Chrome ≥ 111).
- A.2 Untertitel, Datenstand, Navigation in Gruppen, Filterleiste sticky/Jahr-Select/Chips/Reset → Tasks 2 und 3.
- A.3 View-Kopf, Export-Menü, Definitionen-Link, Einleitungsabsätze verschoben → Task 4.
- A.4 KPI-Struktur, Richtung, Gruppen, ⓘ, Kachelgrössen → Task 5.
- A.5 Spaltenpriorität (Anhang A1), Datenbalken, Differenz- und Statuszellen, Sticky-Spalte, Doppeltitel, Legende, Zebra/Zeilenhöhe/tabular-nums → Task 6. Die CSS-Ausblendung nach `data-prio` und der sichtbare Schalter folgen in Paket B (Desktop zeigt alle Spalten).
- A.6 Diagramme unverändert (nur Paket B `compact`). A.7 Zustände, A.8 Barrierefreiheit → Task 7.
- A.11 Akzeptanzkriterien: Snapshot identisch (jeder Task), 1280 px einzeilige Navigation und Filterleiste (Tasks 2/3; Prüfung im Smoke-Viewport 1400 × 1000 plus Sichtprüfung 1280), keine Kachel mit Definitionsabsatz (Task 5), kein Doppeltitel und höchstens eine Legende (Task 6), Datenbalken/Δ/Badges (Task 6), contrast.js grün (Task 1), Tastatur (Task 7).
- Typen konsistent: `col()` mit `prio` (Task 6) wird von Task 5 nicht vorausgesetzt; `deltaView()` (Task 5) wird in Task 6 für Δ-Zellen wiederverwendet; `glossarySlug()` (Task 4) in Task 5 für Kachel-Links; `hints` (Task 4) in Task 6 in die Legende gemerged.
