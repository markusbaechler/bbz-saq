# PROMPT-2.md – Auftrag: bbz Zertifizierungs-Cockpit «Reporting KUBA», Ausbau

Stand: 06.09.2026, Fassung 2 (optimiert; Änderungen gegenüber Fassung 1 in Anhang A6) · Auftraggeber: Markus Baechler ·
Ausführung: Claude Code (CC) im Repo `markusbaechler/bbz-saq`, lokaler Klon `C:\Users\markus.baechler\Documents\bbz_vc\bbz-saq`.
Ausgangsstand des Codes: `origin/main` = `7bb9966` (06.09.2026) oder neuer. Diese Datei liegt nach Schritt 0 als `PROMPT-2.md` im Repo-Wurzelverzeichnis.

Dieses Dokument setzt auf `PROMPT.md` (Phase 1, umgesetzt) auf und beschreibt fünf Arbeitspakete:

| Paket | Inhalt | Art |
|---|---|---|
| **A** | Design-System und Informationsarchitektur (Fundament) | Umbau ohne fachliche Änderung |
| **B** | Mobile Darstellung (reduziert) | Umbau ohne fachliche Änderung |
| **C** | Personen-Layer: Suche und Pfad einer Person | Neue Ansicht |
| **D** | Experten-Layer: Statistik je Experte der mündlichen Prüfung | Neue Datenfelder, Kennzahlen, Ansicht |
| **E** | Mutation: minimaler Schreibpfad in die Excel (Phase 2) | Spike mit Go/No-Go, dann Umsetzung |

## Lesehinweise für CC

- **Rangfolge bei Widerspruch:** `CLAUDE.md` > `PROMPT-2.md` > `PROMPT.md` > `README.md`. Wo dieses Dokument eine Regel
  präzisiert (Abschnitt 0.3), wird `CLAUDE.md` bzw. `README.md` im selben Schritt nachgeführt.
- **Kennzeichnungen:** `[verifiziert]` = am 06.09.2026 an `origin/main` (7bb9966) und an der Live-App geprüft, gilt als gesichert ·
  `[hypothese]` = plausible Annahme, am File oder im Code zu verifizieren · `[unklar]` = offen, Auftraggeber fragen ·
  `[entscheid: …]` = vom Auftraggeber getroffen · `[optional]` = nur bei Zeit, nie auf Kosten des Pflichtumfangs.
- **⛔ Stop-and-Ask:** an diesen Stellen anhalten, Befund vorlegen, Bestätigung abwarten. Nichts raten (CLAUDE.md, Regel 7).
- **Arbeitsweise:** Schritte als Checkboxen. Nach **jedem Schritt** Bericht nach Vorlage (0.8) und auf Freigabe warten
  `[entscheid 06.09.2026: Freigabe nach jedem Schritt]`. Ein Schritt = ein oder wenige kleine Commits, deutsch, Imperativ (0.7).
- **Entscheide je Paket gebündelt:** Jedes Paket beginnt mit dem Block «⛔ Entscheide vor Start». CC stellt alle Fragen dieses Blocks
  in **einer** Nachricht (je Frage Empfehlung und Begründung) und wartet. Danach keine weiteren Rückfragen zu diesen Punkten.
  Ausnahme: ⛔-Punkte, die von Befunden abhängen (D.2 Header, E.1 Spike).
- **Keine Personendaten** in Code, Tests, Fixtures, Screenshots, Commits, Issues, PR-Texten und in Berichten an den Auftraggeber
  (auch keine Namen aus `local/Reporting_KUBA.xlsx`). Synthetische Daten aus `tests/smoke/synth.mjs` bzw. `tests/fixtures.js`
  verwenden und dort erweitern (Anhang A5). Erfundene Namen der Erstfassung: «Muster Anna», «Beispiel Ben», «Testbank AG», «Musterbank».
- **Datei-Karte** `[verifiziert]` (damit nichts geraten wird):

| Ansicht (`id`) | Datei | Gruppe (A.2) |
|---|---|---|
| Übersicht (`uebersicht`) | `views/overview.js` | Kennzahlen |
| Schriftlich (`schriftlich`) | `views/written.js` | Kennzahlen |
| Mündlich (`muendlich`) | `views/oral.js` | Kennzahlen |
| VSS/VSM (`vss-vsm`) | `views/vssVsm.js` | Kennzahlen |
| Zeitverlauf (`zeitverlauf`) | `views/zeitverlauf.js`, Diagramm `views/chart.js` | Kennzahlen |
| Bank-Report (`bank-report`) | `views/bankReport.js` | Kennzahlen |
| Personen (`personen`, neu, Paket C) | `views/personen.js` | Personen |
| Offene Vorgänge (`offene-vorgaenge`) | `views/offen.js` | Personen |
| Geplante Prüfungen (`geplante-pruefungen`) | `views/planned.js` | Personen |
| Bestenlisten (`bestenlisten`) | `views/ranking.js` | Personen |
| Experten (`experten`, neu, Paket D) | `views/experten.js` | Experten |
| Historie (`historie`) | `views/historie.js`, `snapshot.js` | Daten |
| Datenqualität (`datenqualitaet`) | `views/dataQuality.js` (Aufruf in `app.js`) | Daten |
| Glossar (`glossar`) | `views/glossar.js`, Daten in `glossary.js` | Daten |

  Weitere Bausteine: `urlState.js` (Hash ↔ Filter/Anzeige, `DEFAULT_UI`, `serializeState()`), `snapshot.js` (`buildSnapshot()`,
  `snapshotJson()`, Dateiname `cockpit-snapshot-<stichtag>.json`), `tests/smoke/{run,server,synth}.mjs` (Playwright),
  `tools/glossar-readme.js` (README-Abschnitt aus `glossary.js`), `tools/modellbericht.js` (Muster für Node-Werkzeuge: `parseWorkbook()` +
  `normalizeWorkbook()` mit SheetJS/fflate aus `lib/` via `createRequire`), `.github/workflows/tests.yml` (Jobs `tests` = Node 22:
  Syntaxprüfung, `node tests/run-node.js`, Glossar-Abgleich; `smoke` = Playwright/Chromium, Screenshots als Artefakt bei Fehlern).

---

## 0 Rahmen

### 0.1 Ziel des Ausbaus

Das Cockpit rechnet fachlich richtig (Phase 1), ist aber optisch verschachtelt, führt den Blick nicht, ist auf dem Smartphone
nicht brauchbar und kennt weder den Weg einer einzelnen Person noch die Experten der mündlichen Prüfung. Ziel: ein
aufgeräumtes, visuell geführtes, auch mobil nutzbares Cockpit mit zwei neuen Ebenen (Person, Experte) und einem
vorbereiteten, minimalen Schreibpfad.

### 0.2 Ist-Befund (verifiziert 06.09.2026 an `origin/main` 7bb9966 und Live-App)

Jede Vorgabe in den Paketen A und B verweist auf eine Befundnummer.

| Nr. | Befund | Fundstelle |
|---|---|---|
| B1 | 12 Ansichten als flache Tab-Reihe, auf 1237 px in zwei Zeilen umgebrochen; keine Gruppierung | `app.js` `VIEWS`, `renderNav()`; `.views` in `styles.css` |
| B2 | Statuszeile mit rund 30 technischen Angaben in einem Satz (Zeilen, Sheets, Duplikate, DQ-Zähler, Schlüssel ohne Geburtsdatum) | `app.js` `renderStatus()`, `#status` |
| B3 | Filterleiste mit 8 Steuerelementen und 10 Jahres-Buttons in zwei Zeilen; Zusammenfassung als langer Fliesstext | `app.js` `buildFilterBar()`, `updateFilterBar()` |
| B4 | Jede View beginnt mit einem mehrzeiligen Erklärungsabsatz vor den Zahlen | z. B. `views/overview.js` erster `p.meta-list` |
| B5 | Export-Leiste mit bis zu fünf Buttons und zwei Beschriftungen je View | `views/common.js` `exportBar()` |
| B6 | Jede KPI-Kachel trägt einen Definitionsabsatz (`kpi-hint`); Benchmark als Text ohne Richtung oder Farbe | `views/common.js` `renderKpis()`, `views/tables.js` `overviewModel()` |
| B7 | Rund 18 Kacheln in einer ungeordneten `auto-fill`-Reihe; Mengen, schriftlich und mündlich gemischt | `.kpis` in `styles.css` |
| B8 | Tabellen mit bis zu 14 Spalten, horizontaler Scroll ohne fixierte erste Spalte; Titel doppelt (`h3` der Section und `caption`) | `views/common.js` `section()` + `renderTable()` |
| B9 | Mehrzeilige Fussnote (`note`) unter jeder Tabelle, teils identisch wiederholt (`SMALL_NOTE`) | `views/tables.js` |
| B10 | Kein visuelles Encoding: Prozentwerte, Status und Differenzen nur als Text; einzige Farbe: `tr.small` kursiv grau | `styles.css` |
| B11 | Genau ein Breakpoint (`max-width: 700px`), der nur Ränder verkleinert; Kacheln, Tabellen, Filter nicht reduziert | `styles.css` |
| B12 | Diagramm mit fester Breite 820 und rechtem Rand 250 für Endbeschriftungen; skaliert auf dem Smartphone unleserlich `[verifiziert: `width = 820`, `pad.right = 250` in `renderLineChart()`]` | `views/chart.js` `renderLineChart()` |
| B13 | Gute Basis: CSS-Tokens (Farben inkl. `--panel-2`, `--warn`, `--series-1…3`, `--viz-*`, Radius), Dark Mode über `prefers-color-scheme`, sichtbarer Tastaturfokus, Druck (immer hell), `el()`-Helfer, reine Tabellenmodelle `{ title, columns: [{ key, label }], rows, note }` | `styles.css`, `views/common.js`, `views/tables.js` |
| B14 | Personenschlüssel, Vorgänge, Runs, Status, Referenzdatum, Passerelle, Duplikate sind im Store vorhanden – der Pfad einer Person ist berechenbar, aber nirgends sichtbar | `store.js` (`normalizeSheet()` ab Zeile ~362, Personenobjekt ab ~440, `deriveFields()` ab ~541), `metrics.js` |
| B15 | Kein Experten-Header gemappt; «Expert» kommt in keiner Quelldatei vor `[verifiziert: git grep]` | `config.js` `buildHeaderFields()` |
| B16 | Namensregel: Namen nur in Bestenlisten, Geplante Prüfungen, Offene Vorgänge, Datenqualität (und Exporte «nur intern») | `README.md` Abschnitt Datenschutz, `PROMPT.md` Harte Regeln |
| B17 | Smoke-Test prüft `#nav a` (≥ 8), `#status` (Text enthält «Vorgänge», «Duplikate», «Data-Quality-Log»), `#filterbar .summary` (u. a. «Profil: PK», «Bank: alle»), `#view h2`, `.kpi`/`.kpi-label`/`.kpi-value`, `tr.expandable`, `details.fold` (beforeprint/afterprint), `.dq-text` (Debounce, Fokus bleibt), Bank-Report ohne Namen, leerer `localStorage`/`sessionStorage`; Screenshots je Ansicht, `print-geplante-pruefungen`, `dark-*`; Viewport 1400 × 1000 | `tests/smoke/run.mjs` |

### 0.3 Regeln: unverändert und präzisiert

Unverändert gelten alle Regeln aus `CLAUDE.md` (Stand `origin/main`, inkl. CI-Absatz): Spalten nur über Header Zeile 10, nur zwei Sheets,
keine Persistenz, keine Personendaten im Repo, Vanilla JS ohne Framework/Build/CDN, Schichten `datasource → store → metrics → views`,
neue Kennzahl = Funktion in `metrics.js` + Test + Glossar-Eintrag, neue Ansicht oder Interaktion = Prüfung im Smoke-Test.

Entscheide des Auftraggebers (06.09.2026), die bestehende Regeln präzisieren – ins Entscheid-Log (README «Modell») aufnehmen:

