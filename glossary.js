// glossary.js – Begriffe und Kennzahl-Definitionen (reine Daten, kein DOM). Quelle für die Ansicht «Glossar» und für
// den Abschnitt «Kennzahl-Definitionen» in README.md (`node tools/glossar-readme.js` erzeugt den Markdown-Abschnitt).
// Kennzahl-Einträge tragen exakt die Beschriftung der Kachel bzw. Tabellenspalte (tests/glossary.test.js prüft das).
// Entscheide E1–E6 des Auftraggebers sind die verbindliche Grundlage; [unklar] markiert Offenes.

export const GLOSSARY = [
  // ---------------------------------------------------------------------- Begriffe
  {
    kind: 'Begriff', term: 'Zertifizierungsvorgang (Vorgang)',
    definition: 'Eine Zeile der Excel-Datei: eine Person durchläuft die Zertifizierung für ein Profil. Alle prüfungsbezogenen Quoten zählen Vorgänge. Duplikate (dieselbe Person, dasselbe Profil in beiden Sheets) sind zu einem Vorgang zusammengeführt.',
    nenner: '–', grenzfaelle: 'Eine Person mit zwei Profilen hat zwei Vorgänge und zählt in Quoten zweimal – bewusst, weil zwei Zertifizierungen stattfanden (E3).',
  },
  {
    kind: 'Begriff', term: 'Person',
    definition: 'Mensch hinter einem oder mehreren Vorgängen, identifiziert über den Personenschlüssel. «Personen» wird nur dort ausgewiesen, wo Menschen gezählt werden.',
    nenner: '–', grenzfaelle: 'Bankwechsel ändert die Person nicht (Employer ist nicht Teil des Schlüssels, E2).',
  },
  {
    kind: 'Begriff', term: 'Personenschlüssel',
    definition: 'Normalisiert aus «Last Name», «First Name» und Geburtsdatum: Akzente entfernt, ß → ss, Kleinschreibung, Bindestriche und Mehrfach-Leerzeichen zu einem Leerzeichen.',
    nenner: '–', grenzfaelle: 'Header «Birth Date» (beide Sheets, am File verifiziert) ist Pflicht. Ist die Zelle leer oder unlesbar, besteht der Schlüssel nur aus dem Namen; namensgleiche Personen fallen dann zusammen (Zähler in der Statuszeile).',
  },
  {
    kind: 'Begriff', term: 'Duplikat',
    definition: 'Zwei Zeilen derselben Person mit gleichem Profil und ohne widersprüchliche Prüfungsdaten (gleicher Run, anderes Datum oder anderer Passed-Wert). Sie werden zu einem Vorgang zusammengeführt: Lücken werden aufgefüllt, nie überschrieben; behalten wird die Zeile mit den meisten absolvierten Runs, bei Gleichstand die aus «Ausgestellte Zertifikate».',
    nenner: '–', grenzfaelle: 'Widersprüchliche Zeilen bleiben eigene Vorgänge und erhalten den Hinweis «Wiederholung?» im Data-Quality-Log (E1).',
  },
  {
    kind: 'Begriff', term: 'Status: bestanden / nicht bestanden / offen / nicht erfasst',
    definition: 'Je Vorgang getrennt für schriftlich («WE All Passed»), mündlich («OE All Passed») und gesamt. yes → bestanden, no → nicht bestanden, leer → offen (der Prozess läuft noch), gefüllt aber unlesbar → nicht erfasst (Fehler im Data-Quality-Log). Gesamt: nicht bestanden, sobald ein Teil nicht bestanden ist; bestanden nur, wenn beide bestanden sind.',
    nenner: '–', grenzfaelle: 'Im Sheet «Ausgestellte Zertifikate» gelten leere Gesamtergebnisse als bestanden (Zertifikat setzt beides voraus), mit Hinweis im Log. Ob ein «no» später zu «yes» werden kann, ist [unklar]; nach E4 gilt «no» als abgeschlossen.',
  },
  {
    kind: 'Begriff', term: 'Abgeschlossener Vorgang',
    definition: 'Vorgang mit Status bestanden oder nicht bestanden (schriftlich bzw. mündlich). Nenner aller Bestehensquoten «insgesamt bestanden» und «mündlich bestanden» (E4).',
    nenner: '–', grenzfaelle: 'Offene und nicht erfasste Vorgänge stehen nicht im Nenner und werden als eigene Zahlen ausgewiesen.',
  },
  {
    kind: 'Begriff', term: 'Kennzahlrelevant (Grundgesamtheit)',
    definition: 'Vorgänge (keine Duplikate) mit mindestens einem absolvierten, datierten schriftlichen Run im aktiven Filter. Alle Kacheln und Tabellen ausser «Geplante Prüfungen» rechnen auf dieser Menge.',
    nenner: '–', grenzfaelle: 'Zeilen ohne absolvierten schriftlichen Run (nur geplante Termine, nur mündliche Runs, Run ohne Datum) sind ausgeschlossen; die Ansicht «Datenqualität» nennt den Grund je Zeile.',
  },
  {
    kind: 'Begriff', term: 'Absolvierter Run',
    definition: 'Ein Run (Versuch einer Teilprüfung) gilt als absolviert, wenn ein Passed-Wert vorhanden ist (yes/no, PASSED/FAILED, fulfilled).',
    nenner: '–', grenzfaelle: 'Ein Datum allein ist ein Termin (geplant oder Ergebnis ausstehend); Score oder Result allein (Formelvorgaben 0) sind kein Versuch.',
  },
  {
    kind: 'Begriff', term: 'Geplante Prüfung',
    definition: 'Run mit Prüfungsdatum in der Zukunft und ohne Passed-Wert; Ort aus «WE{n} RUN{r} Location» bzw. «OE{n} RUN{r} Location». Die Ansicht «Geplante Prüfungen» führt schriftliche (WE) und mündliche (OE) Termine getrennt: je Tag und Ort die Teilprüfungen mit Anzahl und die Wiederholungen (Versuch 2 oder 3), dazu die Teilnehmenden.',
    nenner: '–', grenzfaelle: 'Ein vergangenes Datum ohne Passed-Wert ist ein Hinweis im Data-Quality-Log (Ergebnis ausstehend oder nicht erfasst) und zählt nicht als Versuch.',
  },
  {
    kind: 'Begriff', term: 'Referenzdatum',
    definition: 'Datum des bestandenen mündlichen Runs (letzter Run mit passed = yes). Ohne bestandene mündliche Prüfung: letztes Datum eines absolvierten Runs. Der Zeitraumfilter wirkt darauf.',
    nenner: '–', grenzfaelle: 'Vorgänge ohne datierten Run haben kein Referenzdatum und fallen bei aktivem Zeitraum aus dem Filter.',
  },
  {
    kind: 'Begriff', term: 'Wertung «Resultat 1. Versuch» / «Resultat bestandener Run»',
    definition: '1. Versuch: das Result von RUN1 zählt, auch wenn nicht bestanden. Bestandener Run: das Result des bestandenen Runs zählt; ein Vorgang hat nur dann einen Wert, wenn alle absolvierten Teilprüfungen einen bestandenen Run haben.',
    nenner: '–', grenzfaelle: 'Die Wertung wird nur in den Bestenlisten gewählt; alle anderen Ansichten zeigen beide Wertungen nebeneinander.',
  },
  {
    kind: 'Begriff', term: 'Kleine Gruppe (n < 5)',
    definition: 'Kennzahlen auf Basis von weniger als 5 Vorgängen sind mit «*» markiert (Aussagekraft eingeschränkt). Dieselbe Schwelle gilt als Mindestgruppengrösse für Bestenlisten (E5).',
    nenner: '–', grenzfaelle: 'Bestenlisten: unter 5 Vorgängen im Profil keine Liste; sonst höchstens die Hälfte der Gruppe (abgerundet, maximal 5), damit eine Bestenliste nie zur vollständigen Rangliste wird.',
  },
  {
    kind: 'Begriff', term: 'Award-Dossier',
    definition: 'Vorschlagsliste je Profil für die Prämierung: alle gezeigten Award-Ränge mit Score, Teilwerten, Versuchen, Referenzdatum, Fundstelle (Sheet, Zeile) und Begründung, warum der Vorgang vor dem nächsten steht (Score höher, Tie-Break 1 Versuche, Tie-Break 2 Referenzdatum oder fachlich unentschiedener Gleichstand).',
    nenner: '–', grenzfaelle: 'Ein vollständiger Gleichstand wird alphabetisch geordnet und im Dossier als «fachlich unentschieden» markiert; Profile ohne Liste (Gruppe zu klein) sind im Hinweis genannt.',
  },
  {
    kind: 'Begriff', term: 'Export auf Vorgangsebene',
    definition: 'Zusätzlich zu den Aggregaten jeder Ansicht: eine Zeile je Vorgang im aktiven Filter (Blatt «Vorgänge»: Stammdaten, Status, Quoten-Bausteine, Versuche, Daten, Zertifikat, Schlüssel-Stufe, zusammengeführte Zeilen) und eine Zeile je absolviertem oder geplantem Run (Blatt «Runs»).',
    nenner: '–', grenzfaelle: 'Enthält Namen; Nutzerkreis bbz-intern (E5). Der Filterzustand steht im Kopf jeder Datei.',
  },
  {
    kind: 'Begriff', term: 'Benchmark (Übersicht)',
    definition: 'Vergleichsmenge mit denselben Filtern wie die Auswahl, nur ohne die gewählte Einschränkung: Alle Banken, Alle Profile, Alle Sprachen oder Gesamt (nur Zeitraum). Differenzen in Prozentpunkten (Auswahl minus Benchmark).',
    nenner: '–', grenzfaelle: 'Ist kein entsprechender Filter aktiv, entspricht der Benchmark der Auswahl (Hinweis in der Ansicht).',
  },
  {
    kind: 'Begriff', term: 'VSS / VSM (Kennzeichnung)',
    definition: 'Kennzeichnung aus dem Threaded Comment auf der Namenszelle (Spalte B): Muster «VSS …» bzw. «VSM …», beides möglich. «ohne» = weder noch.',
    nenner: '–', grenzfaelle: 'Vorgänge mit beiden Kennzeichnungen zählen in beiden Gruppen.',
  },
  {
    kind: 'Begriff', term: 'Versuche (Filter)',
    definition: '«nur 1. Versuch»: kein RUN2/RUN3 absolviert; «mehrere Versuche»: mindestens ein RUN2/RUN3 absolviert (schriftlich oder mündlich).',
    nenner: '–', grenzfaelle: '–',
  },
  {
    kind: 'Begriff', term: 'Ausgestellte Zertifikate (Filter)',
    definition: 'Vorgänge aus dem Sheet «Ausgestellte Zertifikate» oder mit einer Zeile daraus zusammengeführt (Kennzeichen «ausgestellt»).',
    nenner: '–', grenzfaelle: '–',
  },
  {
    kind: 'Begriff', term: 'Wirkungsklasse (Data-Quality-Log)',
    definition: 'Was sich ändert, wenn die Zelle korrigiert wird: «macht Zeile unsichtbar» (die Zeile fehlt deswegen in allen Kennzahlen: kein Name, kein absolvierter datierter schriftlicher Run), «verändert Kennzahl» (die Zeile ist sichtbar, aber ein Wert, eine Gruppe oder eine Zählung hängt an der Zelle), «ohne Kennzahlwirkung» (reine Interpretation wie Result als Prozentwert oder Excel-Serienzahl, oder nicht ausgewertetes Feld wie Score).',
    nenner: '–', grenzfaelle: 'Das Log ist nach Wirkung, dann Stufe, dann Zeile sortiert (Arbeitsliste). Einträge auf zusammengeführten Duplikaten gelten als «verändert Kennzahl», weil ihre Daten im behaltenen Vorgang weiterleben.',
  },
  {
    kind: 'Begriff', term: 'Nicht in den Kennzahlen',
    definition: 'Zeilen, die in keiner Kennzahl vorkommen, mit Grund: noch keine Prüfung absolviert (ggf. nur geplante Termine), nur mündliche Runs, schriftlicher Run ohne Datum, Duplikat (zusammengeführt) oder kein Name. Abschnitt in der Ansicht «Datenqualität», unabhängig vom Filter.',
    nenner: '–', grenzfaelle: 'Zeilen ohne Namen ergeben keine Person und erscheinen nur als Fehler «Name fehlt».',
  },
  {
    kind: 'Begriff', term: 'Offene Vorgänge (Ansicht)',
    definition: 'Alle Vorgänge mit Status offen – auch solche ohne absolvierte Prüfung – mit fehlendem Teil (schriftlich/mündlich), letzter Prüfung, Tagen seit der letzten Prüfung, nächstem geplanten Termin und Versuchen. Filter Profil, Sprache, Bank, VSS/VSM und Versuche gelten; der Zeitraum nicht.',
    nenner: '–', grenzfaelle: 'Die Kachel «Zertifizierung offen» in der Übersicht zählt nur kennzahlrelevante offene Vorgänge im Filter (inkl. Zeitraum) und kann deshalb kleiner sein.',
  },
  {
    kind: 'Begriff', term: 'Bestehensgrenze',
    definition: 'Ein Run gilt ab 70 % der erreichbaren Punkte als bestanden (Auftraggeber, bestätigt 10.09.2026). Als PASS_THRESHOLD in config.js geführt.',
    nenner: '–',
    grenzfaelle: 'Die App leitet daraus keine Kennzahl ab: bestanden oder nicht bestanden kommt immer aus dem Passed-Feld. Die Grenze dient allein der Prüfung «Passed-Wert und Resultat widersprechen sich» – «yes» unter 70 % oder «no» ab 70 % ergibt einen Hinweis im Data-Quality-Log (Wirkung «verändert Kennzahl»), weil die Quoten den Passed-Wert lesen und die Ø-Resultate das Resultat. Beide Werte bleiben unverändert.',
  },
  {
    kind: 'Begriff', term: 'Zeitverlauf (Ansicht)',
    definition: 'Kennzahlen je Jahr des Referenzdatums als Liniendiagramm und Tabelle (gesamt und je Profil), Vergleich zweier Jahre in Prozentpunkten sowie Schwierigkeit je Teilprüfung (Durchfallquote und Ø Resultat des ersten Versuchs je WE1–WE6, OE1–OE2 und Jahr des ersten Versuchs).',
    nenner: '–', grenzfaelle: 'Der Zeitraumfilter wirkt nicht (alle Jahre sichtbar); die übrigen Filter gelten. Jahre mit n < 5 sind markiert (hohle Marker, *). Vorgänge ohne Referenzdatum tragen kein Jahr bei. Ein Diagramm hat immer eine Tabelle als Zwilling.',
  },
  {
    kind: 'Begriff', term: 'Frühwarnung «zweiter Fehlversuch»',
    definition: 'Teilprüfungen (WE1–WE6, OE1–OE2) mit zwei nicht bestandenen Versuchen und ohne bestandenen Run. «Letzter Versuch» = genau ein Versuch bleibt (der nächste ist der letzte); «ausgeschöpft» = alle Versuche nicht bestanden. Liste mit Namen in der Ansicht «Offene Vorgänge», unabhängig vom Zeitraumfilter.',
    nenner: '–', grenzfaelle: 'Maximal drei Versuche je Teilprüfung gemäss Spaltenaufbau der Datei (RUN1–RUN3).',
  },
  {
    kind: 'Begriff', term: 'Durchlaufzeit',
    definition: 'Tage vom ersten Prüfungsdatum eines Vorgangs bis zur bestandenen mündlichen Prüfung (Referenzdatum); nur bestandene Vorgänge. Zusätzlich Tage bis zum Zertifikatsbeginn, wo «Certificate Start Date» vorhanden ist. Ausgewiesen als Median, Ø, Quartile, Min, Max je Profil und je Jahr.',
    nenner: 'Bestandene Vorgänge mit erstem Prüfungsdatum.', grenzfaelle: 'Der Median ist gegen Ausreisser (sehr lange Unterbrüche) robuster als der Mittelwert.',
  },
  {
    kind: 'Begriff', term: 'Passiv (> 365 Tage)',
    definition: 'Offener Vorgang, dessen letzte Prüfung mehr als 365 Tage vor dem Stichtag (Ladezeitpunkt) liegt und der keinen geplanten Termin hat. Eigene Kategorie neben «offen» (Entscheid Auftraggeber 05.09.2026), nie «nicht bestanden»; nicht im Nenner der Bestehensquoten.',
    nenner: '–', grenzfaelle: 'Vorgänge ohne jede Prüfung sind nie passiv (kein Datum zum Messen). Schwelle PASSIVE_DAYS in metrics.js.',
  },
  {
    kind: 'Begriff', term: 'Teilprüfungen je Profil',
    definition: 'Vorgabe laut Auftraggeber (05.09.2026, config.js PROFILE_PARTS): schriftlich PK 1, IK 1, AFFL 2, CWMA 3, KMU 3, CCoB 3 Teile, mündlich je OE1. Daraus: fehlende Teile je offenem Vorgang und der Hinweis «alle Teile bestanden, Gesamtergebnis leer». Die Ansicht «Offene Vorgänge» stellt der Vorgabe die Nutzung in den Daten gegenüber (Vorgänge mit absolviertem Run je Teil).',
    nenner: '–', grenzfaelle: 'Annahme [hypothese]: die Teile stehen von links in WE1–WEn; absolvierte Runs ausserhalb der Vorgabe erscheinen als Abweichung und je Vorgang als Hinweis im Data-Quality-Log (ohne Kennzahlwirkung). Gilt laut Auftraggeber für alle Jahrgänge.',
  },
  {
    kind: 'Begriff', term: 'Passerelle',
    definition: 'Verkürzter Weg in ein Nachfolgeprofil (PK→IK, AFFL→CWMA, KMU→CCoB) mit nur einem schriftlichen Teil. Das Cockpit kennzeichnet einen Vorgang als «Passerelle möglich», wenn dieselbe Person das Vorgängerprofil bestanden hat (Status bestanden oder Zertifikat).',
    nenner: '–', grenzfaelle: 'Wie eine Passerelle in der Datei erfasst ist und welche Spalte der Teil belegt, ist [unklar]; deshalb keine reduzierte Teileliste, «Fehlende Teile» zeigt weiterhin die volle Vorgabe.',
  },
  // Personen-Layer (PROMPT-2 Paket C, Anhang A3)
  {
    kind: 'Begriff', term: 'Pfad einer Person',
    definition: 'Zeitliche Abfolge aller Vorgänge (Profile) einer Person nach erstem Prüfungsdatum, mit Status je Vorgang, Zertifikat und Passerelle-Kennzeichen.',
    nenner: '–', grenzfaelle: 'Ansicht «Personen». Namen sichtbar (E7). Suchtext und gewählte Person stehen nie in der URL.',
  },
  {
    kind: 'Begriff', term: 'Prüfungsraster',
    definition: 'Tabelle Teilprüfungen × Versuche (RUN1–RUN3) eines Vorgangs mit Datum, Resultat und Ergebnis je Run; Runs ausserhalb der Profilvorgabe sind markiert.',
    nenner: '–', grenzfaelle: 'Grundlage: Vorgabe je Profil (config.js, PROFILE_PARTS). Ohne Vorgabe (unbekanntes Profil) erscheinen die genutzten Teile.',
  },
  {
    kind: 'Begriff', term: 'Zeitachse (Person)',
    definition: 'Alle datierten Runs eines Vorgangs chronologisch, absolviert und geplant, plus Zertifikatsbeginn.',
    nenner: '–', grenzfaelle: 'Entspricht dem Blatt «Runs» des Exports (gleiche Anzahl datierter Runs).',
  },
  // Experten-Layer (PROMPT-2 Paket D, Anhang A3; Entscheide 06.09.2026)
  {
    kind: 'Begriff', term: 'Einsatz (Experte)',
    definition: 'Absolvierter mündlicher Run (Passed-Wert vorhanden) mit mindestens einem eingetragenen Experten; zählt für beide beteiligten Experten voll. Grundlage der Ansicht «Experten» (E8).',
    nenner: '–', grenzfaelle: 'Der Zeitraum wirkt auf das Run-Datum, nicht auf das Referenzdatum des Vorgangs. Runs mit Ergebnis ohne Datum zählen als Einsatz («ohne Datum»), bei aktivem Zeitraum sind sie ausgeschlossen. Geplante Runs und Duplikate zählen nicht.',
  },
  {
    kind: 'Begriff', term: 'Experte 1 / Experte 2',
    definition: 'Rolle gemäss den Spalten «OE{p} RUN{r} Expert 1» und «Expert 2» der Datei (am File verifiziert 06.09.2026, beide Sheets, optional). Nennt ein Run in beiden Rollen dieselbe Person, zählt sie einen Einsatz und erhält einen Hinweis im Data-Quality-Log.',
    nenner: '–', grenzfaelle: 'Semantik der Rollen [unklar]: Experte 1 hat einen kleineren, regelmässigen Kreis (Hypothese Prüfungsleitung). Die Spalte «OE Expert» ist nicht gemappt (Bedeutung unklar). Experten sind ab 2018 erfasst (CONFIG.experts.from); früher fehlende Experten ergeben keinen Hinweis.',
  },
  { kind: 'Kennzahl', term: 'Experten', definition: 'Anzahl Experten mit mindestens einem Einsatz im aktiven Filter.', nenner: '–', grenzfaelle: 'Schreibvarianten desselben Namens zählen getrennt, bis ein Alias in config.js (EXPERT_ALIASES) sie zusammenführt.' },
  { kind: 'Kennzahl', term: 'Einsätze', definition: 'Anzahl Einsätze; je Experte die Einsätze mit Beteiligung als Experte 1 oder 2.', nenner: '–', grenzfaelle: 'Ein Einsatz zählt für beide Experten voll; n < 5 markiert.' },
  { kind: 'Kennzahl', term: 'Ø Einsätze je Experte', definition: 'Einsätze geteilt durch die Anzahl Experten; Median in Klammern.', nenner: 'Experten', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Anteil Experte 1', definition: 'Einsätze in Rolle 1 geteilt durch alle Rollen-Nennungen des Experten.', nenner: 'Rollen-Nennungen', grenzfaelle: 'Nennt ein Run dieselbe Person in beiden Rollen, zählen beide Nennungen.' },
  { kind: 'Kennzahl', term: 'Durchfallquote 1. Versuch', definition: 'Anteil Einsätze mit nicht bestandenem Run im ersten Versuch (RUN1).', nenner: 'Einsätze im 1. Versuch', grenzfaelle: 'Beobachtungswert, keine Leistungsbeurteilung; Δ zum Benchmark derselben Versuchsart (E9), neutral dargestellt.' },
  { kind: 'Kennzahl', term: 'Durchfallquote Wiederholung', definition: 'Anteil Einsätze mit nicht bestandenem Run bei Wiederholungen (RUN2, RUN3).', nenner: 'Einsätze in Wiederholungen', grenzfaelle: 'Kandidaten mit Wiederholung haben strukturell höhere Durchfallquoten, deshalb getrennter Benchmark (E9).' },
  { kind: 'Kennzahl', term: 'Ø Resultat (Experten)', definition: 'Mittel der Resultate (erreichte Punkte in Prozent) der Einsätze mit Wert.', nenner: 'Einsätze mit Wert', grenzfaelle: 'Result massgebend, Score nicht ausgewertet (E6). Δ zum Benchmark in Prozentpunkten.' },
  { kind: 'Kennzahl', term: 'Benchmark (Experten)', definition: 'Durchfallquote (gesamt, 1. Versuch, Wiederholung) und Ø Resultat über alle Einsätze im Filter.', nenner: 'Einsätze', grenzfaelle: 'Basis der Δ-Werte; keine Schichtung nach Profil (E9: Methodik profilübergreifend vergleichbar).' },
  {
    kind: 'Begriff', term: 'Schreibpfad (Phase 2)',
    definition: 'Änderung einzelner Run-Zellen (Passed, Datum, Resultat, Ort, Experte 1/2) in bestehenden Spalten über die Graph-Workbook-API mit Validierung, Konfliktprüfung (Datei-Version, Zellwert) und Audit-Protokoll neben der Datei; danach lädt die App die Datei neu.',
    nenner: '–', grenzfaelle: 'Nur mit Feature-Flag CONFIG.features.write (E10); die Struktur der Datei bleibt unverändert; Schreiben nur bei Daten von SharePoint, nicht bei lokaler Datei. Ohne Schreibrecht (HTTP 403), bei geänderter oder gesperrter Datei wird nichts geschrieben.',
  },
  {
    kind: 'Begriff', term: 'Bank-Report',
    definition: 'Ansicht für die Weitergabe an ein Institut: Kennzahlen einer gewählten Bank im Vergleich zum Benchmark «alle Banken» (gleicher Zeitraum, gleiche übrigen Filter), je Profil und je Jahr. Ohne Namen, andere Banken nur als Aggregat. PDF über die Druckansicht des Browsers.',
    nenner: '–', grenzfaelle: 'Voraussetzung: genau eine Bank in der Filterleiste gewählt. Kleine Gruppen (n < 5) sind markiert.',
  },
  {
    kind: 'Begriff', term: 'Data-Quality-Stufen',
    definition: 'Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score).',
    nenner: '–', grenzfaelle: 'Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). Entscheid E6 (05.09.2026): Score wird nicht ausgewertet, Result ist massgebend; das Parsing bleibt, damit verrutschte Zellen sichtbar sind.',
  },

  // Streuung und Einordnung (PROMPT-2 Paket G, E14; Anhang A3 Abschnitt G)
  {
    kind: 'Begriff', term: 'Streuung σ (Resultat)',
    definition: 'Stichproben-Standardabweichung (n−1, wie Excel STABW.S) der Resultat-Werte je Vorgang (Mittel über die Teilprüfungen gemäss Wertung, wie «Ø Resultat»), in Prozentpunkten. Zweitzeile der vier Ø-Kacheln der Übersicht und der Kachel «Ø Resultat (Experten)»; Spalten «σ (…)» in den Ø-Tabellen (Prio 3).',
    nenner: 'Vorgänge mit Wert', grenzfaelle: 'Paket G. n < 5 → «–». Immer zusammen mit Median und Quartilen, weil Resultate linksschief sind (viele bei 70–90 %, wenige Ausreisser nach unten). Nicht im Snapshot. Auf dem Phone nur die Kurzform «σ x pp».',
  },
  {
    kind: 'Begriff', term: 'Median / Quartile (Resultat)',
    definition: 'Median, P25 und P75 derselben Resultat-Werte, lineare Interpolation wie bei der Durchlaufzeit; Spalten «Median (…)», «P25 (…)», «P75 (…)» in den Ø-Tabellen (Prio 3, ohne Datenbalken).',
    nenner: 'Vorgänge mit Wert', grenzfaelle: 'n < 5 → «–». Robuster als σ gegen Ausreisser nach unten.',
  },
  {
    kind: 'Begriff', term: 'Effektstärke (d)',
    definition: '(Ø Auswahl − Ø Benchmark) / σ(Benchmark); Skala nach dem Betrag von d: unter 0.2 gering, bis 0.5 mittel, bis 0.8 deutlich, ab 0.8 gross (Cohen). Vorzeichen wie die Differenz.',
    nenner: '–', grenzfaelle: 'Nur wenn beide Gruppen n ≥ 5 und σ(Benchmark) > 0, sonst «–». Grössenordnung, kein Signifikanztest (bewusst keine p-Werte).',
  },
  {
    kind: 'Begriff', term: 'Wilson-Intervall (95 %)',
    definition: 'Konfidenzintervall eines Anteils (z = 1.96), ausgewiesen als ±pp (halbe Breite) mit der Angabe «Benchmark im Intervall: ja/nein» (Benchmark-Anteil innerhalb der Grenzen).',
    nenner: 'Nenner der Quote', grenzfaelle: 'Für Bestehensquoten statt einer Standardabweichung (die wäre nur eine Funktion des Anteils). n = 0 → «–»; bei n < 5 bleibt die Markierung «*».',
  },
  {
    kind: 'Begriff', term: 'Anzahl (Auswahl / Benchmark)',
    definition: 'Spalten in «Auswahl im Vergleich zum Benchmark» (Übersicht, Jahresvergleich) und im Bank-Report: bei Quoten «Zähler von Nenner Einheit» («8 von 9 Vorgängen»), bei Ø-Kennzahlen nur der Nenner («n = 9»), bei Mengen leer – dort ist der Wert selbst die Anzahl.',
    nenner: 'je Zeile die Grundmenge der Kennzahl, nicht die der ganzen Auswahl',
    grenzfaelle: 'Ersetzt die frühere Spalte «n», die die Grundmenge der Auswahl trug und bei Mengenzeilen etwas anderes meinte als daneben stand («Personen 8 · n 9» zählte Vorgänge). Die Einheit kommt aus der Kennzahl (Vorgänge, bei Experten Einsätze).',
  },
  {
    kind: 'Begriff', term: 'Einordnung (Differenz)',
    definition: 'Spalte in «Auswahl im Vergleich zum Benchmark» (Übersicht, Jahresvergleich) und im Bank-Report: Ø-Kennzahlen mit Effektstärke («d +0.3 · mittel»), Quoten mit Wilson-Intervall («±4.1 pp · Benchmark im Intervall: ja»), Mengen ohne («–»).',
    nenner: '–', grenzfaelle: 'Farbe wie die Differenz, die Bedeutung steht im Text. Verhindert, dass wenige Prozentpunkte Differenz als Rangfolge gelesen werden.',
  },
  {
    kind: 'Begriff', term: 'Verteilung der Resultate (Histogramm)',
    definition: 'Anteil der Vorgänge je Resultatklasse à 10 Prozentpunkte (0–10 … 90–100, obere Grenze ausgeschlossen, 100 % in der letzten Klasse), Wertung 1. Versuch; Balkendiagramm Auswahl gegen den Benchmark der Übersicht mit Tabellen-Zwilling in den Ansichten Schriftlich und Mündlich.',
    nenner: 'Vorgänge mit Wert', grenzfaelle: 'Auswahl n < 5 → Hinweis statt Diagramm, die Tabelle bleibt; Benchmark n < 5 → keine zweite Reihe. Zeigt die Form der Verteilung (Ausreisser nach unten), die Ø und σ allein nicht verraten.',
  },
  // ---------------------------------------------------------------------- Kennzahlen (Kachel-/Spaltenbeschriftung)
  { kind: 'Kennzahl', term: 'Vorgänge', definition: 'Anzahl kennzahlrelevanter Zertifizierungsvorgänge im aktiven Filter.', nenner: '–', grenzfaelle: 'Duplikate sind zusammengeführt und zählen einmal.' },
  { kind: 'Kennzahl', term: 'Personen', definition: 'Anzahl Menschen hinter den Vorgängen im Filter (Personenschlüssel).', nenner: '–', grenzfaelle: 'Kleiner oder gleich «Vorgänge»; die Differenz sind Personen mit mehreren Profilen.' },
  // A5: Zwei Prozessstufen, zwei Namen. Die schriftliche Prüfung ist das Gate zur mündlichen – «Schriftlich offen» ist die
  // frühere und grössere Stufe, «Zertifizierung offen» die spätere. Beide Zahlen sind richtig, nur hiessen sie beide «Offen».
  { kind: 'Kennzahl', term: 'Zertifizierung offen', definition: 'Vorgänge im Filter ohne Gesamtergebnis – weder schriftlich noch mündlich abgeschlossen; die Zertifizierung läuft noch. Kachel im Block «Mengen» der Übersicht (früher «Vorgänge offen»).', nenner: 'Alle kennzahlrelevanten Vorgänge im Filter (n der Kachel).', grenzfaelle: 'Nicht im Nenner der Bestehensquoten (E4). Spätere Prozessstufe als «Schriftlich offen» und deshalb die kleinere Zahl. Eigene Ansicht «Offene Vorgänge» (die ohne Zeitraumfilter rechnet und weitere Vorgänge zeigt).' },
  { kind: 'Kennzahl', term: 'Schriftlich offen', definition: 'Vorgänge im Filter ohne schriftliches Gesamtergebnis: die schriftliche Prüfung ist noch nicht abgeschlossen. Spalte in «Kennzahlen je Profil» (Übersicht), früher «Offen».', nenner: 'Vorgänge des Profils im Filter (Spalte «n (Vorgänge)»).', grenzfaelle: 'Die schriftliche Prüfung ist das Gate zur mündlichen: Wer hier offen ist, ist auch in «Zertifizierung offen» enthalten – umgekehrt nicht. Frühere Prozessstufe und deshalb die grössere Zahl.' },
  { kind: 'Kennzahl', term: 'Vorgänge passiv (> 365 Tage)', definition: 'Offene Vorgänge im Filter, deren letzte Prüfung mehr als 365 Tage zurückliegt und die keinen geplanten Termin haben.', nenner: '–', grenzfaelle: 'Teilmenge von «Zertifizierung offen»; nicht im Nenner. Bestehensquoten sind ohne diese Kategorie eine Obergrenze.' },
  { kind: 'Kennzahl', term: 'Vorgänge nicht erfasst', definition: 'Vorgänge im Filter, deren Gesamtergebnis gefüllt, aber unlesbar ist (Fehler im Data-Quality-Log).', nenner: '–', grenzfaelle: 'Nicht im Nenner der Bestehensquoten; zählt nicht als offen (E4).' },
  { kind: 'Kennzahl', term: 'Schriftlich: im 1. Versuch bestanden', definition: 'Anteil Vorgänge, bei denen alle absolvierten WE RUN1 bestanden sind.', nenner: 'Vorgänge mit mindestens einem absolvierten WE RUN1.', grenzfaelle: 'Komplement zu «im 1. Versuch durchgefallen».' },
  { kind: 'Kennzahl', term: 'Schriftlich: im 1. Versuch durchgefallen', definition: 'Anteil Vorgänge mit mindestens einem WE RUN1 = no.', nenner: 'Vorgänge mit mindestens einem absolvierten WE RUN1.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Schriftlich: insgesamt bestanden', definition: 'Anteil Vorgänge mit Status schriftlich «bestanden» («WE All Passed» = yes), unabhängig von der Anzahl Versuche.', nenner: 'Abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden).', grenzfaelle: 'Offen und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «WE All yes» als bestanden (Hinweis).' },
  { kind: 'Kennzahl', term: 'Schriftlich: Ø Resultat 1. Versuch', definition: 'Erreichte Punkte in Prozent: je Vorgang Mittel über die vorhandenen Teilprüfungen (Result von RUN1), dann Mittel über die Vorgänge mit Wert.', nenner: 'Vorgänge mit Wert.', grenzfaelle: 'Result-Zahlen > 1 ohne Prozentzeichen werden als Prozentwert gelesen (Hinweis im Log); 1 gilt als 100 %.' },
  { kind: 'Kennzahl', term: 'Schriftlich: Ø Resultat bestandener Run', definition: 'Wie oben, aber Result des bestandenen Runs je Teilprüfung.', nenner: 'Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Je Teilprüfung (WE1–WE6, OE1–OE2)', definition: 'Im 1. Versuch bestanden / durchgefallen (RUN1), insgesamt bestanden (irgendein Run des Teils bestanden), Ø Resultat für beide Wertungen.', nenner: 'Vorgänge mit absolviertem RUN1 des Teils.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: bestanden', definition: 'Anteil Vorgänge mit Status mündlich «bestanden» («OE All Passed» = yes).', nenner: 'Abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden).', grenzfaelle: 'Offen (auch: noch nicht angetreten) und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «OE All yes» als bestanden (Hinweis).' },
  { kind: 'Kennzahl', term: 'Mündlich: im 1. Versuch bestanden', definition: 'OE1 RUN1 = yes.', nenner: 'Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht).', grenzfaelle: 'Komplement zu «im 1. Versuch durchgefallen» (zusammen 100 %). Anderer Nenner als «bestanden»: dort sind es abgeschlossene Vorgänge.' },
  { kind: 'Kennzahl', term: 'Mündlich: im 1. Versuch durchgefallen', definition: 'OE1 RUN1 = no, unabhängig vom späteren Erfolg.', nenner: 'Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht).', grenzfaelle: 'Zählt auch Vorgänge, die noch offen sind.' },
  { kind: 'Kennzahl', term: 'Mündlich: 2× durchgefallen', definition: 'OE1 RUN1 = no und OE1 RUN2 = no.', nenner: 'Angetretene Vorgänge (wie oben).', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: 3× durchgefallen', definition: 'OE1 RUN1 = no, RUN2 = no und RUN3 = no – alle Versuche, die die Datei kennt, nicht bestanden.', nenner: 'Angetretene Vorgänge (wie oben).', grenzfaelle: 'Teilmenge von «2× durchgefallen». Wer den dritten Versuch besteht, zählt nicht mit. Belegt das endgültige Scheitern über die Versuche, statt es aus «OE All Passed» = no zu erschliessen – die Spalte sagt nicht, nach wie vielen Versuchen.' },
  { kind: 'Kennzahl', term: 'Mündlich: Ø Resultat 1. Versuch', definition: 'Erreichte Punkte in Prozent der mündlichen Prüfung, Result von RUN1, Mittel über die Vorgänge mit Wert.', nenner: 'Vorgänge mit Wert.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: Ø Resultat bestandener Run', definition: 'Wie oben, Result des bestandenen Runs.', nenner: 'Vorgänge mit bestandener mündlicher Prüfung und Wert.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'VSS / VSM', definition: 'Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM.', nenner: '–', grenzfaelle: 'Beides möglich; dann in beiden Zahlen.' },
  { kind: 'Kennzahl', term: 'Ausgestellte Zertifikate', definition: 'Anzahl Vorgänge im Filter mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt).', nenner: '–', grenzfaelle: '–' },
  {
    kind: 'Begriff', term: 'Snapshot (Historisierung)',
    definition: 'JSON-Datei mit den Aggregaten zum Stichtag: Datei-Zähler, Kennzahlen gesamt, je Profil und je Jahr – ohne Namen und ohne Zeilen. Erzeugt in der Ansicht «Historie», abgelegt durch den Auftraggeber (z. B. SharePoint neben der Excel), später wieder geladen (nur Memory) für den Vergleich der Stichtage nebeneinander.',
    nenner: '–', grenzfaelle: 'Immer ohne Filter (kennzahlrelevante Vorgänge, Stand der Datei). Differenz = heute gegenüber dem jüngsten geladenen Snapshot, Anteile in Prozentpunkten. Kein Backend, keine Persistenz im Browser (Regel 4); beim Import werden nur bekannte Felder übernommen (b7).',
  },
  { kind: 'Kennzahl', term: 'Personen mit mehreren Profilen', definition: 'Anzahl Personen im Filter mit Vorgängen in mehr als einem Profil; Tabelle mit Profil-Abfolge (zeitlich nach erstem Prüfungsdatum) und Anzahl Personen je Abfolge.', nenner: '–', grenzfaelle: 'Berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb eines aktiven Profil-Filters; zählt Menschen, nicht Vorgänge (E3).' },
  { kind: 'Kennzahl', term: 'Geplante Prüfungstermine', definition: 'Anzahl geplanter Runs (Datum in der Zukunft ohne Passed-Wert) für die Filter Profil, Sprache, Bank, VSS/VSM.', nenner: '–', grenzfaelle: 'Der Zeitraum wirkt nicht (geplant heisst immer «in der Zukunft»); der Versuchsmodus wirkt über die Vorgänge.' },
  { kind: 'Kennzahl', term: 'bbz-Award', definition: '0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil (Top k, k = höchstens halbe Gruppe, maximal 5).', nenner: 'Vorgänge mit bestandener mündlicher Prüfung und beiden Werten.', grenzfaelle: 'Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Unter 5 Vorgängen im Profil keine Liste (Mindestgruppengrösse, E5). Begründung je Rang im Award-Dossier.' },
  // ------------------------------------------------------- Versuchslogik (PROMPT-3, E11 – P7.2a)
  {
    kind: 'Begriff', term: 'Angetreten (Versuch r)',
    definition: 'Ein Vorgang gilt als zu Versuch r angetreten, wenn mindestens eine Teilprüfung für Run r ein erfasstes Ergebnis trägt (Passed-Wert). Ein Prüfungsdatum ohne Ergebnis ist ein Termin, kein Antritt.',
    nenner: '–',
    grenzfaelle: 'Entscheid des Auftraggebers vom 12.09.2026. Termine ohne Ergebnis stehen als eigene Zahl neben der Quote, nie im Nenner – sonst zählte ein Vorgang als angetreten, ohne je als bestanden oder durchgefallen zählbar zu sein.',
  },
  {
    kind: 'Kennzahl', term: 'Durchfallquote je Versuch (schriftlich)',
    definition: 'Anteil Vorgänge, die nach Versuch r nicht bestanden waren: mindestens eine absolvierte Teilprüfung trägt bis und mit Run r kein «bestanden». Gemessen auf Vorgangsebene, nicht je Teilprüfung.',
    nenner: 'Vorgänge, die zu Versuch r angetreten sind.',
    grenzfaelle: 'Die Versuche sind untereinander nicht vergleichbar: Versuch 2 misst nur Wiederholer, eine ausgelesene Gruppe, und liegt deshalb regelmässig höher als Versuch 1. Eine Teilprüfung, die erst später begonnen wurde, lässt den Vorgang im früheren Versuch scheitern – er war dort nicht vollständig.',
  },
  {
    kind: 'Kennzahl', term: 'Durchfallquote je Versuch (mündlich)',
    definition: 'Wie schriftlich, gerechnet über die absolvierten mündlichen Teilprüfungen.',
    nenner: 'Vorgänge, die zu Versuch r angetreten sind.',
    grenzfaelle: 'Rechnet über alle absolvierten OE-Teile, nicht nur über OE1; in der Datei trägt heute nahezu jeder Vorgang nur OE1. Unterscheidet sich damit von «Mündlich: im 1. Versuch durchgefallen», das ausdrücklich OE1 RUN1 misst.',
  },
  {
    kind: 'Kennzahl', term: 'Antritte je Versuch',
    definition: 'Anzahl Vorgänge mit erfasstem Ergebnis in Run r; steht als Nenner neben jeder Durchfallquote je Versuch.',
    nenner: '–',
    grenzfaelle: 'Nimmt von Versuch zu Versuch stark ab. Liegt die Zahl unter der Schwelle von 5, wird statt der Quote nur die Anzahl ausgewiesen (E5).',
  },
  {
    kind: 'Kennzahl', term: 'Termine ohne erfasstes Ergebnis',
    definition: 'Anzahl Vorgänge mit Prüfungsdatum für Versuch r, aber ohne Passed-Wert.',
    nenner: '–',
    grenzfaelle: 'Zählt nie als Antritt. Trennt «nicht angetreten» von «Ergebnis fehlt»; ohne diese Zahl bliebe die Lücke unsichtbar. Der Grund je Zeile steht im Data-Quality-Log.',
  },
  {
    kind: 'Kennzahl', term: 'Ø Versuche bis Bestanden',
    definition: 'Schriftlich: je Vorgang das Mittel der benötigten Run-Nummern über die absolvierten Teilprüfungen, dann das Mittel über die Vorgänge. Mündlich ergibt dieselbe Rechnung die Run-Nummer des bestandenen Runs.',
    nenner: 'Bestandene Vorgänge (Status nach E4), deren absolvierte Teilprüfungen alle einen bestandenen Run tragen.',
    grenzfaelle: 'Offene und nicht bestandene Vorgänge fliessen nicht ein; ihre Anzahl steht als Fussnote bei der Kennzahl. Als bestanden erfasste Vorgänge ohne bestandenen Run sind eine Datenlücke und werden getrennt gezählt, nie als offen.',
  },
  {
    kind: 'Kennzahl', term: 'Sprachvergleich (Verteilung und Erstversuch)',
    definition: 'Je Sprache die Anzahl Vorgänge mit Anteil an allen Vorgängen und die Durchfallquote im ersten Versuch, schriftlich und mündlich.',
    nenner: 'Verteilung: alle Vorgänge im Filter. Quoten: die zu Versuch 1 angetretenen Vorgänge der Sprache.',
    grenzfaelle: 'Die Zeilen folgen den Daten, nicht einer festen Liste – neben DE, FR und IT trägt die Datei heute auch EN. Vorgänge ohne Sprachangabe bilden eine eigene Zeile. Je Bank fallen kleine Sprachgruppen regelmässig unter die Schwelle von 5.',
  },
  // ------------------------------------------------------- Bankvergleich (PROMPT-3, E7–E9 – P7.2b)
  {
    kind: 'Begriff', term: 'Fokusbank und Vergleichsbanken',
    definition: 'Der Bank-Report stellt eine Fokusbank bis zu vier manuell gewählten Vergleichsbanken gegenüber. Alle Banken erscheinen mit Klarnamen; die Spaltengruppe heisst «Vergleichsbanken».',
    nenner: '–',
    grenzfaelle: 'Eine gewählte Bank ohne Vorgänge im Filter erhält keine Spalte und wird gemeldet; über vier hinaus gewählte Banken ebenso. Keine Anonymisierung und kein Modusschalter (E9) – der Report trägt auf jeder Seite «bbz-intern – Vergleichswerte nicht zur Weitergabe».',
  },
  {
    kind: 'Begriff', term: 'Benchmark «alle Banken» und «alle Banken ohne Fokusbank»',
    definition: 'Zwei Vergleichswerte nebeneinander: alle Vorgänge im Filter, und dieselbe Menge ohne die Vorgänge der Fokusbank. Das Delta der Fokusbank bezieht sich immer auf den zweiten.',
    nenner: 'Vorgänge im Filter bzw. Vorgänge im Filter ohne die Fokusbank.',
    grenzfaelle: 'Die beiden Werte fallen umso stärker auseinander, je grösser die Fokusbank ist. Die grösste Bank der Datei stellt rund 28 Prozent aller Vorgänge; ihr Delta gegen «alle» wäre um Prozentpunkte kleiner als gegen «ohne Fokusbank» und würde den Abstand beschönigen.',
  },
  {
    kind: 'Begriff', term: 'Maskierte Zelle (n < k)',
    definition: 'Liegt der Nenner einer einzelnen Kennzahl unter der Schwelle k (Standard 5), zeigt die Zelle statt der Quote nur die Anzahl: «n = 3 (< 5)». Die Schwelle gilt je Zelle, nicht je Bank.',
    nenner: '–',
    grenzfaelle: 'Betrifft vor allem Sprach- und Versuchszeilen: eine Bank kann über k liegen und trotzdem maskierte Zellen tragen. Ein Nenner von 0 ist nicht maskiert, sondern leer («–») – es gibt nichts zu verbergen. Mengen wie «Vorgänge» oder «Personen» tragen keinen Nenner und werden nie maskiert. Eine maskierte Zelle liefert kein Delta.',
  },
  {
    kind: 'Begriff', term: 'Bankübergreifende Person',
    definition: 'Eine Person mit Vorgängen bei mehr als einer Bank. Die Bank hängt am Vorgang, nicht an der Person (E7): in der Bankspalte zählt sie bei jeder ihrer Banken, im Gesamtwert einmal.',
    nenner: '–',
    grenzfaelle: 'Die Summe der Personenzahlen über alle Banken ist deshalb grösser als die Gesamtzahl der Personen. In der heutigen Datei betrifft das 10 von 3399 Personen; der Report weist die Zahl aus und erklärt sie in einer Fussnote.',
  },
  // ------------------------------------------------------- Druckansicht (PROMPT-3, E12–E15 – P7.2d)
  {
    kind: 'Begriff', term: 'Druckansicht Bank-Report',
    definition: 'Eigener Druckbaum aus denselben Modellen wie der Bildschirm, A4 quer mit 12 mm Rand, Basisschrift 10 pt und Tabellen 9 pt. Fünf fest zugeschnittene Seiten: Leitkennzahlen und Durchfallquoten, Leistung und Kontext, Sprache und Teilprüfungen, Profile und «Nicht in den Kennzahlen», Methodik.',
    nenner: '–',
    grenzfaelle: 'E13 nannte höchstens vier Seiten. Gemessen an der echten Datei mit vier Vergleichsbanken brauchte die Vergleichstabelle allein 211 mm und die Detailseite 209 mm bei 186 mm Satzspiegel; der Auftraggeber hat am 12.09.2026 entschieden, auf fünf Seiten zu gehen statt Kennzahlen zu streichen oder die Schrift zu verkleinern. Die Seiten sind fest zugeschnitten statt dem Fluss überlassen – nur so trägt jede Seite ihr Kopfband und bricht keine Tabelle kopflos um.',
  },
  {
    kind: 'Begriff', term: 'Logo im Bank-Report',
    definition: 'Fester Slot im Kopfband, 24 mm × 12 mm, gespeist aus einer Datei, deren Pfad in CONFIG.report.logo steht (vorgesehen: assets/logo.svg).',
    nenner: '–',
    grenzfaelle: 'Ohne Eintrag bleibt der Slot leer und behält seine Masse – das Layout springt nicht. Die Datei wird erst abgefragt, wenn der Pfad eingetragen ist; sonst erzeugte jeder Druck eine 404 auf eine Datei, die es im Repo nicht gibt (keine Binärassets im Repo, E15).',
  },
];

export function glossaryTerms(kind = null) {
  return GLOSSARY.filter((g) => !kind || g.kind === kind).map((g) => g.term);
}

export function glossaryEntry(term) {
  return GLOSSARY.find((g) => g.term === term) || null;
}

// Anker für Sprünge ins Glossar (PROMPT-2 A.3): Kleinschreibung, Umlaute → ae/oe/ue, ß → ss, alles andere → Bindestrich
export function glossarySlug(term) {
  return String(term).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function glossaryAnchor(term) {
  return 'glossar-' + glossarySlug(term);
}
