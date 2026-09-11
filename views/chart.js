// views/chart.js – Liniendiagramm (Zeitverlauf) und Balkendiagramm (Histogramm der Resultate, Paket G) als Inline-SVG ohne Bibliothek.
// Nur Rendering; Werte kommen aus metrics/tables.
// Gestaltung: 2px-Linien, Marker r = 4 mit Ring in Oberflächenfarbe, haarfeine durchgezogene Gitterlinien, eine Achse,
// Legende bei ≥ 2 Reihen, sparsame Direktbeschriftung am Linienende, Fadenkreuz-Tooltip über alle Reihen
// (auch per Tastatur: Pfeiltasten), Tabellen-Zwilling in der Ansicht. Reihenfarben: CSS-Variablen --series-1 … --series-3.

import { el, isPhone } from './common.js';
import { SMALL_MARK } from './tables.js';
import { SMALL_N, formatPct } from '../metrics.js';

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

// Marker: Kreis für abgeschlossene Jahre, Raute für das laufende. Gleiche optische Grösse, klar unterscheidbar –
// und unterscheidbar vom hohlen Marker, der weiterhin «n < 5» heisst.
function marker(x, y, r, raute, attrs) {
  if (!raute) return svg('circle', { cx: x, cy: y, r, ...attrs });
  const d = r * 1.25;
  return svg('polygon', { points: [[x, y - d], [x + d, y], [x, y + d], [x - d, y]].map((p) => p.join(',')).join(' '), ...attrs });
}

function text(x, y, content, cls, anchor = 'start') {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = content;
  return t;
}

// Y-Achse des Liniendiagramms (Paket B, B1): Von null zu rechnen drängt Quoten, die real zwischen 66 % und 100 % liegen,
// ins obere Drittel und verdeckt jede Bewegung. Die Achse folgt deshalb dem Wertebereich der Daten.
// Nur für Linien – Balken brauchen den Nullpunkt, sonst verzerrt die gekappte Achse die Längenverhältnisse (renderBarChart
// bleibt unverändert). Dass die Achse nicht bei null beginnt, steht sichtbar über dem Diagramm.
const Y_STEP = 0.05;       // Achsenbeginn immer auf einer 5-%-Stufe
const Y_MIN_SPAN = 0.10;   // mindestens 10 pp Spanne, sonst zeigt das Diagramm Rauschen als Bewegung
const Y_TICK_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5];
const round3 = (v) => Math.round(v * 1000) / 1000;

// Kleinster Wert der Reihen, auf die nächste 5-%-Stufe abgerundet; nie über yMax − 10 pp, nie unter 0.
// Ohne Werte → 0. Reihen, die bis nahe null reichen, ergeben 0 – dann ist der Nullpunkt der Wertebereich.
export function autoYMin(series, yMax = 1) {
  const values = (series || []).flatMap((s) => (s.points || []).map((p) => p.y)).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) return 0;
  const floored = Math.floor(Math.min(...values) / Y_STEP + 1e-9) * Y_STEP;
  return round3(Math.min(Math.max(0, floored), Math.max(0, yMax - Y_MIN_SPAN)));
}

// Achsenbeginn plus die runden Vielfachen der Schrittweite darüber; höchstens sechs Abschnitte, damit das Gitter ruhig bleibt.
// Der erste Eintrag ist immer yMin: Er trägt die Achsenlinie und sagt, wo die Achse beginnt.
export function yTicks(yMin, yMax) {
  const span = Math.max(0, yMax - yMin);
  const step = Y_TICK_STEPS.find((c) => span / c <= 6 + 1e-9) || Y_TICK_STEPS[Y_TICK_STEPS.length - 1];
  const out = [round3(yMin)];
  for (let t = Math.ceil((yMin + 1e-9) / step) * step; t <= yMax + 1e-9; t += step) {
    const v = round3(t);
    if (v > yMin + 1e-9) out.push(v);
  }
  return out;
}

// Direktbeschriftung am Linienende (Paket B, B2): Sie trägt nur noch den Wert. Den Reihennamen nennt die Legende
// darunter ohnehin – ihn am Linienende zu wiederholen kostete 250 von 820 Einheiten Breite, also 30 % der Zeichenfläche.
// Der Rand rechts wird jetzt aus der Länge der Werte berechnet. Die Legende bleibt: Sie ist der verlässliche
// Identitätskanal, gerade für Farbfehlsichtige; die Direktbeschriftung ergänzt sie, ersetzt sie nicht.
const LABEL_KEY_W = 14;    // kurzer Linienschlüssel in Reihenfarbe
const LABEL_CHAR_W = 7;    // Breite je Zeichen bei 12px System-Schrift (grosszügig, damit nichts aus der viewBox ragt)
const LABEL_PAD = 26;      // Abstand Plot → Schlüssel → Text → rechter Rand

