import { test, assert, assertEqual } from './runner.js';
import { CONFIG } from '../config.js';
import { NotFoundError } from '../graph.js';
import { normalizeWorkbook } from '../store.js';
import {
  createFileAdapter, parseWorkbook, resolveDriveItem, FileNotFoundError, SheetMissingError, DRIVE_ITEM_SELECT,
} from '../datasource/fileAdapter.js';
import { headerRowFor, cellsFor } from './fixtures.js';
import { write as datasourceWrite } from '../datasource/index.js';

// Bibliotheken: im Browser als Globals (tests.html), in Node über require der lokalen UMD-Builds.
let cachedLibs = null;
async function libs() {
  if (cachedLibs) return cachedLibs;
  if (globalThis.XLSX && globalThis.fflate) {
    cachedLibs = { XLSX: globalThis.XLSX, fflate: globalThis.fflate };
  } else {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    cachedLibs = { XLSX: require('../lib/xlsx.full.min.js'), fflate: require('../lib/fflate.umd.js') };
  }
  return cachedLibs;
}

async function rejects(promise, check) {
  try {
    await promise;
  } catch (e) {
    if (typeof check === 'function' && !check(e)) throw new Error('falscher Fehler: ' + (e && e.message));
    return e;
  }
  throw new Error('Fehler erwartet, keiner geworfen');
}

// Synthetische Zeilen (erfundene Namen)
const ROW1 = {
  lastName: 'Muster', firstName: 'Anna', role: 'Beratung', employer: 'Testbank AG', profil: 'PK', sprache: 'DE',
  weAllPassed: 'yes', oeAllPassed: 'yes', 'we1.passed': 'yes',
  'we1.run1.passed': 'yes', 'we1.run1.date': new Date(2024, 2, 1, 9, 30), 'we1.run1.score': 50, 'we1.run1.result': 0.85,
  'oe1.passed': 'yes', 'oe1.run1.passed': 'yes', 'oe1.run1.date': '20.06.2024 / 10:00', 'oe1.run1.score': 5, 'oe1.run1.result': '90.00%',
};
const ROW2 = { ...ROW1, lastName: 'Beispiel', firstName: 'Beat', 'we1.run1.passed': 'maybe' };
const ROW3 = { ...ROW1, lastName: 'Zertifikat', firstName: 'Zoe', certStart: new Date(2024, 6, 1), certNumber: 'Z-0001' };

// Excel-Datei im Speicher: Zeilen 1–9 Titel/Legende, Header in Zeile 10, Daten ab 11, Threaded Comments auf B{row},
// plus ein drittes Sheet, das ignoriert werden muss.
async function buildWorkbook({ withIssued = true, wide = false } = {}) {
  const { XLSX } = await libs();
  const wb = XLSX.utils.book_new();
  const addSheet = (source, rows, comments) => {
    const header = headerRowFor(source);
    const filler = Array.from({ length: CONFIG.headerRow - 1 }, (_, i) => (i === 0 ? ['Reporting KUBA – Titel'] : (i === 2 ? ['Legende:', 'yes = bestanden'] : [])));
    const aoa = filler.concat([header], rows.map((values) => cellsFor(source, header, values)));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (const [ref, text] of Object.entries(comments)) {
      ws[ref].c = [{ a: 'Tester', t: text, T: true }];
    }
    if (wide) {
      // Wert weit rechts in Zeile 5 vergrössert den Blattbereich (wie Formatierungen in der echten Datei)
      ws.ZZ5 = { t: 's', v: 'weit' };
      const range = XLSX.utils.decode_range(ws['!ref']);
      range.e.c = Math.max(range.e.c, XLSX.utils.decode_col('ZZ'));
      ws['!ref'] = XLSX.utils.encode_range(range);
    }
    XLSX.utils.book_append_sheet(wb, ws, CONFIG.sheets[source]);
  };
  addSheet('first', [ROW1, ROW2], { B11: 'VSM 8718 28.08./05.09.24: Testperson', B12: 'Hinweis ohne Kennzeichnung' });
  if (withIssued) addSheet('issued', [ROW3], { B11: 'VSS 07.05.2026: Testperson' });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['geheim', 1]]), 'Sonstiges');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

