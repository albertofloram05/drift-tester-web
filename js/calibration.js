// Lógica de la calibración. No sabe nada del navegador ni del HTML.

const MIN_SAMPLES = 30;   // con menos muestras no se concluye nada (igual que evaluator.js)

/**
 * Resume dónde está el centro real de un stick y cuánto ruido tiene.
 * Recibe un StickStats ya relleno y devuelve un objeto, o null si hay pocos datos.
 */
export function measureCenter(stats) {
  if (stats.count < MIN_SAMPLES) return null;

  return {
    x: stats.meanX,              // centro real en X
    y: stats.meanY,              // centro real en Y
    offset: stats.centerOffset,  // distancia de ese centro al (0,0) ideal
    noise: stats.stdDev,         // cuánto tiembla alrededor de su media
    samples: stats.count,
  };
}