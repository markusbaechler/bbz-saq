# bbz Zertifizierungs-Cockpit «Reporting KUBA»

[![Tests](https://github.com/markusbaechler/bbz-saq/actions/workflows/tests.yml/badge.svg)](https://github.com/markusbaechler/bbz-saq/actions/workflows/tests.yml)

Read-only Dashboard (Single-Page-App ohne Build-Schritt) für die Prüfungskennzahlen der bbz-Zertifizierung.
Datenquelle ist die Excel-Datei `Reporting_KUBA.xlsx` auf der SharePoint-Site bbz-Zertifizierung; gelesen werden
ausschliesslich die Sheets «First Certification» und «Ausgestellte Zertifikate». Die Datei wird nie verändert.

- Live: https://markusbaechler.github.io/bbz-saq/ (Anmeldung mit M365-Konto, Zugriff gemäss SharePoint-Rechten)
- Lokal: `python -m http.server 3000` → http://localhost:3000
- Tests: `node tests/run-node.js` oder `tests.html` im Browser (synthetische Daten, keine Personendaten)
- Browser-Smoke-Test (Playwright, Chromium): `cd tests/smoke && npm ci && npx playwright install chromium && node run.mjs`. Erzeugt eine synthetische Excel im Temp-Verzeichnis, lädt sie in die App, rendert jede Ansicht, prüft Filter, Chips, Export-Menü, Glossar-Sprung, Kacheln, Tabellen-Encoding, aufklappbare Ereignisse, DQ-Suche, Tastaturbedienung, Druck, Dark Mode und den leeren Browser-Speicher; Screenshots unter `tests/smoke/output/`. Playwright ist die einzige npm-Abhängigkeit im Repo und reines Test-Tooling. Ohne Browser-Download lässt sich ein vorhandener Chromium über `SMOKE_CHROMIUM=<Pfad zur Headless-Shell>` verwenden.
- CI: GitHub Action «Tests» (`.github/workflows/tests.yml`) bei Push auf `main` und bei Pull Requests: Job «tests» (Syntaxprüfung aller Module, `node tests/run-node.js`, Kontrastprüfung der Farb-Tokens `node tools/contrast.js`, README-Glossar-Abgleich) und Job «smoke» (Browser-Smoke-Test, Screenshots als Artefakt bei Fehlern)
- Modellbericht auf einer lokalen Kopie der Datei (nur Zähler und Quoten): `node tools/modellbericht.js <Datei.xlsx>`
- Header-Übersicht beider Sheets ohne Zellwerte (Spalte, Header, gefüllte Zellen, unterschiedliche Werte, Experten-Markierung), vor jedem Mapping: `node tools/headers.js <Datei.xlsx>`
- Spike Schreibpfad (Paket E): Bericht `docs/SPIKE-mutation.md`; die lokale Testseite `spike/mutation.html` wurde mit Paket F entfernt (07.09.2026), der Ablauf ist durch `datasource/workbookAdapter.js` und die Tests mit Graph-Mock abgedeckt
- Snapshot der synthetischen Testdatei als Regressionsschutz bei Umbauten ohne fachliche Änderung: `node tools/snapshot-synth.js basis.json`, später `node tools/snapshot-synth.js --vergleich basis.json` (identisch = keine Zahl hat sich geändert)
- Betrieb und Einrichtung: [DEPLOY.md](DEPLOY.md)
- Auftragsdokumente: `PROMPT.md` (Phase 1), `PROMPT-2.md` (Ausbau). **Ein Paket mit Buchstaben** (A–G) stammt aus
  `PROMPT-2.md`, **ein Paket mit Namen** (BEFUNDE, DIAGRAMME, KOPFBEREICH, SIGNALE, NAVIGATION, MESSZEILE) aus der
  zweiten Runde ab dem 10.09.2026; die Namen stehen dort im Abschnitt «Runde 2 – benannte Pakete»

**Anmeldung (Betrieb):** MSAL (Popup, auf dem Phone Redirect) mit der App-URL als Redirect-URI. Entra schreibt die Antwort als
`#code=…&state=…` in diese URL; die App liest den Hash nie selbst und überschreibt ihn nicht (`isAuthResponseHash()` in `urlState.js`):
im Popup rendert sie nichts, das Elternfenster liest den Hash; im Redirect-Flow konsumiert MSAL die Antwort zuerst, danach kommen
Filter und Ansicht aus dem Hash. Eine unverwertbare Antwort (etwa nach Neuladen einer alten URL) wird verworfen und nur in der
Konsole gemeldet; echte Anmeldefehler (`#error=…`) erscheinen im Fehlerpanel. Nach dem Redirect-Login springt MSAL nicht mehr auf
die Ausgangs-URL (`navigateToLoginRequestUrl: false`). Hotfix vom 07.09.2026, Fehlerbild in DEPLOY.md.

## Ansichten

Die Navigation hat **zwei Ebenen** (Paket NAVIGATION). Das Band trägt **neun Primärziele** in drei Blöcken: erst die
anonymen Auswertungen Übersicht · **Prüfungen** · Zeitverlauf · Bank-Report, dann die Ansichten mit Namen
(bbz-intern) **Vorgänge** · Personen · Bestenlisten · Experten, zuletzt **Daten**. Drei davon fassen
Geschwister zusammen, die dieselbe Frage in Teilen beantworten – Prüfungen (Schriftlich, Mündlich, VSS/VSM),
Vorgänge (Offene Vorgänge, Geplante Prüfungen) und Daten (Historie, Datenqualität, Glossar). Die Geschwister stehen
als **Reiter neben dem Titel**, nicht in einer zweiten Leiste; bei einem gefassten Ziel nennt die Überschrift das
Ziel («Prüfungen») und der aktive Reiter die Ansicht («Schriftlich») – im Druck, wo die Reiter fehlen, hängt die
Ansicht als Zusatz an der Überschrift («Vorgänge · Geplante Prüfungen»). Die Reiter kosten keine Höhe (der View-Kopf bleibt
57 px, auf dem Phone 12–14 px mehr für das 44-px-Tap-Ziel). Im Druck erscheinen weder Band noch Reiter – gedruckt
wird der Inhalt, nicht der Weg dorthin. **Alle vierzehn Routen bleiben unverändert** – `#schriftlich` bleibt `#schriftlich`, Lesezeichen und die Wege
der Signale gelten weiter; das Band markiert das Primärziel, der Reiter die offene Ansicht (beide `aria-current`).

Warum: Vierzehn gleichrangige Links brauchten 1165 px und scrollten unter 1200 px. Gruppieren änderte daran nichts –
gemessen 1153–1165 px in jeder geprüften Gruppierung, weil eine Gruppenbeschriftung eine flache Reihe ordnet, aber
nicht entlastet. **Neun Primärziele brauchen 661 px** und passen ab 1000 px ohne Scroll; die Gruppenbeschriftung und
ihre 1500-px-Schwelle sind ersatzlos entfallen. Alle drei Erscheinungsformen – Band, Reiter und das Auswahlfeld auf dem
Phone (weiterhin alle vierzehn Ansichten, gefasste Ziele als `optgroup`) – entstehen aus **einer Deklaration**
(`NAV_PRIMAER` in `app.js` und der `group`-Export je Ansicht: der Name des Primärziels oder `null` für ein eigenes
Ziel). Eine Umgruppierung bleibt damit eine Datenänderung. Die frühere Sekundärnavigation im Kopf ist
entfallen (Paket KOPFBEREICH). Jede Ansicht beginnt mit Titel und einem Satz Kurzbeschreibung; rechts stehen das
Menü «Export» und der Link «Definitionen», der die passende Zeile im Glossar fokussiert. Erklärungen und Fussnoten der
Tabellen stehen gesammelt in der Legende «Hinweise und Definitionen» am Ende jeder Ansicht (im Druck geöffnet) und als ⓘ
am jeweiligen Titel. Der Datenstand (Datei, Änderungs- und Ladezeit, Zeilen, Data-Quality-Fehler) steht als Einzeiler in
der Kopfzeile und lässt sich zu allen Zählern aufklappen.

**Spaltenpriorität und Ranglisten-Raster (Paket KOPFBEREICH):** Eine Spalte wird ausgeblendet, wenn **das Fenster oder die
Tabelle** zu schmal ist. Prio 3 hing nur am Viewport – deshalb zeigte eine 429 px breite Rasterzelle bei 1400 px
Fensterbreite alle Prio-3-Spalten. Dazu kommt jetzt eine Container-Abfrage auf `.table-wrap`; ihre Grenzen bilden die
bisherigen Viewport-Grenzen ab (Viewport 1199 px entspricht Container 1117 px, 1899 px entspricht 1817 px), sodass
sich für Tabellen über die volle Breite nichts ändert. Beide Regeln gelten nebeneinander: In verschachtelten
Detailtabellen kommt die Containerbreite von der umgebenden Tabelle und kann auf dem Phone das Fenster übersteigen –
dort trägt die Viewport-Regel. **Prio 2 bleibt allein am Viewport**, weil dort die Zuordnung kippt: Unter 601 px wächst
die Grundschrift auf 16 px, der Container ist bei Viewport 600 px mit 576 px *breiter* als bei 601 px mit 559 px.

Das **Ranglisten-Raster** richtet sich neu an der nötigen Inhaltsbreite aus (`minmax(min(100%, 40rem), 1fr)`) statt an
26 rem. Vorher machte mehr Bildschirmbreite die Tabelle schmaler, weil `auto-fill` den Zugewinn an eine weitere Spalte
gab: 1280 px → 2 Spalten à 591 px (28 % abgeschnitten), 1400 px → 3 à 429 px (48 %), 1600 px → 3 à 495 px (39 %).
Jetzt steht lieber eine ganze Liste als zwei halb abgeschnittene; gemessen wird bei 1280–1920 px nichts mehr
abgeschnitten.

**Klebender Kopfbereich und Tabellenkopf (Paket KOPFBEREICH):** Beim Scrollen schrumpft die Filterleiste auf ihre
Zusammenfassungszeile – **99 auf 29 px**. Zähler und Chips bleiben stehen, weil sie der Qualifier jeder Zahl auf dem
Schirm sind; die Steuerelemente verschwinden, weil man sie beim Lesen nicht bedient. Der Weg zurück ist das Scrollen
nach oben, für Maus und Tastatur gleich. Darunter klebt der **Tabellenkopf** auf `--sticky-top`, das aus der
tatsächlichen Leistenhöhe kommt (`ResizeObserver`), damit es in jeder Breite und in beiden Zuständen stimmt.

Möglich ist das nur, weil `.table-wrap` **nur noch dort ein Scroll-Container ist, wo die Tabelle wirklich horizontal
überläuft** (Klasse `scrolls-x`, in `app.js` gemessen). Ein Scroll-Container im Vorfahren verhindert seitenweites
Kleben – gemessen in Paket DIAGRAMME (B6) und dort belegt. Die Zahlen dahinter: bei 1400 px laufen 3 von 60 Tabellen
horizontal über, und **keine** der 7 Tabellen über 500 px Höhe gehört dazu; die langen Tabellen brauchen den
Scroll-Container also gar nicht. In den drei breiten Tabellen bleibt der Kopf ungeklebt, dafür bleibt dort die erste
Spalte beim horizontalen Scrollen stehen. Auf dem Phone schrumpft nichts: Dort klebt die Leiste ohnehin nicht.

**Datenstand im Kopf:** Der Einzeiler besteht aus einem schrumpfenden Mittelteil (Dateiname, Zeilen, Änderungs- und
Ladezeit) und dem **nicht schrumpfenden Fehlerzähler**. Vorher wurde am Ende gekürzt und damit ausgerechnet «DQ n
Fehler» verdeckt – bei 1280 px 26 % des Einzeilers. Unter 1500 px entfällt zuerst die Ladezeit, unter 1200 px das
Änderungsdatum; der Zähler bleibt in jeder Breite vollständig stehen.

**Kopfbereich (Paket KOPFBEREICH):** Über dem Inhalt stehen zwei Bänder plus Navigation – Kopfzeile (Marke, Datenstand, Konto) und
Filterleiste. Die **Datenleiste erscheint nur im Leerzustand**: Sie trägt zwei Aktionen, keine Dauerinformation, und die
Leerzustandskarte bietet dieselben zwei Aktionen ohnehin. Mit geladenen Daten fällt sie weg; «Neu laden» und «Lokale
Datei» liegen im aufgeklappten Datenstand. Gemessen bei 1400 × 900: **293 px statisches Chrome auf 170 px**, der erste
Zahlenwert von y = 495 auf **y = 356** (von 55 % auf 40 % der Viewporthöhe). Der Volltext des Datenstands bleibt in
`#status` (`aria-live`) und ist bei geladenen Daten nur für Screenreader sichtbar.

| Ansicht | Inhalt |
|---|---|
| Übersicht | KPIs für den aktiven Filter (Vorgänge, Personen, offene Vorgänge, Quoten; Ø-Kacheln mit Streuung σ, Median und Quartilen), Auswahl gegen Benchmark mit Differenz und Einordnung (Effektstärke bzw. Wilson-Intervall), Kennzahlen je Profil, Personen mit mehreren Profilen |
| Schriftlich | Bestehensquoten (Erstversuch, gesamt) nach Profil, Sprache, Bank; Ø Performance mit σ, Median, P25, P75 nach Profil, Sprache, Bank und Teilprüfung WE1–WE6; Verteilung der Resultate (Histogramm Auswahl vs. Benchmark) |
| Mündlich | Bestehensquote gesamt und je Profil, Anteil 1× / 2× durchgefallen; Ø Performance mit σ, Median, P25, P75 nach Profil, Sprache, Bank; Verteilung der Resultate (Histogramm) |
| VSS/VSM | Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil |
| Zeitverlauf | Kennzahlen je Jahr (Liniendiagramm und Tabelle, gesamt und je Profil), zwei Jahre vergleichen (Prozentpunkte), Schwierigkeit je Teilprüfung und Jahr, Durchlaufzeit je Profil und Jahr |
| Historie | Snapshots der Aggregate (ohne Namen) als JSON erzeugen, ablegen (z. B. SharePoint) und später wieder laden: Kennzahlen gesamt, Datei-Zähler und je Profil je Stichtag nebeneinander, Differenz zum letzten Snapshot; ohne Filter, nur im Memory (b7) |
| Bestenlisten | Je Profil: bbz-Award, beste schriftliche, beste mündliche Prüfung (mit Namen); Mindestgruppengrösse 5, Liste höchstens halbe Gruppe (maximal 5); Award-Dossier mit Begründung je Rang |
| Bank-Report | Kennzahlen einer gewählten Bank gegen den anonymen Benchmark «alle Banken» mit Differenz und Einordnung (Effektstärke bzw. Wilson-Intervall), je Profil und je Jahr; ohne Namen; Druck/PDF |
| Personen | Eine Person suchen (Name, Bank, Profil, Sprache, Zertifikat-Nr., Status; ab 2 Zeichen, mehrere Begriffe = UND) und ihren Weg nachvollziehen: Pfad über alle Vorgänge, je Vorgang Stammdaten, Status, Prüfungsraster (Teilprüfungen × RUN1–RUN3), Zeitachse, Datenqualität und Export «Diese Person»; mit Namen (E7). Ohne Suchtext leer, ausser eine Bank ist gefiltert (dann alle Personen der Bank); Geburtsjahr nur bei Namensgleichen |
| Offene Vorgänge | Laufende Zertifizierungsprozesse (Gesamtergebnis leer) je Profil und mit Teilnehmenden: fehlende Teile, letzte Prüfung, nächster Termin, Versuche (mit Namen); Teilprüfungen je Profil; Frühwarnung «zweiter Fehlversuch»; passiv seit über 365 Tagen |
| Geplante Prüfungen | Termine in der Zukunft ohne Ergebnis, zuerst schriftlich (WE), dann mündlich (OE): je Art die Prüfungsereignisse je Tag und Ort (Teilprüfungen mit Anzahl, Wiederholungen; Zeile anklicken → zugeteilte Personen) und die vollständige Teilnehmendenliste zum Aufklappen (mit Namen, Bank, Profil, Sprache) |
| Experten | Je Experte/Expertin der mündlichen Prüfung: Einsätze, Rollen (als Experte 1/2, Anteil Experte 1), Durchfallquote im 1. Versuch und bei Wiederholungen, Ø Resultat, jeweils mit Δ zum Benchmark aller Experten im Filter (E9, neutral dargestellt); Zeilen-Detail je Jahr, Profil, Sprache und Partner; Paarungen Experte 1 × Experte 2; Export «Einsatzebene» mit Kandidaten- und Expertennamen «nur intern». Beobachtungswerte, keine Leistungsbeurteilung; mit Expertennamen (E8). Ohne Expertenspalten in der Datei erscheint ein Hinweis |
| Datenqualität | «Nicht in den Kennzahlen» mit Grund je Zeile; jede nicht interpretierbare oder auffällige Zelle mit Wirkung auf die Kennzahlen, Stufe, Sheet, Zeile, Header, Rohwert, Grund; nach Wirkung priorisiert, sortier- und filterbar |
| Glossar | Begriffe und Kennzahl-Definitionen (Definition, Nenner, Grenzfälle), auch ohne geladene Daten |

Jede Kennzahl-Ansicht bietet im Menü «Export» CSV (alle Tabellen in einer Datei) und XLSX (ein Blatt je Tabelle) sowie
eine Druckansicht. Zusätzlich exportiert jede Kennzahl-Ansicht die Vorgangsebene (eine Zeile je Vorgang, eine Zeile je
Run, mit Namen, nur intern). Der Filterzustand steht im Kopf jedes Exports.

**Messzeile statt Kachel für Quoten (Paket MESSZEILE):** Die fünf **Durchfallquoten** der Übersicht stehen als
**Messzeilen auf einer gemeinsamen Spur ab 0 %** – erst dadurch sind sie untereinander vergleichbar; zwei Kacheln sind es
nicht. Die Spur endet auf der nächsten 5-%-Stufe **über** dem grössten Wert des Blocks (mindestens 10 pp Spanne),
dieselbe Regel wie die Achse der Diagramme: Bei Werten zwischen 0.4 und 20.7 % läuft sie bis 25 % statt bis 50 %,
sonst läge der grösste Punkt in der linken Hälfte und der Rest wäre nicht unterscheidbar. Gezeigt wird die Durchfall-, nicht die Bestehensquote: Bei 99.3 % bestanden steckt die Aussage in der
Gegenzahl, und gefragt wird nach der **Anzahl der Nichtbestandenen**. Je Zeile: Beschriftung (mit ⓘ: Definition samt Nenner – «nicht bestanden» hat sonst drei Lesarten) · Spur · Wert ·
**Anzahl** («191 von 977» – Zähler und Grundgesamtheit) · Verlauf · Wert letztes Jahr · Δ Vorjahr · Δ Benchmark. Die Kopfzeile
benennt die Spalten, weil zwei Abstände nebeneinander sonst dasselbe Zeichen für Verschiedenes tragen. Auf der Skala liegen das
**95-%-Wilson-Intervall** als Balken, der Wert als Punkt und, bei aktivem Benchmark, dessen Marke; der Abstand steht
als Zahl in der letzten Spalte (Symbol, Vorzeichen, Farbe nach Richtung; unter 0.5 pp neutral – dieselbe Schwelle wie
auf den Kacheln und in der Vergleichstabelle). **Ohne benchmarkrelevanten Filter** entfallen Marke, Spalte und Zahl:
Dann ist die Auswahl der Benchmark, und «● 0.0 pp» auf jeder Zeile sagte nur das. Werte ausserhalb der Spur stehen am Anschlag und sagen es («unter 0 %», «über 50 %»); abgeschnitten wird
nichts. Der Verlauf ist eine Sparkline über die Jahre mit n ≥ 5 (unter drei Jahren keine); das **laufende Jahr** erscheint
darin als offener Punkt, zählt aber nicht als Vergleichsjahr – ihm fehlen Wiederholungen und Nachträge, und gegen ein
volles Jahr gerechnet ergäbe es einen Abfall, den es nicht gibt. «Letztes Jahr» ist deshalb das jüngste
**abgeschlossene** Jahr; das Δ Vorjahr gilt gegen das
Jahr davor und färbt sich erst ab 2 pp, darunter bleibt es neutral – sonst färbt sich Rauschen ein. Die beiden
Schwellen unterscheiden sich bewusst: Der Jahresabstand ist ein Trendsignal (2 pp), der Benchmark-Abstand folgt der
Regel, die dieselbe Zahl auf den Kacheln und in der Vergleichstabelle schon trägt (0.5 pp).

**Im Druck** weichen Verlauf und «letztes Jahr»: Auf A4 blieben der Spur sonst 84 px, und ein Wilson-Balken von
84 px sagt nichts – gemessen bleiben so 192 px. Die Jahreswerte stehen im Bank-Report in der Tabelle «Verlauf je
Jahr» derselben Seite. Spur, Balken, Punkt und Marke tragen `print-color-adjust: exact`, sonst druckt der Browser
die Flächen nicht und übrig bliebe eine Zahlenreihe ohne Bezug.

**Mengen bleiben Kacheln** – ohne n-Zeile: Ihr Wert ist die Anzahl, und die Grundmenge der Auswahl daneben meinte
etwas anderes als die Kachel («Personen 970 · n = 977» zählte Vorgänge). Eine Anzahl hat keine Spur von 0 bis 50 %, und eine erfundene wäre schlimmer als keine.
Die vier Ø-Kennzahlen bleiben ebenfalls Kacheln, weil sie die Streuungszeile (σ, Median, Quartile) tragen.
Reihenfolge der Übersicht: Signale · Durchfallquoten · Mengen · Ø Resultat · Kennzahlen je Profil. Die fünf Zeilen
folgen dem Prozess: je Prüfungsteil vom ersten Versuch zum Endstand (schriftlich 1. Versuch, schriftlich endgültig,
mündlich 1. Versuch, mündlich 2×, mündlich 3×). **«3× durchgefallen»** belegt das endgültige Scheitern über die
Versuche (RUN1, RUN2 und RUN3 nicht bestanden), statt es aus «All Passed» = no zu erschliessen – diese Spalte sagt
nicht, nach wie vielen Versuchen. Schriftlich bleibt es bei **«endgültig nicht bestanden»** (abgeschlossener Vorgang
mit «WE All Passed» = no), weil sich die schriftliche Prüfung aus mehreren Teilprüfungen mit eigenen Versuchen
zusammensetzt.

**Ein Raster für den Block:** Kopfzeile und Zeilen teilen ein Subgrid – nur so beginnt die Spur in jeder Zeile am
selben Punkt und die Achsenbeschriftung steht darüber. Vorher rechnete jede Zeile ihre Spaltenbreite selbst; gemessen
begann die Spur bei 316, 310, 313, 248 und 306 px und die Achse 130 px weiter links.
Die **Bestehensquoten** erscheinen nicht mehr auf der Übersicht: Jede ist die Gegenzahl einer Messzeile («80.5 %
bestanden» = «19.5 % durchgefallen»), und zweimal dieselbe Aussage ist eine zu viel. Als Kennzahlen bleiben sie
vollständig – in der Vergleichstabelle, im Export und in den Ansichten «Schriftlich» und «Mündlich».

**Höhenbudget, gemessen bei 1400 × 900 mit sechs Signalen:** Die letzte Messzeile endet bei y = 791, die erste
Mengen-Kachel beginnt bei y = 846 – beides über der Falz. Vorher endete die letzte Quoten-Kachel bei y = 1119.

**Darstellung:** Die Kacheln der Übersicht stehen in den Blöcken Mengen und Ø Resultat. Auf jeder Kachel steht
der **Wert zuoberst**, darunter die Beschriftung, darunter n und zuletzt die Differenz zum Benchmark (Paket BEFUNDE): So liegen die
Werte einer Reihe unabhängig vom Umbruch der Beschriftung auf einer Linie. Die Beschriftung hält zwei Zeilen frei, damit auch
n und Differenz auf einer Linie liegen – der Preis ist eine Zeilenhöhe bei den wenigen einzeiligen Beschriftungen. Die
Definition steckt im ⓘ, das Label verlinkt auf das Glossar. Bei aktivem Benchmark zeigt jede Ø-Kachel die Differenz mit Symbol,
Vorzeichen und Farbe nach Richtung der Kennzahl (▲ +2.1 pp; höher ist besser bei Bestehensquoten und Ø Resultat, tiefer
ist besser bei Durchfallquoten und passiven Vorgängen; unter 0.5 pp neutral ●). In Tabellen tragen Prozentspalten einen
Datenbalken, Differenzspalten Symbol und Farbe, Statusspalten eine Badge; die erste Spalte bleibt beim horizontalen
Scrollen stehen. Der **Tabellenkopf ist nicht fixiert**: Er war es dem CSS nach, wirkte aber nie – der nächste
Scroll-Container ist `.table-wrap`, und der scrollt nur horizontal. Die Regel ist in Paket DIAGRAMME entfernt statt repariert;
ein fixierter Kopf ergibt erst Sinn, wenn feststeht, wie viel Kopfbereich über ihm klebt (Paket KOPFBEREICH, Filterleiste). Farbe trägt nie allein Bedeutung. Jede Spalte hat eine Priorität (1 = immer, 2 = ab Tablet, 3 = ab
1200 px) für schmale Bildschirme; unter 1200 px blendet «Alle Spalten» die Prio-3-Spalten ein; breite Tabellen (Experten, Ø-Tabellen mit Streuung) zeigen Prio 3
erst ab 1900 px (Full HD). Kopfzellen brechen um, Zahlen nicht (Paket F).

**Mobile:** Phone bis 600 px, Tablet 601–900 px, darüber Desktop; der Druck behält immer das Desktop-Layout. Auf dem
Phone gilt: Grundschrift 16 px, Touch-Ziele mindestens 44 px, nie horizontaler Seitenscroll (nur Tabellen scrollen in
ihrem Rahmen). Die Navigation ist ein Auswahlfeld mit allen vierzehn Ansichten (gefasste Ziele als Gruppe); die Reiter der
Geschwister bleiben als Abkürzung stehen, mit 44-px-Tap-Ziel und in einer Zeile (gemessen 229–262 von 390 px).
Die Filter liegen in einem Drawer «Filter
(n aktiv) · n Vorgänge · n Personen» mit Chips darunter, der Datenstand ist ein Einzeiler mit den Lade-Aktionen «Neu laden · Lokale Datei» im aufgeklappten Zustand (die
Datenleiste zeigt auf dem Phone keine Knöpfe, vor dem Laden ist die Leerzustand-Karte der einzige Aufruf), das Konto ein
Initialen-Button mit «Abmelden». Tabellen zeigen nur Spalten der Priorität 1 (Tablet und Desktop bis 1200 px: 1 und 2);
«Alle Spalten» blendet die übrigen ein und scrollt die Tabelle horizontal. Die Kacheln der Übersicht stehen in aufklappbaren Blöcken (Schriftlich und Mündlich offen, Mengen zu) mit
nur Label, Wert, n, Streuung als «σ x pp» und Delta-Symbol; Diagramme sind kompakt (360 × 200, Tooltip darunter). Vollständig für das Phone
gestaltet sind Übersicht, Offene Vorgänge, Geplante Prüfungen, Personen und Experten (Nebenabschnitte eingeklappt); die übrigen Ansichten
funktionieren ohne Überlauf. Die Anmeldung auf dem Phone läuft direkt über den Redirect-Flow von MSAL (kein Popup); der
manuelle Gerätetest liegt beim Auftraggeber. Der Smoke-Test prüft die Viewports 1400 × 1000, 820 × 1180 und 390 × 844 sowie die Desktop-Breiten 1100, 1280, 1400 und 1920 px
(Navigation ohne Scroll, Tabellen ohne Überlauf, Filterleiste einzeilig; Paket F).

## Globale Filter

Jahr (Auswahlfeld mit «Alle» und den Jahren; setzt Von–Bis), Von–Bis (wirkt auf das Referenzdatum), Profil, Sprache, Bank
(Auswahlfeld höchstens 12rem breit, langer Name abgeschnitten, voll als Tooltip), VSS/VSM, Versuche (alle | nur 1. Versuch |
mehrere Versuche), «nur ausgestellte Zertifikate» (Sheet 2 oder damit zusammengeführt). Die Filterleiste haftet beim Scrollen
oben und bleibt ab 1280 px einzeilig (Paket F). Unter den Steuerelementen stehen «n Vorgänge · n Personen»
und je aktive Einschränkung ein Chip (z. B. «2026 ✕», «Profil PK ✕»); ✕ entfernt genau diesen Filter. «Filter
zurücksetzen» steht rechts in dieser Zeile und erscheint nur, wenn ein Filter vom Standard abweicht.

**Filterzustand in der URL:** Ansicht, Filter, Wertung und Benchmark stehen im Hash der Adresse
(`#schriftlich?von=2025-01-01&bis=2025-12-31&profil=PK&bank=…&wertung=bestanden&benchmark=profil`) und lassen sich als
Link teilen; nach dem Öffnen müssen die Daten neu geladen werden. Die URL enthält nie Personendaten. Die Filterleiste wird
bei Filteränderungen nur aktualisiert, nicht neu aufgebaut; der Tastaturfokus bleibt auf dem bedienten Element.
Die Wertung (Resultat 1. Versuch | Resultat bestandener Run) wird nur in der Ansicht «Bestenlisten» gewählt; alle anderen
Ansichten zeigen beide Wertungen nebeneinander. In der Ansicht «Geplante Prüfungen» wirkt der Zeitraum nicht.

**Wertung und Benchmark in der Filterleiste (Paket KOPFBEREICH):** Beide schrieben schon immer **globalen, in der URL
serialisierten Zustand** – «Wertung» in `filter.mode`, «Benchmark» in `ui.benchmark` –, standen aber in
Werkzeugleisten einzelner Ansichten. Wer die Wertung in den Bestenlisten umstellte, änderte sie damit auch für die
Übersicht, ohne dass es dort sichtbar war. Sie stehen jetzt in der Filterleiste, mit derselben Abschaltlogik wie die
übrigen Felder. Anders als diese sind sie **ohne ausdrückliche Angabe abgeschaltet**, weil sie nur in wenigen
Ansichten gelten: «Wertung» auf «Bestenlisten», «Benchmark» auf «Übersicht», «Schriftlich» und «Mündlich». Die
Ansichts-Werkzeugleisten sind entfallen; in der Übersicht bleibt stehen, was der Benchmark bewirkt (seine Grösse).

Damit trägt die Leiste elf statt neun Steuerelemente. Gemessen passt sie bei 1400 px in **eine Zeile** (97 px,
statisches Chrome 172 px, erster Zahlenwert bei y = 343) und seit Paket SIGNALE auch bei **1280 px** (101 px, Chrome 176 px
statt 225). Möglich wurde das durch Entdopplung der Optionstexte: Das Substantiv steht in der Feldbeschriftung, der
Wert in der Option – «VSS/VSM: Ohne» statt «VSS/VSM: Ohne VSS/VSM». Die **Chips** behalten die ausgeschriebene Form,
weil sie ohne Feldbeschriftung stehen.
Die Beschriftung des Zertifikat-Filters ist dafür auf «Zertifikate» gekürzt (voller Text als Tooltip) – sie war mit
188 von 1384 px die längste und entschied allein darüber, ob die Reihe umbricht. Jedes Steuerelement trägt ein
`data-field`, weil sich «Bank» und «Benchmark» über den Beschriftungstext nicht unterscheiden lassen.

**Wirksamkeit der Filterleiste je Ansicht (Paket BEFUNDE):** Nicht jede Ansicht wertet jedes Steuerelement aus. Statt das im
Text zu erklären, schaltet die Leiste ab, was hier nichts tut: Das Feld ist `disabled`, gestrichelt umrandet und gedämpft,
der Grund steht als Tooltip darauf. Jede Ansicht sagt das selbst über den Export `filters` (`views/<ansicht>.js`); fehlt er,
gilt alles als wirksam. **Der gesetzte Wert bleibt erhalten** – er steht weiter im Feld und in der URL und wirkt wieder,
sobald eine Ansicht ihn auswertet; solange er stumm ist, fehlt sein Chip und die Zusammenfassung zählt ihn als
«n gesetzte Filter wirken hier nicht». Abgeschaltet sind: Zeitraum auf «Zeitverlauf», «Offene Vorgänge» und «Geplante
Prüfungen»; Zeitraum, Versuche und Wertung auf «Personen»; Versuche und Wertung auf «Experten» – dort bleibt der Zeitraum
aktiv, mit sichtbarem Hinweis, dass er auf das Run-Datum des Einsatzes wirkt.

Wo **kein** Feld wirkt, entfällt die Leiste ganz (`filters.hidden`) und ein Satz sagt, warum: «Datenqualität» (das Log prüft
immer den vollen Bestand beider Sheets), «Historie» (ein Snapshot hält den Stand der ganzen Datei fest) und «Glossar»
(statisch, ohne Daten). Ein trotzdem gesetzter Filter geht auch dort nicht verloren: Der Satz nennt ihn («1 gesetzter Filter
wirkt hier nicht») und trägt «Filter zurücksetzen», damit kein Wert ohne Bedienelement stehen bleibt.

**Zwei Prozessstufen, zwei Namen (Paket BEFUNDE):** Die schriftliche Prüfung ist das Gate zur mündlichen. Entsprechend gibt es zwei
verschiedene «offen»-Zahlen, die früher beide «Offen» hiessen: **«Schriftlich offen»** (Spalte in «Kennzahlen je Profil») zählt
Vorgänge ohne *schriftliches* Gesamtergebnis, **«Zertifizierung offen»** (Kachel im Block «Mengen») Vorgänge ohne Gesamtergebnis
überhaupt. Wer schriftlich offen ist, ist immer auch in der Zertifizierung offen – umgekehrt nicht; die Spaltensumme ist deshalb
nie grösser als die Kachel. Im Snapshot bleibt der Schlüssel `offen` unverändert (Dateiformat), nur die Beschriftung folgt.

**Benchmark (Übersicht):** Die Kacheln und eine Vergleichstabelle stellen die Auswahl einem Benchmark gegenüber, der
dieselben Filter verwendet, nur ohne die gewählte Einschränkung: Alle Banken (Standard), Alle Profile, Alle Sprachen
oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten.

Ist die weggenommene Einschränkung gar nicht gesetzt, sind Auswahl und Benchmark dieselbe Menge – jede Kachel trüge dann
«● 0.0 pp» und sagte damit nur, dass kein Filter aktiv ist. In diesem Zustand entfällt die Delta-Zeile ganz (Paket BEFUNDE), die
Vergleichstabelle wird eingeklappt und davor steht der Satz «Kein Filter aktiv – die Auswahl entspricht dem Benchmark …»
mit dem Link «Bank wählen», der den Bank-Filter in den Fokus holt. Massgeblich ist der Filterzustand, nicht die Zahl der
Vorgänge: `benchmarkRelevant()` vergleicht den Filter der Auswahl mit dem des Benchmarks. Der Zeitraum zählt nie mit, weil
der Benchmark denselben verwendet. Die Kachel reserviert für die Delta-Zeile keinen Platz auf Vorrat: Die Reihe wächst
einmalig, wenn ein Filter gesetzt wird – eine dauerhaft leere Zeile unter zehn Kacheln kostet mehr, als der Sprung wert ist.

In der Ansicht «Personen» wirken Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» auf die Trefferliste; Zeitraum,
Versuche und Wertung wirken nicht. Das Detail zeigt immer alle Vorgänge der Person. Suchtext und gewählte Person stehen nie in der
URL (nur im Memory) und werden beim Neuladen der Daten geleert.

In der Ansicht «Experten» wirken Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» über die Vorgänge; der Zeitraum wirkt auf
das Run-Datum des Einsatzes, nicht auf das Referenzdatum des Vorgangs («2025» zeigt die Einsätze des Jahres 2025). Versuche und Wertung
wirken nicht. Die Haupttabelle wird wie jede andere Tabelle sortiert (Paket DIAGRAMME); der Sortierzustand steht in der URL.

## Modell: Vorgänge, Personen, Duplikate, Status (Entscheid-Log E1–E14)

Eine Zeile der Datei ist ein **Zertifizierungsvorgang**; eine **Person** (Mensch) kann mehrere Vorgänge haben und wird über
den **Personenschlüssel** aus «Last Name», «First Name» und Geburtsdatum identifiziert (nicht Employer). Zeilen derselben
Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten sind **Duplikate** und werden zu einem Vorgang
zusammengeführt. Jeder Vorgang hat einen **Status**: bestanden / nicht bestanden / offen / nicht erfasst; offene Vorgänge
ohne Prüfung seit mehr als 365 Tagen und ohne Termin gelten zusätzlich als **passiv** (eigene Zahl, nie «nicht bestanden»).
Nenner der Bestehensquoten sind abgeschlossene Vorgänge. Definitionen und Grenzfälle: Abschnitt «Kennzahl-Definitionen» bzw. Ansicht
«Glossar».

- Der Header «Birth Date» ist Pflicht in beiden Sheets (am File verifiziert). Leere oder unlesbare Geburtsdatum-Zellen ergeben
  einen Schlüssel nur aus dem Namen; die Anzahl steht im Modellbericht (`schluesselOhneGeburtsdatum`).
- Lokaler Modellbericht (Zähler, Duplikate, offene Vorgänge, Quoten alt → neu je Profil, Score-Beispielwerte; keine Namen):
  `node tools/modellbericht.js /pfad/zu/Reporting_KUBA.xlsx`

**Entscheid-Log des Auftraggebers** (verbindliche Grundlage; Details im Glossar):

- **E1 (05.09.2026)** Duplikate: zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten werden zu einem Vorgang zusammengeführt; widersprüchliche Zeilen bleiben eigene Vorgänge (Hinweis «Wiederholung?»).
- **E2 (05.09.2026)** Personenschlüssel aus «Last Name», «First Name» und Geburtsdatum; ein Bankwechsel ändert die Person nicht (Employer ist nicht Teil des Schlüssels).
- **E3 (05.09.2026)** Prüfungsbezogene Quoten zählen Vorgänge; eine Person mit zwei Profilen zählt zweimal. «Personen» wird nur ausgewiesen, wo Menschen gezählt werden.
- **E4 (05.09.2026)** Nenner der Bestehensquoten sind abgeschlossene Vorgänge (bestanden + nicht bestanden); leeres Gesamtergebnis = offen, «no» gilt als abgeschlossen. Offene Vorgänge ohne Prüfung seit mehr als 365 Tagen und ohne Termin sind «passiv» (eigene Zahl, nie «nicht bestanden»).
- **E5 (05.09.2026)** Bestenlisten nur ab 5 Vorgängen im Profil, Liste höchstens halbe Gruppe (maximal 5). Exporte auf Vorgangsebene und Listen mit Namen sind bbz-intern.
- **E6 (05.09.2026)** «Result» ist massgebend, «Score» wird nicht ausgewertet; das Parsing bleibt, damit verrutschte Zellen sichtbar sind.
- **E7 (06.09.2026)** Namen zusätzlich in der Ansicht «Personen» (Paket C); Nutzerkreis bbz-intern; nie in URL, Snapshots, Repo.
- **E8 (06.09.2026)** Expertennamen in der Ansicht «Experten» (Paket D).
- **E9 (06.09.2026)** Die mündliche Prüfung prüft Methodik → profilübergreifend vergleichbar; Benchmark je Experte über alle Experten im Filter, getrennt nach Erstversuch und Wiederholung.
- **E10 (06.09.2026)** Regel 1 präzisiert: die Struktur der Excel-Datei wird nie geändert; Zellwerte nur über den Schreibpfad (Paket E) mit Feature-Flag, Validierung, Konfliktprüfung und Audit. Scope `Files.ReadWrite.All` ist in Azure gesetzt.
- **E11 (06.09.2026)** Personensuche: ohne Suchtext leere Liste, ausser der Bank-Filter ist gesetzt (alle Personen der Bank); Profil, Sprache, Bank, VSS/VSM und Zertifikate wirken auf die Trefferliste, Zeitraum, Versuche und Wertung nicht, das Detail zeigt alle Vorgänge; Geburtsjahr nur bei Namensgleichen, nie das volle Datum; Export «Diese Person» mit Dateiname ohne Namen, Inhalt «nur intern».
- **E12 (06.09.2026)** Experten: Mapping über die am File verifizierten Header «OE{p} RUN{r} Expert 1/2» (optional, ältere Dateien laden weiterhin), erfasst ab 2018 (`CONFIG.experts.from`); Rollen neutral beschriftet (Beobachtung: Experte 1 kleinerer Kreis, Hypothese Prüfungsleitung), Spalte «OE Expert» nicht gemappt; ein Einsatz zählt für beide Experten, Runs mit Ergebnis ohne Datum zählen ohne Zeitraumfilter; Zeitraum wirkt auf das Run-Datum, Versuche und Wertung nicht; Δ zum Benchmark je Versuchsart neutral dargestellt (Beobachtungswerte); Paarungstabelle; Export «Einsatzebene» mit Namen «nur intern»; Alias-Liste leer.
- **E13 (06.09.2026)** Schreibpfad produktiv freigeschaltet (`features.write = true`) auf Anweisung des Auftraggebers nach dessen Test über die App
  auf der Testkopie (Bearbeitungsmodus, Dialog, Schreiben, Neuladen, Audit, Historie). Der formale Lauf der Spike-Testseite ist nicht protokolliert;
  das Restrisiko «Datei gleichzeitig in Excel Desktop geöffnet» (423/409 → Konfliktmeldung, kein Datenverlust) ist akzeptiert. Die Testseite `spike/`
  wurde mit Paket F entfernt (07.09.2026).
- **E14 (07.09.2026)** Streuung: σ als Stichproben-SD (n−1) über die Vorgänge mit Wert, immer mit Median und Quartilen; keine SD für Quoten, stattdessen
  95-%-Wilson-Intervall; Einordnung von Differenzen über die Effektstärke (Ø-Kennzahlen, Skala < 0.2 gering, ≤ 0.5 mittel, < 0.8 deutlich, ≥ 0.8 gross)
  bzw. das Intervall (Quoten); Streuung erst ab n ≥ 5; nicht im Snapshot; Histogramm der Resultate in Schriftlich und Mündlich; auf dem Phone nur
  «σ x pp», neue Tabellenspalten als Prio 3 (breite Tabellen zeigen Prio 3 erst ab 1900 px).

## Kennzahl-Definitionen

Grundgesamtheit aller Kennzahlen: Vorgänge (keine Duplikate) mit mindestens einem **absolvierten, datierten schriftlichen
Run** im aktiven Filter. Alle Quoten werden mit n (Nenner) ausgewiesen, Prozent mit einer Dezimale; Gruppen mit n < 5 sind
mit `*` markiert. Die folgenden Tabellen sind aus `glossary.js` erzeugt (`node tools/glossar-readme.js --write`) und
identisch mit der Ansicht «Glossar» in der App.

<!-- glossar:start -->
### Begriffe

| Begriff | Definition | Grenzfälle / Hinweise |
|---|---|---|
| **Zertifizierungsvorgang (Vorgang)** | Eine Zeile der Excel-Datei: eine Person durchläuft die Zertifizierung für ein Profil. Alle prüfungsbezogenen Quoten zählen Vorgänge. Duplikate (dieselbe Person, dasselbe Profil in beiden Sheets) sind zu einem Vorgang zusammengeführt. | Eine Person mit zwei Profilen hat zwei Vorgänge und zählt in Quoten zweimal – bewusst, weil zwei Zertifizierungen stattfanden (E3). |
| **Person** | Mensch hinter einem oder mehreren Vorgängen, identifiziert über den Personenschlüssel. «Personen» wird nur dort ausgewiesen, wo Menschen gezählt werden. | Bankwechsel ändert die Person nicht (Employer ist nicht Teil des Schlüssels, E2). |
| **Personenschlüssel** | Normalisiert aus «Last Name», «First Name» und Geburtsdatum: Akzente entfernt, ß → ss, Kleinschreibung, Bindestriche und Mehrfach-Leerzeichen zu einem Leerzeichen. | Header «Birth Date» (beide Sheets, am File verifiziert) ist Pflicht. Ist die Zelle leer oder unlesbar, besteht der Schlüssel nur aus dem Namen; namensgleiche Personen fallen dann zusammen (Zähler in der Statuszeile). |
| **Duplikat** | Zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten (gleicher Run, anderes Datum oder anderer Passed-Wert). Sie werden zu einem Vorgang zusammengeführt: Lücken werden aufgefüllt, nie überschrieben; behalten wird die Zeile mit den meisten absolvierten Runs, bei Gleichstand die aus «Ausgestellte Zertifikate». | Widersprüchliche Zeilen bleiben eigene Vorgänge und erhalten den Hinweis «Wiederholung?» im Data-Quality-Log (E1). |
| **Status: bestanden / nicht bestanden / offen / nicht erfasst** | Je Vorgang getrennt für schriftlich («WE All Passed»), mündlich («OE All Passed») und gesamt. yes → bestanden, no → nicht bestanden, leer → offen (der Prozess läuft noch), gefüllt aber unlesbar → nicht erfasst (Fehler im Data-Quality-Log). Gesamt: nicht bestanden, sobald ein Teil nicht bestanden ist; bestanden nur, wenn beide bestanden sind. | Im Sheet «Ausgestellte Zertifikate» gelten leere Gesamtergebnisse als bestanden (Zertifikat setzt beides voraus), mit Hinweis im Log. Ob ein «no» später zu «yes» werden kann, ist [unklar]; nach E4 gilt «no» als abgeschlossen. |
| **Abgeschlossener Vorgang** | Vorgang mit Status bestanden oder nicht bestanden (schriftlich bzw. mündlich). Nenner aller Bestehensquoten «insgesamt bestanden» und «mündlich bestanden» (E4). | Offene und nicht erfasste Vorgänge stehen nicht im Nenner und werden als eigene Zahlen ausgewiesen. |
| **Kennzahlrelevant (Grundgesamtheit)** | Vorgänge (keine Duplikate) mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Alle Kacheln und Tabellen ausser «Geplante Prüfungen» rechnen auf dieser Menge. | Zeilen ohne absolvierten schriftlichen Run (nur geplante Termine, nur mündliche Runs, Run ohne Datum) sind ausgeschlossen; die Ansicht «Datenqualität» nennt den Grund je Zeile. |
| **Absolvierter Run** | Ein Run (Versuch einer Teilprüfung) gilt als absolviert, wenn ein Passed-Wert vorhanden ist (yes/no, PASSED/FAILED, fulfilled). | Ein Datum allein ist ein Termin (geplant oder Ergebnis ausstehend); Score oder Result allein (Formelvorgaben 0) sind kein Versuch. |
| **Geplante Prüfung** | Run mit Prüfungsdatum in der Zukunft und ohne Passed-Wert; Ort aus «WE{n} RUN{r} Location» bzw. «OE{n} RUN{r} Location». Die Ansicht «Geplante Prüfungen» führt schriftliche (WE) und mündliche (OE) Termine getrennt: je Tag und Ort die Teilprüfungen mit Anzahl und die Wiederholungen (Versuch 2 oder 3), dazu die Teilnehmenden. | Ein vergangenes Datum ohne Passed-Wert ist ein Hinweis im Data-Quality-Log (Ergebnis ausstehend oder nicht erfasst) und zählt nicht als Versuch. |
| **Referenzdatum** | Datum des bestandenen mündlichen Runs (letzter Run mit passed = yes). Ohne bestandene mündliche Prüfung: letztes Datum eines absolvierten Runs. Der Zeitraumfilter wirkt darauf. | Vorgänge ohne datierten Run haben kein Referenzdatum und fallen bei aktivem Zeitraum aus dem Filter. |
| **Wertung «Resultat 1. Versuch» / «Resultat bestandener Run»** | 1. Versuch: das Result von RUN1 zählt, auch wenn nicht bestanden. Bestandener Run: das Result des bestandenen Runs zählt; ein Vorgang hat nur dann einen Wert, wenn alle absolvierten Teilprüfungen einen bestandenen Run haben. | Die Wertung wird nur in den Bestenlisten gewählt; alle anderen Ansichten zeigen beide Wertungen nebeneinander. |
| **Kleine Gruppe (n < 5)** | Kennzahlen auf Basis von weniger als 5 Vorgängen sind mit «*» markiert (Aussagekraft eingeschränkt). Dieselbe Schwelle gilt als Mindestgruppengrösse für Bestenlisten (E5). | Bestenlisten: unter 5 Vorgängen im Profil keine Liste; sonst höchstens die Hälfte der Gruppe (abgerundet, maximal 5), damit eine Bestenliste nie zur vollständigen Rangliste wird. |
| **Award-Dossier** | Vorschlagsliste je Profil für die Prämierung: alle gezeigten Award-Ränge mit Score, Teilwerten, Versuchen, Referenzdatum, Fundstelle (Sheet, Zeile) und Begründung, warum der Vorgang vor dem nächsten steht (Score höher, Tie-Break 1 Versuche, Tie-Break 2 Referenzdatum oder fachlich unentschiedener Gleichstand). | Ein vollständiger Gleichstand wird alphabetisch geordnet und im Dossier als «fachlich unentschieden» markiert; Profile ohne Liste (Gruppe zu klein) sind im Hinweis genannt. |
| **Export auf Vorgangsebene** | Zusätzlich zu den Aggregaten jeder Ansicht: eine Zeile je Vorgang im aktiven Filter (Blatt «Vorgänge»: Stammdaten, Status, Quoten-Bausteine, Versuche, Daten, Zertifikat, Schlüssel-Stufe, zusammengeführte Zeilen) und eine Zeile je absolviertem oder geplantem Run (Blatt «Runs»). | Enthält Namen; Nutzerkreis bbz-intern (E5). Der Filterzustand steht im Kopf jeder Datei. |
| **Benchmark (Übersicht)** | Vergleichsmenge mit denselben Filtern wie die Auswahl, nur ohne die gewählte Einschränkung: Alle Banken, Alle Profile, Alle Sprachen oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten (Auswahl minus Benchmark). | Ist kein entsprechender Filter aktiv, entspricht der Benchmark der Auswahl (Hinweis in der Ansicht). |
| **VSS / VSM (Kennzeichnung)** | Kennzeichnung aus dem Threaded Comment auf der Namenszelle (Spalte B): Muster «VSS …» bzw. «VSM …», beides möglich. «ohne» = weder noch. | Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen. |
| **Versuche (Filter)** | «nur 1. Versuch»: kein RUN2/RUN3 absolviert; «mehrere Versuche»: mindestens ein RUN2/RUN3 absolviert (schriftlich oder mündlich). | – |
| **Ausgestellte Zertifikate (Filter)** | Vorgänge aus dem Sheet «Ausgestellte Zertifikate» oder mit einer Zeile daraus zusammengeführt (Kennzeichen «ausgestellt»). | – |
| **Wirkungsklasse (Data-Quality-Log)** | Was sich ändert, wenn die Zelle korrigiert wird: «macht Zeile unsichtbar» (die Zeile fehlt deswegen in allen Kennzahlen: kein Name, kein absolvierter datierter schriftlicher Run), «verändert Kennzahl» (die Zeile ist sichtbar, aber ein Wert, eine Gruppe oder eine Zählung hängt an der Zelle), «ohne Kennzahlwirkung» (reine Interpretation wie Result als Prozentwert oder Excel-Serienzahl, oder nicht ausgewertetes Feld wie Score). | Das Log ist nach Wirkung, dann Stufe, dann Zeile sortiert (Arbeitsliste). Einträge auf zusammengeführten Duplikaten gelten als «verändert Kennzahl», weil ihre Daten im behaltenen Vorgang weiterleben. |
| **Nicht in den Kennzahlen** | Zeilen, die in keiner Kennzahl vorkommen, mit Grund: noch keine Prüfung absolviert (ggf. nur geplante Termine), nur mündliche Runs, schriftlicher Run ohne Datum, Duplikat (zusammengeführt) oder kein Name. Abschnitt in der Ansicht «Datenqualität», unabhängig vom Filter. | Zeilen ohne Namen ergeben keine Person und erscheinen nur als Fehler «Name fehlt». |
| **Offene Vorgänge (Ansicht)** | Alle Vorgänge mit Status offen – auch solche ohne absolvierte Prüfung – mit fehlendem Teil (schriftlich/mündlich), letzter Prüfung, Tagen seit der letzten Prüfung, nächstem geplanten Termin und Versuchen. Filter Profil, Sprache, Bank, VSS/VSM und Versuche gelten; der Zeitraum nicht. | Die Kachel «Zertifizierung offen» in der Übersicht zählt nur kennzahlrelevante offene Vorgänge im Filter (inkl. Zeitraum) und kann deshalb kleiner sein. |
| **Bestehensgrenze** | Ein Run gilt ab 70 % der erreichbaren Punkte als bestanden (Auftraggeber, bestätigt 10.09.2026). Als PASS_THRESHOLD in config.js geführt. | Die App leitet daraus keine Kennzahl ab: bestanden oder nicht bestanden kommt immer aus dem Passed-Feld. Die Grenze dient allein der Prüfung «Passed-Wert und Resultat widersprechen sich» – «yes» unter 70 % oder «no» ab 70 % ergibt einen Hinweis im Data-Quality-Log (Wirkung «verändert Kennzahl»), weil die Quoten den Passed-Wert lesen und die Ø-Resultate das Resultat. Beide Werte bleiben unverändert. |
| **Zeitverlauf (Ansicht)** | Kennzahlen je Jahr des Referenzdatums als Liniendiagramm und Tabelle (gesamt und je Profil), Vergleich zweier Jahre in Prozentpunkten sowie Schwierigkeit je Teilprüfung (Durchfallquote und Ø Resultat des ersten Versuchs je WE1–WE6, OE1–OE2 und Jahr des ersten Versuchs). | Der Zeitraumfilter wirkt nicht (alle Jahre sichtbar); die übrigen Filter gelten. Jahre mit n < 5 sind markiert (hohle Marker, *). Vorgänge ohne Referenzdatum tragen kein Jahr bei. Ein Diagramm hat immer eine Tabelle als Zwilling. |
| **Frühwarnung «zweiter Fehlversuch»** | Teilprüfungen (WE1–WE6, OE1–OE2) mit zwei nicht bestandenen Versuchen und ohne bestandenen Run. «Letzter Versuch» = genau ein Versuch bleibt (der nächste ist der letzte); «ausgeschöpft» = alle Versuche nicht bestanden. Liste mit Namen in der Ansicht «Offene Vorgänge», unabhängig vom Zeitraumfilter. | Maximal drei Versuche je Teilprüfung gemäss Spaltenaufbau der Datei (RUN1–RUN3). |
| **Durchlaufzeit** | Tage vom ersten Prüfungsdatum eines Vorgangs bis zur bestandenen mündlichen Prüfung (Referenzdatum); nur bestandene Vorgänge. Zusätzlich Tage bis zum Zertifikatsbeginn, wo «Certificate Start Date» vorhanden ist. Ausgewiesen als Median, Ø, Quartile, Min, Max je Profil und je Jahr. | Der Median ist gegen Ausreisser (sehr lange Unterbrüche) robuster als der Mittelwert. |
| **Passiv (> 365 Tage)** | Offener Vorgang, dessen letzte Prüfung mehr als 365 Tage vor dem Stichtag (Ladezeitpunkt) liegt und der keinen geplanten Termin hat. Eigene Kategorie neben «offen» (Entscheid Auftraggeber 05.09.2026), nie «nicht bestanden»; nicht im Nenner der Bestehensquoten. | Vorgänge ohne jede Prüfung sind nie passiv (kein Datum zum Messen). Schwelle PASSIVE_DAYS in metrics.js. |
| **Teilprüfungen je Profil** | Vorgabe laut Auftraggeber (05.09.2026, config.js PROFILE_PARTS): schriftlich PK 1, IK 1, AFFL 2, CWMA 3, KMU 3, CCoB 3 Teile, mündlich je OE1. Daraus: fehlende Teile je offenem Vorgang und der Hinweis «alle Teile bestanden, Gesamtergebnis leer». Die Ansicht «Offene Vorgänge» stellt der Vorgabe die Nutzung in den Daten gegenüber (Vorgänge mit absolviertem Run je Teil). | Annahme [hypothese]: die Teile stehen von links in WE1–WEn; absolvierte Runs ausserhalb der Vorgabe erscheinen als Abweichung und je Vorgang als Hinweis im Data-Quality-Log (ohne Kennzahlwirkung). Gilt laut Auftraggeber für alle Jahrgänge. |
| **Passerelle** | Verkürzter Weg in ein Nachfolgeprofil (PK→IK, AFFL→CWMA, KMU→CCoB) mit nur einem schriftlichen Teil. Das Cockpit kennzeichnet einen Vorgang als «Passerelle möglich», wenn dieselbe Person das Vorgängerprofil bestanden hat (Status bestanden oder Zertifikat). | Wie eine Passerelle in der Datei erfasst ist und welche Spalte der Teil belegt, ist [unklar]; deshalb keine reduzierte Teileliste, «Fehlende Teile» zeigt weiterhin die volle Vorgabe. |
| **Pfad einer Person** | Zeitliche Abfolge aller Vorgänge (Profile) einer Person nach erstem Prüfungsdatum, mit Status je Vorgang, Zertifikat und Passerelle-Kennzeichen. | Ansicht «Personen». Namen sichtbar (E7). Suchtext und gewählte Person stehen nie in der URL. |
| **Prüfungsraster** | Tabelle Teilprüfungen × Versuche (RUN1–RUN3) eines Vorgangs mit Datum, Resultat und Ergebnis je Run; Runs ausserhalb der Profilvorgabe sind markiert. | Grundlage: Vorgabe je Profil (config.js, PROFILE_PARTS). Ohne Vorgabe (unbekanntes Profil) erscheinen die genutzten Teile. |
| **Zeitachse (Person)** | Alle datierten Runs eines Vorgangs chronologisch, absolviert und geplant, plus Zertifikatsbeginn. | Entspricht dem Blatt «Runs» des Exports (gleiche Anzahl datierter Runs). |
| **Einsatz (Experte)** | Absolvierter mündlicher Run (Passed-Wert vorhanden) mit mindestens einem eingetragenen Experten; zählt für beide beteiligten Experten voll. Grundlage der Ansicht «Experten» (E8). | Der Zeitraum wirkt auf das Run-Datum, nicht auf das Referenzdatum des Vorgangs. Runs mit Ergebnis ohne Datum zählen als Einsatz («ohne Datum»), bei aktivem Zeitraum sind sie ausgeschlossen. Geplante Runs und Duplikate zählen nicht. |
| **Experte 1 / Experte 2** | Rolle gemäss den Spalten «OE{p} RUN{r} Expert 1» und «Expert 2» der Datei (am File verifiziert 06.09.2026, beide Sheets, optional). Nennt ein Run in beiden Rollen dieselbe Person, zählt sie einen Einsatz und erhält einen Hinweis im Data-Quality-Log. | Semantik der Rollen [unklar]: Experte 1 hat einen kleineren, regelmässigen Kreis (Hypothese Prüfungsleitung). Die Spalte «OE Expert» ist nicht gemappt (Bedeutung unklar). Experten sind ab 2018 erfasst (CONFIG.experts.from); früher fehlende Experten ergeben keinen Hinweis. |
| **Schreibpfad (Phase 2)** | Änderung einzelner Run-Zellen (Passed, Datum, Resultat, Ort, Experte 1/2) in bestehenden Spalten über die Graph-Workbook-API mit Validierung, Konfliktprüfung (Datei-Version, Zellwert) und Audit-Protokoll neben der Datei; danach lädt die App die Datei neu. | Nur mit Feature-Flag CONFIG.features.write (E10); die Struktur der Datei bleibt unverändert; Schreiben nur bei Daten von SharePoint, nicht bei lokaler Datei. Ohne Schreibrecht (HTTP 403), bei geänderter oder gesperrter Datei wird nichts geschrieben. |
| **Bank-Report** | Ansicht für die Weitergabe an ein Institut: Kennzahlen einer gewählten Bank im Vergleich zum Benchmark «alle Banken» (gleicher Zeitraum, gleiche übrigen Filter), je Profil und je Jahr. Ohne Namen, andere Banken nur als Aggregat. PDF über die Druckansicht des Browsers. | Voraussetzung: genau eine Bank in der Filterleiste gewählt. Kleine Gruppen (n < 5) sind markiert. |
| **Data-Quality-Stufen** | Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score). | Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). Entscheid E6 (05.09.2026): Score wird nicht ausgewertet, Result ist massgebend; das Parsing bleibt, damit verrutschte Zellen sichtbar sind. |
| **Streuung σ (Resultat)** | Stichproben-Standardabweichung (n−1, wie Excel STABW.S) der Resultat-Werte je Vorgang (Mittel über die Teilprüfungen gemäss Wertung, wie «Ø Resultat»), in Prozentpunkten. Zweitzeile der vier Ø-Kacheln der Übersicht und der Kachel «Ø Resultat (Experten)»; Spalten «σ (…)» in den Ø-Tabellen (Prio 3). | Paket G. n < 5 → «–». Immer zusammen mit Median und Quartilen, weil Resultate linksschief sind (viele bei 70–90 %, wenige Ausreisser nach unten). Nicht im Snapshot. Auf dem Phone nur die Kurzform «σ x pp». |
| **Median / Quartile (Resultat)** | Median, P25 und P75 derselben Resultat-Werte, lineare Interpolation wie bei der Durchlaufzeit; Spalten «Median (…)», «P25 (…)», «P75 (…)» in den Ø-Tabellen (Prio 3, ohne Datenbalken). | n < 5 → «–». Robuster als σ gegen Ausreisser nach unten. |
| **Effektstärke (d)** | (Ø Auswahl − Ø Benchmark) / σ(Benchmark); Skala nach dem Betrag von d: unter 0.2 gering, bis 0.5 mittel, bis 0.8 deutlich, ab 0.8 gross (Cohen). Vorzeichen wie die Differenz. | Nur wenn beide Gruppen n ≥ 5 und σ(Benchmark) > 0, sonst «–». Grössenordnung, kein Signifikanztest (bewusst keine p-Werte). |
| **Wilson-Intervall (95 %)** | Konfidenzintervall eines Anteils (z = 1.96), ausgewiesen als ±pp (halbe Breite) mit der Angabe «Benchmark im Intervall: ja/nein» (Benchmark-Anteil innerhalb der Grenzen). | Für Bestehensquoten statt einer Standardabweichung (die wäre nur eine Funktion des Anteils). n = 0 → «–»; bei n < 5 bleibt die Markierung «*». |
| **Anzahl (Auswahl / Benchmark)** | Spalten in «Auswahl im Vergleich zum Benchmark» (Übersicht, Jahresvergleich) und im Bank-Report: bei Quoten «Zähler von Nenner Einheit» («8 von 9 Vorgängen»), bei Ø-Kennzahlen nur der Nenner («n = 9»), bei Mengen leer – dort ist der Wert selbst die Anzahl. | Ersetzt die frühere Spalte «n», die die Grundmenge der Auswahl trug und bei Mengenzeilen etwas anderes meinte als daneben stand («Personen 8 · n 9» zählte Vorgänge). Die Einheit kommt aus der Kennzahl (Vorgänge, bei Experten Einsätze). |
| **Einordnung (Differenz)** | Spalte in «Auswahl im Vergleich zum Benchmark» (Übersicht, Jahresvergleich) und im Bank-Report: Ø-Kennzahlen mit Effektstärke («d +0.3 · mittel»), Quoten mit Wilson-Intervall («±4.1 pp · Benchmark im Intervall: ja»), Mengen ohne («–»). | Farbe wie die Differenz, die Bedeutung steht im Text. Verhindert, dass wenige Prozentpunkte Differenz als Rangfolge gelesen werden. |
| **Verteilung der Resultate (Histogramm)** | Anteil der Vorgänge je Resultatklasse à 10 Prozentpunkte (0–10 … 90–100, obere Grenze ausgeschlossen, 100 % in der letzten Klasse), Wertung 1. Versuch; Balkendiagramm Auswahl gegen den Benchmark der Übersicht mit Tabellen-Zwilling in den Ansichten Schriftlich und Mündlich. | Auswahl n < 5 → Hinweis statt Diagramm, die Tabelle bleibt; Benchmark n < 5 → keine zweite Reihe. Zeigt die Form der Verteilung (Ausreisser nach unten), die Ø und σ allein nicht verraten. |
| **Snapshot (Historisierung)** | JSON-Datei mit den Aggregaten zum Stichtag: Datei-Zähler, Kennzahlen gesamt, je Profil und je Jahr – ohne Namen und ohne Zeilen. Erzeugt in der Ansicht «Historie», abgelegt durch den Auftraggeber (z. B. SharePoint neben der Excel), später wieder geladen (nur Memory) für den Vergleich der Stichtage nebeneinander. | Immer ohne Filter (kennzahlrelevante Vorgänge, Stand der Datei). Differenz = heute gegenüber dem jüngsten geladenen Snapshot, Anteile in Prozentpunkten. Kein Backend, keine Persistenz im Browser (Regel 4); beim Import werden nur bekannte Felder übernommen (b7). |
| **Angetreten (Versuch r)** | Ein Vorgang gilt als zu Versuch r angetreten, wenn mindestens eine Teilprüfung für Run r ein erfasstes Ergebnis trägt (Passed-Wert). Ein Prüfungsdatum ohne Ergebnis ist ein Termin, kein Antritt. | Entscheid des Auftraggebers vom 12.09.2026. Termine ohne Ergebnis stehen als eigene Zahl neben der Quote, nie im Nenner – sonst zählte ein Vorgang als angetreten, ohne je als bestanden oder durchgefallen zählbar zu sein. |
| **Fokusbank und Vergleichsbanken** | Der Bank-Report stellt eine Fokusbank bis zu vier manuell gewählten Vergleichsbanken gegenüber. Alle Banken erscheinen mit Klarnamen; die Spaltengruppe heisst «Vergleichsbanken». | Eine gewählte Bank ohne Vorgänge im Filter erhält keine Spalte und wird gemeldet; über vier hinaus gewählte Banken ebenso. Keine Anonymisierung und kein Modusschalter (E9) – der Report trägt auf jeder Seite «bbz-intern – Vergleichswerte nicht zur Weitergabe». |
| **Benchmark «alle Banken» und «alle Banken ohne Fokusbank»** | Zwei Vergleichswerte nebeneinander: alle Vorgänge im Filter, und dieselbe Menge ohne die Vorgänge der Fokusbank. Das Delta der Fokusbank bezieht sich immer auf den zweiten. | Die beiden Werte fallen umso stärker auseinander, je grösser die Fokusbank ist. Die grösste Bank der Datei stellt rund 28 Prozent aller Vorgänge; ihr Delta gegen «alle» wäre um Prozentpunkte kleiner als gegen «ohne Fokusbank» und würde den Abstand beschönigen. |
| **Maskierte Zelle (n < k)** | Liegt der Nenner einer einzelnen Kennzahl unter der Schwelle k (Standard 5), zeigt die Zelle statt der Quote nur die Anzahl: «n = 3 (< 5)». Die Schwelle gilt je Zelle, nicht je Bank. | Betrifft vor allem Sprach- und Versuchszeilen: eine Bank kann über k liegen und trotzdem maskierte Zellen tragen. Ein Nenner von 0 ist nicht maskiert, sondern leer («–») – es gibt nichts zu verbergen. Mengen wie «Vorgänge» oder «Personen» tragen keinen Nenner und werden nie maskiert. Eine maskierte Zelle liefert kein Delta. |
| **Bankübergreifende Person** | Eine Person mit Vorgängen bei mehr als einer Bank. Die Bank hängt am Vorgang, nicht an der Person (E7): in der Bankspalte zählt sie bei jeder ihrer Banken, im Gesamtwert einmal. | Die Summe der Personenzahlen über alle Banken ist deshalb grösser als die Gesamtzahl der Personen. In der heutigen Datei betrifft das 10 von 3399 Personen; der Report weist die Zahl aus und erklärt sie in einer Fussnote. |
| **Druckansicht Bank-Report** | Eigener Druckbaum aus denselben Modellen wie der Bildschirm, A4 quer mit 12 mm Rand, Basisschrift 10 pt und Tabellen 9 pt. Fünf fest zugeschnittene Seiten: Leitkennzahlen und Durchfallquoten, Leistung und Kontext, Sprache und Teilprüfungen, Profile und «Nicht in den Kennzahlen», Methodik. | E13 nannte höchstens vier Seiten. Gemessen an der echten Datei mit vier Vergleichsbanken brauchte die Vergleichstabelle allein 211 mm und die Detailseite 209 mm bei 186 mm Satzspiegel; der Auftraggeber hat am 12.09.2026 entschieden, auf fünf Seiten zu gehen statt Kennzahlen zu streichen oder die Schrift zu verkleinern. Die Seiten sind fest zugeschnitten statt dem Fluss überlassen – nur so trägt jede Seite ihr Kopfband und bricht keine Tabelle kopflos um. |
| **Logo im Bank-Report** | Fester Slot im Kopfband, 24 mm × 12 mm, gespeist aus einer Datei, deren Pfad in CONFIG.report.logo steht (vorgesehen: assets/logo.svg). | Ohne Eintrag bleibt der Slot leer und behält seine Masse – das Layout springt nicht. Die Datei wird erst abgefragt, wenn der Pfad eingetragen ist; sonst erzeugte jeder Druck eine 404 auf eine Datei, die es im Repo nicht gibt (keine Binärassets im Repo, E15). |

