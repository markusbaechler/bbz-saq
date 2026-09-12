// views/print.js – Druckansicht des Bank-Reports (PROMPT-3, E12–E15, P7.2d).
//
// E12: Die Druckansicht rendert einen EIGENEN DOM-Baum aus denselben reinen Funktionen; das Screen-DOM wird nicht
// umgestylt. Hier steht keine Rechenlogik – jede Zahl kommt aus metrics.js über die Modelle in tables.js.
// E13: Vier Seiten A4 quer, kein Deckblatt, Kopfband auf jeder Seite. Die Seiten sind fest zugeschnitten statt dem
// Fluss überlassen: nur so kann keine Seite ohne Kopfband entstehen und keine Tabelle kopflos umbrechen.
// E14: Keine Fliesstextabsätze. Erläuterungen nur als Fussnoten, je ein Satz und höchstens 120 Zeichen; die Methodik
// ist eine zweispaltige Tabelle aus dem Glossar – dort steht jede Definition genau einmal.

import { SMALL_N, bankComparison, partFirstAttempt, statusCounts, attemptsUntilPass, excludedRows, personCount } from '../metrics.js';
import { IMPACT } from '../store.js';
import { bankComparisonTable, bankReportTables, vergleichZellText, formatPp, formatAbstand, col } from './tables.js';
import { glossaryEntry } from '../glossary.js';
import { el } from './common.js';

export const FUSSNOTE_MAX = 120;
export const VERTRAULICH = 'bbz-intern – Vergleichswerte nicht zur Weitergabe';
export const LOGO = Object.freeze({ quelle: 'assets/logo.svg', breiteMm: 24, hoeheMm: 12 });

// Welche Kennzahlgruppe auf welche Seite kommt (E13, Fassung vom 12.09.2026: fünf statt vier Seiten).
// Gemessen an der echten Datei mit vier Vergleichsbanken und 9 pt: die Vergleichstabelle allein braucht
// 211 mm, die Detailseite 209 mm – bei 186 mm Satzspiegel. Der Auftraggeber hat entschieden, den Umfang
// zu öffnen statt Kennzahlen zu streichen oder die Schrift zu verkleinern.
const SEITEN_GRUPPEN = Object.freeze({
  kennzahlen: ['Durchfallquote schriftlich', 'Durchfallquote mündlich'],
  leistung: ['Ø Resultat schriftlich', 'Ø Resultat mündlich', 'Ø Versuche bis Bestanden', 'Kontext'],
  sprache: ['Sprache: Verteilung', 'Sprache: im 1. Versuch durchgefallen (schriftlich)'],
});

// Methodik (E14): eine Zeile je Kennzahl, Definition aus dem Glossar. Die Liste ist die einzige Stelle, an der
// steht, was der Report erklärt – damit kann keine Definition zweimal auftauchen.
export const METHODIK_BEGRIFFE = Object.freeze([
  'Angetreten (Versuch r)',
  'Durchfallquote je Versuch (schriftlich)',
  'Durchfallquote je Versuch (mündlich)',
  'Schriftlich: Ø Resultat 1. Versuch',
  'Schriftlich: Ø Resultat bestandener Run',
  'Mündlich: Ø Resultat 1. Versuch',
  'Mündlich: Ø Resultat bestandener Run',
  'Ø Versuche bis Bestanden',
  'Sprachvergleich (Verteilung und Erstversuch)',
  'Abgeschlossener Vorgang',
  'Bankübergreifende Person',
  'Maskierte Zelle (n < k)',
  'Benchmark «alle Banken» und «alle Banken ohne Fokusbank»',
]);

// Die sechs Leitkennzahlen der Fokusbank (E13, eine Zeile Kacheln): Zeilen-Id des Vergleichsmodells und Beschriftung.
const LEITKENNZAHLEN = [
  ['we.v1', 'Schriftlich Versuch 1 durchgefallen'],
  ['oe.v1', 'Mündlich Versuch 1 durchgefallen'],
  ['we.perf.bestanden', 'Ø Resultat schriftlich, bestandener Run'],
  ['oe.perf.bestanden', 'Ø Resultat mündlich, bestandener Run'],
  ['we.versuche', 'Ø Versuche bis Bestanden, schriftlich'],
  ['kontext.vorgaenge', 'Vorgänge'],
];

