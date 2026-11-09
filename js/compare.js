// Modo comparación (v1.6.0): lógica pura, sin DOM ni localStorage.
// Trabaja con las FILAS de historyRows() (una por stick y prueba), no con los registros guardados.
import { quote } from './history.js';

/** Máximo de filas (stick de una prueba) que se pueden comparar a la vez. */
export const MAX_SELECTED = 8;

/** Métricas comparables. 'diff': cómo se calcula la diferencia con la referencia. */
export const METRICS = Object.freeze([
  { key: 'meanX',   label: 'Sesgo X',             decimals: 4, signed: true, diff: 'abs' },
  { key: 'meanY',   label: 'Sesgo Y',             decimals: 4, signed: true, diff: 'abs' },
  { key: 'std',     label: 'Desviación estándar', decimals: 4,               diff: 'abs+pct' },
  { key: 'above',   label: '% sobre umbral',      decimals: 1, unit: ' %',   diff: 'points' },
  { key: 'samples', label: 'Muestras',            decimals: 0,               diff: 'abs' },
]);

export const NA = 'No disponible';

// ---------- Selección ----------

/** Clave única de una fila: prueba + stick. */
export const rowKey = (id, side) => `${id}|${side}`;

/**
 * Marca o desmarca una fila. Devuelve { keys, ok, reason }; reason === 'limit' si ya hay MAX_SELECTED.
 * No modifica la lista original.
 */
export function toggleSelection(keys, key, max = MAX_SELECTED) {
  if (keys.includes(key)) return { keys: keys.filter(k => k !== key), ok: true };
  if (keys.length >= max) return { keys, ok: false, reason: 'limit' };
  return { keys: [...keys, key], ok: true };
}

/** Quita de la selección las filas que ya no existen (se eliminó la prueba, se borró el historial...). */
export function pruneSelection(keys, rows) {
  const alive = new Set(rows.filter(r => r.id).map(r => rowKey(r.id, r.side)));
  return keys.filter(k => alive.has(k));
}

export function selectionText(n, max = MAX_SELECTED) {
  if (n === 0) return 'No hay filas seleccionadas para comparar.';
  const base = n === 1 ? '1 fila seleccionada' : `${n} filas seleccionadas`;
  return `${base} (máximo ${max}).` + (n < 2 ? ' Selecciona al menos 2 para comparar.' : '');
}

export function limitText(max = MAX_SELECTED) {
  return `Solo se pueden comparar ${max} filas a la vez. Quita alguna para añadir otra.`;
}

// ---------- Fechas ----------

/** 'AAAA-MM-DD HH:MM:SS' (hora local) → milisegundos, o null si no es una fecha real. */
export function parseDateTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  const same = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d &&
               date.getHours() === h && date.getMinutes() === mi && date.getSeconds() === s;
  return same ? date.getTime() : null;       // rechaza 2026-02-31, 25:00:00...
}

// ---------- Elementos a comparar ----------

/**
 * Filas seleccionadas → elementos de comparación, en orden cronológico (las fechas inválidas, al final).
 * Cada métrica que no exista queda en null (nunca se inventa ni se recalcula).
 */
export function buildItems(keys, rows) {
  const byKey = new Map(rows.filter(r => r.id).map(r => [rowKey(r.id, r.side), r]));
  const items = [];
  for (const k of keys) {
    const r = byKey.get(k);
    if (!r) continue;
    const num = v => (Number.isFinite(v) ? v : null);
    items.push({
      key: k, id: r.id, side: r.side, stick: r.stick, number: r.number,
      dateTime: r.dateTime, time: parseDateTime(r.dateTime),
      label: r.label ?? '', gamepad: r.gamepad ?? '',
      threshold: num(r.threshold), durationSec: num(r.durationSec), level: r.level ?? null,
      meanX: num(r.meanX), meanY: num(r.meanY), std: num(r.std), above: num(r.above), samples: num(r.samples),
    });
  }
  return items.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.number - b.number);
}

/** Referencia por defecto: la prueba más antigua (la primera de la lista ordenada). */
export function defaultReference(items) {
  return items[0]?.key ?? null;
}

// ---------- Diferencias ----------

/**
 * Diferencia de una métrica respecto a la referencia.
 * { abs, pct }: abs = valor - referencia; pct = variación relativa en %, solo para métricas 'abs+pct'
 * y nunca si la referencia es 0. Cualquiera de los dos puede ser null (no calculable).
 */
export function diffMetric(value, ref, metric) {
  if (!Number.isFinite(value) || !Number.isFinite(ref)) return { abs: null, pct: null };
  const abs = value - ref;
  const pct = metric.diff === 'abs+pct' && ref !== 0 ? (abs / Math.abs(ref)) * 100 : null;
  return { abs, pct };
}

/** Diferencias de cada elemento con la referencia: Map(key → { meanX: {abs, pct}, ... }). */
export function computeDiffs(items, refKey) {
  const ref = items.find(i => i.key === refKey);
  const out = new Map();
  if (!ref) return out;
  for (const it of items) {
    const d = {};
    for (const m of METRICS) d[m.key] = diffMetric(it[m.key], ref[m.key], m);
    out.set(it.key, d);
  }
  return out;
}

// ---------- Formato (mismos decimales que la tabla del historial) ----------

export function formatValue(v, metric) {
  if (!Number.isFinite(v)) return NA;
  const t = v.toFixed(metric.decimals);
  return (metric.signed && v > 0 ? '+' : '') + t + (metric.unit ?? '');
}

