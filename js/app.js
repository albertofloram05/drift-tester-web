import { GamepadReader } from './gamepadReader.js';
import { DriftTester, State } from './driftTester.js';
import { evaluate } from './evaluator.js';
import { MotionAnalyzer, observe } from './motionAnalyzer.js';
import { CalibrationWizard, CalState } from './calibrationWizard.js';
import { RangeTracker, observeCalibration } from './calibration.js';
import { ButtonTracker } from './buttonTracker.js';
import { drawStick, formatStats, formatMotion, setVerdict, drawGraph,
         drawMotionGraph, setObservations, formatCalibration,
         updatePad, resetPadView, describePadDiagnostic, padNoteText, TRAIL_MS } from './render.js';
import { buildResult, save, saveStatusText, count, clear, loadAll, storageStatus, downloadCsv,
         removeById, deleteConfirmText, deleteStatusText,
         filterRows, hasActiveFilters, countTests, historyCountText, emptyStateText,
         isValidRecord, csvFileName, exportStatusText, exportAllText,
         normalizeLabel, setLabelById, labelStatusText, labelPromptText } from './history.js';
import { DeadzoneAnalyzer, applyDeadzone } from './deadzone.js';
import { formatDeadzone } from './render.js';
import { historyRows } from './history.js';
import { renderHistoryTable, VERDICT } from './render.js';
import { toggleSelection, pruneSelection, selectionText, limitText, buildItems, defaultReference, summaryText,
         referenceText, relationText, comparabilityNotes, DISCLAIMER } from './compare.js';
import { renderCompareTable, renderReferenceSelect, renderNotes } from './compareView.js';
import { connectionAnnouncement, testAnnouncement, calibrationAnnouncement, stickDescriptionId } from './a11y.js';

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
let testPadLabel = '';        // nombre personalizado que tenía el campo al iniciar la prueba

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
const historyBodyEl = $('historyBody');
const helpEl = $('help');
const calStatusEl = $('calStatus');
const calStartBtn = $('calStartBtn');
const calBarEl = $('calBar');
const calStepEls = document.querySelectorAll('#calSteps li');
const padNoteEl = $('padNote');
const padDiagEl = $('padDiag');
const a11yEl = $('a11yStatus');   // región aria-live: solo recibe avisos de cambios de estado

let lastConnected = null;         // para anunciar solo cuando cambia
let lastTestState = tester.state;
let lastCalState = wizard.state;

// ---- Modo zona muerta ----
const dzStats = new DeadzoneAnalyzer();
let dzStick = 'left';         // 'left' | 'right'
let dzValue = 0.10;           // zona muerta de 0 a 0,30
let dzRunning = false;        // ¿se están acumulando estadísticas?
let dzLostPad = false;        // ¿se paró la prueba porque el mando dejó de dar lecturas?
const dzStickEl = $('dzStick');
const dzSliderEl = $('dzSlider');
const dzValueEl = $('dzValue');
const dzStartBtn = $('dzStartBtn');
const dzStatusEl = $('dzStatus');

// ---- Eventos de los controles ----
startBtn.addEventListener('click', () => {
  if (tester.running) {
    tester.stop();
  } else {
    testPadName = reader.name();
    testPadLabel = normalizeLabel($('padLabel').value);   // se fija al empezar: cambiarlo durante la prueba no afecta
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
  const valid = all.filter(isValidRecord);          // las dañadas se omiten y se avisa de cuántas
  if (valid.length > 0) downloadCsv(valid);
  showHistoryMsg(exportAllText(all.length, valid.length));
});

// Cambiar el nombre del mando de UNA prueba (botón «Nombre» de su fila)
historyBodyEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action="rename"]');
  if (!btn) return;

  const row = historyRows(loadAll()).find(r => r.id === btn.dataset.id);
  if (!row) {                                    // ya no existe (otra pestaña, por ejemplo)
    showHistoryMsg(labelStatusText({ ok: false, reason: 'notfound' }));
    refreshHistory();
    return;
  }
  const answer = prompt(labelPromptText(row), row.label);
  if (answer === null) return;                   // canceló: no se cambia nada

  const res = setLabelById(row.id, answer);
  showHistoryMsg(labelStatusText(res));
  refreshHistory();

  // La tabla se repinta: el foco vuelve al botón de la misma prueba (o a «Exportar CSV» si un filtro la oculta)
  (historyBodyEl.querySelector(`button[data-action="rename"][data-id="${CSS.escape(row.id)}"]`)
    ?? $('exportBtn')).focus();
});

