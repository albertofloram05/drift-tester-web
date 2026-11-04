import { Level } from './level.js';

const MIN_SAMPLES = 30;   // con menos muestras no se concluye nada
const SPREAD_LIMIT = 0.02;   // inestabilidad máxima aceptable (desviación estándar)

/** Convierte las estadísticas de un stick en un veredicto. */
export function evaluate(stats, threshold) {
  if (stats.count < MIN_SAMPLES) return Level.NORMAL;

  const offset = stats.centerOffset;                       // sesgo medio
  const above = stats.percentAboveThreshold(threshold);    // persistencia (%)
  const spread = stats.stdDev;                             // dispersión

  // Claramente por encima del umbral Y de forma persistente
  if (offset > threshold * 2 && above > 80) return Level.SIGNIFICANT_DRIFT;

  // Desviación persistente O mucha fluctuación
  if (above > 50 || spread > SPREAD_LIMIT) return Level.POSSIBLE_DRIFT;

  return Level.NORMAL;
}