// Rand rechts für die Endbeschriftungen: so breit, wie der längste Wert ihn braucht. Ohne Werte bleibt nur der Rand,
// den die letzte x-Beschriftung zum Nichtüberlaufen braucht.
export function endLabelGutter(values) {
  const list = (values || []).filter(Boolean);
  return list.length ? LABEL_PAD + LABEL_KEY_W + Math.ceil(Math.max(...list.map((v) => v.length)) * LABEL_CHAR_W) : 24;
}

// series: [{ label, points: [{ x: string, y: number|null, n: number, small: boolean }] }] – gleiche x-Reihenfolge je Reihe
// options: { title, yFormat(v) → string, yMin = null (aus den Daten), yMax = 1, height = 260, ariaLabel, compact }
// compact (Phone, PROMPT-2 B.2): Breite 360, Höhe 200, kleiner Rand ohne Endbeschriftung; Tooltip unter dem Diagramm (CSS .viz.compact)
export function renderLineChart(series, { title = '', yFormat = (v) => String(v), yMin = null, yMax = 1, height = 260, ariaLabel = '', compact = false } = {}) {
  const y0 = yMin === null || yMin === undefined ? autoYMin(series, yMax) : yMin;
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  const width = compact ? 360 : 820;
  // Rand rechts = genau so breit, wie die längste Endbeschriftung ihn braucht (B2); auf dem Phone gibt es keine
  const endValues = compact ? [] : series.map((s) => {
    const last = [...s.points].reverse().find((p) => p.y !== null && p.y !== undefined);
    return last ? yFormat(last.y) : '';
  }).filter(Boolean);
  const labelW = endLabelGutter(endValues);
  const pad = compact ? { top: 12, right: 16, bottom: 30, left: 40 } : { top: 16, right: labelW, bottom: 34, left: 48 };
  if (compact) height = 200;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xPos = (i) => pad.left + (xs.length === 1 ? plotW / 2 : (plotW * i) / (xs.length - 1));
  const span = Math.max(yMax - y0, 1e-9);
  const yPos = (v) => pad.top + plotH - (plotH * (v - y0)) / span;
  const achsenhinweis = y0 > 0 ? 'Achse beginnt bei ' + yFormat(y0) + ' – der Wertebereich der Daten. Kein Nullpunkt.' : '';
  const root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'viz-svg', role: 'img', 'aria-label': (ariaLabel || title) + (achsenhinweis ? ' – ' + achsenhinweis : ''), tabindex: 0 });
  if (title) root.appendChild(svg('title', {}, [document.createTextNode(title)]));

  // Gitter und Achsen (haarfein, durchgezogen); die unterste Linie ist die Achse und liegt auf yMin
  const ticks = yTicks(y0, yMax);
  for (const tv of ticks) {
    root.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: yPos(tv), y2: yPos(tv), class: tv === ticks[0] ? 'viz-axis' : 'viz-grid' }));
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
    let dLaufend = ''; // das Stück ins laufende Jahr: gestrichelt, weil der Punkt dahinter noch wandert
    for (const p of pts) {
      if (p.py === null) { pen = false; continue; }
      const ziel = ' ' + p.px.toFixed(1) + ' ' + p.py.toFixed(1);
      if (pen && p.laufend) {
        const vor = pts[pts.indexOf(p) - 1];
        dLaufend += ' M ' + vor.px.toFixed(1) + ' ' + vor.py.toFixed(1) + ' L' + ziel;
      } else {
        d += (pen ? ' L' : ' M') + ziel;
      }
      pen = true;
    }
    if (d) root.appendChild(svg('path', { d: d.trim(), class: 'viz-line', style: 'stroke:' + color }));
    if (dLaufend) root.appendChild(svg('path', { d: dLaufend.trim(), class: 'viz-line viz-line-laufend', style: 'stroke:' + color }));
    for (const p of pts) {
      if (p.py === null) continue;
      // Ring in Oberflächenfarbe, dann Marker. Zwei Eigenschaften, zwei Mittel, damit sie nicht verwechselt werden:
      // FORM sagt, ob das Jahr abgeschlossen ist (Kreis) oder noch läuft (Raute, Paket H); FÜLLUNG sagt, ob die
      // Gruppe gross genug ist (gefüllt) oder unter SMALL_N liegt (hohl). Beides zusammen ist lesbar: hohle Raute.
      root.appendChild(marker(p.px, p.py, 6, p.laufend, { class: 'viz-ring' }));
      root.appendChild(marker(p.px, p.py, 4, p.laufend, { class: 'viz-dot' + (p.small ? ' small' : ''), style: p.small ? 'stroke:' + color : 'fill:' + color }));
    }
    const last = [...pts].reverse().find((p) => p.py !== null);
    if (last) endLabels.push({ y: last.py, x: last.px, value: yFormat(last.y), color });
  });

  // Direktbeschriftung am Linienende: nur der Wert (B2); der Reihenname steht in der Legende. Nicht in compact.
  endLabels.sort((a, b) => a.y - b.y);
  let prevY = -Infinity;
  for (const e of compact ? [] : endLabels) {
    const y = Math.max(e.y, prevY + 14);
    prevY = y;
    const x = width - pad.right + 10;
    root.appendChild(svg('line', { x1: e.x + 8, x2: x - 4, y1: e.y, y2: y, class: 'viz-leader' }));
    root.appendChild(svg('line', { x1: x, x2: x + LABEL_KEY_W, y1: y, y2: y, class: 'viz-key', style: 'stroke:' + e.color }));
    root.appendChild(text(x + LABEL_KEY_W + 4, y + 4, e.value, 'viz-label'));
  }

  // Fadenkreuz + Tooltip (alle Reihen am nächsten x, auch per Tastatur) und Legende: gemeinsame Bausteine unten (Paket G)
  const cross = svg('line', { x1: 0, x2: 0, y1: pad.top, y2: height - pad.bottom, class: 'viz-cross', visibility: 'hidden' });
  root.appendChild(cross);
  // Der Achsenhinweis steht sichtbar über dem Diagramm, nicht in der eingeklappten Legende: Wer die Kurve sieht,
  // muss zugleich sehen, dass die Fläche unter ihr fehlt.
  const figure = el('figure', { class: 'viz' + (compact ? ' compact' : '') },
    [achsenhinweis ? el('p', { class: 'viz-subtitle', text: achsenhinweis }) : null, root].filter(Boolean));
  attachTooltip(root, figure, { xs, xPos, series, yFormat, width, cross });
  const leg = legend(series);
  if (leg) figure.appendChild(leg);
  if (title) {
    const laufend = series.some((r) => (r.points || []).some((p) => p.laufend));
    figure.appendChild(el('figcaption', {
      text: title + ' · hohler Marker: n < 5 Vorgänge'
        + (laufend ? ' · Raute und gestrichelte Linie: Jahr läuft noch, unvollständig' : ''),
    }));
  }
  return figure;
}

