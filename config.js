// config.js – zentrale Konfiguration: IDs, Pfade, Sheet-Namen, Header-Mapping, Alias-Maps, Profile.
//
// Regeln (CLAUDE.md):
// - Spalten werden ausschliesslich über Header-Namen (Zeile 10) gemappt, nie über Buchstaben/Indizes.
// - Die zwei Sheets sind nicht spaltenidentisch; Header-Varianten werden hier als Alternativen geführt.
// - Tenant-ID, Client-ID und Site-Pfad dürfen hier stehen (Repo public). Keine Item-/Drive-IDs,
//   keine Secrets. Item-IDs werden zur Laufzeit aufgelöst und nur im Memory gehalten.

export const CONFIG = {
  auth: {
    // Vom Auftraggeber einzutragen (Azure App-Registrierung «bbz-saq-SPA», SPA-Plattform).
    clientId: '00000000-0000-0000-0000-000000000000',
    tenantId: '00000000-0000-0000-0000-000000000000',
    scopes: ['Files.Read.All'],
  },
  sharepoint: {
    siteHost: 'bbzsg.sharepoint.com',
    sitePath: '/sites/bbz-Zertifizierung',
    filePath: 'General/07_KUBA/Reporting_KUBA.xlsx', // relativ zur Standardbibliothek «Dokumente»
  },
  sheets: {
    first: 'First Certification',
    issued: 'Ausgestellte Zertifikate',
  },
  headerRow: 10,      // Header-Zeile (1-basiert, wie in Excel)
  dataStartRow: 11,   // erste Datenzeile
  commentColumn: 'B', // Threaded Comments (VSS/VSM) hängen an Zelle B{row}
  we: { parts: 6, runs: 3 }, // schriftliche Teilprüfungen WE1–WE6, je bis zu 3 Runs
  oe: { parts: 2, runs: 3 }, // mündliche Teilprüfungen OE1–OE2, je bis zu 3 Runs
};

// ---------------------------------------------------------------------------
// Whitelists / Alias-Maps der Normalisierungstabelle (PROMPT.md, Datenmodell)
// ---------------------------------------------------------------------------

export const PROFILES = ['PK', 'IK', 'CWMA', 'KMU', 'AFFL', 'CCoB'];

// Rohwert → kanonisches Profil (Vergleich case-insensitiv nach trim)
export const PROFILE_ALIASES = {
  CCOB: 'CCoB',
  Affluent: 'AFFL',
};

export const LANGUAGES = ['DE', 'FR', 'IT', 'EN'];

// Passed-Felder: exakte Schreibweisen nach trim. Alles andere → null + Data-Quality-Log.
export const PASSED_TRUE = ['yes', 'YES', 'Yes', 'PASSED', 'fulfilled', 'FULFILLED'];
export const PASSED_FALSE = ['no', 'No', 'FAILED'];

// Employer-Alias → kanonischer Name (Vergleich case-insensitiv nach trim). Unbekannt → Rohwert.
// Erweiterbar; kanonische Namen selbst bleiben unverändert.
export const EMPLOYER_ALIASES = {
  'BEKB': 'Berner Kantonalbank AG',
  'Raiffeisen KB': 'Raiffeisen',
  'SZKB': 'Schwyzer Kantonalbank (SZKB)',
};

// VSS/VSM aus Threaded Comment auf B{row}, z. B. «VSM 8718 28.08./05.09.24: Name», «VSS 07.05.2026: Name».
export const VSS_REGEX = /\bVSS\b/i;
export const VSM_REGEX = /\bVSM\b/i;

// ---------------------------------------------------------------------------
// Header-Mapping
// key        = logischer Feldschlüssel im Code
// candidates = akzeptierte Header-Namen (Sheet-Varianten), erster Treffer gewinnt
// required   = 'all' (beide Sheets) | 'issued' (nur «Ausgestellte Zertifikate») | 'none' (optional)
// ---------------------------------------------------------------------------

export function partKey(kind, part) {
  return kind + part + '.passed';
}

export function runKey(kind, part, run, what) {
  return kind + part + '.run' + run + '.' + what;
}

function buildHeaderFields() {
  const fields = [
    { key: 'lastName',    candidates: ['Last Name'],              required: 'all' },
    { key: 'firstName',   candidates: ['First Name'],             required: 'all' },
    { key: 'role',        candidates: ['Role'],                   required: 'all' },
    { key: 'employer',    candidates: ['Employer'],               required: 'all' },
    { key: 'profil',      candidates: ['Certificate Program'],    required: 'all' },
    { key: 'sprache',     candidates: ['Certificate Language'],   required: 'all' },
    { key: 'certNumber',  candidates: ['Certificate Number'],     required: 'none' },
    { key: 'certStart',   candidates: ['Certificate Start Date'], required: 'issued' },
    { key: 'certEnd',     candidates: ['Certificate End Date'],   required: 'none' },
  ];

  const groups = [
    { kind: 'we', label: 'WE', allKey: 'weAllPassed', parts: CONFIG.we.parts, runs: CONFIG.we.runs },
    { kind: 'oe', label: 'OE', allKey: 'oeAllPassed', parts: CONFIG.oe.parts, runs: CONFIG.oe.runs },
  ];

  for (const g of groups) {
    fields.push({ key: g.allKey, candidates: [g.label + ' All Passed', g.label + ' All yes'], required: 'all' });
    for (let p = 1; p <= g.parts; p++) {
      const part = g.label + p;
      fields.push({ key: partKey(g.kind, p), candidates: [part + ' Passed', part + ' yes'], required: 'all' });
      for (let r = 1; r <= g.runs; r++) {
        const run = part + ' RUN' + r;
        fields.push({ key: runKey(g.kind, p, r, 'passed'), candidates: [run + ' Passed', run + ' yes'], required: 'all' });
        fields.push({ key: runKey(g.kind, p, r, 'date'),   candidates: [run + ' Date'],   required: 'all' });
        fields.push({ key: runKey(g.kind, p, r, 'score'),  candidates: [run + ' Score'],  required: 'all' });
        fields.push({ key: runKey(g.kind, p, r, 'result'), candidates: [run + ' Result'], required: 'all' });
      }
    }
  }
  return fields;
}

export const HEADER_FIELDS = buildHeaderFields();

const FIELD_BY_KEY = new Map(HEADER_FIELDS.map((f) => [f.key, f]));

export function headerCandidates(key) {
  const f = FIELD_BY_KEY.get(key);
  return f ? f.candidates.slice() : null;
}

// Pflicht-Header für ein Sheet: source = 'first' | 'issued'
export function requiredFieldKeys(source) {
  return HEADER_FIELDS
    .filter((f) => f.required === 'all' || (f.required === 'issued' && source === 'issued'))
    .map((f) => f.key);
}
