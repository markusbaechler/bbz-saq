// views/offen.js – Ansicht «Offene Vorgänge» (E4): Zertifizierungsprozesse, die noch laufen. Hier erscheinen Namen
// (Auftraggeber: Nutzerkreis bbz-intern, E5). Filter Profil, Sprache, Bank, VSS/VSM gelten; Zeitraum und Versuchsmodus nicht.

import { openCasesTables, earlyWarningTable, passiveTable, profilePartsTable } from './tables.js';
import { renderKpis, renderTable, section, hinted } from './common.js';
import { PASSIVE_DAYS } from '../metrics.js';

export const id = 'offene-vorgaenge';
export const label = 'Offene Vorgänge';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Laufende Zertifizierungsprozesse mit fehlenden Teilen, Frühwarnung und passiven Vorgängen; Zeitraum und Versuche wirken nicht.';
export const glossar = 'Offene Vorgänge (Ansicht)';

export function build(ctx) {
  const today = ctx.today || new Date();
  const t = openCasesTables(ctx.plannedPersons || [], today, ctx.allPersons || ctx.plannedPersons || []);
  const warn = earlyWarningTable(ctx.plannedPersons || []);
  const drop = passiveTable(ctx.plannedPersons || [], today);
  const parts = profilePartsTable(ctx.allPersons || ctx.plannedPersons || []);
  const hints = [
    'Offen = Gesamtergebnis (schriftlich und/oder mündlich) leer, der Zertifizierungsprozess läuft noch (E4). Kein «no» und kein unlesbarer Wert. Passiv = offen, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen und kein geplanter Termin. Weder offen noch passiv stehen im Nenner der Bestehensquoten. Die Filter Profil, Sprache, Bank, VSS/VSM und «nur ausgestellte Zertifikate» gelten; Zeitraum und Versuchsmodus wirken hier nicht. Auch Vorgänge ohne absolvierte Prüfung (nicht kennzahlrelevant) sind aufgeführt.',
  ];
  const sec = hinted(hints);
  return {
    nodes: [
      renderKpis([
        { label: 'Offene Vorgänge', value: String(t.total), n: t.total, small: false, hint: 'Vorgänge mit leerem Gesamtergebnis im aktiven Filter (ohne Zeitraum)' },
        { label: 'davon ohne Prüfung', value: String(t.ohnePruefung), n: t.total, small: false, hint: 'Noch kein absolvierter, datierter Run' },
        { label: 'davon mit geplantem Termin', value: String(t.mitTermin), n: t.total, small: false, hint: 'Mindestens ein Prüfungsdatum in der Zukunft ohne Ergebnis' },
        { label: 'Frühwarnung: letzter Versuch', value: String(warn.lastAttempt), n: warn.total, small: false, hint: 'Teilprüfungen mit zwei Fehlversuchen, bei denen der nächste Versuch der letzte ist (' + warn.exhausted + ' bereits ausgeschöpft)' },
        { label: 'Passiv (> ' + PASSIVE_DAYS + ' Tage)', value: String(drop.total), n: t.total, small: false, hint: 'Offene Vorgänge ohne Termin, letzte Prüfung vor mehr als ' + PASSIVE_DAYS + ' Tagen' },
      ]),
      sec('Frühwarnung: zweiter Fehlversuch', [renderTable(warn)],
        'Die einzige Liste, die eine Handlung vor dem Ergebnis auslöst: Teilprüfungen mit zwei nicht bestandenen Versuchen, bei denen der nächste Versuch der letzte ist – oder bereits alle Versuche nicht bestanden sind. Unabhängig vom Zeitraumfilter.'),
      // Phone (B.4): Je-Profil-Tabellen eingeklappt; Frühwarnung und Teilnehmende bleiben offen
      section('Je Profil', [renderTable(t.summary)], { phoneCollapsed: true }),
      sec('Teilprüfungen je Profil', [renderTable(parts)],
        'Vorgabe laut Auftraggeber (05.09.2026): schriftlich PK 1, IK 1, AFFL 2, CWMA 3, KMU 3, CCoB 3 Teile, mündlich je OE1; Annahme: Teile von links in WE1–WEn. Die Tabelle stellt der Vorgabe die Nutzung in den Daten gegenüber. Daraus ergeben sich je offenem Vorgang die fehlenden Teile in «Teilnehmende» und der Hinweis im Data-Quality-Log, wenn alle Teile bestanden sind, aber das Gesamtergebnis fehlt. Passerelle (PK→IK, AFFL→CWMA, KMU→CCoB, je 1 Teil) wird nur als «möglich» gekennzeichnet, weil ihre Erfassung in der Datei offen ist.',
        null, { phoneCollapsed: true }),
      section('Teilnehmende', [renderTable(t.details)]),
      sec('Passiv seit über ' + PASSIVE_DAYS + ' Tagen', [renderTable(drop)],
        'Offene Vorgänge, bei denen seit über ' + PASSIVE_DAYS + ' Tagen keine Prüfung stattfand und kein Termin geplant ist. Eigene Kategorie neben «offen» (Entscheid Auftraggeber), nicht «nicht bestanden» und nicht im Nenner der Bestehensquoten.'),
    ],
    tables: [warn, t.summary, parts, t.details, drop],
    hints,
  };
}