// Gemeinsame Bausteine der Diagramme (Paket G): Tooltip mit Fadenkreuz (Zeiger und Tastatur) und Legende
// series wie oben; xs = Kategorien in Reihenfolge, xPos(i) = x-Mitte der Kategorie i im viewBox-Mass, width = viewBox-Breite
function attachTooltip(root, figure, { xs, xPos, series, yFormat, width, cross }) {
  const tip = el('div', { class: 'viz-tip', hidden: true, role: 'status' });
  figure.appendChild(tip);
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
}

// Legende (immer bei ≥ 2 Reihen)
function legend(series) {
  if (series.length < 2) return null;
  return el('div', { class: 'viz-legend' }, series.map((s, si) => el('span', { class: 'viz-legend-item' }, [
    el('span', { class: 'viz-key-box', style: 'background:var(--series-' + (si + 1) + ')' }), s.label,
  ])));
}

// Balkendiagramm (PROMPT-2 Paket G, Stufe 4): Gruppen je Kategorie (x), ein Balken je Reihe; dieselben Konventionen wie das
// Liniendiagramm (Tokens, Gitter, eine Achse, Legende, Tooltip mit Tastatur, Tabellen-Zwilling in der Ansicht).
// series: [{ label, points: [{ x, y: number|null, n }] }] – Anteile 0..1; yMax = null → kleinste Skala aus 20/40/60/80/100 %,
// damit die Viertel-Ticks auf 5-%-Schritten liegen. compact (Phone): 360 × 200, jede zweite Kategorie beschriftet.
export function renderBarChart(series, { title = '', yFormat = (v) => String(v), yMax = null, height = 260, ariaLabel = '', compact = false } = {}) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  const width = compact ? 360 : 820;
  const pad = compact ? { top: 12, right: 12, bottom: 30, left: 40 } : { top: 16, right: 24, bottom: 34, left: 48 };
  if (compact) height = 200;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxY = Math.max(0, ...series.flatMap((s) => s.points.map((p) => (p.y === null || p.y === undefined ? 0 : p.y))));
  if (yMax === null) yMax = [0.2, 0.4, 0.6, 0.8, 1].find((m) => m >= maxY - 1e-9) || 1;
  const groupW = plotW / Math.max(1, xs.length);
  const barW = (groupW * 0.72) / Math.max(1, series.length);
  const xPos = (i) => pad.left + groupW * (i + 0.5);
  const yPos = (v) => pad.top + plotH - (plotH * v) / yMax;
  const root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'viz-svg viz-bars', role: 'img', 'aria-label': ariaLabel || title, tabindex: 0 });
  if (title) root.appendChild(svg('title', {}, [document.createTextNode(title)]));

  // Gitter und Achsen wie im Liniendiagramm
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  for (const tv of ticks) {
    root.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: yPos(tv), y2: yPos(tv), class: tv === 0 ? 'viz-axis' : 'viz-grid' }));
    root.appendChild(text(pad.left - 8, yPos(tv) + 4, yFormat(tv), 'viz-tick', 'end'));
  }
  xs.forEach((x, i) => {
    if (compact && i % 2 === 1) return; // Phone: jede zweite Klasse, sonst überlappen die Beschriftungen
    root.appendChild(text(xPos(i), height - pad.bottom + 18, x, 'viz-tick', 'middle'));
  });

  // Balken: je Kategorie eine Gruppe, Reihen nebeneinander; Farbe über --series-n
  series.forEach((s, si) => {
    const color = 'var(--series-' + (si + 1) + ')';
    for (const p of s.points) {
      const i = xs.indexOf(p.x);
      if (i < 0 || p.y === null || p.y === undefined) continue;
      const h = (plotH * Math.min(p.y, yMax)) / yMax;
      const x = pad.left + groupW * i + (groupW - barW * series.length) / 2 + barW * si;
      root.appendChild(svg('rect', { x: x.toFixed(1), y: (pad.top + plotH - h).toFixed(1), width: barW.toFixed(1), height: h.toFixed(1), class: 'viz-bar', style: 'fill:' + color }));
    }
  });

  const cross = svg('line', { x1: 0, x2: 0, y1: pad.top, y2: height - pad.bottom, class: 'viz-cross', visibility: 'hidden' });
  root.appendChild(cross);
  const figure = el('figure', { class: 'viz' + (compact ? ' compact' : '') }, [root]);
  attachTooltip(root, figure, { xs, xPos, series, yFormat, width, cross });
  const leg = legend(series);
  if (leg) figure.appendChild(leg);
  if (title) figure.appendChild(el('figcaption', { text: title + ' · Anteil der Vorgänge je Klasse à 10 Prozentpunkte' }));
  return figure;
}

