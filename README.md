# bbz Zertifizierungs-Cockpit «Reporting KUBA»

Read-only Dashboard (Single-Page-App ohne Build-Schritt) für die Prüfungskennzahlen der bbz-Zertifizierung.
Datenquelle ist die Excel-Datei `Reporting_KUBA.xlsx` auf der SharePoint-Site bbz-Zertifizierung; gelesen werden
ausschliesslich die Sheets «First Certification» und «Ausgestellte Zertifikate». Die Datei wird nie verändert.

- Live: https://markusbaechler.github.io/bbz-saq/ (Anmeldung mit M365-Konto, Zugriff gemäss SharePoint-Rechten)
- Lokal: `python -m http.server 3000` → http://localhost:3000
- Tests: `node tests/run-node.js` oder `tests.html` im Browser (synthetische Daten, keine Personendaten)
- Modellbericht auf einer lokalen Kopie der Datei (nur Zähler und Quoten): `node tools/modellbericht.js <Datei.xlsx>`
- Betrieb und Einrichtung: [DEPLOY.md](DEPLOY.md)

## Ansichten

| Ansicht | Inhalt |
|---|---|
| Übersicht | KPIs für den aktiven Filter (Vorgänge, Personen, offene Vorgänge, Quoten), Kennzahlen je Profil, Personen mit mehreren Profilen |
| Schriftlich | Bestehensquoten (Erstversuch, gesamt) nach Profil, Sprache, Bank; Ø Performance nach Profil, Sprache, Bank und Teilprüfung WE1–WE6 |
| Mündlich | Bestehensquote gesamt und je Profil, Anteil 1× / 2× durchgefallen; Ø Performance nach Profil, Sprache, Bank |
| VSS/VSM | Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil |
| Bestenlisten | Top 5 je Profil: bbz-Award, beste schriftliche, beste mündliche Prüfung (mit Namen) |
| Geplante Prüfungen | Termine in der Zukunft ohne Ergebnis je Tag und Ort, mit Teilnehmenden, Bank, Profil, Sprache (mit Namen) |
| Datenqualität | Jede nicht interpretierbare oder auffällige Zelle mit Sheet, Zeile, Header, Rohwert, Grund; sortier- und filterbar |
| Glossar | Begriffe und Kennzahl-Definitionen (Definition, Nenner, Grenzfälle), auch ohne geladene Daten |

Jede Kennzahl-Ansicht bietet Export als CSV (alle Tabellen in einer Datei) und XLSX (ein Blatt je Tabelle) sowie eine
Druckansicht. Der Filterzustand steht im Kopf jedes Exports.

## Globale Filter

Zeitraum (Von–Bis, Jahres-Shortcuts, «Alle»; wirkt auf das Referenzdatum), Profil, Sprache, Bank, VSS/VSM,
Versuche (alle | nur 1. Versuch | mehrere Versuche), «nur ausgestellte Zertifikate» (Sheet 2).
Die Wertung (Resultat 1. Versuch | Resultat bestandener Run) wird nur in der Ansicht «Bestenlisten» gewählt; alle anderen
Ansichten zeigen beide Wertungen nebeneinander. In der Ansicht «Geplante Prüfungen» wirkt der Zeitraum nicht.

**Benchmark (Übersicht):** Die Kacheln und eine Vergleichstabelle stellen die Auswahl einem Benchmark gegenüber, der
dieselben Filter verwendet, nur ohne die gewählte Einschränkung: Alle Banken (Standard), Alle Profile, Alle Sprachen
oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten.

## Modell: Vorgänge, Personen, Duplikate, Status (Entscheide E1–E4)

Eine Zeile der Datei ist ein **Zertifizierungsvorgang**; eine **Person** (Mensch) kann mehrere Vorgänge haben und wird über
den **Personenschlüssel** aus «Last Name», «First Name» und Geburtsdatum identifiziert (nicht Employer). Zeilen derselben
Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten sind **Duplikate** und werden zu einem Vorgang
zusammengeführt. Jeder Vorgang hat einen **Status**: bestanden / nicht bestanden / offen / nicht erfasst; Nenner der
Bestehensquoten sind abgeschlossene Vorgänge. Definitionen und Grenzfälle: Abschnitt «Kennzahl-Definitionen» bzw. Ansicht
«Glossar».

