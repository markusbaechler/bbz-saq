import { test, assert, assertEqual } from './runner.js';
import { GRAPH_BASE, GraphError, NotFoundError, AuthExpiredError, createGraphClient } from '../graph.js';

// Fake-Antwort im Stil von fetch Response
function res({ status = 200, headers = {}, json = null, text = '', buffer = null } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() in h ? h[name.toLowerCase()] : null) },
    json: async () => json,
    text: async () => (json !== null ? JSON.stringify(json) : text),
    arrayBuffer: async () => buffer || new ArrayBuffer(0),
  };
}

// Fake-fetch mit Antwort-Warteschlange; Error-Objekte in der Warteschlange werden geworfen (Netzwerkfehler)
function fakeFetch(queue) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (!queue.length) throw new Error('Test: keine Antwort mehr in der Warteschlange');
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

function setup(queue, options = {}) {
  const fetch = fakeFetch(queue);
  const sleeps = [];
  const tokenCalls = [];
  const getToken = async (opts) => { tokenCalls.push(opts); return 'tok' + tokenCalls.length; };
  const client = createGraphClient({ getToken, fetch, sleep: async (ms) => { sleeps.push(ms); }, ...options });
  return { client, fetch, sleeps, tokenCalls };
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

test('graph: Authorization-Header, Accept und Basis-URL', async () => {
  const { client, fetch, tokenCalls } = setup([res({ json: { id: 'site1' } })]);
  const out = await client.getJson('/sites/host:/sites/x');
  assertEqual(out, { id: 'site1' });
  assertEqual(fetch.calls[0].url, GRAPH_BASE + '/sites/host:/sites/x');
  assertEqual(fetch.calls[0].init.headers.Authorization, 'Bearer tok1');
  assertEqual(fetch.calls[0].init.headers.Accept, 'application/json');
  assertEqual(fetch.calls[0].init.method, 'GET');
  assertEqual(tokenCalls.length, 1);
});

test('graph: 429 mit Retry-After → wartet die angegebenen Sekunden und wiederholt', async () => {
  const { client, fetch, sleeps } = setup([res({ status: 429, headers: { 'Retry-After': '2' } }), res({ json: { ok: 1 } })]);
  assertEqual(await client.getJson('/x'), { ok: 1 });
  assertEqual(sleeps, [2000]);
  assertEqual(fetch.calls.length, 2);
});

test('graph: 503 ohne Retry-After → exponentielles Backoff', async () => {
  const { client, sleeps } = setup([res({ status: 503 }), res({ status: 503 }), res({ json: { ok: 1 } })]);
  assertEqual(await client.getJson('/x'), { ok: 1 });
  assertEqual(sleeps, [500, 1000]);
});

test('graph: nach maxRetries → GraphError (retryable) mit verständlicher Meldung', async () => {
  const { client, fetch } = setup([res({ status: 503 }), res({ status: 503 }), res({ status: 503 })], { maxRetries: 2 });
  const e = await rejects(client.getJson('/x'), (err) => err instanceof GraphError);
  assertEqual(e.status, 503);
  assertEqual(e.retryable, true);
  assert(/später/i.test(e.message), 'Meldung: ' + e.message);
  assertEqual(fetch.calls.length, 3);
});

test('graph: 404 → NotFoundError mit Pfad und Graph-Code', async () => {
  const { client } = setup([res({ status: 404, json: { error: { code: 'itemNotFound', message: 'The resource could not be found.' } } })]);
  const e = await rejects(client.getJson('/drives/d/root:/Ordner/Datei.xlsx'), (err) => err instanceof NotFoundError);
  assert(e instanceof GraphError);
  assertEqual(e.status, 404);
  assertEqual(e.code, 'itemNotFound');
  assert(e.message.includes('/drives/d/root:/Ordner/Datei.xlsx'), 'Pfad in Meldung: ' + e.message);
  assert(/nicht gefunden/i.test(e.message));
});

test('graph: 401 → Token erneuern (forceRefresh) und einmal wiederholen', async () => {
  const { client, fetch, tokenCalls } = setup([res({ status: 401 }), res({ json: { ok: 1 } })]);
  assertEqual(await client.getJson('/x'), { ok: 1 });
  assertEqual(tokenCalls.length, 2);
  assertEqual(tokenCalls[1], { forceRefresh: true });
  assertEqual(fetch.calls[1].init.headers.Authorization, 'Bearer tok2');
});

test('graph: 401 trotz neuem Token → AuthExpiredError', async () => {
  const { client } = setup([res({ status: 401 }), res({ status: 401 })]);
  const e = await rejects(client.getJson('/x'), (err) => err instanceof AuthExpiredError);
  assertEqual(e.status, 401);
  assert(/anmeld/i.test(e.message), 'Meldung: ' + e.message);
});

test('graph: Netzwerkfehler → einmal wiederholen', async () => {
  const { client, sleeps } = setup([new TypeError('Failed to fetch'), res({ json: { ok: 1 } })]);
  assertEqual(await client.getJson('/x'), { ok: 1 });
  assertEqual(sleeps, [500]);
});

test('graph: Netzwerkfehler zweimal → GraphError status 0', async () => {
  const { client } = setup([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
  const e = await rejects(client.getJson('/x'), (err) => err instanceof GraphError);
  assertEqual(e.status, 0);
  assert(/netzwerk/i.test(e.message));
});

test('graph: andere Fehler übernehmen Graph-Meldung und Code', async () => {
  const { client } = setup([res({ status: 400, json: { error: { code: 'invalidRequest', message: 'Invalid request' } } })]);
  const e = await rejects(client.getJson('/x'), (err) => err instanceof GraphError);
  assertEqual(e.status, 400);
  assertEqual(e.code, 'invalidRequest');
  assert(e.message.includes('Invalid request'));
  assertEqual(e.retryable, false);
});

test('graph: getBinary liefert ArrayBuffer, 204 liefert null', async () => {
  const buffer = new ArrayBuffer(8);
  const { client } = setup([res({ buffer }), res({ status: 204 })]);
  assert((await client.getBinary('/drives/d/items/i/content')) === buffer);
  assertEqual(await client.getJson('/x'), null);
});

test('graph: auth:false mit absoluter URL → kein Token, keine Basis-URL', async () => {
  const buffer = new ArrayBuffer(4);
  const { client, fetch, tokenCalls } = setup([res({ buffer })]);
  const out = await client.request('https://download.example/x?tempauth=1', { auth: false, responseType: 'arraybuffer' });
  assert(out === buffer);
  assertEqual(fetch.calls[0].url, 'https://download.example/x?tempauth=1');
  assertEqual(fetch.calls[0].init.headers.Authorization, undefined);
  assertEqual(tokenCalls.length, 0);
});

test('graph: JSON-Body wird serialisiert', async () => {
  const { client, fetch } = setup([res({ json: { id: 1 } })]);
  await client.request('/x', { method: 'POST', body: { a: 1 } });
  assertEqual(fetch.calls[0].init.method, 'POST');
  assertEqual(fetch.calls[0].init.body, '{"a":1}');
  assertEqual(fetch.calls[0].init.headers['Content-Type'], 'application/json');
});
