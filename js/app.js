import { GamepadReader } from './gamepadReader.js';
import { DriftTester, State } from './driftTester.js';
import { evaluate } from './evaluator.js';
import { drawStick, formatStats, setVerdict, drawGraph, TRAIL_MS } from './render.js';
import { buildResult, save, count, clear, loadAll, downloadCsv } from './history.js';

const reader = new GamepadReader();
const tester = new DriftTester();
const trailL = [];   // posiciones recientes del stick izquierdo
const trailR = [];

let threshold = 0.05;
let savedThisTest = true;   // evita guardar la misma prueba varias veces
let testPadName = '';       // mando con el que se inició la prueba

// ---- Elementos de la página ----
const $ = id => document.getElementById(id);
const helpEl = $('help');
const connectionEl = $('connection');
const statusEl = $('status');
const startBtn = $('startBtn');
const durationEl = $('duration');
const thresholdEl = $('threshold');
const historyCountEl = $('historyCount');
const historyMsgEl = $('historyMsg');

// ---- Eventos de los controles ----
startBtn.addEventListener('click', () => {
  if (tester.running) {
    tester.stop();
  } else {
    testPadName = reader.name();   // nos quedamos con el nombre ahora
    savedThisTest = false;
    tester.start(performance.now());
  }
});

$('resetBtn').addEventListener('click', () => tester.reset());

$('exportBtn').addEventListener('click', () => {
  const all = loadAll();
  if (all.length === 0) {
    showHistoryMsg('Aún no hay pruebas guardadas.');
    return;
  }
  downloadCsv(all);
  showHistoryMsg(`Descargadas ${all.length} pruebas.`);
});

$('clearBtn').addEventListener('click', () => {
  if (count() === 0) return;
  if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
  clear();
  refreshHistory();
  showHistoryMsg('Historial borrado.');
});

durationEl.addEventListener('change', () =>
  tester.setDurationSec(Number(durationEl.value)));

thresholdEl.addEventListener('input', () => {
  const v = Number(thresholdEl.value);
  if (v >= 0.01 && v <= 0.30) threshold = v;   // ignora valores fuera de rango
});

/** Añade una posición a la estela y descarta las más antiguas. */
function pushTrail(trail, x, y, now) {
  trail.push({ x, y, t: now });
  while (trail.length > 0 && now - trail[0].t > TRAIL_MS) {
    trail.shift();
  }
}

// ---- Bucle principal ----
function frame(now) {
  const connected = reader.detect();
  const s = reader.read(now);

  tester.update(now, s);
  updateUi(now, connected);
  autoSaveIfDone();

  const cur = {
    l: { x: s?.lx ?? 0, y: s?.ly ?? 0 },
    r: { x: s?.rx ?? 0, y: s?.ry ?? 0 },
  };
  if (s) {
    pushTrail(trailL, s.lx, s.ly, now);
    pushTrail(trailR, s.rx, s.ry, now);
  } else {
    trailL.length = 0;    // sin mando no hay estela
    trailR.length = 0;
  }
  const done = tester.state === State.DONE;

  drawStick($('canvasL'), cur.l.x, cur.l.y, tester.left, trailL, now);
  drawStick($('canvasR'), cur.r.x, cur.r.y, tester.right, trailR, now);
  drawGraph($('graphL'), tester.left, threshold);
  drawGraph($('graphR'), tester.right, threshold);

  $('statsL').textContent = formatStats(cur.l, tester.left, threshold);
  $('statsR').textContent = formatStats(cur.r, tester.right, threshold);
  setVerdict($('verdictL'), done ? evaluate(tester.left, threshold) : null);
  setVerdict($('verdictR'), done ? evaluate(tester.right, threshold) : null);

  requestAnimationFrame(frame);
}

/** Actualiza textos y botones según el estado. */
function updateUi(now, connected) {
  const running = tester.running;

  connectionEl.textContent = connected
    ? `Mando: ${reader.name()}` + (reader.mapping() === 'standard' ? '' : '  (⚠ mapeo no estándar)')
    : 'Sin mando. Conéctalo y pulsa un botón.';
  
  connectionEl.classList.toggle('ok', connected);
  helpEl.hidden = connected;   // la ayuda solo se ve sin mando
  
  startBtn.textContent = running ? 'Detener' : 'Iniciar prueba';
  startBtn.disabled = !connected && !running;   // sin mando no se puede iniciar
  durationEl.disabled = running;                // no cambiar duración a mitad

  switch (tester.state) {
    case State.IDLE:
      statusEl.textContent = connected ? 'Listo. Pulsa «Iniciar prueba».' : 'Conecta un mando';
      break;
    case State.COUNTDOWN:
      statusEl.textContent = `Suelta los dos sticks... ${tester.countdownRemainingSec(now)}`;
      break;
    case State.RECORDING:
      statusEl.textContent =
        `Grabando: ${(tester.recordingElapsedMs(now) / 1000).toFixed(1)} / ${tester.durationSec} s` +
        `   |   muestras: ${tester.left.count}`;
      break;
    case State.DONE:
      statusEl.textContent = `Prueba terminada. Muestras: ${tester.left.count}`;
      break;
  }
}

/** Guarda el resultado una sola vez, en cuanto la prueba pasa a DONE. */
function autoSaveIfDone() {
  if (tester.state !== State.DONE || savedThisTest) return;
  savedThisTest = true;

  const ok = save(buildResult(
    testPadName, tester.durationSec, threshold, tester.left, tester.right));
  showHistoryMsg(ok ? 'Prueba guardada en el historial.'
                    : 'No se pudo guardar: el navegador bloquea el almacenamiento.');
  refreshHistory();
}

function refreshHistory() {
  historyCountEl.textContent = `Pruebas guardadas: ${count()}`;
}

function showHistoryMsg(text) {
  historyMsgEl.textContent = text;
}

requestAnimationFrame(frame);