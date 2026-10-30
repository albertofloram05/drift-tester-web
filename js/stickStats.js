/** Estadísticas de UN stick. No sabe nada del mando ni de la pantalla. */
export class StickStats {
  #points = [];            // lista de pares [x, y]
  #totalAttempts = 0;      // lecturas intentadas (válidas o no)
  #fluctuations = 0;       // movimientos detectados
  #last = null;            // última muestra, para comparar

  static FLUCT_STEP = 0.01; // cambio mínimo para contar como "movimiento"

  /** Añade una muestra válida. */
  add(x, y) {
    this.#totalAttempts++;
    if (this.#last && Math.hypot(x - this.#last[0], y - this.#last[1]) > StickStats.FLUCT_STEP) {
      this.#fluctuations++;
    }
    this.#last = [x, y];
    this.#points.push(this.#last);
  }

  /** Lectura fallida: cuenta como intento, pero sin dato. */
  addFailed() { this.#totalAttempts++; }

  reset() {
    this.#points = [];
    this.#totalAttempts = 0;
    this.#fluctuations = 0;
    this.#last = null;
  }

  get count() { return this.#points.length; }
  get fluctuations() { return this.#fluctuations; }

  get validPercent() {
    return this.#totalAttempts === 0 ? 0 : 100 * this.#points.length / this.#totalAttempts;
  }

  get meanX() { return this.#mean(p => p[0]); }
  get meanY() { return this.#mean(p => p[1]); }

  /** Distancia del centro medio al centro ideal (0,0): el "sesgo". */
  get centerOffset() { return Math.hypot(this.meanX, this.meanY); }

  /** Distancia media de las muestras al centro ideal. */
  get meanDistance() { return this.#mean(p => Math.hypot(p[0], p[1])); }

  /** Mayor distancia al (0,0) observada. */
  get maxRadius() {
    let max = 0;
    for (const p of this.#points) max = Math.max(max, Math.hypot(p[0], p[1]));
    return max;
  }

  /** Desviación estándar: cuánto "tiembla" el stick alrededor de su media. */
  get stdDev() {
    if (this.#points.length === 0) return 0;
    const mx = this.meanX, my = this.meanY;
    const sum = this.#points.reduce(
      (acc, p) => acc + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0);
    return Math.sqrt(sum / this.#points.length);
  }

  /** Porcentaje de muestras cuya distancia al centro supera el umbral. */
  percentAboveThreshold(threshold) {
    if (this.#points.length === 0) return 0;
    const n = this.#points.filter(p => Math.hypot(p[0], p[1]) > threshold).length;
    return 100 * n / this.#points.length;
  }

  /** Distancia al centro de la muestra número i (para la gráfica). */
  distanceAt(i) {
    const p = this.#points[i];
    return Math.hypot(p[0], p[1]);
  }

  /** Media de lo que devuelva 'fn' para cada punto. */
  #mean(fn) {
    if (this.#points.length === 0) return 0;
    return this.#points.reduce((acc, p) => acc + fn(p), 0) / this.#points.length;
  }
}