/** Análisis del modo movimiento para UN stick. No sabe nada de la pantalla. */
export class MotionAnalyzer {
  // Todos estos valores son iniciales míos, no estándares: se ajustan probando.
  static SECTORS = 8;        // sectores en que se divide el círculo
  static EXTREME = 0.9;      // alcance mínimo para considerar un sector "explorado"
  static SPIKE_JUMP = 0.30;  // salto mínimo para sospechar de un pico
  static SPIKE_BACK = 0.10;  // cuánto debe parecerse la muestra final a la inicial
  static SPIKE_MAX_MS = 100; // un pico ocurre en muy poco tiempo
  static MOVE_FAR = 0.5;     // "el stick estuvo lejos del centro"
  static REST_NEAR = 0.2;    // "el stick ha vuelto cerca del centro"
  static MOVE_AGAIN = 0.35;  // si supera esto mientras se asienta, se movió otra vez
  static SETTLE_MS = 300;    // tiempo que se espera tras soltar para medir el reposo
  static WINDOW_MS = 10000;  // cuánto recuerda la gráfica

  #recent = [];                                   // {t, x, y} de los últimos segundos
  #sectors = new Array(MotionAnalyzer.SECTORS).fill(0);
  #maxReach = 0;
  #spikes = 0;
  #returns = [];                                  // distancia al centro tras cada suelta
  #p2 = null;                                     // antepenúltima muestra
  #p1 = null;                                     // penúltima muestra
  #armed = false;                                 // ¿estuvo lejos y esperamos que vuelva?
  #settleStart = null;                            // instante en que volvió cerca del centro

  reset() {
    this.#recent = [];
    this.#sectors.fill(0);
    this.#maxReach = 0;
    this.#spikes = 0;
    this.#returns = [];
    this.#p2 = this.#p1 = null;
    this.#armed = false;
    this.#settleStart = null;
  }

  /** Procesa una muestra. t en milisegundos, x e y de -1 a 1. */
  update(t, x, y) {
    const C = MotionAnalyzer;
    const d = Math.hypot(x, y);

    // 1) Alcance total y por sector (ignoramos el ruido cerca del centro)
    this.#maxReach = Math.max(this.#maxReach, d);
    if (d > C.REST_NEAR) {
      const angle = Math.atan2(y, x);                                   // -π .. π
      const idx = Math.floor((angle + Math.PI) / (2 * Math.PI) * C.SECTORS) % C.SECTORS;
      this.#sectors[idx] = Math.max(this.#sectors[idx], d);
    }

    // 2) Pico aislado: la muestra del medio se aleja de las dos vecinas,
    //    y las vecinas se parecen entre sí
    if (this.#p1 && this.#p2) {
      const jumpIn = Math.hypot(this.#p1.x - this.#p2.x, this.#p1.y - this.#p2.y);
      const jumpOut = Math.hypot(x - this.#p1.x, y - this.#p1.y);
      const back = Math.hypot(x - this.#p2.x, y - this.#p2.y);
      if (jumpIn > C.SPIKE_JUMP && jumpOut > C.SPIKE_JUMP &&
          back < C.SPIKE_BACK && t - this.#p2.t < C.SPIKE_MAX_MS) {
        this.#spikes++;
      }
    }
    this.#p2 = this.#p1;
    this.#p1 = { t, x, y };

    // 3) Vuelta al centro: lejos -> cerca -> esperar 300 ms -> medir
    if (d > C.MOVE_FAR) {
      this.#armed = true;
      this.#settleStart = null;
    } else if (this.#armed && d < C.REST_NEAR) {
      this.#settleStart = t;
      this.#armed = false;
    } else if (this.#settleStart !== null) {
      if (d > C.MOVE_AGAIN) {
        this.#settleStart = null;                          // se movió otra vez: cancelar
      } else if (t - this.#settleStart >= C.SETTLE_MS) {
        this.#returns.push(d);
        this.#settleStart = null;
      }
    }

    // 4) Memoria para la gráfica: solo los últimos segundos
    this.#recent.push({ t, x, y });
    while (this.#recent.length > 0 && t - this.#recent[0].t > C.WINDOW_MS) {
      this.#recent.shift();
    }
  }

  get maxReach() { return this.#maxReach; }
  get spikes() { return this.#spikes; }
  get recent() { return this.#recent; }
  get sectorReach() { return [...this.#sectors]; }     // copia, para que nadie la modifique

  /** Sectores en los que el stick llegó cerca del extremo. */
  get sectorsReached() {
    return this.#sectors.filter(v => v >= MotionAnalyzer.EXTREME).length;
  }

  get returns() { return [...this.#returns]; }

  get avgResidual() {
    return this.#returns.length === 0
      ? 0
      : this.#returns.reduce((a, v) => a + v, 0) / this.#returns.length;
  }

  get maxResidual() {
    return this.#returns.length === 0 ? 0 : Math.max(...this.#returns);
  }
}