// Abstand als Text: Prozentpunkte für Quoten und Ø-Resultate, blanke Zahl für Ø Versuche (Run-Nummern).
function deltaText(delta) {
  return delta.einheit === 'pp' ? formatPp(delta.wert) : formatAbstand(delta.wert);
}

// Teilprüfungen der Fokusbank (E13, Seite 3). Teile ohne Antritt entfallen – eine Zeile aus lauter Strichen sagt nichts.
function teilpruefungsTabelle(persons, k) {
  const rows = [];
  for (const kind of ['we', 'oe']) {
    for (const t of partFirstAttempt(persons, kind)) {
      if (!t.n) continue;
      const maskiert = t.n < k;
      rows.push({
        teil: t.label,
        n: t.n,
        durchgefallen: maskiert ? 'n = ' + t.n + ' (< ' + k + ')' : pct(t.failed.pct),
        bestanden: maskiert ? '–' : pct(t.anyPassed.pct),
        erstversuch: maskiert ? '–' : pct(t.meanFirst.mean),
        bestandenerRun: maskiert ? '–' : pct(t.meanPassed.mean),
      });
    }
  }
  return {
    title: 'Teilprüfungen der Fokusbank',
    columns: [
      col('teil', 'Teil', 1), col('n', 'Antritte Versuch 1', 1), col('durchgefallen', 'Versuch 1 durchgefallen', 1),
      col('bestanden', 'Insgesamt bestanden', 1), col('erstversuch', 'Ø Resultat Versuch 1', 1), col('bestandenerRun', 'Ø Resultat bestandener Run', 1),
    ],
    rows,
  };
}

function pct(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (Math.round(value * 1000) / 10).toFixed(1) + ' %' : '–';
}

// Was in keiner Quote steht (E13, Seite 4): die Lücke zwischen «Vorgänge» und den Nennern, benannt statt verschwiegen.
function randTabelle({ fokusPersonen, allePersonen, dq, alleZeilen, fokus }) {
  const stF = statusCounts(fokusPersonen, 'status');
  const stA = statusCounts(allePersonen, 'status');
  const weF = attemptsUntilPass(fokusPersonen, 'we');
  const weA = attemptsUntilPass(allePersonen, 'we');
  const oeF = attemptsUntilPass(fokusPersonen, 'oe');
  const oeA = attemptsUntilPass(allePersonen, 'oe');
  const ausF = excludedRows(alleZeilen.filter((p) => p.employerCanon === fokus)).length;
  const ausA = excludedRows(alleZeilen).length;
  const zeile = (grund, f, a) => ({ grund, fokus: String(f), alle: String(a) });
  return {
    title: 'Nicht in den Kennzahlen',
    columns: [col('grund', 'Grund', 1), col('fokus', fokus, 1), col('alle', 'Alle Banken', 1)],
    rows: [
      zeile('Vorgänge offen (laufen noch)', stF.offen, stA.offen),
      zeile('davon passiv (keine Prüfung, kein Termin)', stF.passiv, stA.passiv),
      zeile('Gesamtergebnis unlesbar (nicht erfasst)', stF.nichtErfasst, stA.nichtErfasst),
      zeile('Als bestanden erfasst, aber kein bestandener Run – schriftlich', weF.ausgeschlossen.ohneRunNummer, weA.ausgeschlossen.ohneRunNummer),
      zeile('Als bestanden erfasst, aber kein bestandener Run – mündlich', oeF.ausgeschlossen.ohneRunNummer, oeA.ausgeschlossen.ohneRunNummer),
      zeile('Zeilen ganz ausserhalb der Kennzahlen', ausF, ausA),
      zeile('Data-Quality-Einträge, die eine Kennzahl verändern', dqAnzahl(dq, fokusPersonen), dq.filter((e) => e.impact === IMPACT.KENNZAHL).length),
    ],
  };
}

