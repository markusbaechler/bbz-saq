// views/bankReport.js – Ansicht «Bank-Report» (PROMPT-3, P7.2c): eine Fokusbank gegen bis zu vier selbst gewählte
// Vergleichsbanken und gegen beide Benchmarks («alle Banken» und «alle Banken ohne Fokusbank»).
//
// E9: Alle Banken erscheinen mit Klarnamen; es gibt keine Anonymisierung und keinen Modusschalter. Der Report ist
// bbz-intern – die Vergleichswerte gehen nicht an das Institut. Die Fusszeile sagt das auf jeder Seite (P7.2d).
// E8: Das Delta steht nur bei der Fokusbank und bezieht sich immer auf «alle ohne Fokusbank»; gegen «alle» wäre es
// bei einer grossen Bank systematisch kleiner, weil die Bank ihren eigenen Vergleichswert mitprägt.
//
// Der globale Bankfilter ist in dieser Ansicht abgeschaltet (filters.bank = false): Fokusbank und Vergleichsbanken
// sind die Auswahl, und die Benchmarks brauchen alle Banken. Die übrigen Filter (Zeitraum, Profil, Sprache, VSS/VSM,
// Versuche, Zertifikate) gelten für alle Spalten gleich.

import { bankComparison, COMPARE_MAX } from '../metrics.js';
import { bankComparisonTable, bankReportTables } from './tables.js';
import { renderTable, section, el, messzeileModell, messzeilenBlock } from './common.js';
import { printPage } from '../export.js';

export const id = 'bank-report';
export const label = 'Bank-Report';
export const group = null; // eigenes Ziel im Band (Paket E)
export const intro = 'Eine Bank gegen bis zu vier selbst gewählte Vergleichsbanken und gegen alle Banken; für das Steuerungsgespräch, bbz-intern.';
export const glossar = 'Bank-Report';
// Vorgangsebene mit Namen folgt in P7.2e (Entscheid Auftraggeber 12.09.2026, bbz-intern); bis dahin kein Personenexport,
// weil der Standardexport auf der global gefilterten Menge rechnet – und die ist hier eine andere als im Report.
export const noPersonExport = true;
// Der Bankfilter der Leiste würde die Benchmarks leeren – die Auswahl steht in der Ansicht.
export const filters = {
  bank: false,
  grund: { bank: 'Fokusbank und Vergleichsbanken stehen in der Ansicht; die Benchmarks brauchen alle Banken' },
};

// Auswahl: Fokusbank als Liste, Vergleichsbanken als Kästchen. Banken unter der Schwelle tragen ihre Vorgangszahl im
// Text – wer eine solche Bank wählt, sieht vorher, dass fast jede Zelle maskiert sein wird (E9).
function bankAuswahl({ banken, fokus, vergleichsbanken, k, onChange }) {
  const beschriftung = (b) => b.bank + ' (' + b.vorgaenge + (b.vorgaenge < k ? ', unter der Schwelle' : '') + ')';
  const fokusFeld = el('select', {
    id: 'bank-report-fokus',
    onchange: (ev) => onChange({ fokus: ev.target.value || null, vergleichsbanken: vergleichsbanken.filter((v) => v !== ev.target.value) }),
  }, [el('option', { value: '', text: 'Bank wählen …' })].concat(
    banken.map((b) => el('option', { value: b.bank, text: beschriftung(b), selected: b.bank === fokus ? '' : null })),
  ));
  const voll = vergleichsbanken.length >= COMPARE_MAX;
  const kaesten = banken.filter((b) => b.bank !== fokus).map((b) => {
    const gewaehlt = vergleichsbanken.includes(b.bank);
    return el('label', { class: 'bank-wahl' + (gewaehlt ? ' gewaehlt' : '') }, [
      el('input', {
        type: 'checkbox', checked: gewaehlt ? '' : null, disabled: !gewaehlt && voll ? '' : null,
        onchange: () => onChange({ fokus, vergleichsbanken: gewaehlt ? vergleichsbanken.filter((v) => v !== b.bank) : vergleichsbanken.concat(b.bank) }),
      }),
      el('span', { text: beschriftung(b) }),
    ]);
  });
  return el('div', { class: 'bank-auswahl' }, [
    el('div', { class: 'feld' }, [el('label', { for: 'bank-report-fokus', text: 'Fokusbank' }), fokusFeld]),
    el('fieldset', { class: 'feld vergleich' }, [
      el('legend', { text: 'Vergleichsbanken (höchstens ' + COMPARE_MAX + ', gewählt: ' + vergleichsbanken.length + ')' }),
      el('div', { class: 'bank-kaesten' }, kaesten),
    ]),
  ]);
}

