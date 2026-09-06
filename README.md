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
- Snapshot der synthetischen Testdatei als Regressionsschutz bei Umbauten ohne fachliche Änderung: `node tools/snapshot-synth.js basis.json`, später `node tools/snapshot-synth.js --vergleich basis.json` (identisch = keine Zahl hat sich geändert)
- Betrieb und Einrichtung: [DEPLOY.md](DEPLOY.md)

## Ansichten

Die Navigation ist in vier Gruppen gegliedert: **Kennzahlen** (Übersicht, Schriftlich, Mündlich, VSS/VSM, Zeitverlauf,
Bank-Report), **Personen** (Offene Vorgänge, Geplante Prüfungen, Bestenlisten), **Experten** (ab Paket D) und **Daten**
(Historie, Datenqualität, Glossar). Jede Ansicht beginnt mit Titel und einem Satz Kurzbeschreibung; rechts stehen das
Menü «Export» und der Link «Definitionen», der die passende Zeile im Glossar fokussiert. Erklärungen und Fussnoten der
Tabellen stehen gesammelt in der Legende «Hinweise und Definitionen» am Ende jeder Ansicht (im Druck geöffnet) und als ⓘ
am jeweiligen Titel. Der Datenstand (Datei, Änderungs- und Ladezeit, Zeilen, Data-Quality-Fehler) steht als Einzeiler über
der Navigation und lässt sich zu allen Zählern aufklappen.

| Ansicht | Inhalt |
|---|---|
| Übersicht | KPIs für den aktiven Filter (Vorgänge, Personen, offene Vorgänge, Quoten), Kennzahlen je Profil, Personen mit mehreren Profilen |
| Schriftlich | Bestehensquoten (Erstversuch, gesamt) nach Profil, Sprache, Bank; Ø Performance nach Profil, Sprache, Bank und Teilprüfung WE1–WE6 |
| Mündlich | Bestehensquote gesamt und je Profil, Anteil 1× / 2× durchgefallen; Ø Performance nach Profil, Sprache, Bank |
| VSS/VSM | Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil |
| Zeitverlauf | Kennzahlen je Jahr (Liniendiagramm und Tabelle, gesamt und je Profil), zwei Jahre vergleichen (Prozentpunkte), Schwierigkeit je Teilprüfung und Jahr, Durchlaufzeit je Profil und Jahr |
| Historie | Snapshots der Aggregate (ohne Namen) als JSON erzeugen, ablegen (z. B. SharePoint) und später wieder laden: Kennzahlen gesamt, Datei-Zähler und je Profil je Stichtag nebeneinander, Differenz zum letzten Snapshot; ohne Filter, nur im Memory (b7) |
| Bestenlisten | Je Profil: bbz-Award, beste schriftliche, beste mündliche Prüfung (mit Namen); Mindestgruppengrösse 5, Liste höchstens halbe Gruppe (maximal 5); Award-Dossier mit Begründung je Rang |
| Bank-Report | Kennzahlen einer gewählten Bank gegen den anonymen Benchmark «alle Banken», je Profil und je Jahr; ohne Namen; Druck/PDF |
| Personen | Eine Person suchen (Name, Bank, Profil, Sprache, Zertifikat-Nr., Status; ab 2 Zeichen, mehrere Begriffe = UND) und ihren Weg nachvollziehen: Pfad über alle Vorgänge, je Vorgang Stammdaten, Status, Prüfungsraster (Teilprüfungen × RUN1–RUN3), Zeitachse, Datenqualität und Export «Diese Person»; mit Namen (E7). Ohne Suchtext leer, ausser eine Bank ist gefiltert (dann alle Personen der Bank); Geburtsjahr nur bei Namensgleichen |
| Offene Vorgänge | Laufende Zertifizierungsprozesse (Gesamtergebnis leer) je Profil und mit Teilnehmenden: fehlende Teile, letzte Prüfung, nächster Termin, Versuche (mit Namen); Teilprüfungen je Profil; Frühwarnung «zweiter Fehlversuch»; passiv seit über 365 Tagen |
| Geplante Prüfungen | Termine in der Zukunft ohne Ergebnis, zuerst schriftlich (WE), dann mündlich (OE): je Art die Prüfungsereignisse je Tag und Ort (Teilprüfungen mit Anzahl, Wiederholungen; Zeile anklicken → zugeteilte Personen) und die vollständige Teilnehmendenliste zum Aufklappen (mit Namen, Bank, Profil, Sprache) |
| Experten | Je Experte/Expertin der mündlichen Prüfung: Einsätze, Rollen (als Experte 1/2, Anteil Experte 1), Durchfallquote im 1. Versuch und bei Wiederholungen, Ø Resultat, jeweils mit Δ zum Benchmark aller Experten im Filter (E9, neutral dargestellt); Zeilen-Detail je Jahr, Profil, Sprache und Partner; Paarungen Experte 1 × Experte 2; Export «Einsatzebene» mit Kandidaten- und Expertennamen «nur intern». Beobachtungswerte, keine Leistungsbeurteilung; mit Expertennamen (E8). Ohne Expertenspalten in der Datei erscheint ein Hinweis |
| Datenqualität | «Nicht in den Kennzahlen» mit Grund je Zeile; jede nicht interpretierbare oder auffällige Zelle mit Wirkung auf die Kennzahlen, Stufe, Sheet, Zeile, Header, Rohwert, Grund; nach Wirkung priorisiert, sortier- und filterbar |
| Glossar | Begriffe und Kennzahl-Definitionen (Definition, Nenner, Grenzfälle), auch ohne geladene Daten |