function dqAnzahl(dq, persons) {
  const schluessel = new Set();
  for (const p of persons) {
    schluessel.add(p.sheetName + '|' + p.row);
    for (const d of (p.duplicates || [])) schluessel.add(d.sheetName + '|' + d.row);
  }
  return dq.filter((e) => e.impact === IMPACT.KENNZAHL && schluessel.has(e.sheet + '|' + e.row)).length;
}

// Vollständiges Druckmodell. Ohne Fokusbank gibt es keinen Report – dann null, die Ansicht druckt nichts.
export function bankReportPrintModel({
  fokus = null, vergleich = [], persons = [], alleZeilen = [], dq = [], k = SMALL_N,
  kopfzeilen = [], stand = null,
} = {}) {
  if (!fokus) return null;
  const modell = bankComparison(persons, { fokus, vergleich, k });
  const voll = bankComparisonTable(modell);
  const fokusPersonen = persons.filter((p) => p.employerCanon === fokus);
  const ohneFokus = persons.filter((p) => p.employerCanon !== fokus);
  // Ausschnitt der Vergleichstabelle nach Kennzahlgruppen; der Spaltenkopf bleibt auf jeder Seite derselbe.
  const teil = (titel, gruppen) => ({ ...voll, title: titel, rows: voll.rows.filter((r) => gruppen.includes(r.gruppe)) });

  const zeileVon = new Map(modell.zeilen.map((z) => [z.id, z]));
  const kacheln = LEITKENNZAHLEN.map(([id, label]) => {
    const z = zeileVon.get(id);
    if (!z) return null;
    return {
      label,
      wert: vergleichZellText(z.zellen.fokus, z.einheit, k),
      delta: z.delta ? deltaText(z.delta) : null,
    };
  }).filter(Boolean);

  const neben = bankReportTables(fokusPersonen, ohneFokus, fokus, 'Alle Banken ohne ' + fokus);
  const profile = { ...neben.byProfil, rows: neben.byProfil.rows.filter((r) => r.n >= k) };
  profile.title = 'Je Profil (nur Profile mit mindestens ' + k + ' Vorgängen)';

  const methodik = METHODIK_BEGRIFFE.map((begriff) => {
    const e = glossaryEntry(begriff);
    return { kennzahl: begriff, definition: e ? e.definition : '–', nenner: e ? e.nenner : '–' };
  });

  return {
    fokus,
    k,
    vertraulich: VERTRAULICH,
    kopfband: {
      fokus,
      vergleich: modell.spalten.filter((s) => s.art === 'vergleich').map((s) => s.bank),
      zeitraum: kopfzeilen[0] || '',
      stand,
      filter: kopfzeilen.join(' · '),
      logo: LOGO,
      zeilen: [
        'Bank-Report · ' + fokus,
        kopfzeilen.join(' · ') + (stand ? ' · Stand ' + stand : ''),
        'Vergleichsbanken: ' + (modell.spalten.filter((s) => s.art === 'vergleich').map((s) => s.bank).join(' · ') || 'keine'),
      ],
    },
    seiten: [
      {
        id: 'kennzahlen',
        titel: 'Leitkennzahlen und Durchfallquoten',
        bloecke: [{ art: 'kacheln', kacheln }, { art: 'tabelle', tabelle: teil('Durchfallquoten je Versuch', SEITEN_GRUPPEN.kennzahlen) }],
        fussnoten: [
          'Δ in Prozentpunkten gegen alle Banken ohne die Fokusbank, aus Rohwerten gerechnet.',
          'Versuch 2 und 3 messen nur Wiederholer und sind mit Versuch 1 nicht vergleichbar.',
          'Zellen mit n unter ' + k + ' zeigen statt der Quote nur die Anzahl.',
        ],
      },
      {
        id: 'leistung',
        titel: 'Leistung, Versuche und Kontext',
        bloecke: [{ art: 'tabelle', tabelle: teil('Ø Resultate, Ø Versuche und Kontextzahlen', SEITEN_GRUPPEN.leistung) }],
        fussnoten: [
          'Ø Versuche bis Bestanden zählt nur bestandene Vorgänge; offene und gescheiterte fehlen darin.',
          'Personen zählen je Bank einmal; wer für zwei Banken antrat, steht in beiden Spalten.',
        ],
      },
      {
        id: 'sprache',
        // Sprache und Teilprüfungen statt Sprache und Profile: die Sprachzeilen wachsen mit jeder weiteren Sprache
        // in der Datei. Mit den Profilen lag die Seite bei 182 von 186 mm – eine fünfte Sprache hätte sie gesprengt.
        titel: 'Sprache und Teilprüfungen',
        bloecke: [
          { art: 'tabelle', tabelle: teil('Verteilung und Erstversuch je Sprache', SEITEN_GRUPPEN.sprache) },
          { art: 'tabelle', tabelle: teilpruefungsTabelle(fokusPersonen, k) },
        ],
        fussnoten: [
          'Sprachgruppen einer einzelnen Bank liegen oft unter ' + k + ' und zeigen dann nur die Anzahl.',
          'Antritte Versuch 1 ist der Nenner beider Quoten derselben Zeile.',
        ],
      },
      {
        id: 'detail',
        titel: 'Profile und was in keiner Quote steht',
        bloecke: [
          { art: 'tabelle', tabelle: profile },
          { art: 'tabelle', tabelle: randTabelle({ fokusPersonen, allePersonen: persons, dq, alleZeilen, fokus }) },
        ],
        fussnoten: [
          'Profile mit weniger als ' + k + ' Vorgängen erscheinen hier nicht.',
          'Die zweite Tabelle erklärt die Lücke zwischen der Zahl der Vorgänge und den Nennern der Quoten.',
        ],
      },
      {
        id: 'methodik',
        titel: 'Wie gerechnet wird',
        bloecke: [{ art: 'methodik', zeilen: methodik }],
        fussnoten: [
          'Personen der Fokusbank: ' + personCount(fokusPersonen) + ', davon bankübergreifend ' + modell.zeilen.find((z) => z.id === 'kontext.uebergreifend').zellen.fokus.value + '.',
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rendering (E12): eigener DOM-Baum, keine Rechnung. Das Screen-DOM bleibt unberührt.
// ---------------------------------------------------------------------------

function zelleText(v) {
  return v === null || v === undefined ? '' : String(v);
}

// E14: Trägt eine Zeile eine Gruppe, steht diese einmal als Zwischenzeile und die Kennzahlspalte nur noch die
// Bezeichnung. Sonst stünde «Sprache: im 1. Versuch durchgefallen (schriftlich)» vor jeder Sprachzeile erneut und
// bräche die Spalte auf drei Zeilen – gemessen: Seite 2 von 219 auf 160 mm.
function druckTabelle(t) {
  const koerper = [];
  let gruppe = null;
  for (const r of t.rows) {
    if (r.gruppe && r.gruppe !== gruppe) {
      gruppe = r.gruppe;
      koerper.push(el('tr', { class: 'gruppe' }, [el('th', { scope: 'colgroup', colspan: String(t.columns.length), text: gruppe })]));
    }
    koerper.push(el('tr', {}, t.columns.map((c) => el('td', {
      class: (c.key === 'kennzahl' ? 'kennzahl' : c.key === 'grund' ? 'grund' : 'num') + (c.key === 'delta' ? ' delta' : ''),
      text: zelleText(c.key === 'kennzahl' && r.bezeichnung ? r.bezeichnung : r[c.key]),
    }))));
  }
  return el('table', { class: 'druck-tabelle' }, [
    el('caption', { text: t.title }),
    el('thead', {}, [el('tr', {}, t.columns.map((c) => el('th', { scope: 'col', text: c.label, class: c.key === 'kennzahl' ? 'kennzahl' : c.key === 'grund' ? 'grund' : null })))]),
    el('tbody', {}, koerper),
  ]);
}

function methodikTabelle(zeilen) {
  return el('table', { class: 'druck-tabelle methodik' }, [
    el('caption', { text: 'Methodik' }),
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Kennzahl' }), el('th', { scope: 'col', text: 'Definition' })])]),
    el('tbody', {}, zeilen.map((z) => el('tr', {}, [
      el('th', { scope: 'row', text: z.kennzahl }),
      el('td', { text: z.definition }),
    ]))),
  ]);
}

// E15: fester Slot, 24 mm × 12 mm. Das Bild erscheint nur, wenn die Datei über CONFIG.report.logo freigegeben ist –
// ein Bild ins Leere würde bei jedem Druck eine 404 erzeugen. Der Slot behält seine Masse in jedem Fall.
function logoSlot(logo, quelle) {
  return el('div', { class: 'logo-slot' }, quelle ? [el('img', { src: quelle, alt: '', width: String(logo.breiteMm) + 'mm' })] : []);
}

function kopfband(k, logoQuelle) {
  return el('div', { class: 'kopfband' }, [
    el('div', { class: 'kopf-text' }, k.zeilen.map((z, i) => el('p', { class: i === 0 ? 'kopf-titel' : 'kopf-zeile', text: z }))),
    logoSlot(k.logo, logoQuelle),
  ]);
}

function kachelBlock(kacheln) {
  return el('div', { class: 'druck-kacheln' }, kacheln.map((kk) => el('div', { class: 'druck-kachel' }, [
    el('p', { class: 'kachel-label', text: kk.label }),
    el('p', { class: 'kachel-wert', text: kk.wert }),
    el('p', { class: 'kachel-delta', text: kk.delta || '' }),
  ])));
}

function blockNode(b) {
  if (b.art === 'kacheln') return kachelBlock(b.kacheln);
  if (b.art === 'methodik') return methodikTabelle(b.zeilen);
  return druckTabelle(b.tabelle);
}

// Baut den Druckbaum. logoQuelle: Pfad oder null (E15 – ohne Datei bleibt der Slot leer, das Layout gleich).
export function renderBankReportPrint(modell, { logoQuelle = null } = {}) {
  if (!modell) return null;
  return el('div', { id: 'report-print' }, modell.seiten.map((seite, i) => el('section', {
    class: 'seite' + (i < modell.seiten.length - 1 ? ' umbruch' : ''), // E13/Checkliste 8: die letzte Seite bricht nicht um
  }, [
    kopfband(modell.kopfband, logoQuelle),
    el('h2', { text: seite.titel }),
    ...seite.bloecke.map(blockNode),
    seite.fussnoten.length ? el('ol', { class: 'druck-fussnoten' }, seite.fussnoten.map((f) => el('li', { text: f }))) : null,
    el('p', { class: 'fusszeile', text: modell.vertraulich }),
  ].filter(Boolean))));
}

// Baum und Seitenformat wieder abräumen – @page gilt sonst auch für den Druck der übrigen Ansichten.
export function druckBaumEntfernen(doc = globalThis.document) {
  if (!doc) return;
  doc.body.classList.remove('druck-report');
  for (const id of ['report-print', 'report-page']) {
    const n = doc.getElementById(id);
    if (n) n.remove();
  }
}

// E12: Baum anhängen, Seitenformat nur für diesen Druckjob setzen, drucken, danach alles entfernen.
export function druckeBankReport(modell, { logoQuelle = null, doc = globalThis.document, print = () => globalThis.print() } = {}) {
  const baum = renderBankReportPrint(modell, { logoQuelle });
  if (!baum || !doc) return false;
  druckBaumEntfernen(doc);
  const stil = doc.createElement('style');
  stil.id = 'report-page';
  stil.textContent = '@page { size: A4 landscape; margin: 12mm; }';
  doc.head.appendChild(stil);
  doc.body.appendChild(baum);
  doc.body.classList.add('druck-report');
  const auf = () => { druckBaumEntfernen(doc); globalThis.removeEventListener('afterprint', auf); };
  globalThis.addEventListener('afterprint', auf);
  print();
  return true;
}