| Nr. | Entscheid | Wirkung |
|---|---|---|
| **E7** | Namen dürfen zusätzlich in der Ansicht **Personen** (Paket C) erscheinen. Nutzerkreis bleibt bbz-intern; keine Namen in URL, Snapshots, Repo. | README «Datenschutz» und «Ansichten», `PROMPT.md` Harte Regeln («Namen erscheinen nur in …»). `CLAUDE.md` bleibt unverändert (Regel 3 betrifft das Repo, nicht die UI). |
| **E8** | Expertennamen dürfen in der Ansicht **Experten** (Paket D) erscheinen; sie sind Personal, keine Kandidaten. | wie E7 |
| **E9** | Die mündliche Prüfung prüft Methodik; Ergebnisse sind **profilübergreifend vergleichbar**. Benchmark je Experte = alle Experten im Filter, getrennt nach Erstversuch und Wiederholung; Profil und Sprache nur als Aufschlüsselung. | Kennzahl-Definitionen Paket D |
| **E10** | **Regel 1 präzisiert:** Die *Struktur* der Excel-Datei (Sheets, Spalten, Header, Formate, Formeln) wird nie verändert. *Zellwerte in bestehenden Spalten* dürfen ausschliesslich über den Schreibpfad von Paket E geändert werden (Feature-Flag, Validierung, Konfliktprüfung, Audit). Scope `Files.ReadWrite.All` ist in der Azure-App-Registrierung bereits gesetzt. | `CLAUDE.md` Regel 1, `config.js` `auth.scopes` (erst in Paket E) |

**Entscheid-Log heute** `[verifiziert]`: README «Modell» nennt im Titel E1–E4; E5 (Export auf Vorgangsebene enthält Namen, Nutzerkreis intern)
und E6 (Result ist massgebend, Score wird nicht ausgewertet) sind nur im Glossar und in der Normalisierungstabelle referenziert, nicht als
Log-Einträge. In Schritt A.8 das Log als Liste **E1–E10** vervollständigen (Text für E7–E10 in Anhang A4; E1–E6 aus README/Glossar zusammenziehen).

### 0.4 Definition of Done (je Paket)

- [ ] `node tests/run-node.js` grün; neue Funktionen in `metrics.js`/`store.js`/`views/tables.js` mit Tests (synthetische Daten).
- [ ] `node tests/smoke/run.mjs` grün; jede neue Ansicht und Interaktion im Smoke-Test ergänzt (CLAUDE.md, Lokal).
- [ ] `README.md` und `glossary.js` nachgeführt; `node tools/glossar-readme.js --write` ergibt keine Änderung.
- [ ] Keine Personendaten in Repo, Screenshots (`tests/smoke/output/` bleibt gitignored), Commit- und PR-Texten, Berichten.
- [ ] Zahlen unverändert, wo keine fachliche Änderung beabsichtigt ist (A, B): Snapshot der synthetischen Datei über
      `tools/snapshot-synth.js` (Schritt 0.3) vor und nach dem Paket identisch bis auf die Zeitstempel-Felder (`stichtag`, `erzeugt`, `quelle.geaendert`).
- [ ] Dark Mode und Druck geprüft (Smoke-Screenshots `dark-*`, `print-*`).
- [ ] Pull Request des Pakets: CI-Jobs `tests` und `smoke` grün; Beschreibung nach Vorlage 0.8; keine Screenshots, keine Excel-Dateien im PR.
- [ ] Abnahme-Bericht (0.8) an den Auftraggeber, Freigabe erhalten; Merge gemäss 0.7.

### 0.5 Reihenfolge und Meilensteine

`A → B → C → D → E`. Neue Ansichten (C, D) entstehen direkt im neuen Layout; kein doppelter Umbau. Paket E beginnt mit dem
Spike; die Umsetzung E2 nur nach Go. Innerhalb eines Pakets die Schritte in der angegebenen Reihenfolge; Tests vor Views (CLAUDE.md).
Paket n + 1 beginnt erst, wenn Paket n auf `main` gemerged ist (0.7); der Block «Entscheide vor Start» des nächsten Pakets wird mit dem
Abnahme-Bericht des vorherigen Pakets gestellt, damit keine Leerlaufrunde entsteht.

### 0.6 Arbeitsumgebung und Schritt 0 (Vorbereitung)

**Umgebung** `[verifiziert 06.09.2026]`: Windows 11, Node v24.16.0, npm 11.13.0, Python 3.12.10. Playwright-Browser liegen im Cache
(`%LOCALAPPDATA%\ms-playwright`, chromium-1228/1234); `tests/smoke/node_modules` fehlt lokal (→ `npm ci`). Die CI läuft mit Node 22:
keine APIs verwenden, die erst ab Node 24 existieren. Lokaler Server: `python -m http.server 3000` (`.claude/launch.json`, Name `bbz-saq`).

**Repo-Stand** `[verifiziert 06.09.2026]`: Der lokale Klon stand auf `b8ded57` und war **26 Commits hinter `origin/main`** (`7bb9966`);
Arbeitsbaum sauber, kein lokaler Vorsprung, kein Stash. Die lokale `CLAUDE.md` ist deshalb veraltet (CI-Absatz fehlt); nach dem Pull gilt
die Fassung von `origin/main`. Der Ist-Befund (0.2) und alle Fundstellen dieses Dokuments beziehen sich auf `origin/main`.

**Lokale Datei**: `local/Reporting_KUBA.xlsx` (gitignored) liegt auf dieser Maschine. Sie darf für die Header-Verifikation (D.2) und den
Modellbericht gelesen werden `[entscheid 06.09.2026]`. Nie Zellwerte ausgeben, nie ins Repo, nie in Berichte oder Screenshots.

**Schritt 0** (vor Paket A; ein Bericht, dann Freigabe):

- [x] **0.1 Synchronisieren:** `git status` (sauber) · `git fetch origin` · `git pull --ff-only origin main` · `git log -1` zeigt `7bb9966` oder neuer.
      Bei lokalem Vorsprung, Konflikt oder unsauberem Arbeitsbaum: ⛔ (nichts verwerfen).
- [x] **0.2 Test-Tooling:** `cd tests/smoke && npm ci`. `npx playwright install chromium` nur, wenn `node tests/smoke/run.mjs` den Browser nicht findet.
      Auf dem Gerät des Auftraggebers bleibt `playwright install` beim Entpacken nach `chrome.dll` hängen (06.09.2026 zweimal reproduziert,
      vermutlich Virenschutz); lokal stattdessen `SMOKE_CHROMIUM=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe`
      setzen (Headless-Shell wie in der CI; die CI unter Linux ist nicht betroffen).
- [x] **0.3 Baseline:** `node tests/run-node.js`, `node tests/smoke/run.mjs`, `node tools/glossar-readme.js --write` (danach `git status` unverändert).
      `tools/snapshot-synth.js` anlegen (Muster `tools/modellbericht.js`: synthetische Datei aus `tests/smoke/synth.mjs` → `parseWorkbook()` →
      `normalizeWorkbook()` → `buildSnapshot({ persons, meta, today: fester Stichtag })` → JSON nach stdout oder Datei). Baseline-Snapshot und
      Smoke-Screenshots lokal ablegen (`tests/smoke/output/`, nicht committen). Alles grün, sonst ⛔.
      `[optional]` Golden-File `tests/fixtures/snapshot-synth.json` als Regressionstest in Job `tests` (nur synthetische Daten).
- [x] **0.4 Branch und Auftrag:** Branch `paket-a-design-system` von `main`; diese Datei als `PROMPT-2.md` ins Repo-Wurzelverzeichnis;
      Commit «Füge PROMPT-2.md hinzu: Auftrag Ausbau, Pakete A–E»; Push; Draft-PR «Paket A – Design-System und Informationsarchitektur» (0.7).
      Bericht nach 0.8 → Freigabe → Schritt A.1.

### 0.7 Git-Workflow `[entscheid 06.09.2026]`

- **Branch je Paket**, von `main` nach dem Merge des Vorpakets: `paket-a-design-system`, `paket-b-mobile`, `paket-c-personen`,
  `paket-d-experten`, `paket-e-mutation`.
- **Commits** klein und thematisch, deutsch, Imperativ (z. B. «Filterleiste: Jahr als Auswahlfeld, Chips für aktive Filter»). Ein Schritt darf
  mehrere Commits haben; nie mehrere Schritte in einem Commit. Push nach jedem Schritt, damit die CI je Schritt läuft.
- **Pull Request** als Draft nach dem ersten Push des Pakets (Titel «Paket X – …», Beschreibung nach 0.8, laufend nachgeführt). Bei der
  ⛔ Abnahme: Draft aufheben, DoD-Checkliste (0.4) abgehakt. **Merge durch den Auftraggeber** (oder durch CC auf ausdrückliche Anweisung
  «merge») als Merge-Commit wie bei #1–#8. Kein Force-Push, kein Rebase veröffentlichter Commits.
- **Bei Abweichungen vom Dokument** (Code anders als beschrieben, Header anders als angenommen): ⛔ vor dem Commit, Befund mit Fundstelle.
- Nie im PR oder in Commits: Screenshots, Excel-Dateien, Namen aus der echten Datei.

### 0.8 Berichtsvorlagen (Ausgabeformat)

**Schrittbericht** (nach jedem Schritt, höchstens 12 Zeilen, keine Namen):

```
Schritt A.3 – Shell (Datenstand, Navigation, Untertitel) · Branch paket-a-design-system · Commits: a1b2c3d «…», d4e5f6a «…»
Geändert: app.js, index.html, styles.css, tests/smoke/run.mjs
Tests: run-node ✅ 312/312 · smoke ✅ 1400×1000 · glossar-readme ✅ unverändert · contrast ✅ (ab A.2)
Snapshot: identisch bis auf Zeitstempel | n. a. (Paket C–E)
Abweichungen vom Dokument: keine | <Befund mit Fundstelle>
Offen: <Punkte oder «keine»>
Nächster Schritt: A.4 – Filterleiste. Warte auf Freigabe.
```

**⛔-Nachricht** (Stop-and-Ask): Befund mit Fundstelle · höchstens drei Optionen mit ihrer Wirkung · Empfehlung mit Begründung · eine konkrete
Frage. Keine Umsetzung vor der Antwort.

**Entscheide vor Start** (je Paket, eine Nachricht): nummerierte Fragen des Blocks, je Frage Empfehlung und Begründung in je einem Satz;
der Auftraggeber antwortet mit «alle wie empfohlen» oder mit Abweichungen je Nummer.

**Abnahme-Bericht** (je Paket): DoD-Checkliste (0.4) abgehakt mit Nachweis (Befehl, Ergebnis) · PR-Link · nachgeführte Doku-Stellen (README,
`glossary.js`, `CLAUDE.md`, `PROMPT.md`) · neue Entscheid-Log-Einträge · bekannte Restpunkte · Block «Entscheide vor Start» des nächsten Pakets.

**PR-Beschreibung:** Paket und Ziel in zwei Sätzen · Schritte mit Commits · DoD-Checkliste · «Zahlen unverändert: ja/nein (Snapshot)» ·
«Keine Personendaten» · offene Entscheide.

---

## Paket A – Design-System und Informationsarchitektur

> **⛔ Entscheide vor Start – entschieden 06.09.2026:** (1) Navigation in vier Gruppen Kennzahlen · Personen · Experten · Daten (A.2): **ja**.
> (2) Jahr als `<select>` statt zehn Buttons (A.2): **ja**. Keine offenen Entscheide; A.12 dokumentiert den Stand.

### A.0 Ziel und Nicht-Ziele

Ziel: dieselben Inhalte mit klarer Hierarchie (Shell → Filter → View-Kopf → Kennzahlen → Tabellen → Hinweise), weniger Text, mehr
visuelle Anhaltspunkte. Nicht-Ziel: keine Änderung an Kennzahlen, Nennern, Filtern, Exporten, Druck. `metrics.js` bleibt unberührt.

### A.1 Design-Tokens (`styles.css`)

Bestehende Tokens bleiben (B13). Ergänzen, Light und Dark:

