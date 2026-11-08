import { evaluate } from './evaluator.js';

const KEY = 'driftTester.history.v1';   // nombre bajo el que se guarda
const BACKUP_KEY = `${KEY}.corrupt`;     // copia del texto dañado, por si hay que recuperarlo a mano

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
    meanX: stats.meanX,          // sesgo horizontal (solo para la tabla; el CSV no lo incluye)
    meanY: stats.meanY,          // sesgo vertical
    std: stats.stdDev,
    above: stats.percentAboveThreshold(threshold),
    samples: stats.count,
  };
}

/** Identificador único de una prueba. randomUUID solo existe en contextos seguros (https o localhost). */
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Construye el resultado de una prueba a partir de las estadísticas. */
export function buildResult(gamepad, durationSec, threshold, left, right) {
  return {
    id: newId(),
    dateTime: nowText(),
    durationSec,
    gamepad,
    threshold,
    left: summarize(left, threshold),
    right: summarize(right, threshold),
  };
}

/** Acceso a localStorage que no lanza aunque el navegador lo bloquee (devuelve null). */
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * Da un id a cada registro que no lo tenga (los anteriores a la v1.5.1) y repara los repetidos.
 * Es determinista (legacy-0, legacy-1...): mientras no se escriba nada, el mismo registro recibe el mismo id.
 * Los elementos que no son objetos se dejan tal cual. No modifica la lista original.
 */
export function ensureIds(list) {
  const seen = new Set();
  return list.map((r, i) => {
    if (r === null || typeof r !== 'object') return r;
    let id = typeof r.id === 'string' && r.id !== '' && !seen.has(r.id) ? r.id : null;
    if (id === null) {
      id = `legacy-${i}`;
      while (seen.has(id)) id += '_';
    }
    seen.add(id);
    return r.id === id ? r : { ...r, id };
  });
}

/** Lee el texto guardado. status: 'ok' (o vacío), 'corrupt' (JSON inválido) o 'unavailable' (sin acceso). */
function readStored(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return { list: [], raw: null, status: 'unavailable' };
  }
  if (!raw) return { list: [], raw: null, status: 'ok' };
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return { list: ensureIds(data), raw, status: 'ok' };
  } catch { /* se trata como dañado, abajo */ }
  return { list: [], raw, status: 'corrupt' };
}

/** Lee todo el historial. Si no hay nada o está dañado, devuelve una lista vacía. */
export function loadAll(storage = defaultStorage()) {
  return readStored(storage).list;
}

/** Estado del almacenamiento: 'ok', 'corrupt' o 'unavailable'. Permite distinguir "vacío" de "dañado". */
export function storageStatus(storage = defaultStorage()) {
  return readStored(storage).status;
}

/** 'quota' si el navegador se quedó sin espacio; 'blocked' para cualquier otro fallo. */
function failureReason(e) {
  const quota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                      e.code === 22 || e.code === 1014);
  return quota ? 'quota' : 'blocked';
}

/**
 * Añade un resultado. Devuelve { ok: true } si se guardó, { ok: true, duplicate: true } si ya estaba,
 * o { ok: false, reason: 'quota' | 'blocked' | 'corrupt' } si no se pudo guardar.
 * Si el historial guardado está dañado, primero se copia el texto a otra clave: nunca se pisa sin copia.
 */
export function save(result, storage = defaultStorage()) {
  const { list, raw, status } = readStored(storage);
  if (status === 'unavailable') return { ok: false, reason: 'blocked' };

  if (status === 'corrupt') {
    try {
      if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, raw);
    } catch {
      return { ok: false, reason: 'corrupt' };   // sin copia de seguridad no se sobrescribe
    }
  }

  if (result?.id && list.some(r => r?.id === result.id)) return { ok: true, duplicate: true };

  try {
    storage.setItem(KEY, JSON.stringify([...list, result]));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: failureReason(e) };
  }
}

/** Texto para el usuario según lo que devolvió save(). */
export function saveStatusText(res) {
  if (res.ok) return res.duplicate ? 'Esta prueba ya estaba guardada.' : 'Prueba guardada en el historial.';
  switch (res.reason) {
    case 'quota':
      return 'No se pudo guardar: el almacenamiento del navegador está lleno. Exporta el CSV y borra pruebas antiguas.';
    case 'corrupt':
      return 'No se pudo guardar: el historial guardado está dañado y no se pudo hacer una copia. Bórralo para empezar de nuevo.';
    default:
      return 'No se pudo guardar: el navegador bloquea el almacenamiento.';
  }
}

export function count(storage = defaultStorage()) { return loadAll(storage).length; }

/** Borra el historial (y la copia de un historial dañado). Devuelve false si el navegador no lo permite. */
export function clear(storage = defaultStorage()) {
  try {
    storage.removeItem(KEY);
    storage.removeItem(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepara las filas de la tabla del historial: una por stick y prueba, con la más reciente arriba.
 * Usa los mismos resultados guardados que el CSV (no recalcula nada).
 * Los registros anteriores a la v1.5.0 no tienen meanX/meanY: esas celdas quedan en null.
 */
export function historyRows(results) {
  const rows = [];

  for (let i = results.length - 1; i >= 0; i--) {
    try {
      const r = results[i];
      const pair = [['left', 'Izquierdo'], ['right', 'Derecho']].map(([side, label]) => {
        const s = r[side];
        const row = {
          number: i + 1,                              // posición en el historial, igual que el orden del CSV
          dateTime: String(r.dateTime),
          stick: label,
          samples: s.samples,
          meanX: Number.isFinite(s.meanX) ? s.meanX : null,
          meanY: Number.isFinite(s.meanY) ? s.meanY : null,
          std: s.std,
          above: s.above,
          threshold: r.threshold,
          level: String(s.level),
        };
        for (const k of ['samples', 'std', 'above', 'threshold']) {
          if (!Number.isFinite(row[k])) throw new Error('registro dañado');
        }
        return row;
      });
      rows.push(...pair);                             // se añaden los dos o ninguno
    } catch { /* registro dañado: se omite */ }
  }

  return rows;
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