import { test, assert, assertEqual } from './runner.js';
import { SCOPES, redirectUriFor, isConfigured, createAuth, AuthConfigError } from '../auth.js';

const CONFIGURED = { clientId: '11111111-2222-3333-4444-555555555555', tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', scopes: ['Files.Read.All'] };
const LOCATION = { origin: 'http://localhost:3000', pathname: '/' };

// Fake der MSAL-Bibliothek (window.msal): zeichnet Aufrufe auf
function fakeMsal({ accounts = [], redirectResult = null, silentError = null, popupError = null } = {}) {
  class InteractionRequiredAuthError extends Error {
    constructor(message) { super(message); this.errorCode = 'interaction_required'; }
  }
  const calls = [];
  class PublicClientApplication {
    constructor(cfg) { calls.push(['ctor', cfg]); this.active = null; }
    async initialize() { calls.push(['initialize']); }
    async handleRedirectPromise() { calls.push(['handleRedirectPromise']); return redirectResult; }
    getAllAccounts() { return accounts; }
    setActiveAccount(a) { this.active = a; calls.push(['setActiveAccount', a]); }
    async loginPopup(req) {
      calls.push(['loginPopup', req]);
      if (popupError) throw popupError;
      return { account: { username: 'test@example.org', name: 'Test Person' } };
    }
    async loginRedirect(req) { calls.push(['loginRedirect', req]); }
    async acquireTokenSilent(req) {
      calls.push(['acquireTokenSilent', req]);
      if (silentError === 'interaction_required') throw new InteractionRequiredAuthError('interaction_required');
      if (silentError) throw silentError;
      return { accessToken: 'tok-silent' };
    }
    async acquireTokenPopup(req) {
      calls.push(['acquireTokenPopup', req]);
      if (popupError) throw popupError;
      return { accessToken: 'tok-popup' };
    }
    async acquireTokenRedirect(req) { calls.push(['acquireTokenRedirect', req]); }
    async logoutPopup(req) { calls.push(['logoutPopup', req]); }
  }
  return { msal: { PublicClientApplication, InteractionRequiredAuthError }, calls };
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

test('auth: Scopes sind für Microsoft Graph qualifiziert', () => {
  assertEqual(SCOPES, ['https://graph.microsoft.com/Files.Read.All']);
});

test('auth.redirectUriFor: Verzeichnis-URI mit Slash, ohne Dateiname', () => {
  assertEqual(redirectUriFor({ origin: 'https://markusbaechler.github.io', pathname: '/bbz-saq/' }), 'https://markusbaechler.github.io/bbz-saq/');
  assertEqual(redirectUriFor({ origin: 'https://markusbaechler.github.io', pathname: '/bbz-saq/index.html' }), 'https://markusbaechler.github.io/bbz-saq/');
  assertEqual(redirectUriFor({ origin: 'http://localhost:3000', pathname: '/' }), 'http://localhost:3000/');
  assertEqual(redirectUriFor({ origin: 'http://localhost:3000', pathname: '/index.html' }), 'http://localhost:3000/');
});

test('auth.isConfigured: Platzhalter-IDs gelten als nicht konfiguriert', () => {
  assertEqual(isConfigured(CONFIGURED), true);
  assertEqual(isConfigured({ clientId: '00000000-0000-0000-0000-000000000000', tenantId: CONFIGURED.tenantId }), false);
  assertEqual(isConfigured({ clientId: CONFIGURED.clientId, tenantId: '' }), false);
  assertEqual(isConfigured({ clientId: 'abc', tenantId: 'def' }), false);
});

test('createAuth.init: MSAL mit Tenant-Authority, Redirect-URI und sessionStorage; vorhandenes Konto wird aktiv', async () => {
  const account = { username: 'vorhanden@example.org' };
  const { msal, calls } = fakeMsal({ accounts: [account] });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  assertEqual(await auth.init(), account);
  const cfg = calls[0][1];
  assertEqual(cfg.auth.clientId, CONFIGURED.clientId);
  assertEqual(cfg.auth.authority, 'https://login.microsoftonline.com/' + CONFIGURED.tenantId);
  assertEqual(cfg.auth.redirectUri, 'http://localhost:3000/');
  assertEqual(cfg.cache.cacheLocation, 'sessionStorage');
  assertEqual(cfg.cache.storeAuthStateInCookie, false);
  assertEqual(calls.map((c) => c[0]), ['ctor', 'initialize', 'handleRedirectPromise', 'setActiveAccount']);
  assertEqual(auth.isAuthenticated(), true);
  assertEqual(auth.getAccount(), account);
});

test('createAuth.init: Redirect-Antwort hat Vorrang vor gecachten Konten', async () => {
  const fromRedirect = { username: 'redirect@example.org' };
  const { msal } = fakeMsal({ accounts: [{ username: 'alt@example.org' }], redirectResult: { account: fromRedirect } });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  assertEqual(await auth.init(), fromRedirect);
});

test('createAuth.init: ohne Konto → null, nicht angemeldet', async () => {
  const { msal } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  assertEqual(await auth.init(), null);
  assertEqual(auth.isAuthenticated(), false);
});

test('createAuth.init: fehlende MSAL-Bibliothek → verständlicher Fehler', async () => {
  const auth = createAuth({ msal: undefined, authConfig: CONFIGURED, location: LOCATION });
  const e = await rejects(auth.init());
  assert(/msal/i.test(e.message) && /lib\//.test(e.message), 'Meldung: ' + e.message);
});

test('createAuth.init: Platzhalter-IDs → AuthConfigError mit Hinweis auf config.js', async () => {
  const { msal } = fakeMsal();
  const auth = createAuth({ msal, authConfig: { clientId: '00000000-0000-0000-0000-000000000000', tenantId: '00000000-0000-0000-0000-000000000000' }, location: LOCATION });
  const e = await rejects(auth.init(), (err) => err instanceof AuthConfigError);
  assert(/config\.js/.test(e.message), 'Meldung: ' + e.message);
});

test('createAuth.signIn: loginPopup mit Scopes, Konto wird aktiv', async () => {
  const { msal, calls } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  const account = await auth.signIn();
  assertEqual(account.username, 'test@example.org');
  const login = calls.find((c) => c[0] === 'loginPopup');
  assertEqual(login[1].scopes, SCOPES);
  assertEqual(auth.isAuthenticated(), true);
});

test('createAuth.signIn: Popup blockiert → loginRedirect', async () => {
  const blocked = Object.assign(new Error('popup'), { errorCode: 'popup_window_error' });
  const { msal, calls } = fakeMsal({ popupError: blocked });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  await rejects(auth.signIn());
  assert(calls.some((c) => c[0] === 'loginRedirect'), 'loginRedirect erwartet');
});

test('createAuth.getToken: silent liefert Access-Token, forceRefresh wird durchgereicht', async () => {
  const account = { username: 'a@example.org' };
  const { msal, calls } = fakeMsal({ accounts: [account] });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  assertEqual(await auth.getToken(), 'tok-silent');
  assertEqual(await auth.getToken({ forceRefresh: true }), 'tok-silent');
  const silent = calls.filter((c) => c[0] === 'acquireTokenSilent');
  assertEqual(silent.length, 2);
  assertEqual(silent[0][1], { scopes: SCOPES, account, forceRefresh: false });
  assertEqual(silent[1][1].forceRefresh, true);
});

test('createAuth.getToken: InteractionRequired → Popup-Fallback', async () => {
  const { msal, calls } = fakeMsal({ accounts: [{ username: 'a@example.org' }], silentError: 'interaction_required' });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  assertEqual(await auth.getToken(), 'tok-popup');
  const popup = calls.find((c) => c[0] === 'acquireTokenPopup');
  assertEqual(popup[1].scopes, SCOPES);
});

test('createAuth.getToken: InteractionRequired und Popup blockiert → acquireTokenRedirect', async () => {
  const blocked = Object.assign(new Error('popup'), { errorCode: 'popup_window_error' });
  const { msal, calls } = fakeMsal({ accounts: [{ username: 'a@example.org' }], silentError: 'interaction_required', popupError: blocked });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  await rejects(auth.getToken());
  assert(calls.some((c) => c[0] === 'acquireTokenRedirect'), 'acquireTokenRedirect erwartet');
});

test('createAuth.getToken: anderer Silent-Fehler wird durchgereicht', async () => {
  const { msal } = fakeMsal({ accounts: [{ username: 'a@example.org' }], silentError: new Error('network_error') });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  const e = await rejects(auth.getToken());
  assertEqual(e.message, 'network_error');
});

test('createAuth.getToken: ohne Anmeldung → Fehler', async () => {
  const { msal } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  const e = await rejects(auth.getToken());
  assert(/angemeldet/i.test(e.message), 'Meldung: ' + e.message);
});

test('createAuth.signOut: logoutPopup, Konto entfernt', async () => {
  const account = { username: 'a@example.org' };
  const { msal, calls } = fakeMsal({ accounts: [account] });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  await auth.signOut();
  assertEqual(calls.at(-1), ['logoutPopup', { account }]);
  assertEqual(auth.isAuthenticated(), false);
});

// Phone (PROMPT-2 B.4): kein Popup-Versuch, direkt Redirect; matchMedia wird injiziert (in Node nicht vorhanden)
test('createAuth.signIn: auf Phone (matchMedia max-width 600px) direkt loginRedirect, kein Popup', async () => {
  const { msal, calls } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION, matchMedia: () => ({ matches: true }) });
  await auth.init();
  assertEqual(await auth.signIn(), null);
  assert(calls.some((c) => c[0] === 'loginRedirect') && !calls.some((c) => c[0] === 'loginPopup'), calls.map((c) => c[0]).join(','));
  assertEqual(calls.find((c) => c[0] === 'loginRedirect')[1].scopes, SCOPES);
});

test('createAuth.signIn: auf Desktop (matchMedia false) weiterhin Popup mit Redirect-Fallback', async () => {
  const { msal, calls } = fakeMsal();
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION, matchMedia: () => ({ matches: false }) });
  await auth.init();
  await auth.signIn();
  assert(calls.some((c) => c[0] === 'loginPopup') && !calls.some((c) => c[0] === 'loginRedirect'), calls.map((c) => c[0]).join(','));
});

