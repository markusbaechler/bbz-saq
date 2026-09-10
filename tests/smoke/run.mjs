// tests/smoke/run.mjs – Browser-Smoke-Test: App über einen statischen Server laden, synthetische Excel über den Datei-Input
// einlesen, jede Ansicht rendern, Interaktionen prüfen (Filter, aufklappbare Ereignisse, DQ-Suche, Druck, Dark Mode,
// keine Persistenz) und Konsolen-, Seiten- sowie Netzwerkfehler sammeln. Exit-Code 1 bei Problemen.
// Aufruf: node tests/smoke/run.mjs   (Playwright aus tests/smoke/node_modules oder NODE_PATH; Chromium via Playwright)
// Screenshots: tests/smoke/output/ (gitignored) oder SMOKE_OUT.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { startServer } from './server.mjs';
import { writeSynthWorkbook } from './synth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const outDir = process.env.SMOKE_OUT || join(here, 'output');
mkdirSync(outDir, { recursive: true });

const failures = [];
function check(ok, text) {
  if (!ok) failures.push(text);
  console.log((ok ? '  ok   ' : '  FAIL ') + text);
}
const shot = (page, name) => page.screenshot({ path: join(outDir, name + '.png'), fullPage: true });

const server = await startServer(root);
const xlsx = writeSynthWorkbook();
const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
// Feature-Flag des Schreibpfads im Test steuern (unabhängig vom Wert in config.js): Hauptseite, Phone und Tablet ohne Flag (nur lesen),
// Schreibpfad-Seite mit Flag – config.js wird per Route mit dem gewünschten Wert ausgeliefert, im Repo ändert sich nichts
const configText = readFileSync(join(root, 'config.js'), 'utf8');
const routeConfig = (p, on) => p.route('**/config.js', async (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: configText.replace(/features: \{ write: (true|false) \}/, 'features: { write: ' + (on ? 'true' : 'false') + ' }') }));
await routeConfig(page, false);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (r.url().startsWith(server.url)) errors.push('request failed: ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
page.on('response', (r) => { if (r.url().startsWith(server.url) && r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

const summaryText = () => page.textContent('#filterbar .summary');
// Query-Teil des Hashs (#ansicht?von=…): beim Ansichtswechsel per goto muss der Filterzustand mitgenommen werden
const hashQuery = (url) => { const h = url.split('#')[1] || ''; const q = h.indexOf('?'); return q >= 0 ? h.slice(q) : ''; };

try {
  // Laden
  await page.goto(server.url, { waitUntil: 'networkidle' });
  check((await page.locator('#nav a').count()) >= 8, 'Navigation gerendert');
  check((await page.locator('#nav .nav-group').count()) === 3 && (await page.locator('#nav .nav-group[aria-label="Kennzahlen"] a').count()) === 6 && (await page.locator('#nav-secondary a').count()) === 3, 'Navigation in drei Gruppen (Kennzahlen · Personen · Experten), Daten-Links als Sekundärnavigation im Kopf');
  check((await page.locator('#view .empty-card .actions button').count()) === 2 && (await page.locator('#view .empty-card h3').textContent()).startsWith('Noch keine Daten'), 'Leerzustand: Karte mit zwei Aktionen statt Fliesstext');
  await page.setInputFiles('#file-input', xlsx);
  await page.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const status = (await page.textContent('#status')).replace(/\s+/g, ' ').trim();
  check(/Data-Quality-Log/.test(status) && /Duplikate/.test(status), 'Datei geladen: ' + status.slice(0, 170));
  // Datenstand (A.2): sichtbarer Einzeiler mit aufklappbaren Zählern; der Volltext in #status bleibt (nur für Screenreader)
  const datastand = (await page.textContent('#datastand summary')).replace(/\s+/g, ' ').trim();
  check(datastand.startsWith('Datenstand: synth.xlsx') && /DQ \d+ Fehler$/.test(datastand) && (await page.locator('#datastand dt').count()) >= 6 && (await page.locator('#status.visually-hidden').count()) === 1, 'Datenstand: «' + datastand.slice(0, 90) + '» mit Details, Volltext nur für Screenreader');

  // Jede Ansicht rendert Titel und mindestens eine Tabelle, ohne Fehler
  const views = await page.$$eval('#nav a, #nav-secondary a', (as) => as.map((a) => a.getAttribute('href').replace(/^#/, '')));
  for (const v of views) {
    await page.goto(server.url + '#' + v);
    await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const h2 = (await page.textContent('#view h2')).trim();
    const tables = await page.locator('#view table').count();
    const kpis = await page.$$eval('#view .kpi', (k) => k.map((x) => x.querySelector('.kpi-label').textContent + '=' + x.querySelector('.kpi-value').textContent));
    const hint = await page.locator('#view p.empty').count(); // z. B. Bank-Report ohne gewählte Bank
    check(h2.length > 0 && (tables > 0 || hint > 0), 'Ansicht ' + v + ': «' + h2 + '», ' + tables + ' Tabellen' + (kpis.length ? ', KPIs: ' + kpis.join('; ') : '') + (tables === 0 ? ', Hinweis statt Tabellen' : ''));
    // View-Kopf (A.3): Kurzbeschreibung statt Einleitungsabsatz, höchstens eine Legende am Ende
    check((await page.locator('#view .view-head .view-intro').count()) === 1 && (await page.locator('#view > p.meta-list').count()) === 0 && (await page.locator('#view details.legend').count()) <= 1, 'Ansicht ' + v + ': Kopf mit Kurzbeschreibung, kein Einleitungsabsatz, höchstens eine Legende');
    // Tabellen (A.5): kein doppelter Titel (caption = h3 nur für Screenreader), keine Fussnoten unter Tabellen
    const doubleTitle = await page.evaluate(() => [...document.querySelectorAll('#view section.block')].some((s) => {
      const h3 = s.querySelector('h3');
      const title = h3 && h3.firstChild ? h3.firstChild.textContent : '';
      return [...s.querySelectorAll('caption')].some((c) => !c.classList.contains('visually-hidden') && (c.querySelector('.caption-text') || c).textContent === title);
    }));
    check(!doubleTitle && (await page.locator('#view p.note').count()) === 0, 'Ansicht ' + v + ': kein doppelter Tabellentitel, keine Fussnoten unter Tabellen');
    await shot(page, v);
  }

  // Bank-Report: ohne Bank ein Hinweis, mit genau einer Bank die Vergleichstabellen ohne Namen
  await page.goto(server.url + '#bank-report');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view p.empty').count()) === 1 && (await page.locator('#view table').count()) === 0, 'Bank-Report ohne Bank: Hinweis, keine Tabellen');
  await page.locator('#filterbar label:has-text("Bank") select').selectOption({ label: 'Testbank AG' });
  await page.waitForSelector('#view table');
  const bankTables = await page.$$eval('#view table caption', (c) => c.map((x) => x.textContent));
  check(bankTables.length >= 3 && bankTables.every((t) => /Testbank AG/.test(t)), 'Bank-Report mit Bank: ' + bankTables.length + ' Tabellen (' + bankTables.join(' | ') + ')');
  check(!(await page.textContent('#view')).includes('Muster Anna'), 'Bank-Report ohne Namen');
  check((await page.$$eval('#view thead th', (th) => th.map((x) => x.textContent))).includes('Einordnung') && (await page.locator('#view td.tone').count()) >= 5, 'Bank-Report: Spalte «Einordnung» mit Ton je Kennzahlzeile (' + (await page.locator('#view td.tone').count()) + ')');
  await shot(page, 'bank-report-mit-bank');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  check(views.includes('uebersicht') && views.includes('geplante-pruefungen') && views.includes('datenqualitaet'), 'Kern-Ansichten vorhanden: ' + views.join(', '));

  // Übersicht: Kacheln mit n
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const kpiCount = await page.locator('#view .kpi').count();
  const kpiN = await page.$$eval('#view .kpi .kpi-n', (n) => n.filter((x) => /n = \d+|von \d+/.test(x.textContent)).length);
  check(kpiCount >= 10 && kpiN === kpiCount, 'Übersicht: ' + kpiCount + ' Kacheln, alle mit n');
  // Kacheln (A.4): drei Blöcke, Definition als ⓘ und Glossar-Link statt Absatz, Delta zum Benchmark mit Symbol und Vorzeichen
  check((await page.$$eval('#view .kpi-group h3', (h) => h.map((x) => x.textContent))).join(',') === 'Mengen,Schriftlich,Mündlich', 'Übersicht: Kacheln in drei Blöcken (Mengen · Schriftlich · Mündlich)');
  check((await page.locator('#view .kpi-hint').count()) === 0 && (await page.locator('#view .kpi .info').count()) >= 10 && (await page.locator('#view .kpi-label a[href*="begriff="]').count()) >= 10, 'Kacheln ohne Definitionsabsatz, mit ⓘ und Glossar-Link');
  check((await page.locator('#view td.pct[style*="--v"]').count()) >= 4, 'Datenbalken in Prozentspalten (Kennzahlen je Profil)');
  // Streuung (PROMPT-2 Paket G, G.3): Zweitzeile «σ … · Median … (P25 … · P75 …)» auf den vier Ø-Kacheln (Kurzform nur auf Phone);
  // Spalte «Einordnung» der Benchmark-Tabelle: Effektstärke bei Ø, Wilson-Intervall bei Quoten, Ton wie Δ (td.tone), Mengen ohne
  const spreads = await page.$$eval('#view .kpi .kpi-spread-full', (s) => s.map((x) => x.textContent.trim()));
  const spreadShortHidden = await page.evaluate(() => [...document.querySelectorAll('#view .kpi .kpi-spread-short')].every((x) => x.getClientRects().length === 0));
  check(spreads.length === 4 && spreads.every((t) => /^σ \d+\.\d pp · Median \d+\.\d % \(P25 \d+\.\d · P75 \d+\.\d\)$/.test(t)) && spreadShortHidden, 'Übersicht: Streuungszeile auf den vier Ø-Kacheln, Kurzform ausgeblendet (' + spreads.length + ', z. B. «' + (spreads[0] || '') + '»)');
  const einordnung = await page.$$eval('#view td.tone', (t) => t.map((x) => x.textContent.trim()));
  check(einordnung.length >= 8 && einordnung.some((t) => /^d [+−]?\d\.\d · (gering|mittel|deutlich|gross)$/.test(t)) && einordnung.some((t) => /^±\d+\.\d pp · Benchmark im Intervall: (ja|nein)$/.test(t)) && (await page.$$eval('#view thead th', (th) => th.map((x) => x.textContent))).includes('Einordnung') && (await page.locator('#view td.tone.neutral, #view td.tone.pos, #view td.tone.neg').count()) === einordnung.length, 'Übersicht: Spalte «Einordnung» mit Effektstärke und Wilson-Intervall, Ton je Zelle (' + einordnung.length + ' Zellen, z. B. «' + (einordnung[0] || '') + '»)');
  // Paket A (A2): Ohne benchmarkrelevanten Filter ist die Auswahl der Benchmark – keine «● 0.0 pp»-Zeile auf zehn Kacheln,
  // die Vergleichstabelle bleibt eingeklappt und nennt den Grund samt Weg zum Bank-Filter
  const vergleich = () => page.evaluate(() => {
    const s = [...document.querySelectorAll('#view section.block, #view details.block')].find((x) => (x.querySelector('h3, summary') || {}).textContent.startsWith('Auswahl im Vergleich'));
    const satz = document.querySelector('#view .benchmark-gleichstand');
    // Der Satz steht sichtbar vor der Tabelle, nicht im Aufklapper
    return s ? { tag: s.tagName, open: s.tagName === 'DETAILS' ? s.open : true, satz: satz ? satz.textContent : '', sichtbar: satz ? satz.getClientRects().length > 0 : false } : null;
  });
  // Keine Kachel ist höher, als ihr Inhalt verlangt: je Reihe füllt mindestens eine Kachel ihre Höhe ganz aus (kein Platz auf Vorrat)
  const kachelFuellung = () => page.$$eval('#view .kpi:not(.count)', (tiles) => {
    const rows = new Map();
    for (const t of tiles) {
      const box = t.getBoundingClientRect();
      const last = t.lastElementChild.getBoundingClientRect();
      const rest = Math.round(box.bottom - last.bottom - parseFloat(getComputedStyle(t).paddingBottom));
      const key = Math.round(box.top);
      rows.set(key, Math.min(rows.has(key) ? rows.get(key) : 1e9, rest));
    }
    return [...rows.values()];
  });
  const zu = await vergleich();
  const restOhne = await kachelFuellung();
  check((await page.locator('#view .kpi-delta').count()) === 0 && zu && zu.tag === 'DETAILS' && !zu.open && zu.sichtbar && /Kein Filter aktiv/.test(zu.satz) && /Bank wählen/.test(zu.satz),
    'A2 Übersicht ohne Filter: keine Delta-Zeile, Vergleichstabelle eingeklappt mit Satz «' + zu.satz.trim().slice(0, 70) + '»');
  check((await page.locator('#view .benchmark-gleichstand button.linklike').count()) === 1, 'A2 Übersicht ohne Filter: Link «Bank wählen» im Satz');
  await shot(page, 'uebersicht-ohne-filter');
  await page.locator('#filterbar label:has-text("Bank") select').selectOption({ label: 'Testbank AG' });
  await page.waitForSelector('#view .kpi-delta');
  const offen = await vergleich();
  check(offen && offen.tag === 'SECTION' && !offen.satz, 'A2 Übersicht mit Bank-Filter: Vergleichstabelle offen, kein Gleichstand-Satz');
  check(restOhne.length >= 2 && restOhne.every((r) => r <= 1), 'A3 Übersicht ohne Filter: keine Kachel höher als ihr Inhalt verlangt (Rest je Reihe ' + restOhne.join('/') + ' px)');
  const deltas = await page.$$eval('#view .kpi-delta', (d) => d.map((x) => x.textContent.trim()));
  check(deltas.length >= 5 && deltas.every((t) => /^[▲▼●] [+−]?\d+\.\d pp vs\. /.test(t)), 'Benchmark-Delta je Quoten-Kachel mit Symbol und Vorzeichen (' + deltas.length + ', z. B. «' + deltas[0] + '»)');
  const deltaCells = await page.$$eval('#view td.delta', (t) => t.map((x) => x.textContent.trim()));
  check(deltaCells.length >= 5 && deltaCells.every((t) => /^[▲▼●] [+−]?\d+\.\d pp$/.test(t)) && (await page.locator('#view td.delta.pos, #view td.delta.neg').count()) >= 1, 'Differenzspalte der Vergleichstabelle mit Symbol, Vorzeichen und Farbe (' + deltaCells.length + ' Zellen)');
  await shot(page, 'uebersicht-benchmark');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Histogramm (PROMPT-2 Paket G, G.4): Schriftlich und Mündlich zeigen die Verteilung der Resultate (1. Versuch) als Balkendiagramm
  // (Auswahl vs. Benchmark, Klassen à 10 pp) mit Legende und Tabellen-Zwilling; Tooltip per Tastatur; n < 5 → Hinweis statt Diagramm
  for (const v of ['schriftlich', 'muendlich']) {
    await page.goto(server.url + '#' + v);
    await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const bars = await page.evaluate(() => ({
      svg: document.querySelectorAll('#view svg.viz-bars').length, rects: document.querySelectorAll('#view svg.viz-bars rect.viz-bar').length,
      legend: document.querySelectorAll('#view .viz-legend-item').length, twin: [...document.querySelectorAll('#view table caption')].some((c) => /Verteilung der Resultate/.test(c.textContent)),
      ticks: [...document.querySelectorAll('#view svg.viz-bars text.viz-tick')].map((t) => t.textContent),
    }));
    check(bars.svg === 1 && bars.rects >= 10 && bars.legend === 2 && bars.twin && bars.ticks.includes('90–100') && bars.ticks.some((t) => /%$/.test(t)), 'Ansicht ' + v + ': Histogramm der Resultate (' + bars.rects + ' Balken, 2 Reihen, Tabellen-Zwilling, Klassen bis 90–100)');
  }
  await page.focus('#view svg.viz-bars');
  await page.keyboard.press('ArrowLeft');
  const barTip = await page.evaluate(() => { const t = document.querySelector('#view .viz-tip'); return { hidden: !t || t.hidden, text: t ? t.textContent : '' }; });
  check(!barTip.hidden && /Auswahl/.test(barTip.text) && /%/.test(barTip.text), 'Histogramm: Tooltip per Tastatur (' + barTip.text.slice(0, 70) + ')');
  await page.selectOption('#filterbar label:has-text("Profil") select', 'IK');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check((await page.locator('#view svg.viz-bars').count()) === 0 && /Verteilung erst ab 5/.test(await page.textContent('#view')) && (await page.locator('#view table caption:has-text("Verteilung der Resultate")').count()) === 1, 'Histogramm: Profil IK (n < 5) → Hinweis statt Diagramm, Tabelle bleibt');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Tastatur (A.8): mit Tab von oben durch Navigation und Filterleiste bis zum Export-Menü
  // Startpunkt der Tab-Reihenfolge an den Seitenanfang setzen (nach einem ausgeblendeten Button läge er sonst dahinter)
  await page.evaluate(() => { const b = document.body; b.tabIndex = -1; b.focus(); b.removeAttribute('tabindex'); window.scrollTo(0, 0); });
  const reached = { nav: false, filter: false, menu: false };
  for (let i = 0; i < 40 && !reached.menu; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return '';
      if (a.closest('#nav')) return 'nav';
      if (a.closest('#filterbar')) return 'filter';
      if (a.matches('#view details.menu > summary')) return 'menu';
      return '';
    });
    if (where) reached[where] = true;
  }
  check(reached.nav && reached.filter && reached.menu, 'Tastatur: Tab erreicht Navigation, Filterleiste und Export-Menü (' + JSON.stringify(reached) + ')');

  // View-Kopf (A.3): Export-Menü per Tastatur; «Definitionen» springt ins Glossar und fokussiert den Begriff
  await page.focus('#view details.menu > summary');
  await page.keyboard.press('Enter');
  check((await page.locator('#view details.menu[open] .menu-item').count()) >= 3, 'Export-Menü per Tastatur geöffnet (CSV, XLSX, Druckansicht)');
  await page.keyboard.press('Enter');
  check((await page.locator('#view details.menu[open]').count()) === 0, 'Export-Menü per Tastatur geschlossen');
  await page.click('#view a.link-definitionen');
  await page.waitForFunction(() => location.hash.startsWith('#glossar') && !!document.querySelector('#view tr[id^="glossar-"]'), null, { timeout: 5000 });
  const focusedTerm = await page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
  check(focusedTerm.startsWith('glossar-'), 'Definitionen: Sprung ins Glossar mit Fokus auf dem Begriff (' + focusedTerm + ')');
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Filter (A.2): Profil = PK wirkt als Chip und in der URL; Fokus bleibt auf dem Auswahlfeld; Jahr als Auswahlfeld;
  // Chip ✕ entfernt nur diesen Filter; Reset nur sichtbar, wenn ein Filter aktiv ist
  check(await page.locator('#filterbar button.reset').isHidden(), 'Reset ohne aktiven Filter ausgeblendet');
  const before = await summaryText();
  await page.focus('#filterbar label:has-text("Profil") select');
  await page.locator('#filterbar label:has-text("Profil") select').selectOption('PK');
  await page.waitForFunction((b) => document.querySelector('#filterbar .summary').textContent !== b, before, { timeout: 5000 });
  check((await page.locator('#filterbar .chip', { hasText: 'Profil PK' }).count()) === 1 && /profil=PK/.test(page.url()), 'Filter Profil = PK wirkt: Chip «Profil PK», steht in der URL');
  check(await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'SELECT' && document.activeElement.closest('label').textContent.startsWith('Profil')), 'Fokus bleibt nach der Filteränderung auf dem Auswahlfeld Profil');
  await page.locator('#filterbar label:has-text("Jahr") select').selectOption('2026');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 2, null, { timeout: 5000 });
  check(/von=2026-01-01/.test(page.url()) && (await page.locator('#filterbar .chip', { hasText: '2026' }).count()) === 1 && (await page.locator('#filterbar button.reset').isVisible()), 'Jahr 2026 gewählt: Chip «2026», Von/Bis in der URL, Reset sichtbar');
  await shot(page, 'filter-chips');
  await page.locator('#filterbar .chip', { hasText: '2026' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check(!/von=/.test(page.url()) && /profil=PK/.test(page.url()) && (await page.locator('#filterbar label:has-text("Jahr") select').inputValue()) === '', 'Chip ✕ entfernt nur den Zeitraum; Profil bleibt, Jahr zeigt «Alle»');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  check(!/profil=/.test(page.url()) && (await page.locator('#filterbar button.reset').isHidden()), 'Filter zurückgesetzt: URL ohne Filter, keine Chips, Reset ausgeblendet');

  // Paket A (A1): Felder, die eine Ansicht nicht auswertet, sind deaktiviert und abgesetzt statt in der Kurzbeschreibung erklärt.
  // Erwartete Zahl abgeschalteter Felder je Ansicht; auf «Datenqualität» verschwindet die Leiste ganz.
  const OFF = {
    uebersicht: 0, schriftlich: 0, muendlich: 0, 'vss-vsm': 0, bestenlisten: 0, 'bank-report': 0,
    zeitverlauf: 3, 'offene-vorgaenge': 3, 'geplante-pruefungen': 3, personen: 4, experten: 1,
  };
  // Ganz ohne Leiste: Datenqualität (voller Bestand), Historie (Snapshot der ganzen Datei), Glossar (statisch)
  const OHNE_LEISTE = ['datenqualitaet', 'historie', 'glossar'];
  for (const [view, expected] of Object.entries(OFF)) {
    await page.goto(server.url + '#' + view);
    await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), view, { timeout: 5000 });
    const off = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#filterbar .filter-controls > label')];
      const inactive = labels.filter((l) => l.classList.contains('inactive'));
      return {
        n: inactive.length,
        namen: inactive.map((l) => (l.firstChild.textContent.trim() || l.textContent.trim())),
        disabled: inactive.every((l) => l.querySelector('input, select').disabled) && labels.filter((l) => !l.classList.contains('inactive')).every((l) => !l.querySelector('input, select').disabled),
        grund: inactive.every((l) => (l.getAttribute('title') || '').length > 10),
      };
    });
    check(off.n === expected && off.disabled && off.grund, 'A1 ' + view + ': ' + off.n + ' von ' + expected + ' Feldern abgeschaltet (' + (off.namen.join(' · ') || 'keine') + '), disabled und Grund als title');
  }
  check((await page.locator('#filterbar label:has-text("Versuche")').getAttribute('title')) !== null, 'A1 Experten: Grund am abgeschalteten Feld «Versuche»');
  check((await page.locator('#filterbar .filter-hinweis').isVisible()) && /Run-Datum/.test(await page.textContent('#filterbar .filter-hinweis')), 'A1 Experten: Zeitraum bleibt aktiv, mit sichtbarem Hinweis auf das Run-Datum');
  await shot(page, 'filter-abgeschaltet');
  for (const view of OHNE_LEISTE) {
    await page.goto(server.url + '#' + view);
    await page.waitForSelector('#view h2');
    const satz = await page.textContent('#view p.filter-note');
    check((await page.locator('#filterbar').isHidden()) && /^Ohne Filterleiste: /.test(satz) && (await page.locator('#view p.filter-note button.reset').count()) === 0,
      'A1 ' + view + ': keine Filterleiste, dafür ein Satz («' + satz.slice(0, 60) + '…»), ohne Filter kein Reset');
  }
  // Gesetzter Filter bleibt erhalten, auch wo keine Leiste steht: der Satz nennt ihn und bietet «Filter zurücksetzen» an
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  await page.selectOption('#filterbar label:has-text("Profil") select', 'PK');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  for (const view of OHNE_LEISTE) {
    await page.goto(server.url + '#' + view + hashQuery(page.url()));
    await page.waitForSelector('#view p.filter-note button.reset');
    check(/1 gesetzter Filter wirkt hier nicht/.test(await page.textContent('#view p.filter-note')) && /profil=PK/.test(page.url()),
      'A1 ' + view + ': gesetzter Filter bleibt in der URL, der Satz nennt ihn und trägt «Filter zurücksetzen»');
  }
  await page.locator('#view p.filter-note button.reset').click();
  await page.waitForFunction(() => !/profil=/.test(location.hash), null, { timeout: 5000 });
  check((await page.locator('#view p.filter-note button.reset').count()) === 0, 'A1 Glossar: Reset im Satz räumt den Filter weg und verschwindet danach');
  // Der gesetzte Wert bleibt erhalten: Jahr auf der Übersicht setzen, auf dem Zeitverlauf ist er stumm, danach wirkt er wieder
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  await page.locator('#filterbar label:has-text("Jahr") select').selectOption('2026');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  await page.goto(server.url + '#zeitverlauf' + hashQuery(page.url()));
  await page.waitForFunction(() => !!document.querySelector('#view h2') && location.hash.startsWith('#zeitverlauf'), null, { timeout: 5000 });
  const stumm = await page.evaluate(() => ({
    chips: document.querySelectorAll('#filterbar .chip').length,
    jahr: document.querySelector('#filterbar .filter-controls > label select').value,
    note: (document.querySelector('#filterbar .summary-inactive') || {}).textContent || '',
    reset: !document.querySelector('#filterbar button.reset').hidden,
  }));
  check(stumm.chips === 0 && stumm.jahr === '2026' && /wirkt hier nicht/.test(stumm.note) && stumm.reset && /von=2026-01-01/.test(page.url()), 'A1 Zeitverlauf: Jahr 2026 bleibt gesetzt (Feld und URL), kein Chip, Notiz «wirkt hier nicht», Reset sichtbar');
  await page.goto(server.url + '#uebersicht' + hashQuery(page.url()));
  await page.waitForSelector('#view .kpi');
  check((await page.locator('#filterbar .chip', { hasText: '2026' }).count()) === 1 && (await page.locator('#filterbar .summary-inactive').isHidden()), 'A1 Übersicht: zurück – der Jahresfilter wirkt wieder, Chip «2026» erscheint erneut');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Offene Vorgänge (A.5): Statuszellen als Badge (Spalte «Passiv» = ja)
  await page.goto(server.url + '#offene-vorgaenge');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view td .badge.status-passiv').count()) >= 1, 'Statuszellen als Badge (Offene Vorgänge, passiv)');

  // Geplante Prüfungen: Ereigniszeile per Klick und Enter, Teilnehmendenliste
  await page.goto(server.url + '#geplante-pruefungen');
  await page.waitForSelector('#view tr.expandable[role="button"]');
  const rows = page.locator('#view tr.expandable[role="button"]');
  await rows.first().click();
  check((await rows.first().getAttribute('aria-expanded')) === 'true' && (await page.locator('#view tr.event-detail:not([hidden]) table').count()) === 1, 'Ereigniszeile per Klick aufgeklappt, zugeteilte Personen sichtbar');
  await rows.first().focus();
  await page.keyboard.press('Enter');
  check((await rows.first().getAttribute('aria-expanded')) === 'false', 'Ereigniszeile per Enter wieder zugeklappt');
  await page.locator('#view details.fold > summary').first().click();
  check((await page.locator('#view details.fold[open]').count()) === 1, 'Teilnehmendenliste aufgeklappt');
  await shot(page, 'geplante-pruefungen-offen');

  // Druck: eingeklappte Blöcke öffnen sich (beforeprint) und schliessen wieder (afterprint)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  check((await page.locator('#view details.fold:not([open])').count()) === 0, 'Druck: alle eingeklappten Blöcke geöffnet');
  await page.emulateMedia({ media: 'print' });
  await shot(page, 'print-geplante-pruefungen');
  await page.emulateMedia({ media: null });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check((await page.locator('#view details.fold[open]').count()) === 1, 'Nach dem Druck: nur der zuvor geöffnete Block bleibt offen');

  // Datenqualität: Suche filtert und behält den Fokus (Debounce 150 ms)
  await page.goto(server.url + '#datenqualitaet');
  await page.waitForSelector('#view .dq-text');
  // Eintrag ohne Person (Zeile ohne Namen, Hotfix 07.09.2026): Strich statt Sprung, die Ansicht rendert trotzdem
  check((await page.locator('#view td.col-person').count()) >= 2 && (await page.locator('#view td.col-person:not(:has(button))').count()) >= 1 && (await page.locator('#view td.col-person', { hasText: '–' }).count()) >= 1, 'Datenqualität: Eintrag ohne Person (Zeile ohne Namen) → Strich statt «Zur Person», Tabelle rendert');
  const allRows = await page.locator('#view table.dq-table tbody tr').count();
  await page.fill('#view .dq-text', 'Score');
  await page.waitForTimeout(500);
  const filtered = await page.locator('#view table.dq-table tbody tr').count();
  const counter = (await page.textContent('#view .dq-count')).trim();
  check(filtered > 0 && filtered < allRows && counter.startsWith(filtered + ' von ' + allRows), 'DQ-Suche «Score» filtert (' + filtered + ' von ' + allRows + ' Einträgen; Zähler: «' + counter.slice(0, 40) + '…»)');
  check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('dq-text')), 'DQ-Suche behält den Fokus');
  // Bereinigung: Sprung vom Eintrag zur Person und zur betroffenen Zelle (Schreibpfad-Arbeitsablauf)
  await page.fill('#view .dq-text', 'RUN1 Result');
  await page.waitForTimeout(400);
  const jumpRow = page.locator('#view table.dq-table tbody tr').first();
  check((await jumpRow.locator('button.dq-jump').count()) === 1, 'Datenqualität: Schaltfläche «Zur Person» je Eintrag mit Zeile');
  await jumpRow.locator('button.dq-jump').click();
  await page.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail', { timeout: 5000 });
  check(/#personen/.test(page.url()) && !/muster|anna|query|selected/i.test(page.url()), 'Sprung: Ansicht Personen, keine Personendaten in der URL (' + page.url().replace(server.url, '') + ')');
  check((await page.locator('#view td.dq-target').count()) === 1 && (await page.locator('#view details.vorgang-card[open]').count()) >= 1, 'Sprung: Karte des Vorgangs offen, betroffene Zelle markiert');
  check((await page.locator('#view .person-search').inputValue()).length > 0, 'Sprung: Suchfeld mit dem Namen gefüllt (nur im Memory)');
  await page.fill('#view .person-search', ''); // Suchzustand für die folgenden Prüfungen zurücksetzen (bleibt sonst im Memory)
  await page.waitForSelector('#view .person-results p.empty', { timeout: 5000 });

  // Personen (Paket C): Suche mit synthetischem Namen, Detail mit Pfad, Raster (Badges) und Zeitachse; Suchtext nie in der URL
  await page.goto(server.url + '#personen');
  await page.waitForSelector('#view .person-search');
  check((await page.locator('#view .person-results table').count()) === 0 && (await page.locator('#view .person-results p.empty').count()) === 1, 'Personen: ohne Suchtext leere Liste mit Hinweis');
  await page.fill('#view .person-search', 'wechsel');
  await page.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  check((await page.locator('#view .person-results tr.expandable').count()) === 1 && (await page.evaluate(() => document.activeElement.classList.contains('person-search'))), 'Personen: «wechsel» findet eine Person, Fokus bleibt im Suchfeld');
  check(!/wechsel/i.test(page.url()) && !/personen\?/.test(page.url()), 'Personen: Suchtext steht nicht in der URL (' + page.url().replace(server.url, '') + ')');
  await page.locator('#view .person-results tr.expandable').first().click();
  await page.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail');
  const pathSteps = await page.$$eval('#view .person-path li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check(pathSteps.length === 2 && /^PK · 2023 · bestanden · Zertifikat Z-7/.test(pathSteps[0]) && /^IK · 2026 · offen/.test(pathSteps[1]) && /Passerelle möglich \(PK\)/.test(pathSteps[1]), 'Personen: Pfad PK → IK mit Zertifikat und Passerelle (' + pathSteps.join(' | ') + ')');
  check(/früher: Testbank AG/.test(await page.textContent('#view .person-head')), 'Personen: Bankwechsel als «früher: Testbank AG»');
  check((await page.locator('#view details.vorgang-card').count()) === 2 && (await page.locator('#view details.vorgang-card[open]').count()) === 1, 'Personen: zwei Karten je Vorgang, nur der jüngste offen');
  check((await page.locator('#view details.vorgang-card[open] .person-grid td .badge').count()) >= 1 && (await page.locator('#view details.vorgang-card[open] table.data').count()) >= 2, 'Personen: Raster mit Badges und Zeitachse in der offenen Karte');
  check(/Ende 30\.06\.2028/.test(await page.textContent('#view details.vorgang-card:not([open])')), 'Personen: Zertifikatsende (certEnd) in der Karte PK');
  check((await page.locator('#view .run-edit, #view td.editable').count()) === 0 && (await page.locator('#btn-edit-mode').isHidden()), 'Personen: ohne Feature-Flag keine Bearbeiten-Elemente und kein Schalter (Phase 2)');
  await page.locator('#view .person-results tr.expandable').first().click();
  check(await page.locator('#view tr.event-detail').first().isHidden(), 'Personen: Detail wieder zugeklappt');
  await page.fill('#view .person-search', 'zwilling');
  await page.waitForFunction(() => document.querySelectorAll('#view .person-results tr.expandable').length === 2, null, { timeout: 5000 });
  check((await page.$$eval('#view .person-results thead th', (th) => th.map((x) => x.textContent))).includes('Jahrgang'), 'Personen: Namensgleiche → Spalte Jahrgang');
  await page.fill('#view .person-search', '');
  await page.waitForSelector('#view .person-results p.empty', { timeout: 5000 }); // Debounce abwarten: Liste leer, bevor der Bank-Filter wirkt
  await page.locator('#filterbar label:has-text("Bank") select').selectOption({ label: 'Musterbank' });
  await page.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  check((await page.locator('#view .person-results tr.expandable').count()) === 5 && (await page.locator('#view .person-search').inputValue()) === '', 'Personen: ohne Suchtext mit Bank-Filter alle Personen der Bank (5)');
  await page.locator('#filterbar label:has-text("Profil") select').selectOption('IK');
  await page.waitForFunction(() => document.querySelectorAll('#view .person-results tr.expandable').length === 2, null, { timeout: 5000 });
  await page.locator('#view .person-results tr.expandable', { hasText: 'Wechsel' }).click();
  await page.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail');
  check((await page.locator('#view tr.event-detail:not([hidden]) details.vorgang-card').count()) === 2, 'Personen: Profil-Filter IK – Detail zeigt trotzdem beide Vorgänge (PK und IK)');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  await shot(page, 'personen');

  // Experten (Paket D): Kacheln, Haupttabelle mit synthetischen Experten, Sortierung, Zeilen-Detail, Paarungen, Zeitraum auf Einsätze, Export Einsatzebene
  await page.goto(server.url + '#experten');
  await page.waitForSelector('#view .expert-table table');
  const expertNames = await page.$$eval('#view .expert-table tbody tr.expandable td:nth-child(2)', (tds) => tds.map((td) => td.textContent.trim()));
  check((await page.locator('#view .kpi').count()) >= 6 && expertNames.join(',') === 'Experte Emil,Prüfer Pia,Beisitz Bruno', 'Experten: sechs Kacheln, Haupttabelle nach Einsätzen absteigend (' + expertNames.join(', ') + ')');
  check(!(await page.textContent('#view .expert-table')).includes('Muster Anna'), 'Experten: keine Kandidatennamen in der Haupttabelle');
  const einsaetzeKpi = () => page.$$eval('#view .kpi', (k) => { const t = k.find((x) => x.querySelector('.kpi-label').textContent.startsWith('Einsätze')); return t ? t.querySelector('.kpi-value').textContent.trim() : ''; });
  check((await einsaetzeKpi()) === '7', 'Experten: Kachel Einsätze = 7 (synthetische Datei)');
  await page.click('#view .expert-table th.sortable button[aria-label="Sortieren nach Experte"]');
  await page.waitForFunction(() => { const td = document.querySelector('#view .expert-table tbody tr.expandable td:nth-child(2)'); return td && td.textContent.trim() === 'Beisitz Bruno'; }, null, { timeout: 5000 });
  check((await page.getAttribute('#view .expert-table th.sortable.active', 'aria-sort')) === 'ascending' && !/sort/i.test(page.url()), 'Experten: Sortierung nach Name (aria-sort ascending), nicht in der URL');
  await page.click('#view .expert-table th.sortable button[aria-label="Sortieren nach Durchfallquote 1. Versuch"]');
  await page.waitForFunction(() => { const td = document.querySelector('#view .expert-table tbody tr.expandable td:nth-child(2)'); return td && td.textContent.trim() === 'Experte Emil'; }, null, { timeout: 5000 });
  check((await page.getAttribute('#view .expert-table th.sortable.active', 'aria-sort')) === 'descending', 'Experten: Sortierung nach Durchfallquote 1. Versuch absteigend (Emil 40.0 % zuerst)');
  await page.locator('#view .expert-table tr.expandable').first().click();
  await page.waitForSelector('#view .expert-table tr.event-detail:not([hidden]) .expert-detail');
  check((await page.locator('#view .expert-table tr.event-detail:not([hidden]) .expert-detail table').count()) === 4, 'Experten: Zeilen-Detail mit vier Tabellen (Jahr, Profil, Sprache, Partner)');
  const pairRows = await page.evaluate(() => { const s = [...document.querySelectorAll('#view section.block')].find((x) => (x.querySelector('h3') || {}).textContent.startsWith('Paarungen')); return s ? s.querySelectorAll('tbody tr').length : -1; });
  check(pairRows >= 3, 'Experten: Paarungstabelle mit ' + pairRows + ' Paaren');
  await page.click('#view details.menu > summary');
  check((await page.locator('#view details.menu[open] .menu-item', { hasText: 'CSV (Einsatzebene)' }).count()) === 1, 'Experten: Export-Menü mit «CSV (Einsatzebene)»');
  await page.click('#view details.menu > summary');
  await page.locator('#filterbar label:has-text("Jahr") select').selectOption('2024');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  await page.waitForSelector('#view .expert-table table');
  check((await einsaetzeKpi()) === '4', 'Experten: Zeitraum 2024 → Einsätze = 4 (Run-Datum, nicht Referenzdatum)');
  await shot(page, 'experten');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Schreibpfad (Paket E, E.3): UI nur mit Flag – im Test wird config.js per Route mit write: true ausgeliefert (kein Eingriff im Repo).
  // Dialog je Run-Zelle, Validierung mit den Parsern, Vorschau alt → neu, Grund als Pflichtfeld, Schutz bei lokaler Datei (kein Schreiben ohne SharePoint).
  const writePage = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  writePage.on('pageerror', (e) => errors.push('write pageerror: ' + e.message));
  await routeConfig(writePage, true);
  await writePage.goto(server.url, { waitUntil: 'networkidle' });
  await writePage.setInputFiles('#file-input', xlsx);
  await writePage.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  await writePage.goto(server.url + '#personen');
  await writePage.waitForSelector('#view .person-search');
  await writePage.fill('#view .person-search', 'wechsel');
  await writePage.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  await writePage.locator('#view .person-results tr.expandable').first().click();
  await writePage.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail');
  check((await writePage.locator('#view td.editable').count()) === 0 && (await writePage.locator('#view button.run-edit').count()) === 0, 'Schreibpfad: mit Flag, aber ohne Modus keine Bearbeiten-Elemente (Standard nur lesen)');
  check((await writePage.locator('#btn-edit-mode').isVisible()) && (await writePage.getAttribute('#btn-edit-mode', 'aria-pressed')) === 'false', 'Schreibpfad: Schalter «Bearbeiten» im Kopf sichtbar und aus');
  await writePage.click('#btn-edit-mode');
  await writePage.waitForSelector('#view details.vorgang-card[open] .person-grid td.editable', { timeout: 5000 });
  check((await writePage.getAttribute('#btn-edit-mode', 'aria-pressed')) === 'true' && (await writePage.locator('#edit-mode-hint').isVisible()) && !/edit/i.test(writePage.url()), 'Schreibpfad: Bearbeitungsmodus an (aria-pressed, Hinweis), nicht in der URL');
  const editable = await writePage.locator('#view details.vorgang-card[open] .person-grid td.editable[role="button"]').count();
  check(editable >= 3 && (await writePage.locator('#view button.run-edit').count()) === 0, 'Schreibpfad: Zellen des Rasters anklickbar (' + editable + '), keine Knöpfe');
  await writePage.locator('#view details.vorgang-card[open] .person-grid td.editable').first().focus();
  await writePage.keyboard.press('Enter');
  await writePage.waitForSelector('dialog.edit-dialog[open]');
  check((await writePage.locator('dialog.edit-dialog[open] select.edit-field option').count()) >= 4 && /WE1 RUN1/.test(await writePage.textContent('dialog.edit-dialog[open] h3')), 'Schreibpfad: Dialog mit Feldwahl und Fundstelle (' + (await writePage.textContent('dialog.edit-dialog[open] h3')).trim() + ')');
  await writePage.selectOption('dialog.edit-dialog[open] select.edit-field', 'date');
  await writePage.fill('dialog.edit-dialog[open] input.edit-value', '32.13.2026');
  await writePage.waitForFunction(() => { const m = document.querySelector('dialog.edit-dialog[open] .edit-error'); return m && m.textContent.length > 0; }, null, { timeout: 5000 });
  check(await writePage.locator('dialog.edit-dialog[open] button.edit-confirm').isDisabled(), 'Schreibpfad: ungültiges Datum blockiert mit Parser-Meldung («' + (await writePage.textContent('dialog.edit-dialog[open] .edit-error')).slice(0, 40) + '…»)');
  await writePage.fill('dialog.edit-dialog[open] input.edit-value', '01.03.2026');
  await writePage.fill('dialog.edit-dialog[open] input.edit-reason', 'Datum korrigiert');
  await writePage.waitForFunction(() => { const p = document.querySelector('dialog.edit-dialog[open] .edit-preview'); const b = document.querySelector('dialog.edit-dialog[open] button.edit-confirm'); return p && /→/.test(p.textContent) && b && !b.disabled; }, null, { timeout: 5000 });
  check(/01\.03\.2026/.test(await writePage.textContent('dialog.edit-dialog[open] .edit-preview')), 'Schreibpfad: Vorschau alt → neu, Bestätigen mit Grund möglich (' + (await writePage.textContent('dialog.edit-dialog[open] .edit-preview')).trim() + ')');
  await writePage.click('dialog.edit-dialog[open] button.edit-confirm');
  await writePage.waitForFunction(() => { const m = document.querySelector('dialog.edit-dialog[open] .edit-error'); return m && /SharePoint/.test(m.textContent); }, null, { timeout: 5000 });
  check(true, 'Schreibpfad: lokale Datei → Hinweis «nur bei SharePoint», kein Schreibversuch');
  await writePage.screenshot({ path: join(outDir, 'schreibpfad-dialog.png'), fullPage: false });
  await writePage.click('dialog.edit-dialog[open] button.edit-cancel');
  check((await writePage.locator('dialog.edit-dialog[open]').count()) === 0, 'Schreibpfad: Dialog geschlossen');
  await writePage.click('#btn-edit-mode');
  await writePage.waitForFunction(() => document.querySelectorAll('#view td.editable').length === 0, null, { timeout: 5000 });
  check((await writePage.getAttribute('#btn-edit-mode', 'aria-pressed')) === 'false' && (await writePage.locator('#edit-mode-hint').isHidden()), 'Schreibpfad: Modus aus → Raster wieder nur lesen');
  await writePage.close();

  // Historie (b7): Snapshot herunterladen (ohne Namen), wieder laden, Vergleich mit «Heute»
  await page.goto(server.url + '#historie');
  await page.waitForSelector('#view h2');
  // Historie der App-Änderungen: eigener Abschnitt; bei lokaler Datei leer mit Hinweis (keine Tabelle)
  const auditSection = await page.evaluate(() => { const s = [...document.querySelectorAll('#view section.block')].find((x) => (x.querySelector('h3') || {}).textContent.startsWith('Änderungen über die App')); return s ? s.textContent : ''; });
  check(/Änderungen über die App/.test(auditSection) && /lokal|kein/i.test(auditSection), 'Historie: Abschnitt «Änderungen über die App» mit Hinweis bei lokaler Datei');
  check((await page.locator('#view p.empty').count()) >= 1 && (await page.locator('#view table').count()) === 0, 'Historie ohne Snapshot: Hinweis, keine Vergleichstabellen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#view button:has-text("Snapshot herunterladen")').click()]);
  const snapshotPath = join(outDir, download.suggestedFilename());
  await download.saveAs(snapshotPath);
  const snapshotText = readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(snapshotText);
  check(/^cockpit-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && snapshot.format === 'bbz-cockpit-snapshot' && snapshot.kennzahlen.vorgaenge.value === 13, 'Snapshot heruntergeladen: ' + download.suggestedFilename() + ', ' + snapshot.kennzahlen.vorgaenge.value + ' Vorgänge');
  const names = ['Muster', 'Anna', 'Beispiel', 'Ben', 'Olga', 'Paul', 'Petra', 'Tom', 'Nora', 'Bea', 'Zoe', 'Wechsel', 'Willi', 'Zwilling', 'Gabi', 'Datumlos', 'Otto', 'Testbank', 'Musterbank'];
  check(names.every((n) => !snapshotText.includes(n)), 'Snapshot enthält keine Namen und keine Banken');
  await page.setInputFiles('#view input[type="file"]', snapshotPath);
  await page.waitForSelector('#view table.data');
  const historyHeads = await page.$$eval('#view table.data caption', (c) => c.map((x) => x.textContent));
  check(historyHeads.length === 6 && /Kennzahlen je Stichtag/.test(historyHeads[0]), 'Snapshot geladen, Vergleich mit ' + historyHeads.length + ' Tabellen');
  const vorgRow = await page.$$eval('#view table.data tbody tr', (trs) => { const tr = trs.find((r) => r.children[0].textContent === 'Vorgänge'); return tr ? Array.from(tr.children).map((td) => td.textContent) : null; });
  check(!!vorgRow && vorgRow[1] === '13' && vorgRow[2] === '13' && /(^|\s)±0$/.test(vorgRow[3]), 'Vergleich: Vorgänge Snapshot = Heute = 13, Differenz ±0 mit Symbol (' + (vorgRow || []).join(' | ') + ')');
  check((await page.locator('#view .snapshot-list li').count()) === 1, 'Geladener Snapshot in der Liste');
  await shot(page, 'historie');
  await page.locator('#view .snapshot-list button:has-text("Entfernen")').click();
  await page.waitForSelector('#view p.empty');
  check((await page.locator('#view table.data').count()) === 0, 'Snapshot entfernt, Vergleich wieder leer');

  // Dark Mode: Zeitverlauf mit Diagramm, Übersicht mit Kacheln und Tabellen (A.8)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(server.url + '#zeitverlauf');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view svg').count()) >= 1, 'Dark Mode: Zeitverlauf mit Diagramm gerendert');
  await shot(page, 'dark-zeitverlauf');
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(darkBg === 'rgb(20, 22, 26)', 'Dark Mode: Übersicht mit dunklem Hintergrund (' + darkBg + ')');
  await shot(page, 'dark-uebersicht');
  await page.goto(server.url + '#schriftlich');
  await page.waitForSelector('#view svg.viz-bars');
  check((await page.locator('#view svg.viz-bars rect.viz-bar').count()) >= 10, 'Dark Mode: Schriftlich mit Histogramm gerendert');
  await shot(page, 'dark-schriftlich');
  await page.emulateMedia({ colorScheme: 'light' });

  // Druck (A.8): Legende geöffnet, Datenbalken hell und grau, Kopf-Aktionen ausgeblendet
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const printBar = await page.evaluate(() => { const td = document.querySelector('#view td.pct'); return td ? getComputedStyle(td).backgroundImage : ''; });
  const printActions = await page.evaluate(() => { const a = document.querySelector('#view .view-actions'); return a ? getComputedStyle(a).display : ''; });
  check(/rgba\(0, 0, 0, 0\.12\)/.test(printBar) && printActions === 'none' && (await page.locator('#view details.legend[open]').count()) === 1, 'Druck: Datenbalken grau, Export-Menü ausgeblendet, Legende offen');
  await shot(page, 'print-uebersicht');
  await page.emulateMedia({ media: null });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // Phone (B.1): 390 × 844 – jede Ansicht ohne horizontalen Seitenscroll, nur Prio-1-Spalten, Schalter «Alle Spalten» sichtbar
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await routeConfig(phone, false);
  phone.on('console', (m) => { if (m.type() === 'error') errors.push('phone console: ' + m.text()); });
  phone.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
  await phone.goto(server.url, { waitUntil: 'networkidle' });
  await phone.setInputFiles('#file-input', xlsx);
  await phone.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  // Phone-Kopf (PROMPT-2 F.3, F4): nach dem Laden Kopf bis zum Inhalt ≤ 260 px; Lade-Aktionen nicht in der Datenleiste, sondern
  // als Zeile «Neu laden · Lokale Datei» im Datenstand-details; Marke und Konto in einer Zeile
  const phoneHead = await phone.evaluate(() => {
    const top = Math.round(document.getElementById('view').getBoundingClientRect().top);
    const hidden = (sel) => document.querySelector(sel).getClientRects().length === 0;
    const brand = document.querySelector('.app-header .brand').getBoundingClientRect(); const session = document.querySelector('.app-header .session').getBoundingClientRect();
    return { top, loadHidden: hidden('#btn-load') && hidden('.file-label'), actions: document.querySelectorAll('#datastand .datastand-actions button').length, sameRow: brand.bottom > session.top && session.bottom > brand.top };
  });
  check(phoneHead.top <= 260 && phoneHead.loadHidden && phoneHead.actions === 2 && phoneHead.sameRow, 'Phone: Kopf bis zum Inhalt ' + phoneHead.top + ' px (≤ 260), Lade-Aktionen im Datenstand (' + phoneHead.actions + '), Marke und Konto in einer Zeile');
  await phone.screenshot({ path: join(outDir, 'phone-kopf.png'), fullPage: false });
  for (const v of views) {
    await phone.goto(server.url + '#' + v);
    await phone.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const hiddenPrio = await phone.evaluate(() => [...document.querySelectorAll('#view table.data td[data-prio="2"], #view table.data td[data-prio="3"]')].every((td) => getComputedStyle(td).display === 'none'));
    check(overflow <= 0 && hiddenPrio, 'Phone ' + v + ': kein Seitenscroll (' + overflow + ' px), nur Prio-1-Spalten');
    await phone.screenshot({ path: join(outDir, 'phone-' + v + '.png'), fullPage: true });
  }
  await phone.goto(server.url + '#uebersicht');
  await phone.waitForSelector('#view .kpi-groups'); // erste Kachel liegt auf Phone im geschlossenen Block «Mengen»
  const columnsToggle = phone.locator('#view .table-wrap .all-columns:visible').first(); // erster sichtbarer Schalter (eingeklappte Abschnitte überspringen)
  check(await columnsToggle.isVisible(), 'Phone: Schalter «Alle Spalten» sichtbar');
  await columnsToggle.click();
  check(await phone.evaluate(() => { const td = document.querySelector('#view .table-wrap.all-columns td[data-prio="3"]'); return !!td && getComputedStyle(td).display !== 'none'; }), 'Phone: «Alle Spalten» zeigt Prio-3-Spalten (horizontal scrollbar in .table-wrap)');
  const phoneFont = await phone.evaluate(() => getComputedStyle(document.querySelector('#filterbar select')).fontSize);
  const phoneTarget = await phone.evaluate(() => document.querySelector('#nav-select').getBoundingClientRect().height);
  check(parseFloat(phoneFont) >= 16 && phoneTarget >= 44, 'Phone: Eingabefelder 16 px, Touch-Ziele ≥ 44 px (' + phoneFont + ', ' + Math.round(phoneTarget) + ' px)');

  // Phone (B.2): Navigation als Auswahlfeld, Filter-Drawer, Kopf kompakt
  check((await phone.locator('#nav-select').isVisible()) && (await phone.evaluate(() => document.querySelector('#nav a').getClientRects().length === 0)), 'Phone: Navigation als Auswahlfeld, Links ausgeblendet');
  await phone.selectOption('#nav-select', 'offene-vorgaenge');
  await phone.waitForFunction(() => location.hash.startsWith('#offene-vorgaenge') && document.querySelector('#view h2').textContent === 'Offene Vorgänge', null, { timeout: 5000 });
  check((await phone.locator('#nav-select').inputValue()) === 'offene-vorgaenge', 'Phone: Ansicht über das Auswahlfeld gewechselt (Offene Vorgänge)');
  check(!(await phone.locator('#filterbar details.filter-drawer').evaluate((d) => d.open)) && (await phone.locator('#filterbar .filter-summary').isVisible()), 'Phone: Filter-Drawer geschlossen, Kopfzeile «Filter» sichtbar');
  await phone.locator('#filterbar .filter-summary').click();
  await phone.waitForSelector('#filterbar label:has-text("Profil") select', { state: 'visible' });
  await phone.selectOption('#filterbar label:has-text("Profil") select', 'PK');
  await phone.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check(/Filter \(1 aktiv\)/.test(await phone.textContent('#filterbar .filter-summary')) && /profil=PK/.test(phone.url()), 'Phone: Filter über Drawer gesetzt, Zähler «Filter (1 aktiv)», Chip, Hash wie Desktop');
  await phone.screenshot({ path: join(outDir, 'phone-filter-drawer.png'), fullPage: false });
  await phone.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await phone.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  check(await phone.evaluate(() => getComputedStyle(document.querySelector('#account')).display === 'none' && getComputedStyle(document.querySelector('.subtitle')).display === 'none'), 'Phone: Kopf kompakt (Untertitel und Kontotext ausgeblendet)');

  // Phone (B.3): Kachel-Blöcke als details (Schriftlich, Mündlich offen; Mengen zu), zwei Spalten, Delta ohne «vs.»; kompaktes Diagramm
  await phone.goto(server.url + '#uebersicht');
  await phone.waitForSelector('#view .kpi-groups'); // erste Kachel liegt auf Phone im geschlossenen Block «Mengen»
  const kpiGroups = await phone.$$eval('#view details.kpi-group', (ds) => ds.map((d) => d.querySelector('summary').textContent + ':' + (d.open ? 'offen' : 'zu')));
  const kpiCols = await phone.evaluate(() => { const k = document.querySelector('#view details.kpi-group[open] .kpis'); return k ? getComputedStyle(k).gridTemplateColumns.split(' ').length : 0; });
  const phoneSpread = await phone.evaluate(() => { const full = document.querySelector('#view details.kpi-group[open] .kpi-spread-full'); const short = document.querySelector('#view details.kpi-group[open] .kpi-spread-short'); return { full: full ? full.getClientRects().length : -1, short: short ? short.getClientRects().length : -1, text: short ? short.textContent.trim() : '' }; });
  check(phoneSpread.full === 0 && phoneSpread.short > 0 && /^σ \d+\.\d pp$/.test(phoneSpread.text), 'Phone: Streuung nur als Kurzform «σ x pp» (' + phoneSpread.text + ')');
  check(kpiGroups.join(',') === 'Mengen:zu,Schriftlich:offen,Mündlich:offen' && kpiCols === 2, 'Phone: Kachel-Blöcke als details (' + kpiGroups.join(', ') + '), zwei Spalten');
  await phone.screenshot({ path: join(outDir, 'phone-uebersicht-kacheln.png'), fullPage: true });
  // Delta erscheint erst mit einem benchmarkrelevanten Filter (A2), deshalb mit Bank im Hash
  await phone.goto(server.url + '#uebersicht?bank=' + encodeURIComponent('Testbank AG'));
  await phone.waitForSelector('#view .kpi-delta');
  const deltaVs = await phone.evaluate(() => { const s = [...document.querySelectorAll('#view .kpi-delta-vs')]; return { n: s.length, hidden: s.every((x) => getComputedStyle(x).display === 'none') }; });
  check(deltaVs.n >= 5 && deltaVs.hidden, 'Phone: Delta nur mit Symbol und Wert, «vs. Benchmark» ausgeblendet (' + deltaVs.n + ')');
  await phone.goto(server.url + '#zeitverlauf');
  await phone.waitForSelector('#view svg');
  const compactSvg = await phone.evaluate(() => ({ viewBox: document.querySelector('#view svg').getAttribute('viewBox'), labels: document.querySelectorAll('#view .viz-label').length, tip: (() => { const t = document.querySelector('#view .viz.compact .viz-tip'); return t ? getComputedStyle(t).position : 'fehlt'; })() }));
  check(compactSvg.viewBox === '0 0 360 200' && compactSvg.labels === 0 && compactSvg.tip === 'static', 'Phone: kompaktes Diagramm 360 × 200 ohne Endbeschriftung, Tooltip unter dem Diagramm (' + JSON.stringify(compactSvg) + ')');
  await phone.goto(server.url + '#schriftlich');
  await phone.waitForSelector('#view svg.viz-bars', { state: 'attached' });
  const phoneBars = await phone.evaluate(() => { const s = document.querySelector('#view svg.viz-bars'); const d = s.closest('details'); return { viewBox: s.getAttribute('viewBox'), folded: !!d && !d.open, ticks: [...s.querySelectorAll('text.viz-tick')].filter((t) => /–/.test(t.textContent)).length }; });
  check(phoneBars.viewBox === '0 0 360 200' && phoneBars.folded && phoneBars.ticks === 5, 'Phone Schriftlich: kompaktes Histogramm 360 × 200 im eingeklappten Abschnitt, jede zweite Klasse beschriftet (' + JSON.stringify(phoneBars) + ')');
  await phone.screenshot({ path: join(outDir, 'phone-zeitverlauf-kompakt.png'), fullPage: true });

  // Phone (B.4): priorisierte Ansichten – Nebenabschnitte eingeklappt, Kernspalten sichtbar
  const visibleHeads = (page, sectionTitle) => page.evaluate((t) => {
    const s = [...document.querySelectorAll('#view section.block, #view details.fold')].find((x) => (x.querySelector('h3, summary') || {}).textContent.startsWith(t));
    const table = s && s.querySelector('table');
    return table ? [...table.querySelectorAll('thead th')].filter((th) => th.getClientRects().length && !th.classList.contains('toggle')).map((th) => th.textContent) : null;
  }, sectionTitle);
  const collapsed = (page, titles) => page.evaluate((ts) => ts.map((t) => { const d = [...document.querySelectorAll('#view details.fold')].find((x) => x.querySelector('summary').textContent.startsWith(t)); return t + ':' + (d ? (d.open ? 'offen' : 'zu') : 'fehlt'); }), titles);
  await phone.goto(server.url + '#uebersicht');
  await phone.waitForSelector('#view .kpi-groups');
  check((await collapsed(phone, ['Auswahl im Vergleich zum Benchmark', 'Personen mit mehreren Profilen'])).join(',') === 'Auswahl im Vergleich zum Benchmark:zu,Personen mit mehreren Profilen:zu', 'Phone Übersicht: Benchmark-Tabelle und Mehrfachprofile eingeklappt');
  check(JSON.stringify(await visibleHeads(phone, 'Kennzahlen je Profil')) === JSON.stringify(['Profil', 'n (Vorgänge)', 'Schriftlich im 1. Versuch bestanden', 'Mündlich bestanden']), 'Phone Übersicht: Kennzahlen je Profil mit Prio-1-Spalten');
  await phone.goto(server.url + '#offene-vorgaenge');
  await phone.waitForSelector('#view h2');
  check((await collapsed(phone, ['Je Profil', 'Teilprüfungen je Profil'])).join(',') === 'Je Profil:zu,Teilprüfungen je Profil:zu', 'Phone Offene Vorgänge: Je-Profil-Tabellen eingeklappt');
  check(JSON.stringify(await visibleHeads(phone, 'Teilnehmende')) === JSON.stringify(['Name', 'Profil', 'Fehlende Teile', 'Nächster Termin']) && JSON.stringify(await visibleHeads(phone, 'Frühwarnung')) === JSON.stringify(['Stufe', 'Name', 'Teilprüfung', 'Nächster Termin']), 'Phone Offene Vorgänge: Teilnehmende und Frühwarnung mit Prio-1-Spalten');
  await phone.screenshot({ path: join(outDir, 'phone-offene-vorgaenge.png'), fullPage: true });
  await phone.goto(server.url + '#geplante-pruefungen');
  await phone.waitForSelector('#view h2');
  check(JSON.stringify(await visibleHeads(phone, 'Schriftliche Prüfungen')) === JSON.stringify(['Datum', 'Ort', 'Anzahl']) && (await phone.locator('#view details.fold').count()) >= 2, 'Phone Geplante Prüfungen: Ereignisse je Tag mit Datum, Ort, Anzahl; Teilnehmende zum Aufklappen');
  // Phone (C.4): Personen – Suche, Detail ohne Seitenscroll, Pfad vertikal, Raster eingeklappt, Zeitachse mit Prio-1-Spalten, URL ohne Suchtext, Speicher leer
  await phone.goto(server.url + '#personen');
  await phone.waitForSelector('#view .person-search');
  await phone.fill('#view .person-search', 'wechsel');
  await phone.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  await phone.locator('#view .person-results tr.expandable').first().click();
  await phone.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail');
  const phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const detailOverflow = await phone.evaluate(() => { const d = document.querySelector('#view tr.event-detail:not([hidden]) .person-detail'); return d.scrollWidth - window.innerWidth; });
  check(phoneOverflow <= 0 && detailOverflow <= 0, 'Phone Personen: Detail ohne Seitenscroll (Seite ' + phoneOverflow + ' px, Detail ' + detailOverflow + ' px)');
  check(await phone.evaluate(() => getComputedStyle(document.querySelector('#view .person-path')).flexDirection === 'column'), 'Phone Personen: Pfad vertikal');
  const openCard = (sel) => phone.evaluate((s) => {
    const card = document.querySelector('#view details.vorgang-card[open]');
    const n = card && [...card.querySelectorAll(s.q)].find((x) => (x.querySelector('h3, summary') || {}).textContent.startsWith(s.t));
    if (!n) return null;
    const table = n.querySelector('table');
    return { open: n.tagName === 'DETAILS' ? n.open : true, heads: table ? [...table.querySelectorAll('thead th')].filter((th) => th.getClientRects().length && !th.classList.contains('toggle')).map((th) => th.textContent) : [] };
  }, sel);
  const raster = await openCard({ q: 'details.fold', t: 'Prüfungsraster' });
  const zeitachse = await openCard({ q: 'section.block', t: 'Zeitachse' });
  check(!!raster && raster.open === false, 'Phone Personen: Raster in der offenen Karte eingeklappt');
  check(!!zeitachse && JSON.stringify(zeitachse.heads) === JSON.stringify(['Datum', 'Ereignis', 'Ergebnis']), 'Phone Personen: Zeitachse mit Prio-1-Spalten (' + JSON.stringify(zeitachse && zeitachse.heads) + ')');
  check(!/wechsel/i.test(phone.url()), 'Phone Personen: Suchtext steht nicht in der URL');
  const phoneStorage = await phone.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  check(phoneStorage.local.length === 0 && phoneStorage.session.every((k) => /msal|login\.|authority|client\.info/i.test(k)), 'Phone Personen: keine Daten im Browser-Speicher (' + JSON.stringify(phoneStorage) + ')');
  await phone.screenshot({ path: join(outDir, 'phone-personen-detail.png'), fullPage: true });
  // Phone (D.5): Experten – kein Seitenscroll, Prio-1-Spalten, Paarungen eingeklappt, Sortier-Buttons als Touch-Ziele, Detail einspaltig
  await phone.goto(server.url + '#experten');
  await phone.waitForSelector('#view .expert-table table');
  const expertOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(expertOverflow <= 0, 'Phone Experten: kein Seitenscroll (' + expertOverflow + ' px)');
  const expertHeads = (await visibleHeads(phone, 'Experten')).map((h) => h.replace(/ [▲▼]$/, '')); // Sortierpfeil abstreifen
  check(JSON.stringify(expertHeads) === JSON.stringify(['Experte', 'Einsätze', 'Durchfallquote 1. Versuch', 'Δ 1. Versuch']), 'Phone Experten: Haupttabelle mit Prio-1-Spalten (' + expertHeads.join(', ') + ')');
  check((await collapsed(phone, ['Paarungen Experte 1 × Experte 2'])).join(',') === 'Paarungen Experte 1 × Experte 2:zu', 'Phone Experten: Paarungen eingeklappt');
  const sortTarget = await phone.evaluate(() => document.querySelector('#view .expert-table th.sortable button').getBoundingClientRect().height);
  check(sortTarget >= 44, 'Phone Experten: Sortier-Buttons ≥ 44 px (' + Math.round(sortTarget) + ' px)');
  await phone.locator('#view .expert-table tr.expandable').first().click();
  await phone.waitForSelector('#view .expert-table tr.event-detail:not([hidden]) .expert-detail');
  const detailCols = await phone.evaluate(() => getComputedStyle(document.querySelector('#view .expert-table tr.event-detail:not([hidden]) .expert-detail')).gridTemplateColumns.split(' ').length);
  const expertDetailOverflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(detailCols === 1 && expertDetailOverflow <= 0, 'Phone Experten: Zeilen-Detail einspaltig ohne Seitenscroll (' + detailCols + ' Spalte(n), ' + expertDetailOverflow + ' px)');
  await phone.screenshot({ path: join(outDir, 'phone-experten-detail.png'), fullPage: true });
  await phone.close();

  // Tablet (B.4): 820 × 1180 – kein Seitenscroll, Prio 1 + 2 sichtbar, Prio 3 versteckt, Navigation mit Gruppen, Filter offen
  const tablet = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  await routeConfig(tablet, false);
  tablet.on('console', (m) => { if (m.type() === 'error') errors.push('tablet console: ' + m.text()); });
  tablet.on('pageerror', (e) => errors.push('tablet pageerror: ' + e.message));
  await tablet.goto(server.url, { waitUntil: 'networkidle' });
  await tablet.setInputFiles('#file-input', xlsx);
  await tablet.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  for (const v of views) {
    await tablet.goto(server.url + '#' + v);
    await tablet.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const overflow = await tablet.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const prio = await tablet.evaluate(() => ({
      p3: [...document.querySelectorAll('#view table.data td[data-prio="3"]')].every((td) => getComputedStyle(td).display === 'none'),
      p2: [...document.querySelectorAll('#view table.data td[data-prio="2"]')].every((td) => getComputedStyle(td).display !== 'none'),
    }));
    check(overflow <= 0 && prio.p3 && prio.p2, 'Tablet ' + v + ': kein Seitenscroll (' + overflow + ' px), Prio 1 + 2 sichtbar, Prio 3 versteckt');
    await tablet.screenshot({ path: join(outDir, 'tablet-' + v + '.png'), fullPage: true });
  }
  check(await tablet.evaluate(() => document.querySelector('#nav a').getClientRects().length > 0 && document.querySelector('#nav-select').getClientRects().length === 0 && document.querySelector('#filterbar details.filter-drawer').open && document.querySelector('#filterbar .filter-summary').getClientRects().length === 0), 'Tablet: Navigation mit Gruppen, Filter offen ohne Drawer-Kopfzeile');
  await tablet.close();

  // Desktop-Breiten (PROMPT-2 F.1, Option b): Navigation ab 1100 px in einer Zeile ohne horizontalen Scroll; Daten-Links als
  // Sekundärnavigation im Kopf, der Kopf bleibt ohne Überlauf; der aktive Link liegt je nach Ansicht in #nav oder #nav-secondary
  for (const [w, h] of [[1100, 900], [1280, 900], [1400, 1000]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(server.url + '#uebersicht');
    await page.waitForSelector('#view h2');
    const nav = await page.evaluate(() => {
      const n = document.getElementById('nav'); const head = document.querySelector('.app-header');
      const sec = [...document.querySelectorAll('#nav-secondary a')].filter((a) => a.getClientRects().length > 0);
      return { scroll: n.scrollWidth, client: n.clientWidth, headScroll: head.scrollWidth, headClient: head.clientWidth, sec: sec.length, active: document.querySelectorAll('#nav a[aria-current="page"]').length };
    });
    check(nav.scroll <= nav.client && nav.headScroll <= nav.headClient && nav.sec === 3 && nav.active === 1, 'Desktop ' + w + ' px: Navigation ohne Scroll (' + nav.scroll + ' von ' + nav.client + ' px), drei Daten-Links im Kopf ohne Überlauf, Übersicht aktiv');
    await page.screenshot({ path: join(outDir, 'desktop-' + w + '-uebersicht.png') });
  }
  await page.goto(server.url + '#glossar');
  await page.waitForSelector('#view h2');
  check((await page.locator('#nav-secondary a[aria-current="page"]').count()) === 1 && (await page.locator('#nav a[aria-current="page"], #nav a.active').count()) === 0 && (await page.locator('#nav-select').inputValue()) === 'glossar', 'Desktop: Glossar aktiv in der Sekundärnavigation, kein aktiver Link in #nav, Auswahlfeld zeigt Glossar');
  await page.setViewportSize({ width: 1400, height: 1000 });

  // Tabellenbreite (PROMPT-2 F.2, Option 1): ab 1280 px keine Tabelle mit horizontalem Überlauf in Übersicht, Schriftlich, Mündlich,
  // Experten; Prio 3 ab 1200 px sichtbar, die breite Experten-Tabelle (.wide) zeigt Prio 3 erst ab 1900 px, Full HD (17 Spalten mit Streuung, Paket G; 1400, 1600 und 1800 px reichten in der CI nicht); darunter Schalter «Alle Spalten»
  const tableViews = ['uebersicht', 'schriftlich', 'muendlich', 'experten'];
  const tableState = () => page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#view .table-wrap')];
    const over = wraps.filter((x) => x.scrollWidth > x.clientWidth).map((x) => ((x.querySelector('caption') || {}).textContent || '?').trim().slice(0, 45) + ' +' + (x.scrollWidth - x.clientWidth) + ' px');
    const p3 = (sel) => [...document.querySelectorAll(sel)];
    const shown = (els) => els.every((td) => getComputedStyle(td).display !== 'none');
    const hidden = (els) => els.every((td) => getComputedStyle(td).display === 'none');
    const toggles = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.getClientRects().length > 0).length;
    const normal = p3('#view .table-wrap:not(.wide) table.data td[data-prio="3"]');
    const wide = p3('#view .table-wrap.wide > table > tbody > tr > td[data-prio="3"]');
    return { n: wraps.length, over, wide: document.querySelectorAll('#view .table-wrap.wide').length, p3: normal.length, p3Shown: shown(normal), p3Hidden: hidden(normal),
      wideP3: wide.length, wideShown: shown(wide), wideHidden: hidden(wide), toggles: toggles('#view .table-wrap:not(.wide) > .all-columns'), wideToggles: toggles('#view .table-wrap.wide > .all-columns') };
  });
  for (const [w, h] of [[1280, 900], [1400, 1000], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const v of tableViews) {
      await page.goto(server.url + '#' + v);
      await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
      const t = await tableState();
      // Breite Tabellen (wide: Experten, ab Paket G auch Ø-Tabellen mit Streuung) zeigen Prio 3 erst ab 1900 px, darunter Schalter je Tabelle
      const expectedWide = { uebersicht: 0, schriftlich: 4, muendlich: 4, experten: 1 }[v];
      const wideOk = t.wide === expectedWide && (t.wide === 0 || (t.wideP3 > 0 && (w >= 1900 ? t.wideShown && t.wideToggles === 0 : t.wideHidden && t.wideToggles === t.wide)));
      check(t.n > 0 && t.over.length === 0 && t.p3 > 0 && t.p3Shown && t.toggles === 0 && wideOk, 'Desktop ' + w + ' px ' + v + ': ' + t.n + ' Tabellen ohne Überlauf, Prio-3-Spalten sichtbar' + (expectedWide ? ', ' + t.wide + ' breite Tabelle(n) ' + (w >= 1900 ? 'vollständig' : 'ohne Prio 3 mit Schalter «Alle Spalten»') : '') + (t.over.length ? ' – Überlauf: ' + t.over.join(' | ') : ''));
      if (w === 1280) await page.screenshot({ path: join(outDir, 'desktop-1280-' + v + '.png') });
    }
  }
  // Streuungsspalten (G.3): bei 1920 px sichtbar, Lagewerte in % ohne Datenbalken (bar: false), Ø behält den Balken
  await page.goto(server.url + '#schriftlich');
  await page.waitForFunction(() => location.hash.replace(/^#/, '').split('?')[0] === 'schriftlich' && !!document.querySelector('#view h2'), null, { timeout: 5000 });
  const lage = await page.evaluate(() => {
    let cells = 0, bars = 0, sigma = 0, meanBars = 0;
    const sigmaTh = [...document.querySelectorAll('#view thead th')].find((x) => x.textContent.trim() === 'σ (1. Versuch)');
    for (const table of document.querySelectorAll('#view table.data')) {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      const idx = heads.map((h, i) => (/^(Median|P25|P75) \(/.test(h) ? i : -1)).filter((i) => i >= 0);
      const meanIdx = heads.map((h, i) => (/^Ø Resultat/.test(h) ? i : -1)).filter((i) => i >= 0);
      for (const tr of table.querySelectorAll('tbody tr')) {
        const tds = tr.querySelectorAll('td');
        for (const i of idx) if (tds[i]) { cells++; if (tds[i].classList.contains('pct')) bars++; }
        for (const i of meanIdx) if (tds[i] && tds[i].classList.contains('pct')) meanBars++;
        for (const td of tds) if (/^\d+\.\d pp$/.test(td.textContent.trim())) sigma++;
      }
    }
    return { visible: !!sigmaTh && sigmaTh.getClientRects().length > 0, cells, bars, sigma, meanBars };
  });
  check(lage.visible && lage.cells > 0 && lage.bars === 0 && lage.sigma > 0 && lage.meanBars > 0, 'Desktop 1920 px Schriftlich: σ-Spalten sichtbar (' + lage.sigma + ' σ-Zellen), Median/P25/P75 ohne Datenbalken (' + lage.cells + ' Zellen), Balken auf Ø (' + lage.meanBars + ')');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(server.url + '#schriftlich');
  await page.waitForFunction(() => location.hash.replace(/^#/, '').split('?')[0] === 'schriftlich' && !!document.querySelector('#view h2'), null, { timeout: 5000 });
  const t1100 = await tableState();
  check(t1100.p3 > 0 && t1100.p3Hidden && t1100.wideHidden && t1100.toggles + t1100.wideToggles === t1100.n && t1100.over.length === 0, 'Desktop 1100 px Schriftlich: Prio-3-Spalten ausgeblendet, Schalter «Alle Spalten» je Tabelle (' + (t1100.toggles + t1100.wideToggles) + ' von ' + t1100.n + '), kein Überlauf');
  await page.screenshot({ path: join(outDir, 'desktop-1100-schriftlich.png') });
  await page.setViewportSize({ width: 1400, height: 1000 });

  // Filterleiste (PROMPT-2 F.3, F5): bei 1280 px eine Zeile Steuerelemente plus Zusammenfassung (≤ 110 px hoch), Reihenfolge
  // Jahr · Von · Bis · Profil · Sprache · Bank · VSS/VSM · Versuche · Zertifikate, Bank-Auswahl höchstens 12rem mit vollem Namen als title
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const fb = await page.evaluate(() => {
    const bar = document.getElementById('filterbar');
    const labels = [...bar.querySelectorAll('.filter-controls > label')].map((l) => l.firstChild.textContent.trim() || l.textContent.trim());
    const bank = bar.querySelector('label:has(select.bank) select');
    const controls = [...bar.querySelectorAll('.filter-controls > label')];
    const bottoms = controls.map((l) => l.getBoundingClientRect().bottom); // align-items: flex-end → Unterkanten liegen in einer Zeile gleich
    return { height: Math.round(bar.getBoundingClientRect().height), labels, rows: Math.max(...bottoms) - Math.min(...bottoms) < 15 ? 1 : 2, bankMax: bank ? getComputedStyle(bank).maxWidth : null, bankTitle: bank ? bank.title : null };
  });
  check(fb.height <= 110 && fb.rows === 1 && fb.labels.join(',') === 'Jahr,Von,Bis,Profil,Sprache,Bank,VSS/VSM,Versuche,Nur ausgestellte Zertifikate' && fb.bankMax === '192px', 'Desktop 1280 px: Filterleiste ' + fb.height + ' px hoch, Steuerelemente in einer Zeile (' + fb.labels.join(' · ') + '), Bank höchstens 12rem');
  await page.selectOption('#filterbar select.bank', 'Testbank AG');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check((await page.getAttribute('#filterbar select.bank', 'title')) === 'Testbank AG' && (await page.evaluate(() => Math.round(document.getElementById('filterbar').getBoundingClientRect().height))) <= 110, 'Desktop 1280 px: Bank gewählt → voller Name als title, Filterleiste mit Chip weiterhin ≤ 110 px');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  await page.screenshot({ path: join(outDir, 'desktop-1280-filterleiste.png'), fullPage: false });
  // KPI-Labels (F6): keine dauerhafte Unterstreichung, nur bei Hover/Fokus
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi-label a');
  const kpiLink = await page.evaluate(() => { const a = document.querySelector('#view .kpi-label a'); const s = getComputedStyle(a); return { border: s.borderBottomStyle, deco: s.textDecorationLine }; });
  await page.locator('#view .kpi-label a').first().hover();
  const kpiHover = await page.evaluate(() => getComputedStyle(document.querySelector('#view .kpi-label a')).textDecorationLine);
  check(kpiLink.border === 'none' && kpiLink.deco === 'none' && kpiHover === 'underline', 'KPI-Labels ohne Dauerunterstreichung (Rand ' + kpiLink.border + ', Dekoration ' + kpiLink.deco + '), unterstrichen bei Hover (' + kpiHover + ')');

  // Hotfix Anmeldung (07.09.2026): die MSAL-Antwort im Hash (#code=…&state=…) darf die App nicht überschreiben.
  // Popup (window.opener gesetzt): Hash bleibt, nichts wird gerendert. Ohne Opener: auth.init() konsumiert bzw. verwirft die
  // Antwort, danach normale Ansicht, kein Fehlerpanel, Hash ohne code/state.
  const popupPage = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await routeConfig(popupPage, false);
  popupPage.on('pageerror', (e) => errors.push('popup pageerror: ' + e.message));
  await popupPage.addInitScript(() => { window.opener = { closed: false }; });
  await popupPage.goto(server.url + '#code=x&state=y', { waitUntil: 'networkidle' });
  await popupPage.waitForTimeout(500);
  const popupState = await popupPage.evaluate(() => ({ hash: location.hash, view: document.getElementById('view').children.length, nav: document.querySelectorAll('#nav a').length }));
  check(popupState.hash === '#code=x&state=y' && popupState.view === 0 && popupState.nav === 0, 'Anmeldung: Popup mit MSAL-Antwort im Hash → Hash unverändert, keine Renderung (' + JSON.stringify(popupState) + ')');
  await popupPage.close();
  const redirectPage = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await routeConfig(redirectPage, false);
  redirectPage.on('pageerror', (e) => errors.push('redirect pageerror: ' + e.message));
  redirectPage.on('console', (m) => { if (m.type() === 'error') errors.push('redirect console: ' + m.text()); });
  await redirectPage.goto(server.url + '#code=x&state=y', { waitUntil: 'networkidle' });
  await redirectPage.waitForSelector('#view .empty-card, #view h2', { timeout: 10000 });
  const redirectState = await redirectPage.evaluate(() => ({ hash: location.hash, error: !document.getElementById('error').hidden, nav: document.querySelectorAll('#nav a').length }));
  check(!/code=|state=/.test(redirectState.hash) && !redirectState.error && redirectState.nav >= 8, 'Anmeldung: Seite mit MSAL-Antwort ohne Opener → Hash bereinigt, kein Fehlerpanel, App gerendert (' + JSON.stringify(redirectState) + ')');
  await redirectPage.close();

  // Keine Persistenz von Daten im Browser (Regel 4): localStorage leer, sessionStorage höchstens MSAL
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  check(storage.local.length === 0 && storage.session.every((k) => /msal|login\.|authority|client\.info/i.test(k)), 'Keine Daten im Browser-Speicher: ' + JSON.stringify(storage));
} catch (e) {
  failures.push('Abbruch: ' + ((e && e.stack) || e));
  await shot(page, 'abbruch').catch(() => {});
} finally {
  await browser.close();
  await server.close();
}

for (const e of errors) failures.push('Browser: ' + e);
console.log('');
if (failures.length) {
  console.log('Smoke-Test rot: ' + failures.length + ' Problem(e)');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('Smoke-Test grün: alle Ansichten gerendert, Interaktionen geprüft, keine Konsolen-, Seiten- oder Netzwerkfehler. Screenshots: ' + outDir);
