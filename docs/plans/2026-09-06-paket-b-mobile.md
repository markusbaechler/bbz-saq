# Paket B – Mobile Darstellung (reduziert): Umsetzungsplan

> **Für ausführende Agenten:** Plan Task für Task abarbeiten (superpowers:executing-plans). Nach jedem Task (= Schritt B.1 … B.5 aus `PROMPT-2.md`) Bericht nach Vorlage 0.8 und Freigabe abwarten. Entscheide vor Start sind getroffen (06.09.2026, alle wie empfohlen).

**Ziel:** Dasselbe Cockpit auf dem Smartphone (≤ 600 px) und Tablet (601–900 px) ohne horizontalen Seitenscroll: weniger Spalten und Kacheln, keine Hinweistexte, gleiche Zahlen. Vollständig gestaltet für Phone: Übersicht, Offene Vorgänge, Geplante Prüfungen (Personen folgt in Paket C); alle übrigen Ansichten funktionieren ohne Überlauf.

**Architektur:** Breakpoints und Reduktion ausschliesslich in `styles.css` über die in Paket A gesetzten `data-prio`-Attribute und Klassen. Wo das DOM je Gerät anders sein muss (Navigation als Select, Filter-Drawer, Kachel-Blöcke als `details`, kompaktes Diagramm), entscheidet ein kleiner `isPhone()`-Helfer über `matchMedia`; ein Wechsel des Viewports rendert neu. Zahlen und Modelle bleiben unberührt (Snapshot-Vergleich je Task).

**Tech Stack:** Vanilla JS ES-Module, CSS Media Queries, Playwright-Smoke mit drei Viewports (1400 × 1000, 820 × 1180, 390 × 844).

## Globale Vorgaben (aus `PROMPT-2.md`)

- Breakpoints: **Phone ≤ 600 px**, **Tablet 601–900 px**, Desktop > 900 px; der alte Breakpoint 700 px geht darin auf.
- Nie horizontaler Seitenscroll (`document.documentElement.scrollWidth <= innerWidth`); nur `.table-wrap` und `#nav` scrollen horizontal.
- Touch-Ziele ≥ 44 × 44 px; Grundschrift 16 px auf Phone (kein iOS-Zoom bei Eingabefeldern). Druck bleibt Desktop-Layout.
- Reduziert heisst: weniger Spalten (nur `data-prio="1"` auf Phone, 1 + 2 auf Tablet) und Kacheln, keine Hinweistexte; nichts wird anders berechnet.
- Entschieden 06.09.2026: priorisierte Ansichten Übersicht · Offene Vorgänge · Geplante Prüfungen (· Personen ab C); `#nav a` bleibt im DOM und ist auf Phone `display: none`, der Smoke-Test nutzt `#nav-select`; Tablet mit scrollbaren Gruppen, zweizeiliger Filterleiste und Prio 1 + 2.
- Smoke lokal: `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe node tests/smoke/run.mjs`; Snapshot: `node tools/snapshot-synth.js --vergleich tests/smoke/output/snapshot-baseline.json`.
- Keine Personendaten; Commits klein, deutsch, Imperativ; Push je Task; PR-Text nachführen.

## Dateistruktur

| Datei | Verantwortung in Paket B |
|---|---|
| `styles.css` | Breakpoints Phone/Tablet, Grundschrift, Touch-Ziele, Ausblendung nach `data-prio`, sichtbarer Schalter «Alle Spalten», kompakter Kopf, Nav-Select, Filter-Drawer, Kachel-Blöcke, Diagramm `compact`, Bestenlisten einspaltig, Legende |
| `views/common.js` | `isPhone()`, `onViewportChange(fn)`, `initials(name)`, `renderKpis` mit `details` je Block auf Phone, `section({ phoneCollapsed })` |
| `app.js` | `renderNav()` mit `#nav-select`, Filter-Drawer in `buildFilterBar()`/`updateFilterBar()`, Konto als Initialen, Neurendern bei Viewport-Wechsel |
| `views/chart.js` | Option `compact` (Breite 360, `pad.right` 16, Höhe 200, keine Endbeschriftung, Tooltip unter dem Diagramm) |
| `views/zeitverlauf.js`, `views/overview.js`, `views/offen.js` | `compact` je Gerät; auf Phone eingeklappte Abschnitte gemäss B.3 |
| `auth.js`, `tests/auth.test.js` | Redirect-Flow auf Phone (`matchMedia` injizierbar), Test mit Fake-`matchMedia` |
| `tests/common.test.js` (neu) | `initials()`, `isPhone()` mit Fake-`matchMedia` |
| `tests/smoke/run.mjs` | Viewports 390 × 844 und 820 × 1180: jede Ansicht ohne Überlauf, `#nav-select`, Drawer, Chips, Prio-Spalten, Schalter, kompaktes Diagramm, Screenshots `phone-*`, `tablet-*` |
| `README.md` | Abschnitt «Mobile» unter «Ansichten» |

