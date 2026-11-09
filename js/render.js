/** Borra el canvas entero (en píxeles reales) y deja la escala lista para dibujar en píxeles CSS. */
function clearCanvas(ctx, canvas, dpr) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);               // sin escala: píxeles reales del canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);  // borra TODO el buffer, hasta la última fila
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);            // ahora sí, dibujar en píxeles CSS
}

export const TRAIL_MS = 500;   // cuánto tiempo recordamos el recorrido
import { MotionAnalyzer } from './motionAnalyzer.js';
import { BUTTONS, labelOf } from './buttonTracker.js';
import { rowKey } from './compare.js';

/** Dibuja un stick en su canvas. x e y van de -1 a 1. */
/** Dibuja un stick. 'stats' y 'sectors' pueden ser null según el modo. */
export function drawStick(canvas, x, y, stats, trail, now, sectors = null, overlay = null) {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  if (size === 0) return;

  const px = Math.round(size * dpr);
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }

  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, canvas, dpr);

  const c = size / 2;
  const r = size * 0.4;

  // Círculo exterior (límites del movimiento)
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cruz central (punto neutro ideal)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c - r, c); ctx.lineTo(c + r, c);
  ctx.moveTo(c, c - r); ctx.lineTo(c, c + r);
  ctx.stroke();

  // Anillo de sectores (solo modo movimiento)
  if (sectors) {
    const step = (Math.PI * 2) / sectors.length;
    ctx.lineWidth = 7;
    sectors.forEach((reach, i) => {
      const a0 = -Math.PI + i * step + 0.05;       // mismo reparto que MotionAnalyzer
      const a1 = -Math.PI + (i + 1) * step - 0.05;
      ctx.strokeStyle = reach >= MotionAnalyzer.EXTREME ? '#22c55e'   // llegó al extremo
                      : reach > 0.2 ? '#f59e0b'                       // se movió, sin llegar
                      : '#252c3a';                                    // sin explorar
      ctx.beginPath();
      ctx.arc(c, c, size * 0.455, a0, a1);
      ctx.stroke();
    });
  }

  // Centro medio calculado (marca amarilla), solo si hay datos de prueba
  if (stats && stats.count > 0) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(c + stats.meanX * r, c + stats.meanY * r, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Estela: más transparente cuanto más antigua
  for (const p of trail) {
    const alpha = 1 - (now - p.t) / TRAIL_MS;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(59, 130, 246, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(c + p.x * r, c + p.y * r, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Posición actual (punto blanco)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c + x * r, c + y * r, 6, 0, Math.PI * 2);
  ctx.fill();

  // Modo zona muerta: círculo de la zona muerta y movimiento filtrado (verde)
  if (overlay) {
    if (overlay.deadzone > 0) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(c, c, overlay.deadzone * r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const p of overlay.filteredTrail ?? []) {
      const alpha = 1 - (now - p.t) / TRAIL_MS;
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(34, 197, 94, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(c + p.x * r, c + p.y * r, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (overlay.filteredPoint) {
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c + overlay.filteredPoint.x * r, c + overlay.filteredPoint.y * r, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}  

/** Número con signo y tres decimales: +0.012, -0.004 */
const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(3);

export const VERDICT = {
  NORMAL: 'NORMAL',
  POSSIBLE_DRIFT: 'POSIBLE DRIFT',
  SIGNIFICANT_DRIFT: 'DRIFT SIGNIFICATIVO',
};

/** Texto de estadísticas de un stick (sin el veredicto). */
export function formatStats(cur, stats, threshold) {
  const lines = [`Actual:   X ${sgn(cur.x)}  Y ${sgn(cur.y)}`];

  if (stats.count === 0) {
    lines.push('Sin datos de prueba');
    return lines.join('\n');
  }

  lines.push(
    `Media:    X ${sgn(stats.meanX)}  Y ${sgn(stats.meanY)}`,
    `Sesgo:    ${stats.centerOffset.toFixed(3)} (${(stats.centerOffset * 100).toFixed(1)} %)`,
    `Desv.est: ${stats.stdDev.toFixed(3)}`,
    `Dist.máx: ${stats.maxRadius.toFixed(3)}`,
    `> umbral: ${stats.percentAboveThreshold(threshold).toFixed(1)} %`,
    `Fluct.:   ${stats.fluctuations}`,
    `Válidas:  ${stats.validPercent.toFixed(1)} %`,
  );
  return lines.join('\n');
}

/** Muestra u oculta el veredicto y le pone la clase de color. */
/** Muestra u oculta el veredicto y le pone la clase de color. */
export function setVerdict(el, level) {
  if (!level) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = VERDICT[level];

  // classList modifica solo lo necesario y conserva las demás clases (static-only...)
  el.classList.remove('normal', 'possible_drift', 'significant_drift');
  el.classList.add(level.toLowerCase());
}

/** Gráfica de la distancia al centro. Devuelve la escala vertical usada. */
export function drawGraph(canvas, stats, threshold) {
  // Ajustar la resolución interna al tamaño real en pantalla (nitidez)
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return 0;     // oculto: nada que dibujar

  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;                  // solo si cambió: asignarlo borra el canvas
    canvas.height = bh;
  }

  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, canvas, dpr);

  // Escala vertical: se adapta, pero nunca baja de 0.10
  const scaleMax = Math.min(0.30, Math.max(0.10, threshold * 1.5, stats.maxRadius * 1.2));

  // Línea del umbral (discontinua, naranja)
  const PAD = 1;   // margen en píxeles CSS, para que el trazo no se corte en el borde
  const yOf = v => h - PAD - Math.min(v / scaleMax, 1) * (h - 2 * PAD);
  const ty = yOf(threshold);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, ty);
  ctx.lineTo(w, ty);
  ctx.stroke();
  ctx.setLineDash([]);

  const n = stats.count;
  if (n < 2) return scaleMax;           // sin datos suficientes no hay curva

  // Resumimos las n muestras en tantas columnas como píxeles haya
  const columns = Math.min(n, Math.floor(w));
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let c = 0; c < columns; c++) {
    const from = Math.floor(c * n / columns);
    let to = Math.floor((c + 1) * n / columns);
    if (to <= from) to = from + 1;

    let sum = 0;
    for (let i = from; i < to; i++) sum += stats.distanceAt(i);
    const avg = sum / (to - from);

    const px = c * w / (columns - 1);
    const py = yOf(avg);
    if (c === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  return scaleMax;
}

/** Texto del modo movimiento para un stick. */
export function formatMotion(m) {
  const lines = [
    `Alcance máx: ${m.maxReach.toFixed(3)}`,
    `Sectores:    ${m.sectorsReached} / ${m.sectorReach.length}`,
    `Picos:       ${m.spikes}`,
    `Sueltas:     ${m.returns.length}`,
  ];
  if (m.returns.length > 0) {
    lines.push(
      `Residuo med: ${m.avgResidual.toFixed(3)}`,
      `Residuo máx: ${m.maxResidual.toFixed(3)}`,
    );
  }
  return lines.join('\n');
}

/** Texto de resultados del modo calibración para un stick ({ center, range, deadzone }). */
export function formatCalibration(side) {
  if (!side || !side.center) return 'Sin resultados todavía';

  const { center: c, range: r, deadzone: d } = side;
  const pct = v => `${Math.round(v * 100)} %`;
  const circ = r.circularity === null ? '—' : r.circularity.toFixed(3);

  return [
    `Centro:       X ${sgn(c.x)}  Y ${sgn(c.y)}`,
    `Sesgo:        ${c.offset.toFixed(3)} (${(c.offset * 100).toFixed(1)} %)`,
    `Ruido:        ${c.noise.toFixed(3)}`,
    `Alcance máx:  ${r.maxReach.toFixed(3)}`,
    `Circularidad: ${circ}`,
    `Zona muerta:  ${d.deadzone.toFixed(2)} (${pct(d.deadzone)})`,
    `Recentrando:  ${d.recentered.toFixed(2)} (${pct(d.recentered)})`,
  ].join('\n');
}

/** Gráfica de X e Y de los últimos segundos. Valores de -1 a 1; positivo arriba. */
export function drawMotionGraph(canvas, recent, now) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, canvas, dpr);

  const mid = h / 2;
  const yOf = v => mid - v * mid * 0.94;     // 0,94 deja un margen para el grosor de la línea

  // Línea del centro (0)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  // Líneas del "extremo" (±0,9), discontinuas y discretas
  ctx.strokeStyle = '#2f3640';
  ctx.setLineDash([4, 4]);
  for (const v of [MotionAnalyzer.EXTREME, -MotionAnalyzer.EXTREME]) {
    ctx.beginPath();
    ctx.moveTo(0, yOf(v));
    ctx.lineTo(w, yOf(v));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Una línea por eje. A la derecha está "ahora"; a la izquierda, hace 10 s.
  const plot = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const p of recent) {
      const px = w - (now - p.t) / MotionAnalyzer.WINDOW_MS * w;
      if (px < 0) continue;                  // más antiguo que la ventana
      const py = yOf(p[key]);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  plot('x', '#3b82f6');
  plot('y', '#f472b6');
}

/** Pinta la lista de observaciones, solo si ha cambiado algo. */
export function setObservations(el, list) {
  const sig = list.map(o => o.level + o.text).join('|');
  if (el.dataset.sig === sig) return;        // nada nuevo: no tocamos el HTML
  el.dataset.sig = sig;

  el.replaceChildren(...list.map(o => {
    const li = document.createElement('li');
    li.className = o.level;                    // ok | info | warn
    li.textContent = o.text;
    return li;
  }));
}


// ---------- Modo botones ----------

const PAD_STICK_TRAVEL = 12;   // cuánto se desplaza la tapa de un stick del dibujo (unidades del SVG)
const LOG_SHOWN = 100;         // sucesos que se muestran en la lista (el más reciente arriba)

/** Tiempo del registro: 12340 -> '12.340 s'. */
export function formatPadTime(ms) {
  return `${(ms / 1000).toFixed(3)} s`;
}

/** Duración de una pulsación: 300 -> '300 ms'; 1250 -> '1.25 s'. */
export function formatHeld(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Texto de un suceso del registro: 'Cruz (X) pulsado' o 'Cruz (X) soltado (300 ms)'. */
export function describeButtonEvent(e) {
  const name = labelOf(e.id);
  return e.type === 'press' ? `${name} pulsado` : `${name} soltado (${formatHeld(e.heldMs)})`;
}

/**
 * Cuánto se mueve la tapa del stick dibujado. x e y van de -1 a 1; si el mando da más de 1
 * en una esquina, se recorta al círculo para que la tapa no se salga de su base.
 */
export function stickOffset(x, y, travel = PAD_STICK_TRAVEL) {
  const d = Math.hypot(x, y);
  const k = d > 1 ? 1 / d : 1;
  return { dx: x * k * travel, dy: y * k * travel };
}

let padEls = null;   // elementos del dibujo: se buscan una sola vez, no en cada fotograma

function padElements() {
  if (padEls) return padEls;
  const keys = new Map();
  const fills = new Map();
  for (const b of BUTTONS) {
    keys.set(b.id, document.querySelector(`#padSvg [data-key="${b.id}"]`));
    if (b.analog) fills.set(b.id, document.querySelector(`#padSvg [data-fill="${b.id}"]`));
  }
  padEls = {
    keys, fills,
    svg: document.getElementById('padSvg'),
    lastV: new Map(),     // último valor escrito en cada gatillo, para no repetir escrituras
    stickL: document.getElementById('padStickL'),
    stickR: document.getElementById('padStickR'),
    sig: '',              // firma de lo que muestra el registro, para repintarlo solo si cambia
  };
  return padEls;
}

/** Fuerza a repintar el registro en el próximo fotograma (se llama tras borrarlo). */
export function resetPadView() {
  if (padEls) padEls.sig = '';
}

/**
 * Actualiza el mando dibujado y el registro. 's' son los ejes (o null si no hay lectura)
 * y 'connected' dice si hay un mando conectado.
 */
export function updatePad(tracker, s, connected) {
  const el = padElements();
  let present = 0;

  el.svg.classList.toggle('idle', !connected);      // sin mando, el dibujo entero se atenúa

  for (const b of BUTTONS) {
    const st = tracker.state(b.id);
    const key = el.keys.get(b.id);
    key.classList.toggle('pressed', st.down);
    key.classList.toggle('missing', connected && !st.present);   // un mando conectado que no envía este botón
    if (st.present) present++;

    const fill = el.fills.get(b.id);                // gatillos: relleno según cuánto se aprietan
    if (fill && el.lastV.get(b.id) !== st.value) {
      fill.style.setProperty('--v', st.value);
      el.lastV.set(b.id, st.value);
    }
  }

  const l = stickOffset(s?.lx ?? 0, s?.ly ?? 0);
  const r = stickOffset(s?.rx ?? 0, s?.ry ?? 0);
  el.stickL.style.transform = `translate(${l.dx.toFixed(1)}px, ${l.dy.toFixed(1)}px)`;
  el.stickR.style.transform = `translate(${r.dx.toFixed(1)}px, ${r.dy.toFixed(1)}px)`;

  renderPadLog(tracker, present, el);
}

/** Repinta la lista del registro y los contadores, solo si algo ha cambiado. */
function renderPadLog(tracker, present, el) {
  const log = tracker.log;
  const last = log[log.length - 1];
  const sig = [log.length, tracker.totalPresses, present, last?.t, last?.id, last?.type].join('|');
  if (sig === el.sig) return;
  el.sig = sig;

  document.getElementById('padSummary').textContent = `Pulsaciones totales: ${tracker.totalPresses}`;

  const items = log.slice(-LOG_SHOWN).reverse().map(e => {
    const li = document.createElement('li');
    li.className = e.type;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = formatPadTime(e.t);
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = describeButtonEvent(e);
    li.append(t, what);
    return li;
  });
  document.getElementById('padLog').replaceChildren(...items);

  const counts = BUTTONS.map(b => {
    const st = tracker.state(b.id);
    const li = document.createElement('li');
    li.className = !st.present ? 'absent' : st.count === 0 ? 'zero' : '';
    const name = document.createElement('span');
    name.textContent = b.label;
    const n = document.createElement('b');
    n.textContent = st.count;
    li.append(name, n);
    return li;
  });
  document.getElementById('padCounts').replaceChildren(...counts);
}


/** Texto de diagnóstico: cuántos botones envía el navegador y cuáles están pulsados (por índice). */
export function describePadDiagnostic(snapshot, mapping) {
  if (!snapshot) return 'Sin mando conectado.';
  const pressed = snapshot.flatMap((b, i) => (b.pressed ? [i] : []));
  return `Mapeo: ${mapping === 'standard' ? 'estándar' : 'no estándar'} · ` +
         `Botones que envía el navegador: ${snapshot.length} · ` +
         `Pulsados ahora (índice): ${pressed.length ? pressed.join(', ') : 'ninguno'}`;
}


/**
 * Aviso bajo el mando dibujado. 'buttonCount' es el número de botones que envía el navegador:
 * el estándar son 17 (índices 0–16), y el panel táctil sería el 18.º (índice 17), si se envía.
 */
export function padNoteText(connected, mapping, buttonCount) {
  if (!connected) return '';
  if (mapping !== 'standard') {
    return '⚠ Este mando no usa el mapeo estándar: los botones del dibujo pueden no corresponder con los reales.';
  }
  if (buttonCount <= 17) {
    return `Este navegador no envía el panel táctil (el mando reporta ${buttonCount} botones), ` +
           'así que no puede registrarse aquí. El botón PS puede no llegar si lo captura el sistema.';
  }
  return 'El botón PS y el panel táctil pueden no llegar al navegador: depende del sistema y del navegador.';
}

// ---------- Modo zona muerta ----------

/** Texto de estadísticas del modo zona muerta. 'cur' es la lectura original y 'out' la filtrada. */
export function formatDeadzone(an, cur, out, d) {
  const lines = [
    `Zona muerta: ${Math.round(d * 100)} %`,
    `Original:    X ${sgn(cur.x)}  Y ${sgn(cur.y)}  (mag ${out.r.toFixed(3)})`,
    `Filtrado:    X ${sgn(out.x)}  Y ${sgn(out.y)}  (mag ${out.rOut.toFixed(3)})`,
  ];

  if (an.count === 0) {
    lines.push('Sin datos de prueba');
    return lines.join('\n');
  }

  lines.push(
    `Muestras:    ${an.count}`,
    `Filtradas:   ${an.filteredCount} (${an.filteredPercent.toFixed(1)} %)`,
    `Mag. media original: ${an.meanOriginal.toFixed(3)}`,
    `Mag. media filtrada: ${an.meanFiltered.toFixed(3)}`,
    `Mag. máx. original:  ${an.maxOriginal.toFixed(3)}`,
  );
  return lines.join('\n');
}



// ---------- Tabla de resultados del modo estático ----------

/** Sesgo con signo y 4 decimales (los mismos que el CSV). null se muestra como raya. */
function biasText(v) {
  if (v === null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(4);
}

/** Pinta las filas de historyRows() en el <tbody>. Usa textContent: nada de innerHTML. */
export function renderHistoryTable(tbody, rows, emptyText = 'Aún no hay pruebas guardadas.', selected = []) {
  tbody.replaceChildren();
  const chosen = new Set(selected);   // filas marcadas para comparar (clave prueba|stick)

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12;
    td.className = 'empty';
    td.textContent = emptyText;
    tr.append(td);
    tbody.append(tr);
    return;
  }

  let lastKey = null;
  for (const r of rows) {
    const tr = document.createElement('tr');

    // La primera fila visible de cada prueba lleva el separador y el botón de eliminar.
    // Se decide por el id (no por el stick) para que siga bien si un filtro oculta una de las dos filas.
    const key = r.id ?? `n${r.number}`;
    const firstOfTest = key !== lastKey;
    lastKey = key;
    if (firstOfTest) tr.className = 'group-start';

    const cell = (text, className = '') => {
      const td = document.createElement('td');
      td.textContent = text;
      if (className) td.className = className;
      return td;
    };

    const level = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = `hist-level ${r.level.toLowerCase()}`;
    chip.textContent = VERDICT[r.level] ?? r.level;
    level.append(chip);

    // Se muestra el nombre personalizado si lo hay; si no, el del modelo. Largo: se recorta con CSS, el texto completo sigue en el DOM
    const pad = cell(r.label || r.gamepad || '—', 'gamepad');
    pad.title = r.label && r.gamepad ? `${r.label} — ${r.gamepad}` : (r.label || r.gamepad);    

    const actions = document.createElement('td');
    actions.className = 'actions';
    if (firstOfTest && r.id) {
      const ren = document.createElement('button');
      ren.type = 'button';
      ren.className = 'btn row-rename';
      ren.textContent = 'Nombre';
      ren.dataset.action = 'rename';
      ren.dataset.id = r.id;
      ren.setAttribute('aria-label',
        `Cambiar el nombre del mando de la prueba nº ${r.number} del ${r.dateTime} (afecta a los dos sticks)`);
      actions.append(ren);      
      const exp = document.createElement('button');
      exp.type = 'button';
      exp.className = 'btn row-export';
      exp.textContent = 'CSV';
      exp.dataset.action = 'export';
      exp.dataset.id = r.id;
      exp.setAttribute('aria-label',
        `Exportar a CSV la prueba nº ${r.number} del ${r.dateTime} (los dos sticks)`);
      actions.append(exp);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger row-del';
      del.textContent = 'Eliminar';
      del.dataset.action = 'delete';
      del.dataset.id = r.id;
      del.setAttribute('aria-label',
        `Eliminar la prueba nº ${r.number} del ${r.dateTime} (borra los dos sticks)`);
      actions.append(del);
    }

    // Primera celda: número de prueba y, si la fila se puede identificar, la casilla para compararla
    const numCell = cell(r.number, 'num');
    if (r.id && r.side) {
      const selKey = rowKey(r.id, r.side);
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'row-select';
      box.dataset.action = 'select';
      box.dataset.key = selKey;
      box.checked = chosen.has(selKey);
      box.setAttribute('aria-label',
        `Seleccionar para comparar: stick ${r.stick.toLowerCase()} de la prueba nº ${r.number} del ${r.dateTime}`);
      numCell.prepend(box);
      if (box.checked) tr.classList.add('selected');
    }

    tr.append(
      numCell,
      cell(r.dateTime),
      cell(r.stick),
      cell(r.samples, 'num'),
      cell(biasText(r.meanX), 'num'),
      cell(biasText(r.meanY), 'num'),
      cell(r.std.toFixed(4), 'num'),
      cell(`${r.above.toFixed(1)} %`, 'num'),
      cell(r.threshold.toFixed(3), 'num'),
      level,
      pad,
      actions,
    );
    tbody.append(tr);
  }
}