```css
/* Abstände (4-px-Raster) und Schriftgrade */
--space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem;
--fs-xs: .75rem; --fs-sm: .85rem; --fs-md: 1rem; --fs-lg: 1.2rem; --fs-xl: 1.75rem;   /* xl nur KPI-Wert */
/* Status (semantisch, an bestehende Tokens gebunden) */
--status-bestanden: var(--ok); --status-nicht: var(--danger); --status-offen: var(--accent);
--status-passiv: var(--warn); --status-geplant: #6b5bd6;           /* Dark: #a89cf5 [hypothese: Kontrast prüfen] */
--status-bestanden-bg / --status-nicht-bg / --status-offen-bg / --status-passiv-bg / --status-geplant-bg  /* 12–15 % Fläche */
/* Differenz zum Benchmark */
--delta-pos: var(--ok); --delta-neg: var(--danger); --delta-neutral: var(--muted);
/* Datenbalken in Tabellen */
--bar: color-mix(in srgb, var(--accent) 18%, transparent);       /* Fallback rgba(11,95,165,.18) bzw. Dark rgba(106,166,230,.22) */
```

Regeln: Farbe trägt nie allein Bedeutung (immer Vorzeichen, Text oder Symbol dazu). Kontrast Text ≥ 4.5:1, Flächen/Linien ≥ 3:1 in
Light, Dark und Druck (die Druck-Tokens stehen bereits in `@media print`, B13). CC ergänzt `tools/contrast.js` (reine Funktion, Node, ohne
Abhängigkeiten): liest die Token-Werte aus `styles.css` für Light, Dark und Druck, prüft alle Paare Text-auf-Fläche und schlägt fehl bei
Unterschreitung; Aufruf im Job `tests` der CI (`.github/workflows/tests.yml`, existiert). `color-mix()` ist in Chrome/Edge ab Version 111
verfügbar; der rgba-Fallback steht davor (`@supports not (color: color-mix(in srgb, red, blue))` oder Doppeldeklaration) `[hypothese: Zielgeräte
bbz sind aktuelle Edge/Chrome; am Zielgerät prüfen]`.

### A.2 Shell: Kopf, Datenstand, Navigation, Filterleiste

**Kopf** (`index.html`, `.app-header`): unverändert Brand + Session; Untertitel «Reporting KUBA · Phase 1 (nur lesen)» wird zu
«Reporting KUBA» (die Phase steht in README).

**Datenstand** (B2; `app.js` `renderStatus()`, `#status` in `.databar`): sichtbar nur ein Einzeiler `Datenstand: Reporting_KUBA.xlsx · geändert
04.09.2026 16:02 · geladen 09:39 · 4053 Zeilen · DQ 167 Fehler`. Alle übrigen Zähler in `<details class="datastand">` als zweispaltige Liste
(Zeilen je Sheet, Vorgänge, Personen, Duplikate, kennzahlrelevant, offen, nicht erfasst, DQ Fehler/Hinweise/nicht ausgewertet,
Schlüssel ohne Geburtsdatum). Der vollständige Text bleibt im `#status`-Element (`aria-live`, Smoke-Test B17); der Einzeiler ist die
`summary`. Fehlerzähler > 0 mit `--warn`-Farbe.

**Navigation** (B1; `app.js` `VIEWS`, `renderNav()`): jede View erhält `group` `[entscheid 06.09.2026: Gruppierung bestätigt]`:

| Gruppe | Ansichten (Reihenfolge) |
|---|---|
| Kennzahlen | Übersicht · Schriftlich · Mündlich · VSS/VSM · Zeitverlauf · Bank-Report |
| Personen | Personen (C) · Offene Vorgänge · Geplante Prüfungen · Bestenlisten |
| Experten | Experten (D) |
| Daten | Historie · Datenqualität · Glossar |

Rendering: `<nav id="nav">` mit vier `<div class="nav-group">` (kleine Gruppenbeschriftung, darunter die Links). Ab 1100 px eine
Zeile; darunter horizontal scrollbar (`overflow-x: auto`, `scroll-snap`), nie umbrechend. Selektor `#nav a` bleibt (B17). Die Links tragen
weiterhin den Filterzustand im Hash (`buildHash()`, `urlState.js`). `aria-current="page"` bleibt. Aktive Ansicht: Akzentfarbe + 2-px-Unterstrich
statt «Reiter»-Optik. Die Gruppen Personen und Experten enthalten bis Paket C bzw. D nur die bestehenden Ansichten; die Gruppe Experten wird
erst mit Paket D gerendert (leere Gruppen nicht anzeigen).

**Filterleiste** (B3; `app.js` `buildFilterBar()`/`updateFilterBar()`): `position: sticky; top: 0` unter der Navigation, eine Zeile
auf Desktop. Reihenfolge: Zeitraum (Von/Bis) · Jahr als `<select>` mit Optionen «Alle» + Jahre (ersetzt die zehn Buttons; Auswahl setzt
Von/Bis wie heute) `[entscheid 06.09.2026: bestätigt]` · Profil · Sprache · Bank · VSS/VSM · Versuche · Checkbox Zertifikate · Reset. Reset nur
sichtbar, wenn ein Filter vom Standard abweicht. Die Zusammenfassung (`.summary`, B17) wird kurz: `479 Vorgänge · 479 Personen` plus
**Filter-Chips** für jede aktive Einschränkung (`2026 ✕`, `Profil PK ✕`, …); Klick auf ✕ setzt nur diesen Filter zurück. Fokusregel bleibt:
Steuerelemente werden aktualisiert, nicht neu gebaut (`filterBar.controls`, `setSelect()`); Chips werden in einem eigenen Container ersetzt.
Textformat der Zusammenfassung für den Smoke-Test anpassen (Prüfungen auf `Profil: PK` und `Bank: alle` → Chip-Text `Profil PK` bzw. kein
Bank-Chip); Exporte behalten `filterLines()` unverändert. Mehrfachauswahl aus der URL (heute Hinweistext) wird als je ein Chip je Wert gezeigt.

### A.3 View-Kopf

Jede View beginnt mit: `h2` Titel · ein Satz Kurzbeschreibung (max. 160 Zeichen, `p.view-intro`) · rechts eine Leiste mit
**einem** Export-Menü und einem Link «Definitionen» (B4, B5).

- Export-Menü: `<details class="menu">` mit `summary` «Export» und Einträgen CSV, XLSX, Druckansicht, sowie – wo vorhanden –
  «Vorgangsebene CSV/XLSX (mit Namen, nur intern)». Ersetzt `exportBar()`; Funktionen aus `export.js` unverändert; `noPersonExport` und
  `isStatic` (Glossar) bleiben wirksam.
- «Definitionen» verlinkt auf `#glossar` mit Anker je Ansicht (`views/glossar.js`: `id`-Attribute je Begriff, Anker-Konvention
  `glossar-<slug>`). Die heutigen Einleitungsabsätze wandern in ein `renderCollapsible('Hinweise zu dieser Ansicht', …)` am Ende der View
  (siehe A.5 Legende) oder – wo Definition – ins Glossar.

### A.4 KPI-Kacheln

Struktur (B6, B7; `views/common.js` `renderKpis()`, `views/tables.js` `overviewModel()`):

```
┌ Schriftlich: im 1. Versuch bestanden  ⓘ ┐
│ 66.0 %                                   │
│ 316 von 479 Vorgängen                    │
│ ▲ +2.1 pp  vs. Alle Banken (66.0 %)      │   ← nur wenn Benchmark aktiv und Kennzahl keine Menge
└──────────────────────────────────────────┘
```

- `kpi-hint` verschwindet aus der Kachel; Definition als `title` des ⓘ und als Glossar-Anker (`kpi-label` wird Link auf `#glossar-…`).
- Differenz: `formatPp()` wie in `comparisonTable()`. Farbe nach **Richtung je Kennzahl**: `overviewModel()` gibt je KPI
  `direction: 'up' | 'down' | 'neutral'` mit (`up` = höher ist besser: bestanden, Ø Resultat; `down` = tiefer ist besser: durchgefallen,
  passiv; `neutral` = Mengen). |Δ| < 0.5 pp → `--delta-neutral`, Symbol «●». Nie nur Farbe (Symbol ▲▼● + Vorzeichen).
- Gruppierung in drei Blöcke mit `h3`: **Mengen** (Vorgänge, Personen, offen, passiv, nicht erfasst, VSS/VSM, Zertifikate, Personen mit
  mehreren Profilen, geplante Termine) · **Schriftlich** (5 Kacheln) · **Mündlich** (5 Kacheln). `kpis` im Modell erhalten `group`.
- Mengen-Kacheln kleiner (`.kpi.count`: Wert `--fs-lg`), Quoten-Kacheln mit Wert `--fs-xl`. Kachel mit n < 5: Wert gedämpft + «*» (wie heute).
- Kachelbreite `minmax(13rem, 1fr)`; Zeilenumbruch nur innerhalb einer Gruppe.

### A.5 Tabellen

Modell bleibt `{ title, columns, rows, note }` (B13). Erweiterungen in `views/tables.js` und `views/common.js`:

1. **Spaltenpriorität:** `col(key, label, prio = 2)` → `{ key, label, prio }`; `renderTable()`/`renderExpandableTable()` schreiben
   `data-prio` auf `th`/`td`. Prio 1 = immer sichtbar, 2 = ab 601 px, 3 = ab 901 px (CSS in Paket B). Zuordnung je Tabelle: Anhang A1.
   Je `.table-wrap` ein Schalter «Alle Spalten» (`button.link`), der `data-prio` ignoriert (`.table-wrap.all-columns`).
2. **Datenbalken:** Zellen, deren Wert ein Prozentwert ist (`NUMERIC_TEXT` mit `%`), erhalten `class="num pct"` und `style="--v: 65.4"`;
   CSS `background: linear-gradient(to right, var(--bar) calc(var(--v) * 1%), transparent 0)`. Nur in Spalten mit Prozentwerten, nicht
   in Differenzspalten (pp). Druck: Balken bleiben (hell, grau).
3. **Differenzspalten** (`Differenz`, `Δ …`): Vorzeichen + Farbe wie Kacheln (`td.delta.pos|neg|neutral`); Richtung aus der Tabelle
   (`columns[i].direction`), sonst neutral.
4. **Statuszellen** (`Status`, `Status Vorgang`, `Stufe`, `Bestanden`, `Passiv`): `span.badge.status-…` mit Statusfarbe + Text.
5. **Fixierung:** `th` bleibt sticky oben; zusätzlich erste Spalte sticky links in `.table-wrap` (Hintergrund `--panel`).
6. **Kein Doppeltitel** (B8): `section(title, nodes)` übergibt `caption: false`, wenn `table.title === title`; die `caption` bleibt
   als `visually-hidden` für Screenreader. Exporte nutzen weiterhin `table.title`. Der Smoke-Test liest `#view table caption` (Bank-Report):
   Prüfung auf die versteckte `caption` umstellen, nicht entfernen.
7. **Legende statt Fussnoten** (B9): `note` wird nicht mehr unter jeder Tabelle gerendert. `app.js` `renderView()` sammelt die
   eindeutigen `note`-Texte aller `built.tables` (Duplikate wie `SMALL_NOTE` einmal) und rendert am Ende der View
   `renderCollapsible('Hinweise und Definitionen', …, { printOpen: true })`. Zusätzlich trägt jede Tabelle ein ⓘ neben dem Titel mit
   `title = note`. Tabellen-Modelle bleiben unverändert; Exporte enthalten `note` wie heute.
8. Zebra-Streifen dezent (`--panel-2`), Zeilenhöhe 2.25rem, Zahlen mit `tabular-nums` (heute nur `td.num`; global setzen).

### A.6 Diagramme

`views/chart.js` unverändert in Desktop; neue Option `compact` (Paket B). Legende bleibt unter dem Diagramm; Tabellen-Zwilling bleibt.

### A.7 Zustände

- Leer (keine Daten): eine Karte mit zwei Aktionen «Anmelden und laden» / «Lokale Datei prüfen» statt Fliesstext (`p.empty` bleibt für Views ohne Ergebnis).
- Laden: Statuszeile mit ⏳ (bestehend) und `aria-busy="true"` auf `#view`.
- Fehler: `#error` unverändert (bewährt), Abstand nach Token-Skala.

### A.8 Barrierefreiheit und Interaktion

Bestehendes bleibt (Fokusringe, Tastatur in Tabellen und Diagramm). Neu: `nav` Gruppen als `aria-label`; Export-Menü per Tastatur
bedienbar (`details/summary`); Chips als Buttons mit `aria-label="Filter Profil PK entfernen"`; `prefers-reduced-motion` respektieren.

