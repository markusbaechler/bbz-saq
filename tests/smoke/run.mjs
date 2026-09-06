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
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (r.url().startsWith(server.url)) errors.push('request failed: ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
page.on('response', (r) => { if (r.url().startsWith(server.url) && r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

const summaryText = () => page.textContent('#filterbar .summary');

try {
  // Laden
  await page.goto(server.url, { waitUntil: 'networkidle' });
  check((await page.locator('#nav a').count()) >= 8, 'Navigation gerendert');
  check((await page.locator('#nav .nav-group').count()) >= 3 && (await page.locator('#nav .nav-group[aria-label="Kennzahlen"] a').count()) === 6, 'Navigation in Gruppen (Kennzahlen · Personen · Daten)');
  await page.setInputFiles('#file-input', xlsx);
  await page.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const status = (await page.textContent('#status')).replace(/\s+/g, ' ').trim();
  check(/Data-Quality-Log/.test(status) && /Duplikate/.test(status), 'Datei geladen: ' + status.slice(0, 170));
  // Datenstand (A.2): sichtbarer Einzeiler mit aufklappbaren Zählern; der Volltext in #status bleibt (nur für Screenreader)
  const datastand = (await page.textContent('#datastand summary')).replace(/\s+/g, ' ').trim();
  check(datastand.startsWith('Datenstand: synth.xlsx') && /DQ \d+ Fehler$/.test(datastand) && (await page.locator('#datastand dt').count()) >= 6 && (await page.locator('#status.visually-hidden').count()) === 1, 'Datenstand: «' + datastand.slice(0, 90) + '» mit Details, Volltext nur für Screenreader');

  // Jede Ansicht rendert Titel und mindestens eine Tabelle, ohne Fehler
  const views = await page.$$eval('#nav a', (as) => as.map((a) => a.getAttribute('href').replace(/^#/, '')));
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
  const allRows = await page.locator('#view table.dq-table tbody tr').count();
  await page.fill('#view .dq-text', 'Score');
  await page.waitForTimeout(500);
  const filtered = await page.locator('#view table.dq-table tbody tr').count();
  const counter = (await page.textContent('#view .dq-count')).trim();
  check(filtered > 0 && filtered < allRows && counter.startsWith(filtered + ' von ' + allRows), 'DQ-Suche «Score» filtert (' + filtered + ' von ' + allRows + ' Einträgen; Zähler: «' + counter.slice(0, 40) + '…»)');
  check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('dq-text')), 'DQ-Suche behält den Fokus');

  // Historie (b7): Snapshot herunterladen (ohne Namen), wieder laden, Vergleich mit «Heute»
  await page.goto(server.url + '#historie');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view p.empty').count()) >= 1 && (await page.locator('#view table').count()) === 0, 'Historie ohne Snapshot: Hinweis, keine Vergleichstabellen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#view button:has-text("Snapshot herunterladen")').click()]);
  const snapshotPath = join(outDir, download.suggestedFilename());
  await download.saveAs(snapshotPath);
  const snapshotText = readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(snapshotText);
  check(/^cockpit-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()) && snapshot.format === 'bbz-cockpit-snapshot' && snapshot.kennzahlen.vorgaenge.value === 8, 'Snapshot heruntergeladen: ' + download.suggestedFilename() + ', ' + snapshot.kennzahlen.vorgaenge.value + ' Vorgänge');
  const names = ['Muster', 'Anna', 'Beispiel', 'Ben', 'Olga', 'Paul', 'Petra', 'Tom', 'Nora', 'Bea', 'Zoe', 'Testbank', 'Musterbank'];
  check(names.every((n) => !snapshotText.includes(n)), 'Snapshot enthält keine Namen und keine Banken');
  await page.setInputFiles('#view input[type="file"]', snapshotPath);
  await page.waitForSelector('#view table.data');
  const historyHeads = await page.$$eval('#view table.data caption', (c) => c.map((x) => x.textContent));
  check(historyHeads.length === 6 && /Kennzahlen je Stichtag/.test(historyHeads[0]), 'Snapshot geladen, Vergleich mit ' + historyHeads.length + ' Tabellen');
  const vorgRow = await page.$$eval('#view table.data tbody tr', (trs) => { const tr = trs.find((r) => r.children[0].textContent === 'Vorgänge'); return tr ? Array.from(tr.children).map((td) => td.textContent) : null; });
  check(!!vorgRow && vorgRow[1] === '8' && vorgRow[2] === '8' && vorgRow[3] === '±0', 'Vergleich: Vorgänge Snapshot = Heute = 8, Differenz ±0 (' + (vorgRow || []).join(' | ') + ')');
  check((await page.locator('#view .snapshot-list li').count()) === 1, 'Geladener Snapshot in der Liste');
  await shot(page, 'historie');
  await page.locator('#view .snapshot-list button:has-text("Entfernen")').click();
  await page.waitForSelector('#view p.empty');
  check((await page.locator('#view table.data').count()) === 0, 'Snapshot entfernt, Vergleich wieder leer');

  // Dark Mode: Zeitverlauf mit Diagramm
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(server.url + '#zeitverlauf');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view svg').count()) >= 1, 'Dark Mode: Zeitverlauf mit Diagramm gerendert');
  await shot(page, 'dark-zeitverlauf');
  await page.emulateMedia({ colorScheme: 'light' });

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