// ---------------------------------------------------------------------------
// Punktdiagramm (Paket MESSZEILE, M2): eine Quote je Gruppe als Punkt mit 95-%-Wilson-Balken, dazu eine senkrechte
// Linie auf dem Gesamtwert. Überlappt der Balken die Linie nicht, ist die Abweichung gesichert – das ist die ganze
// Ablesung, ohne Tabelle und ohne p-Wert. Sechs Zeilen ersetzen damit die achtspaltige Profiltabelle; die Tabelle
// bleibt als Zwilling darunter und im Export stehen.
// Konventionen wie bei Linie und Balken: eine Achse, Direktbeschriftung an jedem Punkt (n und Differenz in pp),
// Legende, Text nie in der Datenfarbe, kleine Gruppen markiert statt weggelassen.
// ---------------------------------------------------------------------------

const dcNum = (v) => typeof v === 'number' && Number.isFinite(v);
const dcPp = (v) => Math.round(v * 10) / 10;

// Reines Modell: Positionen in Prozent der Plotbreite, Beschriftungen als Text. Ohne DOM prüfbar.
// points: [{ label, pct, n, low, high, small }] – low/high aus wilsonInterval(); referenz: { pct, label }
// richtung: 'up' = höher ist besser, 'down' = tiefer ist besser (Durchfallquoten), 'neutral' = ohne Wertung.
// Ohne sie liest sich «+27.9 pp · gesichert» wie eine gute Nachricht, obwohl auf einer Durchfallquote das Gegenteil
// gilt. Die Messzeile kennt das Feld seit Paket MESSZEILE; hier fehlte es.
export function dotChartModel(points, { referenz = null, xMax = 1, richtung = 'up' } = {}) {
  const liste = (points || []).filter((p) => p && dcNum(p.pct));
  const werte = liste.flatMap((p) => [p.pct, p.low, p.high]).filter(dcNum);
  if (referenz && dcNum(referenz.pct)) werte.push(referenz.pct);
  const xMin = autoYMin([{ points: werte.map((v) => ({ y: v })) }], xMax);
  const span = Math.max(xMax - xMin, 1e-9);
  const pos = (v) => Math.max(0, Math.min(100, ((v - xMin) / span) * 100));
  const ref = referenz && dcNum(referenz.pct) ? { pct: referenz.pct, label: referenz.label || 'Gesamt', x: pos(referenz.pct) } : null;
  return {
    xMin,
    xMax,
    ticks: yTicks(xMin, xMax),
    referenz: ref,
    zeilen: liste.map((p) => {
      const hatIv = dcNum(p.low) && dcNum(p.high);
      const diff = ref ? dcPp((p.pct - ref.pct) * 100) : null;
      // Gesichert heisst: Das Intervall enthält den Gesamtwert nicht – dieselbe Lesart wie in den Signalen
      const gesichert = !!(ref && hatIv && (p.high < ref.pct || p.low > ref.pct));
      // Wertung nur, wenn sie etwas heisst: mit Richtung, mit Abstand und ab derselben Schwelle wie überall (0.5 pp)
      const guenstig = richtung === 'down' ? -1 : richtung === 'up' ? 1 : 0;
      const bewertung = diff === null || !guenstig || Math.abs(diff) < 0.5 ? null : (diff * guenstig > 0 ? 'günstig' : 'ungünstig');
      return {
        label: p.label,
        n: p.n || 0,
        small: !!p.small,
        pct: p.pct,
        x: pos(p.pct),
        intervall: hatIv ? { low: p.low, high: p.high, von: pos(p.low), bis: pos(p.high) } : null,
        diffPp: diff,
        gesichert,
        bewertung,
        // «gesichert» allein sagt nur, DASS der Abstand echt ist, nicht ob er gut oder schlecht ist. Deshalb steht
        // die Wertung als Wort daneben, sobald der Abstand gesichert ist – Farbe allein trägt sie nie.
        text: ['n = ' + (p.n || 0), diff === null ? null : (diff > 0 ? '+' : diff < 0 ? '−' : '±') + Math.abs(diff).toFixed(1) + ' pp',
          gesichert ? 'gesichert' + (bewertung ? ' ' + bewertung : '') : null]
          .filter(Boolean).join(' · ') + (p.small ? ' ' + SMALL_MARK : ''),
      };
    }),
  };
}