### Kennzahlen

| Kennzahl | Definition | Nenner | Grenzfälle / Hinweise |
|---|---|---|---|
| **Experten** | Anzahl Experten mit mindestens einem Einsatz im aktiven Filter. | – | Schreibvarianten desselben Namens zählen getrennt, bis ein Alias in config.js (EXPERT_ALIASES) sie zusammenführt. |
| **Einsätze** | Anzahl Einsätze; je Experte die Einsätze mit Beteiligung als Experte 1 oder 2. | – | Ein Einsatz zählt für beide Experten voll; n < 5 markiert. |
| **Ø Einsätze je Experte** | Einsätze geteilt durch die Anzahl Experten; Median in Klammern. | Experten | – |
| **Anteil Experte 1** | Einsätze in Rolle 1 geteilt durch alle Rollen-Nennungen des Experten. | Rollen-Nennungen | Nennt ein Run dieselbe Person in beiden Rollen, zählen beide Nennungen. |
| **Durchfallquote 1. Versuch** | Anteil Einsätze mit nicht bestandenem Run im ersten Versuch (RUN1). | Einsätze im 1. Versuch | Beobachtungswert, keine Leistungsbeurteilung; Δ zum Benchmark derselben Versuchsart (E9), neutral dargestellt. |
| **Durchfallquote Wiederholung** | Anteil Einsätze mit nicht bestandenem Run bei Wiederholungen (RUN2, RUN3). | Einsätze in Wiederholungen | Kandidaten mit Wiederholung haben strukturell höhere Durchfallquoten, deshalb getrennter Benchmark (E9). |
| **Ø Resultat (Experten)** | Mittel der Resultate (erreichte Punkte in Prozent) der Einsätze mit Wert. | Einsätze mit Wert | Result massgebend, Score nicht ausgewertet (E6). Δ zum Benchmark in Prozentpunkten. |
| **Benchmark (Experten)** | Durchfallquote (gesamt, 1. Versuch, Wiederholung) und Ø Resultat über alle Einsätze im Filter. | Einsätze | Basis der Δ-Werte; keine Schichtung nach Profil (E9: Methodik profilübergreifend vergleichbar). |
| **Vorgänge** | Anzahl kennzahlrelevanter Zertifizierungsvorgänge im aktiven Filter. | – | Duplikate sind zusammengeführt und zählen einmal. |
| **Personen** | Anzahl Menschen hinter den Vorgängen im Filter (Personenschlüssel). | – | Kleiner oder gleich «Vorgänge»; die Differenz sind Personen mit mehreren Profilen. |
| **Zertifizierung offen** | Vorgänge im Filter ohne Gesamtergebnis – weder schriftlich noch mündlich abgeschlossen; die Zertifizierung läuft noch. Kachel im Block «Mengen» der Übersicht (früher «Vorgänge offen»). | Alle kennzahlrelevanten Vorgänge im Filter (n der Kachel). | Nicht im Nenner der Bestehensquoten (E4). Spätere Prozessstufe als «Schriftlich offen» und deshalb die kleinere Zahl. Eigene Ansicht «Offene Vorgänge» (die ohne Zeitraumfilter rechnet und weitere Vorgänge zeigt). |
| **Schriftlich offen** | Vorgänge im Filter ohne schriftliches Gesamtergebnis: die schriftliche Prüfung ist noch nicht abgeschlossen. Spalte in «Kennzahlen je Profil» (Übersicht), früher «Offen». | Vorgänge des Profils im Filter (Spalte «n (Vorgänge)»). | Die schriftliche Prüfung ist das Gate zur mündlichen: Wer hier offen ist, ist auch in «Zertifizierung offen» enthalten – umgekehrt nicht. Frühere Prozessstufe und deshalb die grössere Zahl. |
| **Vorgänge passiv (> 365 Tage)** | Offene Vorgänge im Filter, deren letzte Prüfung mehr als 365 Tage zurückliegt und die keinen geplanten Termin haben. | – | Teilmenge von «Zertifizierung offen»; nicht im Nenner. Bestehensquoten sind ohne diese Kategorie eine Obergrenze. |
| **Vorgänge nicht erfasst** | Vorgänge im Filter, deren Gesamtergebnis gefüllt, aber unlesbar ist (Fehler im Data-Quality-Log). | – | Nicht im Nenner der Bestehensquoten; zählt nicht als offen (E4). |
| **Schriftlich: im 1. Versuch bestanden** | Anteil Vorgänge, bei denen alle absolvierten WE RUN1 bestanden sind. | Vorgänge mit mindestens einem absolvierten WE RUN1. | Komplement zu «im 1. Versuch durchgefallen». |
| **Schriftlich: im 1. Versuch durchgefallen** | Anteil Vorgänge mit mindestens einem WE RUN1 = no. | Vorgänge mit mindestens einem absolvierten WE RUN1. | – |
| **Schriftlich: insgesamt bestanden** | Anteil Vorgänge mit Status schriftlich «bestanden» («WE All Passed» = yes), unabhängig von der Anzahl Versuche. | Abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden). | Offen und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «WE All yes» als bestanden (Hinweis). |
| **Schriftlich: Ø Resultat 1. Versuch** | Erreichte Punkte in Prozent: je Vorgang Mittel über die vorhandenen Teilprüfungen (Result von RUN1), dann Mittel über die Vorgänge mit Wert. | Vorgänge mit Wert. | Result-Zahlen > 1 ohne Prozentzeichen werden als Prozentwert gelesen (Hinweis im Log); 1 gilt als 100 %. |
| **Schriftlich: Ø Resultat bestandener Run** | Wie oben, aber Result des bestandenen Runs je Teilprüfung. | Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind. | – |
| **Je Teilprüfung (WE1–WE6, OE1–OE2)** | Im 1. Versuch bestanden / durchgefallen (RUN1), insgesamt bestanden (irgendein Run des Teils bestanden), Ø Resultat für beide Wertungen. | Vorgänge mit absolviertem RUN1 des Teils. | – |
| **Mündlich: bestanden** | Anteil Vorgänge mit Status mündlich «bestanden» («OE All Passed» = yes). | Abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden). | Offen (auch: noch nicht angetreten) und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «OE All yes» als bestanden (Hinweis). |
| **Mündlich: im 1. Versuch bestanden** | OE1 RUN1 = yes. | Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht). | Komplement zu «im 1. Versuch durchgefallen» (zusammen 100 %). Anderer Nenner als «bestanden»: dort sind es abgeschlossene Vorgänge. |
| **Mündlich: im 1. Versuch durchgefallen** | OE1 RUN1 = no, unabhängig vom späteren Erfolg. | Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht). | Zählt auch Vorgänge, die noch offen sind. |
| **Mündlich: 2× durchgefallen** | OE1 RUN1 = no und OE1 RUN2 = no. | Angetretene Vorgänge (wie oben). | – |
| **Mündlich: 3× durchgefallen** | OE1 RUN1 = no, RUN2 = no und RUN3 = no – alle Versuche, die die Datei kennt, nicht bestanden. | Angetretene Vorgänge (wie oben). | Teilmenge von «2× durchgefallen». Wer den dritten Versuch besteht, zählt nicht mit. Belegt das endgültige Scheitern über die Versuche, statt es aus «OE All Passed» = no zu erschliessen – die Spalte sagt nicht, nach wie vielen Versuchen. |
| **Mündlich: Ø Resultat 1. Versuch** | Erreichte Punkte in Prozent der mündlichen Prüfung, Result von RUN1, Mittel über die Vorgänge mit Wert. | Vorgänge mit Wert. | – |
| **Mündlich: Ø Resultat bestandener Run** | Wie oben, Result des bestandenen Runs. | Vorgänge mit bestandener mündlicher Prüfung und Wert. | – |
| **VSS / VSM** | Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM. | – | Beides möglich; dann in beiden Zahlen. |
| **Ausgestellte Zertifikate** | Anzahl Vorgänge im Filter mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt). | – | – |
| **Personen mit mehreren Profilen** | Anzahl Personen im Filter mit Vorgängen in mehr als einem Profil; Tabelle mit Profil-Abfolge (zeitlich nach erstem Prüfungsdatum) und Anzahl Personen je Abfolge. | – | Berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb eines aktiven Profil-Filters; zählt Menschen, nicht Vorgänge (E3). |
| **Geplante Prüfungstermine** | Anzahl geplanter Runs (Datum in der Zukunft ohne Passed-Wert) für die Filter Profil, Sprache, Bank, VSS/VSM. | – | Der Zeitraum wirkt nicht (geplant heisst immer «in der Zukunft»); der Versuchsmodus wirkt über die Vorgänge. |
| **bbz-Award** | 0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil (Top k, k = höchstens halbe Gruppe, maximal 5). | Vorgänge mit bestandener mündlicher Prüfung und beiden Werten. | Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Unter 5 Vorgängen im Profil keine Liste (Mindestgruppengrösse, E5). Begründung je Rang im Award-Dossier. |
| **Durchfallquote je Versuch (schriftlich)** | Anteil Vorgänge, die nach Versuch r nicht bestanden waren: mindestens eine absolvierte Teilprüfung trägt bis und mit Run r kein «bestanden». Gemessen auf Vorgangsebene, nicht je Teilprüfung. | Vorgänge, die zu Versuch r angetreten sind. | Die Versuche sind untereinander nicht vergleichbar: Versuch 2 misst nur Wiederholer, eine ausgelesene Gruppe, und liegt deshalb regelmässig höher als Versuch 1. Eine Teilprüfung, die erst später begonnen wurde, lässt den Vorgang im früheren Versuch scheitern – er war dort nicht vollständig. |
| **Durchfallquote je Versuch (mündlich)** | Wie schriftlich, gerechnet über die absolvierten mündlichen Teilprüfungen. | Vorgänge, die zu Versuch r angetreten sind. | Rechnet über alle absolvierten OE-Teile, nicht nur über OE1; in der Datei trägt heute nahezu jeder Vorgang nur OE1. Unterscheidet sich damit von «Mündlich: im 1. Versuch durchgefallen», das ausdrücklich OE1 RUN1 misst. |
| **Antritte je Versuch** | Anzahl Vorgänge mit erfasstem Ergebnis in Run r; steht als Nenner neben jeder Durchfallquote je Versuch. | – | Nimmt von Versuch zu Versuch stark ab. Liegt die Zahl unter der Schwelle von 5, wird statt der Quote nur die Anzahl ausgewiesen (E5). |
| **Termine ohne erfasstes Ergebnis** | Anzahl Vorgänge mit Prüfungsdatum für Versuch r, aber ohne Passed-Wert. | – | Zählt nie als Antritt. Trennt «nicht angetreten» von «Ergebnis fehlt»; ohne diese Zahl bliebe die Lücke unsichtbar. Der Grund je Zeile steht im Data-Quality-Log. |
| **Ø Versuche bis Bestanden** | Schriftlich: je Vorgang das Mittel der benötigten Run-Nummern über die absolvierten Teilprüfungen, dann das Mittel über die Vorgänge. Mündlich ergibt dieselbe Rechnung die Run-Nummer des bestandenen Runs. | Bestandene Vorgänge (Status nach E4), deren absolvierte Teilprüfungen alle einen bestandenen Run tragen. | Offene und nicht bestandene Vorgänge fliessen nicht ein; ihre Anzahl steht als Fussnote bei der Kennzahl. Als bestanden erfasste Vorgänge ohne bestandenen Run sind eine Datenlücke und werden getrennt gezählt, nie als offen. |
| **Sprachvergleich (Verteilung und Erstversuch)** | Je Sprache die Anzahl Vorgänge mit Anteil an allen Vorgängen und die Durchfallquote im ersten Versuch, schriftlich und mündlich. | Verteilung: alle Vorgänge im Filter. Quoten: die zu Versuch 1 angetretenen Vorgänge der Sprache. | Die Zeilen folgen den Daten, nicht einer festen Liste – neben DE, FR und IT trägt die Datei heute auch EN. Vorgänge ohne Sprachangabe bilden eine eigene Zeile. Je Bank fallen kleine Sprachgruppen regelmässig unter die Schwelle von 5. |
<!-- glossar:end -->

