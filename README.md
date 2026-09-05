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
| Übersicht | KPIs für den aktiven Filter, Kennzahlen je Profil |
| Schriftlich | Bestehensquoten (Erstversuch, gesamt) nach Profil, Sprache, Bank; Ø Performance nach Profil, Sprache, Bank und Teilprüfung WE1–WE6 |
| Mündlich | Bestehensquote gesamt und je Profil, Anteil 1× / 2× durchgefallen; Ø Performance nach Profil, Sprache, Bank |
| VSS/VSM | Bestehensquoten schriftlich und mündlich für VSS / VSM / ohne, je Profil |
| Bestenlisten | Top 5 je Profil: bbz-Award, beste schriftliche, beste mündliche Prüfung (mit Namen) |
| Geplante Prüfungen | Termine in der Zukunft ohne Ergebnis je Tag und Ort, mit Teilnehmenden, Bank, Profil, Sprache (mit Namen) |
| Datenqualität | Jede nicht interpretierbare oder auffällige Zelle mit Sheet, Zeile, Header, Rohwert, Grund; sortier- und filterbar |

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

- **Zertifizierungsvorgang (Vorgang)** = eine Zeile der Excel-Datei. Alle prüfungsbezogenen Quoten zählen Vorgänge.
- **Person** = Mensch, identifiziert über den **Personenschlüssel** aus «Last Name», «First Name» und Geburtsdatum
  (normalisiert: Akzente, Bindestriche, Gross-/Kleinschreibung, ß). Nicht der Employer: ein Bankwechsel ist dieselbe Person.
  Eine Person kann mehrere Vorgänge haben (z. B. IK und später CWMA) → Kennzahl «Personen mit mehreren Profilen».
  Der Header des Geburtsdatums ist am File noch nicht verifiziert (`config.js`, Feld `birthDate`, Kandidaten «Date of Birth»,
  «Birth Date», «Birthdate», «Birthday», «Geburtsdatum»); fehlt er, bildet die App den Schlüssel nur aus dem Namen und
  meldet das in der Statuszeile.
- **Duplikat**: zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten (gleicher Run,
  anderes Datum oder anderer Passed-Wert) sind derselbe Vorgang – typischerweise je einmal in «First Certification» und in
  «Ausgestellte Zertifikate». Sie werden zu einem Vorgang zusammengeführt (Lücken auffüllen, nie überschreiben; behalten wird
  die Zeile mit den meisten absolvierten Runs, bei Gleichstand die aus «Ausgestellte Zertifikate»), im Data-Quality-Log als
  Hinweis gemeldet und nie doppelt gezählt. Zeilen mit gleichem Profil und widersprüchlichen Daten bleiben eigene Vorgänge
  (Hinweis «Wiederholung?»).
- **Status je Vorgang** (getrennt für schriftlich, mündlich und gesamt): **bestanden** (Gesamtergebnis yes),
  **nicht bestanden** (no), **offen** (Gesamtergebnis leer = Prozess läuft noch), **nicht erfasst** (Zelle gefüllt, aber
  unlesbar → Fehler im Log). Gesamt: nicht bestanden, sobald ein Teil nicht bestanden ist; bestanden nur, wenn beide
  bestanden sind. Nenner der Bestehensquoten «insgesamt bestanden» und «mündlich bestanden» = **abgeschlossene Vorgänge**
  (bestanden + nicht bestanden); offen und nicht erfasst werden als eigene Zahlen ausgewiesen.
- Im Sheet «Ausgestellte Zertifikate» gelten leere Gesamtergebnisse («WE All yes», «OE All yes») als bestanden (Hinweis),
  weil ein Zertifikat beides voraussetzt; ein «no» bleibt ein «no».
- Lokaler Modellbericht (Zähler, Duplikate, offene Vorgänge, Quoten alt → neu je Profil, Score-Beispielwerte; keine Namen):
  `node tools/modellbericht.js /pfad/zu/Reporting_KUBA.xlsx`

## Kennzahl-Definitionen

