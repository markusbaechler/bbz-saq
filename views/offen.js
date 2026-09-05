// views/offen.js – Ansicht «Offene Vorgänge» (E4): Zertifizierungsprozesse, die noch laufen. Hier erscheinen Namen
// (Auftraggeber: Nutzerkreis bbz-intern, E5). Filter Profil, Sprache, Bank, VSS/VSM gelten; Zeitraum und Versuchsmodus nicht.

import { openCasesTables } from './tables.js';
import { renderKpis, renderTable, section, el } from './common.js';

export const id = 'offene-vorgaenge';
export const label = 'Offene Vorgänge';

export function build(ctx) {
  const t = openCasesTables(ctx.plannedPersons || [], ctx.today || new Date());
  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Offen = Gesamtergebnis (schriftlich und/oder mündlich) leer, der Zertifizierungsprozess läuft noch (E4). Kein «no» und kein unlesbarer Wert. Offene Vorgänge stehen nicht im Nenner der Bestehensquoten. Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» gelten; Zeitraum und Versuchsmodus wirken hier nicht. Auch Vorgänge ohne absolvierte Prüfung (nicht kennzahlrelevant) sind aufgeführt.' }),
      renderKpis([
        { label: 'Offene Vorgänge', value: String(t.total), n: t.total, small: false, hint: 'Vorgänge mit leerem Gesamtergebnis im aktiven Filter (ohne Zeitraum)' },
        { label: 'davon ohne Prüfung', value: String(t.ohnePruefung), n: t.total, small: false, hint: 'Noch kein absolvierter, datierter Run' },
        { label: 'davon mit geplantem Termin', value: String(t.mitTermin), n: t.total, small: false, hint: 'Mindestens ein Prüfungsdatum in der Zukunft ohne Ergebnis' },
      ]),
      section('Je Profil', [renderTable(t.summary)]),
      section('Teilnehmende', [renderTable(t.details)]),
    ],
    tables: [t.summary, t.details],
  };
}