### A.9 Wireframe Desktop (Übersicht, ≥ 1100 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ bbz Zertifizierungs-Cockpit  Reporting KUBA                       Konto ▾  Abmelden   │
│ Datenstand: Reporting_KUBA.xlsx · geändert 04.09.2026 16:02 · 4053 Zeilen · DQ 167 ▸  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ KENNZAHLEN                          PERSONEN                     EXPERTEN   DATEN     │
│ Übersicht Schriftlich Mündlich …    Personen Offene Geplante …   Experten   Historie …│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Von [01.01.2026] Bis [31.12.2026] Jahr [2026 ▾] Profil [Alle ▾] Sprache [Alle ▾] …    │
│ 479 Vorgänge · 479 Personen   [2026 ✕] [Ohne VSS/VSM ✕]                    Zurücksetzen│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Übersicht                                                        Export ▾ Definitionen│
│ Kennzahlen für Vorgänge mit absolviertem schriftlichem Run im Filter.                 │
│ Benchmark [Alle Banken ▾]  · 479 Vorgänge                                             │
│ Mengen                                                                                │
│ ┌Vorgänge┐ ┌Personen┐ ┌offen┐ ┌passiv┐ ┌nicht erfasst┐ ┌Zertifikate┐ ┌geplant┐ …     │
│ Schriftlich                                                                           │
│ ┌1. Versuch bestanden 66.0 %┐ ┌durchgefallen 34.0 %┐ ┌insgesamt 98.7 %┐ ┌Ø 1.V.┐ ┌Ø┐  │
│ Mündlich                                                                              │
│ ┌bestanden 99.5 %┐ ┌1× durchgefallen┐ ┌2×┐ ┌Ø 1. Versuch┐ ┌Ø bestandener Run┐         │
│ Auswahl im Vergleich zum Benchmark ⓘ                      [Tabelle, Δ farbig]         │
│ Kennzahlen je Profil ⓘ                                    [Tabelle, Datenbalken]      │
│ Personen mit mehreren Profilen ⓘ                                                      │
│ ▸ Hinweise und Definitionen                                                           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### A.10 Schritte

- [x] **A.1** Baseline bestätigen: Smoke-Test, Screenshots und Snapshot (`tools/snapshot-synth.js`, Schritt 0.3) als Vergleichsbasis vorhanden;
      Umsetzungsplan für Paket A (Reihenfolge, betroffene Dateien, Testpunkte je Schritt) vorlegen. Vorlegen.
- [x] **A.2** Tokens und Skalen in `styles.css`, `tools/contrast.js` + CI-Aufruf im Job `tests`. Vorlegen.
- [x] **A.3** Shell: Datenstand (`renderStatus()` + `details`), Navigation mit Gruppen (`VIEWS.group`, `renderNav()`), Untertitel. Smoke-Test anpassen. Vorlegen.
- [x] **A.4** Filterleiste: Jahr-Select, Sticky, Chips, Reset-Sichtbarkeit; Fokusregel prüfen; Smoke-Test (Summary-Format) anpassen. Vorlegen.
- [x] **A.5** View-Kopf: `view-intro`, Export-Menü (ersetzt `exportBar()`), Glossar-Anker. Alle Views durchgehen, Einleitungsabsätze verschieben. Vorlegen.
- [x] **A.6** KPI-Kacheln: `direction`, `group`, Delta-Darstellung, ⓘ; `overviewModel()`-Tests erweitern. Vorlegen.
- [x] **A.7** Tabellen: `col(key,label,prio)`, `data-prio`, Datenbalken, Delta-/Statuszellen, Sticky-Spalte, Doppeltitel, Legende; Prioritäten gemäss Anhang A1 eintragen. Vorlegen.
- [x] **A.8** Zustände, Barrierefreiheit, Druck prüfen; Dark-Mode-Screenshots. Snapshot-Vergleich mit Baseline (identisch). README «Ansichten»/«Globale Filter»
      nachführen, Entscheid-Log E1–E10 (0.3, Anhang A4). PR «Ready for review». ⛔ Abnahme Paket A (Abnahme-Bericht 0.8 inkl. «Entscheide vor Start» Paket B).

### A.11 Akzeptanzkriterien

- Snapshot vor/nach identisch (0.4); alle bestehenden Tests grün; Smoke-Test grün mit angepassten Prüfungen; CI auf dem PR grün.
- Auf 1280 px: Navigation einzeilig, Filterleiste einzeilig (+ Chip-Zeile), keine Kachel mit Definitionsabsatz, kein doppelter Tabellentitel, höchstens eine Legende je View.
- Jede Prozentspalte zeigt Datenbalken; jede Differenz zeigt Symbol + Vorzeichen + Farbe; jeder Status eine Badge.
- `tools/contrast.js` grün in Light, Dark, Druck.
- Tastatur: Navigation, Filter, Chips, Export-Menü, Tabellen-Schalter vollständig bedienbar; Fokus bleibt bei Filteränderung erhalten (B17-Prüfung «DQ-Suche behält den Fokus» bleibt grün).

### A.12 Entscheide (Stand 06.09.2026)

- Gruppierung der Navigation (A.2): **bestätigt**.
- Jahr als `<select>` statt Buttons (A.2): **bestätigt**; die Alternative «Buttons in einem `details`-Popover» entfällt.

---

## Paket B – Mobile Darstellung (reduziert)

> **⛔ Entscheide vor Start – entschieden 06.09.2026 (alle wie empfohlen):**
> 1. Priorisierte Ansichten für Phone (B.3): Übersicht, Offene Vorgänge, Geplante Prüfungen, Personen (ab Paket C). **Ja.**
> 2. Navigation auf Phone (B.2): `#nav a` bleibt im DOM, ist auf Phone aber `display: none` (nicht fokussierbar, keine doppelten Tab-Stopps);
>    der Smoke-Test nutzt im Phone-Viewport `#nav-select`. **Ja.**
> 3. Tablet (601–900 px): Navigation als horizontal scrollbare Gruppen, Filterleiste zweizeilig erlaubt, Tabellen mit Prio 1 und 2. **Ja.**

### B.1 Grundregeln

- Breakpoints: **Phone ≤ 600 px**, **Tablet 601–900 px**, Desktop > 900 px (bestehender Breakpoint 700 px geht darin auf `[verifiziert: er
  verkleinert nur Ränder]`).
- Nie horizontaler Seitenscroll; nur `.table-wrap` und `#nav` scrollen horizontal. Touch-Ziele ≥ 44 × 44 px. Grundschrift 16 px auf Phone (kein Zoom-Trigger in iOS bei Eingabefeldern).
- Reduziert heisst: weniger Spalten und Kacheln, keine Hinweistexte, gleiche Zahlen. Nichts wird anders berechnet.
- Druck bleibt Desktop-Layout (`@media print` unverändert).

### B.2 Verhalten je Komponente (Phone)

| Komponente | Phone (≤ 600 px) | Tablet (601–900 px) |
|---|---|---|
| Kopf | Brand einzeilig, Konto als Initialen-Button, Datenstand nur Einzeiler (`details` zu) | wie Desktop |
| Navigation | `<select id="nav-select">` mit `optgroup` je Gruppe (Sprungziel = Hash mit Filterzustand); `#nav a` bleibt im DOM, auf Phone `display: none` (entschieden 06.09.2026) | horizontal scrollbare Gruppen |
| Filterleiste | `<details class="filter-drawer">`, `summary` = «Filter (3 aktiv)» + Chips; Inhalt zweispaltig; sticky nur die `summary` | wie Desktop, zweizeilig erlaubt |
| View-Kopf | Titel + Export-Menü in einer Zeile; `view-intro` ausgeblendet | wie Desktop |
| KPI-Kacheln | zwei Spalten; Gruppen als aufklappbare `details` (Schriftlich, Mündlich offen, Mengen zu); nur Label, Wert, n, Δ-Symbol | drei Spalten |
| Tabellen | nur `data-prio="1"`; Schalter «Alle Spalten» scrollt horizontal; Zeilenhöhe 2.75rem | Prio 1 + 2 |
| Diagramme | `renderLineChart(series, { compact: true })`: Breite 360, `pad.right` 16, Höhe 200, keine Endbeschriftung, Legende darunter, Tooltip unter dem Diagramm | Desktop-Variante |
| Legende | `details` zu | zu |
| Bestenlisten `ranking-grid` | eine Spalte | eine Spalte |

### B.3 Priorisierte Ansichten `[entscheid 06.09.2026: bestätigt]`

Vollständig für Phone gestaltet: **Übersicht**, **Offene Vorgänge**, **Geplante Prüfungen**, **Personen** (Paket C). Alle übrigen
Ansichten müssen ohne Überlauf funktionieren (Prio-Spalten, kompakte Diagramme), werden aber nicht weiter optimiert.

| Ansicht | Phone zeigt | Phone verbirgt |
|---|---|---|
| Übersicht | Kacheln Schriftlich + Mündlich, «Kennzahlen je Profil» (Prio 1: Profil, n, 1. Versuch bestanden, Mündlich bestanden) | Mengen (zu), Benchmark-Tabelle (zu), Personen mit mehreren Profilen (zu) |
| Offene Vorgänge | Frühwarnung (Prio 1: Stufe, Name, Teilprüfung, Nächster Termin), Teilnehmende (Prio 1: Name, Profil, Fehlende Teile, Nächster Termin) | Je-Profil-Tabellen (zu), Teilprüfungen je Profil (zu), Sheet/Zeile |
| Geplante Prüfungen | Ereignisse je Tag (Prio 1: Datum, Ort, Anzahl), Teilnehmende per Aufklappen | Teilprüfungen-Detailspalten |
| Personen | Suche, Trefferliste (Name, Bank, Profile), Detail als vertikale Zeitachse | Prüfungsraster als `details` |

### B.4 Anmeldung auf dem Smartphone

`auth.js` verwendet Popup mit Redirect-Fallback `[verifiziert: `handleRedirectPromise()` beim Start, `loginRedirect()` wenn das Popup
blockiert ist]`. Neu: auf Phone (`matchMedia('(max-width: 600px)')`) direkt den Redirect-Flow nutzen, ohne Popup-Versuch. Redirect-URI der
Pages-URL ist registriert (PROMPT.md). Prüfung: Code-Review + `tests/auth.test.js` (Phone-Zweig mit Fake-`matchMedia`) + manueller Test durch den
Auftraggeber auf dem Gerät; kein Smoke.

### B.5 Wireframe Phone (Übersicht, 390 px)

```
┌───────────────────────────────┐
│ bbz Cockpit            MB ▾   │
│ Datenstand 04.09.2026 · DQ 167│
│ [Ansicht: Übersicht        ▾] │
│ ▸ Filter (2 aktiv) 2026 · ohne│
├───────────────────────────────┤
│ Übersicht            Export ▾ │
│ ▾ Schriftlich                 │
│ ┌1. Versuch ┐ ┌durchgef.   ┐  │
│ │ 66.0 %    │ │ 34.0 %     │  │
│ │316 von 479│ │163 von 479 │  │
│ │▲ +2.1 pp  │ │▼ −2.1 pp   │  │
│ └───────────┘ └────────────┘  │
│ ┌insgesamt  ┐ ┌Ø 1. Versuch┐  │
│ ▾ Mündlich                    │
│ …                             │
│ ▸ Mengen                      │
│ Kennzahlen je Profil  ⓘ       │
│ Profil  n   1.V.bst  Mdl.bst  │
│ PK     188  65.4 %▮▮  100 %▮▮▮│
│ IK     151  65.6 %▮▮   98 %▮▮▮│
│ Alle Spalten ›                │
│ ▸ Hinweise und Definitionen   │
└───────────────────────────────┘
```

### B.6 Schritte

- [x] **B.1** Entscheide vor Start einholen (eine Nachricht). Breakpoints, Grundschrift, Touch-Ziele, `data-prio`-CSS, Sticky-Verhalten. Vorlegen.
- [x] **B.2** Navigation als Select + Filter-Drawer (Phone), Kopf kompakt. Smoke-Test: Viewport 390 × 844 hinzufügen (Laden über `#file-input`, jede Ansicht rendern, kein horizontaler Überlauf: `document.documentElement.scrollWidth <= innerWidth`, Screenshots `phone-*`). Vorlegen.
- [x] **B.3** Kacheln (Gruppen als `details`), Tabellen (Prio, Schalter), Diagramm `compact`. Vorlegen.
- [x] **B.4** Priorisierte Ansichten feinjustieren (B.3-Tabelle), Tablet 820 × 1180 im Smoke-Test. Vorlegen.
- [x] **B.5** Anmeldung Redirect-Flow (B.4). README «Ansichten» um «Mobile» ergänzen. Snapshot-Vergleich. PR «Ready for review».
      ⛔ Abnahme Paket B (inkl. «Entscheide vor Start» Paket C).