---

### Task 1 (Schritt B.1): Breakpoints, Grundschrift, Touch-Ziele, `data-prio`-CSS, Sticky-Verhalten

**Dateien:** `styles.css`, `tests/smoke/run.mjs`

**Schnittstellen:** CSS-Klassen `.table-wrap.all-columns` (Paket A), Attribute `data-prio` auf `th`/`td` (Paket A), Button `.all-columns` (Paket A, bisher `display: none`).

- [ ] **Schritt 1: Smoke-Test um einen Phone-Durchlauf erweitern (RED)** – nach dem Desktop-Teil, vor dem Speicher-Check:

```js
  // Phone (B.1): 390 × 844 – jede Ansicht ohne horizontalen Seitenscroll, nur Prio-1-Spalten, Schalter «Alle Spalten» sichtbar
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url, { waitUntil: 'networkidle' });
  await phone.setInputFiles('#file-input', xlsx);
  await phone.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  for (const v of views) {
    await phone.goto(server.url + '#' + v);
    await phone.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const hiddenPrio = await phone.evaluate(() => [...document.querySelectorAll('#view table.data td[data-prio="2"], #view table.data td[data-prio="3"]')].every((td) => getComputedStyle(td).display === 'none'));
    check(overflow <= 0 && hiddenPrio, 'Phone ' + v + ': kein Seitenscroll (' + overflow + ' px), nur Prio-1-Spalten');
    await phone.screenshot({ path: join(outDir, 'phone-' + v + '.png'), fullPage: true });
  }
  await phone.goto(server.url + '#uebersicht');
  await phone.waitForSelector('#view .kpi');
  const toggle = phone.locator('#view .table-wrap .all-columns').first();
  check(await toggle.isVisible(), 'Phone: Schalter «Alle Spalten» sichtbar');
  await toggle.click();
  check(await phone.evaluate(() => { const td = document.querySelector('#view .table-wrap.all-columns td[data-prio="3"]'); return !!td && getComputedStyle(td).display !== 'none'; }), 'Phone: «Alle Spalten» zeigt Prio-3-Spalten (horizontal scrollbar in .table-wrap)');
  const fontSize = await phone.evaluate(() => getComputedStyle(document.querySelector('#filterbar select')).fontSize);
  const target = await phone.evaluate(() => document.querySelector('#nav a, #nav-select').getBoundingClientRect().height);
  check(parseFloat(fontSize) >= 16 && target >= 44, 'Phone: Eingabefelder 16 px, Touch-Ziele ≥ 44 px (' + fontSize + ', ' + Math.round(target) + ' px)');
  await phone.close();
```

`views` ist die Liste aus dem Desktop-Durchlauf. Erwartung vor Task 1: FAIL (Prio-Spalten sichtbar, Schalter unsichtbar, Überlauf).

- [ ] **Schritt 2: CSS** – den Block `@media (max-width: 700px)` ersetzen durch:

```css
/* Tablet (PROMPT-2 B.1): 601–900 px – Prio-3-Spalten ausgeblendet, Filterleiste zweizeilig, Navigation scrollt */
@media (max-width: 900px) {
  .table-wrap:not(.all-columns) th[data-prio="3"], .table-wrap:not(.all-columns) td[data-prio="3"] { display: none; }
  .table-wrap .all-columns { display: inline-block; margin: var(--space-1) 0 var(--space-2); }
  .view { margin: var(--space-3) var(--space-2) var(--space-4); padding: var(--space-3); }
  .databar, .app-header, .views, .filterbar { padding-left: var(--space-3); padding-right: var(--space-3); }
}
/* Phone (PROMPT-2 B.1): ≤ 600 px – nur Prio-1-Spalten, 16-px-Grundschrift, Touch-Ziele ≥ 44 px, Zeilenhöhe 2.75rem */
@media (max-width: 600px) {
  html { font-size: 16px; }
  body { font-size: 1rem; }
  .table-wrap:not(.all-columns) th[data-prio="2"], .table-wrap:not(.all-columns) td[data-prio="2"] { display: none; }
  table.data th, table.data td { height: 2.75rem; }
  button, .views a, .chip, .menu > summary, .menu-item, input, select { min-height: 44px; }
  input, select { font-size: 1rem; }
  .filterbar label { min-width: 45%; }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .ranking-grid { grid-template-columns: 1fr; }
  .view { margin: var(--space-2) 0 var(--space-4); border-left: none; border-right: none; border-radius: 0; }
}
```