Jede Kennzahl-Ansicht bietet im Menü «Export» CSV (alle Tabellen in einer Datei) und XLSX (ein Blatt je Tabelle) sowie
eine Druckansicht. Zusätzlich exportiert jede Kennzahl-Ansicht die Vorgangsebene (eine Zeile je Vorgang, eine Zeile je
Run, mit Namen, nur intern). Der Filterzustand steht im Kopf jedes Exports.

**Darstellung:** Die Kacheln der Übersicht stehen in den Blöcken Mengen, Schriftlich und Mündlich; die Definition steckt
im ⓘ, das Label verlinkt auf das Glossar. Bei aktivem Benchmark zeigt jede Quoten-Kachel die Differenz mit Symbol,
Vorzeichen und Farbe nach Richtung der Kennzahl (▲ +2.1 pp; höher ist besser bei Bestehensquoten und Ø Resultat, tiefer
ist besser bei Durchfallquoten und passiven Vorgängen; unter 0.5 pp neutral ●). In Tabellen tragen Prozentspalten einen
Datenbalken, Differenzspalten Symbol und Farbe, Statusspalten eine Badge; die erste Spalte bleibt beim horizontalen
Scrollen stehen. Farbe trägt nie allein Bedeutung. Jede Spalte hat eine Priorität (1 = immer, 2 = ab Tablet, 3 = ab
Desktop) für die mobile Darstellung.

**Mobile:** Phone bis 600 px, Tablet 601–900 px, darüber Desktop; der Druck behält immer das Desktop-Layout. Auf dem
Phone gilt: Grundschrift 16 px, Touch-Ziele mindestens 44 px, nie horizontaler Seitenscroll (nur Tabellen scrollen in
ihrem Rahmen). Die Navigation ist ein Auswahlfeld mit den vier Gruppen, die Filter liegen in einem Drawer «Filter
(n aktiv)» mit Chips darunter, der Datenstand ist ein Einzeiler, das Konto ein Initialen-Button mit «Abmelden». Tabellen
zeigen nur Spalten der Priorität 1 (Tablet: 1 und 2); «Alle Spalten» blendet die übrigen ein und scrollt die Tabelle
horizontal. Die Kacheln der Übersicht stehen in aufklappbaren Blöcken (Schriftlich und Mündlich offen, Mengen zu) mit
nur Label, Wert, n und Delta-Symbol; Diagramme sind kompakt (360 × 200, Tooltip darunter). Vollständig für das Phone
gestaltet sind Übersicht, Offene Vorgänge, Geplante Prüfungen, Personen und Experten (Nebenabschnitte eingeklappt); die übrigen Ansichten
funktionieren ohne Überlauf. Die Anmeldung auf dem Phone läuft direkt über den Redirect-Flow von MSAL (kein Popup); der
manuelle Gerätetest liegt beim Auftraggeber. Der Smoke-Test prüft die Viewports 1400 × 1000, 820 × 1180 und 390 × 844.

## Globale Filter

