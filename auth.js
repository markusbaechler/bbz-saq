// auth.js – MSAL-Wrapper (MSAL.js 3.x, lokal in lib/msal-browser.min.js):
// Login (Popup, Redirect-Fallback), Silent-Token mit Popup-Fallback, Logout.
// Token-Cache: sessionStorage (erlaubt gemäss CLAUDE.md). Keine Personendaten werden gespeichert.

import { CONFIG } from './config.js';

const GRAPH_RESOURCE = 'https://graph.microsoft.com/';

function qualify(scope) {
  return /^https?:\/\//i.test(scope) ? scope : GRAPH_RESOURCE + scope;
}

export const SCOPES = CONFIG.auth.scopes.map(qualify);

export class AuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

export function isConfigured(authConfig) {
  const valid = (v) => typeof v === 'string' && GUID.test(v) && !PLACEHOLDER.test(v);
  return !!authConfig && valid(authConfig.clientId) && valid(authConfig.tenantId);
}

// Redirect-URI = Verzeichnis der aktuellen Seite mit Slash (Pages: https://…/bbz-saq/, lokal: http://localhost:3000/)
export function redirectUriFor(location) {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

function isPopupBlocked(e) {
  return !!e && (e.errorCode === 'popup_window_error' || e.errorCode === 'empty_window_error');
}

export function createAuth({ msal, authConfig = CONFIG.auth, location = globalThis.location } = {}) {
  let pca = null;
  let account = null;
  const scopes = Array.isArray(authConfig.scopes) ? authConfig.scopes.map(qualify) : SCOPES;

  function setAccount(a) {
    account = a || null;
    if (pca && account) pca.setActiveAccount(account);
  }

  async function init() {
    if (!msal || typeof msal.PublicClientApplication !== 'function') {
      throw new Error('MSAL-Bibliothek nicht geladen – lib/msal-browser.min.js muss in index.html vor den Modulen eingebunden sein.');
    }
    if (!isConfigured(authConfig)) {
      throw new AuthConfigError('Azure-Konfiguration fehlt: Client-ID und Tenant-ID der App-Registrierung «bbz-saq-SPA» in config.js (CONFIG.auth) eintragen.');
    }
    const redirectUri = redirectUriFor(location);
    pca = new msal.PublicClientApplication({
      auth: {
        clientId: authConfig.clientId,
        authority: 'https://login.microsoftonline.com/' + authConfig.tenantId,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    });
    await pca.initialize();

    const redirectResult = await pca.handleRedirectPromise();
    if (redirectResult && redirectResult.account) {
      setAccount(redirectResult.account);
    } else {
      const accounts = pca.getAllAccounts();
      if (accounts.length > 0) setAccount(accounts[0]);
    }
    return account;
  }

  async function ensureInit() {
    if (!pca) await init();
  }

  async function signIn() {
    await ensureInit();
    try {
      const resp = await pca.loginPopup({ scopes, prompt: 'select_account' });
      setAccount(resp.account);
      return account;
    } catch (e) {
      if (isPopupBlocked(e)) await pca.loginRedirect({ scopes });
      throw e;
    }
  }

  async function signOut() {
    const current = account;
    account = null;
    if (pca && current) await pca.logoutPopup({ account: current });
  }

  // Silent → bei InteractionRequired Popup → bei blockiertem Popup Redirect
  async function getToken({ forceRefresh = false } = {}) {
    await ensureInit();
    if (!account) throw new Error('Nicht angemeldet – bitte zuerst anmelden.');
    try {
      const resp = await pca.acquireTokenSilent({ scopes, account, forceRefresh: !!forceRefresh });
      return resp.accessToken;
    } catch (e) {
      const interactionRequired = msal.InteractionRequiredAuthError && e instanceof msal.InteractionRequiredAuthError;
      if (!interactionRequired) throw e;
      try {
        const resp = await pca.acquireTokenPopup({ scopes, account });
        return resp.accessToken;
      } catch (popupError) {
        if (isPopupBlocked(popupError)) await pca.acquireTokenRedirect({ scopes, account });
        throw popupError;
      }
    }
  }

  return {
    init,
    signIn,
    signOut,
    getToken,
    getAccount: () => account,
    isAuthenticated: () => !!account,
  };
}

let singleton = null;

// App-weite Instanz mit der global geladenen MSAL-Bibliothek (window.msal)
export function getAuth() {
  if (!singleton) singleton = createAuth({ msal: globalThis.msal });
  return singleton;
}
