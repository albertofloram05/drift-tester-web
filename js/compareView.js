// Modo comparación (v1.6.0): pintado del comparador. La lógica (cálculos, textos) está en compare.js.
// Todo el texto entra con textContent: ningún dato guardado se interpreta como HTML.
import { METRICS, NA, computeDiffs, formatValue, formatDiff, formatPct,
         buildSeries, buildChart, timeTicks, formatTickTime, decimalsForStep, chartEmptyText, chartNotes } from './compare.js';
import { VERDICT } from './render.js';

function span(className, text) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

/** Texto de una diferencia: «+0.0050 (+50.0 %)», «+0.0050» si no hay porcentaje con sentido, o «No disponible». */
export function diffText(d, metric) {
  if (d.abs === null) return NA;
  return d.pct === null ? formatDiff(d, metric) : `${formatDiff(d, metric)} (${formatPct(d)})`;
}

/** Nombre corto para listas: el nombre personalizado o, si no hay, el del modelo (recortado). */
function padName(it) {
  const t = it.label || it.gamepad || '';
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
}

/** Rellena el desplegable de referencia con las filas comparadas. */
export function renderReferenceSelect(select, items, refKey) {
  select.replaceChildren();
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.key;
    o.textContent = `${it.dateTime} · ${it.stick}` + (padName(it) ? ` · ${padName(it)}` : '');
    select.append(o);
  }
  select.value = refKey;
}

/** Lista de avisos de interpretación (se oculta si no hay ninguno). */
export function renderNotes(ul, notes) {
  ul.replaceChildren();
  for (const n of notes) {
    const li = document.createElement('li');
    li.textContent = n;
    ul.append(li);
  }
  ul.hidden = notes.length === 0;
}

/**
 * Tabla comparativa: una fila por elemento, en orden cronológico. Cada métrica lleva su valor y,
 * debajo, la diferencia con la fila de referencia (la propia referencia lleva una etiqueta, no diferencias).
 */
export function renderCompareTable(tbody, items, refKey) {
  tbody.replaceChildren();
  const diffs = computeDiffs(items, refKey);

  for (const it of items) {
    const isRef = it.key === refKey;
    const tr = document.createElement('tr');
    if (isRef) tr.className = 'ref';

    const cell = (content, className = '') => {
      const td = document.createElement('td');
      if (className) td.className = className;
      if (typeof content === 'string') td.textContent = content;
      else td.append(...content);
      return td;
    };

    const level = document.createElement('span');
    level.className = it.level ? `hist-level ${it.level.toLowerCase()}` : '';
    level.textContent = it.level ? (VERDICT[it.level] ?? it.level) : NA;

    tr.append(
      cell(isRef ? [it.dateTime, span('cmp-ref', 'Referencia')] : it.dateTime),
      cell(it.stick),
      cell(padName(it) || '—', 'gamepad'),
      cell(it.threshold === null ? NA : it.threshold.toFixed(3), 'num'),
      cell([level]),
    );

    for (const m of METRICS) {
      const parts = [span('cmp-val', formatValue(it[m.key], m))];
      if (!isRef) parts.push(span('cmp-diff', `Dif.: ${diffText(diffs.get(it.key)[m.key], m)}`));
      tr.append(cell(parts, 'num'));
    }
    tbody.append(tr);
  }
}

// ---------- Gráficas (SVG propio, sin librerías) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIDE_NAME = { left: 'izquierdo', right: 'derecho' };

function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Dibuja en 'container' la evolución de una métrica: una serie por stick (nunca se unen sticks distintos),
 * distinguidos por color, forma del marcador y trazo (continuo / discontinuo), no solo por color.
 * 'width' son los píxeles disponibles; la gráfica se dibuja 1:1 para que el texto sea legible también en móvil.
 */