- Der Header des Geburtsdatums ist am File noch nicht verifiziert (`config.js`, Feld `birthDate`, Kandidaten «Date of Birth»,
  «Birth Date», «Birthdate», «Birthday», «Geburtsdatum»); fehlt er, bildet die App den Schlüssel nur aus dem Namen und
  meldet das in der Statuszeile. Sobald der Header bestätigt ist: `required: 'all'` setzen.
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
| **Personenschlüssel** | Normalisiert aus «Last Name», «First Name» und Geburtsdatum: Akzente entfernt, ß → ss, Kleinschreibung, Bindestriche und Mehrfach-Leerzeichen zu einem Leerzeichen. | Fehlt der Geburtsdatum-Header in der Datei [unklar, am File nicht verifiziert], besteht der Schlüssel nur aus dem Namen; die Statuszeile meldet das. Namensgleiche Personen würden dann zusammenfallen. |
| **Duplikat** | Zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten (gleicher Run, anderes Datum oder anderer Passed-Wert). Sie werden zu einem Vorgang zusammengeführt: Lücken werden aufgefüllt, nie überschrieben; behalten wird die Zeile mit den meisten absolvierten Runs, bei Gleichstand die aus «Ausgestellte Zertifikate». | Widersprüchliche Zeilen bleiben eigene Vorgänge und erhalten den Hinweis «Wiederholung?» im Data-Quality-Log (E1). |
| **Status: bestanden / nicht bestanden / offen / nicht erfasst** | Je Vorgang getrennt für schriftlich («WE All Passed»), mündlich («OE All Passed») und gesamt. yes → bestanden, no → nicht bestanden, leer → offen (der Prozess läuft noch), gefüllt aber unlesbar → nicht erfasst (Fehler im Data-Quality-Log). Gesamt: nicht bestanden, sobald ein Teil nicht bestanden ist; bestanden nur, wenn beide bestanden sind. | Im Sheet «Ausgestellte Zertifikate» gelten leere Gesamtergebnisse als bestanden (Zertifikat setzt beides voraus), mit Hinweis im Log. Ob ein «no» später zu «yes» werden kann, ist [unklar]; nach E4 gilt «no» als abgeschlossen. |
| **Abgeschlossener Vorgang** | Vorgang mit Status bestanden oder nicht bestanden (schriftlich bzw. mündlich). Nenner aller Bestehensquoten «insgesamt bestanden» und «mündlich bestanden» (E4). | Offene und nicht erfasste Vorgänge stehen nicht im Nenner und werden als eigene Zahlen ausgewiesen. |
| **Kennzahlrelevant (Grundgesamtheit)** | Vorgänge (keine Duplikate) mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Alle Kacheln und Tabellen ausser «Geplante Prüfungen» rechnen auf dieser Menge. | Zeilen ohne absolvierten schriftlichen Run (nur geplante Termine, nur mündliche Runs, Run ohne Datum) sind ausgeschlossen; die Ansicht «Datenqualität» nennt den Grund je Zeile. |
| **Absolvierter Run** | Ein Run (Versuch einer Teilprüfung) gilt als absolviert, wenn ein Passed-Wert vorhanden ist (yes/no, PASSED/FAILED, fulfilled). | Ein Datum allein ist ein Termin (geplant oder Ergebnis ausstehend); Score oder Result allein (Formelvorgaben 0) sind kein Versuch. |
| **Geplante Prüfung** | Run mit Prüfungsdatum in der Zukunft und ohne Passed-Wert; Ort aus «WE{n} RUN{r} Location» bzw. «OE{n} RUN{r} Location». | Ein vergangenes Datum ohne Passed-Wert ist ein Hinweis im Data-Quality-Log (Ergebnis ausstehend oder nicht erfasst) und zählt nicht als Versuch. |
| **Referenzdatum** | Datum des bestandenen mündlichen Runs (letzter Run mit passed = yes). Ohne bestandene mündliche Prüfung: letztes Datum eines absolvierten Runs. Der Zeitraumfilter wirkt darauf. | Vorgänge ohne datierten Run haben kein Referenzdatum und fallen bei aktivem Zeitraum aus dem Filter. |
| **Wertung «Resultat 1. Versuch» / «Resultat bestandener Run»** | 1. Versuch: das Result von RUN1 zählt, auch wenn nicht bestanden. Bestandener Run: das Result des bestandenen Runs zählt; ein Vorgang hat nur dann einen Wert, wenn alle absolvierten Teilprüfungen einen bestandenen Run haben. | Die Wertung wird nur in den Bestenlisten gewählt; alle anderen Ansichten zeigen beide Wertungen nebeneinander. |
| **Kleine Gruppe (n < 5)** | Kennzahlen auf Basis von weniger als 5 Vorgängen sind mit «*» markiert (Aussagekraft eingeschränkt). Dieselbe Schwelle gilt als Mindestgruppengrösse für Bestenlisten (E5). | – |
| **Benchmark (Übersicht)** | Vergleichsmenge mit denselben Filtern wie die Auswahl, nur ohne die gewählte Einschränkung: Alle Banken, Alle Profile, Alle Sprachen oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten (Auswahl minus Benchmark). | Ist kein entsprechender Filter aktiv, entspricht der Benchmark der Auswahl (Hinweis in der Ansicht). |
| **VSS / VSM (Kennzeichnung)** | Kennzeichnung aus dem Threaded Comment auf der Namenszelle (Spalte B): Muster «VSS …» bzw. «VSM …», beides möglich. «ohne» = weder noch. | Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen. |
| **Versuche (Filter)** | «nur 1. Versuch»: kein RUN2/RUN3 absolviert; «mehrere Versuche»: mindestens ein RUN2/RUN3 absolviert (schriftlich oder mündlich). | – |
| **Ausgestellte Zertifikate (Filter)** | Vorgänge aus dem Sheet «Ausgestellte Zertifikate» oder mit einer Zeile daraus zusammengeführt (Kennzeichen «ausgestellt»). | – |
| **Data-Quality-Stufen** | Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score; Entscheid E6 offen). | Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). |