// Exportar UNA prueba a CSV (botón «CSV» de su fila; no afecta a los filtros ni a los datos)
historyBodyEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action="export"]');
  if (!btn) return;

  const record = loadAll().find(r => r?.id === btn.dataset.id);
  if (!record) {
    showHistoryMsg(exportStatusText({ ok: false, reason: 'notfound' }));
    refreshHistory();
    return;
  }
  if (!isValidRecord(record)) {
    showHistoryMsg(exportStatusText({ ok: false, reason: 'invalid' }));
    return;
  }
  downloadCsv([record], csvFileName(record.dateTime));
  showHistoryMsg(exportStatusText({ ok: true, dateTime: record.dateTime }));
});

$('clearBtn').addEventListener('click', () => {
  if (count() === 0 && storageStatus() === 'ok') return;   // si está dañado, sí se deja borrar
  if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
  const ok = clear();
  refreshHistory();
  showHistoryMsg(ok ? 'Historial borrado.'
                    : 'No se pudo borrar el historial: el navegador bloquea el almacenamiento.');
});

// Eliminar una prueba: un solo escuchador sobre la tabla (los botones se recrean al repintar)
historyBodyEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;

  const row = historyRows(loadAll()).find(r => r.id === btn.dataset.id);
  if (!row) {                                    // ya no existe (otra pestaña, por ejemplo)
    showHistoryMsg(deleteStatusText({ ok: false, reason: 'notfound' }));
    // Los ids «legacy-N» dependen de la posición: al eliminar una prueba se desplazan, así que se sueltan
    selected = selected.filter(k => !k.startsWith('legacy-'));    
    refreshHistory();
    return;
  }
  if (!confirm(deleteConfirmText(row))) return;

  const position = [...historyBodyEl.querySelectorAll('button[data-action="delete"]')].indexOf(btn);
  const res = removeById(row.id);
  showHistoryMsg(deleteStatusText(res));
  refreshHistory();

  // El botón pulsado desaparece: se lleva el foco al siguiente (o al anterior, o a «Exportar CSV»)
  const left = historyBodyEl.querySelectorAll('button[data-action="delete"]');
  (left[Math.min(position, left.length - 1)] ?? $('exportBtn')).focus();
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
$('modeDeadzone').addEventListener('click', () => setMode('deadzone'));

dzStickEl.addEventListener('change', () => {
  dzStick = dzStickEl.value === 'right' ? 'right' : 'left';
  dzStats.reset();                        // no mezclar muestras de dos sticks
});

dzSliderEl.addEventListener('input', () => {
  const v = Number(dzSliderEl.value);
  if (!Number.isFinite(v) || v < 0 || v > 30) return;   // ignora valores fuera de rango
  dzValue = v / 100;
  dzValueEl.textContent = `${v} %`;
  dzSliderEl.setAttribute('aria-valuetext', `${v} por ciento`);
  dzStats.reset();                        // las muestras anteriores usaron otra zona muerta
});

dzStartBtn.addEventListener('click', () => {
  if (dzRunning) {
    dzRunning = false;
  } else {
    dzStats.reset();
    dzLostPad = false;
    dzRunning = true;
  }
});

$('dzResetBtn').addEventListener('click', () => { dzStats.reset(); dzLostPad = false; });

// ---- Modos ----
function setMode(newMode) {
  if (newMode === mode) return;
  if (newMode !== 'static' && tester.running) tester.stop();   // no dejar una prueba a medias

  mode = newMode;
  document.body.dataset.mode = mode;     // el CSS muestra u oculta según este atributo
  markMode('modeStatic', mode === 'static');
  markMode('modeMotion', mode === 'motion');
  markMode('modeCalibration', mode === 'calibration');
  markMode('modeButtons', mode === 'buttons');
  markMode('modeDeadzone', mode === 'deadzone');
  for (const side of ['L', 'R']) {      // cada modo describe el stick con un texto distinto
    $(`canvas${side}`).setAttribute('aria-describedby', stickDescriptionId(mode, side));
  }  
  resetMotion();
  wizard.reset();
  clearButtons();
  resetDeadzone();
}

/** Marca un botón de modo como activo (aspecto) y como pulsado (lectores de pantalla). */
function markMode(id, active) {
  const btn = $(id);
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', String(active));
}

