/**
 * Botones del mapeo estándar de la Gamepad API, con el nombre que se muestra en pantalla.
 * Los índices 0–16 son los del estándar; el 17 (panel táctil) depende del navegador y del sistema.
 */
export const BUTTONS = Object.freeze([
  { index: 0,  id: 'cross',    label: 'Cruz (X)' },
  { index: 1,  id: 'circle',   label: 'Círculo (O)' },
  { index: 2,  id: 'square',   label: 'Cuadrado' },
  { index: 3,  id: 'triangle', label: 'Triángulo' },
  { index: 4,  id: 'l1',       label: 'L1' },
  { index: 5,  id: 'r1',       label: 'R1' },
  { index: 6,  id: 'l2',       label: 'L2', analog: true },
  { index: 7,  id: 'r2',       label: 'R2', analog: true },
  { index: 8,  id: 'create',   label: 'Create' },
  { index: 9,  id: 'options',  label: 'Options' },
  { index: 10, id: 'l3',       label: 'L3' },
  { index: 11, id: 'r3',       label: 'R3' },
  { index: 12, id: 'up',       label: 'Flecha arriba' },
  { index: 13, id: 'down',     label: 'Flecha abajo' },
  { index: 14, id: 'left',     label: 'Flecha izquierda' },
  { index: 15, id: 'right',    label: 'Flecha derecha' },
  { index: 16, id: 'ps',       label: 'PS' },
  { index: 17, id: 'touchpad', label: 'Panel táctil' },
]);

/** Nombre en pantalla de un botón a partir de su id ('l1' -> 'L1'). */
export function labelOf(id) {
  return BUTTONS.find(b => b.id === id)?.label ?? id;
}

const emptyState = () => ({
  present: false,      // ¿el mando ha enviado alguna vez este botón?
  down: false,         // ¿está pulsado ahora?
  value: 0,            // valor actual, de 0 a 1 (los gatillos L2/R2 son analógicos)
  maxValue: 0,         // el valor más alto alcanzado
  count: 0,            // veces que se ha pulsado
  totalHeldMs: 0,      // tiempo total que ha estado pulsado
  lastPressT: null,    // ms desde que empezó el registro hasta la última pulsación
  pressStartMs: 0,     // instante de la pulsación en curso
});

/** Registra las pulsaciones de los botones. No sabe nada del mando ni de la pantalla. */
export class ButtonTracker {
  #states = new Map();   // id del botón -> estado
  #log = [];             // sucesos en orden cronológico
  #origin = null;        // instante del primer fotograma tras empezar el registro
  #maxLog;

  constructor(maxLog = 200) {
    this.#maxLog = maxLog;
    this.reset();
  }

  /** Borra los contadores y el registro. */
  reset() {
    this.#states.clear();
    for (const b of BUTTONS) this.#states.set(b.id, emptyState());
    this.#log = [];
    this.#origin = null;
  }

  /**
   * Se llama en cada fotograma. 'snapshot' es un array de { pressed, value }
   * (uno por botón del mando) o null si no hay mando: entonces se suelta todo.
   */
  update(nowMs, snapshot) {
    if (this.#origin === null) this.#origin = nowMs;
    const t = nowMs - this.#origin;

    for (const def of BUTTONS) {
      const st = this.#states.get(def.id);
      const raw = snapshot ? snapshot[def.index] : undefined;
      const down = !!raw?.pressed;

      if (raw) st.present = true;
      st.value = raw ? raw.value : 0;

      if (down && !st.down) {                        // se acaba de pulsar
        st.down = true;
        st.count++;
        st.pressStartMs = nowMs;
        st.lastPressT = t;
        this.#push({ t, id: def.id, type: 'press' });
      } else if (!down && st.down) {                 // se acaba de soltar
        const heldMs = nowMs - st.pressStartMs;
        st.down = false;
        st.totalHeldMs += heldMs;
        this.#push({ t, id: def.id, type: 'release', heldMs });
      }

      if (st.down) st.maxValue = Math.max(st.maxValue, st.value);
    }
  }

  #push(entry) {
    this.#log.push(entry);
    if (this.#log.length > this.#maxLog) this.#log.shift();   // el registro tiene un tope; los contadores no
  }

  /** Copia del estado de un botón, o null si el id no existe. */
  state(id) {
    const st = this.#states.get(id);
    return st ? { ...st } : null;
  }

  /** Copia del registro, del más antiguo al más reciente. */
  get log() { return [...this.#log]; }

  /** Pulsaciones totales de todos los botones. */
  get totalPresses() {
    let n = 0;
    for (const st of this.#states.values()) n += st.count;
    return n;
  }

  /** Ids de los botones que están pulsados ahora. */
  get downIds() {
    return BUTTONS.filter(b => this.#states.get(b.id).down).map(b => b.id);
  }
}