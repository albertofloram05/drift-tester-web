import { evaluate } from './evaluator.js';

const KEY = 'driftTester.history.v1';   // nombre bajo el que se guarda
const BACKUP_KEY = `${KEY}.corrupt`;     // copia del texto dañado, por si hay que recuperarlo a mano

export const HEADER = [
  'fecha', 'duracion_s', 'mando', 'umbral',
  'izq_resultado', 'izq_sesgo', 'izq_desv_est', 'izq_pct_sobre_umbral', 'izq_muestras',
  'der_resultado', 'der_sesgo', 'der_desv_est', 'der_pct_sobre_umbral', 'der_muestras',
  'etiqueta',                                   // al final: las columnas anteriores no cambian de posición
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

/** Longitud máxima del nombre personalizado de un mando. */
export const MAX_LABEL = 40;

/** Limpia el nombre que escribe el usuario: sin saltos de línea ni espacios sobrantes, y con límite de longitud. */
export function normalizeLabel(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL).trim();
}

/**
 * Construye el resultado de una prueba a partir de las estadísticas.
 * 'label' es el nombre personalizado del mando (opcional): la API de mandos no da número de serie,
 * así que es la única forma de distinguir dos mandos del mismo modelo.
 */
export function buildResult(gamepad, durationSec, threshold, left, right, label = '') {
  return {
    id: newId(),
    dateTime: nowText(),
    durationSec,
    gamepad,
    label: normalizeLabel(label),
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
export function saveStatusText(res, label = '') {
  if (res.ok && !res.duplicate) return `Prueba guardada en el historial${label ? ` (mando «${label}»)` : ''}.`;
  if (res.ok) return 'Esta prueba ya estaba guardada.';
  switch (res.reason) {
    case 'quota':
      return 'No se pudo guardar: el almacenamiento del navegador está lleno. Exporta el CSV y borra pruebas antiguas.';
    case 'corrupt':
      return 'No se pudo guardar: el historial guardado está dañado y no se pudo hacer una copia. Bórralo para empezar de nuevo.';
    default:
      return 'No se pudo guardar: el navegador bloquea el almacenamiento.';
  }
}

/**
 * Elimina UNA prueba (los dos sticks, que se guardan juntos) por su id.
 * Devuelve { ok: true, removed } o { ok: false, reason: 'notfound' | 'quota' | 'blocked' }.
 */
export function removeById(id, storage = defaultStorage()) {
  const { list, status } = readStored(storage);
  if (status === 'unavailable') return { ok: false, reason: 'blocked' };

  const i = list.findIndex(r => r?.id === id);
  if (i === -1) return { ok: false, reason: 'notfound' };

  const removed = list[i];
  try {
    storage.setItem(KEY, JSON.stringify(list.filter((_, j) => j !== i)));
    return { ok: true, removed };
  } catch (e) {
    return { ok: false, reason: failureReason(e) };
  }
}

/** Texto de la confirmación. 'row' es una fila de historyRows(); deja claro que se borran los dos sticks. */
export function deleteConfirmText(row) {
  return `¿Eliminar la prueba nº ${row.number} del ${row.dateTime}?\n\n` +
         'Se borrarán los resultados de AMBOS sticks (izquierdo y derecho) de esa prueba. No se puede deshacer.';
}

/**
 * Cambia el nombre personalizado del mando de UNA prueba (afecta a sus dos sticks). '' lo quita.
 * Devuelve { ok: true, label } o { ok: false, reason: 'notfound' | 'quota' | 'blocked' }.
 */
export function setLabelById(id, label, storage = defaultStorage()) {
  const { list, status } = readStored(storage);
  if (status === 'unavailable') return { ok: false, reason: 'blocked' };

  const i = list.findIndex(r => r?.id === id);
  if (i === -1) return { ok: false, reason: 'notfound' };

  const clean = normalizeLabel(label);
  try {
    storage.setItem(KEY, JSON.stringify(list.map((r, j) => (j === i ? { ...r, label: clean } : r))));
    return { ok: true, label: clean };
  } catch (e) {
    return { ok: false, reason: failureReason(e) };
  }
}

/** Texto del cuadro para cambiar el nombre. 'row' es una fila de historyRows(). */
export function labelPromptText(row) {
  return `Nombre del mando para la prueba nº ${row.number} del ${row.dateTime}.\n\n` +
         `Se aplica a los dos sticks de esa prueba. Déjalo en blanco para quitarlo (máximo ${MAX_LABEL} caracteres).`;
}

/** Texto para el usuario según lo que devolvió setLabelById(). */
export function labelStatusText(res) {
  if (res.ok) return res.label ? `Nombre del mando cambiado a «${res.label}».` : 'Nombre del mando quitado.';
  if (res.reason === 'notfound') return 'No se encontró esa prueba: puede que ya se hubiera eliminado.';
  if (res.reason === 'quota') return 'No se pudo cambiar el nombre: el almacenamiento del navegador está lleno.';
  return 'No se pudo cambiar el nombre: el navegador bloquea el almacenamiento.';
}

/** Texto para el usuario según lo que devolvió removeById(). */
export function deleteStatusText(res) {
  if (res.ok) return `Prueba del ${res.removed.dateTime} eliminada (ambos sticks).`;
  if (res.reason === 'notfound') return 'No se encontró esa prueba: puede que ya se hubiera eliminado.';
  return 'No se pudo eliminar la prueba: el navegador bloquea el almacenamiento.';
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
          id: typeof r.id === 'string' ? r.id : null, // identifica la prueba (las dos filas de una prueba comparten id)
          side,                                       // 'left' | 'right' (para filtrar sin depender del texto)
          gamepad: typeof r.gamepad === 'string' ? r.gamepad : '',
          label: typeof r.label === 'string' ? r.label : '',   // nombre personalizado (vacío en pruebas anteriores)          
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

// ---------- Filtros de la tabla (no tocan los datos guardados) ----------

/** Filtros sin aplicar: la tabla muestra todo. */
export const DEFAULT_FILTERS = Object.freeze({ stick: 'all', level: 'all', from: '', to: '', query: '' });

/** Minúsculas y sin acentos, para que "Dualsénse" y "dualsense" coincidan. */
const fold = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** ¿Hay algún filtro puesto? Un texto de búsqueda con solo espacios no cuenta. */
export function hasActiveFilters(f = DEFAULT_FILTERS) {
  return Boolean((f.stick && f.stick !== 'all') || (f.level && f.level !== 'all') ||
                 f.from || f.to || (f.query && f.query.trim() !== ''));
}

/**
 * Filtra las filas de historyRows(). Los filtros se combinan (todos deben cumplirse).
 * stick: 'left' | 'right' | 'all'; level: un Level o 'all'; from/to: 'AAAA-MM-DD' (inclusivos); query: nombre del mando.
 * Devuelve una lista nueva: no modifica las filas ni el historial guardado.
 */
export function filterRows(rows, f = DEFAULT_FILTERS) {
  const q = fold(f.query ?? '').trim();
  return rows.filter(r => {
    const day = r.dateTime.slice(0, 10);              // 'AAAA-MM-DD' de 'AAAA-MM-DD HH:MM:SS'
    return (!f.stick || f.stick === 'all' || r.side === f.stick) &&
           (!f.level || f.level === 'all' || r.level === f.level) &&
           (!f.from || day >= f.from) &&
           (!f.to || day <= f.to) &&
           (q === '' || fold(r.gamepad ?? '').includes(q) || fold(r.label ?? '').includes(q));
  });
}

/** Número de pruebas distintas en una lista de filas (cada prueba tiene una fila por stick). */
export function countTests(rows) {
  return new Set(rows.map(r => r.id ?? `n${r.number}`)).size;
}

/** Texto del contador. 'matching' es null sin filtros, o cuántas pruebas coinciden con ellos. */
export function historyCountText(total, matching = null) {
  return `Pruebas guardadas: ${total}` +
         (matching === null ? '' : ` · Coinciden con los filtros: ${matching}`);
}

/**
 * Qué decir cuando la tabla no tiene filas. Distingue: almacenamiento bloqueado, datos dañados,
 * historial vacío y "hay pruebas pero ningún filtro coincide".
 * stored = elementos guardados; tests = pruebas legibles; filtering = hay filtros puestos.
 */
export function emptyStateText({ status = 'ok', stored = 0, tests = 0, filtering = false } = {}) {
  if (status === 'unavailable') return 'El navegador bloquea el almacenamiento: no se puede mostrar el historial.';
  if (status === 'corrupt') return 'No se puede leer el historial guardado: los datos están dañados.';
  if (stored > 0 && tests === 0) return 'Las pruebas guardadas no se pueden mostrar: sus datos están dañados.';
  if (tests === 0) return 'Aún no hay pruebas guardadas.';
  if (filtering) {
    const n = tests === 1 ? '1 prueba guardada' : `${tests} pruebas guardadas`;
    return `Ninguna prueba coincide con los filtros. Hay ${n}: usa «Restablecer filtros» para verlas.`;
  }
  return 'Aún no hay pruebas guardadas.';
}

/** Convierte una lista de resultados en texto CSV. */
/** Texto entre comillas para CSV: las comillas interiores se duplican. */
const quote = text => `"${String(text ?? '').replaceAll('"', '""')}"`;

export function toCsv(results) {
  // Los registros dañados o incompletos se omiten: uno malo no debe impedir exportar los demás
  const rows = results.filter(isValidRecord).map(r => {
    // Las comillas dentro del nombre se duplican, como manda el formato CSV
    const name = quote(r.gamepad);
    return [
      r.dateTime, Number.isFinite(r.durationSec) ? r.durationSec : '', name, r.threshold.toFixed(3),
      r.left.level, r.left.offset.toFixed(4), r.left.std.toFixed(4),
      r.left.above.toFixed(1), r.left.samples,
      r.right.level, r.right.offset.toFixed(4), r.right.std.toFixed(4),
      r.right.above.toFixed(1), r.right.samples,
      quote(r.label),      
    ].join(',');
  });
  return [HEADER, ...rows].join('\n') + '\n';
}

/** ¿Se puede escribir este registro como fila de CSV? (fecha, umbral y los datos de ambos sticks) */
export function isValidRecord(r) {
  const stickOk = s => s !== null && typeof s === 'object' && typeof s.level === 'string' &&
                       [s.offset, s.std, s.above, s.samples].every(Number.isFinite);
  return r !== null && typeof r === 'object' && typeof r.dateTime === 'string' &&
         Number.isFinite(r.threshold) && stickOk(r.left) && stickOk(r.right);
}

/** Nombre del CSV de una prueba. Empieza por "drift-resultados" para que lo ignore el .gitignore. */
export function csvFileName(dateTime) {
  const stamp = String(dateTime ?? '').replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
  return `drift-resultados-prueba-${stamp || 'sin-fecha'}.csv`;
}

/** Texto tras exportar UNA prueba. res: { ok: true, dateTime } o { ok: false, reason: 'notfound' | 'invalid' }. */
export function exportStatusText(res) {
  if (res.ok) return `CSV de la prueba del ${res.dateTime} generado.`;
  if (res.reason === 'notfound') return 'No se encontró esa prueba: puede que ya se hubiera eliminado.';
  return 'No se pudo exportar esa prueba: sus datos están dañados.';
}

/** Texto tras «Exportar CSV» (todas). total = guardadas, exported = las que entraron en el archivo. */
export function exportAllText(total, exported) {
  if (total === 0) return 'Aún no hay pruebas guardadas.';
  if (exported === 0) return 'No se pudo exportar: ninguna prueba guardada tiene datos válidos.';
  const plural = n => (n === 1 ? '1 prueba' : `${n} pruebas`);
  const skipped = total - exported;
  return (exported === 1 ? 'Descargada ' : 'Descargadas ') + plural(exported) + '.' +
         (skipped > 0 ? ` Se omitieron ${plural(skipped)} con datos dañados.` : '');
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