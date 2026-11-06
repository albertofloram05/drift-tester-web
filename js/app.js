import { GamepadReader } from './gamepadReader.js';
import { DriftTester, State } from './driftTester.js';
import { evaluate } from './evaluator.js';
import { MotionAnalyzer, observe } from './motionAnalyzer.js';
import { CalibrationWizard, CalState } from './calibrationWizard.js';
import { RangeTracker, observeCalibration } from './calibration.js';
import { ButtonTracker } from './buttonTracker.js';
import { drawStick, formatStats, formatMotion, setVerdict, drawGraph,
         drawMotionGraph, setObservations, formatCalibration,
         updatePad, resetPadView, TRAIL_MS } from './render.js';
import { buildResult, save, count, clear, loadAll, downloadCsv } from './history.js';

const reader = new GamepadReader();
const tester = new DriftTester();
const motionL = new MotionAnalyzer();
const motionR = new MotionAnalyzer();
const wizard = new CalibrationWizard();
const buttons = new ButtonTracker();

let mode = 'static';          // 'static' | 'motion' | 'calibration' | 'buttons'
let threshold = 0.05;
let savedThisTest = true;     // evita guardar la misma prueba varias veces
let testPadName = '';         // mando con el que se inició la prueba

const trailL = [];            // posiciones recientes de cada stick
const trailR = [];

// ---- Elementos de la página ----
const $ = id => document.getElementById(id);
const connectionEl = $('connection');
const statusEl = $('status');
const startBtn = $('startBtn');
const durationEl = $('duration');
const thresholdEl = $('threshold');
const historyCountEl = $('historyCount');
const historyMsgEl = $('historyMsg');
const helpEl = $('help');
const calStatusEl = $('calStatus');
const calStartBtn = $('calStartBtn');
const calBarEl = $('calBar');
const calStepEls = document.querySelectorAll('#calSteps li');
const padNoteEl = $('padNote');

// ---- Eventos de los controles ----
startBtn.addEventListener('click', () => {
  if (tester.running) {
    tester.stop();
  } else {
    testPadName = reader.name();
    savedThisTest = false;
    tester.start(performance.now());
  }
});

$('resetBtn').addEventListener('click', () => tester.reset());

durationEl.addEventListener('change', () =>
  tester.setDurationSec(Number(durationEl.value)));

thresholdEl.addEventListener('input', () => {
  const v = Number(thresholdEl.value);
  if (v >= 0.01 && v <= 0.30) threshold = v;   // ignora valores fuera de rango
});

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

$('modeStatic').addEventListener('click', () => setMode('static'));
$('modeMotion').addEventListener('click', () => setMode('motion'));
$('modeCalibration').addEventListener('click', () => setMode('calibration'));
$('modeButtons').addEventListener('click', () => setMode('buttons'));
$('motionResetBtn').addEventListener('click', resetMotion);

calStartBtn.addEventListener('click', () => {
  if (wizard.running) wizard.stop();
  else wizard.start(performance.now());
});
$('calResetBtn').addEventListener('click', () => wizard.reset());
$('padClearBtn').addEventListener('click', clearButtons);

// ---- Modos ----
function setMode(newMode) {
  if (newMode === mode) return;
  if (newMode !== 'static' && tester.running) tester.stop();   // no dejar una prueba a medias

  mode = newMode;
  document.body.dataset.mode = mode;     // el CSS muestra u oculta según este atributo
  $('modeStatic').classList.toggle('active', mode === 'static');
  $('modeMotion').classList.toggle('active', mode === 'motion');
  $('modeCalibration').classList.toggle('active', mode === 'calibration');
  $('modeButtons').classList.toggle('active', mode === 'buttons');
  resetMotion();
  wizard.reset();
  clearButtons();
}

function clearButtons() {
  buttons.reset();
  resetPadView();
}

function resetMotion() {
  motionL.reset();
  motionR.reset();
}