function sameLocalTime(d, y, m, day, h = 0, min = 0) {
  return d instanceof Date && d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day && d.getHours() === h && d.getMinutes() === min;
}

// ---------------------------------------------------------------------------
// parseWorkbook (SheetJS + fflate, echte Bibliotheken)
// ---------------------------------------------------------------------------

test('parseWorkbook: liest nur die zwei Sheets, Header aus Zeile 10, Daten ab Zeile 11', async () => {
  const buffer = await buildWorkbook();
  const out = parseWorkbook(buffer, await libs());
  assertEqual(out.sheets.map((s) => [s.source, s.sheetName]), [['first', CONFIG.sheets.first], ['issued', CONFIG.sheets.issued]]);
  assertEqual(out.meta.sheetNames, [CONFIG.sheets.first, CONFIG.sheets.issued]);
  const first = out.sheets[0];
  const header = headerRowFor('first');
  assertEqual(first.headerRow, header);
  assertEqual(first.rows.length, 2);
  assertEqual(first.rows[0].row, 11);
  assertEqual(first.rows[1].row, 12);
  assertEqual(first.rows[0].cells.length, header.length, 'Zellen auf Header-Länge aufgefüllt');
  assertEqual(first.rows[0].cells[header.indexOf('Last Name')], 'Muster');
  assertEqual(first.rows[0].cells[header.indexOf('WE1 RUN1 Score')], 50);
  assertEqual(first.rows[0].cells[header.indexOf('WE1 RUN1 Result')], 0.85);
  assertEqual(first.rows[0].cells[header.indexOf('OE1 RUN1 Result')], '90.00%');
  assertEqual(first.rows[0].cells[header.indexOf('OE1 RUN1 Date')], '20.06.2024 / 10:00');
  assertEqual(first.rows[0].cells[header.indexOf('WE2 RUN1 Date')], null, 'leere Zellen als null');
  assert(sameLocalTime(first.rows[0].cells[header.indexOf('WE1 RUN1 Date')], 2024, 3, 1, 9, 30), 'Datumszelle als Date (cellDates)');
  const issued = out.sheets[1];
  assertEqual(issued.headerRow, headerRowFor('issued'));
  assertEqual(issued.rows[0].cells[issued.headerRow.indexOf('Certificate Number')], 'Z-0001');
  assert(!JSON.stringify(out).includes('geheim') && !JSON.stringify(out).includes('Sonstiges'), 'drittes Sheet wird nie gelesen');
});

test('parseWorkbook: Threaded Comments je Sheet über Zellreferenz', async () => {
  const out = parseWorkbook(await buildWorkbook(), await libs());
  assertEqual(out.comments[CONFIG.sheets.first], { B11: 'VSM 8718 28.08./05.09.24: Testperson', B12: 'Hinweis ohne Kennzeichnung' });
  assertEqual(out.comments[CONFIG.sheets.issued], { B11: 'VSS 07.05.2026: Testperson' });
});

test('parseWorkbook: fehlendes Pflicht-Sheet → SheetMissingError', async () => {
  const buffer = await buildWorkbook({ withIssued: false });
  const l = await libs();
  const e = await rejects(Promise.resolve().then(() => parseWorkbook(buffer, l)), (err) => err instanceof SheetMissingError);
  assertEqual(e.sheetName, CONFIG.sheets.issued);
  assert(e.message.includes(CONFIG.sheets.issued));
});