/** Avisa al lector de pantalla. Si no hay texto, no hace nada. */
function announce(text) {
  if (text) a11yEl.textContent = text;
}

/** Anuncia los cambios de conexión, de prueba y de calibración (nunca valores que cambian en cada fotograma). */
function announceChanges(connected) {
  announce(connectionAnnouncement(lastConnected, connected, reader.name()));
  lastConnected = connected;

  if (tester.state !== lastTestState) {
    const done = tester.state === State.DONE;
    announce(testAnnouncement(lastTestState, tester.state, {
      durationSec: tester.durationSec,
      left: done ? VERDICT[evaluate(tester.left, threshold)] : '',
      right: done ? VERDICT[evaluate(tester.right, threshold)] : '',
    }));
    lastTestState = tester.state;
  }

  if (wizard.state !== lastCalState) {
    announce(calibrationAnnouncement(lastCalState, wizard.state));
    lastCalState = wizard.state;
  }
}

function clearButtons() {
  buttons.reset();
  resetPadView();
}

function resetMotion() {
  motionL.reset();
  motionR.reset();
}

// ---- Modo zona muerta: funciones ----
function resetDeadzone() {
  dzRunning = false;
  dzLostPad = false;
  dzStats.reset();
}

/** Dibuja el stick elegido con su zona muerta y actualiza textos y botones. */
function updateDeadzoneView(cur, now, connected) {
  const p = dzStick === 'left' ? cur.l : cur.r;
  const trail = dzStick === 'left' ? trailL : trailR;
  const out = applyDeadzone(p.x, p.y, dzValue);

  // La estela filtrada sale de la estela original (solo dura 500 ms)
  const filteredTrail = trail.map(t => {
    const o = applyDeadzone(t.x, t.y, dzValue);
    return { x: o.x, y: o.y, t: t.t };
  });

  drawStick($('canvasDz'), p.x, p.y, null, trail, now, null,
            { deadzone: dzValue, filteredTrail, filteredPoint: out });
  $('dzStats').textContent = formatDeadzone(dzStats, p, out, dzValue);

  dzStartBtn.textContent = dzRunning ? 'Detener' : 'Iniciar prueba';
  dzStartBtn.disabled = !connected && !dzRunning;

  const side = dzStick === 'left' ? 'izquierdo' : 'derecho';
  if (!connected) {
    dzStatusEl.textContent = dzLostPad
      ? 'El mando se ha desconectado. Prueba detenida; las estadísticas se conservan.'
      : 'Conecta un mando';
  } else if (dzRunning) {
    dzStatusEl.textContent = `Analizando el stick ${side}... muestras: ${dzStats.count}`;
  } else if (dzStats.count > 0) {
    dzStatusEl.textContent = `Prueba detenida. Muestras: ${dzStats.count}`;
  } else {
    dzStatusEl.textContent = `Listo. Mueve el stick ${side} o pulsa «Iniciar prueba».`;
  }
}

// ---- Bucle principal ----
function frame(now) {
  requestAnimationFrame(frame);   // primero: el bucle sobrevive a cualquier error

  const connected = reader.detect();
  const s = reader.read(now);
  const padButtons = mode === 'buttons' ? reader.readButtons() : null;   // solo se leen en el modo botones

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
  } else if (mode === 'deadzone') {                       // NUEVO (inicio)
    if (s) {
      if (dzRunning) {
        const p = dzStick === 'left' ? { x: s.lx, y: s.ly } : { x: s.rx, y: s.ry };
        dzStats.add(p.x, p.y, dzValue);       // ignora lecturas no válidas
      }
    } else if (dzRunning) {
      dzRunning = false;                      // el mando dejó de dar lecturas
      dzLostPad = true;
    }                                                     // NUEVO (fin)
  } else {
    buttons.update(now, padButtons);    
  }

  updateUi(now, connected);
  announceChanges(connected);
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
  } else if (mode === 'deadzone') {                       // NUEVO
    updateDeadzoneView(cur, now, connected);              // NUEVO
  } else {
    updatePad(buttons, s, connected);
    padNoteEl.textContent = padNoteText(connected, reader.mapping(), padButtons?.length ?? 0);
    padDiagEl.textContent = describePadDiagnostic(padButtons, reader.mapping());
  }
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

  const res = save(buildResult(
    testPadName, tester.durationSec, threshold, tester.left, tester.right, testPadLabel));
  showHistoryMsg(saveStatusText(res, testPadLabel));
  refreshHistory();
}