## Fachliche Festlegungen (mit dem Auftraggeber abgestimmt)

- Voraussetzung für die mündliche Prüfung ist die bestandene schriftliche Prüfung. Widersprüche erscheinen als Hinweis.
- Ein Zertifikat setzt schriftlich und mündlich bestanden voraus (auch für die Passerellen-Jahrgänge 2015–2018).
- Es müssen alle vorhandenen Teilprüfungen bestanden werden (Wertung «bestandener Run»).
- Ohne Namen (Spalten «Last Name» und «First Name» leer) keine Person; solche Zeilen mit Daten werden als Fehler gemeldet.
  Zeilen, die nur in nicht gemappten Hilfsspalten Inhalt haben, gelten als leer.
- Fehlt die «Certificate Language», wird die Sprache aus der Programmbezeichnung (z. B. «PK FRZ» → FR) oder aus
  «Communication Language» übernommen (Hinweis im Log).
- Schreibvarianten werden zugelassen, wenn die Zuordnung eindeutig ist (Gross-/Kleinschreibung, Leerzeichen,
  Aliase wie Affluent/Affl/AFF → AFFL, CCOB → CCoB, Bank-Kürzel wie BKB, GKB, LUKB, TKB, UKB, D/F/I/E als Sprache).

## Signale (Paket SIGNALE)

