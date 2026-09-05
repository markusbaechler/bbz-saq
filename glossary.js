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
    definition: 'Alle Vorgänge mit Status offen – auch solche ohne absolvierte Prüfung – mit fehlendem Teil (schriftlich/mündlich), letzter Prüfung, Tagen seit der letzten Prüfung, nächstem geplanten Termin und Versuchen. Filter Profil, Sprache, Bank, VSS/VSM gelten; Zeitraum und Versuchsmodus nicht.',
    nenner: '–', grenzfaelle: 'Die Kachel «Vorgänge offen» in der Übersicht zählt nur kennzahlrelevante offene Vorgänge im Filter (inkl. Zeitraum) und kann deshalb kleiner sein.',
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
    definition: 'Welche Teilprüfungen (WE1–WE6, OE1–OE2) ein Profil umfasst, ist aus den Daten abgeleitet: ein Teil gehört dazu, wenn mindestens 5 Vorgänge des Profils einen absolvierten Run darin haben. Daraus: fehlende Teile je offenem Vorgang und der Hinweis «alle Teile bestanden, Gesamtergebnis leer».',
    nenner: '–', grenzfaelle: 'Ableitung aus Daten, nicht aus einem Reglement [hypothese]; Tabelle in der Ansicht «Offene Vorgänge» zur Kontrolle.',
  },
  {
    kind: 'Begriff', term: 'Bank-Report',
    definition: 'Ansicht für die Weitergabe an ein Institut: Kennzahlen einer gewählten Bank im Vergleich zum Benchmark «alle Banken» (gleicher Zeitraum, gleiche übrigen Filter), je Profil und je Jahr. Ohne Namen, andere Banken nur als Aggregat. PDF über die Druckansicht des Browsers.',
    nenner: '–', grenzfaelle: 'Voraussetzung: genau eine Bank in der Filterleiste gewählt. Kleine Gruppen (n < 5) sind markiert.',
  },
  {
    kind: 'Begriff', term: 'Prüfungsplanung / Kapazität',
    definition: 'Die Ansicht «Geplante Prüfungen» zeigt Kapazität und Auslastung je Tag und Ort, sobald Plätze je Prüfungsort in config.js (LOCATION_CAPACITY) hinterlegt sind. Die Excel-Datei enthält keine Kapazitätsdaten [beobachtet: kein Header dafür].',
    nenner: '–', grenzfaelle: 'Ohne hinterlegte Kapazität bleiben die Spalten ausgeblendet (b4 nur vorbereitet).',
  },
  {
    kind: 'Begriff', term: 'Data-Quality-Stufen',
    definition: 'Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score).',
    nenner: '–', grenzfaelle: 'Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten). Entscheid E6 (05.09.2026): Score wird nicht ausgewertet, Result ist massgebend; das Parsing bleibt, damit verrutschte Zellen sichtbar sind.',
  },

  // ---------------------------------------------------------------------- Kennzahlen (Kachel-/Spaltenbeschriftung)
  { kind: 'Kennzahl', term: 'Vorgänge', definition: 'Anzahl kennzahlrelevanter Zertifizierungsvorgänge im aktiven Filter.', nenner: '–', grenzfaelle: 'Duplikate sind zusammengeführt und zählen einmal.' },
  { kind: 'Kennzahl', term: 'Personen', definition: 'Anzahl Menschen hinter den Vorgängen im Filter (Personenschlüssel).', nenner: '–', grenzfaelle: 'Kleiner oder gleich «Vorgänge»; die Differenz sind Personen mit mehreren Profilen.' },
  { kind: 'Kennzahl', term: 'Vorgänge offen', definition: 'Vorgänge im Filter ohne Gesamtergebnis (schriftlich oder mündlich leer): der Prozess läuft noch.', nenner: '–', grenzfaelle: 'Nicht im Nenner der Bestehensquoten (E4). Eigene Ansicht «Offene Vorgänge».' },
  { kind: 'Kennzahl', term: 'Vorgänge passiv (> 365 Tage)', definition: 'Offene Vorgänge im Filter, deren letzte Prüfung mehr als 365 Tage zurückliegt und die keinen geplanten Termin haben.', nenner: '–', grenzfaelle: 'Teilmenge von «Vorgänge offen»; nicht im Nenner. Bestehensquoten sind ohne diese Kategorie eine Obergrenze.' },
  { kind: 'Kennzahl', term: 'Vorgänge nicht erfasst', definition: 'Vorgänge im Filter, deren Gesamtergebnis gefüllt, aber unlesbar ist (Fehler im Data-Quality-Log).', nenner: '–', grenzfaelle: 'Nicht im Nenner der Bestehensquoten; zählt nicht als offen (E4).' },
  { kind: 'Kennzahl', term: 'Schriftlich: im 1. Versuch bestanden', definition: 'Anteil Vorgänge, bei denen alle absolvierten WE RUN1 bestanden sind.', nenner: 'Vorgänge mit mindestens einem absolvierten WE RUN1.', grenzfaelle: 'Komplement zu «im 1. Versuch durchgefallen».' },
  { kind: 'Kennzahl', term: 'Schriftlich: im 1. Versuch durchgefallen', definition: 'Anteil Vorgänge mit mindestens einem WE RUN1 = no.', nenner: 'Vorgänge mit mindestens einem absolvierten WE RUN1.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Schriftlich: insgesamt bestanden', definition: 'Anteil Vorgänge mit Status schriftlich «bestanden» («WE All Passed» = yes), unabhängig von der Anzahl Versuche.', nenner: 'Abgeschlossene Vorgänge schriftlich (bestanden + nicht bestanden).', grenzfaelle: 'Offen und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «WE All yes» als bestanden (Hinweis).' },
  { kind: 'Kennzahl', term: 'Schriftlich: Ø Resultat 1. Versuch', definition: 'Erreichte Punkte in Prozent: je Vorgang Mittel über die vorhandenen Teilprüfungen (Result von RUN1), dann Mittel über die Vorgänge mit Wert.', nenner: 'Vorgänge mit Wert.', grenzfaelle: 'Result-Zahlen > 1 ohne Prozentzeichen werden als Prozentwert gelesen (Hinweis im Log); 1 gilt als 100 %.' },
  { kind: 'Kennzahl', term: 'Schriftlich: Ø Resultat bestandener Run', definition: 'Wie oben, aber Result des bestandenen Runs je Teilprüfung.', nenner: 'Vorgänge, deren absolvierte Teilprüfungen alle bestanden sind.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Je Teilprüfung (WE1–WE6, OE1–OE2)', definition: 'Im 1. Versuch bestanden / durchgefallen (RUN1), insgesamt bestanden (irgendein Run des Teils bestanden), Ø Resultat für beide Wertungen.', nenner: 'Vorgänge mit absolviertem RUN1 des Teils.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: bestanden', definition: 'Anteil Vorgänge mit Status mündlich «bestanden» («OE All Passed» = yes).', nenner: 'Abgeschlossene Vorgänge mündlich (bestanden + nicht bestanden).', grenzfaelle: 'Offen (auch: noch nicht angetreten) und nicht erfasst nicht im Nenner. In Sheet 2 gilt ein leeres «OE All yes» als bestanden (Hinweis).' },
  { kind: 'Kennzahl', term: 'Mündlich: im 1. Versuch durchgefallen', definition: 'OE1 RUN1 = no, unabhängig vom späteren Erfolg.', nenner: 'Angetretene Vorgänge: absolvierter, datierter OE1 RUN1 (geplante Termine zählen nicht).', grenzfaelle: 'Zählt auch Vorgänge, die noch offen sind.' },
  { kind: 'Kennzahl', term: 'Mündlich: 2× durchgefallen', definition: 'OE1 RUN1 = no und OE1 RUN2 = no.', nenner: 'Angetretene Vorgänge (wie oben).', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: Ø Resultat 1. Versuch', definition: 'Erreichte Punkte in Prozent der mündlichen Prüfung, Result von RUN1, Mittel über die Vorgänge mit Wert.', nenner: 'Vorgänge mit Wert.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Mündlich: Ø Resultat bestandener Run', definition: 'Wie oben, Result des bestandenen Runs.', nenner: 'Vorgänge mit bestandener mündlicher Prüfung und Wert.', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'VSS / VSM', definition: 'Anzahl Vorgänge mit Kennzeichnung VSS bzw. VSM.', nenner: '–', grenzfaelle: 'Beides möglich; dann in beiden Zahlen.' },
  { kind: 'Kennzahl', term: 'Ausgestellte Zertifikate', definition: 'Anzahl Vorgänge im Filter mit ausgestelltem Zertifikat (Sheet «Ausgestellte Zertifikate» oder damit zusammengeführt).', nenner: '–', grenzfaelle: '–' },
  { kind: 'Kennzahl', term: 'Personen mit mehreren Profilen', definition: 'Anzahl Personen im Filter mit Vorgängen in mehr als einem Profil; Tabelle mit Profil-Abfolge (zeitlich nach erstem Prüfungsdatum) und Anzahl Personen je Abfolge.', nenner: '–', grenzfaelle: 'Berücksichtigt alle kennzahlrelevanten Vorgänge der Person, auch ausserhalb eines aktiven Profil-Filters; zählt Menschen, nicht Vorgänge (E3).' },
  { kind: 'Kennzahl', term: 'Geplante Prüfungstermine', definition: 'Anzahl geplanter Runs (Datum in der Zukunft ohne Passed-Wert) für die Filter Profil, Sprache, Bank, VSS/VSM.', nenner: '–', grenzfaelle: 'Zeitraum und Versuchsmodus wirken nicht.' },
  { kind: 'Kennzahl', term: 'bbz-Award', definition: '0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil (Top k, k = höchstens halbe Gruppe, maximal 5).', nenner: 'Vorgänge mit bestandener mündlicher Prüfung und beiden Werten.', grenzfaelle: 'Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Unter 5 Vorgängen im Profil keine Liste (Mindestgruppengrösse, E5). Begründung je Rang im Award-Dossier.' },
];

export function glossaryTerms(kind = null) {
  return GLOSSARY.filter((g) => !kind || g.kind === kind).map((g) => g.term);
}

export function glossaryEntry(term) {
  return GLOSSARY.find((g) => g.term === term) || null;
}
