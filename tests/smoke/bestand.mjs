// tests/smoke/bestand.mjs – Messlatte des Funktionsumfangs (Paket OPTIK, O0).
//
// Zweck: Die Zusage «der Funktionsumfang schrumpft nicht» messbar machen, statt sie zu versprechen. Das Skript
// nimmt je Ansicht und global auf, was da ist, und schreibt es als eine Zeile je Merkmal – zeilenweise
// vergleichbar. In O5 läuft es erneut und der Vergleich ist mechanisch.
//
// Aufruf: node tests/smoke/bestand.mjs --write   (Messlatte schreiben: tests/smoke/bestand.txt)
//         node tests/smoke/bestand.mjs           (gegen die Messlatte vergleichen)
//
// Was der Vergleich hart nimmt und was nicht:
//   HART   jede Anzahl. Weniger Tabellen, Zeilen, Diagramme, Messzeilen, Kacheln, Steuerelemente, Exporteinträge,
//          sortierbare Spalten oder «Alle Spalten»-Schalter ist unzulässig – dafür ist die Messlatte da. MEHR ist
//          erlaubt und wird als Zuwachs gemeldet.
//   WEICH  die Höhe. Sie SOLL sich ändern (O4 stellt zwei Spalten nebeneinander); sie wird mit Differenz gemeldet.
//
// Bedingungen der Messung stehen im Kopf der Ausgabe, damit zwei Läufe vergleichbar sind: Breite, Datei, Commit.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { startServer } from './server.mjs';
import { writeSynthWorkbook } from './synth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const messlatte = join(here, 'bestand.txt');
const BREITE = 1400;
const HOEHE = 1000;

// Zahlen, die nicht sinken dürfen. Die Höhe steht bewusst nicht dabei.
const ANZAHLEN = ['tabellen', 'zeilen', 'diagramme', 'messzeilen', 'kacheln', 'sortierbar', 'alleSpalten', 'aufklappbar'];

async function messen() {
  const server = await startServer(root);
  const xlsx = writeSynthWorkbook();
  const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: BREITE, height: HOEHE } });
  // Schreibpfad aus wie im Smoke-Test: Der Bestand soll den Lesestand messen, nicht den Bearbeitungsmodus.
  const configText = readFileSync(join(root, 'config.js'), 'utf8');
  await page.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
    body: configText.replace(/features: \{ write: (true|false) \}/, 'features: { write: false }') }));
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  try {
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.setInputFiles('#file-input', xlsx);
    await page.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 20000 });

    const global = await page.evaluate(() => ({
      ansichten: document.querySelectorAll('#nav-select option').length,
      primaerziele: document.querySelectorAll('#nav .nav-links a').length,
      filter: document.querySelectorAll('#filterbar select, #filterbar input, #filterbar button').length,
    }));
    const ids = await page.evaluate(() => [...document.querySelectorAll('#nav-select option')].map((o) => o.value));

    const ansichten = [];
    for (const id of ids) {
      // Immer erst weg, dann hin: goto auf denselben Hash ist keine Navigation und würde den alten Stand messen.
      await page.goto(server.url + '#uebersicht');
      await page.waitForTimeout(80);
      await page.goto(server.url + '#' + id);
      await page.waitForFunction((v) => location.hash.replace(/^#/, '').split('?')[0] === v && !!document.querySelector('#view h2'), id, { timeout: 8000 });
      await page.waitForTimeout(220);
      // Bank-Report und Personen zeigen ohne Eingabe nur einen Hinweis – der Leerzustand ist nicht ihr Bestand.
      // Gemessen ohne diesen Schritt: beide 757/759 px, null Tabellen; der Bank-Report traegt in Wahrheit
      // Messzeilen und drei Tabellen (Paket H3), die Personenansicht eine Trefferliste mit Detailkarten.
      if (id === 'bank-report') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('#filterbar label[data-field="bank"] select').selectOption({ label: 'Testbank AG' });
        await page.waitForSelector('#view table.data', { timeout: 8000 });
        await page.waitForTimeout(180);
      }
      if (id === 'personen') {
        await page.fill('#view .person-search', 'wechsel');
        await page.waitForSelector('#view .person-results tr.expandable', { timeout: 8000 });
        await page.locator('#view .person-results tr.expandable').first().click();
        await page.waitForSelector('#view tr.event-detail:not([hidden]) .person-detail', { timeout: 8000 });
        await page.waitForTimeout(180);
      }
      // Das Export-Menü muss offen sein, damit seine Einträge zählbar sind
      const menue = page.locator('#view .view-actions details.export-menu summary').first();
      if (await menue.count()) { await menue.click(); await page.waitForTimeout(80); }
      ansichten.push(await page.evaluate((v) => {
        const view = document.querySelector('#view');
        const z = (s) => view.querySelectorAll(s).length;
        return {
          id: v,
          titel: (view.querySelector('h2') || { textContent: '' }).textContent.trim(),
          tabellen: z('table.data'),
          zeilen: [...view.querySelectorAll('table.data tbody tr')].length,
          diagramme: z('figure.viz'),
          messzeilen: z('.messzeile'),
          kacheln: z('.kpi'),
          sortierbar: z('th.sortable'),
          alleSpalten: z('button.all-columns'),
          aufklappbar: z('details.block, tr.expandable'),
          // Seit Paket OPTIK (O4) mitgezählt: Abschnitte des Bestandsbands und Flächen, die einen Mouseover
          // tragen. Die Messlatte aus O0 kennt die zwei Felder nicht – der Vergleich übergeht, was in der alten
          // Zeile fehlt, und ab jetzt sind auch diese zwei gegen Rückschritte geschützt.
          bandteile: z('.bb-teil'),
          hover: z('[title]:not(.info)'),
          export: [...view.querySelectorAll('.view-actions .menu-item')].map((b) => b.textContent.trim()).join('/'),
          hoehe: Math.round(view.getBoundingClientRect().height),
        };
      }, id));
      // Der Bankfilter wirkt auf alle Ansichten – nach der Messung zurueck auf «alle», sonst messen die
      // folgenden Ansichten eine Teilmenge und der Bestand faellt zu klein aus.
      if (id === 'bank-report') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('#filterbar label[data-field="bank"] select').selectOption({ index: 0 });
        await page.waitForTimeout(150);
      }
      if (await menue.count()) await page.evaluate(() => document.querySelectorAll('#view details[open]').forEach((d) => { if (d.classList.contains('export-menu')) d.open = false; }));
    }
    return { global, ansichten, fehler, umgebung: browser.version() + ' auf ' + process.platform };
  } finally {
    await browser.close();
    await server.close();
  }
}

