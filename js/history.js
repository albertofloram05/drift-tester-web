import { evaluate } from './evaluator.js';

const KEY = 'driftTester.history.v1';   // nombre bajo el que se guarda

export const HEADER = [
  'fecha', 'duracion_s', 'mando', 'umbral',
  'izq_resultado', 'izq_sesgo', 'izq_desv_est', 'izq_pct_sobre_umbral', 'izq_muestras',
  'der_resultado', 'der_sesgo', 'der_desv_est', 'der_pct_sobre_umbral', 'der_muestras',
].join(',');

const pad = n => String(n).padStart(2, '0');

/** Fecha local con formato 2026-10-30 10:48:05 */
function nowText() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Resume un stick en un objeto sencillo. */
function summarize(stats, threshold) {
  return {
    level: evaluate(stats, threshold),
    offset: stats.centerOffset,
    std: stats.stdDev,
    above: stats.percentAboveThreshold(threshold),
    samples: stats.count,
  };
}

/** Construye el resultado de una prueba a partir de las estadísticas. */
export function buildResult(gamepad, durationSec, threshold, left, right) {
  return {
    dateTime: nowText(),
    durationSec,
    gamepad,
    threshold,
    left: summarize(left, threshold),
    right: summarize(right, threshold),
  };
}

/** Lee todo el historial. Si no hay nada o está dañado, devuelve una lista vacía. */
export function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Añade un resultado. Devuelve false si el navegador no deja guardar. */
export function save(result) {
  try {
    const all = loadAll();
    all.push(result);
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function count() { return loadAll().length; }

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* sin acceso: nada que borrar */ }
}

/** Convierte una lista de resultados en texto CSV. */
export function toCsv(results) {
  const rows = results.map(r => {
    // Las comillas dentro del nombre se duplican, como manda el formato CSV
    const name = `"${String(r.gamepad).replaceAll('"', '""')}"`;
    return [
      r.dateTime, r.durationSec, name, r.threshold.toFixed(3),
      r.left.level, r.left.offset.toFixed(4), r.left.std.toFixed(4),
      r.left.above.toFixed(1), r.left.samples,
      r.right.level, r.right.offset.toFixed(4), r.right.std.toFixed(4),
      r.right.above.toFixed(1), r.right.samples,
    ].join(',');
  });
  return [HEADER, ...rows].join('\n') + '\n';
}

/** Descarga el CSV como archivo. */
export function downloadCsv(results, filename = 'drift-resultados.csv') {
  // El \uFEFF inicial ayuda a Excel a reconocer los acentos (UTF-8)
  const blob = new Blob(['\uFEFF' + toCsv(results)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}