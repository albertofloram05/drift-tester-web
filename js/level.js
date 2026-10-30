/** Niveles de diagnóstico. Object.freeze impide modificarlo: es el equivalente a un enum. */
export const Level = Object.freeze({
  NORMAL: 'NORMAL',
  POSSIBLE_DRIFT: 'POSSIBLE_DRIFT',
  SIGNIFICANT_DRIFT: 'SIGNIFICANT_DRIFT',
});