Grundgesamtheit aller Kennzahlen: Vorgänge (keine Duplikate) mit mindestens einem **absolvierten, datierten schriftlichen
Run** im aktiven Filter. Ein Run gilt als absolviert, wenn ein Passed-Wert vorhanden ist (yes/no, PASSED/FAILED, fulfilled).
Ein Datum allein ist ein Termin (geplant oder Ergebnis ausstehend), Score/Result allein (Formelvorgaben 0) sind kein Versuch.

| Kennzahl | Definition |
|---|---|
| Referenzdatum | Datum des bestandenen mündlichen Runs (letzter Run mit passed = yes). Ohne bestandene mündliche Prüfung: letztes Datum eines absolvierten Runs. Darauf wirkt der Zeitraumfilter. |
| Wertung «Resultat 1. Versuch» | Result von RUN1 zählt, auch wenn nicht bestanden. |
| Wertung «Resultat bestandener Run» | Der bestandene Run zählt. Eine Person hat nur dann einen Wert, wenn alle absolvierten Teilprüfungen einen bestandenen Run haben. |
| Schriftlich: im 1. Versuch bestanden | Anteil Personen, bei denen alle absolvierten WE RUN1 bestanden sind. Nenner: Personen mit mindestens einem absolvierten WE RUN1. |
| Schriftlich: im 1. Versuch durchgefallen | Anteil Personen mit mindestens einem WE RUN1 = no; gleicher Nenner (Komplement der vorigen Quote). |
| Schriftlich: insgesamt bestanden | Anteil Vorgänge mit Status schriftlich «bestanden» («WE All Passed» = yes). Nenner: abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden); offen (leer) und nicht erfasst (unlesbar) zählen nicht im Nenner und werden separat ausgewiesen. In Sheet 2 gilt ein leeres «WE All yes» als bestanden (Hinweis im Log). |
| Schriftlich: Ø Resultat | Erreichte Punkte in Prozent. Je Person Mittel über die vorhandenen Teilprüfungen, dann Mittel über die Personen mit Wert; für beide Wertungen ausgewiesen. |
| Je Teilprüfung (WE1–WE6, OE1–OE2) | n = Personen mit absolviertem RUN1 des Teils; im 1. Versuch bestanden / durchgefallen; insgesamt bestanden = irgendein Run des Teils bestanden; Ø Resultat für beide Wertungen. |
| Mündlich: bestanden | Anteil Vorgänge mit Status mündlich «bestanden» («OE All Passed» = yes). Nenner: abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden); offen und nicht erfasst separat. In Sheet 2 gilt ein leeres «OE All yes» als bestanden (Hinweis im Log). |
| Mündlich: im 1. Versuch / 2× durchgefallen | OE1 RUN1 = no bzw. OE1 RUN1 = no und OE1 RUN2 = no, unabhängig vom späteren Erfolg. Nenner: angetretene Vorgänge (absolvierter, datierter OE1 RUN1; geplante Termine zählen nicht). |
| Mündlich: Ø Resultat | Erreichte Punkte in Prozent der mündlichen Prüfung, Mittel über Personen mit Wert; für beide Wertungen ausgewiesen. |
| bbz-Award | 0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung, nur Personen mit bestandener mündlicher Prüfung. Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum. Die Tie-Breaks gelten auch für die schriftlichen und mündlichen Bestenlisten. |
| VSS / VSM | Aus dem Threaded Comment auf der Namenszelle (Spalte B): `\bVSS\b` bzw. `\bVSM\b`, beides möglich. «ohne» = weder noch. |
| Versuche (Filter) | «nur 1. Versuch»: kein RUN2/RUN3 absolviert; «mehrere Versuche»: mindestens ein RUN2/RUN3 absolviert (schriftlich oder mündlich). |
| Geplante Prüfung | Run mit Datum in der Zukunft und ohne Passed-Wert; Ort aus «WE{n} RUN{r} Location» bzw. «OE{n} RUN{r} Location». |

Alle Quoten werden mit n (Nenner) ausgewiesen, Prozent mit einer Dezimale. Gruppen mit n < 5 sind mit `*` markiert.

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
