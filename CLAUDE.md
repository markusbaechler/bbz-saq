# CLAUDE.md – Projektregeln bbz-saq

Dashboard-SPA für bbz-Zertifizierungskennzahlen. Datenquelle: Reporting_KUBA.xlsx auf SharePoint.
Vollständige Spezifikation: `PROMPT.md`. Bei Widerspruch gilt diese Datei.

## Unverhandelbar
1. **Struktur der Excel-Datei nie verändern** (E10). Keine Spalten hinzufügen, umbenennen, verschieben, keine Formate ändern,
   keine neuen Zeilen oder Sheets. Alle Normalisierung im Code (config.js / store.js). Zellwerte nur über den Schreibpfad
   (`datasource/workbookAdapter.js`, Paket E): Feature-Flag `CONFIG.features.write` (Standard false), Validierung mit den Parsern,
   Konfliktprüfung (eTag, Zellwert), Audit-Datei neben der Excel, danach Neuladen – nie ein direkter Schreibzugriff aus Views.
2. **Spalten nur über Header-Namen (Zeile 10) mappen.** Nie über Spaltenbuchstaben oder Indizes.
   Die zwei Sheets sind nicht spaltenidentisch. Fehlender Pflicht-Header = harter Fehler, kein Fallback.
3. **Keine Personendaten im Repo.** Keine echten Namen in Tests, Fixtures, Kommentaren, Screenshots, Commits.
   Testdaten sind synthetisch. `*.xlsx` ist gitignored.
4. **Keine Persistenz von Daten im Browser.** Kein localStorage/sessionStorage/IndexedDB für Personendaten
   oder Aggregate. Nur Memory. MSAL darf sessionStorage für Tokens nutzen.
5. **Repo ist public.** Tenant-ID, Client-ID, Site-Pfad sind erlaubt. Secrets, Tokens, Item-IDs mit
   Personenbezug sind es nicht.
6. **Nur Sheets «First Certification» und «Ausgestellte Zertifikate».** Andere Sheets nie lesen.
7. **Keine Annahmen über Datenstruktur raten.** Bei Abweichung vom dokumentierten Mapping: stoppen, fragen.

## Architektur
- Vanilla JS ES-Module, kein Framework, kein Build-Step, GitHub Pages. Bibliotheken lokal (kein CDN).
- Schichten strikt trennen: `datasource/` (I/O) → `store.js` (Normalisierung, State) → `metrics.js`
  (reine Funktionen, kein DOM, kein Graph) → `views/` (Rendering).
- `datasource/index.js` ist das einzige Interface nach aussen. Phase 1 = fileAdapter (Download + Parse).
  Phase 2 = workbookAdapter (Schreiben). Views/Metrics dürfen nie direkt auf Graph zugreifen.
- Neue Kennzahl = Funktion in `metrics.js` + Test in `tests.html` + Definition in README.

## Konventionen
- Sprache in UI und Doku: Deutsch (Schweiz), «ss» statt «ß».
- Prozent 1 Dezimale, immer mit n (Nenner). Gruppen n<5 kennzeichnen.
- Jede nicht interpretierbare Zelle landet im Data-Quality-Log (Sheet, Zeile, Header, Rohwert, Grund),
  nie stilles Überspringen.
- Commits klein und thematisch; Commit-Messages deutsch, Imperativ.
- Nach jedem Arbeitsschritt (siehe PROMPT.md, Vorgehen) kurze Zusammenfassung und auf Bestätigung warten.

## Lokal
- `python -m http.server 3000` → http://localhost:3000
- Tests: `tests.html` im Browser öffnen oder `node tests/run-node.js`; alle Tests müssen grün sein, bevor Views geändert werden.
- CI: `.github/workflows/tests.yml` führt bei Push auf `main` und bei Pull Requests Syntaxprüfung, Tests und den
  README-Glossar-Abgleich (`node tools/glossar-readme.js --write` muss keine Änderung ergeben) aus, dazu den
  Browser-Smoke-Test `node tests/smoke/run.mjs` (Playwright/Chromium; `tests/smoke` ist das einzige npm-Paket, nur Tests).
  Neue Ansicht oder Interaktion = Prüfung im Smoke-Test ergänzen.
