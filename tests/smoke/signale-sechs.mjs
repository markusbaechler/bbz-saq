// Sechs Signale in der Form, die metrics.signals() liefert – der volle Fall für das Höhenbudget des Signalblocks (D2).
// Die synthetische Datei ist zu klein, um alle Regeln auszulösen; die Texte sind deshalb nachgebildet, in der Länge
// realistisch (Zahlen aus einem Bestand von rund 1200 Vorgängen). Keine Personendaten, nur Profilnamen und Zahlen.
export const SECHS_SIGNALE = [
  {
    id: 'jahrestrend', stufe: 'kritisch', gewicht: 93.9,
    titel: 'Schriftliche Erstversuchsquote fällt seit 2018',
    detail: 'Von 92.0 % (2018) auf 62.0 % (2025), also 30 pp über 8 Jahre mit je mindestens 20 Vorgängen; 1204 auswertbare Vorgänge.',
    schwelle: 'Schwelle: ab 8 pp Abfall, bei mindestens 4 Jahren mit je n ≥ 20',
    weg: { kind: 'view', view: 'zeitverlauf' }, wegText: 'Zeitverlauf öffnen',
  },
  {
    id: 'profil-unter-KMU', stufe: 'kritisch', gewicht: 27.2,
    titel: 'KMU liegt unter dem Gesamtwert',
    detail: '72.4 % gegen 81.4 % gesamt, n = 302, Wilson-Halbbreite ±5.0 pp – das sind 27 Vorgänge.',
    schwelle: 'Schwelle: das 95-%-Wilson-Intervall des Profils enthält den Gesamtwert nicht',
    weg: { kind: 'filter', patch: { profil: ['KMU'] } }, wegText: 'Auf KMU filtern',
  },
  {
    id: 'profil-unter-CCoB', stufe: 'kritisch', gewicht: 8.5,
    titel: 'CCoB liegt unter dem Gesamtwert',
    detail: '70.8 % gegen 81.4 % gesamt, n = 80, Wilson-Halbbreite ±9.8 pp – das sind 8 Vorgänge.',
    schwelle: 'Schwelle: das 95-%-Wilson-Intervall des Profils enthält den Gesamtwert nicht',
    weg: { kind: 'filter', patch: { profil: ['CCoB'] } }, wegText: 'Auf CCoB filtern',
  },
  {
    id: 'passiv', stufe: 'beachten', gewicht: 0.9,
    titel: '52 von 468 offenen Vorgängen sind passiv',
    detail: '11.1 % der offenen Vorgänge: letzte Prüfung vor mehr als 365 Tagen und kein Termin gesetzt.',
    schwelle: 'Schwelle: über 10 %',
    weg: { kind: 'view', view: 'offene-vorgaenge' }, wegText: 'Offene Vorgänge öffnen',
  },
  {
    id: 'letzter-versuch', stufe: 'beachten', gewicht: 0.8,
    titel: '7 Vorgänge vor dem letzten Versuch',
    detail: 'Zwei mündliche Fehlversuche; der nächste Versuch entscheidet.',
    schwelle: 'Schwelle: mehr als 0 Vorgänge',
    weg: { kind: 'view', view: 'offene-vorgaenge' }, wegText: 'Frühwarnung öffnen',
  },
  {
    id: 'profil-ueber-PK', stufe: 'guenstig', gewicht: -1,
    titel: 'PK liegt über dem Gesamtwert',
    detail: '88.2 % gegen 81.4 % gesamt, n = 640, Wilson-Halbbreite ±2.5 pp – das sind 44 Vorgänge, kein Handlungsbedarf.',
    schwelle: 'Schwelle: das 95-%-Wilson-Intervall des Profils enthält den Gesamtwert nicht',
    weg: { kind: 'filter', patch: { profil: ['PK'] } }, wegText: 'Auf PK filtern',
  },
];