### B.7 Akzeptanzkriterien

- Smoke-Test grün auf 1400 × 1000, 820 × 1180, 390 × 844; auf 390 px kein horizontaler Überlauf in allen Ansichten; CI auf dem PR grün.
- Übersicht auf 390 px: Kennzahlen Schriftlich/Mündlich ohne Scrollen nach rechts lesbar; jede Tabelle zeigt nur Prio-1-Spalten, Schalter «Alle Spalten» vorhanden.
- Filter über Drawer setzbar, Chips sichtbar; Ansicht über Select wechselbar; Hash-Zustand identisch zum Desktop.
- Snapshot vor/nach identisch (0.4).

---

## Paket C – Personen-Layer (Suche und Pfad)

> **⛔ Entscheide vor Start – entschieden 06.09.2026 (alle wie empfohlen):**
> 1. Ohne Suchtext ist die Trefferliste leer, ausser der globale Bank-Filter ist gesetzt → alle Personen dieser Bank, alphabetisch (C.2). Empfehlung: ja. **Ja.**
> 2. Auf die Trefferliste wirken Profil, Sprache, Bank, VSS/VSM, Zertifikate; Zeitraum, Versuche und Wertung wirken nicht; das Detail zeigt immer
>    alle Vorgänge der Person (C.4). Empfehlung: ja. **Ja.**
> 3. Geburtsdatum (C.5): (a) nie anzeigen, nur Schlüssel-Stufe; (b) Geburtsjahr immer anzeigen; (c) Geburtsjahr nur dann, wenn die Trefferliste
>    Namensgleiche enthält (Datenminimierung, trotzdem unterscheidbar). Empfehlung: (c). **(c).**
> 4. Export «Diese Person» (C.3 Punkt 6): Dateiname `personen-vorgang-<datum>` ohne Namen, Inhalt mit Namen «nur intern». Empfehlung: ja. **Ja.**

### C.1 Ziel und Rahmen

Eine Ansicht **Personen** (`id: 'personen'`, Gruppe Personen), in der eine Person gesucht und ihr ganzer Weg durch die Zertifizierung
nachvollzogen wird: alle Vorgänge (Profile) in zeitlicher Abfolge, jede Prüfung als Ereignis, Status, Zertifikat, Datenqualität und
Fundstelle. Lesend (E7). Mutation wird nur vorbereitet (C.8) und in Paket E umgesetzt.

### C.2 Suche

- Eingabefeld `input.person-search` (Debounce 150 ms wie DQ-Suche `SEARCH_DEBOUNCE_MS`, Fokus bleibt), ab **2 Zeichen**; mehrere Begriffe = UND.
- Suchfelder: Nachname, Vorname (normalisiert wie `normalizeNamePart()`: Akzente, ß→ss, Kleinschreibung, Bindestriche), Bank
  (`employerCanon` und `employer`-Rohwert), Profil, Sprache, Zertifikatsnummer, Status (`bestanden`, `offen`, `passiv`, `nicht bestanden`).
- Grundgesamtheit: alle Vorgänge ohne `duplicateOf` aus `state.persons`, **auch nicht kennzahlrelevante** (nur geplante Termine, nur
  mündlich, ohne Datum) – mit Kennzeichen «nicht in den Kennzahlen: Grund» (`exclusionReason()`).
- Gruppierung nach `personKey` (`groupByPerson()`); Trefferliste = Personen, nicht Vorgänge.
- Ohne Suchtext: leer, ausser der globale Bank-Filter ist gesetzt → dann alle Personen dieser Bank (alphabetisch) `[entscheid: vor Start, Frage 1]`.
- Trefferliste max. 50 Personen, sonst Hinweis «Suche eingrenzen (n Treffer)».
- Trefferliste (Tabelle, Prio): Name (1) · Bank (1) · Profile in Abfolge, z. B. `PK → IK → CWMA` (1) · Status gesamt des jüngsten Vorgangs (2) ·
  Letzte Prüfung (2) · Zertifikate (Anzahl) (2) · Vorgänge (3) · Schlüssel-Stufe (3: «ohne Geburtsdatum» als Warnung, weil Namensgleiche zusammenfallen).
- Klick/Enter auf Zeile öffnet das Detail (C.3) unterhalb; Zurück-Link zur Liste; die Liste bleibt im DOM (kein erneutes Suchen).

### C.3 Personen-Detail

**Kopf:** Name · Bank (jüngster Vorgang; bei Bankwechsel «früher: …») · Anzahl Vorgänge · Gesamtstatus · Schlüssel-Stufe · Rolle.

**Pfad-Leiste:** horizontale Schritte je Vorgang in zeitlicher Reihenfolge (nach `firstExamDate`, sonst `refDate`, sonst Zeile):

```
[ PK · 2019 · bestanden · Zertifikat ]  →  [ IK · 2022 · bestanden ]  →  [ CWMA · offen · 2 Teile fehlen · Passerelle möglich ]
```
Statusfarbe je Schritt (A.1), Passerelle-Kennzeichen aus `passerelleFrom()`, fehlende Teile aus `missingParts()`.

**Je Vorgang eine Karte** (`details`, jüngster Vorgang offen), Inhalt in dieser Reihenfolge:

1. Stammdaten: Profil, Sprache (abgeleitet → Hinweis), Bank/Employer-Rohwert, Role, Sheet und Zeile, zusammengeführte Zeilen (`duplicates`),
   VSS/VSM, Zertifikat (Nummer, Beginn, «ausgestellt»; Ende: Header «Certificate End Date» ist gemappt (`certEnd`, `required: 'none'`), aber nicht im
   Personenmodell `[verifiziert: `normalizeSheet()` liest nur `certStart`]` → Feld `certEnd` in `normalizeSheet()`, `mergeVorgang()` und
   `vorgangExportTables()` ergänzen), kennzahlrelevant ja/nein mit Grund.
2. Status: schriftlich / mündlich / gesamt als Badges; Referenzdatum mit Quelle (`refDateSource`); Durchlaufzeit (`durationDays()`), Tage
   bis Zertifikat (`certificateDays()`); passiv (Tage seit letzter Prüfung); Frühwarnung-Stufe (`earlyWarnings()`); Versuche gesamt.
3. **Prüfungsraster:** Tabelle Teilprüfungen × RUN1–RUN3 (WE1…WEn gemäss `PROFILE_PARTS`, dann OE1): Zelle = Datum + Resultat + Badge
   (bestanden / nicht bestanden / geplant / –); Runs ausserhalb der Vorgabe mit Hinweis (wie Data-Quality, `partsOutsideProfile()`).
4. **Zeitachse:** vertikale Liste aller datierten Runs (absolviert und geplant), chronologisch: `12.03.2024 · WE1 RUN2 · Ort · 78.0 % · bestanden`;
   Zertifikatsbeginn als eigenes Ereignis; Statusfarbe links als Marker.
5. Datenqualität: Einträge aus `state.dq` zu dieser Zeile (Stufe, Header, Rohwert, Grund, Wirkung) – Tabelle wie in der DQ-Ansicht, reduziert.
6. Export «Diese Person»: `vorgangExportTables(vorgaengeDerPerson)` (Blätter Vorgänge + Runs), Dateiname `personen-vorgang-<datum>` ohne Namen.

### C.4 Filter- und URL-Verhalten

- Globale Filter Profil, Sprache, Bank, VSS/VSM und Zertifikate schränken die **Trefferliste** ein; das Detail zeigt **immer alle** Vorgänge
  der Person. Zeitraum, Versuche und Wertung wirken nicht `[entscheid: vor Start, Frage 2]`; Hinweis unter dem Suchfeld.
- Suchtext und gewählte Person liegen in `store.ui.personen = { query, selectedKey }` (Memory), werden in `urlState.js` **nicht serialisiert**
  (wie `snapshots`; `DEFAULT_UI.personen = null`); Test in `tests/urlState.test.js`: `serializeState()` enthält nie `personen`. Kein Deep-Link auf
  eine Person (README: «Die URL enthält nie Personendaten»).
- Bei Datenwechsel (`meta.loadedAt`) wird `ui.personen` geleert.

### C.5 Datenschutz

- Namen in dieser Ansicht erlaubt (E7). Geburtsdatum gemäss Entscheid vor Start (Frage 3); nie das vollständige Datum.
- Druckansicht der Personen-Detailseite erlaubt (intern); Kopfzeile «nur intern».
- README «Datenschutz», `PROMPT.md` Harte Regeln nachführen (E7); `CLAUDE.md` Regel 3 bleibt unverändert (betrifft das Repo).

### C.6 Wireframe Desktop

```
│ Personen                                                    Export ▾ Definitionen │
│ [ Suche: Name, Bank, Profil, Zertifikat-Nr. …          ] 2+ Zeichen · Filter: Bank │
│ Name              Bank                Profile            Status     Letzte Prüfung │
│ ▸ …               Testbank AG         PK → IK            bestanden  14.05.2026     │
│ ▾ …               Musterbank          KMU                offen      02.09.2026     │
│   ┌──────────────────────────────────────────────────────────────────────────────┐ │
│   │ Kopf: Name · Musterbank · 1 Vorgang · offen · Schlüssel mit Geburtsdatum     │ │
│   │ Pfad: [ KMU · 2026 · offen · WE3 fehlt ]                                     │ │
│   │ ▾ KMU (First Certification, Zeile 512)                                       │ │
│   │   Stammdaten … | Status: schriftlich offen · mündlich offen · Referenz –     │ │
│   │   Raster:  WE1 [12.03.26 82 % ✔] [–] [–]   WE2 [12.03.26 61 % ✘] [09.06.26 74 % ✔] [–] │ │
│   │            WE3 [geplant 29.09.26] …        OE1 [–]                           │ │
│   │   Zeitachse: ● 12.03.2026 WE1 RUN1 · Ort · 82.0 % · bestanden …              │ │
│   │   Datenqualität: 1 Hinweis (Result als Prozentwert umgedeutet)               │ │
│   │   [Diese Person exportieren]                                                 │ │
│   └──────────────────────────────────────────────────────────────────────────────┘ │
```

### C.7 Schritte

- [x] **C.1** Entscheide vor Start einholen (eine Nachricht). `metrics.js`: `personSearchIndex(persons)` (reine Funktion: Personen mit normalisierten
      Suchfeldern, Vorgänge chronologisch), `personPath(person)` (Pfad-Schritte), `runTimeline(vorgang)` (Ereignisse), `examGrid(vorgang, parts)` (Raster).
      `store.js`: `certEnd`. Synthetische Daten gemäss Anhang A5 (Bankwechsel, Namensgleiche, ohne Geburtsdatum) in `tests/fixtures.js` und
      `tests/smoke/synth.mjs` ergänzen; bestehende Smoke-Prüfungen mitziehen. Tests. Vorlegen.
- [x] **C.2** `views/tables.js`: `personResultsTable()`, `personGridTable()`, `personTimelineTable()`, `personDqTable()`; `urlState.js`
      `DEFAULT_UI.personen`, nicht serialisiert; Tests. Vorlegen.
- [x] **C.3** `views/personen.js`: Suche, Trefferliste, Detail, Export; `app.js` `VIEWS` (Gruppe Personen, `noPersonExport: true`, eigener Export). Vorlegen.
- [x] **C.4** Phone-Layout (Zeitachse vertikal, Raster als `details`). Smoke-Test: Suche mit synthetischem Namen, Detail öffnen,
      Raster/Zeitachse vorhanden, URL ohne Suchtext, Speicher leer. Vorlegen.
- [x] **C.5** Glossar (Anhang A3: «Pfad einer Person», «Prüfungsraster», «Zeitachse»), README (Ansichten, Datenschutz, E7), `PROMPT.md` Harte Regeln. Vorlegen.
- [ ] **C.6** Phase-2-Vorbereitung (C.8) – im selben Paket, ohne Schreibpfad. PR «Ready for review». ⛔ Abnahme Paket C (inkl. «Entscheide vor Start» Paket D).