// ---- Bucle principal ----
function frame(now) {
  requestAnimationFrame(frame);   // primero: el bucle sobrevive a cualquier error

  const connected = reader.detect();
  const s = reader.read(now);

  // Cada modo procesa la muestra a su manera
  if (mode === 'static') {
    tester.update(now, s);
  } else if (mode === 'motion') {
    if (s) {
      motionL.update(now, s.lx, s.ly);
      motionR.update(now, s.rx, s.ry);
    }
  } else if (mode === 'calibration') {
    wizard.update(now, s);
  } else {
    buttons.update(now, reader.readButtons());
  }

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

  if (mode === 'static') {
    const done = tester.state === State.DONE;

    drawStick($('canvasL'), cur.l.x, cur.l.y, tester.left, trailL, now);
    drawStick($('canvasR'), cur.r.x, cur.r.y, tester.right, trailR, now);

    const scaleL = drawGraph($('graphL'), tester.left, threshold);
    const scaleR = drawGraph($('graphR'), tester.right, threshold);
    $('scaleL').textContent = `(escala 0 – ${scaleL.toFixed(2)}${tester.left.maxRadius > scaleL ? ', recortada' : ''})`;
    $('scaleR').textContent = `(escala 0 – ${scaleR.toFixed(2)}${tester.right.maxRadius > scaleR ? ', recortada' : ''})`;

    $('statsL').textContent = formatStats(cur.l, tester.left, threshold);
    $('statsR').textContent = formatStats(cur.r, tester.right, threshold);
    setVerdict($('verdictL'), done ? evaluate(tester.left, threshold) : null);
    setVerdict($('verdictR'), done ? evaluate(tester.right, threshold) : null);
  } else if (mode === 'motion') {
    drawStick($('canvasL'), cur.l.x, cur.l.y, null, trailL, now, motionL.sectorReach);
    drawStick($('canvasR'), cur.r.x, cur.r.y, null, trailR, now, motionR.sectorReach);

    drawMotionGraph($('motionGraphL'), motionL.recent, now);
    drawMotionGraph($('motionGraphR'), motionR.recent, now);

    $('motionL').textContent = formatMotion(motionL);
    $('motionR').textContent = formatMotion(motionR);

    setObservations($('obsL'), observe(motionL));
    setObservations($('obsR'), observe(motionR));
  } else if (mode === 'calibration') {
    // Calibración: el anillo muestra el recorrido (verde = llegó al borde) y la marca amarilla, el centro medido
    drawStick($('canvasL'), cur.l.x, cur.l.y, wizard.left, trailL, now, wizard.rangeLeft.sectorReach);
    drawStick($('canvasR'), cur.r.x, cur.r.y, wizard.right, trailR, now, wizard.rangeRight.sectorReach);
    updateCalibrationUi(now, connected);

    const result = wizard.result;    // null hasta que el asistente termina
    $('calL').textContent = formatCalibration(result?.left);
    $('calR').textContent = formatCalibration(result?.right);
    setObservations($('calObsL'), result ? observeCalibration(result.left) : []);
    setObservations($('calObsR'), result ? observeCalibration(result.right) : []);
  } else {
    updatePad(buttons, s, connected);
    padNoteEl.textContent = padNoteText(connected);
  }
}

/** Aviso bajo el mando dibujado: mapeo no estándar o botones que pueden no llegar. */
function padNoteText(connected) {
  if (!connected) return '';
  if (reader.mapping() !== 'standard') {
    return '⚠ Este mando no usa el mapeo estándar: los botones del dibujo pueden no corresponder con los reales.';
  }
  return 'El botón PS y el panel táctil pueden no llegar al navegador: depende del sistema y del navegador.';
}


/** Añade una posición a la estela y descarta las más antiguas. */
function pushTrail(trail, x, y, now) {
  trail.push({ x, y, t: now });
  while (trail.length > 0 && now - trail[0].t > TRAIL_MS) {
    trail.shift();
  }
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
  startBtn.disabled = !connected && !running;
  durationEl.disabled = running;

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

/** Actualiza el panel del modo calibración: texto, pasos, barra y botón. */
function updateCalibrationUi(now, connected) {
  const running = wizard.running;
  calStartBtn.textContent = running ? 'Detener' : 'Iniciar calibración';
  calStartBtn.disabled = !connected && !running;

  const total = RangeTracker.SECTORS;
  const left = wizard.rangeLeft.explored;
  const right = wizard.rangeRight.explored;

  let text = '';
  let progress = 0;    // de 0 a 1 sobre las dos fases: el centro vale la mitad y el rango la otra mitad
  let step = -1;       // paso resaltado: 0 centro, 1 rango, 2 resultado; -1 ninguno

  switch (wizard.state) {
    case CalState.IDLE:
      text = wizard.error === 'no-data'
        ? 'No llegaron lecturas del mando. Comprueba la conexión y vuelve a intentarlo.'
        : connected ? 'Listo. Pulsa «Iniciar calibración».' : 'Conecta un mando';
      break;
    case CalState.COUNTDOWN:
      text = `Suelta los dos sticks... ${wizard.countdownRemainingSec(now)}`;
      step = 0;
      break;
    case CalState.CENTER:
      text = 'Midiendo el centro: no toques los sticks.' +
             (wizard.restarts > 0 ? ` Se movió un stick y la medición ha vuelto a empezar (${wizard.restarts}).` : '');
      progress = wizard.centerProgress(now) * 0.5;
      step = 0;
      break;
    case CalState.RANGE:
      text = 'Gira los dos sticks por todo el borde, hasta el tope. ' +
             `Zonas recorridas: izquierdo ${left}/${total}, derecho ${right}/${total}`;
      progress = 0.5 + 0.5 * (left + right) / (2 * total);
      step = 1;
      break;
    case CalState.DONE:
      text = 'Calibración terminada. Revisa los resultados de cada stick.';
      progress = 1;
      step = 2;
      break;
  }

  calStatusEl.textContent = text;

  const pct = Math.round(progress * 100);
  calBarEl.style.width = `${pct}%`;
  calBarEl.parentElement.setAttribute('aria-valuenow', pct);

  calStepEls.forEach((li, i) => {
    li.classList.toggle('done', i < step);
    li.classList.toggle('active', i === step);
  });
}

// ---- Historial ----
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

refreshHistory();
requestAnimationFrame(frame);