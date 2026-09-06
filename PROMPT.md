# Auftrag: bbz Zertifizierungs-Cockpit «Reporting KUBA» (Phase 1)

## Ziel
Read-only Dashboard-SPA, die Prüfungskennzahlen der bbz-Zertifizierung aus dem zentralen Excel
«Reporting_KUBA.xlsx» (SharePoint-Site bbz-Zertifizierung) berechnet, filtert und exportiert.
Nutzer: Mitarbeitende im SharePoint-Tenant (Zugriff mit deren M365-Rechten).
Zweck: Steuerung + jährliche bbz-Award-Prämierung.
Phase 2 (später): Erfassen/Mutieren. Die Architektur muss Phase 2 ohne Umbau ermöglichen.

Lies zuerst `CLAUDE.md` (Projektregeln). Diese gelten dauerhaft.

## Projekt-Umgebung
- Lokal:  C:\Users\markus.baechler\Documents\bbz_vc\bbz-saq
- Repo:   https://github.com/markusbaechler/bbz-saq (public, leer, Branch `main`)
- Pages:  https://markusbaechler.github.io/bbz-saq/ (Trailing Slash!)
- Lokal starten: `python -m http.server 3000` → http://localhost:3000
- Azure App-Registrierung «bbz-saq-SPA» existiert (SPA-Plattform, Redirect-URIs localhost:3000 +
  Pages-URL, Delegated `Files.Read.All`). Client-ID/Tenant-ID trägt der Auftraggeber in config.js ein.
- Datei-Referenz (config.js, nicht hardcodierte IDs):
  ```js
  siteHost: "bbzsg.sharepoint.com",
  sitePath: "/sites/bbz-Zertifizierung",
  filePath: "General/07_KUBA/Reporting_KUBA.xlsx"   // relativ zur Standardbibliothek «Dokumente»
  ```
  Auflösung zur Laufzeit:
  `GET /sites/{siteHost}:{sitePath}` → siteId → `GET /sites/{siteId}/drive` → driveId →
  `GET /drives/{driveId}/root:/{filePath}` → itemId → `GET /drives/{driveId}/items/{itemId}/content`
  Zwischenresultate (siteId/driveId/itemId) nur im Memory cachen.

## Harte Regeln
- Die Excel-Datei wird NIE verändert: keine Spalten hinzufügen, umbenennen, verschieben.
  Alle Normalisierungen passieren ausschliesslich im Code.
- Repo ist public. Tenant-ID/Client-ID/Site-Pfad dürfen in config.js stehen.
  NIE im Repo: Personendaten, echte Testdaten, Screenshots mit Namen, Kopien des Excel.
  `.gitignore`: `*.xlsx`, `/data`, `/local`, `config.local.js`.
- Personendaten nur im Browser-Memory; kein localStorage/sessionStorage/IndexedDB für Daten.
  Namen erscheinen nur in den Ansichten Personen, Offene Vorgänge, Geplante Prüfungen, Bestenlisten und Datenqualität
  sowie in Exporten «nur intern» (E5, E7); nie in URL, Snapshots, Repo.
- Nur Sheets «First Certification» und «Ausgestellte Zertifikate». Alle anderen ignorieren.

## Architektur (Vorbild: https://github.com/markusbaechler/bbz-Fuehrung)
- Vanilla JS (ES-Module), kein Framework, kein Build-Step, GitHub Pages, `.nojekyll`
- Auth: MSAL.js 3.x lokal eingebunden (kein CDN), Azure AD, Scope `Files.Read.All`
- Bibliotheken lokal einbinden: `msal-browser.min.js`, `xlsx.full.min.js` (SheetJS), `fflate` oder `jszip`
- Schichten / Dateien:
  ```
  index.html               Shell, Navigation, Filterleiste
  styles.css               inkl. @media print
  auth.js                  MSAL-Wrapper (Login, Silent-Refresh, Popup-Fallback)
  graph.js                 Graph-HTTP-Wrapper (Auth-Header, Retry bei 429/503 mit Backoff)
  datasource/index.js      Interface: load() → {rows, comments, meta}; write() → Phase 2 (throws NotImplemented)
  datasource/fileAdapter.js     Phase 1: Datei-Download → SheetJS-Parse beider Sheets +
                                Threaded Comments aus xl/threadedComments/*.xml (Attribut ref="B14")
  datasource/workbookAdapter.js Phase 2: Workbook-API (Stub, gleiches Interface, noch nicht implementiert)
  store.js                 State, Normalisierung → Personenmodell, Filter, Data-Quality-Log
  metrics.js               Reine Funktionen (Personen[], Filter) → Kennzahlen. Kein DOM, kein Graph.
  views/*.js               Rendering je View
  export.js                CSV, XLSX (SheetJS), Druckansicht
  config.js                IDs, Pfade, Sheet-Namen, Header-Mapping, Alias-Maps, Profil-Liste
  tests.html               Tests für store-Normalisierung und metrics mit synthetischen Daten
  README.md, DEPLOY.md
  ```