Sechs Regeln über den vorhandenen Kennzahlen, als reine Funktionen in `metrics.js` (`signals(persons, { dq })`).
Sie definieren **keine neue Kennzahl**, sondern lesen `writtenPassRates`, `timeSeries`, `statusCounts` und
`earlyWarnings`. Ein Signal ist ein Datensatz – keine Farbe, kein Markup, kein Rückruf; die Ansicht übersetzt ihn.

| Regel | Stufe | feuert | Gewicht |
|---|---|---|---|
| Jahrestrend der schriftlichen Erstversuchsquote | kritisch | Abfall vom ersten zum letzten Jahr ≥ 8 pp, bei ≥ 4 Jahren mit je n ≥ 20 | Abfall in pp × auswertbare Vorgänge / 100 |
| Profil unter dem Gesamtwert | kritisch | 95-%-Wilson-Intervall des Profils enthält den Gesamtwert nicht, Differenz negativ | \|Differenz in pp\| × n / 100 |
| Fehler im Data-Quality-Log | beachten | mehr als 0 Fehler | 0.6 |
| Passive offene Vorgänge | beachten | passiv / offen > 10 % | 0.9 |
| Vor dem letzten Versuch | beachten | mehr als 0 Vorgänge mit zwei mündlichen Fehlversuchen | 0.8 |
| Profil über dem Gesamtwert | günstig | wie oben, Differenz positiv | −1 (steht immer zuletzt) |

