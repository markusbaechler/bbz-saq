// Minimaler Test-Runner, läuft im Browser (tests.html) und in Node (tests/run-node.js).
// Keine Abhängigkeiten. Synthetische Daten ausschliesslich – keine Personendaten.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition, message = 'Bedingung nicht erfüllt') {
  if (!condition) throw new AssertionError(message);
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function show(v) {
  if (v instanceof Date) return 'Date(' + v.toISOString() + ')';
  if (typeof v !== 'object' || v === null) return JSON.stringify(v);
  try {
    return JSON.stringify(v, (_, x) => (x instanceof Date ? 'Date(' + x.toISOString() + ')' : x));
  } catch {
    return String(v);
  }
}

function prefix(message) {
  return message ? message + ': ' : '';
}

export function assertEqual(actual, expected, message = '') {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(prefix(message) + 'erwartet ' + show(expected) + ', erhalten ' + show(actual));
  }
}

export function assertClose(actual, expected, eps = 1e-9, message = '') {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > eps) {
    throw new AssertionError(prefix(message) + 'erwartet ≈' + expected + ', erhalten ' + show(actual));
  }
}

export function assertThrows(fn, check, message = '') {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  if (!thrown) throw new AssertionError(prefix(message) + 'Fehler erwartet, keiner geworfen');
  if (typeof check === 'function' && !check(thrown)) {
    throw new AssertionError(prefix(message) + 'falscher Fehler: ' + thrown.message);
  }
  return thrown;
}

export async function runAll() {
  const results = [];
  for (const t of tests) {
    const started = Date.now();
    try {
      await t.fn();
      results.push({ name: t.name, ok: true, ms: Date.now() - started });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: e, ms: Date.now() - started });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return { results, total: results.length, failed, passed: results.length - failed };
}