export function build(ctx) {
  const r = ctx.bankReport;
  const auswahl = bankAuswahl(r);
  if (!r.fokus) {
    return {
      nodes: [auswahl, el('p', { class: 'empty', text: 'Bitte eine Fokusbank wählen. Der Report stellt ihre Kennzahlen bis zu vier selbst gewählten Vergleichsbanken gegenüber und zeigt beide Benchmarks: alle Banken und alle Banken ohne die Fokusbank.' })],
      tables: [],
      hints: [],
    };
  }
  const modell = bankComparison(r.persons, { fokus: r.fokus, vergleich: r.vergleichsbanken, k: r.k });
  const vergleichstabelle = bankComparisonTable(modell);
  const fokusPersonen = r.persons.filter((p) => p.employerCanon === r.fokus);
  const ohneFokus = r.persons.filter((p) => p.employerCanon !== r.fokus);
  const t = bankReportTables(fokusPersonen, ohneFokus, r.fokus, 'Alle Banken ohne ' + r.fokus);
  const messzeilenModelle = t.messzeilen.map((z) => messzeileModell(z.eingabe));
  const hints = [
    'Die Auswahl steht in der Adresse: ein geteilter Link zeigt dieselbe Fokusbank und dieselben Vergleichsbanken.',
    'Der Bankfilter der Leiste gilt hier nicht – die Benchmarks brauchen alle Banken; die übrigen Filter gelten für alle Spalten gleich.',
    'Druckansicht enthält nur diesen Report mit Filterzustand; im Druckdialog «Als PDF speichern» wählen.',
  ];
  return {
    nodes: [
      auswahl,
      el('div', { class: 'toolbar' }, [
        el('button', { type: 'button', text: 'Bank-Report drucken / als PDF speichern', onclick: () => printPage() }),
      ]),
      el('div', { class: 'report-head' }, [
        el('h3', { text: 'bbz Zertifizierungs-Cockpit – Bank-Report ' + r.fokus }),
        el('p', { class: 'meta-list', text: (ctx.headerLines || []).join(' · ') }),
        el('p', { class: 'vertraulich', text: 'bbz-intern – Vergleichswerte nicht zur Weitergabe' }),
      ]),
      // Der Empfänger kennt das Cockpit nicht – «19.5 %» lässt sich nur mit der Referenzmarke einordnen. Diese steht
      // auf «alle ohne Fokusbank», damit sie dasselbe misst wie das Delta der Tabelle.
      messzeilenModelle.length ? section('Durchfallquoten im Vergleich', [
        messzeilenBlock('Durchfallquoten', messzeilenModelle, { referenzLabel: 'Alle Banken ohne ' + r.fokus, skala: t.messzeilen[0].skala }),
      ]) : null,
      section('Vergleichstabelle', [renderTable(vergleichstabelle)]),
      section('Je Profil', [renderTable(t.byProfil)]),
      section('Verlauf je Jahr', [renderTable(t.verlauf)]),
    ].filter(Boolean),
    tables: [vergleichstabelle, t.byProfil, t.verlauf],
    hints,
  };
}