export function renderChart(container, items, metricKey, { idPrefix = 'chart', width = 640 } = {}) {
  container.replaceChildren();
  const metric = METRICS.find(m => m.key === metricKey);
  const series = buildSeries(items, metricKey);

  const title = document.createElement('h3');
  title.className = 'chart-title';
  title.textContent = `${metric.label} a lo largo del tiempo`;
  container.append(title);

  const model = buildChart(series, metricKey);
  if (!model) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = chartEmptyText(series);
    container.append(p);
    return;
  }

  const W = Math.max(300, Math.round(width));
  const H = W < 480 ? 230 : 280;
  const m = { l: 58, r: 16, t: 12, b: 38 };
  const pad = 14;                                        // aire a los lados para que los marcadores no se corten
  const plotW = W - m.l - m.r - 2 * pad;
  const plotH = H - m.t - m.b;
  const { t0, t1, y } = model;
  const range = t1 - t0;
  const xPos = t => (range > 0 ? m.l + pad + ((t - t0) / range) * plotW : m.l + pad + plotW / 2);
  const yPos = v => m.t + (1 - (v - y.min) / (y.max - y.min)) * plotH;

  const svg = svgEl('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, role: 'img',
                             'aria-labelledby': `${idPrefix}-t ${idPrefix}-d` });
  const describe = side => {
    const pts = series[side];
    if (pts.length === 0) return '';
    const vals = pts.map(p => p.value);
    return ` Stick ${SIDE_NAME[side]}: ${pts.length === 1 ? '1 punto' : `${pts.length} puntos`}, ` +
           `de ${formatValue(Math.min(...vals), metric)} a ${formatValue(Math.max(...vals), metric)}.`;
  };
  svg.append(
    svgEl('title', { id: `${idPrefix}-t` }, title.textContent),
    svgEl('desc', { id: `${idPrefix}-d` },
      `Gráfica de ${metric.label}.${describe('left')}${describe('right')} Los mismos valores están en la tabla comparativa.`),
  );

  // Eje Y: líneas de guía y valores
  const dec = decimalsForStep(y.step);
  for (const v of y.ticks) {
    svg.append(
      svgEl('line', { class: 'chart-grid', x1: m.l, x2: W - m.r, y1: yPos(v), y2: yPos(v) }),
      svgEl('text', { class: 'chart-tick', x: m.l - 8, y: yPos(v) + 4, 'text-anchor': 'end' }, v.toFixed(dec)),
    );
  }
  if (y.min < 0 && y.max > 0) svg.append(svgEl('line', { class: 'chart-zero', x1: m.l, x2: W - m.r, y1: yPos(0), y2: yPos(0) }));

  // Eje X: fechas (menos marcas si no caben)
  const len = formatTickTime(t0, range).length;
  const n = Math.max(2, Math.min(5, Math.floor(plotW / (len * 6.4 * 1.5))));
  const xTicks = timeTicks(t0, t1, n);
  xTicks.forEach((t, i) => {
    const anchor = xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
    svg.append(svgEl('text', { class: 'chart-tick', x: xPos(t), y: H - m.b + 20, 'text-anchor': anchor }, formatTickTime(t, range)));
  });

  // Series: una línea por stick (si hay 2+ puntos) y un marcador por punto, con su valor al pasar el ratón
  for (const side of ['left', 'right']) {
    const pts = series[side];
    if (pts.length === 0) continue;
    if (pts.length > 1) {
      svg.append(svgEl('polyline', { class: `chart-line chart-${side}`,
        points: pts.map(p => `${xPos(p.time).toFixed(1)},${yPos(p.value).toFixed(1)}`).join(' ') }));
    }
    for (const p of pts) {
      const cx = xPos(p.time), cy = yPos(p.value);
      const marker = side === 'left'
        ? svgEl('circle', { class: `chart-pt chart-${side}`, cx, cy, r: 5 })
        : svgEl('rect', { class: `chart-pt chart-${side}`, x: cx - 4.5, y: cy - 4.5, width: 9, height: 9 });
      marker.append(svgEl('title', {}, `${p.dateTime} · Stick ${SIDE_NAME[side]} · ${metric.label}: ${formatValue(p.value, metric)}`));
      svg.append(marker);
    }
  }
  container.append(svg);

  // Leyenda (HTML, para que se lea bien en cualquier ancho)
  const legend = document.createElement('ul');
  legend.className = 'chart-legend';
  for (const side of ['left', 'right']) {
    if (series[side].length === 0) continue;
    const li = document.createElement('li');
    li.append(span(`leg-mark leg-${side}`, side === 'left' ? '●' : '■'),
              document.createTextNode(` Stick ${SIDE_NAME[side]} (${side === 'left' ? 'línea continua' : 'línea discontinua'})`));
    legend.append(li);
  }
  container.append(legend);

  for (const note of chartNotes(series)) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = note;
    container.append(p);
  }
}