test('parseWorkbook → normalizeWorkbook: End-to-End mit synthetischer Datei', async () => {
  const parsed = parseWorkbook(await buildWorkbook(), await libs());
  const { persons, dq, meta } = normalizeWorkbook(parsed);
  assertEqual(persons.length, 3);
  assertEqual(persons.map((p) => p.source), ['first', 'first', 'issued']);
  assertEqual([persons[0].vss, persons[0].vsm], [false, true]);
  assertEqual([persons[1].vss, persons[1].vsm], [false, false]);
  assertEqual([persons[2].vss, persons[2].vsm], [true, false]);
  assert(sameLocalTime(persons[0].we[0].runs[0].date, 2024, 3, 1, 9, 30));
  assert(sameLocalTime(persons[0].oe[0].runs[0].date, 2024, 6, 20, 10, 0));
  assertEqual(persons[0].oe[0].runs[0].result, 0.9);
  assertEqual(persons[0].refDateSource, 'oe');
  assert(sameLocalTime(persons[2].certStart, 2024, 7, 1));
  assertEqual(dq.length, 1);
  assertEqual([dq[0].sheet, dq[0].row, dq[0].header, dq[0].raw], [CONFIG.sheets.first, 12, 'WE1 RUN1 Passed', 'maybe']);
  assertEqual(meta.counts, {
    first: 2, issued: 1, zeilen: 3, vorgaenge: 3, personen: 3, duplikate: 0, profilKonflikte: 0, mehrereProfile: 0,
    bestanden: 3, nichtBestanden: 0, offen: 0, passiv: 0, nichtErfasst: 0, vollstaendigOhneGesamtergebnis: 0, teileAusserhalbVorgabe: 0, passerelleMoeglich: 0, schluesselOhneGeburtsdatum: 3,
    dq: 1, fehler: 1, hinweise: 0, nichtAusgewertet: 0,
    wirkungUnsichtbar: 1, wirkungKennzahl: 0, wirkungKeine: 0,
  });
});

// ---------------------------------------------------------------------------
// Auflösung Site → Drive → Item und Download (Fake-Graph)
// ---------------------------------------------------------------------------

function fakeGraph(opts = {}) {
  const sp = CONFIG.sharepoint;
  const calls = [];
  let itemId = 'item1';
  let itemMisses = opts.itemNotFoundTimes || 0;
  const notFound = (path) => new NotFoundError('Nicht gefunden (HTTP 404): ' + path, { status: 404, code: 'itemNotFound', path });
  return {
    calls,
    async getJson(path) {
      calls.push(['getJson', path]);
      if (path === '/sites/' + sp.siteHost + ':' + sp.sitePath) {
        if (opts.siteNotFound) throw notFound(path);
        return { id: 'site1', webUrl: 'https://example.sharepoint.com/sites/x' };
      }
      if (path === '/sites/site1/drive') return { id: 'drive1' };
      if (path === '/drives/drive1/root:/' + sp.filePath) {
        if (opts.fileNotFound) throw notFound(path);
        return { id: itemId, name: 'Reporting_KUBA.xlsx' };
      }
      if (path === '/drives/drive1/items/' + itemId + '?$select=' + DRIVE_ITEM_SELECT) {
        if (itemMisses > 0) { itemMisses -= 1; const gone = path; itemId = 'item2'; throw notFound(gone); }
        const item = { id: itemId, name: 'Reporting_KUBA.xlsx', size: 1234, lastModifiedDateTime: '2024-09-05T10:00:00Z', webUrl: 'https://example.sharepoint.com/x.xlsx' };
        if (!opts.noDownloadUrl) item['@microsoft.graph.downloadUrl'] = 'https://dl.example/x?tempauth=1';
        return item;
      }
      throw new Error('Test: unerwarteter Graph-Pfad ' + path);
    },
    async getBinary(path) {
      calls.push(['getBinary', path]);
      return opts.buffer;
    },
    async request(url, options) {
      calls.push(['request', url, options]);
      if (url === 'https://dl.example/x?tempauth=1') return opts.buffer;
      if (url === '/drives/drive1/root:/' + sp.auditPath + ':/content') {
        if (opts.auditMissing) throw notFound(url);
        return opts.audit === undefined ? '[]' : opts.audit;
      }
      throw new Error('Test: unerwartete URL ' + url);
    },
  };
}

