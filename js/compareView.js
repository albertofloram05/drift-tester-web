// Modo comparación (v1.6.0): pintado del comparador. La lógica (cálculos, textos) está en compare.js.
// Todo el texto entra con textContent: ningún dato guardado se interpreta como HTML.
import { METRICS, NA, computeDiffs, formatValue, formatDiff, formatPct } from './compare.js';
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