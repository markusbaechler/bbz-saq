// tests/smoke/bilder.mjs – Screenshots für den Vergleich vorher/nachher (Paket OPTIK, O5).
// Drei Ansichten, je hell und dunkel. Aufruf: node tests/smoke/bilder.mjs <zielverzeichnis> [praefix]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { startServer } from './server.mjs';
import { writeSynthWorkbook } from './synth.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ziel = resolve(process.argv[2] || join(root, 'tests', 'smoke', 'output'));
const praefix = process.argv[3] || '';
mkdirSync(ziel, { recursive: true });
const server = await startServer(root);
const xlsx = writeSynthWorkbook();
const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM });
const configText = readFileSync(join(root, 'config.js'), 'utf8');
try {
  for (const schema of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, colorScheme: schema });
    await page.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
      body: configText.replace(/features: \{ write: (true|false) \}/, 'features: { write: false }') }));
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.setInputFiles('#file-input', xlsx);
    await page.waitForFunction(() => /Vorgänge/.test(document.getElementById('status').textContent), null, { timeout: 20000 });
    for (const v of ['uebersicht', 'schriftlich', 'bank-report']) {
      await page.goto(server.url + '#uebersicht');
      await page.waitForTimeout(80);
      await page.goto(server.url + '#' + v);
      await page.waitForFunction((x) => location.hash.replace(/^#/, '').split('?')[0] === x && !!document.querySelector('#view h2'), v, { timeout: 8000 });
      if (v === 'bank-report') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('#filterbar label[data-field="bank"] select').selectOption({ label: 'Testbank AG' });
        await page.waitForSelector('#view table.data', { timeout: 8000 });
      }
      await page.waitForTimeout(400);
      const datei = join(ziel, praefix + v + '-' + schema + '.png');
      await page.screenshot({ path: datei, fullPage: true });
      console.log('  ' + datei);
    }
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