Zeitraum (Von–Bis, Jahr als Auswahlfeld mit «Alle» und den Jahren; wirkt auf das Referenzdatum), Profil, Sprache, Bank,
VSS/VSM, Versuche (alle | nur 1. Versuch | mehrere Versuche), «nur ausgestellte Zertifikate» (Sheet 2 oder damit
zusammengeführt). Die Filterleiste haftet beim Scrollen oben. Unter den Steuerelementen stehen «n Vorgänge · n Personen»
und je aktive Einschränkung ein Chip (z. B. «2026 ✕», «Profil PK ✕»); ✕ entfernt genau diesen Filter. «Filter
zurücksetzen» erscheint nur, wenn ein Filter vom Standard abweicht.

**Filterzustand in der URL:** Ansicht, Filter, Wertung und Benchmark stehen im Hash der Adresse
(`#schriftlich?von=2025-01-01&bis=2025-12-31&profil=PK&bank=…&wertung=bestanden&benchmark=profil`) und lassen sich als
Link teilen; nach dem Öffnen müssen die Daten neu geladen werden. Die URL enthält nie Personendaten. Die Filterleiste wird
bei Filteränderungen nur aktualisiert, nicht neu aufgebaut; der Tastaturfokus bleibt auf dem bedienten Element.
Die Wertung (Resultat 1. Versuch | Resultat bestandener Run) wird nur in der Ansicht «Bestenlisten» gewählt; alle anderen
Ansichten zeigen beide Wertungen nebeneinander. In der Ansicht «Geplante Prüfungen» wirkt der Zeitraum nicht.

**Benchmark (Übersicht):** Die Kacheln und eine Vergleichstabelle stellen die Auswahl einem Benchmark gegenüber, der
dieselben Filter verwendet, nur ohne die gewählte Einschränkung: Alle Banken (Standard), Alle Profile, Alle Sprachen
oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten.

In der Ansicht «Personen» wirken Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» auf die Trefferliste; Zeitraum,
Versuche und Wertung wirken nicht. Das Detail zeigt immer alle Vorgänge der Person. Suchtext und gewählte Person stehen nie in der
URL (nur im Memory) und werden beim Neuladen der Daten geleert.

In der Ansicht «Experten» wirken Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» über die Vorgänge; der Zeitraum wirkt auf
das Run-Datum des Einsatzes, nicht auf das Referenzdatum des Vorgangs («2025» zeigt die Einsätze des Jahres 2025). Versuche und Wertung
wirken nicht. Die Sortierung der Haupttabelle liegt nur im Memory.

