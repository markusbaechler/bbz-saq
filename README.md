# bbz Zertifizierungs-Cockpit «Reporting KUBA»

[![Tests](https://github.com/markusbaechler/bbz-saq/actions/workflows/tests.yml/badge.svg)](https://github.com/markusbaechler/bbz-saq/actions/workflows/tests.yml)

Read-only Dashboard (Single-Page-App ohne Build-Schritt) für die Prüfungskennzahlen der bbz-Zertifizierung.
Datenquelle ist die Excel-Datei `Reporting_KUBA.xlsx` auf der SharePoint-Site bbz-Zertifizierung; gelesen werden
ausschliesslich die Sheets «First Certification» und «Ausgestellte Zertifikate». Die Datei wird nie verändert.

- Live: https://markusbaechler.github.io/bbz-saq/ (Anmeldung mit M365-Konto, Zugriff gemäss SharePoint-Rechten)
- Lokal: `python -m http.server 3000` → http://localhost:3000
- Tests: `node tests/run-node.js` oder `tests.html` im Browser (synthetische Daten, keine Personendaten)
- CI: GitHub Action «Tests» (`.github/workflows/tests.yml`) bei Push auf `main` und bei Pull Requests: Syntaxprüfung aller Module, `node tests/run-node.js`, README-Glossar-Abgleich
- Modellbericht auf einer lokalen Kopie der Datei (nur Zähler und Quoten): `node tools/modellbericht.js <Datei.xlsx>`
- Betrieb und Einrichtung: [DEPLOY.md](DEPLOY.md)

## Ansichten

| Ansicht | Inhalt |
|---|---|
| Übersicht | KPIs für den aktiven Filter (Vorgänge, Personen, offene Vorgänge, Quoten), Kennzahlen je Profil, Personen mit mehreren Profilen |
| Schriftlich | Bestehensquoten (Erstversuch, gesamt) nach Profil, Sprache, Bank; Ø Performance nach Profil, Sprache, Bank und Teilprüfung WE1–WE6 |
| Mündlich | Bestehensquote gesamt und je Profil, Anteil 1× / 2× durchgefallen; Ø Performance nach Profil, Sprache, Bank |
| VSS/VSM | Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil |
| Zeitverlauf | Kennzahlen je Jahr (Liniendiagramm und Tabelle, gesamt und je Profil), zwei Jahre vergleichen (Prozentpunkte), Schwierigkeit je Teilprüfung und Jahr, Durchlaufzeit je Profil und Jahr |
| Bestenlisten | Je Profil: bbz-Award, beste schriftliche, beste mündliche Prüfung (mit Namen); Mindestgruppengrösse 5, Liste höchstens halbe Gruppe (maximal 5); Award-Dossier mit Begründung je Rang |
| Bank-Report | Kennzahlen einer gewählten Bank gegen den anonymen Benchmark «alle Banken», je Profil und je Jahr; ohne Namen; Druck/PDF |
| Offene Vorgänge | Laufende Zertifizierungsprozesse (Gesamtergebnis leer) je Profil und mit Teilnehmenden: fehlende Teile, letzte Prüfung, nächster Termin, Versuche (mit Namen); Teilprüfungen je Profil; Frühwarnung «zweiter Fehlversuch»; passiv seit über 365 Tagen |
| Geplante Prüfungen | Termine in der Zukunft ohne Ergebnis, zuerst schriftlich (WE), dann mündlich (OE): je Art die Prüfungsereignisse je Tag und Ort (Teilprüfungen mit Anzahl, Wiederholungen; Zeile anklicken → zugeteilte Personen) und die vollständige Teilnehmendenliste zum Aufklappen (mit Namen, Bank, Profil, Sprache); Kapazität/Auslastung, sobald Plätze je Ort in `config.js` hinterlegt sind |
| Datenqualität | «Nicht in den Kennzahlen» mit Grund je Zeile; jede nicht interpretierbare oder auffällige Zelle mit Wirkung auf die Kennzahlen, Stufe, Sheet, Zeile, Header, Rohwert, Grund; nach Wirkung priorisiert, sortier- und filterbar |
| Glossar | Begriffe und Kennzahl-Definitionen (Definition, Nenner, Grenzfälle), auch ohne geladene Daten |

Jede Kennzahl-Ansicht bietet Export als CSV (alle Tabellen in einer Datei) und XLSX (ein Blatt je Tabelle) sowie eine
Druckansicht. Zusätzlich exportiert jede Kennzahl-Ansicht die Vorgangsebene (eine Zeile je Vorgang, eine Zeile je Run,
mit Namen, nur intern). Der Filterzustand steht im Kopf jedes Exports.

## Globale Filter

Zeitraum (Von–Bis, Jahres-Shortcuts, «Alle»; wirkt auf das Referenzdatum), Profil, Sprache, Bank, VSS/VSM,
Versuche (alle | nur 1. Versuch | mehrere Versuche), «nur ausgestellte Zertifikate» (Sheet 2 oder damit zusammengeführt).

**Filterzustand in der URL:** Ansicht, Filter, Wertung und Benchmark stehen im Hash der Adresse
(`#schriftlich?von=2025-01-01&bis=2025-12-31&profil=PK&bank=…&wertung=bestanden&benchmark=profil`) und lassen sich als
Link teilen; nach dem Öffnen müssen die Daten neu geladen werden. Die URL enthält nie Personendaten. Die Filterleiste wird
bei Filteränderungen nur aktualisiert, nicht neu aufgebaut; der Tastaturfokus bleibt auf dem bedienten Element.
Die Wertung (Resultat 1. Versuch | Resultat bestandener Run) wird nur in der Ansicht «Bestenlisten» gewählt; alle anderen
Ansichten zeigen beide Wertungen nebeneinander. In der Ansicht «Geplante Prüfungen» wirkt der Zeitraum nicht.

**Benchmark (Übersicht):** Die Kacheln und eine Vergleichstabelle stellen die Auswahl einem Benchmark gegenüber, der
dieselben Filter verwendet, nur ohne die gewählte Einschränkung: Alle Banken (Standard), Alle Profile, Alle Sprachen
oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten.

## Modell: Vorgänge, Personen, Duplikate, Status (Entscheide E1–E4)

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
| **Bank-Report** | Ansicht für die Weitergabe an ein Institut: Kennzahlen einer gewählten Bank im Vergleich zum Benchmark «alle Banken» (gleicher Zeitraum, gleiche übrigen Filter), je Profil und je Jahr. Ohne Namen, andere Banken nur als Aggregat. PDF über die Druckansicht des Browsers. | Voraussetzung: genau eine Bank in der Filterleiste gewählt. Kleine Gruppen (n < 5) sind markiert. |
| **Prüfungsplanung / Kapazität** | Die Ansicht «Geplante Prüfungen» zeigt Kapazität und Auslastung je Tag und Ort, sobald Plätze je Prüfungsort in config.js (LOCATION_CAPACITY) hinterlegt sind. Die Excel-Datei enthält keine Kapazitätsdaten [beobachtet: kein Header dafür]. | Ohne hinterlegte Kapazität bleiben die Spalten ausgeblendet (b4 nur vorbereitet). |
| **Data-Quality-Stufen** | Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score). | Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). Entscheid E6 (05.09.2026): Score wird nicht ausgewertet, Result ist massgebend; das Parsing bleibt, damit verrutschte Zellen sichtbar sind. |