function bericht({ global, ansichten, fehler, umgebung }) {
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { return 'unbekannt'; } })();
  const zeilen = [];
  zeilen.push('# Bestand des Funktionsumfangs – Messlatte für Paket OPTIK (O0/O5)');
  zeilen.push('# Bedingungen: ' + BREITE + ' px · synth.xlsx · Schreibpfad aus · Commit ' + commit);
  // Die Hoehen haengen an den Schriftmetriken: Auf einem anderen Aufbau fallen sie anders aus. Deshalb steht die
  // Umgebung im Kopf – zwei Laeufe sind nur dann Zeile fuer Zeile vergleichbar, wenn diese Zeile uebereinstimmt.
  zeilen.push('# Umgebung: Chromium ' + umgebung + ' (Hoehen sind schriftabhaengig, nur gleiche Umgebung vergleichbar)');
  zeilen.push('# Erzeugt von tests/smoke/bestand.mjs. Anzahlen dürfen nicht sinken; die Höhe darf sich ändern.');
  zeilen.push('');
  zeilen.push('global ansichten=' + global.ansichten + ' primaerziele=' + global.primaerziele + ' filter=' + global.filter);
  const summe = (k) => ansichten.reduce((a, x) => a + x[k], 0);
  zeilen.push('summe tabellen=' + summe('tabellen') + ' zeilen=' + summe('zeilen') + ' diagramme=' + summe('diagramme')
    + ' messzeilen=' + summe('messzeilen') + ' kacheln=' + summe('kacheln') + ' sortierbar=' + summe('sortierbar')
    + ' alleSpalten=' + summe('alleSpalten') + ' aufklappbar=' + summe('aufklappbar')
    + ' bandteile=' + summe('bandteile') + ' hover=' + summe('hover'));
  zeilen.push('');
  for (const a of ansichten) {
    zeilen.push('ansicht ' + a.id + ' tabellen=' + a.tabellen + ' zeilen=' + a.zeilen + ' diagramme=' + a.diagramme
      + ' messzeilen=' + a.messzeilen + ' kacheln=' + a.kacheln + ' sortierbar=' + a.sortierbar
      + ' alleSpalten=' + a.alleSpalten + ' aufklappbar=' + a.aufklappbar
      + ' bandteile=' + a.bandteile + ' hover=' + a.hover + ' hoehe=' + a.hoehe
      + ' export=' + (a.export || '–'));
  }
  if (fehler.length) { zeilen.push(''); zeilen.push('# SEITENFEHLER: ' + fehler.join(' | ')); }
  return zeilen.join('\n') + '\n';
}

