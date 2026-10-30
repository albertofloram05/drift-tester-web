import { StickStats } from './stickStats.js';

export const State = Object.freeze({
  IDLE: 'IDLE',
  COUNTDOWN: 'COUNTDOWN',
  RECORDING: 'RECORDING',
  DONE: 'DONE',
});

const COUNTDOWN_MS = 5000;                 // cuenta atrás de 5 s
const VALID_DURATIONS = [10, 30, 60, 120]; // duraciones permitidas (s)

export class DriftTester {
  #state = State.IDLE;
  #phaseStart = 0;       // instante en que empezó la fase actual
  #durationSec = 30;     // duración de la grabación (configurable)

  left = new StickStats();
  right = new StickStats();

  get state() { return this.#state; }
  get durationSec() { return this.#durationSec; }

  get running() {
    return this.#state === State.COUNTDOWN || this.#state === State.RECORDING;
  }

  /** Inicia la prueba: borra datos anteriores y arranca la cuenta atrás. */
  start(nowMs) {
    this.left.reset();
    this.right.reset();
    this.#state = State.COUNTDOWN;
    this.#phaseStart = nowMs;
  }

  /** Cancela la prueba. Los datos recogidos hasta ahora se conservan. */
  stop() { this.#state = State.IDLE; }

  /** Borra los datos y vuelve al estado inicial. */
  reset() {
    this.left.reset();
    this.right.reset();
    this.#state = State.IDLE;
  }

  /** Se llama en cada fotograma. 's' es null si la lectura falló o no hay mando. */
  update(nowMs, s) {
    const elapsed = nowMs - this.#phaseStart;

    switch (this.#state) {
      case State.COUNTDOWN:
        if (elapsed >= COUNTDOWN_MS) {
          this.#state = State.RECORDING;
          this.#phaseStart = nowMs;   // la grabación cuenta desde cero
        }
        break;

      case State.RECORDING:
        if (s) {
          this.left.add(s.lx, s.ly);
          this.right.add(s.rx, s.ry);
        } else {
          this.left.addFailed();
          this.right.addFailed();
        }
        if (elapsed >= this.#durationSec * 1000) this.#state = State.DONE;
        break;

      default:
        break;   // IDLE y DONE: no hacen nada
    }
  }

  /** Solo se puede cambiar con la prueba parada o terminada. */
  setDurationSec(sec) {
    if (this.running) return;
    if (!VALID_DURATIONS.includes(sec)) {
      throw new RangeError(`Duración no válida: ${sec}`);
    }
    this.#durationSec = sec;
  }

  /** Segundos que faltan de la cuenta atrás. */
  countdownRemainingSec(nowMs) {
    const remaining = COUNTDOWN_MS - (nowMs - this.#phaseStart);
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /** Milisegundos transcurridos en la grabación. */
  recordingElapsedMs(nowMs) {
    return this.#state === State.RECORDING ? nowMs - this.#phaseStart : 0;
  }
}