## Datenmodell (am File verifiziert – nicht neu raten)
- Header = **Zeile 10**, Daten ab Zeile 11. Zeilen 1–9 sind Titel/Legende.
- Spalten **ausschliesslich über Header-Namen** mappen. Die zwei Sheets sind NICHT spaltenidentisch:
  Sheet 2 hat zusätzlich «Certificate Number», «Certificate Start Date», «Certificate End Date»
  (Verschiebung +3 ab Spalte AH); dort fehlt zudem «WE6 RUN1 Location» (Verschiebung −1 ab FB).
  Fehlender Pflicht-Header → harter Fehler mit klarer UI-Meldung, kein stiller Fallback.
- Pflicht-Header (Sheet-Varianten in config.js als Alternativen führen):
  `Last Name`, `First Name`, `Role`, `Employer`, `Certificate Program`, `Certificate Language`,
  `Certificate Start Date` (nur Sheet 2),
  `WE All Passed` | `WE All yes`, `WE{1..6} Passed` | `WE{n} yes`,
  `WE{n} RUN{1..3} Passed` | `WE{n} RUN{r} yes`, `WE{n} RUN{r} Date`, `WE{n} RUN{r} Score`, `WE{n} RUN{r} Result`,
  `OE All Passed` | `OE All yes`, `OE{1..2} Passed` | `OE{n} yes`,
  `OE{n} RUN{1..3} Passed` | `OE{n} RUN{r} yes`, `OE{n} RUN{r} Date`, `OE{n} RUN{r} Score`, `OE{n} RUN{r} Result`
- VSS/VSM: Threaded Comment auf Zelle `B{row}` (Muster: `VSM 8718 28.08./05.09.24: Name`,
  `VSS 07.05.2026: Name`). Regex `/\bVSS\b/i` → vss=true, `/\bVSM\b/i` → vsm=true (beides möglich).
  Legacy-Notizen (xl/comments*.xml) enthalten nur Platzhaltertext – ignorieren.
- Normalisierung (Whitelists in config.js; jede Abweichung → Data-Quality-Log mit Sheet/Zeile/Header/Rohwert):
  | Feld | Regel |
  |---|---|
  | Passed | trim; `yes\|YES\|Yes\|PASSED\|fulfilled\|FULFILLED` → true; `no\|No\|FAILED` → false; leer → null; sonst null + DQ |
  | Sprache | trim, upper → DE/FR/IT/EN; sonst null + DQ |
  | Profil | trim + Map `{CCOB→CCoB, Affluent→AFFL}`; kanonisch PK, IK, CWMA, KMU, AFFL, CCoB; sonst Rohwert + DQ |
  | Employer | trim + Alias-Map (z. B. BEKB ≙ Berner Kantonalbank AG, Raiffeisen KB ≙ Raiffeisen, SZKB ≙ Schwyzer Kantonalbank (SZKB)); unbekannt → Rohwert (erweiterbar) |
  | Result | number 0–1 → so; number >1 und ≤100 → /100; Text `89.00%` → 0.89; sonst null + DQ |
  | Score | integer ≥0; sonst null + DQ |
  | Datum | Date-Objekt (SheetJS `cellDates:true`) oder Text `dd.mm.yy(yy)[ / hh.mm\|hh:mm]` → Date; sonst null + DQ |