**Sortiert wird nach Gewicht, nicht nach Stufe.** Das Gewicht hat überall dieselbe Einheit – betroffene Vorgänge –,
damit die Reihenfolge die Wirkung zeigt: Ein Abstand von 9 pp bei n = 302 wiegt schwerer als 10.6 pp bei n = 80.
**Jedes Signal nennt seine eigene Schwelle** («Schwelle: über 10 %»); ein Signal, das nicht sagt, warum es da ist, ist
eine Behauptung, und die Liste bleibt so prüfbar, ohne in den Code zu sehen. **Jedes Signal trägt eine Zahl und einen
Weg**, und die Wege sind Daten: `{ kind: 'view', view: 'zeitverlauf' }` oder
`{ kind: 'filter', patch: { profil: ['KMU'] } }`. Gerechnet wird auf der **gefilterten** Menge – ein Signal über KMU,
während KMU herausgefiltert ist, wäre falsch. Unter der Mindestgruppengrösse (n < 5) feuert nichts; je Profil gilt
dieselbe Grenze. Auch wenn nichts feuert, nennt `signals()` in `geprueft`, was geprüft wurde.

### Die Liste in der Übersicht

Der Signalblock ist der **erste Inhalt** der Übersicht, über «Mengen»: Er beantwortet «worauf schaue ich heute», und das
gehört nicht unter zwölf Kacheln. Je Signal stehen Rang, Stufenwort, Titel, eine Detailzeile mit Zahl und Schwelle und
der Weg. **Die Farbe trägt nie allein** – Rang und Wort stehen immer daneben; die Stufen nutzen die bestehenden Tokens
`--danger`, `--warn` und `--ok`. Der Kopf nennt, wie viele Signale offen sind, dass nach Wirkung sortiert wird und auf
welcher Auswahl gerechnet wurde («5 offen · nach Wirkung sortiert · gerechnet auf 1204 Vorgängen · Profil: KMU»).