Die Breite des Seiteninhalts darf nie über `100vw` gehen: `.table-wrap { max-width: 100%; }` und `.viz { max-width: 100%; }` zum bestehenden CSS ergänzen.

- [ ] **Schritt 3: Smoke grün, Snapshot identisch, Sichtprüfung** der Screenshots `phone-uebersicht.png`, `phone-schriftlich.png` (breiteste Tabellen), dazu Vorschau mit `resize_window` Preset `mobile`.
- [ ] **Schritt 4: Commit** «Mobile: Breakpoints Phone und Tablet, Spalten nach Priorität, Grundschrift und Touch-Ziele» · Push · PR-Text.

---

### Task 2 (Schritt B.2): Navigation als Select, Filter-Drawer, kompakter Kopf

**Dateien:** `views/common.js`, `app.js`, `index.html`, `styles.css`, `tests/common.test.js` (neu), `tests/all.js`, `tests/smoke/run.mjs`

**Schnittstellen:**
- `common.js`: `export function isPhone(mm = globalThis.matchMedia) → boolean` (`(max-width: 600px)`), `export function onViewportChange(fn, mm = globalThis.matchMedia)` (ruft `fn` bei Wechsel Phone ↔ grösser), `export function initials(name) → string` («Anna Muster» → «AM», «anna.muster@…» → «AM», leer → «?»).
- DOM: `select#nav-select[aria-label="Ansicht"]` mit `optgroup` je Gruppe (Wert = View-id; `onchange` → `location.hash = buildHash(id, filter, ui)`); `#filterbar > details.filter-drawer > summary.filter-summary` («Filter» bzw. «Filter (2 aktiv)») `+ div.filter-controls`; `.summary` (Zähler + Chips) bleibt unter dem Drawer sichtbar; `button#account-initials` neben `#account`.

- [ ] **Schritt 1: Tests (RED)** – `tests/common.test.js`:

```js
import { test, assertEqual } from './runner.js';
import { initials, isPhone } from '../views/common.js';
const mm = (matches) => () => ({ matches, addEventListener() {}, removeEventListener() {} });
test('common.initials: zwei Buchstaben aus Vor- und Nachname, E-Mail-Fallback, leer → ?', () => {
  assertEqual(initials('Anna Muster'), 'AM');
  assertEqual(initials('Muster, Anna'), 'MA');
  assertEqual(initials('anna.muster@example.org'), 'AM');
  assertEqual(initials(''), '?');
});
test('common.isPhone: matchMedia (max-width: 600px)', () => {
  assertEqual(isPhone(mm(true)), true);
  assertEqual(isPhone(mm(false)), false);
  assertEqual(isPhone(undefined), false, 'ohne matchMedia (Node) nie Phone');
});
```

Smoke (Phone-Teil): `#nav-select` wechselt die Ansicht (`selectOption('offene-vorgaenge')` → `#view h2` = «Offene Vorgänge», Hash identisch zum Desktop-Link); `#nav a` hat `display: none`; Drawer: `details.filter-drawer` zu, `summary` klicken → Profil-Select sichtbar, PK wählen → Chip «Profil PK» sichtbar, `summary` zeigt «Filter (1 aktiv)»; Kopf: `#account-initials` sichtbar, `#account` versteckt; Datenstand `details` geschlossen. Screenshots `phone-nav`, `phone-filter`.