## Modell: Vorgänge, Personen, Duplikate, Status (Entscheid-Log E1–E12)

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
| **Offene Vorgänge (Ansicht)** | Alle Vorgänge mit Status offen – auch solche ohne absolvierte Prüfung – mit fehlendem Teil (schriftlich/mündlich), letzter Prüfung, Tagen seit der letzten Prüfung, nächstem geplanten Termin und Versuchen. Filter Profil, Sprache, Bank, VSS/VSM gelten; Zeitraum und Versuchsmodus nicht. | Die Kachel «Vorgänge offen» in der Übersicht zählt nur kennzahlrelevante offene Vorgänge im Filter (inkl. Zeitraum) und kann deshalb kleiner sein. |
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
| **Bank-Report** | Ansicht für die Weitergabe an ein Institut: Kennzahlen einer gewählten Bank im Vergleich zum Benchmark «alle Banken» (gleicher Zeitraum, gleiche übrigen Filter), je Profil und je Jahr. Ohne Namen, andere Banken nur als Aggregat. PDF über die Druckansicht des Browsers. | Voraussetzung: genau eine Bank in der Filterleiste gewählt. Kleine Gruppen (n < 5) sind markiert. |
| **Data-Quality-Stufen** | Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score). | Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). Entscheid E6 (05.09.2026): Score wird nicht ausgewertet, Result ist massgebend; das Parsing bleibt, damit verrutschte Zellen sichtbar sind. |
| **Snapshot (Historisierung)** | JSON-Datei mit den Aggregaten zum Stichtag: Datei-Zähler, Kennzahlen gesamt, je Profil und je Jahr – ohne Namen und ohne Zeilen. Erzeugt in der Ansicht «Historie», abgelegt durch den Auftraggeber (z. B. SharePoint neben der Excel), später wieder geladen (nur Memory) für den Vergleich der Stichtage nebeneinander. | Immer ohne Filter (kennzahlrelevante Vorgänge, Stand der Datei). Differenz = heute gegenüber dem jüngsten geladenen Snapshot, Anteile in Prozentpunkten. Kein Backend, keine Persistenz im Browser (Regel 4); beim Import werden nur bekannte Felder übernommen (b7). |

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
| **Vorgänge offen** | Vorgänge im Filter ohne Gesamtergebnis (schriftlich oder mündlich leer): der Prozess läuft noch. | – | Nicht im Nenner der Bestehensquoten (E4). Eigene Ansicht «Offene Vorgänge». |
| **Vorgänge passiv (> 365 Tage)** | Offene Vorgänge im Filter, deren letzte Prüfung mehr als 365 Tage zurückliegt und die keinen geplanten Termin haben. | – | Teilmenge von «Vorgänge offen»; nicht im Nenner. Bestehensquoten sind ohne diese Kategorie eine Obergrenze. |
| **Vorgänge nicht erfasst** | Vorgänge im Filter, deren Gesamtergebnis gefüllt, aber unlesbar ist (Fehler im Data-Quality-Log). | – | Nicht im Nenner der Bestehensquoten; zählt nicht als offen (E4). |
| **Schriftlich: im 1. Versuch bestanden** | Anteil Vorgänge, bei denen alle absolvierten WE RUN1 bestanden sind. | Vorgänge mit mindestens einem absolvierten WE RUN1. | Komplement zu «im 1. Versuch durchgefallen». |
| **Schriftlich: im 1. Versuch durchgefallen** | Anteil Vorgänge mit mindestens einem WE RUN1 = no. | Vorgänge mit mindestens einem absolvierten WE RUN1. | – |
| **Schriftlich: insgesamt bestanden** | Anteil Vorgänge mit Status schriftlich «bestanden» («WE All Passed» = yes), unabhängig von der Anzahl Versuche. | Abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden). | Offen und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «WE All yes» als bestanden (Hinweis). |
| **Schriftlich: Ø Resultat 1. Versuch** | Erreichte Punkte in Prozent: je Vorgang Mittel über die vorhandenen Teilprüfungen (Result von RUN1), dann Mittel über die Vorgänge mit Wert. | Vorgänge mit Wert. | Result-Zahlen > 1 ohne Prozentzeichen werden als Prozentwert gelesen (Hinweis im Log); 1 gilt als 100 %. |
| **Schriftlich: Ø Resultat bestandener Run** | Wie oben, aber Result des bestandenen Runs je Teilprüfung. | Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind. | – |
| **Je Teilprüfung (WE1–WE6, OE1–OE2)** | Im 1. Versuch bestanden / durchgefallen (RUN1), insgesamt bestanden (irgendein Run des Teils bestanden), Ø Resultat für beide Wertungen. | Vorgänge mit absolviertem RUN1 des Teils. | – |
| **Mündlich: bestanden** | Anteil Vorgänge mit Status mündlich «bestanden» («OE All Passed» = yes). | Abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden). | Offen (auch: noch nicht angetreten) und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «OE All yes» als bestanden (Hinweis). |
| **Mündlich: im 1. Versuch durchgefallen** | OE1 RUN1 = no, unabhängig vom späteren Erfolg. | Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht). | Zählt auch Vorgänge, die noch offen sind. |
| **Mündlich: 2× durchgefallen** | OE1 RUN1 = no und OE1 RUN2 = no. | Angetretene Vorgänge (wie oben). | – |
| **Mündlich: Ø Resultat 1. Versuch** | Erreichte Punkte in Prozent der mündlichen Prüfung, Result von RUN1, Mittel über die Vorgänge mit Wert. | Vorgänge mit Wert. | – |
| **Mündlich: Ø Resultat bestandener Run** | Wie oben, Result des bestandenen Runs. | Vorgänge mit bestandener mündlicher Prüfung und Wert. | – |
| **VSS / VSM** | Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM. | – | Beides möglich; dann in beiden Zahlen. |
| **Ausgestellte Zertifikate** | Anzahl Vorgänge im Filter mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt). | – | – |
| **Personen mit mehreren Profilen** | Anzahl Personen im Filter mit Vorgängen in mehr als einem Profil; Tabelle mit Profil-Abfolge (zeitlich nach erstem Prüfungsdatum) und Anzahl Personen je Abfolge. | – | Berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb eines aktiven Profil-Filters; zählt Menschen, nicht Vorgänge (E3). |
| **Geplante Prüfungstermine** | Anzahl geplanter Runs (Datum in der Zukunft ohne Passed-Wert) für die Filter Profil, Sprache, Bank, VSS/VSM. | – | Zeitraum und Versuchsmodus wirken nicht. |
| **bbz-Award** | 0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil (Top k, k = höchstens halbe Gruppe, maximal 5). | Vorgänge mit bestandener mündlicher Prüfung und beiden Werten. | Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Unter 5 Vorgängen im Profil keine Liste (Mindestgruppengrösse, E5). Begründung je Rang im Award-Dossier. |
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