### Kennzahlen

| Kennzahl | Definition | Nenner | Grenzfälle / Hinweise |
|---|---|---|---|
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

## Architektur

Vanilla JS (ES-Module), kein Framework, kein Build-Schritt, GitHub Pages. Bibliotheken lokal unter `lib/`:
MSAL.js 3.30.0 (MIT), SheetJS 0.20.3 (Apache-2.0), fflate 0.8.3 (MIT). Diagramme sind Inline-SVG ohne Bibliothek
(`views/chart.js`), Farben nach validierter Palette. Dark Mode folgt der Systemeinstellung (`prefers-color-scheme`);
der Druck bleibt hell. Zahlenspalten sind rechtsbündig mit Tabellenziffern.

```
index.html / app.js / styles.css   Shell, Filterleiste, Navigation, Fehleranzeige
auth.js                            MSAL (Popup, Redirect-Fallback, Silent-Token)
graph.js                           Graph-HTTP mit Retry (429/503), Token-Erneuerung bei 401
datasource/index.js                load() / loadFromFile() / write() (Phase 2)
datasource/fileAdapter.js          Site → Drive → Item, Download, SheetJS-Parse (nur zwei Sheets)
datasource/threadedComments.js     VSS/VSM aus xl/threadedComments/*.xml
store.js                           Normalisierung → Personenmodell, Data-Quality-Log, Memory-State
metrics.js                         Reine Kennzahlfunktionen
views/tables.js                    Tabellenmodelle je View (rein), views/*.js Rendering
export.js                          CSV, XLSX, Druck
config.js                          IDs, Pfade, Sheet-Namen, Header-Mapping, Whitelists, Aliase
```

Datenschutz: Personendaten bleiben im Browser-Speicher (kein localStorage/IndexedDB); MSAL nutzt sessionStorage nur
für Tokens. Namen erscheinen nur in Bestenlisten, geplanten Prüfungen und im Data-Quality-Log. Das Repository enthält
keine Personendaten; `*.xlsx` und `local/` sind ausgeschlossen.
