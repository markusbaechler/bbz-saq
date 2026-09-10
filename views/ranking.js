// views/ranking.js – View 5 «Bestenlisten»: Top 5 je Profil (schriftlich, mündlich, bbz-Award). Hier erscheinen Namen.

import { rankingTables, awardDossierTable } from './tables.js';
import { renderTable, section, hinted, el } from './common.js';
import { MODE, SMALL_N } from '../metrics.js';

export const id = 'bestenlisten';
export const label = 'Bestenlisten';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)
export const intro = 'Top-Listen je Profil für bbz-Award, schriftliche und mündliche Prüfung mit Begründung je Rang; mit Namen, nur intern.';
export const glossar = 'bbz-Award';

// Raster der Listen je Profil (Paket B, B3): Gruppen unter der Mindestgrösse bekommen keine eigene Tabelle mehr,
// sondern zusammen eine Zeile. Mit einem Institut-Filter waren sonst zwölf von sechzehn Tabellen leer – über 2000 px
// Spaltenüberschriften ohne einen einzigen Wert.
function grid(groups) {
  if (!groups.length) return el('p', { class: 'empty', text: 'Keine Vorgänge im aktiven Filter.' });
  const listen = groups.filter((g) => !g.suppressed);
  const zuKlein = groups.filter((g) => g.suppressed);
  const nodes = [];
  if (listen.length) {
    nodes.push(el('div', { class: 'ranking-grid' }, listen.map((g) => renderTable({ ...g, title: g.profil + ' (n = ' + g.n + ', Top ' + g.k + ')' }))));
  }
  if (zuKlein.length) {
    nodes.push(el('p', { class: 'empty', text: 'Keine Bestenliste für ' + zuKlein.map((g) => g.profil).join(', ') + ' – Gruppen unter n = ' + SMALL_N + ' im aktiven Filter.' }));
  }
  return nodes.length === 1 ? nodes[0] : el('div', {}, nodes);
}

export function build(ctx) {
  const r = rankingTables(ctx.persons, ctx.mode, 5);
  const dossier = awardDossierTable(ctx.persons, ctx.mode, 5);
  const modeSelect = el('select', { onchange: (ev) => ctx.onModeChange && ctx.onModeChange(ev.target.value) }, [
    el('option', { value: MODE.ERSTVERSUCH, text: 'Resultat 1. Versuch' }),
    el('option', { value: MODE.BESTANDEN, text: 'Resultat bestandener Run' }),
  ]);
  modeSelect.value = ctx.mode;
  const hints = ['Wertung: gilt für alle drei Listen und bestimmt, welches Prüfungsresultat je Teilprüfung in die Wertung eingeht.'];
  const sec = hinted(hints);
  return {
    nodes: [
      el('div', { class: 'toolbar' }, [el('label', { class: 'inline' }, ['Wertung ', modeSelect])]),
      sec('bbz-Award (0.5 · schriftlich + 0.5 · mündlich)', [grid(r.award)],
        'Rangliste je Profil über Zertifizierungsvorgänge; nur Vorgänge mit bestandener mündlicher Prüfung. Eine Person mit mehreren Profilen erscheint je Profil mit dem jeweiligen Vorgang. Tie-Break 1: weniger Prüfungsversuche gesamt, Tie-Break 2: früheres Referenzdatum. Mindestgruppengrösse ' + SMALL_N + ' Vorgänge; die Liste umfasst höchstens die Hälfte der Gruppe (maximal 5), damit sie nie zur vollständigen Rangliste wird. Versuchsmodus: ' + (ctx.modeLabel || ctx.mode) + '.'),
      sec('Award-Dossier: Begründung je Rang', [renderTable(dossier, { caption: false })],
        'Vorschlagsliste für die Prämierung mit nachvollziehbarer Begründung: warum steht ein Vorgang vor dem nächsten (Score, Tie-Break 1, Tie-Break 2 oder fachlich unentschiedener Gleichstand). Im Export als eigenes Blatt «Award-Dossier».'),
      section('Beste schriftliche Prüfung', [grid(r.written)]),
      section('Beste mündliche Prüfung', [grid(r.oral)]),
    ],
    tables: [dossier].concat(r.award, r.written, r.oral),
    hints,
  };
}