// Zeilen mit «schluessel=wert» in ein Objekt je Kennung
export function ausBericht(text) {
  const out = {};
  for (const zeile of String(text || '').split('\n')) {
    if (!zeile || zeile.startsWith('#')) continue;
    const teile = zeile.trim().split(/\s+/);
    const art = teile[0];
    const kennung = /=/.test(teile[1] || '') ? art : art + ' ' + teile[1];
    const werte = {};
    for (const t of teile.slice(/=/.test(teile[1] || '') ? 1 : 2)) {
      const i = t.indexOf('=');
      if (i > 0) werte[t.slice(0, i)] = t.slice(i + 1);
    }
    if (Object.keys(werte).length) out[kennung] = werte;
  }
  return out;
}

// Vergleich: Anzahlen dürfen nicht sinken, die Höhe wird nur gemeldet.
export function vergleiche(vorher, nachher) {
  const a = ausBericht(vorher);
  const b = ausBericht(nachher);
  const gesunken = [];
  const gewachsen = [];
  const hoehen = [];
  const fehlt = [];
  for (const kennung of Object.keys(a)) {
    if (!b[kennung]) { fehlt.push(kennung); continue; }
    for (const k of Object.keys(a[kennung])) {
      const alt = a[kennung][k];
      const neu = b[kennung][k];
      if (k === 'hoehe') {
        if (alt !== neu) hoehen.push(kennung + ': ' + alt + ' → ' + neu + ' px (' + (Number(neu) - Number(alt) > 0 ? '+' : '') + (Number(neu) - Number(alt)) + ')');
        continue;
      }
      if (neu === undefined) { gesunken.push(kennung + ': ' + k + ' fehlt jetzt (war ' + alt + ')'); continue; }
      if (/^\d+$/.test(alt) && /^\d+$/.test(neu)) {
        if (Number(neu) < Number(alt)) gesunken.push(kennung + ': ' + k + ' ' + alt + ' → ' + neu);
        else if (Number(neu) > Number(alt)) gewachsen.push(kennung + ': ' + k + ' ' + alt + ' → ' + neu);
      } else if (alt !== neu) {
        gesunken.push(kennung + ': ' + k + ' «' + alt + '» → «' + neu + '»');
      }
    }
  }
  return { gesunken, gewachsen, hoehen, fehlt };
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/').endsWith('tests/smoke/bestand.mjs')) {
  const text = bericht(await messen());
  if (process.argv.includes('--write')) {
    writeFileSync(messlatte, text);
    process.stdout.write(text);
    console.log('\nMesslatte geschrieben: tests/smoke/bestand.txt');
  } else if (!existsSync(messlatte)) {
    process.stdout.write(text);
    console.error('\nKeine Messlatte vorhanden – zuerst «node tests/smoke/bestand.mjs --write».');
    process.exitCode = 1;
  } else {
    const { gesunken, gewachsen, hoehen, fehlt } = vergleiche(readFileSync(messlatte, 'utf8'), text);
    for (const h of hoehen) console.log('  Höhe   ' + h);
    for (const g of gewachsen) console.log('  mehr   ' + g);
    for (const f of fehlt) console.error('  FEHLT  ' + f);
    for (const g of gesunken) console.error('  WENIGER ' + g);
    console.log((gesunken.length || fehlt.length ? 'Bestand GESCHRUMPFT' : 'Bestand vollständig')
      + ': ' + gesunken.length + ' Rückschritte, ' + fehlt.length + ' fehlende Zeilen, '
      + gewachsen.length + ' Zuwächse, ' + hoehen.length + ' Höhenänderungen');
    process.exitCode = gesunken.length || fehlt.length ? 1 : 0;
  }
}