/** Texto de la diferencia absoluta: «+0.0123» (en % sobre umbral, «pp» = puntos porcentuales). */
export function formatDiff(d, metric) {
  if (d.abs === null) return NA;
  const t = (d.abs > 0 ? '+' : '') + d.abs.toFixed(metric.decimals);
  return metric.diff === 'points' ? `${t} pp` : t;
}

export function formatPct(d) {
  if (d.pct === null) return '—';
  return (d.pct > 0 ? '+' : '') + d.pct.toFixed(1) + ' %';
}

// ---------- Avisos de interpretación ----------

/** Frases neutrales sobre qué tan comparables son las filas. Lista vacía si no hay nada que avisar. */
export function comparabilityNotes(items) {
  const notes = [];
  const thr = new Set(items.map(i => i.threshold).filter(v => v !== null));
  if (thr.size > 1) notes.push('Las pruebas usaron umbrales distintos: el «% sobre umbral» no es directamente comparable entre ellas.');
  const dur = new Set(items.map(i => i.durationSec).filter(v => v !== null));
  if (dur.size > 1) notes.push('Las pruebas tuvieron distinta duración y distinto número de muestras.');
  if (items.some(i => i.meanX === null || i.meanY === null)) notes.push('Las pruebas anteriores a la v1.5.0 no guardan el sesgo X e Y por separado: se muestran como «No disponible».');
  if (items.some(i => i.time === null)) notes.push('Alguna prueba no tiene una fecha válida: no aparece en las gráficas.');
  return notes;
}

/** Aviso fijo: el comparador describe, no diagnostica. */
export const DISCLAIMER =
  'La comparación es solo descriptiva. Una variación entre pruebas no demuestra por sí sola que el drift haya aparecido ni cambiado: ' +
  'las lecturas dependen de cómo se suelta el stick, la temperatura, la conexión, el navegador y el ruido de medición.';

/** Cómo se relacionan las filas: de la misma prueba (misma sesión) o de momentos distintos. */
export function relationText(items) {
  const ids = new Set(items.map(i => i.id));
  const sides = new Set(items.map(i => i.side));
  if (sides.size < 2) return '';                                 // un solo stick: nada que decir
  if (ids.size === 1) return 'Izquierdo y derecho son de la misma prueba (misma sesión).';
  const both = [...ids].filter(id => items.some(i => i.id === id && i.side === 'left') && items.some(i => i.id === id && i.side === 'right'));
  return both.length > 0
    ? 'Hay sticks de la misma prueba y también de pruebas hechas en momentos distintos.'
    : 'Los sticks izquierdo y derecho son de pruebas hechas en momentos distintos: no se asume que se midieran a la vez.';
}

// ---------- Series para las gráficas ----------

/**
 * Puntos de una métrica, UNA serie por stick (nunca se unen sticks distintos).
 * Solo entran elementos con fecha válida y valor numérico. Devuelve { left, right, skipped }.
 */
export function buildSeries(items, metricKey) {
  const out = { left: [], right: [], skipped: 0 };
  for (const it of items) {
    if (it.time === null || !Number.isFinite(it[metricKey])) { out.skipped++; continue; }
    out[it.side].push({ key: it.key, time: it.time, value: it[metricKey], dateTime: it.dateTime });
  }
  out.left.sort((a, b) => a.time - b.time);
  out.right.sort((a, b) => a.time - b.time);
  return out;
}

// ---------- CSV de la comparación ----------

export const COMPARE_HEADER = [
  'referencia', 'prueba_n', 'fecha', 'stick', 'mando', 'nombre_mando', 'umbral', 'muestras',
  'sesgo_x', 'sesgo_y', 'desv_est', 'pct_sobre_umbral', 'resultado',
  'dif_sesgo_x', 'dif_sesgo_y', 'dif_desv_est', 'var_pct_desv_est', 'dif_pct_sobre_umbral_puntos', 'dif_muestras',
].join(',');

/** Número para CSV: sin signo '+' ni texto; vacío si no existe. */
const num = (v, decimals) => (Number.isFinite(v) ? v.toFixed(decimals) : '');

/** CSV de la comparación. 'referencia' vale «si» en la fila de referencia y «no» en las demás; las diferencias son contra ella. */
export function compareToCsv(items, refKey) {
  const diffs = computeDiffs(items, refKey);
  const rows = items.map(it => {
    const d = diffs.get(it.key);
    return [
      it.key === refKey ? 'si' : 'no', it.number, it.dateTime, it.stick, quote(it.gamepad), quote(it.label),
      num(it.threshold, 3), num(it.samples, 0),
      num(it.meanX, 4), num(it.meanY, 4), num(it.std, 4), num(it.above, 1), it.level ?? '',
      d ? num(d.meanX.abs, 4) : '', d ? num(d.meanY.abs, 4) : '', d ? num(d.std.abs, 4) : '',
      d ? num(d.std.pct, 1) : '', d ? num(d.above.abs, 1) : '', d ? num(d.samples.abs, 0) : '',
    ].join(',');
  });
  return [COMPARE_HEADER, ...rows].join('\n') + '\n';
}

export function compareCsvFileName(items) {
  return `drift-resultados-comparacion-${items.length}-filas.csv`;   // empieza por «drift-resultados»: lo ignora el .gitignore
}