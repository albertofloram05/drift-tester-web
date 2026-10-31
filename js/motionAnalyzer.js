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

// ---------- Observaciones (valores iniciales míos, no estándares) ----------
const RESIDUAL_OK = 0.05;     // por debajo: vuelve bien al centro
const RESIDUAL_WARN = 0.10;   // por encima: conviene revisarlo

// Los sectores empiezan en -180° y cada uno mide 45°. Los ejes caen en los bordes,
// así que cada sector se nombra por el lado en el que está.
const SECTOR_NAMES = [
  'izquierda (parte alta)',  'arriba (parte izquierda)',
  'arriba (parte derecha)',  'derecha (parte alta)',
  'derecha (parte baja)',    'abajo (parte derecha)',
  'abajo (parte izquierda)', 'izquierda (parte baja)',
];

/** Convierte las medidas de un analizador en una lista de observaciones. */
export function observe(m) {
  const list = [];
  const C = MotionAnalyzer;

  if (m.maxReach < 0.2) {
    list.push({ level: 'info',
      text: 'Mueve el stick en todas las direcciones, hasta el borde, y suéltalo.' });
    return list;
  }

  // 1) Direcciones y extremos
  const missing = m.sectorReach
    .map((v, i) => (v >= C.EXTREME ? null : SECTOR_NAMES[i]))
    .filter(Boolean);

  if (m.sectorsReached === 0) {
    list.push({ level: 'info',
      text: `El alcance máximo es ${m.maxReach.toFixed(2)}. Empuja hasta el borde para comprobar los extremos.` });
  } else if (missing.length === 0) {
    list.push({ level: 'ok', text: 'Llega cerca del extremo en las 8 zonas.' });
  } else {
    list.push({ level: 'info',
      text: `Extremo alcanzado en ${m.sectorsReached} de 8 zonas. Faltan: ${missing.join(', ')}.` });
  }

  // 2) Picos aislados
  if (m.spikes > 0) {
    list.push({ level: 'warn',
      text: `${m.spikes} pico(s) aislado(s): el valor saltó y volvió en menos de 100 ms. ` +
            'Puede ser un golpe rápido al stick o una anomalía de lectura; repite con movimientos ' +
            'suaves y, si aparecen con el stick quieto, conviene revisarlo.' });
  } else {
    list.push({ level: 'ok', text: 'No se detectaron picos aislados.' });
  }

  // 3) Vuelta al centro
  if (m.returns.length === 0) {
    list.push({ level: 'info',
      text: 'Aún no hay sueltas medidas: lleva el stick lejos del centro y suéltalo.' });
  } else if (m.maxResidual < RESIDUAL_OK) {
    list.push({ level: 'ok',
      text: `Vuelve al centro con precisión (residuo máximo ${m.maxResidual.toFixed(3)}).` });
  } else if (m.maxResidual < RESIDUAL_WARN) {
    list.push({ level: 'info',
      text: `Tras soltar queda algo desplazado (residuo máximo ${m.maxResidual.toFixed(3)}). ` +
            'Compáralo con el modo estático.' });
  } else {
    list.push({ level: 'warn',
      text: `Tras soltar queda a ${m.maxResidual.toFixed(3)} del centro. Repite la prueba y, ` +
            'si se mantiene, mide el reposo en el modo estático.' });
  }

  return list;
}