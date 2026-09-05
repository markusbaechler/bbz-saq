// graph.js – Microsoft-Graph-HTTP-Wrapper: Auth-Header, Retry bei 429/503 mit Backoff, verständliche Fehler.
// Nur Transport. Kein Wissen über Sheets oder Personen (siehe datasource/).

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const RETRY_STATUS = new Set([429, 502, 503, 504]);

export class GraphError extends Error {
  constructor(message, props = {}) {
    super(message);
    this.name = 'GraphError';
    this.status = props.status === undefined ? 0 : props.status;
    this.code = props.code === undefined ? null : props.code;
    this.details = props.details === undefined ? null : props.details;
    this.retryable = !!props.retryable;
    this.path = props.path === undefined ? null : props.path;
  }
}

export class NotFoundError extends GraphError {
  constructor(message, props = {}) {
    super(message, { ...props, status: 404 });
    this.name = 'NotFoundError';
  }
}

export class AuthExpiredError extends GraphError {
  constructor(message, props = {}) {
    super(message, { ...props, status: 401 });
    this.name = 'AuthExpiredError';
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorBody(resp) {
  let text = '';
  try {
    text = await resp.text();
  } catch {
    text = '';
  }
  let code = null;
  let message = '';
  try {
    const json = JSON.parse(text);
    code = (json && json.error && json.error.code) || null;
    message = (json && json.error && json.error.message) || '';
  } catch {
    message = text;
  }
  return { code, message, details: text };
}

// Wartezeit: Retry-After (Sekunden oder HTTP-Datum), sonst exponentielles Backoff
function retryDelay(resp, attempt, baseDelayMs, maxDelayMs) {
  const header = resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get('Retry-After') : null;
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, Math.min(at - Date.now(), maxDelayMs));
  }
  return Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
}

function isAbsoluteUrl(s) {
  return /^https?:\/\//i.test(s);
}

// getToken(options?) → Promise<string>; options.forceRefresh = true nach 401
export function createGraphClient({
  getToken,
  fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined,
  sleep = defaultSleep,
  maxRetries = 4,
  baseDelayMs = 500,
  maxDelayMs = 30000,
} = {}) {
  if (typeof fetch !== 'function') throw new Error('fetch nicht verfügbar');

  async function request(pathOrUrl, options = {}) {
    const { method = 'GET', headers = {}, body, responseType = 'json', auth = true } = options;
    const url = isAbsoluteUrl(pathOrUrl) ? pathOrUrl : GRAPH_BASE + pathOrUrl;
    let token = auth ? await getToken() : null;
    let tokenRefreshed = false;
    let networkRetried = false;

    for (let attempt = 0; ; attempt++) {
      const h = { ...headers };
      if (auth) h.Authorization = 'Bearer ' + token;
      if (responseType === 'json') h.Accept = 'application/json';
      const init = { method, headers: h };
      if (body !== undefined) {
        if (typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
          init.body = body;
        } else {
          init.body = JSON.stringify(body);
          h['Content-Type'] = 'application/json';
        }
      }

      let resp;
      try {
        resp = await fetch(url, init);
      } catch (e) {
        if (!networkRetried) {
          networkRetried = true;
          await sleep(baseDelayMs);
          continue;
        }
        throw new GraphError('Netzwerk nicht erreichbar – bitte Verbindung prüfen.', { status: 0, details: String(e && e.message), path: pathOrUrl });
      }

      if (resp.ok) {
        if (resp.status === 204) return null;
        if (responseType === 'arraybuffer') return resp.arrayBuffer();
        if (responseType === 'text') return resp.text();
        if (responseType === 'response') return resp;
        return resp.json();
      }

      if (RETRY_STATUS.has(resp.status) && attempt < maxRetries) {
        await sleep(retryDelay(resp, attempt, baseDelayMs, maxDelayMs));
        continue;
      }

      if (resp.status === 401 && auth && !tokenRefreshed) {
        tokenRefreshed = true;
        token = await getToken({ forceRefresh: true });
        continue;
      }

      const { code, message, details } = await readErrorBody(resp);
      const suffix = message ? ' – ' + message : '';
      const props = { status: resp.status, code, details, path: pathOrUrl };
      if (RETRY_STATUS.has(resp.status)) {
        throw new GraphError('Microsoft Graph ist überlastet oder vorübergehend nicht verfügbar (HTTP ' + resp.status + '). Bitte später erneut versuchen.', { ...props, retryable: true });
      }
      if (resp.status === 401) throw new AuthExpiredError('Anmeldung abgelaufen oder ungültig (HTTP 401) – bitte erneut anmelden.' + suffix, props);
      if (resp.status === 404) throw new NotFoundError('Nicht gefunden (HTTP 404): ' + pathOrUrl + suffix, props);
      if (resp.status === 403) throw new GraphError('Zugriff verweigert (HTTP 403) – keine Berechtigung für diese SharePoint-Ressource.' + suffix, props);
      throw new GraphError('Microsoft-Graph-Fehler (HTTP ' + resp.status + ')' + suffix, props);
    }
  }

  return {
    request,
    getJson: (path, options = {}) => request(path, { ...options, responseType: 'json' }),
    getBinary: (path, options = {}) => request(path, { ...options, responseType: 'arraybuffer' }),
  };
}
