// Lógica del modo zona muerta. No sabe nada del navegador ni del HTML.
// Es una simulación por software: no cambia nada en el mando.

export const DEADZONE_MIN = 0;      // 0 %: sin zona muerta
export const DEADZONE_MAX = 0.30;   // 30 %

/** Limita la zona muerta a [0, 0,30]. Un valor no numérico cuenta como 0. */
export function clampDeadzone(d) {
  if (!Number.isFinite(d)) return DEADZONE_MIN;
  return Math.min(DEADZONE_MAX, Math.max(DEADZONE_MIN, d));
}

/**
 * Zona muerta radial con remapeo. x e y van (normalmente) de -1 a 1; d de 0 a 0,30.
 * Devuelve { x, y, r, rOut, filtered, valid }:
 *   r        -> magnitud original
 *   rOut     -> magnitud tras la zona muerta (entre 0 y 1)
 *   filtered -> true si la muestra queda anulada por la zona muerta
 *   valid    -> false si x o y no eran números válidos
 */
export function applyDeadzone(x, y, d) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0, r: 0, rOut: 0, filtered: false, valid: false };
  }

  const dz = clampDeadzone(d);
  const r = Math.hypot(x, y);

  if (r <= dz) {                       // dentro de la zona muerta: salida nula
    return { x: 0, y: 0, r, rOut: 0, filtered: dz > 0, valid: true };
  }

  const rOut = Math.min(1, (r - dz) / (1 - dz));   // remapeo: de [d, 1] a [0, 1]
  const k = rOut / r;                              // misma dirección, nueva magnitud
  return { x: x * k, y: y * k, r, rOut, filtered: false, valid: true };
}

/** Estadísticas del modo zona muerta para UN stick. Contadores acumulados: no guarda muestras. */
export class DeadzoneAnalyzer {
  #count = 0;
  #filtered = 0;
  #sumR = 0;       // suma de magnitudes originales
  #sumOut = 0;     // suma de magnitudes filtradas
  #maxR = 0;

  reset() {
    this.#count = 0;
    this.#filtered = 0;
    this.#sumR = 0;
    this.#sumOut = 0;
    this.#maxR = 0;
  }

  /** Procesa una muestra con la zona muerta d. Devuelve false si la muestra no es válida. */
  add(x, y, d) {
    const o = applyDeadzone(x, y, d);
    if (!o.valid) return false;
    this.#count++;
    if (o.filtered) this.#filtered++;
    this.#sumR += o.r;
    this.#sumOut += o.rOut;
    this.#maxR = Math.max(this.#maxR, o.r);
    return true;
  }

  get count() { return this.#count; }
  get filteredCount() { return this.#filtered; }
  get filteredPercent() { return this.#count === 0 ? 0 : 100 * this.#filtered / this.#count; }
  get meanOriginal() { return this.#count === 0 ? 0 : this.#sumR / this.#count; }
  get meanFiltered() { return this.#count === 0 ? 0 : this.#sumOut / this.#count; }
  get maxOriginal() { return this.#maxR; }
}