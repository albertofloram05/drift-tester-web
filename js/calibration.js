// Lógica de la calibración. No sabe nada del navegador ni del HTML.

const MIN_SAMPLES = 30;   // con menos muestras no se concluye nada (igual que evaluator.js)

/**
 * Resume dónde está el centro real de un stick y cuánto ruido tiene.
 * Recibe un StickStats ya relleno y devuelve un objeto, o null si hay pocos datos.
 */
export function measureCenter(stats) {
  if (stats.count < MIN_SAMPLES) return null;

  return {
    x: stats.meanX,              // centro real en X
    y: stats.meanY,              // centro real en Y
    offset: stats.centerOffset,  // distancia de ese centro al (0,0) ideal
    noise: stats.stdDev,         // cuánto tiembla alrededor de su media
    samples: stats.count,
  };
}


// ---------- Rango del stick ----------

/**
 * Registra hasta dónde llega UN stick en cada dirección.
 * Divide el círculo en sectores y guarda el mayor alcance de cada uno.
 */
export class RangeTracker {
  // Valores iniciales míos, no estándares: se ajustan probando.
  static SECTORS = 16;    // 16 sectores de 22,5° (más fino que los 8 del modo movimiento)
  static MIN_PUSH = 0.5;  // por debajo de esto no cuenta como "empujar hacia el borde"

  #reach = new Array(RangeTracker.SECTORS).fill(0);

