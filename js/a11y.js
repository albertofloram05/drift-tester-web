// Textos para el lector de pantalla (región aria-live).
// Solo se anuncian CAMBIOS de estado. Los valores que cambian en cada fotograma (cuenta atrás,
// muestras, posición del stick) no se anuncian: un lector de pantalla no puede seguir 60 avisos por segundo.

/**
 * Conexión del mando. 'wasConnected' es null la primera vez que se mira.
 * Devuelve el texto a anunciar, o null si no ha cambiado nada.
 */
export function connectionAnnouncement(wasConnected, connected, name = '') {
  if (wasConnected === connected) return null;
  if (wasConnected === null && !connected) return null;      // arranque sin mando: no hay nada que contar
  return connected ? `Mando conectado${name ? `: ${name}` : ''}.` : 'Mando desconectado.';
}

/**
 * Prueba estática. 'prev' y 'state' son valores de State (texto). 'info' lleva la duración y,
 * al terminar, los textos del veredicto de cada stick ya calculados.
 */
export function testAnnouncement(prev, state, info = {}) {
  if (prev === state) return null;
  switch (state) {
    case 'COUNTDOWN': return 'Prueba iniciada. Suelta los dos sticks.';
    case 'RECORDING': return `Grabando durante ${info.durationSec} segundos. No toques los sticks.`;
    case 'DONE':      return `Prueba terminada. Stick izquierdo: ${info.left}. Stick derecho: ${info.right}.`;
    case 'IDLE':      return prev === 'COUNTDOWN' || prev === 'RECORDING' ? 'Prueba detenida.' : null;
    default:          return null;
  }
}

/** Asistente de calibración. 'prev' y 'state' son valores de CalState (texto). */
export function calibrationAnnouncement(prev, state) {
  if (prev === state) return null;
  switch (state) {
    case 'COUNTDOWN': return 'Calibración iniciada. Suelta los dos sticks.';
    case 'CENTER':    return 'Midiendo el centro. No toques los sticks.';
    case 'RANGE':     return 'Ahora gira los dos sticks por todo el borde, hasta el tope.';
    case 'DONE':      return 'Calibración terminada. Revisa los resultados de cada stick.';
    case 'IDLE':      return prev === 'DONE' ? null : 'Calibración detenida.';
    default:          return null;
  }
}

/**
 * Id del texto que describe el canvas de un stick según el modo (cada modo muestra un texto distinto).
 * side: 'L' o 'R'.
 */
export function stickDescriptionId(mode, side) {
  const base = mode === 'motion' ? 'motion' : mode === 'calibration' ? 'cal' : 'stats';
  return `${base}${side}`;
}