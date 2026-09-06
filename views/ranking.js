// views/ranking.js – View 5 «Bestenlisten»: Top 5 je Profil (schriftlich, mündlich, bbz-Award). Hier erscheinen Namen.

import { rankingTables, awardDossierTable } from './tables.js';
import { renderTable, section, el } from './common.js';
import { MODE, SMALL_N } from '../metrics.js';

export const id = 'bestenlisten';
export const label = 'Bestenlisten';
export const group = 'Personen'; // Navigationsgruppe (PROMPT-2 A.2)

function grid(groups) {
  if (!groups.length) return el('p', { class: 'empty', text: 'Keine Vorgänge im aktiven Filter.' });
  return el('div', { class: 'ranking-grid' }, groups.map((g) => renderTable({ ...g, title: g.profil + ' (n = ' + g.n + (g.suppressed ? ', keine Liste' : ', Top ' + g.k) + ')' })));
}

export function build(ctx) {
  const r = rankingTables(ctx.persons, ctx.mode, 5);
  const dossier = awardDossierTable(ctx.persons, ctx.mode, 5);
  const modeSelect = el('select', { onchange: (ev) => ctx.onModeChange && ctx.onModeChange(ev.target.value) }, [
    el('option', { value: MODE.ERSTVERSUCH, text: 'Resultat 1. Versuch' }),
    el('option', { value: MODE.BESTANDEN, text: 'Resultat bestandener Run' }),
  ]);
  modeSelect.value = ctx.mode;
  return {
    nodes: [
      el('div', { class: 'toolbar' }, [
        el('label', { class: 'inline' }, ['Wertung ', modeSelect]),
        el('span', { class: 'meta-list', text: 'Gilt für alle drei Listen: welches Prüfungsresultat je Teilprüfung in die Wertung eingeht.' }),
      ]),
      section('bbz-Award (0.5 · schriftlich + 0.5 · mündlich)', [grid(r.award)], {
        intro: 'Rangliste je Profil über Zertifizierungsvorgänge; nur Vorgänge mit bestandener mündlicher Prüfung. Eine Person mit mehreren Profilen erscheint je Profil mit dem jeweiligen Vorgang. Tie-Break 1: weniger Prüfungsversuche gesamt, Tie-Break 2: früheres Referenzdatum. Mindestgruppengrösse ' + SMALL_N + ' Vorgänge; die Liste umfasst höchstens die Hälfte der Gruppe (maximal 5), damit sie nie zur vollständigen Rangliste wird. Versuchsmodus: ' + (ctx.modeLabel || ctx.mode) + '.',
      }),
      section('Award-Dossier: Begründung je Rang', [renderTable(dossier, { caption: false })], {
        intro: 'Vorschlagsliste für die Prämierung mit nachvollziehbarer Begründung: warum steht ein Vorgang vor dem nächsten (Score, Tie-Break 1, Tie-Break 2 oder fachlich unentschiedener Gleichstand). Im Export als eigenes Blatt «Award-Dossier».',
      }),
      section('Beste schriftliche Prüfung', [grid(r.written)]),
      section('Beste mündliche Prüfung', [grid(r.oral)]),
    ],
    tables: [dossier].concat(r.award, r.written, r.oral),
  };
}
