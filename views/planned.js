// views/planned.js – View «Geplante Prüfungen»: Termine in der Zukunft ohne Ergebnis, zuerst schriftlich (WE), dann
// mündlich (OE). Je Art: Prüfungsereignisse je Tag und Ort (Zeile anklicken → zugeteilte Personen) und die vollständige
// Teilnehmendenliste zum Aufklappen. Hier erscheinen Namen (Auftraggeber: Einteilung der Teilnehmenden ist Zweck der Ansicht).

import { plannedTables } from './tables.js';
import { renderKpis, renderTable, renderExpandableTable, renderCollapsible, section, el } from './common.js';

export const id = 'geplante-pruefungen';
export const label = 'Geplante Prüfungen';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)

function kpi(label, value, hint) {
  return { label, value: String(value), n: value, small: false, hint };
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function intro(part) {
  if (!part.total) return null;
  return plural(part.total, 'Termin', 'Termine') + ' an ' + plural(part.tage, 'Prüfungstag', 'Prüfungstagen') + ', ' + plural(part.personen, 'Person', 'Personen');
}

// Abschnitt je Art: Ereignis-Tabelle (aufklappbar je Zeile) + Teilnehmendenliste (eingeklappt)
function kindSection(title, part, artWort) {
  const events = renderExpandableTable(part.summary, {
    detail: (row, i) => (part.events[i] ? renderTable(part.events[i].teilnehmende) : null),
    hint: 'Zeile anklicken (oder Enter): zugeteilte Personen des Prüfungsereignisses.',
  });
  const nodes = [events];
  if (part.total) {
    nodes.push(renderCollapsible('Alle Teilnehmenden ' + artWort + ' anzeigen (' + plural(part.total, 'Termin', 'Termine') + ', ' + plural(part.personen, 'Person', 'Personen') + ')', [renderTable(part.details, { caption: false })]));
  }
  return section(title, nodes, { intro: intro(part) });
}

export function build(ctx) {
  const t = plannedTables(ctx.plannedPersons || []);
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Geplant = Prüfungsdatum in der Zukunft ohne Passed-Wert. Zuerst schriftliche (WE), dann mündliche (OE) Prüfungen. Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» gelten; Zeitraum und Versuchsmodus wirken hier nicht.' }),
      renderKpis([
        kpi('Geplante Termine', t.total, 'Alle geplanten Runs, schriftlich und mündlich'),
        kpi('davon schriftlich', t.we.total, 'Geplante schriftliche Teilprüfungen (WE1–WE6)'),
        kpi('davon mündlich', t.oe.total, 'Geplante mündliche Teilprüfungen (OE1–OE2)'),
        kpi('Prüfungstage', t.tage, 'Kalendertage mit mindestens einem Termin'),
        kpi('Personen', t.personen, 'Menschen mit mindestens einem geplanten Termin (Personenschlüssel)'),
      ]),
      kindSection('Schriftliche Prüfungen', t.we, 'schriftlich'),
      kindSection('Mündliche Prüfungen', t.oe, 'mündlich'),
    ],
    tables: [t.we.summary, t.we.details, t.oe.summary, t.oe.details],
  };
}