## Architektur

Vanilla JS (ES-Module), kein Framework, kein Build-Schritt, GitHub Pages. Bibliotheken lokal unter `lib/`:
MSAL.js 3.30.0 (MIT), SheetJS 0.20.3 (Apache-2.0), fflate 0.8.3 (MIT). Diagramme sind Inline-SVG ohne Bibliothek
(`views/chart.js`), Farben nach validierter Palette. Dark Mode folgt der Systemeinstellung (`prefers-color-scheme`);
der Druck bleibt hell. Zahlenspalten sind rechtsbündig mit Tabellenziffern. Die Gestaltung läuft über CSS-Tokens in
`styles.css` (Abstände, Schriftgrade, Status-, Delta- und Datenbalken-Farben); `node tools/contrast.js` prüft den Kontrast
aller Token-Paare in Light, Dark und Druck (Text ≥ 4.5:1, Linien ≥ 3:1) und läuft in der CI.

```
index.html / app.js / styles.css   Shell, Filterleiste, Navigation, View-Kopf, Legende, Fehleranzeige
filterChips.js                     Aktive Filter als Chips (rein)
urlState.js                        Filter- und Anzeigezustand in der URL (rein)
glossary.js / snapshot.js          Begriffe und Kennzahl-Definitionen; Snapshots der Aggregate (rein)
tools/                             contrast.js, glossar-readme.js, modellbericht.js, snapshot-synth.js (Node)
auth.js                            MSAL (Popup, Redirect-Fallback, Silent-Token)
graph.js                           Graph-HTTP mit Retry (429/503), Token-Erneuerung bei 401
datasource/index.js                load() / loadFromFile() / write() (Phase 2)
datasource/fileAdapter.js          Site → Drive → Item, Download, SheetJS-Parse (nur zwei Sheets)
datasource/threadedComments.js     VSS/VSM aus xl/threadedComments/*.xml
store.js                           Normalisierung → Personenmodell, Data-Quality-Log, Memory-State
metrics.js                         Reine Kennzahlfunktionen
views/tables.js                    Tabellenmodelle je View (rein), views/*.js Rendering
views/personen.js                  Ansicht «Personen»: Suche, Pfad, Karten je Vorgang, Export «Diese Person» (Paket C)
views/experten.js                  Ansicht «Experten»: sortierbare Haupttabelle, Zeilen-Detail, Paarungen, Export «Einsatzebene» (Paket D)
export.js                          CSV, XLSX, Druck
config.js                          IDs, Pfade, Sheet-Namen, Header-Mapping, Whitelists, Aliase
```

Datenschutz: Personendaten bleiben im Browser-Speicher (kein localStorage/IndexedDB); MSAL nutzt sessionStorage nur
für Tokens. Namen erscheinen nur in den Ansichten Personen, Offene Vorgänge, Geplante Prüfungen und Bestenlisten, im
Data-Quality-Log und in Exporten «nur intern» (E5, E7); Expertennamen erscheinen in der Ansicht «Experten» und im Export «Einsatzebene» (E8).
Suchtext, gewählte Person und Sortierung stehen nie in der URL.
Das Repository enthält keine Personendaten; `*.xlsx` und `local/` sind ausgeschlossen.

Phase 2 (Schreibpfad, Paket E) ist nur vorbereitet: `CONFIG.features.write` (Standard `false`) und die dokumentierte Signatur
`write({ sheet, row, header, value, expected, reason })` in `datasource/index.js`; ohne Flag rendert die App keine Bearbeiten-Elemente.