- [ ] **Schritt 2: `common.js`** – `isPhone`, `onViewportChange`, `initials`.
- [ ] **Schritt 3: `app.js`** – `renderNav()` rendert zusätzlich das Select (Optionen aus `NAV_GROUPS`/`VIEWS`, aktueller Wert = `current`); `buildFilterBar()` baut `details.filter-drawer` (auf Desktop/Tablet `open`, auf Phone zu; bei `onViewportChange` neu setzen), `updateFilterBar()` setzt den `summary`-Text «Filter (n aktiv)» aus `filterChips(filter).length`; `renderSession()` setzt `#account-initials` (Text `initials(name)`, `title` = voller Name); `init()` registriert `onViewportChange(renderAll)`.
- [ ] **Schritt 4: `index.html`** – `<button id="account-initials" type="button" class="account-initials" hidden></button>`; **CSS**: Phone zeigt `#nav-select` und versteckt `.nav-group` (`display: none`); Tablet/Desktop umgekehrt; `.filter-drawer > summary` nur auf Phone sichtbar und `position: sticky; top: 0`; `.filter-controls` auf Phone zweispaltig (`grid-template-columns: 1fr 1fr`); `.filterbar` auf Phone nicht sticky; `.app-header .brand` einzeilig, `.subtitle` versteckt, `#account` versteckt, `#account-initials` rund 44 px; `.datastand summary` einzeilig mit Ellipse.
- [ ] **Schritt 5:** Tests, Smoke (Desktop unverändert grün: `#filterbar label:has-text("Profil") select` liegt jetzt in `.filter-controls`, Selektoren bleiben gültig), Snapshot, Sichtprüfung `phone-nav.png`, `phone-filter.png`.
- [ ] **Schritt 6: Commit** «Mobile: Navigation als Auswahlfeld, Filter als Drawer, Kopf kompakt» · Push · PR-Text.

---

### Task 3 (Schritt B.3): Kachel-Blöcke als `details`, Tabellen-Schalter, kompaktes Diagramm

**Dateien:** `views/common.js` (`renderKpis`), `views/chart.js`, `views/zeitverlauf.js`, `styles.css`, `tests/smoke/run.mjs`

**Schnittstellen:**
- `renderKpis(kpis, { glossaryHref, phone = isPhone() })`: mit `phone` werden die Blöcke als `details.kpi-group` gerendert (Schriftlich, Mündlich `open`; Mengen zu); die Delta-Zeile trägt den Text «vs. …» in `span.kpi-delta-vs` (auf Phone ausgeblendet).
- `renderLineChart(series, { …, compact = false })`: `compact` → `width 360`, `pad = { top: 12, right: 16, bottom: 30, left: 40 }`, `height 200`, keine Endbeschriftung, Tooltip statisch unter dem Diagramm (`figure.classList.add('compact')`), Legende bleibt.
- `views/zeitverlauf.js`: `renderLineChart(…, { compact: isPhone() })`.

- [ ] **Schritt 1: Smoke (RED)** – Phone Übersicht: `#view details.kpi-group` = 3, davon `[open]` = 2 (Schriftlich, Mündlich), `summary`-Texte «Mengen», «Schriftlich», «Mündlich»; Kacheln zweispaltig (`getComputedStyle(.kpis).gridTemplateColumns` hat zwei Werte); Phone Zeitverlauf: `svg[viewBox="0 0 360 200"]`, keine `.viz-label`, `.viz.compact .viz-tip` mit `position: static`. Screenshots `phone-uebersicht-kacheln`, `phone-zeitverlauf`.
- [ ] **Schritt 2:** `renderKpis` mit `details` je Block auf Phone; Delta-Text aufteilen.
- [ ] **Schritt 3:** `renderLineChart` Option `compact`; Aufruf in `zeitverlauf.js`.
- [ ] **Schritt 4: CSS** – `.viz.compact .viz-tip { position: static; margin-top: var(--space-2); }`, `.kpi-delta-vs` auf Phone `display: none`, `details.kpi-group > summary` wie ein `h3`.
- [ ] **Schritt 5:** Tests, Smoke (Desktop: `section.kpi-group` weiterhin, keine `details`), Snapshot, Sichtprüfung. **Commit** «Mobile: Kachel-Blöcke aufklappbar, kompaktes Diagramm» · Push.

---

### Task 4 (Schritt B.4): Priorisierte Ansichten feinjustieren, Tablet im Smoke-Test

**Dateien:** `views/common.js` (`section({ phoneCollapsed })`), `views/overview.js`, `views/offen.js`, `views/planned.js`, `styles.css`, `tests/smoke/run.mjs`

**Schnittstellen:** `section(title, nodes, { info, meta, phoneCollapsed = false })` → auf Phone (`isPhone()`) und `phoneCollapsed` ein `details.fold` (zu, `print-open`) statt `section.block`; `hinted(hints)` reicht die Option durch (`sec(title, nodes, intro, meta, { phoneCollapsed })`).