**Höhenbudget, gemessen bei 1400 × 900 mit sechs Signalen:** Alle sechs Detailzeilen offen ergaben 339 px und die erste
Mengen-Kachel bei y = 699 – zu knapp. Offen bleiben deshalb die **drei schwersten** (273 px, erste Kachel y = 633); die
übrigen Detailzeilen bleiben im DOM und sind über «Alle Details zeigen» erreichbar. Weggelassen wird nichts: Zahl und
Schwelle jedes Signals sind höchstens einen Klick weit.

**Leerzustand:** Feuert keine Regel, ist der Block nicht leer und verschwindet auch nicht – er nennt, was geprüft wurde
und ruhig blieb. Ein verschwindender Block ist von einem kaputten nicht zu unterscheiden.

## Normalisierung und Data-Quality-Log

Spalten werden ausschliesslich über die Header-Namen in Zeile 10 gemappt (Varianten «… Passed» | «… yes»).
Fehlt ein Pflicht-Header, wird die Datei nicht verarbeitet und die fehlenden Header werden angezeigt.

| Feld | Regel |
|---|---|
| Passed | yes / passed / fulfilled → ja; no / failed → nein; Gross-/Kleinschreibung egal; leer → unbekannt; sonst Fehler |
| Sprache | DE, FR, IT, EN (Kürzel D/F/I/E); sonst Fehler |
| Profil | PK, IK, CWMA, KMU, AFFL, CCoB und Aliase; sonst Rohwert + Fehler |
| Employer | Alias-Map (config.js) → kanonischer Bankname; unbekannt → Rohwert |
| Result | Zahl 0–1 direkt (1 = 100 %); Zahl > 1 bis 100 ohne Prozentzeichen → /100 mit Hinweis (Umdeutung); Text «89.00%», «89,5%» direkt, «71.59» → /100 mit Hinweis; sonst Fehler |
| Score | ganze Zahl ≥ 0; sonst Stufe «nicht ausgewertet» (Feld fliesst in keine Kennzahl; Entscheid E6: Result ist massgebend, Parsing bleibt zur Sichtbarkeit verrutschter Zellen) |
| Geburtsdatum | wie Datum, plausible Jahrgänge 1920–2010 (Serienzahlen entsprechend); nur für den Personenschlüssel |
| Datum | Excel-Datum oder Text `dd.mm.yy(yy)[ / hh.mm]` (Trenner . oder , Suffix h / Uhr); Excel-Serienzahl ohne Format → Datum + Hinweis; Jahr ausserhalb 2000–2100, ohne Jahr, dreistelliges Jahr → Fehler |
| Passed × Result | Widersprechen sich beide Werte, ist das ein **Hinweis** mit Wirkung «verändert Kennzahl»: «yes» unter der Bestehensgrenze oder «no» auf/über der Grenze. Die Bestehensgrenze liegt bei **70 %** (Auftraggeber, bestätigt 10.09.2026) und steht als `PASS_THRESHOLD` in `config.js`. Beide Werte bleiben stehen – die App deutet nichts um; die Quoten lesen weiter den Passed-Wert, die Ø-Resultate das Resultat. |

Stufen im Log: **Fehler** = Zelle nicht interpretierbar, Wert wird ignoriert. **Hinweis** = Wert interpretiert oder
abgeleitet, aber auffällig (z. B. vergangener Termin ohne Ergebnis, Passed ohne Datum, abgeleitete Sprache, Result als
Prozentwert umgedeutet, Duplikat zusammengeführt), oder Konsistenzregel verletzt. **Nicht ausgewertet** = Zelle nicht
interpretierbar, aber das Feld fliesst in keine Kennzahl (Score).

Wirkungsklasse je Eintrag: **macht Zeile unsichtbar** (Zeile fehlt deswegen in allen Kennzahlen), **verändert Kennzahl**,
**ohne Kennzahlwirkung** (reine Interpretation, nicht ausgewertetes Feld). Das Log ist nach Wirkung, Stufe und Zeile
sortiert; die Zusammenfassung nach Wirkung, Header und Grund lässt sich ohne Personendaten kopieren.

**Experten (mündliche Prüfung):** Die Spalten «OE{p} RUN{r} Expert 1» und «Expert 2» (beide Sheets, optional) werden je Run gelesen:
Text → Name (Mehrfach-Leerzeichen bereinigt, Alias aus `EXPERT_ALIASES`) und Schlüssel wie der Personenschlüssel. Zahl oder Datum ergibt
den Fehler «Experte nicht lesbar» (verändert Kennzahl). Hinweise ohne Kennzahlwirkung: «Experte fehlt» (absolvierter Run mit Datum ab
`CONFIG.experts.from` = 2018-01-01 ohne Experten), «Experte ohne Run» (Feld gefüllt, aber weder Datum noch Ergebnis), «Experte 1 = Experte 2»
(beide Felder dieselbe Person). Duplikate füllen Experten auf, nie überschreiben. Ohne Expertenspalten in der Datei bleibt die Ansicht
«Experten» leer mit Hinweis auf die erwarteten Header.

## Mutation (Phase 2): Schreibpfad mit Feature-Flag

Erste Ausbaustufe (Paket E, E10): eine einzelne Run-Zelle eines Vorgangs – Passed, Prüfungsdatum, Resultat, Ort, bei mündlichen Runs auch
Experte 1/2 – wird in der bestehenden Spalte der Excel geändert. Nicht editierbar: Name, Geburtsdatum, Profil, Sprache, Employer,
Gesamtergebnisse, Zertifikatsfelder; keine neuen Zeilen, keine Sheet-Änderungen. Die Struktur der Datei bleibt unverändert.

- **Flag:** `CONFIG.features.write`, am 06.09.2026 vom Auftraggeber nach dem Test auf der Testkopie produktiv freigeschaltet (`true`).
  Mit `false` zeigt die App keine Bearbeiten-Elemente und schreibt nichts (`DEPLOY.md`, Abschnitt «Phase 2»).
- **Ablauf:** Mit Flag erscheint im Kopf der Schalter «Bearbeiten» (Standard aus, nur im Memory, nach Neuladen der Seite wieder aus; auf
  dem Phone im Konto-Menü). Im Bearbeitungsmodus sind die Zellen des Prüfungsrasters in der Ansicht «Personen» anklickbar (✎ beim
  Überfahren, Enter per Tastatur); ohne Modus bleibt alles reine Anzeige. Der Dialog prüft die Eingabe mit denselben
  Parsern wie beim Laden, zeigt «alt → neu» und verlangt einen Grund. Der Adapter (`datasource/workbookAdapter.js`) löst die Datei wie der
  Lesepfad auf, vergleicht die Datei-Version (eTag) mit dem Stand beim Laden, sucht den Header in Zeile 10 (nie Spaltenbuchstaben raten),
  liest Zielzelle und Nachbarzellen und schreibt in derselben Schreibweise (Datum als Serienzahl oder Text, yes/no wie im Sheet, Resultat als
  Bruch oder Prozent) über eine Workbook-Session. Danach lädt die App die Datei neu; es gibt kein optimistisches Update im Memory.
- **Konflikte:** geänderte Datei, abweichender Zellwert, gesperrte Datei (in Excel geöffnet) oder fehlender Header brechen ab, ohne zu
  schreiben. Ohne Schreibrecht meldet Graph 403 → verständliche Meldung.
- **Audit:** je Änderung ein Eintrag in `General/07_KUBA/Reporting_KUBA.changes.json` neben der Datei (Zeitpunkt, Konto, Sheet, Zeile,
  Header, alt, neu, Grund; kein Kandidatenname), angehängt mit `If-Match`.
- **Rechte:** Lesepfad `Files.Read.All`; der Schreibpfad fordert `Files.ReadWrite.All` erst beim ersten Schreiben an (inkrementelle
  Zustimmung). Schreiben ist nur bei Daten von SharePoint möglich, nicht bei einer lokal geladenen Datei.
- **Bereinigung:** Jeder Eintrag im Data-Quality-Log mit Zeile trägt «Zur Person»: Sprung in die Ansicht «Personen» zur Karte des
  Vorgangs, die betroffene Raster-Zelle ist markiert; im Bearbeitungsmodus lässt sie sich direkt korrigieren. Suchtext und Person liegen
  nur im Memory, eine Person ausserhalb des aktiven Filters wird beim Sprung trotzdem gezeigt.
- **Historie:** Die App liest das Änderungsprotokoll beim Laden von SharePoint mit (nur im Memory) und zeigt es in der Ansicht
  «Historie» als eigenen Abschnitt «Änderungen über die App» (Zeitpunkt, Name aus den geladenen Daten, Fundstelle, alt → neu, Grund, Konto;
  exportierbar, nur intern) sowie je Vorgangskarte in «Personen». Bei lokal geladener Datei bleibt der Abschnitt leer.
- Spike-Bericht: `docs/SPIKE-mutation.md` (die Testseite `spike/mutation.html` wurde mit Paket F entfernt; Ablauf durch Adapter und Tests abgedeckt).

## Architektur

Vanilla JS (ES-Module), kein Framework, kein Build-Schritt, GitHub Pages. Bibliotheken lokal unter `lib/`:
MSAL.js 3.30.0 (MIT), SheetJS 0.20.3 (Apache-2.0), fflate 0.8.3 (MIT).

**Schriften (Paket OPTIK, O1):** **Public Sans** für Text und Tabellen, **Archivo** für Zahlen, Kennzahlen und
Titel – beide lokal unter `lib/` als woff2, kein CDN, SIL OFL 1.1 mit Lizenztext daneben (`lib/*-OFL.txt`). Beide
sind **Variable Fonts**: eine Datei je Familie deckt die ganze Gewichtsachse, deshalb zwei Dateien statt vier für
die zwei Schnitte, die die App benutzt (400 und 600). Zusammen **61.7 KB** (Public Sans 26.8, Archivo 34.9),
Latin-Subset. Grundgrösse bleibt `14px/1.45` – der Unterschied kommt aus den Schriftmetriken, nicht aus einer
zweiten Änderung. `font-display: swap` und hinter jeder Familie eine echte Fallback-Kette: Fällt die Schrift aus,
bleibt die App lesbar statt unsichtbar. Archivo sitzt auf genau den Flächen, die schon `tabular-nums` tragen –
gemessen führen **beide** Familien Tabellenziffern (mit `tabular-nums` sind «1111» und «9999» gleich breit, ohne
unterscheiden sie sich um 3 bzw. 12 px), Zahlenkolonnen fallen also nicht auseinander. Zwei Zeichen der App liegen
ausserhalb des Latin-Subsets und rendern im Fallback: **σ** in der Streuungszeile und **ⓘ** am Abschnittstitel.
Die Marke `?v=…` an den `@font-face`-URLs setzt `tools/version.js`: Die Import-Map in `index.html` erreicht
Stylesheet-URLs nicht.

**Themenschalter ohne Gedächtnis (Paket OPTIK, O3a):** Drei Zustände – **System · Hell · Dunkel**, Standard
System – als Radiogruppe im Kopf (nicht im Konto-Menü: das erscheint erst mit Konto, und ohne Anmeldung lädt man
sehr wohl eine lokale Excel-Datei). Drei und nicht zwei, weil es ohne «System» innerhalb einer Sitzung keinen Weg
zurück zur Systemeinstellung gäbe. Er merkt sich **nichts**: kein localStorage, kein sessionStorage, kein Cookie,
keine URL – nach dem Neuladen steht er wieder auf System. Native Radios mit `legend`: Tastaturbedienung, Rolle und
der sichtbare Zustand kommen vom Browser, der aktive Zustand ist nicht nur durch Farbe erkennbar. Gemessen: der
Schalter ist 184 px breit, das statische Chrome bleibt bei **130 px** (Ziel 170).

