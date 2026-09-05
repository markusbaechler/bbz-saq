// views/ranking.js – View 5 «Bestenlisten»: Top 5 je Profil (schriftlich, mündlich, bbz-Award). Hier erscheinen Namen.

import { rankingTables } from './tables.js';
import { renderTable, section, el } from './common.js';

export const id = 'bestenlisten';
export const label = 'Bestenlisten';

function grid(groups) {
  if (!groups.length) return el('p', { class: 'empty', text: 'Keine Personen im aktiven Filter.' });
  return el('div', { class: 'ranking-grid' }, groups.map((g) => {
    const wrap = renderTable({ ...g, title: g.profil + ' (n = ' + g.n + ')' });
    return wrap;
  }));
}

export function build(ctx) {
  const r = rankingTables(ctx.persons, ctx.mode, 5);
  return {
    nodes: [
      section('bbz-Award (0.5 · schriftlich + 0.5 · mündlich)', [grid(r.award)], {
        intro: 'Nur Personen mit bestandener mündlicher Prüfung. Tie-Break 1: weniger Prüfungsversuche gesamt, Tie-Break 2: früheres Referenzdatum. Versuchsmodus: ' + (ctx.modeLabel || ctx.mode) + '.',
      }),
      section('Beste schriftliche Prüfung', [grid(r.written)]),
      section('Beste mündliche Prüfung', [grid(r.oral)]),
    ],
    tables: r.award.concat(r.written, r.oral),
  };
}