test('resolveDriveItem: Site → Drive → Item; Zwischenresultate nur im Memory-Cache', async () => {
  const graph = fakeGraph();
  const cache = {};
  const ids = await resolveDriveItem(graph, CONFIG.sharepoint, cache);
  assertEqual(ids, { siteId: 'site1', driveId: 'drive1', itemId: 'item1' });
  assertEqual(graph.calls.map((c) => c[1]), [
    '/sites/bbzsg.sharepoint.com:/sites/bbz-Zertifizierung',
    '/sites/site1/drive',
    '/drives/drive1/root:/General/07_KUBA/Reporting_KUBA.xlsx',
  ]);
  await resolveDriveItem(graph, CONFIG.sharepoint, cache);
  assertEqual(graph.calls.length, 3, 'zweiter Aufruf nutzt den Cache');
});

test('resolveDriveItem: Datei nicht gefunden → FileNotFoundError mit Pfad, ohne IDs', async () => {
  const e = await rejects(resolveDriveItem(fakeGraph({ fileNotFound: true }), CONFIG.sharepoint, {}), (err) => err instanceof FileNotFoundError);
  assert(e.message.includes(CONFIG.sharepoint.filePath), 'Dateipfad in Meldung: ' + e.message);
  assert(e.message.includes(CONFIG.sharepoint.sitePath), 'Site in Meldung');
  assert(!e.message.includes('site1') && !e.message.includes('drive1'), 'keine IDs in Meldung');
});

test('resolveDriveItem: Site nicht gefunden → FileNotFoundError mit Site-Hinweis', async () => {
  const e = await rejects(resolveDriveItem(fakeGraph({ siteNotFound: true }), CONFIG.sharepoint, {}), (err) => err instanceof FileNotFoundError);
  assert(/site/i.test(e.message) && e.message.includes(CONFIG.sharepoint.sitePath), 'Meldung: ' + e.message);
});

test('fileAdapter.load: holt downloadUrl, lädt ohne Token und liefert sheets, comments, meta', async () => {
  const buffer = await buildWorkbook();
  const graph = fakeGraph({ buffer });
  const adapter = createFileAdapter({ graph, ...(await libs()) });
  const out = await adapter.load();
  assertEqual(out.sheets.length, 2);
  assertEqual(out.comments[CONFIG.sheets.first].B11, 'VSM 8718 28.08./05.09.24: Testperson');
  assertEqual(out.meta.fileName, 'Reporting_KUBA.xlsx');
  assertEqual(out.meta.size, 1234);
  assertEqual(out.meta.lastModified, new Date('2024-09-05T10:00:00Z'));
  assertEqual(out.meta.webUrl, 'https://example.sharepoint.com/x.xlsx');
  assertEqual(out.meta.source, 'graph');
  assert(out.meta.loadedAt instanceof Date);
  assert(!('itemId' in out.meta) && !('driveId' in out.meta) && !('siteId' in out.meta), 'keine IDs im Meta');
  const download = graph.calls.find((c) => c[0] === 'request');
  assertEqual(download[1], 'https://dl.example/x?tempauth=1');
  assertEqual(download[2].auth, false);
  assertEqual(download[2].responseType, 'arraybuffer');
  assert(!graph.calls.some((c) => c[0] === 'getBinary'), 'kein /content-Download nötig');
});

test('fileAdapter.load: ohne downloadUrl → /content über Graph', async () => {
  const buffer = await buildWorkbook();
  const graph = fakeGraph({ buffer, noDownloadUrl: true });
  const adapter = createFileAdapter({ graph, ...(await libs()) });
  const out = await adapter.load();
  assertEqual(out.sheets.length, 2);
  assert(graph.calls.some((c) => c[0] === 'getBinary' && c[1] === '/drives/drive1/items/item1/content'));
});

