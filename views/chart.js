// views/chart.js – Liniendiagramm (Zeitverlauf) als Inline-SVG ohne Bibliothek. Nur Rendering; Werte kommen aus metrics/tables.
// Gestaltung: 2px-Linien, Marker r = 4 mit Ring in Oberflächenfarbe, haarfeine durchgezogene Gitterlinien, eine Achse,
// Legende bei ≥ 2 Reihen, sparsame Direktbeschriftung am Linienende, Fadenkreuz-Tooltip über alle Reihen
// (auch per Tastatur: Pfeiltasten), Tabellen-Zwilling in der Ansicht. Reihenfarben: CSS-Variablen --series-1 … --series-3.

import { el } from './common.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function text(x, y, content, cls, anchor = 'start') {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = content;
  return t;
}

// series: [{ label, short?, points: [{ x: string, y: number|null, n: number, small: boolean }] }] – gleiche x-Reihenfolge je Reihe;
// short = Kurzbezeichnung für die Direktbeschriftung am Linienende (die Legende trägt den vollen Namen)
// options: { title, yFormat(v) → string, yMax = 1, height = 260, ariaLabel, compact }
// compact (Phone, PROMPT-2 B.2): Breite 360, Höhe 200, kleiner Rand ohne Endbeschriftung; Tooltip unter dem Diagramm (CSS .viz.compact)
export function renderLineChart(series, { title = '', yFormat = (v) => String(v), yMax = 1, height = 260, ariaLabel = '', compact = false } = {}) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  const width = compact ? 360 : 820;
  const pad = compact ? { top: 12, right: 16, bottom: 30, left: 40 } : { top: 16, right: 250, bottom: 34, left: 48 };
  if (compact) height = 200;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xPos = (i) => pad.left + (xs.length === 1 ? plotW / 2 : (plotW * i) / (xs.length - 1));
  const yPos = (v) => pad.top + plotH - (plotH * v) / yMax;
  const root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'viz-svg', role: 'img', 'aria-label': ariaLabel || title, tabindex: 0 });
  if (title) root.appendChild(svg('title', {}, [document.createTextNode(title)]));

  // Gitter und Achsen (haarfein, durchgezogen)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  for (const tv of ticks) {
    root.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: yPos(tv), y2: yPos(tv), class: tv === 0 ? 'viz-axis' : 'viz-grid' }));
    root.appendChild(text(pad.left - 8, yPos(tv) + 4, yFormat(tv), 'viz-tick', 'end'));
  }
  xs.forEach((x, i) => root.appendChild(text(xPos(i), height - pad.bottom + 18, x, 'viz-tick', 'middle')));

  // Reihen
  const endLabels = [];
  series.forEach((s, si) => {
    const color = 'var(--series-' + (si + 1) + ')';
    const pts = s.points.map((p, i) => ({ ...p, i, px: xPos(xs.indexOf(p.x)), py: p.y === null || p.y === undefined ? null : yPos(p.y) }));
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (p.py === null) { pen = false; continue; }
      d += (pen ? ' L ' : ' M ') + p.px.toFixed(1) + ' ' + p.py.toFixed(1);
      pen = true;
    }
    if (d) root.appendChild(svg('path', { d: d.trim(), class: 'viz-line', style: 'stroke:' + color }));
    for (const p of pts) {
      if (p.py === null) continue;
      // Ring in Oberflächenfarbe, dann Marker; kleine Gruppen (n < 5) hohl
      root.appendChild(svg('circle', { cx: p.px, cy: p.py, r: 6, class: 'viz-ring' }));
      root.appendChild(svg('circle', { cx: p.px, cy: p.py, r: 4, class: 'viz-dot' + (p.small ? ' small' : ''), style: p.small ? 'stroke:' + color : 'fill:' + color }));
    }
    const last = [...pts].reverse().find((p) => p.py !== null);
    if (last) endLabels.push({ y: last.py, x: last.px, label: s.short || s.label, value: yFormat(last.y), color });
  });

  // Direktbeschriftung am Linienende (Textfarbe = Text-Token; Farbe nur über den kurzen Linienschlüssel); nicht in compact
  endLabels.sort((a, b) => a.y - b.y);
  let prevY = -Infinity;
  for (const e of compact ? [] : endLabels) {
    const y = Math.max(e.y, prevY + 14);
    prevY = y;
    const x = width - pad.right + 10;
    root.appendChild(svg('line', { x1: e.x + 8, x2: x - 4, y1: e.y, y2: y, class: 'viz-leader' }));
    root.appendChild(svg('line', { x1: x, x2: x + 14, y1: y, y2: y, class: 'viz-key', style: 'stroke:' + e.color }));
    root.appendChild(text(x + 18, y + 4, e.value + ' ' + e.label, 'viz-label'));
  }

  // Fadenkreuz + Tooltip (alle Reihen am nächsten x), auch per Tastatur
  const cross = svg('line', { x1: 0, x2: 0, y1: pad.top, y2: height - pad.bottom, class: 'viz-cross', visibility: 'hidden' });
  root.appendChild(cross);
  const tip = el('div', { class: 'viz-tip', hidden: true, role: 'status' });
  const figure = el('figure', { class: 'viz' + (compact ? ' compact' : '') }, [root, tip]);
  let current = -1;
  const show = (i) => {
    if (i < 0 || i >= xs.length) return;
    current = i;
    cross.setAttribute('x1', xPos(i));
    cross.setAttribute('x2', xPos(i));
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('div', { class: 'viz-tip-x', text: xs[i] }), ...series.map((s, si) => {
      const p = s.points.find((q) => q.x === xs[i]);
      const value = p && p.y !== null && p.y !== undefined ? yFormat(p.y) + (p.small ? ' *' : '') : '–';
      return el('div', { class: 'viz-tip-row' }, [
        el('span', { class: 'viz-tip-key', style: 'background:var(--series-' + (si + 1) + ')' }),
        el('strong', { text: value }),
        el('span', { class: 'viz-tip-label', text: s.label + (p && p.n !== undefined ? ' (n = ' + p.n + ')' : '') }),
      ]);
    }));
    tip.hidden = false;
    const rect = root.getBoundingClientRect();
    const left = (xPos(i) / width) * rect.width;
    tip.style.left = Math.min(Math.max(0, left + 12), Math.max(0, rect.width - 240)) + 'px';
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; current = -1; };
  root.addEventListener('pointermove', (ev) => {
    const rect = root.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * width;
    let best = 0;
    xs.forEach((_, i) => { if (Math.abs(xPos(i) - x) < Math.abs(xPos(best) - x)) best = i; });
    show(best);
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focus', () => show(current < 0 ? xs.length - 1 : current));
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { show(Math.max(0, current - 1)); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { show(Math.min(xs.length - 1, current + 1)); ev.preventDefault(); }
  });

  // Legende (immer bei ≥ 2 Reihen)
  if (series.length >= 2) {
    figure.appendChild(el('div', { class: 'viz-legend' }, series.map((s, si) => el('span', { class: 'viz-legend-item' }, [
      el('span', { class: 'viz-key-box', style: 'background:var(--series-' + (si + 1) + ')' }), s.label,
    ]))));
  }
  if (title) figure.appendChild(el('figcaption', { text: title + ' · * Jahr mit n < 5 Vorgängen (hohler Marker)' }));
  return figure;
}