### Kennzahlen

| Kennzahl | Definition | Nenner | Grenzfälle / Hinweise |
|---|---|---|---|
| **Vorgänge** | Anzahl kennzahlrelevanter Zertifizierungsvorgänge im aktiven Filter. | – | Duplikate sind zusammengeführt und zählen einmal. |
| **Personen** | Anzahl Menschen hinter den Vorgängen im Filter (Personenschlüssel). | – | Kleiner oder gleich «Vorgänge»; die Differenz sind Personen mit mehreren Profilen. |
| **Vorgänge offen** | Vorgänge im Filter ohne Gesamtergebnis (schriftlich oder mündlich leer): der Prozess läuft noch. | – | Nicht im Nenner der Bestehensquoten (E4). Eigene Sicht in der Ansicht «Datenqualität» geplant. |
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
| **bbz-Award** | 0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil. | Vorgänge mit bestandener mündlicher Prüfung und beiden Werten. | Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Mindestgruppengrösse gemäss «Kleine Gruppe». |
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
| Score | ganze Zahl ≥ 0; sonst Stufe «nicht ausgewertet» (Feld fliesst in keine Kennzahl, Entscheid E6 offen) |
| Geburtsdatum | wie Datum, plausible Jahrgänge 1920–2010 (Serienzahlen entsprechend); nur für den Personenschlüssel |
| Datum | Excel-Datum oder Text `dd.mm.yy(yy)[ / hh.mm]` (Trenner . oder , Suffix h / Uhr); Excel-Serienzahl ohne Format → Datum + Hinweis; Jahr ausserhalb 2000–2100, ohne Jahr, dreistelliges Jahr → Fehler |

Stufen im Log: **Fehler** = Zelle nicht interpretierbar, Wert wird ignoriert. **Hinweis** = Wert interpretiert oder
abgeleitet, aber auffällig (z. B. vergangener Termin ohne Ergebnis, Passed ohne Datum, abgeleitete Sprache, Result als
Prozentwert umgedeutet, Duplikat zusammengeführt), oder Konsistenzregel verletzt. **Nicht ausgewertet** = Zelle nicht
interpretierbar, aber das Feld fliesst in keine Kennzahl (Score). Die Zusammenfassung nach Header und Grund lässt sich ohne
Personendaten kopieren.

## Architektur

Vanilla JS (ES-Module), kein Framework, kein Build-Schritt, GitHub Pages. Bibliotheken lokal unter `lib/`:
MSAL.js 3.30.0 (MIT), SheetJS 0.20.3 (Apache-2.0), fflate 0.8.3 (MIT).

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
