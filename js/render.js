export const TRAIL_MS = 500;   // cuánto tiempo recordamos el recorrido
import { MotionAnalyzer } from './motionAnalyzer.js';

/** Dibuja un stick en su canvas. x e y van de -1 a 1. */
/** Dibuja un stick. 'stats' y 'sectors' pueden ser null según el modo. */
export function drawStick(canvas, x, y, stats, trail, now, sectors = null) {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  if (size === 0) return;

  const px = Math.round(size * dpr);
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

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
}

/** Número con signo y tres decimales: +0.012, -0.004 */
const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(3);

const VERDICT = {
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
export function setVerdict(el, level) {
  if (!level) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = VERDICT[level];
  el.className = 'verdict ' + level.toLowerCase();   // p. ej. "verdict possible_drift"
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // a partir de aquí se dibuja en píxeles CSS
  ctx.clearRect(0, 0, w, h);

  // Escala vertical: se adapta, pero nunca baja de 0.10
  const scaleMax = Math.max(0.10, threshold * 1.5, stats.maxRadius * 1.2);

  // Línea del umbral (discontinua, naranja)
  const ty = h - Math.min(threshold / scaleMax, 1) * h;
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
    const py = h - Math.min(avg / scaleMax, 1) * h;
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