- [ ] **Schritt 1: Smoke (RED)** – Phone Übersicht: Abschnitte «Auswahl im Vergleich zum Benchmark» und «Personen mit mehreren Profilen» als geschlossene `details.fold`; «Kennzahlen je Profil» offen mit Spalten Profil, n, Schriftlich im 1. Versuch bestanden, Mündlich bestanden. Phone Offene Vorgänge: «Je Profil» und «Teilprüfungen je Profil» zu, Frühwarnung und Teilnehmende offen (Prio-1-Spalten Name, Profil, Fehlende Teile, Nächster Termin). Phone Geplante Prüfungen: Ereignisse je Tag mit Datum, Ort, Anzahl; Teilnehmende per Aufklappen. Tablet-Durchlauf 820 × 1180 analog zu Task 1 (kein Überlauf, Prio 3 versteckt, Prio 2 sichtbar), Screenshots `tablet-*`.
- [ ] **Schritt 2:** `section`/`hinted` mit `phoneCollapsed`; in `overview.js` (Vergleich, Mehrere Profile), `offen.js` (Je Profil, Teilprüfungen je Profil) setzen.
- [ ] **Schritt 3:** Tablet-Durchlauf im Smoke, Feinjustierung CSS (Spaltenumbrüche, Zeilenhöhe, Chips).
- [ ] **Schritt 4:** Tests, Smoke (drei Viewports), Snapshot, Sichtprüfung `phone-uebersicht.png`, `phone-offene-vorgaenge.png`, `tablet-uebersicht.png`. **Commit** «Mobile: priorisierte Ansichten für Phone, Tablet im Smoke-Test» · Push.

---

### Task 5 (Schritt B.5): Anmeldung auf dem Smartphone, README «Mobile», Abnahme

**Dateien:** `auth.js`, `tests/auth.test.js`, `README.md`, `PROMPT-2.md`

**Schnittstellen:** `createAuth({ msal, authConfig, location, matchMedia = globalThis.matchMedia })`; `signIn()` auf Phone → `loginRedirect({ scopes })` ohne Popup-Versuch (die Seite lädt neu, `handleRedirectPromise()` setzt das Konto); `getToken()` auf Phone bei `InteractionRequired` → `acquireTokenRedirect`.

- [ ] **Schritt 1: Test (RED)** – `tests/auth.test.js`:

```js
test('auth.signIn: auf Phone (matchMedia max-width 600px) direkt Redirect, kein Popup', async () => {
  const { msal, calls } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION, matchMedia: () => ({ matches: true }) });
  await auth.signIn();
  assert(calls.some((c) => c[0] === 'loginRedirect') && !calls.some((c) => c[0] === 'loginPopup'), calls.map((c) => c[0]).join(','));
});
test('auth.signIn: auf Desktop weiterhin Popup mit Redirect-Fallback', async () => {
  const { msal, calls } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION, matchMedia: () => ({ matches: false }) });
  await auth.signIn();
  assert(calls.some((c) => c[0] === 'loginPopup') && !calls.some((c) => c[0] === 'loginRedirect'));
});
```

- [ ] **Schritt 2:** `auth.js` anpassen (Option `matchMedia`, Phone-Zweig in `signIn()` und `getToken()`); Standard in Node (kein `matchMedia`) = Desktop.
- [ ] **Schritt 3:** README «Ansichten» um «Mobile» ergänzen (Breakpoints, Select-Navigation, Drawer, Prio-Spalten, Schalter, kompaktes Diagramm, Redirect-Anmeldung, manueller Gerätetest durch den Auftraggeber); `PROMPT-2.md` B.1–B.5 abhaken.
- [ ] **Schritt 4:** Alle Tests, Smoke (drei Viewports), Snapshot identisch, `tools/contrast.js`, `glossar-readme` ohne Änderung. **Commit** «Mobile: Redirect-Anmeldung auf dem Smartphone, README» · Push · PR «Ready for review» · ⛔ Abnahme Paket B mit «Entscheide vor Start» Paket C.

## Selbstprüfung gegen `PROMPT-2.md` Paket B

- B.1 Breakpoints, kein Seitenscroll, Touch-Ziele, 16 px, Druck unverändert → Task 1 (Druck: keine Änderung an `@media print`).
- B.2 Tabelle je Komponente: Kopf, Navigation, Filterleiste → Task 2; Kacheln, Tabellen, Diagramme, Legende (`details` zu, Paket A), Bestenlisten einspaltig → Tasks 1/3.
- B.3 priorisierte Ansichten → Task 4 (Personen folgt in Paket C). B.4 Redirect-Flow → Task 5. B.7 Akzeptanz: drei Viewports im Smoke, kein Überlauf, Prio-1-Spalten + Schalter, Drawer/Chips/Select, Hash identisch, Snapshot identisch → Tasks 1–5.
- Der Phone-Durchlauf im Smoke beginnt bereits in Task 1 (PROMPT-2 nennt ihn bei B.2), damit die CSS-Reduktion sofort belegt ist.