// ---- Selección para comparar (v1.6.0) ----
let selected = [];   // claves prueba|stick marcadas. Solo en memoria: no se guarda y los filtros no la cambian

function updateCompareBar() {
  $('compareCount').textContent = selectionText(selected.length);
  $('compareClearBtn').disabled = selected.length === 0;
  $('compareOpenBtn').disabled = selected.length < 2;
  renderComparator();                              // si el panel está abierto, se pone al día
}

historyBodyEl.addEventListener('change', e => {
  const box = e.target.closest('input[data-action="select"]');
  if (!box) return;
  const res = toggleSelection(selected, box.dataset.key);
  if (!res.ok) {                                   // ya hay el máximo: se deshace la marca
    box.checked = false;
    showHistoryMsg(limitText());
    return;
  }
  selected = res.keys;
  box.closest('tr').classList.toggle('selected', box.checked);
  updateCompareBar();
});

$('compareClearBtn').addEventListener('click', () => {
  selected = [];
  refreshHistory();
  showHistoryMsg('Selección limpiada.');
  $('exportBtn').focus();                          // el botón se desactiva: el foco no se pierde
});

// ---- Comparador (v1.6.0) ----
let compareOpen = false;
let compareRef = null;   // clave de la fila de referencia (null: la más antigua)
let allRows = [];        // filas de historyRows() sin filtrar

function renderComparator() {
  $('comparePanel').hidden = !compareOpen;
  if (!compareOpen) return;

  const items = buildItems(selected, allRows);
  const ready = items.length >= 2;
  $('compareSummary').textContent = summaryText(items);
  $('compareBody').hidden = !ready;
  if (!ready) return;

  if (!items.some(i => i.key === compareRef)) compareRef = defaultReference(items);
  renderReferenceSelect($('compareRef'), items, compareRef);
  $('compareRefText').textContent = referenceText(items.find(i => i.key === compareRef));
  $('compareRelation').textContent = relationText(items);
  renderNotes($('compareNotes'), comparabilityNotes(items));
  renderCompareTable($('compareTableBody'), items, compareRef);
  $('compareDisclaimer').textContent = DISCLAIMER;
}

$('compareOpenBtn').addEventListener('click', () => {
  compareOpen = true;
  renderComparator();
  $('compareTitle').focus();
});

$('compareCloseBtn').addEventListener('click', () => {
  compareOpen = false;
  renderComparator();
  ($('compareOpenBtn').disabled ? $('exportBtn') : $('compareOpenBtn')).focus();
});

$('compareRef').addEventListener('change', e => {
  compareRef = e.target.value;
  renderComparator();
});

/** Valores actuales de los controles de filtro. */
function readFilters() {
  return {
    stick: $('fStick').value,
    level: $('fLevel').value,
    from: $('fFrom').value,
    to: $('fTo').value,
    query: $('fQuery').value,
  };
}

/** Repinta contador y tabla aplicando los filtros. Los datos guardados no se tocan. */
function refreshHistory() {
  const all = loadAll();
  const rows = historyRows(all);
  selected = pruneSelection(selected, rows);      // quita lo que ya no existe (prueba eliminada, historial borrado)
  allRows = rows;                                 // el comparador resuelve la selección contra todas las filas, sin filtrar   
  const filters = readFilters();
  const filtering = hasActiveFilters(filters);
  const shown = filterRows(rows, filters);

  historyCountEl.textContent = historyCountText(all.length, filtering ? countTests(shown) : null);
  renderHistoryTable(historyBodyEl, shown, emptyStateText({
    status: storageStatus(), stored: all.length, tests: countTests(rows), filtering,
  }), selected);
  updateCompareBar();
}

// Filtros: se aplican al instante, sin recargar la página
for (const id of ['fStick', 'fLevel', 'fFrom', 'fTo', 'fQuery']) {
  $(id).addEventListener('input', refreshHistory);
}

$('fReset').addEventListener('click', () => {
  $('fStick').value = 'all';
  $('fLevel').value = 'all';
  $('fFrom').value = '';
  $('fTo').value = '';
  $('fQuery').value = '';
  refreshHistory();
  showHistoryMsg('Filtros restablecidos.');
});

function showHistoryMsg(text) {
  historyMsgEl.textContent = text;
}

refreshHistory();
requestAnimationFrame(frame);