### C.8 Phase-2-Vorbereitung (ohne Schreibpfad)

- `datasource/index.js`: Signatur dokumentieren und als `NotImplementedError` belassen:
  `write({ sheet, row, header, value, expected, reason })` → `{ ok, written, conflict, itemVersion }`.
- `config.js`: `features: { write: false }` `[verifiziert: `features` existiert noch nicht]`; `views/personen.js` rendert bei `write: true` je Run-Zelle
  einen Bearbeiten-Button (Paket E).
- Keine UI ohne Flag; kein Scope-Wechsel in diesem Paket.

### C.9 Akzeptanzkriterien

- Suche nach Teilstring eines synthetischen Namens, einer Bank, eines Profils und einer Zertifikatsnummer findet die Person; Namensgleiche werden getrennt, wenn Geburtsdaten vorhanden sind.
- Detail zeigt alle Vorgänge der Person unabhängig von Profil-/Zeitraumfilter; Pfad-Reihenfolge nach erstem Prüfungsdatum.
- Raster und Zeitachse stimmen mit dem Export «Runs» überein (Test: gleiche Anzahl datierter Runs).
- URL enthält nie Suchtext oder Schlüssel; `localStorage`/`sessionStorage` unverändert (Smoke-Prüfung «Keine Daten im Browser-Speicher»).
- Phone: Suche und Detail ohne horizontalen Überlauf. CI auf dem PR grün.

---

## Paket D – Experten-Layer (mündliche Prüfung)

> **⛔ Entscheide vor Start** (eine Nachricht zu Beginn von Schritt D.1; die Header-abhängigen Fragen folgen in D.2):
> 1. Paarungstabelle Experte 1 × Experte 2 `[optional]` (D.4, D.5): umsetzen, wenn D.1–D.4 im Plan liegen. Empfehlung: ja.
> 2. Filterverhalten (D.6): Zeitraum wirkt auf das Run-Datum des Einsatzes, nicht auf das Referenzdatum; Versuche und Wertung wirken nicht. Empfehlung: ja.
> 3. Export «Einsatzebene» mit Kandidatennamen «nur intern» (D.5). Empfehlung: ja, analog Vorgangsebene (E5).

### D.1 Ziel und Rahmen

Statistik je Experte/Expertin der mündlichen Prüfung (OE): Einsätze, Rollenverteilung Experte 1 / Experte 2, Durchfallquote,
Ø Resultat – jeweils gegen den Benchmark aller Experten im Filter (E9). Ansicht **Experten** (`id: 'experten'`, eigene Gruppe).
Expertennamen sichtbar (E8). Die Kennzahlen sind **Beobachtungswerte, keine Leistungsbeurteilung**: ein Einsatz zählt für beide
beteiligten Experten voll; kleine Gruppen sind markiert.

### D.2 ⛔ Schritt 1: Header verifizieren (vor jedem Mapping)

1. CC schreibt `tools/headers.js <Datei.xlsx>` (Node, SheetJS aus `lib/`, Muster `tools/modellbericht.js`): gibt für beide Sheets alle Header der
   Zeile 10 mit Spaltenbuchstabe und Anzahl nicht leerer Zellen aus – **keine Zellwerte** (keine Personendaten in der Ausgabe). Zusätzlich je Header
   die Anzahl unterschiedlicher Werte (nur die Zahl) und eine Markierung, wenn der Header auf `expert|examiner|experte|prüfer` passt.
2. CC führt das Werkzeug **selbst** auf `local/Reporting_KUBA.xlsx` aus `[entscheid 06.09.2026]` und legt die Ausgabe im Bericht vor (Header-Liste,
   keine Werte).
3. CC identifiziert die Expertenspalten und legt das Mapping vor. `[hypothese]` Header lauten `OE{n} RUN{r} Expert 1` und `OE{n} RUN{r} Expert 2`
   (Varianten: `Examiner 1/2`, `Experte 1/2`, `Expert1`). `[unklar]` Ist Experte 1 die Prüfungsleitung? Gibt es Experten auch je Teilprüfung
   statt je Run? Gibt es Experten für schriftliche Teile (dann ausserhalb des Umfangs)?
4. ⛔ Bestätigung des Mappings und der Semantik durch den Auftraggeber, in derselben Nachricht gebündelt: Pflicht-Header ja/nein (D.3),
   `CONFIG.experts.from` (Datum, ab dem Experten erfasst sind), Rollen-Semantik, Alias-Liste (leer starten). Erst dann D.3.

### D.3 Mapping, Normalisierung, Datenqualität

- `config.js` `buildHeaderFields()`: je OE-Run zwei Felder `runKey('oe', p, r, 'expert1')` / `'expert2'` mit den bestätigten Header-Namen,
  `required: 'none'` (ältere Dateien ohne Spalten laden weiterhin; die Ansicht zeigt dann «Keine Expertenspalten in dieser Datei»).
  `[entscheid: nach Verifikation – Pflicht-Header ja/nein]`.
- `config.js` `EXPERT_ALIASES`: Schreibvarianten → kanonischer Name (leer starten; Auftraggeber füllt bei Bedarf). `CONFIG.experts.from`
  `[entscheid: D.2 – Datum, ab dem Experten erfasst sind, z. B. '2024-01-01']` – vorher fehlende Experten ergeben keinen Hinweis.
- `store.js` `parseExpert(raw)`: `asText` → trim → Mehrfach-Leerzeichen → Alias → `{ name, key }` mit `key = normalizeNamePart(name)`;
  Zahl/Datum/unlesbar → `null` + Data-Quality **Fehler** «Experte nicht lesbar» (Wirkung «verändert Kennzahl», weil Experten-Kennzahlen betroffen).
- Data-Quality **Hinweise** (ohne Kennzahlwirkung auf Bestehensquoten): «Experte fehlt» = Run absolviert, Datum ≥ `experts.from`, beide Felder leer ·
  «Experte ohne Run» = Feld gefüllt, Run nicht absolviert und nicht geplant · «Experte 1 = Experte 2» = beide Felder gleicher Schlüssel.
- Datenmodell: `run.experts = [{ role: 1, name, key }, { role: 2, name, key }]` (leere Rollen weggelassen; `[]` wenn keine Spalten).
- Duplikat-Zusammenführung (`fillRun()` in `store.js`): `experts` wie die übrigen Run-Felder auffüllen, nie überschreiben.

### D.4 Kennzahlen (`metrics.js` `expertStats(persons, options)`)

Grundgesamtheit: **Einsätze** = absolvierte OE-Runs (`taken`, Datum vorhanden) mit mindestens einem Experten, aus den Vorgängen des
aktiven Filters; Zeitraum wirkt auf das **Run-Datum** (D.6). Erstversuch = RUN1, Wiederholung = RUN2/RUN3.

| Kennzahl | Definition | Nenner | Grenzfälle / Hinweise |
|---|---|---|---|
| **Einsätze** | Anzahl Einsätze, an denen die Person als Experte 1 oder 2 beteiligt war. | – | Ein Einsatz zählt für beide Experten voll. n < 5 → «*». |
| **als Experte 1 / als Experte 2** | Anzahl Einsätze je Rolle; **Anteil Experte 1** = Rolle 1 / Einsätze. | Einsätze | Semantik der Rollen `[unklar]` (D.2). |
| **Durchfallquote** | Anteil Einsätze mit `passed = false`. | Einsätze | Getrennt: **1. Versuch** (RUN1) und **Wiederholung** (RUN2/3); Gesamt zusätzlich. |
| **Δ Durchfallquote** | Durchfallquote des Experten minus Benchmark derselben Schicht (alle Einsätze im Filter, gleiche Versuchsart), in pp. | – | E9: keine Profil-Schichtung; Profil und Sprache als Aufschlüsselung. |
| **Ø Resultat** | Mittel der `result`-Werte (erreichte Punkte in Prozent) der Einsätze mit Wert. | Einsätze mit Wert | E6: `Result` ist massgebend, nicht `Score`. Δ zum Benchmark in pp. |
| **Erster / letzter Einsatz** | Min/Max Run-Datum der Einsätze. | – | – |
| **Partner** | Mit wem die Person geprüft hat: je Partner Einsätze und Durchfallquote. | Einsätze des Paares | `[optional]` Paarungstabelle Experte 1 × Experte 2, Top 30 nach Einsätzen. |
| **Aufschlüsselung** | je Jahr, je Profil, je Sprache: Einsätze, Durchfallquote, Ø Resultat. | Einsätze der Gruppe | n < 5 markiert. |
| **Benchmark (Experten)** | Alle Einsätze im Filter: Durchfallquote gesamt / 1. Versuch / Wiederholung, Ø Resultat. | Einsätze | Basis aller Δ-Werte. |

Formeln in `metrics.js` als reine Funktionen: `expertRuns(persons, { from, to })`, `expertStats(runs)`, `expertBenchmark(runs)`,
`expertPairs(runs)`. Rundung und Formatierung erst in `views/tables.js` (`formatPct`, `formatPp`).

### D.5 Ansicht «Experten»

- **KPI-Zeile:** Experten (≥ 1 Einsatz) · Einsätze · Ø Einsätze je Experte (Median in Klammern) · Durchfallquote 1. Versuch (Benchmark) ·
  Durchfallquote Wiederholung · Ø Resultat.
- **Haupttabelle** «Experten» (sortierbar wie DQ-Tabelle `th.sortable`; Standard Einsätze absteigend), Prioritäten in Klammern:
  Experte (1) · Einsätze (1) · als Experte 1 (2) · als Experte 2 (2) · Anteil Experte 1 (2) · Durchfallquote 1. Versuch (1) · Δ (1) ·
  Durchfallquote Wiederholung (2) · Δ (2) · Ø Resultat (2) · Δ (3) · Erster Einsatz (3) · Letzter Einsatz (3).
  Δ-Zellen mit Symbol/Farbe (A.5); Datenbalken auf Quoten; n < 5 gedämpft.
- **Zeilen-Detail** (`renderExpandableTable`): drei kleine Tabellen je Jahr, je Profil, je Sprache; Partnerliste.
- **Paarungen** `[optional, Entscheid vor Start Frage 1]`: Tabelle Experte 1 · Experte 2 · Einsätze · Durchfallquote · Ø Resultat.
- **Hinweis** (Legende): «Beobachtungswerte; ein Einsatz zählt für beide Experten; Kandidaten mit Wiederholung haben strukturell höhere
  Durchfallquoten, deshalb getrennter Benchmark.»
- **Exporte:** Aggregate (CSV/XLSX); zusätzlich «Einsatzebene» (eine Zeile je Einsatz: Datum, Teilprüfung, Run, Experte 1, Experte 2,
  bestanden, Resultat, Profil, Sprache, Bank, Name des Kandidaten) – «mit Namen, nur intern» wie die Vorgangsebene.
- Ohne Expertenspalten: `p.empty` «Keine Expertenspalten in dieser Datei (erwartete Header: …)».

### D.6 Filterverhalten `[entscheid: vor Start, Frage 2]`

Profil, Sprache, Bank, VSS/VSM, Zertifikate wirken über die Vorgänge. **Zeitraum wirkt auf das Run-Datum des Einsatzes** (nicht auf das
Referenzdatum des Vorgangs), damit «2025» die Einsätze des Jahres 2025 zeigt. Versuche-Filter und Wertung wirken nicht (Hinweis in der Ansicht).
Umsetzung: `filterPersons(state.persons, filter, { period: false })` → `expertRuns(persons, { from: filter.from, to: filter.to })`.

### D.7 Schritte

- [ ] **D.1** Entscheide vor Start einholen (eine Nachricht). `tools/headers.js` schreiben, selbst auf `local/Reporting_KUBA.xlsx` ausführen, Ausgabe
      und Mapping-Vorschlag vorlegen. ⛔ Bestätigung (D.2, gebündelt).
- [ ] **D.2** `config.js` Felder + `EXPERT_ALIASES` + `experts.from`; `store.js` `parseExpert`, DQ-Regeln, `fillRun`; Tests mit synthetischen
      Experten (Fixtures und `tests/smoke/synth.mjs` um zwei Expertenspalten je OE-Run erweitern, erfundene Namen). Vorlegen.
