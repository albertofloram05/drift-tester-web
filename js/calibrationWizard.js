import { StickStats } from './stickStats.js';
import { RangeTracker, measureCenter, measureRange, suggestDeadzone } from './calibration.js';

export const CalState = Object.freeze({
  IDLE: 'IDLE',
  COUNTDOWN: 'COUNTDOWN',   // "suelta los sticks"
  CENTER: 'CENTER',         // mide el centro en reposo
  RANGE: 'RANGE',           // el usuario gira los sticks hasta el borde
  DONE: 'DONE',
});

// Valores iniciales míos, no estándares.
const COUNTDOWN_MS = 3000;                  // cuenta atrás antes de medir el centro
const CENTER_MS = 5000;                     // tiempo de medición del centro
const CENTER_ABORT = RangeTracker.MIN_PUSH; // si un stick supera esto en reposo, se está empujando

/** Asistente de calibración: centro -> rango -> resultado. No sabe nada de la pantalla. */
export class CalibrationWizard {
  #state = CalState.IDLE;
  #phaseStart = 0;      // instante en que empezó la fase actual
  #restarts = 0;        // veces que se reinició la fase del centro por mover un stick
  #wasPushing = false;  // ¿el fotograma anterior ya estaba empujando? (para contar empujones, no fotogramas)  
  #error = null;        // null | 'no-data'

  left = new StickStats();            // centro del stick izquierdo
  right = new StickStats();
  rangeLeft = new RangeTracker();     // rango del stick izquierdo
  rangeRight = new RangeTracker();

  get state() { return this.#state; }
  get restarts() { return this.#restarts; }
  get error() { return this.#error; }

  get running() {
    return this.#state === CalState.COUNTDOWN ||
           this.#state === CalState.CENTER ||
           this.#state === CalState.RANGE;
  }

  /** Empieza de cero: borra todo y arranca la cuenta atrás. */
  start(nowMs) {
    this.#clear();
    this.#state = CalState.COUNTDOWN;
    this.#phaseStart = nowMs;
  }

  /** Cancela el asistente. Los datos recogidos hasta ahora se conservan. */
  stop() { this.#state = CalState.IDLE; }

  /** Borra los datos y vuelve al estado inicial. */
  reset() {
    this.#clear();
    this.#state = CalState.IDLE;
  }

  #clear() {
    this.left.reset();
    this.right.reset();
    this.rangeLeft.reset();
    this.rangeRight.reset();
    this.#restarts = 0;
    this.#wasPushing = false;    
    this.#error = null;
  }

  /** Se llama en cada fotograma. 's' es null si la lectura falló o no hay mando. */
  update(nowMs, s) {
    const elapsed = nowMs - this.#phaseStart;

    switch (this.#state) {
      case CalState.COUNTDOWN:
        if (elapsed >= COUNTDOWN_MS) {
          this.#state = CalState.CENTER;
          this.#phaseStart = nowMs;
        }
        break;

      case CalState.CENTER:
        if (s) {
          const pushing = Math.hypot(s.lx, s.ly) > CENTER_ABORT ||
                          Math.hypot(s.rx, s.ry) > CENTER_ABORT;
          if (pushing) {                       // se movió un stick: empezar la medición de nuevo
            this.left.reset();
            this.right.reset();
            this.#phaseStart = nowMs;
            if (!this.#wasPushing) this.#restarts++;   // cuenta cada empujón, no cada fotograma
            this.#wasPushing = true;
            break;
          }
          this.#wasPushing = false;
          this.left.add(s.lx, s.ly);
          this.right.add(s.rx, s.ry);
        } else {
          this.left.addFailed();
          this.right.addFailed();
        }
        if (elapsed >= CENTER_MS) this.#finishCenter(nowMs);
        break;      

      case CalState.RANGE:
        if (s) {
          this.rangeLeft.add(s.lx, s.ly);
          this.rangeRight.add(s.rx, s.ry);
          if (this.rangeLeft.complete && this.rangeRight.complete) {
            this.#state = CalState.DONE;
          }
        }
        break;

      default:
        break;   // IDLE y DONE: no hacen nada
    }
  }

  #finishCenter(nowMs) {
    if (!measureCenter(this.left) || !measureCenter(this.right)) {
      this.#state = CalState.IDLE;             // casi no hubo lecturas válidas
      this.#error = 'no-data';
      return;
    }
    this.#state = CalState.RANGE;
    this.#phaseStart = nowMs;
  }

  /** Segundos que faltan de la cuenta atrás. */
  countdownRemainingSec(nowMs) {
    const remaining = COUNTDOWN_MS - (nowMs - this.#phaseStart);
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /** Progreso de la medición del centro, de 0 a 1. */
  centerProgress(nowMs) {
    if (this.#state !== CalState.CENTER) return this.#state === CalState.RANGE ||
                                                this.#state === CalState.DONE ? 1 : 0;
    return Math.min(1, (nowMs - this.#phaseStart) / CENTER_MS);
  }

  /** Resultado completo por stick; null hasta que el asistente termina. */
  get result() {
    if (this.#state !== CalState.DONE) return null;
    const side = (stats, range) => {
      const center = measureCenter(stats);
      return { center, range: measureRange(range), deadzone: suggestDeadzone(center) };
    };
    return {
      left: side(this.left, this.rangeLeft),
      right: side(this.right, this.rangeRight),
    };
  }
}