Die dunkle Palette steht dafür **einmal** in der Media-Abfrage; `tools/theme.js --write` erzeugt daraus den Block
`:root[data-theme="dark"]` für die manuelle Wahl, und `tools/contrast.js` vergleicht beide Blöcke Deklaration für
Deklaration. Von Hand verdoppelt wären es 30 Werte zweimal – genau dort entsteht Drift, und O3 schreibt die dunkle
Palette gleich neu. Die Media-Abfrage trägt den Wächter `:root:not([data-theme="light"])`: Wer bei dunklem System
ausdrücklich «Hell» wählt, muss Hell bekommen.

**Der Druck war der heikle Teil, und zwar eine Stufe tiefer als erwartet.** Der Block der manuellen Wahl hat
Spezifität (0,2,0) – aber der Wächter hebt auch die **Media-Abfrage** auf (0,2,0). Ein blosses `:root` im
Druck-Block (0,1,0) verliert damit gegen beide: gemessen druckte eine dunkle Systemeinstellung **alle 29 Tokens
dunkel auf weisses Papier**, `--ok` mit 1.96:1. Der Druck-Block trägt deshalb zwei Selektoren, die zusammen jeden
Zustand treffen und beide (0,2,0) haben: `:root[data-theme], :root:not([data-theme])`. Gleiche Spezifität und
später in der Datei heisst: der Druck gewinnt. Geprüft im Smoke-Test in **allen drei Zuständen**.

**Dunkel und Druck abgeleitet (Paket OPTIK, O3).** Beide werden nach derselben Regel gebaut wie bisher, und die
Ableitung aus der neuen hellen Palette ergibt **gemessen keine neuen Werte**:

*Dunkel.* Gemessen am Farbstich (höchster Kanal) ist die helle Palette weiter durchgehend blaustichig –
`--th-bg` B+6, `--border` B+12, `--text` B+8, `--muted` B+18, `--field-border` B+25 –, und genau so ist der
Dark-Block gebaut (B+5 bis B+22, dieselbe Richtung und ähnliche Beträge). **Nur `--bg` hat den Stich gewechselt**,
von blau auf **G+2**: zwei von 255, und auf dem dunklen Grund (Helligkeit 20 von 255) ist ein Stich von +2 ein
einziger Schritt. Eine Umfärbung des Dark-Blocks wäre also Bewegung ohne Wirkung. Die dunklen Abstände sind
ausserdem besser gepolstert als die hellen: knappstes dunkles Paar `--field-border` auf `--panel-2` mit **3.90:1**
gegen **3.14:1** hell. **28 der 29 Tokens**, die der Dark-Block umsetzt, sind durch Paare gedeckt; das eine
ungedeckte ist `--shadow` – eine Schattenfarbe, kein Kontrastpaar.

*Druck – der heikle Fall, weil der Bank-Report gedruckt und weitergegeben wird.* Der Grund bleibt **weiss**, nicht
warmgrau, und das ist gemessen entschieden: `body` trägt im Druck `print-color-adjust: economy` (der Standard), der
Browser **verwirft die Grundfläche also ohnehin** – ein warmer Wert im Druck-Block wäre ein Versprechen, das das
Papier nicht hält. Auf einem Drucker, der Hintergründe ausdrücklich mitnimmt, wäre 93 % helles Grau über eine ganze
A4-Seite ein Feld Toner ohne Information. Die Flächentrennung auf Papier kommt nicht vom Ton: gemessen sind die
Blöcke in beiden Medien **transparent**, getrennt wird durch Rahmen und Tabellenlinien. Nur die Flächen der
Messzeile tragen `print-color-adjust: exact` (Paket H3) und drucken deshalb wirklich. `darkLeftovers()` meldet
**kein** vergessenes Token; die drei bewussten Papier-Abweichungen (`--bg`, `--panel-2`, `--bar`) stehen mit Grund
im Smoke-Test.

**Helle Palette (Paket OPTIK, O2):** Es wurden nur **Werte** getauscht, kein Token-Name geändert, keiner entfernt.
`tools/contrast.js` hängt an den Namen und prüft die neue Palette dadurch vollständig mit. Vier Werte ändern sich
wirklich – der Rest der Prototyp-Palette war schon der der App (`--accent #0b5fa5`, `--ok`, `--series-2`,
`--series-3`):

| Token | vorher | nachher |
|---|---|---|
| `--bg` | `#f5f6f8` (blaugrau) | **`#eef0ee`** (warmgrau) |
| `--panel-2` | `#fafbfc` | **`#f7f8f7`** |
| `--text` | `#1f2933` | **`#12161a`** |
| `--muted` | `#5f6b7a` | **`#59626b`** |
| `--ok` | `#1a7f37` | **`#187033`** (dunkler, siehe unten) |

**Drei Werte des Prototyps werden nicht übernommen.** `line #b9c0c6` als Feldrahmen erreicht auf dem Grund nur
1.61:1 statt der verlangten 3:1 – das ist Befund B-22, den `--field-border #7d8896` behoben hat; der Prototyp ist
hier hinter der App. `faint #97a1ac` wird nicht gebraucht. Und die Reihenfarben bleiben, weil sie nie auf dem Grund
liegen: **gemessen über alle 14 Ansichten sitzt keine einzige Fundstelle von `--ok`, `--series-2` oder
`--series-3` direkt auf `--bg`** – jede liegt auf `--panel` (Diagramme tragen `background: var(--panel)`) oder auf
`--panel-2` (Badge). `--series-2` auf dem Grund wäre schon mit der alten Palette 2.96:1 gewesen; das Paar existiert
einfach nicht.

Dabei fand sich eine **Lücke in der Prüfliste**: `--ok` trägt Text im Status-Badge, und das Badge sitzt auf
`--panel-2` – geprüft wurde es nur auf `--panel`, also auf der Fläche, auf der es nicht steht. Das Paar ist ergänzt
(**150/150** statt 147/147), und `--ok` ist auf `#187033` nachgedunkelt: nicht weil das Paar heute durchfiele
(5.79:1 auf `--panel-2`), sondern weil O4 die Komposition ändert und eine Farbe, die nur wegen ihrer heutigen Lage
besteht, eine Falle für später ist. Das knappste helle Paar ist jetzt `--field-border` auf `--bg` mit **3.14:1**
(vorher 3.33:1, Minimum 3): Auf dem wärmeren, dunkleren Grund hat das Grau weniger Luft. Diagramme sind Inline-SVG ohne Bibliothek
(`views/chart.js`), Farben nach validierter Palette. Dark Mode folgt der Systemeinstellung (`prefers-color-scheme`);
der Druck bleibt hell. Zahlenspalten sind rechtsbündig mit Tabellenziffern. Die Gestaltung läuft über CSS-Tokens in
`styles.css` (Abstände, Schriftgrade, Status-, Delta- und Datenbalken-Farben); `node tools/contrast.js` prüft den Kontrast
aller Token-Paare in Light, Dark und Druck (Text ≥ 4.5:1, Bedienelemente und Linien ≥ 3:1) und läuft in der CI.

### Fassungsmarke gegen alte Dateien aus dem Cache

GitHub Pages liefert jede Datei mit `Cache-Control: max-age=600` aus, und die Modulverweise trugen keine Version.
Nach einem Deploy holte der Browser bis zu zehn Minuten alte Dateien aus dem Cache – und zwar **gemischt**: manche
Module neu, manche alt. Das sah aus wie ein Fehler in der App (eine gemergte Änderung stand da, der Schirm zeigte
den Stand davor) und kann bei unpassenden Modulen auch echte Abstürze machen.

**Ohne Build-Schritt gelöst:** `tools/version.js --write` bildet einen **Fingerabdruck** über den Inhalt aller
ausgelieferten Dateien (Module, Bibliotheken, `styles.css`) und schreibt ihn an zwei Stellen – nach `version.js`
und als `?v=…` in einen **erzeugten Bereich** in `index.html`. Dort steht eine **Import-Map**: Sie bildet auch
*aufgelöste* URLs ab, erreicht damit jedes der 35 Module und die drei Bibliotheken, und **kein einziger
`import`-Aufruf muss angefasst werden**. Erzeugt und mitversioniert wie das README-Glossar; die CI prüft, dass
nichts veraltet ist. Gemessen: 40 geladene js/css-Dateien, **keine ohne Marke**.

**Was die Marke nicht kann:** `index.html` selbst kommt weiterhin mit `max-age=600`. Bis zu zehn Minuten nach einem
Deploy kann ein Browser die alte Datei benutzen – dann läuft die App aber **einheitlich** auf dem alten Stand statt
gemischt. Genau dieser Rest ist der Grund für die zweite Hälfte: Nach dem Start holt die App `version.js` einmal
**ohne Cache** und vergleicht. Weicht die veröffentlichte Fassung ab, steht oben auf der Seite «Diese Seite zeigt
eine alte Fassung» mit beiden Fassungen und einem Knopf «Neu laden». Lieber ein Hinweis als alte Zahlen, die wie
aktuelle aussehen. Die laufende Fassung steht im Datenstand und in der Fusszeile.

**Überschrift und Wertung (Paket I):** Ein Abschnitt, der ein Diagramm mit Durchfallquoten und eine Tabelle mit
Bestehensquoten trägt, heisst «Bestehen und Durchfallen» – eine Überschrift, die nur eine Seite nennt, widerspricht
dem, was darunter steht. Die Direktbeschriftung nennt bei einem **gesicherten** Abstand zusätzlich die Wertung als
Wort: «n = 302 · +27.9 pp · gesichert ungünstig». Die Richtung kommt aus dem Modell (`richtung`: tiefer ist besser
bei Durchfallquoten, höher bei Bestehensquoten, `neutral` bei den Experten, wo nicht gewertet wird). Ohne sie läse
sich «+27.9 pp · gesichert» wie eine gute Nachricht. Farbe kommt dazu, trägt die Wertung aber nie allein.

**Punktdiagramm je Gruppierung (Pakete MESSZEILE und H):** Über jeder Bestehensquoten-Tabelle steht ein
Punktdiagramm: je Gruppe ein Punkt auf der **Durchfallquote im 1. Versuch** – dieselbe Wahl wie in der Übersicht,
weil bei 96 % bestanden die Aussage in der Gegenzahl steckt –, dazu sein 95-%-Wilson-Intervall als Balken und eine
senkrechte Linie auf dem Gesamtwert. Es steht in der Übersicht («Kennzahlen je Profil»), in «Schriftlich» viermal
(Profil, Sprache, Bank und je Teilprüfung – letzteres ohne Bezugslinie, weil ein Gesamtwert über alle Teilprüfungen
einen anderen Nenner hätte als die einzelnen Zeilen; verglichen werden die Teilprüfungen untereinander), in «Mündlich» dreimal (Profil, Sprache, Bank), in «Experten» je Experte und in «VSS/VSM» je Kennzeichnung.
Bei VSS/VSM überschneiden sich die Gruppen: Ein Vorgang mit VSS **und** VSM zählt in beiden, die drei Punkte teilen
den Gesamtwert also nicht auf – der Hinweis über der Ansicht sagt es.

**VSS/VSM zeigt beide Prüfungsteile (Paket I, P5).** Ansicht und Tabelle oben versprechen «schriftlich und
mündlich»; gezeigt wurde nur die schriftliche Seite. Es sind jetzt **zwei Diagramme**, eines je Prüfungsteil, jedes
mit allen drei Gruppen (VSS, VSM, ohne). Zwei Diagramme und nicht zwei Reihen in einem: Die Nenner sind
verschieden – schriftlich die Vorgänge mit auswertbarem ersten Versuch, mündlich die **angetretenen** Vorgänge
(OE1 RUN1 absolviert und datiert). Jede Seite braucht deshalb ihre eigene Bezugslinie, und zwei Linien in einem
Plot lüden dazu ein, einen Punkt gegen die falsche zu lesen (dieselbe Regel wie beim Teilprüfungs-Diagramm). Der
Satz je Zeile benennt den Nenner mit: «2 von 3 **angetretenen** Vorgängen» gegenüber «2 von 8 Vorgängen». Beide
Diagramme tragen dieselbe Reihenfarbe und dieselbe Legende wie alle anderen Punktdiagramme.

**Welche Kennzeichnung zu welchem Prüfungsteil gehört, sagt die Datei nicht** – VSS und VSM sind Kennzeichnungen
aus den Threaded Comments, mehr nicht. Hier wird deshalb auch nichts zugeordnet oder hergeleitet: Beide
Prüfungsteile stehen für alle drei Gruppen.

**Die Tabelle nennt jeden Nenner (Paket I, P6).** Ihr fehlte die mündliche Erstversuchsquote; sie steht jetzt als
**«Mündlich im 1. Versuch bestanden»** da – in der Bestehensrichtung der schriftlichen Seite, nicht als
Durchfallquote, damit in einer Tabelle nicht zwei Richtungen nebeneinander stehen. Die Kennzahl ist
`oralPassRates().passed1`, die Gegenzahl zu `failed1` auf derselben Grundmenge (zusammen 100 %).

Vier Quoten haben vier verschiedene Nenner, und **«n (Vorgänge)» ist keiner davon** – es ist die Grösse der Gruppe.
Vorher stand diese eine Spalte neben drei Quoten und sah aus wie deren Nenner. Jede Quote trägt jetzt ihren
eigenen daneben:

| Quote | Nenner |
|---|---|
| Schriftlich im 1. Versuch bestanden | Vorgänge mit absolviertem WE RUN1 |
| Schriftlich insgesamt bestanden | abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden) |
| Mündlich im 1. Versuch bestanden | **angetretene** Vorgänge (absolvierter, datierter OE1 RUN1) |
| Mündlich bestanden | abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden) |

Elf Spalten, deshalb `wide`: Die beiden «abgeschlossen»-Nenner erscheinen erst ab 1900 px. Auf dem Phone bleiben
die fünf Prio-1-Spalten – Gruppe, Profil, n (Vorgänge) und die beiden Erstversuchsquoten nebeneinander; die
Tabelle scrollt dort 65 px im eigenen Rahmen, ohne Seitenscroll («Mündlich» liegt mit 56–84 px im selben Bereich).
Der **Export nimmt alle elf Spalten** mit, auch die auf dem Schirm ausgeblendeten – er folgt den Spalten des
Tabellenmodells, nicht der Anzeige.

**Die Achse folgt den Daten (Paket I, P2)** und benutzt dazu dieselbe Regel wie die Spur der Messzeile
(`messzeilenSkala()`): Beginn bei **0 %**, Ende auf der nächsten **5-%-Stufe echt über dem grössten Wert**,
mindestens 10 pp Spanne, höchstens 100 %. «Grösster Wert» heisst dabei: der grösste Wert überhaupt –
**Intervallenden und Bezugslinie eingerechnet**. Sonst reichte ein Balken über die Achse hinaus und würde am Rand
abgeschnitten, was sich läse, als endete er genau dort. Vorher lief die Achse fest bis 100 %, während die Daten bei
60 % endeten; die Punkte drängten sich in der linken Hälfte. Am Boden (10 pp Mindestspanne) und am Deckel (100 %)
kann die Regel nicht weiter – nur dort darf ein Wert auf dem Rand liegen. Alle Punktdiagramme teilen denselben
Nullpunkt; einen abweichenden Achsenbeginn gibt es hier nicht.

**Die Ränder wachsen mit ihrem Text (Paket I, P3).** Fest waren sie 150 Einheiten rechts und 104 links. Gemessen
ragte die Direktbeschriftung «n = 132 · +26.0 pp · gesichert ungünstig» (212 px breit) **72 px** über die viewBox
und wurde abgeschnitten – seit P1 trägt sie zusätzlich die Wertung und ist damit länger geworden. Links reichte ein
Gruppenname wie «Firmenkunden KMU Deutschschweiz» **98 px** über den Rand hinaus. Beide Ränder kommen jetzt aus
`endLabelGutter()`, derselben Funktion wie beim Liniendiagramm; das Punktdiagramm zeichnet keinen Linienschlüssel in
Reihenfarbe und zahlt über `{ key: false }` auch nicht mehr dafür.