test('createAuth.getToken: auf Phone bei InteractionRequired direkt acquireTokenRedirect, kein Popup', async () => {
  const { msal, calls } = fakeMsal({ accounts: [{ username: 'a@example.org' }], silentError: 'interaction_required' });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION, matchMedia: () => ({ matches: true }) });
  await auth.init();
  await rejects(auth.getToken());
  assert(calls.some((c) => c[0] === 'acquireTokenRedirect') && !calls.some((c) => c[0] === 'acquireTokenPopup'), calls.map((c) => c[0]).join(','));
});

test('auth.getToken({ scopes }): Token für zusätzliche Scopes (inkrementelle Zustimmung, Paket E); Standard-Scopes bleiben', async () => {
  const { msal, calls } = fakeMsal({ accounts: [{ username: 'a@example.org' }] });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  assertEqual(await auth.getToken({ scopes: ['Files.ReadWrite.All'] }), 'tok-silent');
  assertEqual(calls.filter((c) => c[0] === 'acquireTokenSilent').pop()[1].scopes, ['https://graph.microsoft.com/Files.ReadWrite.All']);
  await auth.getToken();
  assertEqual(calls.filter((c) => c[0] === 'acquireTokenSilent').pop()[1].scopes, ['https://graph.microsoft.com/Files.Read.All']);
});

test('auth.getToken({ scopes }): bei InteractionRequired Popup mit denselben Scopes', async () => {
  const { msal, calls } = fakeMsal({ accounts: [{ username: 'a@example.org' }], silentError: 'interaction_required' });
  const auth = createAuth({ msal, authConfig: CONFIGURED, location: LOCATION });
  await auth.init();
  assertEqual(await auth.getToken({ scopes: ['Files.ReadWrite.All'] }), 'tok-popup');
  assertEqual(calls.filter((c) => c[0] === 'acquireTokenPopup').pop()[1].scopes, ['https://graph.microsoft.com/Files.ReadWrite.All']);
});
