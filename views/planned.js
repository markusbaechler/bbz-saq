// views/planned.js – View «Geplante Prüfungen»: Termine in der Zukunft ohne Ergebnis, getrennt nach schriftlich (WE)
// und mündlich (OE); je Art eine Übersicht je Tag und Ort (Teilprüfungen mit Anzahl, Wiederholungen) und die Teilnehmenden.
// Hier erscheinen Namen (Auftraggeber: Einteilung der Teilnehmenden ist Zweck der Ansicht).

import { plannedTables } from './tables.js';
import { renderKpis, renderTable, section, el } from './common.js';

export const id = 'geplante-pruefungen';
export const label = 'Geplante Prüfungen';

function kpi(label, value, hint) {
  return { label, value: String(value), n: value, small: false, hint };
}

function intro(part) {
  if (!part.total) return null;
  return part.total + ' Termin' + (part.total === 1 ? '' : 'e') + ' an ' + part.tage + ' Prüfungstag' + (part.tage === 1 ? '' : 'en') + ', ' + part.personen + ' Person' + (part.personen === 1 ? '' : 'en');
}

export function build(ctx) {
  const t = plannedTables(ctx.plannedPersons || []);
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Geplant = Prüfungsdatum in der Zukunft ohne Passed-Wert. Schriftliche (WE) und mündliche (OE) Prüfungen sind getrennt aufgeführt. Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» gelten; Zeitraum und Versuchsmodus wirken hier nicht.' }),
      renderKpis([
        kpi('Geplante Termine', t.total, 'Alle geplanten Runs, schriftlich und mündlich'),
        kpi('davon schriftlich', t.we.total, 'Geplante schriftliche Teilprüfungen (WE1–WE6)'),
        kpi('davon mündlich', t.oe.total, 'Geplante mündliche Teilprüfungen (OE1–OE2)'),
        kpi('Prüfungstage', t.tage, 'Kalendertage mit mindestens einem Termin'),
        kpi('Personen', t.personen, 'Menschen mit mindestens einem geplanten Termin (Personenschlüssel)'),
      ]),
      section('Schriftliche Prüfungen', [renderTable(t.we.summary), renderTable(t.we.details)], { intro: intro(t.we) }),
      section('Mündliche Prüfungen', [renderTable(t.oe.summary), renderTable(t.oe.details)], { intro: intro(t.oe) }),
    ],
    tables: [t.we.summary, t.we.details, t.oe.summary, t.oe.details],
  };
}