test('fileAdapter.load: veraltete Item-ID (404) wird einmal neu aufgelöst', async () => {
  const buffer = await buildWorkbook();
  const graph = fakeGraph({ buffer, itemNotFoundTimes: 1 });
  const adapter = createFileAdapter({ graph, ...(await libs()) });
  await adapter.load();
  const out = await adapter.load();
  assertEqual(out.sheets.length, 2);
  const pathLookups = graph.calls.filter((c) => c[1] === '/drives/drive1/root:/' + CONFIG.sharepoint.filePath);
  assertEqual(pathLookups.length, 2, 'Pfad wurde nach 404 erneut aufgelöst');
});

test('fileAdapter.write: Phase 2, NotImplementedError', async () => {
  const adapter = createFileAdapter({ graph: fakeGraph(), ...(await libs()) });
  const e = await rejects(adapter.write({}));
  assertEqual(e.name, 'NotImplementedError');
});

test('parseWorkbook: Header-Zeile wird auf den letzten nicht leeren Header gekürzt', async () => {
  const out = parseWorkbook(await buildWorkbook({ wide: true }), await libs());
  const expected = headerRowFor('first').length;
  assertEqual(out.sheets[0].headerRow.length, expected);
  assert(out.sheets[0].rows.every((r) => r.cells.length === expected), 'Zellen auf Header-Länge gekürzt/aufgefüllt');
});

test('datasource.write: delegiert an den Workbook-Adapter; ohne MSAL (Node) verständlicher Fehler statt NotImplemented (Paket E)', async () => {
  let e = null;
  try { await datasourceWrite({ sheet: 'First Certification', row: 12, field: 'location', header: 'OE1 RUN1 Location', value: 'Bern', reason: 'Test' }); } catch (err) { e = err; }
  assert(e && /MSAL/.test(e.message), 'MSAL-Fehler erwartet: ' + (e && e.message));
  assertEqual(datasourceWrite.length, 0, 'ein Objekt-Parameter mit Standardwert');
});

test('fileAdapter: DRIVE_ITEM_SELECT enthält eTag und load() liefert meta.eTag (Konfliktprüfung des Schreibpfads, Paket E)', async () => {
  assert(DRIVE_ITEM_SELECT.split(',').includes('eTag'));
  const adapter = createFileAdapter({ graph: fakeGraph({ buffer: await buildWorkbook() }), ...(await libs()) });
  const out = await adapter.load();
  assert('eTag' in out.meta, 'meta.eTag vorhanden (null, wenn Graph keinen liefert)');
});

test('fileAdapter.loadAudit: Änderungsprotokoll neben der Datei lesen (Text), fehlende Datei → leer, nur im Memory', async () => {
  const audit = JSON.stringify([{ at: '2026-09-06T12:00:00.000Z', user: 'a@example.org', sheet: 'First Certification', row: 21, header: 'OE1 RUN1 Location', address: 'GB21', old: 'Zürich', new: 'Bern', reason: 'Ort', source: 'bbz-saq' }]);
  const graph = fakeGraph({ buffer: await buildWorkbook(), audit });
  const adapter = createFileAdapter({ graph, ...(await libs()) });
  const entries = await adapter.loadAudit();
  assertEqual(entries.length, 1);
  assertEqual([entries[0].row, entries[0].new], [21, 'Bern']);
  const call = graph.calls.find((c) => c[0] === 'request' && String(c[1]).endsWith(':/content'));
  assertEqual(call[2].responseType, 'text');
  const missing = createFileAdapter({ graph: fakeGraph({ buffer: await buildWorkbook(), auditMissing: true }), ...(await libs()) });
  assertEqual(await missing.loadAudit(), []);
});
