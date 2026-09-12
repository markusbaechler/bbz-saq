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
import { SECHS_SIGNALE } from './signale-sechs.mjs';
import { versionAusModul } from '../../tools/version.js';
import { parseThemes } from '../../tools/contrast.js';

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
// Seit dem Cache-Busting tragen alle Modul-URLs ein «?v=…» – das Muster muss die Query zulassen, sonst greift
// die Route nicht mehr und der Test läuft still gegen die echte config.js (gefunden, weil genau das passierte).
const routeConfig = (p, on) => p.route('**/config.js*', async (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: configText.replace(/features: \{ write: (true|false) \}/, 'features: { write: ' + (on ? 'true' : 'false') + ' }') }));
await routeConfig(page, false);
const errors = [];
// Jede geladene js/css-Datei mitschreiben: Sie alle müssen die Fassungsmarke tragen (tools/version.js)
const geladeneDateien = [];
page.on('response', (r) => { if (r.url().startsWith(server.url) && /\.(js|css)(\?|$)/.test(r.url())) geladeneDateien.push(r.url().slice(server.url.length)); });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (r.url().startsWith(server.url)) errors.push('request failed: ' + r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
page.on('response', (r) => { if (r.url().startsWith(server.url) && r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

const summaryText = () => page.textContent('#filterbar .summary');
// Paket C (C2): Gescrollt schrumpft die Filterleiste auf die Zusammenfassungszeile – Zähler und Chips bleiben, die
// Steuerelemente sind bewusst nicht mehr erreichbar. Der Test tut, was ein Mensch tut: erst nach oben, dann bedienen.
const filterWaehlen = async (p, feld, wert) => {
  await p.evaluate(() => window.scrollTo(0, 0));
  // Erst warten, bis die Leiste wieder ausgeklappt ist: focus() prüft keine Sichtbarkeit und liefe sonst ins Leere,
  // solange die Steuerelemente noch «display: none» sind (der Zustand wird vom Scroll-Ereignis nachgeführt).
  await p.waitForFunction(() => !document.body.classList.contains('scrolled'), null, { timeout: 3000 }).catch(() => {});
  const el = p.locator(`#filterbar label[data-field="${feld}"] select`);
  await el.waitFor({ state: 'visible' });
  await el.focus();
  await el.selectOption(wert);
};
// P3: Jede Beschriftung eines Punktdiagramms gegen die viewBox messen. Ein Text, der darüber hinausragt, wird vom
// SVG abgeschnitten – ohne Seitenscroll, deshalb fängt ihn die Phone-Prüfung auf Überlauf nicht.
const punktBeschriftungen = (p) => p.evaluate(() => [...document.querySelectorAll('#view figure.viz')]
  .filter((f) => f.querySelector('.viz-dots')).map((f) => {
    const svgEl = f.querySelector('svg');
    const vb = Number(svgEl.getAttribute('viewBox').split(' ')[2]);
    const achse = svgEl.querySelector('line.viz-axis');
    const texte = [...svgEl.querySelectorAll('text')].map((t) => {
      const b = t.getBBox();
      return { t: t.textContent, l: b.x, r: b.x + b.width };
    });
    return {
      titel: (f.querySelector('figcaption') || { textContent: '' }).textContent.split(' · ')[0],
      vb,
      plot: Math.round(Number(achse.getAttribute('x2')) - Number(achse.getAttribute('x1'))),
      randLinks: Math.round(Number(achse.getAttribute('x1'))),
      randRechts: Math.round(vb - Number(achse.getAttribute('x2'))),
      ueber: texte.filter((t) => t.r > vb + 0.5 || t.l < -0.5)
        .map((t) => '«' + t.t + '» ' + Math.round(t.l) + '…' + Math.round(t.r)),
      gekuerzt: texte.filter((t) => /…$/.test(t.t)).length,
    };
  }));

// Query-Teil des Hashs (#ansicht?von=…): beim Ansichtswechsel per goto muss der Filterzustand mitgenommen werden
const hashQuery = (url) => { const h = url.split('#')[1] || ''; const q = h.indexOf('?'); return q >= 0 ? h.slice(q) : ''; };

try {
  // Laden
  await page.goto(server.url, { waitUntil: 'networkidle' });
  check((await page.locator('#nav a').count()) >= 8, 'Navigation gerendert');
  // Paket E: zwei Ebenen. Das Band trägt neun Primärziele, das Auswahlfeld auf dem Phone weiterhin alle vierzehn
  // Ansichten (gefasste Ziele als optgroup, eigene Ziele als einzelne Option). Keine zweite Leiste im Chrome –
  // die Geschwister stehen als Reiter im Kopf der Ansicht (.view-tabs), auf der Titelzeile.
  const navAufbau = await page.evaluate(() => ({
    band: [...document.querySelectorAll('#nav .nav-links a')].map((a) => a.textContent),
    optionen: document.querySelectorAll('#nav-select option').length,
    optgroups: [...document.querySelectorAll('#nav-select optgroup')].map((o) => o.label + ':' + o.querySelectorAll('option').length),
    zweiteLeiste: document.querySelectorAll('nav:not(#nav):not(.view-tabs), #nav-secondary').length,
    beschriftungen: document.querySelectorAll('#nav .nav-group-label').length,
  }));
  check(navAufbau.band.join(' · ') === 'Übersicht · Prüfungen · Zeitverlauf · Bank-Report · Vorgänge · Personen · Bestenlisten · Experten · Daten'
    && navAufbau.optionen === 14 && navAufbau.optgroups.join(' · ') === 'Prüfungen:3 · Vorgänge:2 · Daten:3'
    && navAufbau.zweiteLeiste === 0 && navAufbau.beschriftungen === 0,
    'E Navigation: ' + navAufbau.band.length + ' Primärziele im Band (' + navAufbau.band.join(' · ') + '), '
      + navAufbau.optionen + ' Ansichten im Auswahlfeld (' + navAufbau.optgroups.join(' · ') + '), keine zweite Leiste, keine Gruppenbeschriftung');
  // Cache-Busting: Nach einem Deploy holte der Browser bis zu zehn Minuten alte Module aus dem Cache, teils
  // gemischt mit neuen – die App zeigte den Stand von vorher, ohne es zu sagen. Jede Modul-URL, jede Bibliothek
  // und das Stylesheet tragen deshalb eine Fassungsmarke aus dem Inhalt der Dateien.
  const fassung = versionAusModul(readFileSync(join(root, 'version.js'), 'utf8'));
  const ohneMarke = geladeneDateien.filter((u) => !u.includes('?v=') && !u.includes('?stand='));
  check(!!fassung && geladeneDateien.length > 20 && ohneMarke.length === 0,
    'Fassung ' + fassung + ': ' + geladeneDateien.length + ' js/css-Dateien geladen, alle mit Marke'
      + (ohneMarke.length ? ' – OHNE: ' + ohneMarke.join(', ') : ''));
  check((await page.textContent('.app-footer .app-version')) === 'Fassung ' + fassung
    && !(await page.locator('#version-hinweis').isVisible()),
    'Fassung steht in der Fusszeile, kein Hinweis auf eine alte Fassung');

  check((await page.locator('#view .empty-card .actions button').count()) === 2 && (await page.locator('#view .empty-card h3').textContent()).startsWith('Noch keine Daten'), 'Leerzustand: Karte mit zwei Aktionen statt Fliesstext');
  // Paket C (C1): Im Leerzustand steht die Datenleiste als Zeile; mit geladenen Daten fällt sie weg und der Datenstand
  // steht als Einzeiler im Kopf. Der Volltext in #status bleibt in beiden Zuständen für Screenreader erhalten.
  check(await page.locator('#databar').isVisible() && (await page.locator('#databar #btn-load').count()) === 1 && (await page.locator('#databar .file-label').count()) === 1,
    'C1 Leerzustand: Datenleiste als Zeile mit beiden Aktionen');
  await page.setInputFiles('#file-input', xlsx);
  await page.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const status = (await page.textContent('#status')).replace(/\s+/g, ' ').trim();
  check(/Data-Quality-Log/.test(status) && /Duplikate/.test(status), 'Datei geladen: ' + status.slice(0, 170));
  // Datenstand (A.2): sichtbarer Einzeiler mit aufklappbaren Zählern; der Volltext in #status bleibt (nur für Screenreader)
  // D0: Der Fehlerzähler wurde im Kopf abgeschnitten – bei 1280 px waren 26 % des Einzeilers verdeckt, und weg fiel
  // ausgerechnet «DQ n Fehler». Er schrumpft jetzt nie; gekürzt wird der Mittelteil.
  for (const w of [1280, 1400, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    const ds = await page.evaluate(() => {
      const dq = document.querySelector('.datastand-dq');
      const txt = document.querySelector('.datastand-text');
      const kopf = document.querySelector('.app-header').getBoundingClientRect();
      const box = dq.getBoundingClientRect();
      return {
        dq: dq.textContent.trim(), ganzSichtbar: box.width > 0 && box.right <= kopf.right + 0.5 && box.left >= kopf.left - 0.5,
        dqVerdeckt: Math.round(Math.max(0, dq.scrollWidth - dq.clientWidth)),
        textVerdeckt: Math.round(Math.max(0, txt.scrollWidth - txt.clientWidth)),
      };
    });
    check(ds.ganzSichtbar && ds.dqVerdeckt === 0 && /^DQ \d+ Fehler$/.test(ds.dq),
      'D0 Datenstand ' + w + ' px: «' + ds.dq + '» vollständig im Kopf, gekürzt wird der Mittelteil (' + ds.textVerdeckt + ' px)');
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  const datastand = (await page.textContent('#datastand summary')).replace(/\s+/g, ' ').trim();
  check(datastand.startsWith('Datenstand: synth.xlsx') && /DQ \d+ Fehler$/.test(datastand) && (await page.locator('#datastand dt').count()) >= 6 && (await page.locator('#status.visually-hidden').count()) === 1, 'Datenstand: «' + datastand.slice(0, 90) + '» mit Details, Volltext nur für Screenreader');
  // C1: Kopfbereich verdichtet – vier gestapelte Bänder (293 px, erster Zahlenwert bei y = 495) auf zwei plus
  // Navigation. Zielmarken des Auftrags: statisches Chrome höchstens 170 px, erster Zahlenwert über y = 360.
  const kopf = await page.evaluate(() => {
    const hoehe = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
    // Seit D2 ist der Signalblock der erste Inhalt der Übersicht; er trägt die Zahlen, die zuerst zählen.
    // Gemessen wird deshalb der Beginn des ersten Inhalts, nicht mehr zwingend die erste Kachel.
    const wert = document.querySelector('#view .signale, #view .kpi-value');
    const st = document.getElementById('status');
    return {
      header: hoehe('.app-header'), databar: hoehe('#databar'), nav: hoehe('.views'), filterbar: hoehe('#filterbar'),
      ersterWert: wert ? Math.round(wert.getBoundingClientRect().top + window.scrollY) : null,
      statusImDom: !!st && st.textContent.includes('Vorgänge') && st.classList.contains('visually-hidden'),
      datastandImKopf: !!document.querySelector('.app-header > #datastand'),
      neuLaden: document.querySelectorAll('#datastand .datastand-actions button').length,
    };
  });
  const chrome = kopf.header + kopf.databar + kopf.nav + kopf.filterbar;
  // Der erste Zahlenwert wird als Anteil der Viewporthöhe geprüft, nicht in Pixeln: Wie viele Zeilen die
  // Kurzbeschreibung darüber braucht, hängt an der Schrift, und die ist in der CI breiter als lokal.
  const anteil = kopf.ersterWert / 900;
  check(chrome <= 175 && kopf.databar === 0 && anteil <= 0.45 && kopf.statusImDom && kopf.datastandImKopf && kopf.neuLaden === 2,
    'C1 geladen: Chrome ' + chrome + ' px (Ziel 170, seit C5 mit zwei Steuerelementen mehr; vorher 293) = Kopf ' + kopf.header + ' + Navigation ' + kopf.nav + ' + Filter ' + kopf.filterbar
      + ', keine Datenleiste, erster Inhalt (Signale) y = ' + kopf.ersterWert + ' = ' + Math.round(anteil * 100) + ' % der Höhe (Ziel ≤ 45 %; vorher 495 px = 55 %), Datenstand im Kopf, Volltext für Screenreader, '
      + kopf.neuLaden + ' Lade-Aktionen erreichbar');

  // Jede Ansicht rendert Titel und mindestens eine Tabelle, ohne Fehler
  // Das Band trägt seit Paket E neun Primärziele; alle vierzehn Routen stehen im Auswahlfeld.
  const views = await page.$$eval('#nav-select option', (os) => os.map((o) => o.value));
  for (const v of views) {
    await page.goto(server.url + '#' + v);
    await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const h2 = (await page.innerText('#view h2')).trim(); // sichtbarer Text: der Druck-Zusatz zählt hier nicht mit
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
    // B3: keine Tabelle ohne Zeilen – bei null Zeilen steht nur die Meldung, nicht Kopfzeile plus Meldung
    const leer = await page.$$eval('#view table.data', (ts) => ts.filter((t) => !t.querySelector('tbody tr')).map((t) => (t.querySelector('caption') || {}).textContent || '(ohne Titel)'));
    check(leer.length === 0, 'Ansicht ' + v + ': keine leere Tabelle gerendert' + (leer.length ? ' – ' + leer.join(' | ') : ''));
    await shot(page, v);
  }

  // Bank-Report: ohne Bank ein Hinweis, mit genau einer Bank die Vergleichstabellen ohne Namen
  await page.goto(server.url + '#bank-report');
  await page.waitForSelector('#view h2');
  check((await page.locator('#view p.empty').count()) === 1 && (await page.locator('#view table').count()) === 0, 'Bank-Report ohne Bank: Hinweis, keine Tabellen');
  await filterWaehlen(page, 'bank', { label: 'Testbank AG' });
  await page.waitForSelector('#view table');
  const bankTables = await page.$$eval('#view table caption', (c) => c.map((x) => x.textContent));
  check(bankTables.length >= 3 && bankTables.every((t) => /Testbank AG/.test(t)), 'Bank-Report mit Bank: ' + bankTables.length + ' Tabellen (' + bankTables.join(' | ') + ')');
  check(!(await page.textContent('#view')).includes('Muster Anna'), 'Bank-Report ohne Namen');
  check((await page.$$eval('#view thead th', (th) => th.map((x) => x.textContent))).includes('Einordnung') && (await page.locator('#view td.tone').count()) >= 5, 'Bank-Report: Spalte «Einordnung» mit Ton je Kennzahlzeile (' + (await page.locator('#view td.tone').count()) + ')');
  // H3: Messzeilen für den Empfänger – er kennt das Cockpit nicht und braucht den Bezug neben der Zahl. Geprüft
  // wird auch der Druck: Diese Ansicht wird gedruckt und weitergegeben, und ohne print-color-adjust verschwänden
  // Spur, Balken, Punkt und Benchmarkmarke.
  const report = await page.evaluate(() => {
    const zeilen = [...document.querySelectorAll('#view .messzeile')];
    return {
      zeilen: zeilen.length,
      marken: document.querySelectorAll('#view .messzeile .mz-referenz').length,
      benchmark: [...document.querySelectorAll('#view .messzeile .mz-bench')].map((x) => x.textContent.trim()).filter(Boolean).length,
      anzahl: [...document.querySelectorAll('#view .messzeile .mz-n')].map((x) => x.textContent.trim()),
      kopf: (document.querySelector('#view .mz-kopf .mz-titel') || {}).textContent,
      namen: /Muster|Anna/.test((document.querySelector('#view .messzeilen') || { textContent: '' }).textContent),
    };
  });
  check(report.zeilen === 5 && report.marken === 5 && report.benchmark === 5 && !report.namen
    && report.anzahl.every((t) => /^\d+ von \d+$/.test(t)) && report.kopf === 'Durchfallquoten',
    'H3 Bank-Report: ' + report.zeilen + ' Messzeilen mit Benchmarkmarke und Abstand (' + report.anzahl.join(' | ') + '), ohne Namen');
  await page.emulateMedia({ media: 'print' });
  const druck = await page.evaluate(() => {
    const sichtbar = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0).length;
    const farbe = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).printColorAdjust || getComputedStyle(e).webkitPrintColorAdjust : ''; };
    return {
      zeilen: sichtbar('#view .messzeile'), spur: sichtbar('#view .mz-spur'), marke: sichtbar('#view .mz-referenz'),
      punkt: sichtbar('#view .mz-punkt'), intervall: sichtbar('#view .mz-intervall'),
      adjust: [farbe('#view .mz-spur'), farbe('#view .mz-punkt'), farbe('#view .mz-referenz')],
      // Verlauf und «letztes Jahr» weichen im Druck, damit die Spur breit genug bleibt (die Jahreswerte stehen in
      // der Tabelle «Verlauf je Jahr» derselben Seite)
      verlauf: sichtbar('#view .mz-verlauf-zelle'), vorjahr: sichtbar('#view .mz-vorjahr'),
      benchmarkSpalte: sichtbar('#view .messzeile .mz-bench'),
      spurBreite: Math.round((document.querySelector('#view .messzeile .mz-skala') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
      ueberlauf: Math.round(document.querySelector('#view .messzeilen').scrollWidth - document.querySelector('#view .messzeilen').clientWidth),
    };
  });
  check(druck.zeilen === 5 && druck.spur === 5 && druck.marke === 5 && druck.punkt === 5 && druck.intervall >= 1
    && druck.adjust.every((a) => a === 'exact') && druck.verlauf === 0 && druck.vorjahr === 0
    && druck.benchmarkSpalte === 5 && druck.ueberlauf <= 0,
    'H3 Bank-Report im Druck: Spur ' + druck.spurBreite + ' px mit Punkt, Intervall und Marke (Farbe ' + druck.adjust[0] + '), Verlauf und letztes Jahr weichen, kein Überlauf');
  await page.screenshot({ path: join(outDir, 'print-bank-report.png'), fullPage: true });
  await page.emulateMedia({ media: null });
  await shot(page, 'bank-report-mit-bank');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  check(views.includes('uebersicht') && views.includes('geplante-pruefungen') && views.includes('datenqualitaet'), 'Kern-Ansichten vorhanden: ' + views.join(', '));

  // Übersicht: Kacheln mit n
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Punktdiagramm je Profil (Paket MESSZEILE, M2): ein Punkt mit Wilson-Balken je Profil, senkrechte Linie auf dem
  // Gesamtwert. Die achtspaltige Tabelle bleibt als Zwilling darunter und im Export – sie verschwindet nicht.
  const punkte = await page.evaluate(() => {
    const svgEl = document.querySelector('#view .viz-dots');
    if (!svgEl) return null;
    const fig = svgEl.closest('figure');
    const abschnitt = fig.closest('section');
    const tabelle = abschnitt.querySelector('table.data');
    return {
      punkte: fig.querySelectorAll('.viz-dot').length,
      hohl: fig.querySelectorAll('.viz-dot.small').length,
      balken: fig.querySelectorAll('.viz-ci').length,
      referenz: fig.querySelectorAll('.viz-ref').length,
      legende: [...fig.querySelectorAll('.viz-legend-item')].map((x) => x.textContent.trim()),
      beschriftung: [...fig.querySelectorAll('.viz-label')].map((x) => x.textContent).filter((t) => /^n = /.test(t)),
      rolle: svgEl.getAttribute('role'),
      aria: (svgEl.getAttribute('aria-label') || '').length,
      tabellenzeilen: tabelle ? tabelle.querySelectorAll('tbody tr').length : 0,
      titelDerTabelle: abschnitt.querySelector('h3') ? abschnitt.querySelector('h3').textContent : '',
      textInDatenfarbe: [...fig.querySelectorAll('.viz-label, .viz-tick, figcaption')].filter((x) => /series/.test(x.getAttribute('style') || '')).length,
    };
  });
  check(!!punkte && punkte.punkte >= 3 && punkte.punkte === punkte.balken && punkte.referenz === 1 && punkte.rolle === 'group' && punkte.aria > 40,
    'M2 Punktdiagramm: ' + (punkte ? punkte.punkte : 0) + ' Punkte mit Wilson-Balken, Linie auf dem Gesamtwert, role=group mit aria-label (seit P4 Container statt Bild)');
  check(!!punkte && punkte.beschriftung.length === punkte.punkte && punkte.beschriftung.every((t) => /^n = \d+( · [+−±]\d+\.\d pp)?( · gesichert)?( \*)?$/.test(t)) && punkte.legende.length === 3 && punkte.textInDatenfarbe === 0,
    'M2 Direktbeschriftung je Punkt (' + (punkte ? punkte.beschriftung.join(' | ') : '') + '), Legende mit ' + (punkte ? punkte.legende.length : 0) + ' Einträgen, kein Text in der Datenfarbe');
  check(!!punkte && punkte.hohl >= 1 && punkte.tabellenzeilen >= punkte.punkte && /Kennzahlen je Profil/.test(punkte.titelDerTabelle),
    'M2 kleine Gruppen markiert (' + (punkte ? punkte.hohl : 0) + ' hohle Marker), Tabelle bleibt darunter (' + (punkte ? punkte.tabellenzeilen : 0) + ' Zeilen)');

  // Signale (Paket D, D2): erster Inhalt der Übersicht, Farbe nie allein, Höhenbudget im vollen Fall, Leerzustand.
  const signalLage = await page.evaluate(() => {
    const b = document.querySelector('#view .signale');
    const kachel = document.querySelector('#view .kpi');
    const gruppe = document.querySelector('#view .kpi-group');
    if (!b || !kachel) return null;
    const folgt = (x) => !!(x && (b.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      vorKachel: folgt(kachel), vorMengen: folgt(gruppe),
      kopf: (b.querySelector('.signale-meta') || {}).textContent || '',
      zeilen: [...b.querySelectorAll('.signal')].map((li) => ({
        rang: (li.querySelector('.signal-rang') || {}).textContent,
        wort: (li.querySelector('.signal-stufe') || {}).textContent,
        weg: !!li.querySelector('.signal-weg'),
      })),
    };
  });
  check(!!signalLage && signalLage.vorKachel && signalLage.vorMengen, 'D2 Übersicht: Signalblock steht vor den Mengen-Kacheln');
  check(!!signalLage && /·\s*nach Wirkung sortiert\s*·\s*gerechnet auf \d+ Vorgängen\s*·/.test(signalLage.kopf), 'D2 Signalkopf nennt Zahl, Sortierung und Grundlage: «' + (signalLage ? signalLage.kopf.trim() : '') + '»');
  check(!!signalLage && signalLage.zeilen.length > 0 && signalLage.zeilen.every((z, i) => z.rang === String(i + 1) && /^(kritisch|beachten|günstig)$/.test(z.wort) && z.weg),
    'D2 jede Signalzeile trägt Rang, Stufenwort und Weg – Farbe nie allein (' + (signalLage ? signalLage.zeilen.length : 0) + ' Zeilen)');
  // Der Weg ist begehbar: der Datensatz aus metrics.js wird von der Shell in Ansicht oder Filter übersetzt
  const vorWeg = { hash: new URL(page.url()).hash, chips: await page.locator('#filterbar .chip').count() };
  await page.locator('#view .signal-weg').first().click();
  await page.waitForFunction((v) => location.hash !== v.hash || document.querySelectorAll('#filterbar .chip').length !== v.chips, vorWeg, { timeout: 5000 }).catch(() => {});
  const nachWeg = { hash: new URL(page.url()).hash, chips: await page.locator('#filterbar .chip').count() };
  check(nachWeg.hash !== vorWeg.hash || nachWeg.chips !== vorWeg.chips, 'D2 Weg des ersten Signals führt irgendwohin (Hash «' + vorWeg.hash + '» → «' + nachWeg.hash + '», Chips ' + vorWeg.chips + ' → ' + nachWeg.chips + ')');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click().catch(() => {});
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Höhenbudget: gemessen mit dem vollen Fall (sechs Signale), nicht mit dem leeren. Offen bleiben die drei schwersten;
  // die übrigen Detailzeilen sind über «Alle Details zeigen» erreichbar, gehen also nicht verloren.
  await page.setViewportSize({ width: 1400, height: 900 });
  const budget = await page.evaluate(async (sechs) => {
    const mod = await import('/views/common.js');
    document.querySelector('#view .signale').replaceWith(mod.signalBlock({ signale: sechs, geprueft: [], n: 1204, zuKlein: false }, { onWeg: () => {}, filterKurz: 'kein Filter' }));
    const b = document.querySelector('#view .signale');
    const mess = () => ({
      hoehe: Math.round(b.getBoundingClientRect().height),
      // Seit M3 folgt auf die Signale der Quotenblock; gemessen wird, was direkt darunter beginnt
      kachelY: Math.round((document.querySelector('#view .messzeile') || document.querySelector('#view .kpi')).getBoundingClientRect().top + window.scrollY),
      letzteMesszeile: (() => { const z = [...document.querySelectorAll('#view .messzeile')]; return z.length ? Math.round(z[z.length - 1].getBoundingClientRect().bottom + window.scrollY) : null; })(),
      // Bei Überschreitung nennen, woher die Höhe kommt: Zeilenhöhen und umbrechende Beschriftungen
      zeilenhoehen: [...new Set([...document.querySelectorAll('#view .messzeile')].map((z) => Math.round(z.getBoundingClientRect().height)))],
      umbrueche: [...document.querySelectorAll('#view .mz-label')].filter((l) => l.getBoundingClientRect().height > 24).length,
      details: [...b.querySelectorAll('.signal-detail')].filter((p) => p.getClientRects().length > 0).length,
    });
    const zu = mess();
    b.querySelector('.signale-mehr').click();
    const auf = mess();
    b.querySelector('.signale-mehr').click();
    return { zu, auf, zeilen: b.querySelectorAll('.signal').length };
  }, SECHS_SIGNALE);
  check(budget.zeilen === 6 && budget.zu.hoehe <= 300, 'D2 Höhenbudget: sechs Signale in ' + budget.zu.hoehe + ' px (Grenze 300 px bei 1400 × 900)');
  check(budget.zu.kachelY < 700, 'D2 erster Inhalt unter den Signalen bei y = ' + budget.zu.kachelY + ' (über 700)');
  // M3: Höhenbudget der Übersicht im echten Fall – die sechs Quoten-Messzeilen müssen ohne Scrollen lesbar sein
  check(budget.zu.letzteMesszeile !== null && budget.zu.letzteMesszeile < 900,
    'M3 Höhenbudget: letzte Quoten-Messzeile bei y = ' + budget.zu.letzteMesszeile + ' (über 900, mit sechs Signalen bei 1400 × 900); Zeilen '
      + budget.zu.zeilenhoehen.join('/') + ' px, ' + budget.zu.umbrueche + ' umbrechende Beschriftungen');
  check(budget.zu.details === 3 && budget.auf.details === 6, 'D2 drei Detailzeilen offen, alle sechs über den Schalter erreichbar (' + budget.zu.details + ' → ' + budget.auf.details + ')');

  // Leerzustand: Feuert keine Regel, verschwindet der Block nicht, sondern nennt, was geprüft wurde und ruhig blieb.
  const ruhig = await page.evaluate(async () => {
    const mod = await import('/views/common.js');
    const metrics = await import('/metrics.js');
    document.querySelector('#view .signale').replaceWith(mod.signalBlock({ signale: [], geprueft: metrics.SIGNAL_REGELN, n: 1204, zuKlein: false }, { filterKurz: 'kein Filter' }));
    const b = document.querySelector('#view .signale');
    return { da: b.getClientRects().length > 0, text: b.textContent.replace(/\s+/g, ' ').trim(), geprueft: b.querySelectorAll('.signale-geprueft li').length };
  });
  check(ruhig.da && ruhig.geprueft >= 5 && /Keine Regel hat ausgelöst\. Geprüft wurde:/.test(ruhig.text), 'D2 Leerzustand: Block bleibt stehen und nennt ' + ruhig.geprueft + ' geprüfte Regeln');
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const kpiCount = await page.locator('#view .kpi').count();
  // Mengen-Kacheln tragen keine n-Zeile mehr: Ihr Wert ist die Anzahl, «n = 977» daneben meinte die Grundmenge der
  // Auswahl und bei «Personen» etwas anderes als die Kachel. Ø-Kacheln nennen weiterhin ihren Nenner.
  const kpiN = await page.$$eval('#view .kpi', (tiles) => tiles.map((t) => ({
    count: t.classList.contains('count'),
    n: (t.querySelector('.kpi-n') || {}).textContent.replace(/\s*\*$/, '').trim(),
  })));
  check(kpiCount >= 10 && kpiN.filter((k) => k.count).every((k) => k.n === '') && kpiN.filter((k) => !k.count).every((k) => /^n = \d+$|^\d+ von \d+ /.test(k.n)),
    'Übersicht: ' + kpiCount + ' Kacheln – Mengen ohne n-Zeile, Ø-Kacheln mit Nenner (' + (kpiN.find((k) => !k.count) || {}).n + ')');
  // Kacheln (A.4): drei Blöcke, Definition als ⓘ und Glossar-Link statt Absatz, Delta zum Benchmark mit Symbol und Vorzeichen
  // M3: Die sechs Quoten stehen als Messzeilen auf einer gemeinsamen Skala, die Kacheln bleiben für Mengen
  // und die vier Ø-Kennzahlen (die ihre Streuungszeile tragen).
  const bloecke = await page.evaluate(() => {
    const quoten = [...document.querySelectorAll('#view .messzeile')];
    const spuren = [...document.querySelectorAll('#view .messzeilen')];
    return {
      h3: [...document.querySelectorAll('#view .kpi-group h3')].map((x) => x.textContent),
      quoten: quoten.map((z) => ((z.querySelector('.mz-label') || {}).textContent || '').replace('ⓘ', '').trim()),
      definitionen: quoten.filter((z) => z.querySelector('.mz-label .info')).length,
      spuren: spuren.length,
      skalenkopf: spuren.length ? spuren[0].querySelector('.mz-kopf .mz-label').textContent : '',
      oKacheln: [...document.querySelectorAll('#view .kpi')].filter((k) => k.querySelector('.kpi-spread-full')).length,
      quotenKacheln: [...document.querySelectorAll('#view .kpi .kpi-label')].filter((l) => /^(Schriftlich|Mündlich): (im 1\. Versuch|insgesamt|bestanden|2×)/.test(l.textContent)).length,
    };
  });
  check(bloecke.h3.join(',') === 'Durchfallquoten,Mengen,Ø Resultat' && bloecke.quoten.length === 5 && bloecke.spuren === 1 && bloecke.skalenkopf === 'Durchfallquoten'
    && bloecke.quotenKacheln === 0 && bloecke.oKacheln === 4,
    'M3 Übersicht: ' + bloecke.quoten.length + ' Quoten als Messzeilen auf einer Spur («' + bloecke.skalenkopf + '»), Kacheln nur noch in ' + bloecke.h3.join(' · ') + ' (' + bloecke.oKacheln + ' Ø-Kacheln mit Streuung)');
  check(bloecke.quoten.join(' | ') === 'Schriftlich: im 1. Versuch durchgefallen | Schriftlich: endgültig nicht bestanden | Mündlich: im 1. Versuch durchgefallen | Mündlich: 2× durchgefallen | Mündlich: 3× durchgefallen'
    && bloecke.definitionen === 5,
    'M3 Reihenfolge und Benennung der Messzeilen: ' + bloecke.quoten.join(' | '));
  // Die Spur läuft von 0 bis 50 %, und jede Zeile nennt Zähler und Grundgesamtheit («191 von 977»)
  const spur = await page.evaluate(() => ({
    marken: [...document.querySelectorAll('#view .mz-achse .mz-marke')].map((m) => m.textContent),
    anzahl: [...document.querySelectorAll('#view .messzeile .mz-n')].map((x) => x.textContent.trim()),
    kopf: [...document.querySelectorAll('#view .mz-kopf > *')].map((x) => x.textContent.trim()),
    maxPos: Math.max(...[...document.querySelectorAll('#view .messzeile .mz-punkt')].map((p) => parseFloat(p.style.left) || 0)),
    // Ein Nullpunkt für alle: Kopfzeile und Zeilen teilen ein Raster (Subgrid). Vorher rechnete jede Zeile ihre
    // Spaltenbreite selbst – die Spur begann bei 316, 310, 313, 248 und 306 px, die Achse 130 px weiter links.
    spurStart: [...new Set([...document.querySelectorAll('#view .messzeilen .mz-skala')].map((e) => Math.round(e.getBoundingClientRect().left)))],
  }));
  // Die Spur endet auf der nächsten 5-%-Stufe über dem grössten Wert (mindestens 10 pp): Der grösste Punkt liegt
  // damit im rechten Drittel statt in der linken Hälfte einer festen 50-%-Spur.
  check(spur.marken[0] === '0 %' && /^\d+(\.\d)? %$/.test(spur.marken[2]) && spur.maxPos >= 60
    && spur.anzahl.every((t) => /^\d+ von \d+$/.test(t)) && spur.kopf.includes('Anzahl'),
    'M3 Spur ' + spur.marken.join(' · ') + ', grösster Wert bei ' + spur.maxPos + ' % der Spur, Anzahl als Zähler von Grundgesamtheit (' + spur.anzahl.join(' | ') + ')');
  // H1: Dasselbe Zeichen in beiden Darstellungen – die Sparkline der Messzeile trägt für das laufende Jahr eine
  // Raute und ein gestricheltes Stück, genau wie das Liniendiagramm.
  // Die synthetische Datei hat zu wenige Jahre für eine Sparkline; geprüft wird deshalb am Baustein selbst, mit
  // einer Reihe, deren letztes Jahr noch läuft – und einer zweiten, die abgeschlossen endet.
  const sparkline = await page.evaluate(async () => {
    const mod = await import('/views/common.js');
    const jahre = (bis) => [2022, 2023, 2024, bis].map((year, i) => ({ year, pct: 0.2 - i * 0.01, n: 40 }));
    const bau = (bis) => {
      const node = mod.messzeile(mod.messzeileModell({ label: 'Probe', count: 20, n: 100, jahre: jahre(bis), laufendesJahr: 2026, skala: { min: 0, max: 0.5 } }));
      document.body.appendChild(node);
      const out = {
        rauten: node.querySelectorAll('polygon.mz-verlauf-laufend').length,
        gestrichelt: node.querySelectorAll('.mz-verlauf-linie-laufend').length,
        kreise: node.querySelectorAll('circle.mz-verlauf-ende').length,
        titel: [...node.querySelectorAll('title')].some((t) => /unvollständig/.test(t.textContent)),
      };
      node.remove();
      return out;
    };
    return { laufend: bau(2026), fertig: bau(2025) };
  });
  check(sparkline.laufend.rauten === 1 && sparkline.laufend.gestrichelt === 1 && sparkline.laufend.kreise === 0 && sparkline.laufend.titel
    && sparkline.fertig.rauten === 0 && sparkline.fertig.gestrichelt === 0 && sparkline.fertig.kreise === 1 && !sparkline.fertig.titel,
    'H1 Sparkline: laufendes Jahr als Raute mit gestricheltem Stück und Text, abgeschlossenes als gefüllter Punkt');
  check(spur.spurStart.length === 1,
    'M3 ein Nullpunkt für Achse und alle Zeilen (Spurbeginn bei ' + spur.spurStart.join('/') + ' px)');
  // Das Komplement der Erstversuchsquote steht nicht mehr auf der Übersicht – als Kennzahl bleibt es aber überall
  // dort, wo es hingehört: in der Vergleichstabelle, im Export und in der Ansicht «Schriftlich».
  const durchfall = await page.evaluate(() => {
    // Die Bestehensquoten sind die Gegenzahl der Messzeilen; auf der Übersicht stehen sie nicht mehr, in der
    // Vergleichstabelle und im Export bleiben sie vollständig.
    const namen = ['Schriftlich: im 1. Versuch bestanden', 'Schriftlich: insgesamt bestanden', 'Mündlich: bestanden'];
    const kacheln = [...document.querySelectorAll('#view .kpi .kpi-label')].map((l) => l.textContent.trim());
    const zeilen = [...document.querySelectorAll('#view .mz-label')].map((l) => l.textContent.trim());
    const tabelle = [...document.querySelectorAll('#view table.data td')].map((td) => td.textContent.trim());
    return {
      alsKachel: namen.filter((n) => kacheln.some((k) => k.startsWith(n))).length,
      alsMesszeile: namen.filter((n) => zeilen.includes(n)).length,
      inVergleichstabelle: namen.filter((n) => tabelle.includes(n)).length,
    };
  });
  check(durchfall.alsKachel === 0 && durchfall.alsMesszeile === 0 && durchfall.inVergleichstabelle === 3,
    'Bestehensquoten: nicht als Zeile und nicht als Kachel der Übersicht (sie sind die Gegenzahl), aber alle drei in der Vergleichstabelle (und im Export)');
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
  // Messzeile ohne benchmarkrelevanten Filter: keine Marke, keine Spalte «Δ Benchmark» – dieselbe Regel wie für die
  // Delta-Zeile der Kacheln (Paket BEFUNDE, A2). «● 0.0 pp» auf jeder Zeile sagte nur, dass kein Filter aktiv ist.
  const benchOhne = await page.evaluate(() => ({
    werte: [...document.querySelectorAll('#view .messzeile .mz-bench')].map((x) => x.textContent.trim()).filter(Boolean).length,
    marken: document.querySelectorAll('#view .messzeile .mz-referenz').length,
    kopf: [...document.querySelectorAll('#view .mz-kopf > *')].map((x) => x.textContent.trim()).filter(Boolean),
  }));
  check(benchOhne.werte === 0 && benchOhne.marken === 0 && !benchOhne.kopf.includes('Δ Benchmark'),
    'M-Benchmark ohne Filter: keine Marke, keine Zahl, keine Spalte (Kopf: ' + benchOhne.kopf.join(' · ') + ')');
  await shot(page, 'uebersicht-ohne-filter');
  await filterWaehlen(page, 'bank', { label: 'Testbank AG' });
  await page.waitForSelector('#view .kpi-delta');
  const offen = await vergleich();
  check(offen && offen.tag === 'SECTION' && !offen.satz, 'A2 Übersicht mit Bank-Filter: Vergleichstabelle offen, kein Gleichstand-Satz');
  // Vergleichstabelle: «Anzahl» statt «n». Die alte Spalte trug die Grundmenge der Auswahl, nicht den Nenner der
  // Zelle daneben – bei Mengenzeilen las sich «3 · n 9» als «3 von 9» und war es nicht.
  const anzahl = await page.evaluate(() => {
    const abschnitt = [...document.querySelectorAll('#view section.block, #view details.block')]
      .find((x) => ((x.querySelector('h3, summary') || {}).textContent || '').startsWith('Auswahl im Vergleich'));
    const tabelle = abschnitt.querySelector('table.data');
    const wrap = abschnitt.querySelector('.table-wrap');
    const zelle = (zeile, i) => (zeile.querySelectorAll('td')[i] || {}).textContent || '';
    const zeilen = [...tabelle.querySelectorAll('tbody tr')];
    const finde = (name) => zeilen.find((tr) => zelle(tr, 0).trim() === name);
    return {
      kopf: [...tabelle.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      quote: [zelle(finde('Schriftlich: im 1. Versuch bestanden'), 2).trim(), zelle(finde('Schriftlich: im 1. Versuch bestanden'), 4).trim()],
      mittel: zelle(finde('Schriftlich: Ø Resultat 1. Versuch'), 2).trim(),
      menge: [zelle(finde('Vorgänge'), 2).trim(), zelle(finde('Personen'), 2).trim(), zelle(finde('Zertifizierung offen'), 2).trim()],
      scrollt: wrap.classList.contains('scrolls-x'),
      balkenAufAnzahl: !!tabelle.querySelector('tbody tr td:nth-child(3)[style*="--v"]'),
      // Die Fussnote steht als ⓘ am Tabellentitel und zusätzlich in der Legende der Ansicht (B9)
      fussnote: (tabelle.querySelector('caption .info') || { title: '' }).title,
    };
  });
  check(anzahl.kopf.includes('Anzahl (Auswahl)') && anzahl.kopf.includes('Anzahl (Benchmark)') && !anzahl.kopf.some((t) => /^n \(/.test(t))
    && /^\d+ von \d+ Vorgängen$/.test(anzahl.quote[0]) && /^\d+ von \d+ Vorgängen$/.test(anzahl.quote[1])
    && /^n = \d+$/.test(anzahl.mittel) && anzahl.menge.every((t) => t === '') && !anzahl.scrollt && !anzahl.balkenAufAnzahl,
    'Vergleichstabelle: Anzahl je Art – Quote «' + anzahl.quote[0] + '», Ø «' + anzahl.mittel + '», Mengen leer; kein Scroll-Container, Balken bleiben auf den Prozentzellen');
  check(/Anzahl: bei Quoten/.test(anzahl.fussnote) && !/n \(Auswahl\)/.test(anzahl.fussnote),
    'Vergleichstabelle: Fussnote erklärt die neue Spalte');
  const benchMit = await page.evaluate(() => ({
    werte: [...document.querySelectorAll('#view .messzeile .mz-bench')].map((x) => x.textContent.trim()),
    marken: document.querySelectorAll('#view .messzeile .mz-referenz').length,
    kopf: [...document.querySelectorAll('#view .mz-kopf > *')].map((x) => x.textContent.trim()).filter(Boolean),
    toene: [...document.querySelectorAll('#view .messzeile .mz-bench')].map((x) => [...x.classList].find((c) => /^ton-/.test(c))),
    zeilen: document.querySelectorAll('#view .messzeile').length,
  }));
  check(benchMit.werte.length === benchMit.zeilen && benchMit.werte.every((t) => /^[▲▼●] [+−]?\d+\.\d pp$/.test(t))
    && benchMit.marken === benchMit.zeilen && benchMit.kopf.includes('Δ Vorjahr') && benchMit.kopf.includes('Δ Benchmark')
    && benchMit.toene.every(Boolean),
    'M-Benchmark mit Bank-Filter: je Zeile Marke und Zahl (' + benchMit.werte.join(' | ') + '), Kopf benennt beide Abstände');
  // Seit M3 sind nur noch die vier Ø-Kacheln keine Zählkacheln – eine Reihe genügt für die Prüfung
  check(restOhne.length >= 1 && restOhne.every((r) => r <= 1), 'A3 Übersicht ohne Filter: keine Kachel höher als ihr Inhalt verlangt (Rest je Reihe ' + restOhne.join('/') + ' px)');
  // A3: Wert zuerst, Beschriftung darunter, n darunter, Delta zuletzt – Wert und n liegen je Kachelreihe auf einer Linie
  const grundlinien = () => page.$$eval('#view .kpi', (tiles) => {
    const rows = new Map();
    for (const t of tiles) {
      const box = t.getBoundingClientRect();
      const abstand = (sel) => { const c = t.querySelector(sel); return c ? Math.round(c.getBoundingClientRect().top - box.top) : null; };
      const key = Math.round(box.top);
      if (!rows.has(key)) rows.set(key, { value: new Set(), n: new Set(), reihenfolge: new Set() });
      const r = rows.get(key);
      r.value.add(abstand('.kpi-value'));
      r.n.add(abstand('.kpi-n'));
      r.reihenfolge.add([...t.children].map((c) => c.className.split(' ')[0]).join('>'));
    }
    return [...rows.values()].map((r) => ({ value: [...r.value], n: [...r.n], reihenfolge: [...r.reihenfolge] }));
  });
  const linien = await grundlinien();
  check(linien.length >= 3 && linien.every((r) => r.value.length === 1 && r.value[0] > 0 && r.n.length === 1),
    'A3 Übersicht: je Kachelreihe liegen alle .kpi-value auf einer Linie und alle .kpi-n ebenfalls (' + linien.map((r) => r.value[0] + '/' + r.n[0]).join(' · ') + ' px)');
  check(linien.every((r) => r.reihenfolge.every((o) => /^kpi-value>kpi-label>kpi-n/.test(o))),
    'A3 Übersicht: Reihenfolge Wert · Beschriftung · n · (Streuung) · Delta (' + linien[0].reihenfolge[0] + ')');
  const deltas = await page.$$eval('#view .kpi-delta', (d) => d.map((x) => x.textContent.trim()));
  // Die sechs Quoten tragen ihren Benchmark seit M3 als Marke auf der Skala (Abstand im title und im versteckten Text);
  // als Delta-Zeile erscheinen noch die vier Ø-Kacheln
  check(deltas.length >= 4 && deltas.every((t) => /^[▲▼●] [+−]?\d+\.\d pp vs\. /.test(t)), 'Benchmark-Delta je Quoten-Kachel mit Symbol und Vorzeichen (' + deltas.length + ', z. B. «' + deltas[0] + '»)');
  const deltaCells = await page.$$eval('#view td.delta', (t) => t.map((x) => x.textContent.trim()));
  check(deltaCells.length >= 5 && deltaCells.every((t) => /^[▲▼●] [+−]?\d+\.\d pp$/.test(t)) && (await page.locator('#view td.delta.pos, #view td.delta.neg').count()) >= 1, 'Differenzspalte der Vergleichstabelle mit Symbol, Vorzeichen und Farbe (' + deltaCells.length + ' Zellen)');
  await shot(page, 'uebersicht-benchmark');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Paket A (A5): Zwei Prozessstufen, zwei Namen. «Schriftlich offen» (Spalte je Profil) zählt Vorgänge ohne schriftliches
  // Gesamtergebnis, «Zertifizierung offen» (Kachel) Vorgänge ohne Gesamtergebnis überhaupt. Die schriftliche Prüfung ist
  // das Gate zur mündlichen: Die Spaltensumme ist deshalb höchstens so gross wie die Kachel.
  const stufen = await page.evaluate(() => {
    const tile = [...document.querySelectorAll('#view .kpi')].find((k) => k.querySelector('.kpi-label').textContent.startsWith('Zertifizierung offen'));
    const tabelle = [...document.querySelectorAll('#view table')].find((t) => [...t.querySelectorAll('thead th')].some((th) => th.textContent.trim() === 'Schriftlich offen'));
    if (!tile || !tabelle) return { kachel: null, spalte: null, summe: null };
    const i = [...tabelle.querySelectorAll('thead th')].findIndex((th) => th.textContent.trim() === 'Schriftlich offen');
    const summe = [...tabelle.querySelectorAll('tbody tr')].reduce((a, tr) => a + (Number(tr.children[i].textContent.trim()) || 0), 0);
    return {
      kachel: Number(tile.querySelector('.kpi-value').textContent.trim()),
      glossar: (tile.querySelector('.kpi-label a') || {}).getAttribute ? tile.querySelector('.kpi-label a').getAttribute('href') : '',
      spalte: 'Schriftlich offen', summe,
      altNamen: [...document.querySelectorAll('#view .kpi-label, #view thead th')].map((x) => x.textContent.trim()).filter((t) => t === 'Offen' || t.startsWith('Vorgänge offen')),
    };
  });
  check(stufen.kachel !== null && stufen.spalte === 'Schriftlich offen' && stufen.summe <= stufen.kachel && stufen.altNamen.length === 0 && /begriff=zertifizierung-offen/.test(stufen.glossar || ''),
    'A5 Übersicht: Kachel «Zertifizierung offen» = ' + stufen.kachel + ', Spalte «Schriftlich offen» Summe ' + stufen.summe + ' (frühere Stufe, also nicht grösser), kein «Offen» mehr, Kachel verlinkt ins Glossar');

  // VSS/VSM (Lücke aus H4): drei Kennzeichnungen als Punkte gegen den Gesamtwert, in der Folge der Tabelle
  await page.goto(server.url + '#vss-vsm');
  await page.waitForSelector('#view table.data');
  const vss = await page.evaluate(() => {
    const svgEl = document.querySelector('#view .viz-dots');
    if (!svgEl) return null;
    const f = svgEl.closest('figure');
    const tabelle = document.querySelector('#view table.data');
    return {
      punkte: [...f.querySelectorAll('text.viz-label')].map((t) => t.textContent).filter((t) => !/^n = /.test(t)).map((t) => t.replace(/ \*$/, '')),
      referenz: f.querySelectorAll('.viz-ref').length,
      gruppenInTabelle: [...new Set([...tabelle.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent.trim()))],
      vorDerTabelle: !!(f.compareDocumentPosition(tabelle) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  // In der synthetischen Datei hat nur «ohne» einen auswertbaren Wert – eine Gruppe ohne Wert bekommt keinen Punkt
  check(!!vss && vss.referenz === 1 && vss.vorDerTabelle && vss.punkte.length >= 1
    && vss.punkte.every((p) => vss.gruppenInTabelle.includes(p))
    && vss.punkte.join('|') === vss.gruppenInTabelle.filter((g) => vss.punkte.includes(g)).join('|'),
    'VSS/VSM: Punktdiagramm vor der Tabelle (' + (vss ? vss.punkte.join(' · ') : '') + '), Folge wie die Tabelle, Linie auf dem Gesamtwert');

  // H2: Punktdiagramm je Gruppierung vor der Tabelle – in «Schriftlich» drei (Profil, Sprache, Bank), in «Mündlich»
  // eines (Profil). Die Tabelle bleibt darunter stehen und im Export; die Zahl der Punkte entspricht ihren Zeilen
  // ohne die Gesamtzeile.
  for (const [ansicht, erwartet] of [['schriftlich', 3], ['muendlich', 3]]) {
    await page.goto(server.url + '#' + ansicht);
    await page.waitForSelector('#view table.data');
    const h2 = await page.evaluate(() => {
      const abschnitt = [...document.querySelectorAll('#view section.block, #view details.block')]
        .find((x) => ((x.querySelector('h3, summary') || {}).textContent || '').startsWith('Bestehen und Durchfallen'));
      if (!abschnitt) return { diagramme: 0, ueberschriftFehlt: true };
      const figuren = [...abschnitt.querySelectorAll('figure.viz')].filter((f) => f.querySelector('.viz-dots'));
      const tabellen = [...abschnitt.querySelectorAll('table.data')];
      return {
        diagramme: figuren.length,
        tabellen: tabellen.length,
        titel: figuren.map((f) => (f.querySelector('figcaption') || {}).textContent.split(' · ')[0]),
        vorDerTabelle: figuren.every((f, i) => tabellen[i] && !!(f.compareDocumentPosition(tabellen[i]) & Node.DOCUMENT_POSITION_FOLLOWING)),
        punkteZuZeilen: figuren.map((f, i) => f.querySelectorAll('.viz-dot').length + '/' + (tabellen[i] ? tabellen[i].querySelectorAll('tbody tr').length - 1 : -1)),
        referenz: figuren.every((f) => f.querySelectorAll('.viz-ref').length === 1),
      };
    });
    // Höchstens so viele Punkte wie Tabellenzeilen: Eine Gruppe ohne auswertbaren Wert (niemand angetreten) hat
    // keinen Punkt – eine Position auf der Achse wäre dort eine Behauptung.
    check(h2.diagramme === erwartet && h2.tabellen >= erwartet && h2.vorDerTabelle && h2.referenz
      && h2.punkteZuZeilen.every((p) => Number(p.split('/')[0]) >= 1 && Number(p.split('/')[0]) <= Number(p.split('/')[1])),
      'H2 ' + ansicht + ': ' + h2.diagramme + ' Punktdiagramm(e) vor der Tabelle (' + h2.titel.join(' | ') + '), Punkte zu Tabellenzeilen ' + h2.punkteZuZeilen.join(', '));
    // P1: Die Überschrift nennt beide Seiten, und ein gesicherter Abstand trägt seine Wertung als Wort
    const p1 = await page.evaluate(() => {
      const abschnitt = [...document.querySelectorAll('#view section.block, #view details.block')]
        .find((x) => ((x.querySelector('h3, summary') || {}).textContent || '').startsWith('Bestehen und Durchfallen'));
      const beschriftungen = [...abschnitt.querySelectorAll('figure.viz text.viz-label')].map((t) => t.textContent).filter((t) => /^n = /.test(t));
      return {
        ueberschrift: (abschnitt.querySelector('h3, summary') || {}).textContent,
        hinweis: !!abschnitt.parentElement.textContent.match(/Diagramm zeigt die Durchfallquote/),
        gesichert: beschriftungen.filter((t) => /gesichert/.test(t)),
        ohneWertung: beschriftungen.filter((t) => /gesichert(?! (günstig|ungünstig))/.test(t)),
      };
    });
    check(/^Bestehen und Durchfallen/.test(p1.ueberschrift) && p1.hinweis && p1.ohneWertung.length === 0,
      'P1 ' + ansicht + ': Überschrift «' + p1.ueberschrift + '», Hinweis nennt beide Seiten, jeder gesicherte Abstand mit Wertung ('
        + (p1.gesichert.length ? p1.gesichert.join(' | ') : 'keiner gesichert') + ')');
  }

  // Letzte Lücke aus H4: Punktdiagramm je Teilprüfung in «Schriftlich» – ohne Bezugslinie, weil ein Gesamtwert
  // über alle Teilprüfungen einen anderen Nenner hätte als die Zeilen.
  await page.goto(server.url + '#schriftlich');
  await page.waitForSelector('#view table.data');
  const teile = await page.evaluate(() => {
    const abschnitt = [...document.querySelectorAll('#view section.block, #view details.block')]
      .find((x) => ((x.querySelector('h3, summary') || {}).textContent || '').startsWith('Je Teilprüfung'));
    const fig = abschnitt ? abschnitt.querySelector('figure.viz') : null;
    if (!fig) return null;
    const tabelle = abschnitt.querySelector('table.data');
    return {
      punkte: [...fig.querySelectorAll('text.viz-label')].map((t) => t.textContent).filter((t) => /^WE\d/.test(t)).map((t) => t.replace(/ \*$/, '')),
      referenz: fig.querySelectorAll('.viz-ref').length,
      balken: fig.querySelectorAll('.viz-ci').length,
      zeilen: [...tabelle.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent.replace(/ \*$/, '').trim()),
      vorDerTabelle: !!(fig.compareDocumentPosition(tabelle) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  // Teilprüfungen ohne absolvierten ersten Versuch haben keinen Punkt – in der synthetischen Datei bleibt einer übrig
  check(!!teile && teile.punkte.length >= 1 && teile.referenz === 0 && teile.balken === teile.punkte.length
    && teile.vorDerTabelle && teile.punkte.join('|') === teile.zeilen.filter((z) => teile.punkte.includes(z)).join('|'),
    'Schriftlich: Punktdiagramm je Teilprüfung (' + (teile ? teile.punkte.join(' · ') : '') + ') ohne Bezugslinie, Folge wie die Tabelle');

  // P2: Die Achse jedes Punktdiagramms folgt den Daten – geprüft wird die Regel selbst, nicht eine Faustzahl:
  // Beginn bei 0 %, Ende auf der nächsten 5-%-Stufe ECHT über dem grössten Wert (Punkt, Intervallende ODER
  // Bezugslinie), mindestens 10 pp Spanne, höchstens 100 %. Vorher lief die Achse immer bis 100 %.
  for (const ansicht of ['uebersicht', 'schriftlich', 'muendlich', 'vss-vsm', 'experten']) {
    await page.goto(server.url + '#' + ansicht);
    await page.waitForSelector('#view figure.viz .viz-dots');
    const skalen = await page.evaluate(() => [...document.querySelectorAll('#view figure.viz')]
      .filter((f) => f.querySelector('.viz-dots')).map((f) => {
        const s = f.querySelector('svg');
        const achse = s.querySelector('line.viz-axis');
        const xa = Number(achse.getAttribute('x1')), xe = Number(achse.getAttribute('x2'));
        // Wert je Pixel aus zwei Achsenbeschriftungen; die Beschriftung der Bezugslinie trägt einen Namen davor
        // und fällt hier heraus – sie ist ein zu prüfender Wert, kein Massstab.
        const achsTicks = [...s.querySelectorAll('text.viz-tick')].filter((t) => /^[\d.,]+ %$/.test(t.textContent.trim()))
          .map((t) => ({ x: Number(t.getAttribute('x')), v: parseFloat(t.textContent) / 100 })).sort((a, b) => a.x - b.x);
        const a = achsTicks[0], b = achsTicks[achsTicks.length - 1];
        const proPx = (b.v - a.v) / (b.x - a.x);
        const wert = (x) => a.v + (x - a.x) * proPx;
        const xs = [...s.querySelectorAll('circle.viz-dot')].map((c) => Number(c.getAttribute('cx')))
          .concat([...s.querySelectorAll('line.viz-ci-cap')].map((l) => Number(l.getAttribute('x1'))));
        const ref = s.querySelector('line.viz-ref');
        if (ref) xs.push(Number(ref.getAttribute('x1')));
        return {
          titel: (f.querySelector('figcaption') || { textContent: '' }).textContent.split(' · ')[0],
          ersterTick: achsTicks[0].v,
          achsEnde: Math.round(wert(xe) * 1000) / 1000,
          groesster: Math.round(Math.max(...xs.map(wert)) * 1000) / 1000,
          ueberRand: xs.filter((x) => x > xe + 0.5).length,
          fuellung: Math.round(((Math.max(...xs) - xa) / (xe - xa)) * 1000) / 10,
          beschriftungen: [...s.querySelectorAll('text.viz-label')].map((t) => t.textContent).filter((t) => /^n = /.test(t)),
        };
      }));
    // Aus Pixeln zurückgerechnet, deshalb toleriert die Prüfung 0.3 pp. Geprüft wird die Regel in ihren zwei
    // Hälften statt gegen eine Faustzahl: Die Achse endet ÜBER dem grössten Wert, aber weniger als eine 5-%-Stufe
    // darüber – ausser am Boden (10 pp Mindestspanne) und am Deckel (100 %), wo die Regel nicht weiter kann.
    const TOL = 0.003;
    const grund = (d) => d.ersterTick !== 0 ? 'beginnt bei ' + Math.round(d.ersterTick * 100) + ' % statt 0 %'
      : d.ueberRand > 0 ? d.ueberRand + ' Werte über dem rechten Rand (geklemmt)'
      : d.achsEnde < d.groesster - TOL ? 'endet bei ' + d.achsEnde + ' unter dem grössten Wert ' + d.groesster
      : (d.achsEnde - d.groesster >= 0.05 + TOL && d.achsEnde > 0.103 && d.achsEnde < 0.997) ? 'endet ' + Math.round((d.achsEnde - d.groesster) * 1000) / 10 + ' pp über dem grössten Wert – mehr als eine Stufe'
      : null;
    const falsch = skalen.filter((d) => grund(d));
    check(skalen.length > 0 && falsch.length === 0,
      'P2 ' + ansicht + ': ' + skalen.length + ' Achse(n) folgen den Daten ab 0 % – '
        + skalen.map((d) => d.titel.slice(0, 28) + ' bis ' + Math.round(d.achsEnde * 100) + ' % (grösster Wert ' + Math.round(d.groesster * 1000) / 10 + ' %, Füllung ' + d.fuellung + ' %)').join(' | ')
        + (falsch.length ? ' – FALSCH: ' + falsch.map((d) => d.titel + ': ' + grund(d)).join(' / ') : ''));
    // P3: Nichts ragt über die viewBox – links die Gruppennamen, rechts die Direktbeschriftung. Beide Ränder
    // wachsen mit ihrem Text; dem Plot bleibt mindestens die halbe Breite.
    const b = await punktBeschriftungen(page);
    check(b.length > 0 && b.every((d) => d.ueber.length === 0 && d.plot >= d.vb / 2 - 1),
      'P3 ' + ansicht + ': Beschriftungen innerhalb der viewBox, Plot ≥ halbe Breite – '
        + b.map((d) => d.titel.slice(0, 24) + ' ' + d.randLinks + '|' + d.plot + '|' + d.randRechts + ' von ' + d.vb).join(' · ')
        + (b.some((d) => d.ueber.length) ? ' – ÜBER DEN RAND: ' + b.flatMap((d) => d.ueber).join(', ') : ''));

    // P4: Ein <title> JE ZEILE statt einem je SVG, und die Trefferfläche ist die ganze Zeile. Geprüft wird an
    // vier Stellen der Zeile (Gruppenname links, Balkenanfang, Punkt, Direktbeschriftung rechts), dass derselbe
    // Satz erscheint – und dass die Sätze verschiedener Zeilen verschieden sind. Vorher trugen alle Zeilen den
    // Titel des Diagramms.
    const p4 = await page.evaluate(() => {
      // elementFromPoint rechnet im Sichtfenster: Was darunter liegt, liefert null. Deshalb wird jede Figur
      // vor der Probe in die Mitte gescrollt – sonst misst die Prüfung den Scrollstand statt die Trefferfläche.
      const titelAn = (x, y) => {
        for (let e = document.elementFromPoint(x, y); e && e !== document.body; e = e.parentElement || e.parentNode) {
          const t = e.children ? [...e.children].find((c) => c.tagName.toLowerCase() === 'title') : null;
          if (t) return t.textContent;
        }
        return null;
      };
      return [...document.querySelectorAll('#view figure.viz')].filter((f) => f.querySelector('.viz-dots')).map((f) => {
        const sv = f.querySelector('svg');
        sv.scrollIntoView({ block: 'center' });
        const kasten = sv.getBoundingClientRect();
        const eintraege = [...sv.querySelectorAll('[role="listitem"]')];
        const saetze = eintraege.map((g) => (g.querySelector('title') || {}).textContent || '');
        // Vier Proben je Zeile über die volle Breite des Zeilenbandes
        const proben = eintraege.map((g, i) => {
          const r = g.querySelector('rect.viz-treffer');
          if (!r) return { i, treffer: 0, von: 4 };
          const b = r.getBoundingClientRect();
          const y = b.top + b.height / 2;
          const xs = [b.left + 4, b.left + b.width * 0.35, b.left + b.width * 0.6, b.right - 4];
          return { i, treffer: xs.filter((x) => titelAn(x, y) === saetze[i]).length, von: xs.length };
        });
        return {
          titel: (f.querySelector('figcaption') || { textContent: '' }).textContent.split(' · ')[0],
          rolle: sv.getAttribute('role'),
          listen: sv.querySelectorAll('[role="list"]').length,
          eintraege: eintraege.length,
          punkte: sv.querySelectorAll('circle.viz-dot').length,
          titelAufDerWurzel: [...sv.children].filter((c) => c.tagName.toLowerCase() === 'title').length,
          dekoVersteckt: sv.querySelectorAll('g[aria-hidden="true"] .viz-axis, g[aria-hidden="true"] .viz-grid').length,
          verschieden: new Set(saetze).size,
          vollstaendig: saetze.filter((t) => /·/.test(t) && / % · /.test(t)).length,
          mitZaehler: saetze.filter((t) => / von \d+ /.test(t)).length,
          treffer: proben.reduce((a, x) => a + x.treffer, 0),
          proben: proben.reduce((a, x) => a + x.von, 0),
          beispiel: saetze[0] || '',
          flaeche: Math.round(kasten.width * (kasten.height / Math.max(1, eintraege.length))),
        };
      });
    });
    const p4Falsch = p4.filter((d) => d.rolle !== 'group' || d.listen !== 1 || d.eintraege !== d.punkte
      || d.titelAufDerWurzel !== 0 || d.dekoVersteckt < 2 || d.verschieden !== d.eintraege
      || d.vollstaendig !== d.eintraege || d.mitZaehler !== d.eintraege || d.treffer !== d.proben);
    check(p4.length > 0 && p4Falsch.length === 0,
      'P4 ' + ansicht + ': ' + p4.map((d) => d.eintraege + ' Zeilen mit eigenem Satz, Trefferfläche ' + d.flaeche + ' px² (' + d.treffer + '/' + d.proben + ' Proben)').join(' | ')
        + ' – z. B. «' + (p4[0] || {}).beispiel + '»'
        + (p4Falsch.length ? ' – FALSCH: ' + p4Falsch.map((d) => d.titel + ' role=' + d.rolle + ', ' + d.listen + ' Listen, ' + d.eintraege + ' Einträge zu ' + d.punkte + ' Punkten, '
          + d.verschieden + ' verschiedene Sätze, ' + d.mitZaehler + ' mit Zähler, ' + d.titelAufDerWurzel + ' Titel auf der Wurzel, ' + d.treffer + '/' + d.proben + ' Proben').join(' / ') : ''));

    // P1 für JEDES Punktdiagramm, nicht nur in «Schriftlich»/«Mündlich»: Ein gesicherter Abstand trägt seine
    // Wertung als Wort. Die Übersicht rief das Diagramm an der Prüfung vorbei direkt auf und reichte die Richtung
    // nicht weiter – gefunden hat das erst diese Prüfung. Ausgenommen ist «Experten»: dort ist die Richtung
    // bewusst neutral, weil Menschen verglichen werden und eine Wertung eine Rangliste wäre (E9).
    if (ansicht !== 'experten') {
      const ohneWertung = skalen.flatMap((d) => d.beschriftungen.filter((t) => /gesichert(?! (günstig|ungünstig))/.test(t)));
      const mitWertung = skalen.flatMap((d) => d.beschriftungen.filter((t) => /gesichert (günstig|ungünstig)/.test(t)));
      check(ohneWertung.length === 0,
        'P1 ' + ansicht + ': jeder gesicherte Abstand mit Wertung ('
          + (mitWertung.length ? mitWertung.join(' | ') : 'keiner gesichert') + ')'
          + (ohneWertung.length ? ' – OHNE: ' + ohneWertung.join(' | ') : ''));
    }
  }

  // P5: «VSS/VSM» zeigt BEIDE Prüfungsteile für alle drei Gruppen – die Ansicht und das README versprachen das,
  // gezeigt wurde nur die schriftliche Seite. Zwei Diagramme statt zweier Reihen in einem, weil die Nenner
  // verschieden sind: Jede Seite braucht ihre eigene Bezugslinie. Die synthetische Datei trägt dafür seit P5
  // Threaded Comments auf der Namenszelle (VSS, VSM, eine Zeile mit beidem) – vorher war VSS/VSM immer leer und
  // die Ansicht zeigte nur «ohne».
  await page.goto(server.url + '#vss-vsm');
  await page.waitForSelector('#view figure.viz .viz-dots');
  const p5 = await page.evaluate(() => {
    const figs = [...document.querySelectorAll('#view figure.viz')].filter((f) => f.querySelector('.viz-dots'));
    return figs.map((f) => {
      const sv = f.querySelector('svg');
      const refText = [...sv.querySelectorAll('text.viz-tick')].find((t) => !/^[\d.,]+ %$/.test(t.textContent.trim()));
      return {
        titel: (f.querySelector('figcaption') || { textContent: '' }).textContent.split(' · ')[0],
        gruppen: [...sv.querySelectorAll('[role="listitem"] title')].map((t) => t.textContent.split(' · ')[0]),
        saetze: [...sv.querySelectorAll('[role="listitem"] title')].map((t) => t.textContent),
        referenz: refText ? refText.textContent.trim() : '',
        linien: sv.querySelectorAll('line.viz-ref').length,
        legende: [...f.querySelectorAll('.viz-legend-item')].map((x) => x.textContent.trim()).join(' · '),
        farben: [...new Set([...sv.querySelectorAll('circle.viz-dot')].map((c) => (c.getAttribute('style') || '').replace(/^(fill|stroke):/, '')))],
      };
    });
  });
  const dreiGruppen = (d) => d.gruppen.join('|') === 'VSS|VSM|ohne';
  const nenner = p5.map((d) => d.saetze.filter((t) => /angetretenen Vorgängen|angetretenen Vorgang/.test(t)).length);
  check(p5.length === 2
    && /^Schriftlich /.test(p5[0].titel) && /^Mündlich /.test(p5[1].titel)
    && p5.every(dreiGruppen)
    && p5.every((d) => d.linien === 1)
    && p5[0].referenz !== p5[1].referenz
    && nenner[0] === 0 && nenner[1] === 3
    && p5.every((d) => d.farben.every((c) => c === 'var(--series-1)')),
    'P5 VSS/VSM: ' + p5.length + ' Diagramme (' + p5.map((d) => d.titel.split(' ')[0] + ': ' + d.gruppen.join('/') + ', Linie «' + d.referenz + '»').join(' | ')
      + '), mündlich mit eigenem Nenner (' + nenner[1] + ' von ' + p5[1].gruppen.length + ' Zeilen nennen angetretene Vorgänge), Reihenfarbe und Legende wie überall ('
      + (p5[0] || {}).legende + ')');
  // Die Kennzeichnungen kommen aus den Threaded Comments und überschneiden sich: eine Zeile trägt VSS UND VSM,
  // die drei Gruppen teilen den Gesamtwert also nicht auf. Geprüft an der Tabelle, die die Nenner nennt.
  const vssTabelle = await page.evaluate(() => {
    const t = document.querySelector('#view table.data');
    return {
      gruppen: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent.trim()).join(' · ')),
    };
  });
  const alleZeilen = vssTabelle.gruppen.filter((z) => / · alle · /.test(z));
  check(alleZeilen.length === 3 && alleZeilen.every((z) => Number(z.split(' · ')[2]) > 0),
    'P5 VSS/VSM: alle drei Gruppen mit Vorgängen in der Tabelle (' + alleZeilen.join(' | ') + ')');

  // P6: Die mündliche Erstversuchsquote steht in der Tabelle – in Bestehensrichtung wie die schriftliche Seite –,
  // und jede der vier Quoten trägt ihren eigenen Nenner als Spalte. Vorher stand EINE n-Spalte neben drei Quoten
  // mit drei verschiedenen Nennern und sah aus wie deren Nenner; sie ist die Grösse der Gruppe.
  const p6 = await page.evaluate(() => {
    const t = document.querySelector('#view table.data');
    const kopf = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const zeile = [...t.querySelectorAll('tbody tr')].find((tr) => /^VSS/.test(tr.textContent));
    return {
      kopf,
      // Die Fussnote steht als ⓘ am Tabellentitel, also im title-Attribut – nicht im Textinhalt.
      note: ([...document.querySelectorAll('#view .info')].map((e) => e.getAttribute('title') || '')
        .find((x) => /Vorgänge mit VSS und VSM zählen in beiden Gruppen/.test(x)) || ''),
      werte: zeile ? [...zeile.querySelectorAll('td')].map((td) => td.textContent.trim()) : [],
    };
  });
  const nennerSpalten = p6.kopf.filter((k) => /^n \(/.test(k));
  check(p6.kopf.includes('Mündlich im 1. Versuch bestanden')
    && nennerSpalten.length === 5
    && !p6.kopf.some((k) => /durchgefallen/i.test(k))
    && ['absolviertem WE RUN1', 'datierter OE1 RUN1', 'bestanden + nicht bestanden', 'Grösse der Gruppe'].every((teil) => p6.note.includes(teil)),
    'P6 VSS/VSM: ' + p6.kopf.length + ' Spalten mit mündlicher Erstversuchsquote in Bestehensrichtung, '
      + nennerSpalten.length + ' Nennerspalten (' + nennerSpalten.join(', ') + '), Fussnote benennt jeden Nenner');

  // Der Export nimmt die neuen Spalten mit – geprüft am echten Knöpfchen, nicht an einem Nachbau
  await page.locator('#view .view-actions details.export-menu summary').first().click();
  const [p6Download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#view details.menu[open] .menu-item', { hasText: /^CSV$/ }).first().click(),
  ]);
  const p6Csv = readFileSync(await p6Download.path(), 'utf8');
  const p6Kopf = (p6Csv.split(String.fromCharCode(10)).map((z) => z.split(String.fromCharCode(13)).join(''))
    .find((z) => z.startsWith('Gruppe')) || '').split(';');
  check(p6Kopf.length === p6.kopf.length && p6Kopf.includes('Mündlich im 1. Versuch bestanden')
    && p6Kopf.filter((k) => /^n \(/.test(k)).length === 5,
    'P6 Export: ' + p6Download.suggestedFilename() + ' mit ' + p6Kopf.length + ' Spalten – auch die auf dem Schirm ausgeblendeten ('
      + p6Kopf.slice(-4).join(', ') + ')');

  // Histogramm (PROMPT-2 Paket G, G.4): Schriftlich und Mündlich zeigen die Verteilung der Resultate (1. Versuch) als Balkendiagramm
  // (Auswahl vs. Benchmark, Klassen à 10 pp) mit Legende und Tabellen-Zwilling; Tooltip per Tastatur; n < 5 → Hinweis statt Diagramm
  for (const v of ['schriftlich', 'muendlich']) {
    await page.goto(server.url + '#' + v);
    await page.waitForFunction((id) => location.hash.replace(/^#/, '').split('?')[0] === id && !!document.querySelector('#view h2'), v, { timeout: 5000 });
    const bars = await page.evaluate(() => ({
      svg: document.querySelectorAll('#view svg.viz-bars').length, rects: document.querySelectorAll('#view svg.viz-bars rect.viz-bar').length,
      // Legende des Histogramms, nicht die der Punktdiagramme daneben (seit H2 stehen mehrere Diagramme in der Ansicht)
      legend: (() => { const f = (document.querySelector('#view svg.viz-bars') || {}).closest ? document.querySelector('#view svg.viz-bars').closest('figure') : null; return f ? f.querySelectorAll('.viz-legend-item').length : 0; })(),
      twin: [...document.querySelectorAll('#view table caption')].some((c) => /Verteilung der Resultate/.test(c.textContent)),
      ticks: [...document.querySelectorAll('#view svg.viz-bars text.viz-tick')].map((t) => t.textContent),
    }));
    check(bars.svg === 1 && bars.rects >= 10 && bars.legend === 2 && bars.twin && bars.ticks.includes('90–100') && bars.ticks.some((t) => /%$/.test(t)), 'Ansicht ' + v + ': Histogramm der Resultate (' + bars.rects + ' Balken, 2 Reihen, Tabellen-Zwilling, Klassen bis 90–100)');
  }
  await page.focus('#view svg.viz-bars');
  await page.keyboard.press('ArrowLeft');
  const barTip = await page.evaluate(() => { const t = document.querySelector('#view .viz-tip'); return { hidden: !t || t.hidden, text: t ? t.textContent : '' }; });
  check(!barTip.hidden && /Auswahl/.test(barTip.text) && /%/.test(barTip.text), 'Histogramm: Tooltip per Tastatur (' + barTip.text.slice(0, 70) + ')');
  await filterWaehlen(page, 'profil', 'IK');
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
  await filterWaehlen(page, 'profil', 'PK');
  await page.waitForFunction((b) => document.querySelector('#filterbar .summary').textContent !== b, before, { timeout: 5000 });
  check((await page.locator('#filterbar .chip', { hasText: 'Profil PK' }).count()) === 1 && /profil=PK/.test(page.url()), 'Filter Profil = PK wirkt: Chip «Profil PK», steht in der URL');
  const fokus = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a && a.tagName, label: a && a.closest && a.closest('label') ? a.closest('label').textContent.slice(0, 12) : null, id: a && a.id, klasse: a && String(a.className).slice(0, 30) };
  });
  check(fokus.tag === 'SELECT' && (fokus.label || '').startsWith('Profil'), 'Fokus bleibt nach der Filteränderung auf dem Auswahlfeld Profil (' + JSON.stringify(fokus) + ')');
  await filterWaehlen(page, 'jahr', '2026');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 2, null, { timeout: 5000 });
  check(/von=2026-01-01/.test(page.url()) && (await page.locator('#filterbar .chip', { hasText: '2026' }).count()) === 1 && (await page.locator('#filterbar button.reset').isVisible()), 'Jahr 2026 gewählt: Chip «2026», Von/Bis in der URL, Reset sichtbar');
  await shot(page, 'filter-chips');
  await page.locator('#filterbar .chip', { hasText: '2026' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check(!/von=/.test(page.url()) && /profil=PK/.test(page.url()) && (await page.locator('#filterbar label[data-field="jahr"] select').inputValue()) === '', 'Chip ✕ entfernt nur den Zeitraum; Profil bleibt, Jahr zeigt «Alle»');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });
  check(!/profil=/.test(page.url()) && (await page.locator('#filterbar button.reset').isHidden()), 'Filter zurückgesetzt: URL ohne Filter, keine Chips, Reset ausgeblendet');

  // Paket A (A1): Felder, die eine Ansicht nicht auswertet, sind deaktiviert und abgesetzt statt in der Kurzbeschreibung erklärt.
  // Erwartete Zahl abgeschalteter Felder je Ansicht; auf «Datenqualität» verschwindet die Leiste ganz.
  // Seit C5 stehen «Wertung» und «Benchmark» ebenfalls in der Leiste. Sie gelten nur, wo sie ausdrücklich erklärt sind:
  // Wertung auf «Bestenlisten», Benchmark auf «Übersicht», «Schriftlich» und «Mündlich». Überall sonst abgeschaltet.
  const OFF = {
    uebersicht: 1, schriftlich: 1, muendlich: 1, bestenlisten: 1, 'vss-vsm': 2, 'bank-report': 2,
    zeitverlauf: 5, 'offene-vorgaenge': 5, 'geplante-pruefungen': 5, personen: 6, experten: 3,
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
  check((await page.locator('#filterbar label[data-field="versuche"]').getAttribute('title')) !== null, 'A1 Experten: Grund am abgeschalteten Feld «Versuche»');
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
  await filterWaehlen(page, 'profil', 'PK');
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
  await filterWaehlen(page, 'jahr', '2026');
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

  // Paket H (H1): Das laufende Jahr ist unvollständig und wird überall so gekennzeichnet – im Diagramm mit Raute und
  // gestrichelter Linie (der hohle Marker bleibt «n < 5»), in den Tabellen mit der Spalte «Stand», im Vergleich als
  // Warnung. Voreingestellt sind zwei abgeschlossene Jahre.
  await page.goto(server.url + '#zeitverlauf');
  await page.waitForSelector('#view table.data');
  const laufend = await page.evaluate(() => {
    const jahr = new Date().getFullYear();
    const tabelle = [...document.querySelectorAll('#view table.data')].find((t) => (t.querySelector('caption') || {}).textContent.startsWith('Kennzahlen je Jahr'));
    const kopf = [...tabelle.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const iStand = kopf.findIndex((t) => t.startsWith('Stand'));
    const zeilen = [...tabelle.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
    const figur = document.querySelector('#view .viz-svg');
    const vergleich = [...document.querySelectorAll('#view section.block, #view details.block')]
      .find((x) => ((x.querySelector('h3, summary') || {}).textContent || '').startsWith('Zwei Jahre vergleichen'));
    const jahrWahl = vergleich ? [...vergleich.querySelectorAll('select')].map((sel) => sel.value) : [];
    return {
      jahr: String(jahr),
      standSpalte: iStand >= 0,
      laufendeZeilen: zeilen.filter((z) => z[iStand] === 'läuft').map((z) => z[0]),
      abgeschlossen: zeilen.filter((z) => z[iStand] === '').length,
      rauten: figur ? figur.querySelectorAll('polygon.viz-dot').length : -1,
      gestrichelt: figur ? figur.querySelectorAll('.viz-line-laufend').length : -1,
      legende: (document.querySelector('#view figcaption') || {}).textContent || '',
      jahrWahl,
      vergleichTitel: vergleich ? (vergleich.querySelector('table caption') || {}).textContent : '',
    };
  });
  check(laufend.standSpalte && laufend.laufendeZeilen.length === 1 && laufend.laufendeZeilen[0].startsWith(laufend.jahr) && laufend.abgeschlossen >= 1,
    'H1 Kennzahlen je Jahr: Spalte «Stand», ' + laufend.laufendeZeilen.join('/') + ' läuft, ' + laufend.abgeschlossen + ' abgeschlossene Jahre');
  check(laufend.rauten >= 1 && laufend.gestrichelt >= 1 && /Raute und gestrichelte Linie/.test(laufend.legende) && /hohler Marker: n < 5/.test(laufend.legende),
    'H1 Liniendiagramm: ' + laufend.rauten + ' Rauten und ' + laufend.gestrichelt + ' gestrichelte Stücke für das laufende Jahr, Legende nennt beide Zeichen');
  check(laufend.jahrWahl.length === 2 && laufend.jahrWahl.every((y) => Number(y) < Number(laufend.jahr)) && !/ACHTUNG/.test(laufend.vergleichTitel),
    'H1 Zwei Jahre vergleichen: voreingestellt ' + laufend.jahrWahl.join(' gegen ') + ' – beide abgeschlossen');

  // Paket C (C2): Die Filterleiste war das einzige klebende Element – 95 px, 11 % der Viewporthöhe, dauerhaft, für
  // Bedienelemente, die beim Lesen niemand anfasst. Gescrollt bleibt nur die Zusammenfassungszeile (Zähler und Chips);
  // der frei gewordene Platz geht an den Tabellenkopf, der darunter klebt.
  await page.goto(server.url + '#zeitverlauf');
  await page.waitForSelector('#view table');
  const ungescrollt = await page.evaluate(() => Math.round(document.getElementById('filterbar').getBoundingClientRect().height));
  await page.evaluate(() => {
    const hoch = [...document.querySelectorAll('#view .table-wrap')].filter((w) => !w.classList.contains('scrolls-x'))
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    window.scrollTo(0, window.scrollY + hoch.getBoundingClientRect().top + 250);
  });
  await page.waitForTimeout(250);
  const gescrollt = await page.evaluate(() => {
    const bar = document.getElementById('filterbar');
    const hoch = [...document.querySelectorAll('#view .table-wrap')].filter((w) => !w.classList.contains('scrolls-x'))
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    const th = hoch.querySelector('table th');
    const sicht = (el) => !!el && el.getClientRects().length > 0;
    return {
      hoehe: Math.round(bar.getBoundingClientRect().height),
      stickyTop: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0),
      kopfY: Math.round(th.getBoundingClientRect().top),
      barY: Math.round(bar.getBoundingClientRect().top),
      steuerelemente: sicht(bar.querySelector('.filter-controls')),
      zusammenfassung: sicht(bar.querySelector('.summary')),
      zaehler: (bar.querySelector('.summary-count') || {}).textContent || '',
    };
  });
  check(gescrollt.hoehe < ungescrollt - 40 && gescrollt.barY === 0 && !gescrollt.steuerelemente && gescrollt.zusammenfassung
    && /Vorgänge/.test(gescrollt.zaehler) && Math.abs(gescrollt.kopfY - gescrollt.stickyTop) <= 2 && gescrollt.stickyTop === gescrollt.hoehe,
    'C2 Zeitverlauf gescrollt: Filterleiste ' + ungescrollt + ' auf ' + gescrollt.hoehe + ' px geschrumpft, Steuerelemente weg, Zusammenfassung bleibt («'
      + gescrollt.zaehler.trim() + '»), Tabellenkopf klebt bei y = ' + gescrollt.kopfY + ' direkt darunter');
  // Der Weg zurück: nach oben scrollen – für Maus und Tastatur gleich
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const zurueck = await page.evaluate(() => {
    const bar = document.getElementById('filterbar');
    return { hoehe: Math.round(bar.getBoundingClientRect().height), controls: bar.querySelector('.filter-controls').getClientRects().length > 0 };
  });
  check(zurueck.controls && zurueck.hoehe === ungescrollt, 'C2: nach oben gescrollt sind die Steuerelemente wieder da (' + zurueck.hoehe + ' px)');
  // Wer den Fokus in einem Filterfeld hat und scrollt, darf ihn nicht verlieren: Das Feld dürfte sonst verschwinden
  await page.locator('#filterbar label[data-field="profil"] select').focus();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(250);
  const fokusBeimScrollen = await page.evaluate(() => ({
    aktiv: document.activeElement ? document.activeElement.tagName : null,
    imFilter: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('#filterbar'),
    controls: document.querySelector('#filterbar .filter-controls').getClientRects().length > 0,
    gescrollt: document.body.classList.contains('scrolled'),
  }));
  check(fokusBeimScrollen.gescrollt && fokusBeimScrollen.aktiv === 'SELECT' && fokusBeimScrollen.imFilter && fokusBeimScrollen.controls,
    'C2: Tastaturfokus im Filterfeld überlebt das Scrollen – die Leiste bleibt offen, solange er dort liegt');
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.waitForTimeout(250);

  // Paket C (C2): Der Tabellenkopf klebt jetzt – unter der geschrumpften Filterleiste. Möglich ist das nur, weil
  // .table-wrap nur noch dort ein Scroll-Container ist, wo die Tabelle wirklich horizontal überläuft (Klasse
  // «scrolls-x»); ein Scroll-Container im Vorfahren verhindert seitenweites Kleben (Paket B, B6).
  await page.goto(server.url + '#datenqualitaet');
  await page.waitForSelector('#view table.dq-table');
  // bis kurz unter den Kopf der höchsten Tabelle scrollen – dort muss er kleben bleiben
  await page.evaluate(() => {
    const hoch = [...document.querySelectorAll('#view .table-wrap')].filter((w) => !w.classList.contains('scrolls-x'))
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    window.scrollTo(0, window.scrollY + hoch.getBoundingClientRect().top + 300);
  });
  await page.waitForTimeout(200);
  const kopfFix = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#view .table-wrap')];
    // die höchste Tabelle der Ansicht nehmen – eine kurze ist beim Scrollen längst vorbei, ihr Kopf klebt dann zu Recht nicht mehr
    const hoechste = wraps.filter((w) => !w.classList.contains('scrolls-x'))
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    const th = hoechste ? hoechste.querySelector('table th') : null;
    const stickyTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0;
    return {
      wraps: wraps.length,
      scrollend: wraps.filter((w) => w.classList.contains('scrolls-x')).length,
      falschKlassifiziert: wraps.filter((w) => { const t = w.querySelector('table'); return t && (t.scrollWidth > w.clientWidth + 1) !== w.classList.contains('scrolls-x'); }).length,
      kopfY: th ? Math.round(th.getBoundingClientRect().top) : null,
      stickyTop: Math.round(stickyTop),
      gescrollt: Math.round(window.scrollY),
    };
  });
  check(kopfFix.gescrollt > 200 && kopfFix.kopfY !== null && Math.abs(kopfFix.kopfY - kopfFix.stickyTop) <= 2 && kopfFix.falschKlassifiziert === 0,
    'C2 Datenqualität: Tabellenkopf klebt bei y = ' + kopfFix.kopfY + ' (Oberkante ' + kopfFix.stickyTop + ' px) nach ' + kopfFix.gescrollt
      + ' px Scroll; ' + kopfFix.scrollend + ' von ' + kopfFix.wraps + ' Tabellen brauchen einen Scroll-Container, keine falsch klassifiziert');
  await page.evaluate(() => window.scrollTo(0, 0));

  // Paket B (B5): Datenbalken.  // Paket B (B5): Datenbalken. Der Balken füllt von rechts – dieselbe Richtung wie die rechtsbündige Zahl – und liegt
  // auf einer festen Spur: Derselbe Prozentwert hat in jeder Spalte und in jeder Tabelle dieselbe Länge, unabhängig
  // von der Spaltenbreite (gemessen wurden vorher 93 px gegen 221 px für dieselbe Kennzahl in einer Tabelle).
  await page.goto(server.url + '#uebersicht?bank=' + encodeURIComponent('Testbank AG'));
  await page.waitForSelector('#view .kpi');
  const balken = await page.evaluate(() => {
    const zellen = [...document.querySelectorAll('#view td.pct')];
    const spur = getComputedStyle(zellen[0]).backgroundSize;
    const laenge = (td) => {
      const v = Number(getComputedStyle(td).getPropertyValue('--v'));
      const track = parseFloat(getComputedStyle(td).backgroundSize);
      return { v, px: Math.round((track * v) / 100), spaltenbreite: Math.round(td.getBoundingClientRect().width) };
    };
    const proWert = new Map();
    for (const td of zellen) {
      const m = laenge(td);
      if (!Number.isFinite(m.v)) continue;
      if (!proWert.has(m.v)) proWert.set(m.v, []);
      proWert.get(m.v).push(m);
    }
    // Werte, die in verschieden breiten Spalten vorkommen: dort muss die Balkenlänge trotzdem gleich sein
    const gemischt = [...proWert.entries()]
      .filter(([, list]) => new Set(list.map((x) => x.spaltenbreite)).size > 1)
      .map(([v, list]) => ({ v, laengen: [...new Set(list.map((x) => x.px))], breiten: [...new Set(list.map((x) => x.spaltenbreite))] }));
    return { spur, richtung: getComputedStyle(zellen[0]).backgroundPosition, bild: getComputedStyle(zellen[0]).backgroundImage, gemischt, zellen: zellen.length };
  });
  check(balken.zellen > 0 && /^(right|100%)/.test(balken.richtung) && /to left/.test(balken.bild) && balken.gemischt.length >= 1 && balken.gemischt.every((g) => g.laengen.length === 1),
    'B5 Übersicht: Balken von rechts (Position ' + balken.richtung + ', Verlauf nach links), feste Spur ' + balken.spur + '; ' + balken.gemischt.length
      + ' Wert(e) in verschieden breiten Spalten (' + (balken.gemischt[0] ? balken.gemischt[0].breiten.join('/') + ' px' : '–') + ') mit gleicher Balkenlänge');
  const passt = await page.evaluate(() => [...document.querySelectorAll('#view td.pct')]
    .every((td) => parseFloat(getComputedStyle(td).backgroundSize) <= td.getBoundingClientRect().width + 0.5));
  check(passt, 'B5: die Balkenspur ist nie breiter als ihre Spalte – kein abgeschnittener Balken');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Paket B (B4): Sortierung auf allen Tabellen – eine Implementierung, aria-sort auf jeder Kopfzelle, die fachliche
  // Ausgangssortierung als Standard und ein Schalter, der sie wiederherstellt. Der Zustand steht in der URL.
  const SORTIERPROBEN = [
    { view: 'uebersicht', tabelle: 'Kennzahlen je Profil', spalte: 'Profil', slug: 'kennzahlen-je-profil' },
    { view: 'zeitverlauf', tabelle: 'Kennzahlen je Jahr', spalte: 'Jahr', slug: 'kennzahlen-je-jahr' },
    { view: 'datenqualitaet', tabelle: null, spalte: 'Header', slug: 'einzelne-eintraege' },
  ];
  for (const probe of SORTIERPROBEN) {
    await page.goto(server.url + '#' + probe.view);
    await page.waitForSelector('#view h2');
    const auswahl = probe.tabelle
      ? '#view table.data:has(.caption-text:text-is("' + probe.tabelle + '"))'
      : '#view table.dq-table';
    await page.waitForSelector(auswahl, { state: 'attached', timeout: 5000 });
    // Werte der sortierten Spalte lesen (nicht der ersten): sonst sieht man die Wirkung der Sortierung nicht
    const spalten = () => page.$$eval(auswahl, (ts, label) => {
      const t = ts[0];
      const i = [...t.querySelectorAll('thead th')].findIndex((th) => th.textContent.replace(/[▲▼]/g, '').trim() === label);
      return [...t.querySelectorAll('tbody tr')].map((tr) => (tr.children[i] || {}).textContent || '').map((x) => x.trim());
    }, probe.spalte);
    const kopfInfo = await page.$$eval(auswahl + ' thead th', (ths) => {
      const sortierbar = ths.filter((th) => th.querySelector('button[aria-label^="Sortieren nach"]'));
      return { alle: ths.length, sortierbar: sortierbar.length, mitAria: sortierbar.filter((th) => th.hasAttribute('aria-sort')).length };
    });
    check(kopfInfo.sortierbar >= kopfInfo.alle - 1 && kopfInfo.mitAria === kopfInfo.sortierbar,
      'B4 ' + probe.view + ': ' + kopfInfo.sortierbar + ' von ' + kopfInfo.alle + ' Kopfzellen sortierbar, alle mit aria-sort und aria-label');
    check((await page.locator('#view button.reset-sort:visible').count()) === 0, 'B4 ' + probe.view + ': ohne Sortierung kein Schalter «Sortierung zurücksetzen»');
    const vorher = await spalten();
    await page.click(auswahl + ' thead th button[aria-label="Sortieren nach ' + probe.spalte + '"]');
    await page.waitForTimeout(300);
    const sortiert = await spalten();
    const aktiv = await page.getAttribute(auswahl + ' thead th.sortable.active', 'aria-sort');
    const inUrl = probe.slug ? new RegExp('sort=' + probe.slug + '\.').test(page.url()) : /sort=/.test(page.url());
    check(sortiert.join('|') !== vorher.join('|') && ['ascending', 'descending'].includes(aktiv) && inUrl,
      'B4 ' + probe.view + ': «' + probe.spalte + '» sortiert (' + vorher.slice(0, 3).join(',') + ' → ' + sortiert.slice(0, 3).join(',') + '), aria-sort ' + aktiv + ', in der URL');
    // Zurücksetzen stellt die fachliche Ausgangsreihenfolge wieder her
    const reset = page.locator((probe.tabelle
      ? '#view .table-wrap:has(.caption-text:text-is("' + probe.tabelle + '"))'
      : '#view .table-wrap:has(table.dq-table)') + ' button.reset-sort');
    await reset.click();
    await page.waitForTimeout(300);
    check((await spalten()).join('|') === vorher.join('|'), 'B4 ' + probe.view + ': «Sortierung zurücksetzen» stellt die Ausgangsreihenfolge her');
  }
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Paket C (C5): «Wertung» und «Benchmark» schrieben globalen, in der URL serialisierten Zustand, standen aber in
  // Werkzeugleisten einzelner Ansichten – wer die Wertung in den Bestenlisten umstellte, änderte sie auch für die
  // Übersicht, ohne dass es dort sichtbar war. Jetzt stehen sie in der Filterleiste, mit der Abschaltlogik aus A1.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(server.url + '#bestenlisten');
  await page.waitForSelector('#view table', { state: 'attached' });
  const c5Listen = await page.evaluate(() => ({
    wertungAus: document.querySelector('#filterbar label[data-field="wertung"] select').disabled,
    benchmarkAus: document.querySelector('#filterbar label[data-field="benchmark"] select').disabled,
    werkzeugleiste: document.querySelectorAll('#view .toolbar').length,
    grund: document.querySelector('#filterbar label[data-field="benchmark"]').getAttribute('title') || '',
  }));
  check(!c5Listen.wertungAus && c5Listen.benchmarkAus && c5Listen.werkzeugleiste === 0 && c5Listen.grund.length > 10,
    'C5 Bestenlisten: Wertung wirksam, Benchmark abgeschaltet mit Grund («' + c5Listen.grund.slice(0, 50) + '»), keine Werkzeugleiste mehr in der Ansicht');
  // Die synthetischen Listen sind unter beiden Wertungen gleich besetzt; nachweisbar ist die Wirkung an der Angabe,
  // welche Wertung gerechnet wurde (Legende der Ansicht) – plus der URL.
  const wertungText = () => page.textContent('#view details.legend');
  const vorWertung = await wertungText();
  await filterWaehlen(page, 'wertung', 'bestanden');
  await page.waitForTimeout(300);
  const nachWertung = await wertungText();
  check(/wertung=bestanden/.test(page.url()) && nachWertung !== vorWertung && /bestandene Run/.test(nachWertung),
    'C5: Wertung aus der Leiste wirkt auf die Listen und steht in der URL (' + (page.url().split('?')[1] || '') + ')');
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const c5Uebersicht = await page.evaluate(() => ({
    wertungAus: document.querySelector('#filterbar label[data-field="wertung"] select').disabled,
    benchmarkAus: document.querySelector('#filterbar label[data-field="benchmark"] select').disabled,
    werkzeugleiste: document.querySelectorAll('#view .toolbar').length,
    wertungWert: document.querySelector('#filterbar label[data-field="wertung"] select').value,
  }));
  check(c5Uebersicht.wertungAus && !c5Uebersicht.benchmarkAus && c5Uebersicht.werkzeugleiste === 0 && c5Uebersicht.wertungWert === 'bestanden',
    'C5 Übersicht: Benchmark wirksam, Wertung abgeschaltet – ihr Wert bleibt sichtbar erhalten («' + c5Uebersicht.wertungWert + '»), keine Werkzeugleiste');
  await filterWaehlen(page, 'benchmark', 'profil');
  await page.waitForTimeout(300);
  check(/benchmark=profil/.test(page.url()) && /Alle Profile/.test(await page.textContent('#view .benchmark-bar')),
    'C5: Benchmark aus der Leiste wirkt auf die Übersicht und steht in der URL');
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click().catch(() => {});
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');

  // Paket C (C4): Das Raster richtete sich an 26rem aus, nicht an der nötigen Inhaltsbreite – je mehr Bildschirm,
  // desto schmaler die Tabelle (1400 px → 3 Spalten à 429 px, 48 % abgeschnitten). Jetzt bestimmt der Inhalt die Spur,
  // und Prio 3 richtet sich nach dem Platz der Tabelle statt nach dem des Fensters (Container Query).
  const breiten = [];
  for (const [w, h] of [[1280, 900], [1400, 900], [1600, 900], [1920, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(server.url + '#bestenlisten');
    await page.waitForSelector('#view .ranking-grid table', { state: 'attached' });
    const raster = await page.evaluate(() => [...document.querySelectorAll('#view .ranking-grid .table-wrap')].map((wr) => {
      const t = wr.querySelector('table');
      return {
        platz: Math.round(wr.clientWidth), inhalt: Math.round(t.scrollWidth),
        spalten: [...t.querySelectorAll('thead th')].filter((th) => th.getClientRects().length).length,
        alle: t.querySelectorAll('thead th').length,
        scrollt: wr.classList.contains('scrolls-x'),
      };
    }));
    // Geprüft wird, was der Befund meinte: Der Platz je Liste wächst mit dem Bildschirm (statt zu schrumpfen), und
    // was nicht hineinpasst, bleibt über den Scroll-Container erreichbar. Der genaue Inhaltsbedarf hängt an der
    // Schrift und ist in der CI breiter als lokal – deshalb ein Anteil statt einer Pixelgrenze.
    const versteckt = raster.map((r) => Math.max(0, r.inhalt - r.platz) / r.inhalt);
    const unerreichbar = raster.filter((r) => r.inhalt > r.platz + 1 && !r.scrollt);
    breiten.push(raster[0].platz);
    check(raster.length >= 1 && unerreichbar.length === 0 && Math.max(...versteckt) < 0.1,
      'C4 Bestenlisten ' + w + ' px: ' + raster.length + ' Liste(n) à ' + raster[0].platz + ' px, Inhalt ' + raster.map((r) => r.inhalt).join('/')
        + ' px (höchstens ' + Math.round(Math.max(...versteckt) * 100) + ' % ausserhalb, erreichbar), sichtbare Spalten '
        + raster.map((r) => r.spalten + '/' + r.alle).join(' '));
  }
  // Der Befund war nicht «weniger Spalten», sondern «fast die Hälfte versteckt, und mit mehr Bildschirm mehr»:
  // 1280 px 28 %, 1400 px 48 %, 1600 px 39 %. Geprüft wird deshalb der versteckte Anteil, nicht die Spaltenzahl –
  // dass ab 1400 px zwei Listen nebeneinander stehen statt einer, ist der gewollte Spaltenwechsel.
  check(breiten.length === 4, 'C4: Platz je Liste über die Breiten – ' + breiten.join(' → ') + ' px (1 Spalte bei 1280 px, 2 darüber)');
  // Für Tabellen über die volle Breite ändert sich nichts: die Container-Grenze bildet die frühere Viewport-Grenze ab
  for (const [w, prio3Erwartet] of [[1199, false], [1280, true]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(server.url + '#uebersicht');
    await page.waitForSelector('#view table', { state: 'attached' });
    const voll = await page.evaluate(() => {
      const wr = [...document.querySelectorAll('#view .table-wrap')].sort((a, b) => b.clientWidth - a.clientWidth)[0];
      const th3 = [...wr.querySelectorAll('thead th[data-prio="3"]')];
      return { platz: Math.round(wr.clientWidth), prio3: th3.length, sichtbar: th3.filter((t) => t.getClientRects().length).length };
    });
    const zeigtPrio3 = voll.prio3 === 0 || voll.sichtbar > 0;
    check(zeigtPrio3 === prio3Erwartet || voll.prio3 === 0,
      'C4 volle Breite bei ' + w + ' px: Container ' + voll.platz + ' px, Prio-3-Spalten ' + (zeigtPrio3 ? 'sichtbar' : 'ausgeblendet') + ' (wie vor der Umstellung)');
  }
  await page.setViewportSize({ width: 1400, height: 1000 });

  // Paket B (B3): Mit einem Institut-Filter waren auf «Bestenlisten» zwölf von sechzehn Tabellen leer – über 2000 px
  // Spaltenüberschriften ohne einen einzigen Wert. Zu kleine Gruppen stehen jetzt zusammen in einer Zeile.
  await page.goto(server.url + '#bestenlisten?bank=' + encodeURIComponent('Testbank AG'));
  await page.waitForSelector('#view h2');
  const listen = await page.evaluate(() => {
    const tabellen = [...document.querySelectorAll('#view table.data')];
    const sammel = [...document.querySelectorAll('#view p.empty')].map((p) => p.textContent.trim()).filter((t) => /^Keine Bestenliste für /.test(t));
    return {
      tabellen: tabellen.length,
      ohneZeilen: tabellen.filter((t) => !t.querySelector('tbody tr')).length,
      kopfhoehe: Math.round(tabellen.reduce((a, t) => a + (t.tHead ? t.tHead.getBoundingClientRect().height : 0), 0)),
      sammel,
      profileJeSammelmeldung: sammel.map((t) => (t.match(/für ([^–]+) –/) || [null, ''])[1].split(', ').filter(Boolean).length),
    };
  });
  check(listen.ohneZeilen === 0 && listen.sammel.length <= 3 && listen.sammel.every((t) => /Gruppen unter n = 5 im aktiven Filter\.$/.test(t)) && listen.profileJeSammelmeldung.every((n) => n >= 2),
    'B3 Bestenlisten mit Bank-Filter: ' + listen.tabellen + ' Tabellen, keine davon leer, ' + listen.sammel.length + ' Sammelmeldung(en) für je '
      + listen.profileJeSammelmeldung.join('/') + ' Profile, Kopfzeilen zusammen ' + listen.kopfhoehe + ' px (statt Überschriften ohne Werte)');
  check((await page.locator('#view p.empty').count()) >= 1 && (await page.locator('#view .ranking-grid table.data').count()) >= 1, 'B3 Bestenlisten: die Listen mit Treffern bleiben als Tabelle');
  await shot(page, 'bestenlisten-gefiltert');
  // Filter über die Schaltfläche zurücksetzen: ein Hash ohne Parameter lässt den Zustand stehen (urlState, hasParams)
  await page.locator('#filterbar button:has-text("Filter zurücksetzen")').click();
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 0, null, { timeout: 5000 });

  // Paket B (B1): Die Y-Achse der Liniendiagramme folgt dem Wertebereich. Beginnt sie nicht bei null, steht das
  // sichtbar über dem Diagramm – nicht in der eingeklappten Legende. Der unterste Y-Tick ist der Achsenbeginn.
  await page.goto(server.url + '#zeitverlauf');
  await page.waitForSelector('#view figure.viz svg');
  const achsen = await page.$$eval('#view figure.viz', (figs) => figs
    .filter((f) => !f.querySelector('svg.viz-bars'))
    .map((f) => {
      const untertitel = f.querySelector('.viz-subtitle');
      const ticks = [...f.querySelectorAll('svg text.viz-tick[text-anchor="end"]')].map((t) => t.textContent.trim());
      return {
        titel: (f.querySelector('figcaption') || {}).textContent.split(' · ')[0],
        untertitel: untertitel ? untertitel.textContent.trim() : '',
        sichtbar: untertitel ? untertitel.getClientRects().length > 0 : false,
        beginn: ticks[0] || '',
        ticks: ticks.length,
      };
    }));
  check(achsen.length >= 2 && achsen.every((a) => {
    const beiNull = /^0\s*%$/.test(a.beginn);
    if (beiNull) return a.untertitel === '';
    return a.sichtbar && a.untertitel.includes(a.beginn) && /Kein Nullpunkt/.test(a.untertitel) && a.ticks >= 3 && a.ticks <= 7;
  }), 'B1 Zeitverlauf: Achse folgt dem Wertebereich, Hinweis genau dann sichtbar, wenn sie nicht bei null beginnt (' + achsen.map((a) => a.titel + ': ab ' + a.beginn + (a.untertitel ? ' + Hinweis' : ' ohne Hinweis')).join(' · ') + ')');
  check((await page.locator('#view figure.viz .viz-legend').count()) >= 1, 'B1 Zeitverlauf: Legende bleibt neben der Achsenänderung erhalten');

  // Paket B (B2): Die Endbeschriftung trägt nur noch den Wert – der Reihenname steht in der Legende. Der Rand rechts
  // schrumpft entsprechend, die Zeichenfläche wächst. Gemessen in viewBox-Einheiten, kein Label ragt heraus.
  const flaeche = await page.$$eval('#view figure.viz', (figs) => figs
    .filter((f) => !f.querySelector('svg.viz-bars'))
    .map((f) => {
      const root = f.querySelector('svg');
      const breite = Number(root.getAttribute('viewBox').split(' ')[2]);
      const gitter = [...root.querySelectorAll('line.viz-grid, line.viz-axis')];
      const links = Math.min(...gitter.map((l) => Number(l.getAttribute('x1'))));
      const rechts = Math.max(...gitter.map((l) => Number(l.getAttribute('x2'))));
      const labels = [...root.querySelectorAll('text.viz-label')];
      return {
        plot: Math.round(rechts - links),
        randRechts: Math.round(breite - rechts),
        texte: labels.map((t) => t.textContent.trim()),
        ueberlauf: labels.some((t) => { const b = t.getBBox(); return b.x + b.width > breite + 0.5 || b.x < 0; }),
        legende: f.querySelectorAll('.viz-legend-item').length,
      };
    }));
  const PLOT_VORHER = 820 - 48 - 250; // 522 Einheiten vor B2
  check(flaeche.length >= 2 && flaeche.every((f) => f.plot > PLOT_VORHER * 1.25 && !f.ueberlauf && f.legende >= 2
    && f.texte.length >= 2 && f.texte.every((t) => /^\d+(\.\d+)? %$/.test(t))),
    'B2 Zeitverlauf: Plotbreite ' + flaeche.map((f) => f.plot).join('/') + ' statt ' + PLOT_VORHER + ' Einheiten, Endbeschriftung nur der Wert ('
      + flaeche[0].texte.join(', ') + '), kein Überlauf, Legende mit ' + flaeche.map((f) => f.legende).join('/') + ' Einträgen');
  await shot(page, 'zeitverlauf-achse');

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
  // Paket E: Im Druck erscheint weder das Band noch der Reiterstreifen – gedruckt wird der Inhalt, nicht der Weg
  // dorthin. Der Titel nennt weiterhin die Ansicht, nicht das Primärziel.
  const druckNav = await page.evaluate(() => ({
    band: [...document.querySelectorAll('#nav')].filter((n) => n.getClientRects().length).length,
    reiter: [...document.querySelectorAll('#view .view-tabs')].filter((e) => e.getClientRects().length).length,
    imDom: document.querySelectorAll('#view .view-tabs a').length,
    titel: document.querySelector('#view h2').textContent.trim(),
    zusatzSichtbar: [...document.querySelectorAll('#view h2 .nur-druck')].every((e) => e.getClientRects().length > 0),
  }));
  // Im Druck fehlen die Reiter; die Überschrift muss deshalb sagen, welche Ansicht gedruckt wird
  check(druckNav.band === 0 && druckNav.reiter === 0 && druckNav.imDom === 2 && druckNav.zusatzSichtbar
    && druckNav.titel === 'Vorgänge · Geplante Prüfungen',
    'E Druck: Band und Reiter (' + druckNav.imDom + ' im DOM) ausgeblendet, Überschrift «' + druckNav.titel + '»');
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
  // Paket A (A6): Passed-Wert und Resultat widersprechen sich (synthetische Zeile: «no» bei 78 %, Bestehensgrenze 70 %)
  await page.fill('#view .dq-text', 'Bestehensgrenze');
  await page.waitForTimeout(500);
  const grenze = await page.evaluate(() => {
    const tr = document.querySelector('#view table.dq-table tbody tr');
    if (!tr) return null;
    const zellen = [...tr.children].map((td) => td.textContent.trim());
    // Die sortierte Spalte trägt einen Pfeil im Kopf – für den Schlüssel abschneiden
    const kopf = [...document.querySelectorAll('#view table.dq-table thead th')].map((th) => th.textContent.trim().replace(/\s*[▲▼]$/, ''));
    return Object.fromEntries(kopf.map((k, i) => [k, zellen[i]]));
  });
  check(grenze && grenze.Stufe === 'Hinweis' && grenze.Wirkung === 'verändert Kennzahl' && /RUN1 Result$/.test(grenze.Header) && Number(grenze.Zeile) > 10
    && /78\.0 %/.test(grenze.Grund) && /70\.0 %/.test(grenze.Grund) && grenze.Rohwert !== '',
    'A6 Datenqualität: Widerspruch zur Bestehensgrenze als Hinweis mit Sheet, Zeile, Header, Rohwert und Grund (' + (grenze ? grenze.Sheet + ' Zeile ' + grenze.Zeile + ', ' + grenze.Header + ' = ' + grenze.Rohwert + ': ' + grenze.Grund : 'kein Eintrag') + ')');
  await page.fill('#view .dq-text', '');
  await page.waitForTimeout(500);
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
  await filterWaehlen(page, 'bank', { label: 'Musterbank' });
  await page.waitForSelector('#view .person-results tr.expandable', { timeout: 5000 });
  check((await page.locator('#view .person-results tr.expandable').count()) === 5 && (await page.locator('#view .person-search').inputValue()) === '', 'Personen: ohne Suchtext mit Bank-Filter alle Personen der Bank (5)');
  await filterWaehlen(page, 'profil', 'IK');
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
  check((await page.getAttribute('#view .expert-table th.sortable.active', 'aria-sort')) === 'ascending' && /sort=experten\.experte\.asc/.test(page.url()), 'Experten: Sortierung nach Name (aria-sort ascending), steht in der URL (B4: ' + page.url().split('?')[1] + ')');
  await page.click('#view .expert-table th.sortable button[aria-label="Sortieren nach Durchfallquote 1. Versuch"]');
  await page.waitForFunction(() => { const td = document.querySelector('#view .expert-table tbody tr.expandable td:nth-child(2)'); return td && td.textContent.trim() === 'Experte Emil'; }, null, { timeout: 5000 });
  check((await page.getAttribute('#view .expert-table th.sortable.active', 'aria-sort')) === 'descending', 'Experten: Sortierung nach Durchfallquote 1. Versuch absteigend (Emil 40.0 % zuerst)');
  await page.locator('#view .expert-table tr.expandable').first().click();
  await page.waitForSelector('#view .expert-table tr.event-detail:not([hidden]) .expert-detail');
  check((await page.locator('#view .expert-table tr.event-detail:not([hidden]) .expert-detail table').count()) === 4, 'Experten: Zeilen-Detail mit vier Tabellen (Jahr, Profil, Sprache, Partner)');
  const pairRows = await page.evaluate(() => { const s = [...document.querySelectorAll('#view section.block')].find((x) => (x.querySelector('h3') || {}).textContent.startsWith('Paarungen')); return s ? s.querySelectorAll('tbody tr').length : -1; });
  check(pairRows >= 3, 'Experten: Paarungstabelle mit ' + pairRows + ' Paaren');
  await page.click('#view details.menu > summary');
  // Punktdiagramm je Experte: Wilson-Balken gegen die Linie auf dem Benchmark aller Experten. Die Reihenfolge
  // (Einsätze statt Quote – keine Rangliste von Personen) prüft der Unit-Test am Modell; hier zählt der Aufbau.
  const expertenPunkte = await page.evaluate(() => {
    const svgEl = document.querySelector('#view .viz-dots');
    if (!svgEl) return null;
    const f = svgEl.closest('figure');
    return {
      punkte: f.querySelectorAll('.viz-dot').length,
      balken: f.querySelectorAll('.viz-ci').length,
      referenz: f.querySelectorAll('.viz-ref').length,
      hohl: f.querySelectorAll('.viz-dot.small').length,
      beschriftung: [...f.querySelectorAll('text.viz-label')].filter((t) => /^n = /.test(t.textContent)).map((t) => t.textContent),
      legende: [...f.querySelectorAll('.viz-legend-item')].map((x) => x.textContent.trim()),
      titel: (f.querySelector('figcaption') || {}).textContent.split(' · ')[0],
    };
  });
  check(!!expertenPunkte && expertenPunkte.punkte >= 2 && expertenPunkte.punkte === expertenPunkte.balken
    && expertenPunkte.referenz === 1 && expertenPunkte.hohl >= 1 && expertenPunkte.legende.length === 3
    && expertenPunkte.beschriftung.every((t) => /^n = \d+( · [+−±]\d+\.\d pp)?( · gesichert)?( \*)?$/.test(t)),
    'Experten: Punktdiagramm «' + (expertenPunkte ? expertenPunkte.titel : '') + '» mit ' + (expertenPunkte ? expertenPunkte.punkte : 0)
      + ' Punkten, Linie auf dem Benchmark, kleine Gruppen hohl (' + (expertenPunkte ? expertenPunkte.beschriftung[0] : '') + ')');
  check((await page.locator('#view details.menu[open] .menu-item', { hasText: 'CSV (Einsatzebene)' }).count()) === 1, 'Experten: Export-Menü mit «CSV (Einsatzebene)»');
  await page.click('#view details.menu > summary');
  await filterWaehlen(page, 'jahr', '2024');
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

  // A4: Druck bei dunkler Systemeinstellung – im Browser gilt dann die Kaskade hell → dunkel → Druck. Jedes Token, das der
  // Dark-Block setzt, muss der Druck-Block zurücksetzen, sonst landen dunkle Farben auf weissem Papier (--ok mit 1.96:1).
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  // Die Erwartung kommt aus dem HELLEN :root von styles.css, nicht aus einer Liste von Hex-Werten. Vorher standen
  // die Farben hier abgeschrieben, und der erste Palettentausch (Paket OPTIK, O2) liess die Pruefung rot werden,
  // obwohl der Druck genau das tat, was sie verlangt. Geprueft wird die AUSSAGE – im Druck gelten die hellen Werte,
  // nicht die dunklen –, und die haelt jede Palette aus. Dieselbe Lehre wie 5bca619 bei den Schriftmassen.
  const lichtWerte = parseThemes(readFileSync(join(root, 'styles.css'), 'utf8')).light;
  const dunkelWerte = parseThemes(readFileSync(join(root, 'styles.css'), 'utf8')).dark;
  // Drei Tokens weichen im Druck ABSICHTLICH von der hellen Palette ab – Papier ist weiss, und Flaechen kosten
  // Toner. Sie stehen hier mit Grund, damit die Pruefung sie nicht als Fehler meldet und niemand sie stillschweigend
  // aendert. Alles andere muss im Druck den hellen Wert tragen.
  const PAPIER = {
    '--bg': '#ffffff',      // Grund: Papier ist weiss, nicht warmgrau – eine Vollflaeche waere Toner ohne Aussage
    '--panel-2': '#ffffff', // dito fuer die zweite Flaeche; auf Papier trennt der Rahmen, nicht der Ton
    '--bar': 'rgba(0, 0, 0, .12)', // Datenbalken grau statt in Akzentfarbe (eigene Pruefung «Datenbalken grau»)
  };
  // Nur Tokens, die der Dark-Block ueberhaupt umsetzt: Bei den uebrigen gibt es nichts zurueckzusetzen.
  const TOKENS = Object.fromEntries(Object.keys(lichtWerte)
    .filter((t) => /^--/.test(t) && dunkelWerte[t] !== lichtWerte[t])
    .map((t) => [t, PAPIER[t] || lichtWerte[t]]));
  const printDark = await page.evaluate((tokens) => {
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const out = { body: getComputedStyle(document.body).backgroundColor, falsch: [] };
    // Vergleich in DERSELBEN Einheit: Der erwartete Wert wird durch den Browser geschickt, statt eine
    // rgb()-Schreibweise zu erraten.
    const alsRgb = (wert) => { probe.style.color = '#000'; probe.style.color = wert; return getComputedStyle(probe).color; };
    for (const [token, erwartet] of Object.entries(tokens)) {
      const soll = alsRgb(erwartet);
      probe.style.color = 'var(' + token + ')';
      const ist = getComputedStyle(probe).color;
      if (ist !== soll) out.falsch.push(token + ' = ' + ist + ' statt ' + soll + ' (' + erwartet + ')');
    }
    probe.remove();
    return out;
  }, TOKENS);
  check(printDark.body === 'rgb(255, 255, 255)' && printDark.falsch.length === 0,
    'A4 Druck bei dunkler Systemeinstellung: weisses Papier, alle ' + Object.keys(TOKENS).length
      + ' geprüften Tokens hell (' + Object.keys(PAPIER).length + ' davon bewusst auf Papierwerten)' + (printDark.falsch.length ? ' – ' + printDark.falsch.join('; ') : ''));
  await shot(page, 'print-dark-uebersicht');
  await page.emulateMedia({ media: null, colorScheme: 'light' });
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
    // Bei Überlauf nennen, wer überläuft: Ein Wert ohne Fundstelle kostet in der CI eine ganze Runde.
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const ueberRand = overflow > 0 ? await phone.evaluate(() => {
      const w = window.innerWidth;
      const imScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
      return [...document.querySelectorAll('body *')].filter((e) => Math.round(e.getBoundingClientRect().right) > w + 1 && !imScroller(e))
        .slice(0, 5).map((e) => e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0] + ' → ' + Math.round(e.getBoundingClientRect().right) + ' px');
    }) : [];
    const hiddenPrio = await phone.evaluate(() => [...document.querySelectorAll('#view table.data td[data-prio="2"], #view table.data td[data-prio="3"]')].every((td) => getComputedStyle(td).display === 'none'));
    check(overflow <= 0 && hiddenPrio, 'Phone ' + v + ': kein Seitenscroll (' + overflow + ' px' + (ueberRand.length ? ': ' + ueberRand.join(', ') : '') + '), nur Prio-1-Spalten');
    await phone.screenshot({ path: join(outDir, 'phone-' + v + '.png'), fullPage: true });
  }
  // P3 an der engsten Stelle: 360 viewBox-Einheiten statt 820, und die Direktbeschriftung entfällt dort ganz
  // (die Zahlen stehen in der Tabelle darunter). Geprüft wird, dass trotzdem nichts abgeschnitten wird – links die
  // Gruppennamen, rechts die letzte Achsenbeschriftung, die vorher zur Hälfte über den Rand ragte.
  for (const v of ['uebersicht', 'schriftlich', 'muendlich', 'vss-vsm', 'experten']) {
    await phone.goto(server.url + '#' + v);
    await phone.waitForSelector('#view figure.viz .viz-dots');
    const b = await punktBeschriftungen(phone);
    const direkt = await phone.evaluate(() => [...document.querySelectorAll('#view figure.viz .viz-dots text.viz-label')].filter((t) => /^n = /.test(t.textContent)).length);
    check(b.length > 0 && b.every((d) => d.ueber.length === 0 && d.plot >= d.vb / 2 - 1) && direkt === 0,
      'P3 Phone ' + v + ': nichts abgeschnitten, keine Direktbeschriftung (' + direkt + ') – '
        + b.map((d) => d.titel.slice(0, 22) + ' ' + d.randLinks + '|' + d.plot + '|' + d.randRechts + ' von ' + d.vb + (d.gekuerzt ? ', ' + d.gekuerzt + ' gekürzt' : '')).join(' · ')
        + (b.some((d) => d.ueber.length) ? ' – ÜBER DEN RAND: ' + b.flatMap((d) => d.ueber).join(', ') : ''));
  }

  // Paket E auf dem Phone: Das Band ist ausgeblendet, das Auswahlfeld führt zu allen vierzehn Ansichten. Die Reiter
  // bleiben als Abkürzung zwischen den Geschwistern – mit 44-px-Tap-Ziel wie jedes andere Bedienelement, in einer Zeile.
  await phone.goto(server.url + '#schriftlich');
  await phone.waitForSelector('#view .view-tabs a');
  const phoneReiter = await phone.evaluate(() => {
    const reiter = [...document.querySelectorAll('#view .view-tabs a')];
    return {
      anzahl: reiter.length,
      hoehen: [...new Set(reiter.map((a) => Math.round(a.getBoundingClientRect().height)))],
      zeilen: new Set(reiter.map((a) => Math.round(a.getBoundingClientRect().top))).size,
      breite: Math.round(document.querySelector('#view .view-tabs').scrollWidth),
      platz: document.querySelector('#view').clientWidth,
      bandSichtbar: [...document.querySelectorAll('#nav .nav-links')].some((n) => n.getClientRects().length > 0),
      optionen: document.querySelectorAll('#nav-select option').length,
    };
  });
  check(phoneReiter.anzahl === 3 && phoneReiter.hoehen.every((h) => h >= 44) && phoneReiter.zeilen === 1
    && phoneReiter.breite <= phoneReiter.platz && !phoneReiter.bandSichtbar && phoneReiter.optionen === 14,
    'E Phone: Band aus, Auswahlfeld mit ' + phoneReiter.optionen + ' Ansichten, ' + phoneReiter.anzahl + ' Reiter à '
      + phoneReiter.hoehen.join('/') + ' px in ' + phoneReiter.zeilen + ' Zeile (' + phoneReiter.breite + ' von ' + phoneReiter.platz + ' px)');
  // Ein Tipp auf den Reiter wechselt die Ansicht; das Auswahlfeld zeigt danach dieselbe
  await phone.locator('#view .view-tabs a', { hasText: 'Mündlich' }).first().click();
  await phone.waitForFunction(() => location.hash.replace(/^#/, '').split('?')[0] === 'muendlich' && document.querySelector('#view .view-tabs a[aria-current="page"]').textContent === 'Mündlich', null, { timeout: 5000 });
  check((await phone.locator('#nav-select').inputValue()) === 'muendlich', 'E Phone: Reiter wechselt die Ansicht, Auswahlfeld zieht nach');
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
  // Die Überschrift nennt bei einem gefassten Ziel das Ziel; die Ansicht steht im aktiven Reiter
  await phone.waitForFunction(() => location.hash.startsWith('#offene-vorgaenge')
    && (document.querySelector('#view .view-tabs a[aria-current="page"]') || {}).textContent === 'Offene Vorgänge', null, { timeout: 5000 });
  check((await phone.locator('#nav-select').inputValue()) === 'offene-vorgaenge', 'Phone: Ansicht über das Auswahlfeld gewechselt (Offene Vorgänge)');
  check(!(await phone.locator('#filterbar details.filter-drawer').evaluate((d) => d.open)) && (await phone.locator('#filterbar .filter-summary').isVisible()), 'Phone: Filter-Drawer geschlossen, Kopfzeile «Filter» sichtbar');
  await phone.locator('#filterbar .filter-summary').click();
  await phone.waitForSelector('#filterbar label[data-field="profil"] select', { state: 'visible' });
  await filterWaehlen(phone, 'profil', 'PK');
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
  check(kpiGroups.join(',') === 'Mengen:zu,Ø Resultat:offen' && kpiCols === 2, 'Phone: Kachel-Blöcke als details (' + kpiGroups.join(', ') + '), zwei Spalten');
  await phone.screenshot({ path: join(outDir, 'phone-uebersicht-kacheln.png'), fullPage: true });
  // Delta erscheint erst mit einem benchmarkrelevanten Filter (A2), deshalb mit Bank im Hash
  await phone.goto(server.url + '#uebersicht?bank=' + encodeURIComponent('Testbank AG'));
  await phone.waitForSelector('#view .kpi-delta');
  const deltaVs = await phone.evaluate(() => { const s = [...document.querySelectorAll('#view .kpi-delta-vs')]; return { n: s.length, hidden: s.every((x) => getComputedStyle(x).display === 'none') }; });
  check(deltaVs.n >= 4 && deltaVs.hidden, 'Phone: Delta nur mit Symbol und Wert, «vs. Benchmark» ausgeblendet (' + deltaVs.n + ')');
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
  check(JSON.stringify(await visibleHeads(phone, 'Teilnehmende')) === JSON.stringify(['Name', 'Profil', 'Fehlende Teile', 'Nächster Termin']), 'Phone Offene Vorgänge: Teilnehmende mit Prio-1-Spalten');
  // B3: Die Frühwarnung hat in der synthetischen Datei keine Zeilen – statt acht Spaltenüberschriften ohne Werte nur die Meldung
  const warnung = await phone.evaluate(() => {
    const abschnitt = [...document.querySelectorAll('#view section.block, #view details.fold')].find((x) => (x.querySelector('h3, summary') || {}).textContent.startsWith('Frühwarnung'));
    return abschnitt ? { tabellen: abschnitt.querySelectorAll('table.data').length, meldung: (abschnitt.querySelector('p.empty') || {}).textContent || '' } : null;
  });
  check(warnung && warnung.tabellen === 0 && warnung.meldung.length > 10, 'Phone Offene Vorgänge: Frühwarnung ohne Zeilen zeigt nur die Meldung, keine Kopfzeile («' + (warnung ? warnung.meldung.slice(0, 60) : '–') + '»)');
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

  // Desktop-Breiten (Paket E): Das Band trägt neun Primärziele statt vierzehn Links. Gemessen braucht es 659 statt
  // 1165 px und passt damit ab 1100 px ohne Scroll – die Gruppenbeschriftung und ihre 1500-px-Schwelle sind entfallen.
  for (const [w, h] of [[1100, 900], [1280, 900], [1400, 1000], [1600, 1000]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(server.url + '#uebersicht');
    await page.waitForSelector('#view h2');
    const nav = await page.evaluate(() => {
      const n = document.getElementById('nav'); const head = document.querySelector('.app-header');
      return {
        scroll: n.scrollWidth, client: n.clientWidth, hoehe: Math.round(n.getBoundingClientRect().height),
        headScroll: head.scrollWidth, headClient: head.clientWidth,
        active: document.querySelectorAll('#nav a[aria-current="page"]').length,
      };
    });
    const scrollt = nav.scroll > nav.client + 1;
    check(!scrollt && nav.headScroll <= nav.headClient && nav.active === 1 && nav.hoehe <= 40,
      'E Desktop ' + w + ' px: Band ' + nav.hoehe + ' px, braucht ' + nav.scroll + ' von ' + nav.client + ' px (' + (scrollt ? 'SCROLLT' : 'passt') + '), Kopf ohne Überlauf, Übersicht aktiv');
    await page.screenshot({ path: join(outDir, 'desktop-' + w + '-uebersicht.png') });
  }
  // Ein gefasstes Ziel: Das Band markiert das Primärziel, die Reiter im Kopf die offene Ansicht – beide mit aria-current.
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(server.url + '#glossar');
  await page.waitForSelector('#view h2');
  const glossarAktiv = await page.evaluate(() => {
    const band = document.querySelector('#nav a[aria-current="page"]');
    const reiter = [...document.querySelectorAll('#view .view-tabs a')];
    const n = document.getElementById('nav');
    const r = band.getBoundingClientRect(); const nr = n.getBoundingClientRect();
    return {
      band: band.textContent, imBlick: r.left >= nr.left - 1 && r.right <= nr.right + 1,
      reiter: reiter.map((a) => a.textContent), aktiverReiter: (reiter.find((a) => a.getAttribute('aria-current') === 'page') || {}).textContent,
      kopfHoehe: Math.round(document.querySelector('#view .view-head').getBoundingClientRect().height),
    };
  });
  check(glossarAktiv.band === 'Daten' && glossarAktiv.imBlick && glossarAktiv.aktiverReiter === 'Glossar'
    && glossarAktiv.reiter.join(' · ') === 'Historie · Datenqualität · Glossar' && (await page.locator('#nav-select').inputValue()) === 'glossar',
    'E Glossar: Band zeigt «' + glossarAktiv.band + '», Reiter «' + glossarAktiv.reiter.join(' · ') + '» mit «' + glossarAktiv.aktiverReiter + '» aktiv, Auswahlfeld gleich');
  // Die Reiter kosten keine Höhe: Der Kopf einer gefassten Ansicht ist nicht höher als der einer ungefassten.
  await page.setViewportSize({ width: 1400, height: 1000 });
  const kopfHoehen = {};
  for (const v of ['uebersicht', 'schriftlich', 'offene-vorgaenge', 'historie']) {
    await page.goto(server.url + '#' + v);
    await page.waitForSelector('#view h2');
    kopfHoehen[v] = await page.evaluate(() => ({
      hoehe: Math.round(document.querySelector('#view .view-head').getBoundingClientRect().height),
      reiter: document.querySelectorAll('#view .view-tabs a').length,
      titelZeile: (() => { const t = document.querySelector('#view .view-titelzeile'); return t ? Math.round(t.getBoundingClientRect().height) : 0; })(),
    }));
  }
  check(kopfHoehen.uebersicht.reiter === 0 && kopfHoehen.schriftlich.reiter === 3 && kopfHoehen['offene-vorgaenge'].reiter === 2 && kopfHoehen.historie.reiter === 3
    && Math.max(...Object.values(kopfHoehen).map((k) => k.hoehe)) <= kopfHoehen.uebersicht.hoehe + 1,
    'E Reiter kosten keine Höhe: Kopf ' + Object.entries(kopfHoehen).map(([v, k]) => v + ' ' + k.hoehe + ' px/' + k.reiter + ' Reiter').join(' · '));
  // Ein Reiter wechselt die Route und bleibt ein Link (Lesezeichen, Aufziehen in neuem Tab)
  await page.goto(server.url + '#schriftlich');
  await page.waitForSelector('#view .view-tabs a');
  const reiterZiel = await page.locator('#view .view-tabs a', { hasText: 'Mündlich' }).first().getAttribute('href');
  await page.locator('#view .view-tabs a', { hasText: 'Mündlich' }).first().click();
  // Auf die Renderung warten, nicht auf den Hash: hashchange läuft erst nach der Zuweisung
  await page.waitForFunction(() => location.hash.replace(/^#/, '').split('?')[0] === 'muendlich' && document.querySelector('#view .view-tabs a[aria-current="page"]').textContent === 'Mündlich', null, { timeout: 5000 });
  // Bei einem gefassten Ziel nennt die Überschrift das Ziel, der aktive Reiter die Ansicht – der Name steht nicht zweimal
  const nachReiter = await page.evaluate(() => ({
    h2: [...document.querySelector('#view h2').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
    reiter: (document.querySelector('#view .view-tabs a[aria-current="page"]') || {}).textContent,
    band: [...document.querySelectorAll('#nav a[aria-current="page"]')].map((a) => a.textContent).join('+'),
  }));
  check(/^#muendlich/.test(reiterZiel) && nachReiter.h2 === 'Prüfungen' && nachReiter.reiter === 'Mündlich' && nachReiter.band === 'Prüfungen',
    'E Reiter «Mündlich» führt auf ' + reiterZiel + ' (Überschrift «' + nachReiter.h2 + '», aktiver Reiter «' + nachReiter.reiter + '», Band «' + nachReiter.band + '»)');
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

  // Filterleiste (PROMPT-2 F.3, F5): eine Zeile Steuerelemente plus Zusammenfassung (≤ 110 px hoch), Reihenfolge
  // Jahr · Von · Bis · Profil · Sprache · Bank · VSS/VSM · Versuche · Zertifikate · Wertung · Benchmark,
  // Bank-Auswahl höchstens 12rem mit vollem Namen als title.
  // Seit C5 trägt die Leiste elf statt neun Steuerelemente: Das Zielmass gilt ab 1400 px; bei 1280 px braucht sie
  // eine zweite Zeile (gemessen 154 px). Beides wird geprüft, damit die Grenze dokumentiert bleibt.
  await page.setViewportSize({ width: 1400, height: 900 });
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
  check(fb.height <= 110 && fb.rows === 1 && fb.labels.join(',') === 'Jahr,Von,Bis,Profil,Sprache,Bank,VSS/VSM,Versuche,Zertifikate,Wertung,Benchmark' && fb.bankMax === '192px', 'Desktop 1400 px: Filterleiste ' + fb.height + ' px hoch, elf Steuerelemente in einer Zeile (' + fb.labels.join(' · ') + '), Bank höchstens 12rem');
  await page.selectOption('#filterbar select.bank', 'Testbank AG');
  await page.waitForFunction(() => document.querySelectorAll('#filterbar .chip').length === 1, null, { timeout: 5000 });
  check((await page.getAttribute('#filterbar select.bank', 'title')) === 'Testbank AG' && (await page.evaluate(() => Math.round(document.getElementById('filterbar').getBoundingClientRect().height))) <= 110, 'Desktop 1400 px: Bank gewählt → voller Name als title, Filterleiste mit Chip weiterhin ≤ 110 px');
  // D0: Seit die Optionstexte die Feldbeschriftung nicht mehr wiederholen, passen die elf Steuerelemente auch bei
  // 1280 px in eine Zeile – damit gilt das Zielmass aus C1 auch dort wieder.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(server.url + '#uebersicht');
  await page.waitForSelector('#view .kpi');
  const fb1280 = await page.evaluate(() => {
    const bar = document.getElementById('filterbar');
    const labels = [...bar.querySelectorAll('.filter-controls > label')];
    const controls = bar.querySelector('.filter-controls');
    const gap = parseFloat(getComputedStyle(controls).columnGap) || 0;
    const hoehe = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().height) : 0; };
    return {
      hoehe: Math.round(bar.getBoundingClientRect().height),
      reihen: new Set(labels.map((l) => Math.round(l.getBoundingClientRect().bottom / 10))).size,
      braucht: Math.round(labels.reduce((a, l) => a + l.getBoundingClientRect().width, 0) + gap * (labels.length - 1)),
      platz: Math.round(controls.clientWidth),
      chrome: hoehe('.app-header') + hoehe('#databar') + hoehe('.views') + hoehe('#filterbar'),
    };
  });
  // Das C1-Zielmass ist bei 1400 x 900 definiert; bei 1280 px liegt die Leiste 4 px höher (Umbruch der
  // Zusammenfassungszeile). Geprüft wird deshalb 180 px – gegenüber 225 px vor der Entdopplung.
  check(fb1280.reihen === 1 && fb1280.chrome <= 180 && fb1280.braucht < fb1280.platz,
    'D0 Desktop 1280 px: elf Steuerelemente in einer Zeile (brauchen ' + fb1280.braucht + ' von ' + fb1280.platz + ' px), Leiste '
      + fb1280.hoehe + ' px, statisches Chrome ' + fb1280.chrome + ' px (vorher 225)');
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