- [ ] **D.3** `metrics.js` `expertRuns/expertStats/expertBenchmark/expertPairs`; Tests (Rollenzählung, Schichten, Δ, n < 5, gleicher Experte in beiden Rollen). Vorlegen.
- [ ] **D.4** `views/tables.js` Tabellenmodelle; `views/experten.js`; `app.js` `VIEWS` (Gruppe Experten, Export Einsatzebene). Vorlegen.
- [ ] **D.5** Phone-Layout; Smoke-Test: Ansicht rendert Haupttabelle mit synthetischen Experten, Sortierung, Zeilen-Detail, Zeitraumfilter wirkt auf Einsätze. Vorlegen.
- [ ] **D.6** Glossar (Anhang A3), README (Ansichten, E8, E9, Normalisierung Experte, DQ-Regeln), `PROMPT.md` Harte Regeln. PR «Ready for review».
      ⛔ Abnahme Paket D (inkl. «Entscheide vor Start» Paket E).

### D.8 Akzeptanzkriterien

- Mapping ausschliesslich über bestätigte Header-Namen; Datei ohne Expertenspalten lädt ohne Fehler.
- Testfall: 3 synthetische Experten, 10 Einsätze mit bekannten Ergebnissen → Einsätze, Rollen, Quoten, Δ und Ø Resultat exakt wie erwartet; Summe der Rollen-Einsätze = 2 × Einsätze mit zwei Experten + Einsätze mit einem Experten.
- Zeitraum 2025 zeigt nur Einsätze mit Run-Datum 2025, auch wenn das Referenzdatum des Vorgangs 2026 ist.
- Keine Kandidatennamen in Aggregat-Exporten; Einsatzebene als «nur intern» gekennzeichnet. CI auf dem PR grün.

---

## Paket E – Mutation: minimaler Schreibpfad (Phase 2)

> **⛔ Entscheide vor Start** (eine Nachricht vor Schritt E.1):
> 1. Testkopie: der Auftraggeber legt eine Kopie der Datei in einem Testordner auf SharePoint an und nennt Pfad und Ordner (E.3). Ohne Testkopie kein Spike-Test.
> 2. Audit-Ablageort (E.1 Punkt 5): (a) `General/07_KUBA/Reporting_KUBA.changes.json` neben der Datei (Append je Änderung); (b) Threaded Comment an der
>    Zelle (nur wenn Graph das Anlegen erlaubt). Empfehlung: (a), weil unabhängig von der Workbook-API und ohne Strukturänderung der Excel.
> 3. Umfang der ersten Stufe: nur Run-Felder Passed, Date, Result, Location (und Expert 1/2 nach Paket D). Empfehlung: ja, nichts darüber hinaus.
> 4. Freischaltung: `features.write` bleibt in `config.js` `false`; der Auftraggeber aktiviert das Flag (E.3 Schritt E.4). Empfehlung: ja.

### E.0 Rahmen und Umfang

Entscheid E10 (0.3). Umfang der ersten Ausbaustufe bewusst klein: **Run-Felder** eines Vorgangs (Passed, Date, Result, Location; ab Paket D
auch Expert 1/2) in bestehenden Spalten ändern. Nicht editierbar: Name, Geburtsdatum (Personenschlüssel), Profil, Sprache, Employer,
Gesamtergebnisse (`WE All`, `OE All` – Formeln/Abläufe `[unklar]`), Zertifikatsfelder. Kein Anlegen von Zeilen, keine Sheet-Änderungen.

### E.1 Spike (Dokument `docs/SPIKE-mutation.md`, ≤ 2 Seiten, Test auf einer Dateikopie)

Inhalt:

1. **Ablauf Graph Workbook API:** `POST /drives/{driveId}/items/{itemId}/workbook/createSession` (`persistChanges: true`) →
   `PATCH …/workbook/worksheets('{sheetName}')/range(address='{Spalte}{Zeile}')` mit `values` → `POST …/workbook/closeSession`.
   Spaltenbuchstabe zur Laufzeit aus dem Header-Mapping (Index in Zeile 10), Zeile aus `person.row`; Sheet aus `person.sheetName`.
2. **Datentypen:** Datum als Excel-Serienzahl oder Text im Format der Nachbarzellen `[unklar: am File prüfen]`; Passed als Text der Whitelist
   (`yes`/`no` in der im Sheet üblichen Schreibweise); Result als Zahl 0–1 oder Prozenttext gemäss Nachbarzellen.
3. **Konflikte:** vor dem Schreiben `GET /drives/{driveId}/items/{itemId}?$select=lastModifiedDateTime,eTag` mit `meta.lastModified` vergleichen;
   Abweichung → abbrechen, «Datei wurde geändert – neu laden». Zusätzlich `expected`-Wert der Zelle lesen (`GET range`) und vergleichen.
4. **Gleichzeitig geöffnete Datei** (Excel Desktop/Online): Verhalten der Workbook-API testen `[unklar]`; Ergebnis dokumentieren.
5. **Audit:** keine Änderungen an der Excel-Struktur (E10). Änderungsprotokoll gemäss Entscheid vor Start (Frage 2): JSON-Datei neben der Excel
   (Append je Änderung: Zeitpunkt, Konto, Sheet, Zeile, Header, alt, neu, Grund) oder Threaded Comment an der Zelle.
6. **Berechtigungen:** Graph setzt SharePoint-Rechte durch; Nutzer ohne Schreibrecht erhalten 403 → verständliche Meldung.
7. **Aufwandsschätzung** in Arbeitsschritten (Adapter, UI, Tests mit Graph-Mock, Doku) und Risiken.

Der Spike-Test läuft nur gegen die Testkopie; der Auftraggeber führt die Graph-Aufrufe mit seinem Konto aus oder gibt sie im Browser frei;
CC protokolliert nur Ergebnisse ohne Personendaten.

⛔ **Go/No-Go durch den Auftraggeber.** Bei No-Go endet Paket E hier (Folge-Run); der Spike-Bericht wird trotzdem gemerged.

### E.2 Umsetzung (nur bei Go)

- `config.js`: `auth.scopes: ['Files.ReadWrite.All']` (bereits in Azure gesetzt); `features.write` steuert die UI; Standard `false`.
- `datasource/workbookAdapter.js`: `write(change)` gemäss C.8; Sessions, Retry über `graph.js` (429/503), Fehlerklassen `WriteConflictError`,
  `WriteForbiddenError`. `datasource/index.js` delegiert; `fileAdapter` bleibt der Lesepfad.
- UI in `views/personen.js` (Raster-Zelle → «Bearbeiten»): Formular mit den Parsern aus `store.js` (`parsePassed`, `parseDate`, `parseResult`,
  `parseExpert`) als Validierung, Vorschau «alt → neu», Pflichtfeld Grund, Bestätigung, Schreiben, danach **Neuladen** (`load()`), Erfolg mit
  Fundstelle. Kein optimistisches Update im Memory.
- Nach dem Schreiben Data-Quality-Wirkung anzeigen (z. B. neuer Hinweis).
- Tests: Adapter mit Graph-Mock (Request-Reihenfolge, Konfliktpfad, 403); UI im Smoke-Test nur mit Flag und Mock-Endpunkt `[hypothese: Mock über
  `tests/smoke/server.mjs` möglich]`.
- README: Abschnitt «Mutation (Phase 2)» mit Umfang, Ablauf, Audit; `CLAUDE.md` Regel 1 (E10); `DEPLOY.md` Scope.

### E.3 Schritte

- [ ] **E.1** Entscheide vor Start einholen (eine Nachricht). Spike-Dokument inkl. Test auf der Testkopie. ⛔ Go/No-Go.
- [ ] **E.2** Adapter + Tests. Vorlegen.
- [ ] **E.3** UI hinter Flag + Smoke. Vorlegen.
- [ ] **E.4** Doku, Regeln (`CLAUDE.md` Regel 1 gemäss E10, `DEPLOY.md`), PR «Ready for review». ⛔ Abnahme Paket E; Flag-Aktivierung durch den Auftraggeber.

### E.4 Akzeptanzkriterien

- Eine Änderung an einer Run-Zelle auf der Testkopie ist nach Neuladen sichtbar; Struktur der Datei unverändert (Header-Zeile, Spaltenzahl, Formate: Vergleich mit `tools/headers.js` vor/nach).
- Konflikt (Datei zwischenzeitlich geändert) wird erkannt und nicht geschrieben.
- Ohne Flag keine Schreib-UI; ohne Schreibrecht verständliche Meldung.
- Audit-Eintrag je Änderung vorhanden; keine Personendaten im Repo. CI auf dem PR grün.

---

## 6 Kick-off und Konventionen

**Erste Nachricht an CC** (kopieren):

```
Lies zuerst CLAUDE.md (Stand origin/main), dann PROMPT-2.md vollständig. Fasse die Regelpräzisierungen E7–E10, die Paketreihenfolge
A → B → C → D → E, den Git-Workflow (Branch je Paket, Draft-PR, Merge nach Freigabe) und den Freigabe-Takt (Bericht nach jedem Schritt)
in fünf Sätzen zusammen und bestätige, dass du die ⛔-Punkte einhältst. Führe dann Schritt 0 (Abschnitt 0.6) aus und lege den Bericht
nach Vorlage 0.8 vor. Nach Freigabe: Paket A, Schritt A.1. Keine Annahmen über die Excel-Struktur.
```

**Commits:** klein, thematisch, deutsch, Imperativ (0.7). Ein Schritt darf mehrere Commits haben; nie mehrere Schritte in einem Commit.

**Bei Abweichungen vom Dokument** (Code anders als beschrieben, Header anders als angenommen): stoppen, Befund mit Fundstelle vorlegen (0.8, ⛔-Nachricht).

---

## Anhang

### A1 Spaltenprioritäten je bestehender Tabelle (Paket A.5, B)

1 = immer (Phone), 2 = ab 601 px, 3 = ab 901 px. Erste Spalte (Gruppe/Name) ist immer Prio 1 und sticky. Spaltenbezeichnungen gemäss
`views/tables.js` (Stand 06.09.2026, `origin/main`); weicht der Code ab, gilt der Code und die Priorität wird sinngemäss übertragen.