// Punktdiagramm rendern. points/referenz wie oben; yFormat formatiert die Achse.
export function renderDotChart(points, { title = '', yFormat = (v) => String(v), xMax = 1, referenz = null, ariaLabel = '', compact = false, richtung = 'up' } = {}) {
  const modell = dotChartModel(points, { referenz, xMax, richtung });
  const width = compact ? 360 : 820;
  const zeileH = compact ? 26 : 30;
  const pad = compact
    ? { top: 22, right: 12, bottom: 30, left: 70 }
    : { top: 24, right: 150, bottom: 32, left: 104 };
  const height = pad.top + pad.bottom + Math.max(1, modell.zeilen.length) * zeileH;
  const plotW = width - pad.left - pad.right;
  const xPx = (prozent) => pad.left + (plotW * prozent) / 100;
  const yPx = (i) => pad.top + zeileH * i + zeileH / 2;
  const root = svg('svg', {
    viewBox: '0 0 ' + width + ' ' + height, class: 'viz-svg viz-dots', role: 'img', tabindex: 0,
    'aria-label': ariaLabel || title,
  });
  if (title) root.appendChild(svg('title', {}, [document.createTextNode(title)]));

  // Eine Achse unten, Gitterlinien senkrecht auf den Ticks
  for (const tv of modell.ticks) {
    const x = xPx(((tv - modell.xMin) / Math.max(modell.xMax - modell.xMin, 1e-9)) * 100);
    root.appendChild(svg('line', { x1: x, x2: x, y1: pad.top - 6, y2: height - pad.bottom, class: 'viz-grid' }));
    root.appendChild(text(x, height - pad.bottom + 16, yFormat(tv), 'viz-tick', 'middle'));
  }
  root.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: height - pad.bottom, y2: height - pad.bottom, class: 'viz-axis' }));

  // Senkrechte auf dem Gesamtwert – die Bezugslinie, gegen die jeder Balken gelesen wird
  if (modell.referenz) {
    const x = xPx(modell.referenz.x);
    root.appendChild(svg('line', { x1: x, x2: x, y1: pad.top - 10, y2: height - pad.bottom, class: 'viz-ref' }));
    root.appendChild(text(x, pad.top - 14, modell.referenz.label + ' ' + yFormat(modell.referenz.pct), 'viz-tick', 'middle'));
  }

  modell.zeilen.forEach((z, i) => {
    const y = yPx(i);
    root.appendChild(text(pad.left - 10, y + 4, z.label + (z.small ? ' ' + SMALL_MARK : ''), 'viz-label', 'end'));
    if (z.intervall) {
      root.appendChild(svg('line', { x1: xPx(z.intervall.von), x2: xPx(z.intervall.bis), y1: y, y2: y, class: 'viz-ci' }));
      for (const p of [z.intervall.von, z.intervall.bis]) {
        root.appendChild(svg('line', { x1: xPx(p), x2: xPx(p), y1: y - 4, y2: y + 4, class: 'viz-ci-cap' }));
      }
    }
    root.appendChild(svg('circle', { cx: xPx(z.x), cy: y, r: 6, class: 'viz-ring' }));
    root.appendChild(svg('circle', { cx: xPx(z.x), cy: y, r: 4, class: 'viz-dot' + (z.small ? ' small' : ''), style: z.small ? 'stroke:var(--series-1)' : 'fill:var(--series-1)' }));
    if (!compact) root.appendChild(text(width - pad.right + 10, y + 4, z.text, 'viz-label' + (z.bewertung ? ' ton-' + (z.bewertung === 'günstig' ? 'pos' : 'neg') : '')));
  });

  const figure = el('figure', { class: 'viz' + (compact ? ' compact' : '') }, [root]);
  // Legende: was Punkt, Balken und Linie bedeuten. Text trägt nie die Datenfarbe.
  figure.appendChild(el('div', { class: 'viz-legend' }, [
    el('span', { class: 'viz-legend-item' }, [el('span', { class: 'viz-key-box', style: 'background:var(--series-1)' }), 'Quote der Gruppe']),
    el('span', { class: 'viz-legend-item' }, [el('span', { class: 'viz-key-ci' }), '95-%-Wilson-Intervall']),
    el('span', { class: 'viz-legend-item' }, [el('span', { class: 'viz-key-ref' }), modell.referenz ? modell.referenz.label : 'Gesamtwert']),
  ]));
  if (title) {
    figure.appendChild(el('figcaption', {
      text: title + ' · Balken ohne Berührung der Linie = gesicherter Abstand zum Gesamtwert · ' + SMALL_MARK + ' Gruppe mit n < ' + SMALL_N,
    }));
  }
  if (compact) figure.appendChild(el('p', { class: 'viz-subtitle', text: 'Zahlen je Gruppe in der Tabelle darunter.' }));
  return figure;
}

// Punktdiagramm zu einem Quoten-Modell (Paket H, H2): eine Zeile je Gruppe, Wilson-Balken, Linie auf dem
// Gesamtwert. Ohne Punkte (kein Wert im Filter) entfällt es – eine leere Achse sagt nichts.
export function punktDiagramm(modell, { compact = isPhone() } = {}) {
  if (!modell || !modell.punkte.length) return null;
  return renderDotChart(modell.punkte, {
    title: modell.titel,
    richtung: modell.richtung || 'up',
    yFormat: (v) => formatPct(v, 0),
    referenz: modell.referenz,
    compact,
    ariaLabel: 'Punktdiagramm: ' + modell.titel + ' je Gruppe mit 95-Prozent-Wilson-Intervall, senkrechte Linie auf dem Gesamtwert; alle Zahlen in der Tabelle darunter',
  });
}
