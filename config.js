// config.js – zentrale Konfiguration: IDs, Pfade, Sheet-Namen, Header-Mapping, Alias-Maps, Profile.
//
// Regeln (CLAUDE.md):
// - Spalten werden ausschliesslich über Header-Namen (Zeile 10) gemappt, nie über Buchstaben/Indizes.
// - Die zwei Sheets sind nicht spaltenidentisch; Header-Varianten werden hier als Alternativen geführt.
// - Tenant-ID, Client-ID und Site-Pfad dürfen hier stehen (Repo public). Keine Item-/Drive-IDs,
//   keine Secrets. Item-IDs werden zur Laufzeit aufgelöst und nur im Memory gehalten.

export const CONFIG = {
  auth: {
    // Azure App-Registrierung «bbz-saq-SPA» (SPA-Plattform). Öffentliche Kennungen, keine Secrets.
    clientId: '78cf8834-1900-4711-9773-54b3b99d2084',
    tenantId: '3643e7ab-d166-4e27-bd5f-c5bbfcd282d7',
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
  // Phase 2 (PROMPT-2 C.8, Paket E): Schreibpfad nur mit Flag. false = keine Bearbeiten-Elemente, kein Schreibzugriff.
  features: { write: false },
};

// ---------------------------------------------------------------------------
// Whitelists / Alias-Maps der Normalisierungstabelle (PROMPT.md, Datenmodell)
// ---------------------------------------------------------------------------

export const PROFILES = ['PK', 'IK', 'CWMA', 'KMU', 'AFFL', 'CCoB'];

// Rohwert → kanonisches Profil (Vergleich case-insensitiv nach trim)
export const PROFILE_ALIASES = {
  CCOB: 'CCoB',
  Affluent: 'AFFL',
  Affl: 'AFFL',
  AFF: 'AFFL',
  AF: 'AFFL',
  'PK FRZ': 'PK', // französische Durchführung des PK-Profils (in der Datei so erfasst)
};

export const LANGUAGES = ['DE', 'FR', 'IT', 'EN'];

// Eindeutige Kürzel → Sprache (Vergleich case-insensitiv nach trim)
export const LANGUAGE_ALIASES = { D: 'DE', F: 'FR', I: 'IT', E: 'EN' };

// Programmbezeichnungen, die eine Prüfungssprache implizieren (nur wenn «Certificate Language» leer ist)
export const PROFILE_LANGUAGE_HINTS = { 'PK FRZ': 'FR' };

// Teilprüfungen je Profil laut Auftraggeber (05.09.2026): schriftlich PK 1, IK 1, AFFL 2, CWMA 3, KMU 3, CCoB 3 Teile;
// mündlich immer eine Prüfung (OE1). Gilt nach Auskunft des Auftraggebers für alle Jahrgänge.
// Annahme [hypothese, vom Auftraggeber so freigegeben, ggf. zu korrigieren]: die Teile stehen von links in WE1…WEn.
// Bei Abweichung hier korrigieren; die Ansicht «Offene Vorgänge» stellt Vorgabe und Nutzung in den Daten gegenüber.
export const PROFILE_PARTS = {
  PK: { we: [1], oe: [1] },
  IK: { we: [1], oe: [1] },
  AFFL: { we: [1, 2], oe: [1] },
  CWMA: { we: [1, 2, 3], oe: [1] },
  KMU: { we: [1, 2, 3], oe: [1] },
  CCoB: { we: [1, 2, 3], oe: [1] },
};

// Passerelle (Auftraggeber 05.09.2026): Nachfolgeprofil → Vorgängerprofil. Mit bestandenem Vorgängerprofil ist nur ein
// schriftlicher Teil nötig. Wie eine Passerelle in der Datei erfasst ist und welche Spalte der Teil belegt, ist [unklar];
// darum nur Kennzeichnung «Passerelle möglich» (Vorgängerprofil derselben Person bestanden), keine reduzierte Teileliste.
export const PASSERELLE = { IK: 'PK', CWMA: 'AFFL', CCoB: 'KMU' };

// Passed-Felder: Schreibweisen nach trim, Vergleich ohne Gross-/Kleinschreibung. Alles andere → null + Data-Quality-Log.
export const PASSED_TRUE = ['yes', 'YES', 'Yes', 'PASSED', 'fulfilled', 'FULFILLED'];
export const PASSED_FALSE = ['no', 'No', 'FAILED'];

// Employer-Alias → kanonischer Name (Vergleich case-insensitiv nach trim). Unbekannt → Rohwert.
// Erweiterbar; kanonische Namen selbst bleiben unverändert.
export const EMPLOYER_ALIASES = {
  'BEKB': 'Berner Kantonalbank AG',
  'Raiffeisen KB': 'Raiffeisen',
  'SZKB': 'Schwyzer Kantonalbank (SZKB)',
  'Schwyzer Kantonalbank': 'Schwyzer Kantonalbank (SZKB)',
  'BKB': 'Basler Kantonalbank',
  'GKB': 'Graubündner Kantonalbank',
  'LUKB': 'Luzerner Kantonalbank AG',
  'TKB': 'Thurgauer Kantonalbank',
  'UKB': 'Urner Kantonalbank (UKB)',
  'Urner Kantonalbank': 'Urner Kantonalbank (UKB)',
  'NKB': 'Nidwaldner Kantonalbank',
  'OWKB': 'Obwaldner Kantonalbank (OWKB)',
  'Obwaldner Kantonalbank': 'Obwaldner Kantonalbank (OWKB)',
  'APPKB': 'Appenzeller Kantonalbank',
  'Appenzeller Kantonalbank AG': 'Appenzeller Kantonalbank',
  'SGKB': 'St. Galler Kantonalbank',
  'Zuger KB': 'Zuger Kantonalbank',
  'Hypothekarbank Lenzburg': 'Hypothekarbank Lenzburg AG',
  'Banca dello Stato del Canton Ticino': 'Banca dello Stato del Cantone Ticino',
  'Banque Cantonale du Valais': 'Walliser Kantonalbank',
  'Banque cantonale Vaudoise': 'Banque Cantonale Vaudoise',
  'Banca Popolare di Sondrio (SUISSE) SA': 'Banca Popolare di Sondrio (Suisse) SA',
  'BPS Sondrio (Suisse)': 'Banca Popolare di Sondrio (Suisse) SA',
  'BPS (Suisse)': 'Banca Popolare di Sondrio (Suisse) SA',
  'Banca Cramer': 'Banca Cramer & Cie',
  'acrevis Bank St. Gallen': 'acrevis Bank AG',
  'WIR Bank': 'WIR Bank Genossenschaft',
  'Banca Cler': 'Bank Cler AG',
  'PKB Privatbank': 'PKB Privatbank SA',
  'PKB Private Bank SA': 'PKB Privatbank SA',
  'Corner Banca SA': 'Cornèr Banca SA',
  'Corner Banca': 'Cornèr Banca SA',
  'Cornér Banca SA': 'Cornèr Banca SA',
};

// Datumsregeln: plausible Jahre; Zahlen in diesem Bereich gelten als Excel-Serienzahl (Zelle ohne Datumsformat)
export const DATE_RULES = { minYear: 2000, maxYear: 2100, serialMin: 36526, serialMax: 60000 };

// Geburtsdatum (Personenschlüssel, Entscheid E2): plausible Jahrgänge 1920–2010; Serienzahlen entsprechend
// (7306 = 01.01.1920, 40179 = 01.01.2010). Eine nackte Jahreszahl wie 1985 ist damit keine Serienzahl.
export const BIRTH_DATE_RULES = { minYear: 1920, maxYear: 2010, serialMin: 7306, serialMax: 40179 };

// Personenschlüssel (E2): normalisiert aus Last Name, First Name und Geburtsdatum – bewusst NICHT Employer
// (ein Bankwechsel ist dieselbe Person). Header «Birth Date» am File verifiziert (05.09.2026, beide Sheets) → Pflicht-Header.
// Leere Geburtsdatum-Zellen ergeben einen Schlüssel nur aus dem Namen (meta.counts.schluesselOhneGeburtsdatum).
export const PERSON_KEY_FIELDS = ['lastName', 'firstName', 'birthDate'];

// Prüfungsplanung (b4): keine Kapazitäten im Cockpit – Entscheid Auftraggeber 06.09.2026 (Platzgrenzen je Durchführung zu
// unterschiedlich); die Excel-Datei enthält ohnehin keine Kapazitätsdaten. «Geplante Prüfungen» zeigt Termine und Teilnehmende.

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
    { key: 'commLanguage', candidates: ['Communication Language'], required: 'none' }, // Fallback für leere Certificate Language
    { key: 'birthDate',   candidates: ['Birth Date'],             required: 'all' }, // Personenschlüssel (E2), am File verifiziert
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
        fields.push({ key: runKey(g.kind, p, r, 'location'), candidates: [run + ' Location'], required: 'none' }); // Prüfungsort (geplante Prüfungen)
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