| Tabelle (`views/tables.js`) | Prio 1 | Prio 2 | Prio 3 |
|---|---|---|---|
| `passRateTable` Bestehensquote schriftlich nach … | Gruppe, n (Vorgänge), Im 1. Versuch bestanden, Insgesamt bestanden | Im 1. Versuch durchgefallen, n (abgeschlossen), Offen | davon passiv, Nicht erfasst |
| `performanceTable` Ø Resultat … nach … | Gruppe, Ø Resultat 1. Versuch, Ø Resultat bestandener Run | n (1. Versuch), n (bestanden) | – |
| `partTable` … je Teilprüfung | Teilprüfung, n, Im 1. Versuch bestanden, Ø Resultat 1. Versuch | Im 1. Versuch durchgefallen, Insgesamt bestanden | Ø Resultat bestandener Run |
| `oralRateTable` Bestehensquote mündlich nach … | Gruppe, n (abgeschlossen), Bestanden, Im 1. Versuch durchgefallen | Nicht bestanden, Offen, n (angetreten), 2× durchgefallen | davon passiv, Nicht erfasst |
| `vssVsmTable` | Gruppe, Profil, n, Schriftlich im 1. Versuch bestanden | Schriftlich insgesamt bestanden, Mündlich bestanden | – |
| `awardDossierTable` | Profil, Rang, Name, Award-Score | Bank, Schriftlich, Mündlich, Versuche | Sprache, Referenzdatum, Sheet, Zeile, Begründung Rang |
| `plannedTables` je Tag und Ort | Datum, Ort, Anzahl | Teilprüfungen (Anzahl), davon Wiederholung | – |
| `plannedTables` Teilnehmende / Zugeteilte | Datum, Name, Teilprüfung | Zeit, Ort, Versuch, Profil | Bank, Sprache |
| `multiProfileTable` | Profil-Abfolge, Personen | Vorgänge | – |
| `overviewModel` Kennzahlen je Profil | Profil, n (Vorgänge), Schriftlich im 1. Versuch bestanden, Mündlich bestanden | Personen, Schriftlich insgesamt bestanden, Offen | Schriftlich im 1. Versuch durchgefallen, davon passiv |
| `comparisonTable` | Kennzahl, Auswahl, Differenz | Benchmark | n (Auswahl), n (Benchmark) |
| `excludedTables` Zeilen | Sheet, Zeile, Grund | Name, Profil | Bank, Status |
| `openCasesTables` je Profil | Profil, Offen, davon passiv | davon schriftlich offen, davon mündlich offen, mit geplantem Termin | ohne Prüfung, kennzahlrelevant |
| `openCasesTables` Teilnehmende | Name, Profil, Fehlende Teile, Nächster Termin | Bank, Offen, Passiv, Letzte Prüfung, Versuche | Sprache, Passerelle, Tage seit letzter Prüfung, Sheet, Zeile |
| `profilePartsTable` | Profil, Schriftlich (Vorgabe), Abweichung | Mündlich (Vorgabe), Anzahl Teile, n | In den Daten |
| `timeSeriesTable` / `timeSeriesByProfileTable` `[verifiziert: `TIME_COLUMNS`]` | Jahr (Profil), n (Vorgänge), Schriftlich im 1. Versuch bestanden, Mündlich bestanden | Personen, Schriftlich insgesamt bestanden, Ø schriftlich 1. Versuch, Ø schriftlich bestandener Run | Ø mündlich 1. Versuch, Ø mündlich bestandener Run, Offen, Passiv, Nicht erfasst |
| `difficultyTables` | Jahr, Teilprüfung, Im 1. Versuch durchgefallen | n, Ø Resultat 1. Versuch | Im 1. Versuch bestanden, Ø Resultat bestandener Run |
| `earlyWarningTable` | Stufe, Name, Teilprüfung, Nächster Termin | Bank, Profil, Fehlversuche, Letzter Fehlversuch | Status Vorgang, Sheet, Zeile |
| `passiveTable` | Name, Profil, Tage seit letzter Prüfung | Bank, Offen, Letzte Prüfung | Letzter Prüfungstag bestanden, Versuche, Sheet, Zeile |
| `throughputTables` | Gruppe, Median, n | Ø, Quartile | Min, Max |
| `bankReportTables` | Profil, n Bank, Schriftlich 1. Versuch bestanden, Mündlich bestanden | Schriftlich insgesamt bestanden, n alle Banken | die drei «(alle)»-Spalten |
| `historyTables` | Kennzahl/Zähler/Profil, jüngster Stichtag, Heute, Differenz | ältere Stichtage | – |
| DQ-Tabelle (`views/dataQuality.js`, `DQ_COLUMNS`) | Wirkung, Stufe, Zeile, Grund | Sheet, Header | Rohwert |

### A2 Token-Vorschläge (Auszug für `styles.css`, Light)

| Token | Wert | Verwendung |
|---|---|---|
| `--status-bestanden` / `-bg` | `#1a7f37` (= `--ok`) / `#e3f5e8` | Badges, Pfad-Schritte, Zeitachsen-Marker |
| `--status-nicht` / `-bg` | `#b3261e` (= `--danger`) / `#fdecea` (= `--danger-bg`) | wie oben |
| `--status-offen` / `-bg` | `#0b5fa5` (= `--accent`) / `#e6f0fa` | wie oben |
| `--status-passiv` / `-bg` | `#8a5a00` (= `--warn`) / `#fff4e0` (= `--warn-bg`) | wie oben |
| `--status-geplant` / `-bg` | `#6b5bd6` / `#eeebfb` | geplante Runs `[hypothese: Kontrast prüfen]` |
| `--delta-pos` / `--delta-neg` / `--delta-neutral` | `--ok` / `--danger` / `--muted` | Kacheln, Δ-Spalten |
| `--bar` | 18 % Akzent | Datenbalken |
| `--space-1…6`, `--fs-xs…xl` | siehe A.1 | Abstände, Schriftgrade |

Dark-Werte analog aus den bestehenden Dark-Tokens ableiten (`--ok #5ad07a`, `--danger #ff8a80`, `--accent #6aa6e6`, `--warn #e0a84f`);
`tools/contrast.js` entscheidet.

### A3 Neue Glossar-Einträge (`glossary.js`, Format `{ kind, term, definition, nenner, grenzfaelle }` `[verifiziert: Feld heisst `grenzfaelle`, nicht `hinweise`]`)

| kind | term | definition | nenner | grenzfaelle |
|---|---|---|---|---|
| Begriff | Pfad einer Person | Zeitliche Abfolge aller Vorgänge (Profile) einer Person nach erstem Prüfungsdatum, mit Status je Vorgang, Zertifikat und Passerelle-Kennzeichen. | – | Ansicht «Personen». Namen sichtbar (E7). Nicht in der URL. |
| Begriff | Prüfungsraster | Tabelle Teilprüfungen × Versuche eines Vorgangs mit Datum, Resultat und Ergebnis je Run; Runs ausserhalb der Profilvorgabe sind markiert. | – | Grundlage: `PROFILE_PARTS`. |
| Begriff | Zeitachse (Person) | Alle datierten Runs eines Vorgangs chronologisch, absolviert und geplant, plus Zertifikatsbeginn. | – | Entspricht dem Export «Runs». |
| Begriff | Einsatz (Experte) | Absolvierter, datierter mündlicher Run mit mindestens einem eingetragenen Experten; zählt für beide beteiligten Experten. | – | Ansicht «Experten» (E8). Zeitraum wirkt auf das Run-Datum. |
| Begriff | Experte 1 / Experte 2 | Rolle gemäss Spalte der Datei. | – | Semantik `[unklar]` bis D.2. |
| Kennzahl | Einsätze | Anzahl Einsätze je Experte. | – | n < 5 markiert. |
| Kennzahl | Anteil Experte 1 | Einsätze in Rolle 1 geteilt durch alle Einsätze des Experten. | Einsätze | – |
| Kennzahl | Durchfallquote (Experte) | Anteil Einsätze mit nicht bestandenem Run, getrennt nach 1. Versuch und Wiederholung. | Einsätze der Versuchsart | Beobachtungswert, keine Leistungsbeurteilung; Δ zum Benchmark derselben Versuchsart (E9). |
| Kennzahl | Ø Resultat (Experte) | Mittel der Resultate der Einsätze mit Wert. | Einsätze mit Wert | Result massgebend (E6). |
| Kennzahl | Benchmark (Experten) | Durchfallquote und Ø Resultat über alle Einsätze im Filter, je Versuchsart. | Einsätze | Basis der Δ-Werte. |
| Begriff | Schreibpfad (Phase 2) | Änderung einzelner Run-Zellen in bestehenden Spalten über die Graph-Workbook-API mit Validierung, Konfliktprüfung und Audit-Protokoll. | – | E10; nur mit Feature-Flag; Struktur der Datei bleibt unverändert. |

Kennzahl-Einträge tragen exakt die Beschriftung der Kachel bzw. Spalte (`tests/glossary.test.js`).

### A4 Entscheid-Log (Text für README «Modell», Liste E1–E10)

E1–E6 aus README «Modell», Glossar und Normalisierungstabelle in dieselbe Listenform überführen (je ein Satz, Datum 05.09.2026); dann:

- **E7 (06.09.2026)** Namen zusätzlich in der Ansicht «Personen»; Nutzerkreis bbz-intern; nie in URL, Snapshots, Repo.
- **E8 (06.09.2026)** Expertennamen in der Ansicht «Experten».
- **E9 (06.09.2026)** Mündliche Prüfung prüft Methodik → profilübergreifend vergleichbar; Benchmark je Experte über alle Experten im Filter, getrennt nach Erstversuch und Wiederholung.
- **E10 (06.09.2026)** Regel 1 präzisiert: Struktur nie ändern; Zellwerte nur über den Schreibpfad (Paket E) mit Flag, Validierung, Konfliktprüfung, Audit. Scope `Files.ReadWrite.All` gesetzt.

### A5 Synthetische Testdaten (Erweiterung `tests/fixtures.js` und `tests/smoke/synth.mjs`)

**Vorhanden** `[verifiziert]` in `tests/smoke/synth.mjs`: Muster Anna (PK, Duplikat über beide Sheets, Zertifikat Z-1), Beispiel Ben (IK offen/passiv
und CWMA bestanden 2026 → Person mit zwei Profilen, Pfad IK → CWMA), Offen Olga (KMU offen), Passiv Paul (PK, nicht bestanden, kein Termin),
Plan Petra (Musterbank, Wiederholung und geplante Runs mit Ort), Termin Tom (Musterbank, IK, FR, nur Termin), Neu Nora (PK, Termin ohne Uhrzeit),
Bank Bea (Musterbank, bestanden 2025), Zertifikat Zoe (AFFL, nur Sheet 2). Banken «Testbank AG», «Musterbank». Der Mehrprofil-Fall der Erstfassung
(«PK → IK») ist durch Beispiel Ben abgedeckt.

**Zu ergänzen (Paket C):** eine Person mit Bankwechsel, zwei Namensgleiche mit unterschiedlichem Geburtsdatum, ein Vorgang ohne Geburtsdatum.
Bestehende Smoke-Prüfungen (Zählungen, «Bank-Report ohne Namen», Bank-Auswahl «Testbank AG») beim Erweitern mitziehen.

**Experten (Paket D):** drei erfundene Namen, Einsätze in beiden Rollen, ein Einsatz mit nur einem Experten, ein Einsatz mit gleichem Namen in beiden
Rollen (DQ-Hinweis), Einsätze vor `experts.from` ohne Experten, Ergebnisse so gewählt, dass Δ-Werte ungleich 0 sind.

Nur erfundene Namen und Banken; keine realen Kürzel von Instituten aus `EMPLOYER_ALIASES` in Personenkontext.

### A6 Änderungen dieser Fassung gegenüber Fassung 1 (06.09.2026, Downloads)

1. **Ausgangsstand festgeschrieben:** `origin/main` 7bb9966; lokaler Klon war 26 Commits zurück → Schritt 0 (0.6) mit Pull, `npm ci`, Baseline, Branch, Übernahme dieser Datei ins Repo.
2. **Git-Workflow (0.7)** und **Freigabe-Takt** nach Antworten des Auftraggebers: Branch je Paket, Draft-PR, Merge nach Freigabe; Bericht nach jedem Schritt.
3. **Berichtsvorlagen (0.8)** als Ausgabeformat: Schrittbericht, ⛔-Nachricht, Entscheide vor Start, Abnahme-Bericht, PR-Beschreibung.
4. **Entscheide je Paket gebündelt** in einem Block «⛔ Entscheide vor Start» am Paketanfang (A entschieden; B–E mit Empfehlungen). Die verstreuten `[entscheid: bestätigen]` verweisen auf die Blocknummern.
5. **Hypothesen verifiziert** und markiert: Diagramm 820/250, Redirect-Login vorhanden, `certEnd` gemappt aber nicht im Modell, `features` neu, Smoke-Selektoren und Screenshots (`print-*`, `dark-*`), Breakpoint 700 px, Glossar-Feld `grenzfaelle`, Spalten von `timeSeriesTable`.
6. **Datei-Karte** (Ansicht → Datei → Gruppe) und Baustein-Liste in den Lesehinweisen; Entscheid-Log-Befund (README nennt E1–E4, E5/E6 nur referenziert) mit Auftrag zur Vervollständigung E1–E10.
7. **Snapshot-Vergleich automatisiert** (`tools/snapshot-synth.js`, Schritt 0.3) statt manuell aus der Historie-Ansicht; DoD um CI-grün auf dem PR ergänzt.
8. **D.2:** CC führt `tools/headers.js` selbst auf der lokalen Kopie aus (nur Header); Header-abhängige Entscheide in einer Nachricht gebündelt.
9. **A5:** vorhandene synthetische Fälle aufgeführt, nur die fehlenden werden ergänzt; Hinweis auf betroffene Smoke-Prüfungen.
10. Kleinere Präzisierungen: Untertitel-Ist «Reporting KUBA · Phase 1 (nur lesen)», Nav-Links behalten den Hash-Filterzustand, leere Gruppe Experten nicht rendern, `caption`-Prüfung im Smoke-Test, Smoke-Prüfung «Bank: alle», B.4 mit Testfall, Node 22 in der CI.