  reset() { this.#reach.fill(0); }

  /** Procesa una muestra: x e y de -1 a 1. */
  add(x, y) {
    const C = RangeTracker;
    const d = Math.hypot(x, y);
    if (d < C.MIN_PUSH) return;                       // cerca del centro: se ignora

    const angle = Math.atan2(y, x);                   // -π .. π
    const idx = Math.floor((angle + Math.PI) / (2 * Math.PI) * C.SECTORS) % C.SECTORS;
    this.#reach[idx] = Math.max(this.#reach[idx], d);
  }

  get sectorReach() { return [...this.#reach]; }      // copia, para que nadie la modifique

  /** Sectores en los que el stick ha llegado a empujar. */
  get explored() { return this.#reach.filter(v => v > 0).length; }

  get complete() { return this.explored === RangeTracker.SECTORS; }
}

/**
 * Resume el rango de un stick. Si faltan sectores por recorrer,
 * minReach y circularity son null (no se puede juzgar un círculo a medias).
 */
export function measureRange(range) {
  const reach = range.sectorReach;
  const maxReach = Math.max(...reach);

  if (!range.complete) {
    return { explored: range.explored, total: RangeTracker.SECTORS, complete: false,
             maxReach, minReach: null, circularity: null };
  }

  const minReach = Math.min(...reach);
  return {
    explored: range.explored,
    total: RangeTracker.SECTORS,
    complete: true,
    maxReach,                          // el punto más lejano alcanzado
    minReach,                          // el punto más corto de todo el borde
    circularity: minReach / maxReach,  // 1 = círculo perfecto; menos = aplastado
  };
}


// ---------- Zona muerta sugerida ----------

// Valores iniciales míos, no estándares: se ajustan probando.
const NOISE_FACTOR = 2.5;    // cuántas veces el ruido se cubre (≈99,8 % de las lecturas en reposo)
const DEADZONE_MIN = 0.05;   // no se sugiere menos, ni siquiera con un stick perfecto
const DEADZONE_OK = 0.10;    // hasta aquí: normal
const DEADZONE_HIGH = 0.25;  // hasta aquí: alta; por encima, la zona muerta taparía un problema

// Redondea hacia arriba a 2 decimales (el -1e-9 evita que 0.07 pase a 0.08 por decimales raros).
const roundUp = v => Math.ceil(v * 100 - 1e-9) / 100;

/**
 * Sugiere una zona muerta a partir de la medición del centro (measureCenter).
 * Devuelve null si no hay medición.
 *   deadzone   -> radio que cubre el centro real y su ruido, sin tocar nada más
 *   recentered -> radio si el juego o programa permite además corregir el centro
 *   level      -> 'ok' | 'info' | 'warn', igual que las observaciones del modo movimiento
 */
export function suggestDeadzone(center) {
  if (!center) return null;

  const spread = NOISE_FACTOR * center.noise;
  const deadzone = Math.max(DEADZONE_MIN, roundUp(center.offset + spread));
  const recentered = Math.max(DEADZONE_MIN, roundUp(spread));

  let level = 'ok';
  if (deadzone > DEADZONE_HIGH) level = 'warn';
  else if (deadzone > DEADZONE_OK) level = 'info';

  return { deadzone, recentered, level };
}


// ---------- Observaciones ----------

// Valores iniciales míos, no estándares: se ajustan probando.
const NOISE_WARN = 0.02;     // mismo criterio que SPREAD_LIMIT de evaluator.js
const EDGE_REACH = 0.9;      // mismo valor que EXTREME del modo movimiento
const CIRC_OK = 0.90;        // por encima: recorrido circular
const CIRC_WARN = 0.80;      // por debajo: recorrido claramente aplastado

/**
 * Convierte el resultado de UN stick ({ center, range, deadzone }) en una lista
 * de observaciones { level, text }, igual que observe() en el modo movimiento.
 */
export function observeCalibration(side) {
  const list = [];
  if (!side || !side.center) return list;
  const { center, range, deadzone } = side;

  // 1) Zona muerta sugerida
  const dz = deadzone.deadzone.toFixed(2);
  if (deadzone.level === 'ok') {
    list.push({ level: 'ok',
      text: `Zona muerta sugerida: ${dz}. Úsala como punto de partida si tu juego o programa permite ajustarla.` });
  } else if (deadzone.level === 'info') {
    list.push({ level: 'info',
      text: `Zona muerta sugerida: ${dz} (el centro está a ${center.offset.toFixed(3)} del ideal). ` +
            `Si el programa permite además corregir el centro, bastaría con ${deadzone.recentered.toFixed(2)}.` });
  } else {
    list.push({ level: 'warn',
      text: `Zona muerta sugerida: ${dz}. Es muy alta: con ese valor la zona muerta taparía el problema ` +
            'en vez de arreglarlo. Conviene revisar el mando; compáralo con el modo estático y repite la prueba.' });
  }

  // 2) Estabilidad en reposo
  if (center.noise > NOISE_WARN) {
    list.push({ level: 'warn',
      text: `El stick no se queda quieto en reposo (ruido ${center.noise.toFixed(3)}). ` +
            'El modo estático lo marcaría como posible drift; repite la prueba con el mando apoyado ' +
            'y, si se mantiene, conviene revisarlo.' });
  } else {
    list.push({ level: 'ok', text: `Reposo estable (ruido ${center.noise.toFixed(3)}).` });
  }

  // 3) Rango y circularidad
  if (!range.complete) {
    list.push({ level: 'info',
      text: `Faltan zonas por recorrer: ${range.explored} de ${range.total}. Gira el stick por todo el borde.` });
  } else if (range.maxReach < EDGE_REACH) {
    list.push({ level: 'info',
      text: `No llegaste al borde (alcance máximo ${range.maxReach.toFixed(2)}), así que la circularidad ` +
            'no es fiable. Repite empujando el stick hasta el tope.' });
  } else if (range.circularity >= CIRC_OK) {
    list.push({ level: 'ok',
      text: `Recorrido circular (circularidad ${range.circularity.toFixed(2)}).` });
  } else if (range.circularity >= CIRC_WARN) {
    list.push({ level: 'info',
      text: `Recorrido algo irregular (circularidad ${range.circularity.toFixed(2)}): en alguna dirección ` +
            'llega menos lejos que en otras. Repite la prueba empujando hasta el tope.' });
  } else {
    list.push({ level: 'warn',
      text: `Recorrido aplastado (circularidad ${range.circularity.toFixed(2)}): en algunas direcciones el ` +
            'stick llega mucho menos lejos. Repite la prueba empujando hasta el tope y, si se mantiene, ' +
            'conviene revisarlo.' });
  }

  return list;
}