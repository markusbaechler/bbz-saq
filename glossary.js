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
    nenner: '–', grenzfaelle: 'Fehlt der Geburtsdatum-Header in der Datei [unklar, am File nicht verifiziert], besteht der Schlüssel nur aus dem Namen; die Statuszeile meldet das. Namensgleiche Personen würden dann zusammenfallen.',
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
    definition: 'Run mit Prüfungsdatum in der Zukunft und ohne Passed-Wert; Ort aus «WE{n} RUN{r} Location» bzw. «OE{n} RUN{r} Location».',
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
    nenner: '–', grenzfaelle: '–',
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
    kind: 'Begriff', term: 'Data-Quality-Stufen',
    definition: 'Fehler = Zelle nicht interpretierbar, Wert wird ignoriert. Hinweis = Wert interpretiert oder abgeleitet, aber auffällig (z. B. Result als Prozentwert umgedeutet, Duplikat zusammengeführt, Konsistenzregel verletzt). Nicht ausgewertet = Zelle nicht interpretierbar, aber das Feld fliesst in keine Kennzahl (Score; Entscheid E6 offen).',
    nenner: '–', grenzfaelle: 'Score-Header: «WE{n} RUN{r} Score», «OE{n} RUN{r} Score» (24 Spalten).',
  },

  // ---------------------------------------------------------------------- Kennzahlen (Kachel-/Spaltenbeschriftung)
  { kind: 'Kennzahl', term: 'Vorgänge', definition: 'Anzahl kennzahlrelevanter Zertifizierungsvorgänge im aktiven Filter.', nenner: '–', grenzfaelle: 'Duplikate sind zusammengeführt und zählen einmal.' },
  { kind: 'Kennzahl', term: 'Personen', definition: 'Anzahl Menschen hinter den Vorgängen im Filter (Personenschlüssel).', nenner: '–', grenzfaelle: 'Kleiner oder gleich «Vorgänge»; die Differenz sind Personen mit mehreren Profilen.' },
  { kind: 'Kennzahl', term: 'Vorgänge offen', definition: 'Vorgänge im Filter ohne Gesamtergebnis (schriftlich oder mündlich leer): der Prozess läuft noch.', nenner: '–', grenzfaelle: 'Nicht im Nenner der Bestehensquoten (E4). Eigene Sicht in der Ansicht «Datenqualität» geplant.' },
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
  { kind: 'Kennzahl', term: 'bbz-Award', definition: '0.5 · Ø Resultat schriftlich + 0.5 · Ø Resultat mündlich gemäss gewählter Wertung; Rangliste je Profil.', nenner: 'Vorgänge mit bestandener mündlicher Prüfung und beiden Werten.', grenzfaelle: 'Tie-Break 1: weniger Prüfungsversuche gesamt; Tie-Break 2: früheres Referenzdatum; gilt auch für die schriftlichen und mündlichen Bestenlisten. Mindestgruppengrösse gemäss «Kleine Gruppe».' },
];

export function glossaryTerms(kind = null) {
  return GLOSSARY.filter((g) => !kind || g.kind === kind).map((g) => g.term);
}

export function glossaryEntry(term) {
  return GLOSSARY.find((g) => g.term === term) || null;
}