Die Breite wird **gemessen, nicht geschätzt**: Ein Canvas-Kontext mit derselben Schrift wie das SVG (eine Quelle:
`--viz-font` in `styles.css`) liefert exakt dieselbe Breite wie `getBBox()`, ohne dass das Element im Dokument
hängen muss. Der alte Schätzwert von 7 px je Zeichen stammt aus Paket B, wo die Endbeschriftung sechs Zeichen lang
war; bei vierzig Zeichen summiert sich der Zuschlag auf 68 px, also 12 % der Zeichenfläche. Ohne DOM (Node-Tests)
bleibt der Schätzwert als bewusst grosszügiger Rückfall. **Dem Plot bleibt mindestens die halbe Breite** – ein
längerer Gruppenname wird gekürzt und mit «…» markiert; vollständig steht er in der Tabelle darunter. Auf dem
Phone entfällt die Direktbeschriftung ganz (die Zahlen stehen in der Tabelle), rechts bleibt nur der Rand für die
letzte Achsenbeschriftung – die vorher zur Hälfte über den Rand ragte.

**Eine Zeile, ein Satz (Paket I, P4).** Vorher hing ein einziger `<title>` am SVG: Wer eine Zeile ansteuerte, bekam
den Titel des Diagramms – für alle sechs Gruppen denselben Text. Jede Zeile trägt jetzt ihren eigenen:

> IK · 44.7 % · 59 von 132 Vorgängen · 95-%-Intervall 36.5 bis 53.2 % · +26.0 pp gegenüber Gesamt 18.7 % · gesichert ungünstig

Gruppe, Quote, **Zähler mit Nenner** («n = 132» allein nennt nur den Nenner – das ist hier überall ein Mangel),
Wilson-Intervall von–bis, Abstand in pp zur Bezugslinie und ob er gesichert ist. Was nicht dasteht, fehlt auch im
Satz: ohne Bezugslinie kein Abstand und kein «gesichert», bei neutraler Richtung «gesichert» ohne Wertung (E9),
bei n < 5 der Zusatz «Gruppe mit n < 5». Der Satz steht im Modell, ist also ohne DOM prüfbar.

**Die Trefferfläche ist die ganze Zeile.** Ein durchsichtiges Rechteck über die volle Breite liegt hinter Punkt,
Balken, Gruppenname und Direktbeschriftung – gemessen **33 715 px² statt 140 px²** am Punkt allein, also Faktor
241. Es ist `fill: transparent`, nicht `fill: none`: «none» nimmt keine Zeigerereignisse entgegen.

**Die Rollenstruktur ist gemessen entschieden, nicht gewählt.** Drei Varianten im Accessibility-Baum verglichen:

| | Ergebnis |
|---|---|
| `role="img"` + `<title>` je Zeile | Mit `img` gelten alle Nachfahren als Bildinhalt – verlässlich bleibt **ein Satz für sechs Gruppen**. |
| `role="img"` + `<desc>` je Zeile | Dasselbe, und der Satz landet zusätzlich in `description`: **zweimal vorgelesen**. |
| `role="list"` direkt auf dem SVG | Die vier Achsenbeschriftungen hingen als **leere Fremdkinder** in der Liste; sie meldete sechs statt zwei Einträge. |
| **SVG = Container, Liste als eigene Gruppe** | `group › list › listitem` – sauber, ohne Fremdkinder, ohne Doppelung. **Gewählt.** |

Achse, Gitter und Bezugslinie stehen deshalb in einer Gruppe mit `aria-hidden` – ihre Zahlen stehen ohnehin in
jedem Zeilensatz. Der `<title>` auf der Wurzel ist weg: Er wurde nach dem `aria-label` ein zweites Mal vorgelesen;
den Namen des Diagramms trägt sichtbar die figcaption, für Hilfsmittel das `aria-label` – jeder genau einmal.
Die Zeilen bekommen **kein** eigenes `tabindex`: Vier Diagramme à sechs Zeilen wären 24 zusätzliche Tabstopps je
Ansicht; Screenreader navigieren Listen mit ihren eigenen Tasten, und die Zahlen stehen in der Tabelle darunter.

**In «Experten» gilt eine Besonderheit:** Dort werden Menschen verglichen, deshalb steht das Diagramm in der
Reihenfolge der Tabelle (Einsätze absteigend) und **nicht nach Quote sortiert** – nach Quote sortiert wäre das Bild
eine Rangliste von Personen, und genau das ist die Ansicht laut ihrer eigenen Fussnote nicht (E9). Die Balken werden
dadurch nach unten breiter: Wer wenige Einsätze hat, streut mehr. Berührt ein Balken die Linie, ist der Abstand zum
Benchmark nicht gesichert – das ist die Ablesung, nicht die Reihenfolge. **Berührt der Balken die Linie nicht, ist der Abstand gesichert** – das
ist die ganze Ablesung, ohne p-Wert; sie steht zusätzlich als Wort in der Direktbeschriftung («n = 302 · −8.9 pp ·
gesichert»). Die Tabelle bleibt als Tabellen-Zwilling darunter und im Export; sie trägt Spalten, die das Diagramm nicht zeigt
(insgesamt bestanden, offen, passiv, nicht erfasst), und ist deshalb nicht eingeklappt. Gemessen kostet ein Diagramm
etwa so viel Höhe wie die Tabelle darunter, eine Zeile je Gruppe: «Schriftlich» wächst von 2939 auf 3573 px,
«Mündlich» von 2378 auf 2622 px.

**Gegenzahlen in den Tabellen:** «Im 1. Versuch bestanden» und «Im 1. Versuch durchgefallen» stehen dort weiterhin
nebeneinander, obwohl sie zusammen 100 % ergeben. Auf der Übersicht ist dieses Paar entfernt worden, weil dort jede
Zahl eine eigene Zeile mit Skala, Verlauf und zwei Differenzen kostete – fünf Felder für dieselbe Aussage. In der
Tabelle sind es zwei Spalten derselben Zeile mit demselben Nenner daneben, und die Tabelle ist zugleich der Export:
Wer sie weiterverarbeitet, soll die gesuchte Zahl lesen können, statt sie auszurechnen. Die Fussnote sagt, dass es
Gegenzahlen sind, damit niemand sie für zwei Kennzahlen hält. Kleine Gruppen (n < 5)
tragen einen hohlen Marker und «*», sie werden nicht weggelassen.

**Das laufende Jahr (Paket H):** Ein angefangenes Jahr ist nicht mit einem abgeschlossenen vergleichbar – ihm fehlen
Wiederholungen und Nachträge. Es wird deshalb überall gekennzeichnet, mit **einem** Zeichen: **Raute und
gestrichelte Linie** im Liniendiagramm und in der Sparkline der Messzeile, Spalte **«Stand» = «läuft»** in den
Jahrestabellen, und im Zwei-Jahres-Vergleich eine Warnung in der Fussnote, wenn ein laufendes Jahr gewählt ist.
Der **hohle Marker** bleibt für «n < 5» reserviert: Form sagt, ob das Jahr fertig ist, Füllung sagt, ob die Gruppe
gross genug ist – beides zusammen ist lesbar (hohle Raute). Vorgewählt sind im Vergleich die zwei jüngsten
**abgeschlossenen** Jahre; das laufende bleibt wählbar. Gibt es weniger als zwei abgeschlossene Jahre, entfällt der
Vergleich. Verschwiegen wird das laufende Jahr nirgends – ein fehlender Punkt wäre die andere Lüge.

**Y-Achse der Liniendiagramme (Paket DIAGRAMME):** Die Achse folgt dem Wertebereich der Daten, nicht dem Nullpunkt: Beginn auf
der nächsten 5-%-Stufe unter dem kleinsten Wert, mindestens 10 Prozentpunkte Spanne. Von null zu rechnen drängte
Quoten, die real zwischen 66 % und 100 % liegen, ins obere Drittel und verdeckte jede Bewegung – etwa den Rückgang der
schriftlichen Erstversuchsquote. Beginnt die Achse nicht bei null, steht das sichtbar über dem Diagramm («Achse
beginnt bei 65 % – der Wertebereich der Daten. Kein Nullpunkt.»), nicht in der eingeklappten Legende. Der unterste
Tick trägt die Achsenlinie und nennt den Beginn; darüber liegen runde Vielfache, höchstens sechs Abschnitte.
**Balkendiagramme rechnen weiter von null** – bei Balken trägt die Länge die Aussage, eine gekappte Achse verzerrt die
Verhältnisse.

**Datenbalken in Prozentspalten (Paket DIAGRAMME):** Der Balken füllt **von rechts** – dieselbe Richtung wie die rechtsbündige
Zahl – und liegt auf einer **festen Spur** (`--bar-track`, 3.5 rem): 100 % sind überall gleich breit, in jeder Spalte
und in jeder Tabelle. Vorher lief er über die ganze Zellbreite; da benachbarte Prozentspalten verschieden breit sind
(gemessen: «Auswahl» 93 px gegen «Benchmark» 221 px in derselben Tabelle, «Ø Resultat 1. Versuch» 286 px gegen
«Ø Resultat bestandener Run» 367 px), hatte derselbe Prozentwert dort verschiedene Länge – der Balken versprach einen
Vergleich, den er nicht einlöste. Die Spur ist schmaler als die schmalste Prozentspalte, damit kein Balken
abgeschnitten wird.

**Sortierung (Paket DIAGRAMME):** Jede Tabelle ist sortierbar, mit einer Implementierung: Die Kopfzelle trägt einen Button mit
`aria-label` «Sortieren nach …», das `th` ein `aria-sort`, und der erste Klick sortiert Text aufsteigend, Zahlen
absteigend; ein weiterer Klick kehrt um. **Die fachliche Ausgangssortierung bleibt der Standard** – Teilprüfungen,
Profile und Jahre haben eine Reihenfolge, die Bedeutung trägt, und die darf eine alphabetische Sortierung nicht
verdrängen; «Sortierung zurücksetzen» stellt sie wieder her. Der Zustand steht in der URL
(`sort=<tabellen-slug>.<spalte>.<asc|desc>`), sonst zeigt ein geteilter Link etwas anderes als der Absender sieht: ein
Zustand je Ansicht, die Tabelle über den Slug ihres Titels benannt. Tabellen ohne Titel sortieren nur im Speicher.
Das Data-Quality-Log behält seine eigene Vergleichsfunktion – «Wirkung» und «Stufe» haben eine fachliche Reihenfolge,
die eine alphabetische Sortierung zerstören würde –, aber dieselbe Bedienung; seine **Filter** (darunter der Suchtext,
der ein Name sein kann) bleiben im Memory und stehen nie in der URL.

**Leere Tabellen (Paket DIAGRAMME):** Bei null Zeilen wird gar keine Tabelle gerendert – nur die Meldung, mit dem Titel davor,
solange er sich vom Abschnittstitel unterscheidet. Vorher stand die Meldung hinter der vollständig gerenderten
Kopfzeile: auf «Bestenlisten» mit einem Institut-Filter zwölf von sechzehn Tabellen leer, zusammen über 2000 px
Spaltenüberschriften ohne einen einzigen Wert. Auf «Bestenlisten» stehen die Gruppen unter der Mindestgrösse
zusätzlich zusammen in einer Zeile («Keine Bestenliste für IK, CWMA, KMU, AFFL – Gruppen unter n = 5 im aktiven
Filter.») statt in je einer eigenen leeren Tabelle. Der Export enthält weiterhin alle Tabellenmodelle.

**Direktbeschriftung am Linienende (Paket DIAGRAMME):** Sie trägt nur den Wert («75 %»). Den Reihennamen dort zu wiederholen
kostete 250 von 820 Einheiten Rand – 30 % der Zeichenfläche – für eine Angabe, die die Legende zwei Zeilen darunter
ohnehin macht. Der Rand richtet sich jetzt nach der Länge der Werte (`endLabelGutter`); die Zeichenfläche wächst damit
von 522 auf rund 700 Einheiten. **Die Legende bleibt**: Sie ist der verlässliche Identitätskanal, gerade für
Farbfehlsichtige; die Direktbeschriftung ergänzt sie, ersetzt sie nicht.

**Druck bei dunkler Systemeinstellung:** Der Druck-Block überschreibt den Dark-Block, er ersetzt ihn nicht. Die reale
Kaskade ist `hell → dunkel → Druck`, und jedes Token, das `@media (prefers-color-scheme: dark)` setzt, muss `@media print`
zurücksetzen – sonst druckt ein Gerät mit dunkler Einstellung dunkle Farben auf weisses Papier. Das Werkzeug bildet diese
Kaskade ab und meldet über `darkLeftovers()` zusätzlich jedes Token, das der Druck-Block vergisst; der Smoke-Test prüft
dieselbe Lage im Browser (`media: 'print'` bei `colorScheme: 'dark'`).

**Feldrahmen:** Eingabefelder haben dieselbe Füllfarbe wie ihre Umgebung und sind allein durch ihren Rahmen erkennbar;
der braucht 3:1 (WCAG 2.1 SC 1.4.11). Dafür gibt es `--field-border` – `--border` trägt daneben reine Deko-Rahmen
(Tabellen, Karten) und bleibt dezent, statt global angehoben zu werden.

```
index.html / app.js / styles.css   Shell, Filterleiste, Navigation, View-Kopf, Legende, Fehleranzeige
filterChips.js                     Aktive Filter als Chips (rein)
urlState.js                        Filter- und Anzeigezustand in der URL (rein)
glossary.js / snapshot.js          Begriffe und Kennzahl-Definitionen; Snapshots der Aggregate (rein)
tools/                             contrast.js, glossar-readme.js, modellbericht.js, snapshot-synth.js (Node)
auth.js                            MSAL (Popup, Redirect-Fallback, Silent-Token)
graph.js                           Graph-HTTP mit Retry (429/503), Token-Erneuerung bei 401
datasource/index.js                load() / loadFromFile() / write() (Schreibpfad, Phase 2)
datasource/fileAdapter.js          Site → Drive → Item, Download, SheetJS-Parse (nur zwei Sheets)
datasource/threadedComments.js     VSS/VSM aus xl/threadedComments/*.xml
datasource/workbookApi.js          Reine Helfer des Schreibpfads (Range, Session-Ablauf, Schreibweise, Konflikt, Audit)
datasource/workbookAdapter.js      Schreibpfad über die Graph-Workbook-API (Phase 2, nur mit Flag)
store.js                           Normalisierung → Personenmodell, Data-Quality-Log, Memory-State
metrics.js                         Reine Kennzahlfunktionen
views/tables.js                    Tabellenmodelle je View (rein), views/*.js Rendering
views/personen.js                  Ansicht «Personen»: Suche, Pfad, Karten je Vorgang, Export «Diese Person» (Paket C)
views/experten.js                  Ansicht «Experten»: sortierbare Haupttabelle, Zeilen-Detail, Paarungen, Export «Einsatzebene» (Paket D)
views/editDialog.js                Dialog «Zelle bearbeiten» des Schreibpfads (nur mit Feature-Flag, Paket E)
export.js                          CSV, XLSX, Druck
config.js                          IDs, Pfade, Sheet-Namen, Header-Mapping, Whitelists, Aliase
```

Datenschutz: Personendaten bleiben im Browser-Speicher (kein localStorage/IndexedDB); MSAL nutzt sessionStorage nur
für Tokens. Namen erscheinen nur in den Ansichten Personen, Offene Vorgänge, Geplante Prüfungen und Bestenlisten, im
Data-Quality-Log und in Exporten «nur intern» (E5, E7); Expertennamen erscheinen in der Ansicht «Experten» und im Export «Einsatzebene» (E8).
Suchtext, gewählte Person und Sortierung stehen nie in der URL. Das Änderungsprotokoll des Schreibpfads enthält das Konto der
bearbeitenden Person und die Fundstelle, keinen Kandidatennamen.
Das Repository enthält keine Personendaten; `*.xlsx` und `local/` sind ausgeschlossen.

Phase 2 (Schreibpfad, Paket E) ist seit dem 06.09.2026 **produktiv freigeschaltet** (Entscheid E13): `CONFIG.features.write = true`
(`config.js`, Abschalten über `false`) und die dokumentierte Signatur `write({ sheet, row, header, value, expected, reason })` in
`datasource/index.js`; ohne Flag rendert die App keine Bearbeiten-Elemente.
