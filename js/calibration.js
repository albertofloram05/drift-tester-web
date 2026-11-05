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