- Personenmodell:
  ```js
  { source: 'first'|'issued', lastName, firstName, role, employer, employerCanon, profil, sprache,
    vss, vsm, certStart,
    we: [{ part: 1..6, passed, runs: [{ n, passed, date, score, result }] }],
    oe: [{ part: 1..2, passed, runs: [...] }],
    weAllPassed, oeAllPassed, refDate, attemptsTotal }
  ```
- Beide Sheets → eine Personenliste. In Kennzahlen fliessen nur Personen mit ≥1 WE-RUN-Datum.

## Fachliche Regeln
- **Referenzdatum** = Datum des bestandenen OE-Runs (letzter Run mit passed=true).
  Ohne bestandene OE: letztes vorhandenes Prüfungsdatum (nur für Schriftlich-Kennzahlen).
- **Globale Filter** (alle Views): Zeitraum Von–Bis (Datepicker + Jahres-Shortcuts + «Alle», wirkt auf
  Referenzdatum), Profil, Sprache, Bank, VSS/VSM, Versuchsmodus, «nur ausgestellte Zertifikate» (source=issued).
- **Versuchsmodus**: (a) ERSTVERSUCH = nur RUN1 zählt; (b) BESTANDEN = der bestandene Run zählt.
- **Schriftlich Bestehensquote**: Erstversuchsquote (alle vorhandenen WE{n} RUN1 passed=true) UND
  Gesamterfolgsquote (WE All Passed=true) – immer beide ausweisen.
- **Schriftlich Performance** = Mittel der Result-% über vorhandene Teilprüfungen gemäss Versuchsmodus;
  zusätzlich pro Teilprüfung WE1–WE6.
- **Mündlich Bestehensquote** = OE All Passed=true. «1× durchgefallen» = OE1 RUN1=false;
  «2× durchgefallen» = OE1 RUN1=false ∧ RUN2=false. Nenner = Personen mit OE1 RUN1-Datum.
- **Mündlich Performance** = Result-% gemäss Versuchsmodus.
- **Award-Score** = 0.5·Schriftlich-% + 0.5·Mündlich-%; nur Personen mit bestandener OE.
  Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum.
- Alle Quoten mit n (Nenner); Prozent mit 1 Dezimale; Gruppen mit n<5 kennzeichnen.

## Views
1. Übersicht: KPIs gesamt für aktiven Filter
2. Schriftlich: Bestehensquoten ×{gesamt, Profil, Sprache, Bank}; Ø Performance ×{gesamt, Profil, Sprache, Teilprüfung, Bank}
3. Mündlich: Bestehensquote ×{gesamt, Profil} + Anteil 1×/2× durchgefallen; Ø Performance ×{gesamt, Profil, Sprache, Bank}
4. VSS/VSM: Bestehensquoten schriftlich + mündlich für VSS / VSM / ohne, ×Profil
5. Bestenlisten pro Profil (Top 5): beste schriftliche, beste mündliche, bbz-Award
6. Datenqualität: Sheet, Zeile, Header, Rohwert, Grund – sortier- und filterbar

Jede View: Export CSV + XLSX (Aggregate der View) + Druckansicht. Filterzustand im Export-Header.

## Vorgehen (schrittweise; nach jedem Schritt kurze Rückmeldung und auf Bestätigung warten)
1. `config.js` (Header-Mapping inkl. Sheet-Varianten, Aliase, Profile), `store.js`-Normalisierung,
   `metrics.js`, `tests.html` mit synthetischen Testdaten (erfundene Namen, alle Sonderfälle der
   Normalisierungstabelle abgedeckt). Vorlegen, bestätigen lassen.
2. `auth.js`, `graph.js`, `datasource/*` inkl. Threaded-Comment-Parser, Datenqualitäts-View, erster Ladelauf.
3. Views 1–5, `export.js`, `README.md` (Kennzahl-Definitionen), `DEPLOY.md`.
- Fehlerbehandlung: Token-Expiry (Silent → Popup), 429/503 Retry, Datei nicht gefunden,
  fehlende Header → verständliche UI-Meldung.
- Keine Annahmen über Spalten raten. Bei Abweichung vom Header-Mapping: stoppen und fragen.
