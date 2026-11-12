# Modo comparación (historial)

El comparador convierte el historial del modo estático en una herramienta de análisis: eliges varias filas, ves sus métricas lado a lado, miras cómo evolucionan y exportas la comparación. **No hace mediciones nuevas ni necesita el mando conectado**: trabaja solo con lo que ya está guardado en tu navegador.

## Cómo se usa

1. En la tabla del historial, marca la casilla de cada fila que quieras comparar. Cada fila es **un stick de una prueba**, así que puedes comparar el izquierdo de hoy con el izquierdo de la semana pasada, o los dos sticks de una misma prueba. Puedes marcar hasta **8 filas**.
2. Pulsa **Abrir comparador**. Si cambias la selección con el panel abierto, se actualiza solo.
3. Elige la **referencia** de las diferencias en el desplegable (por defecto, la fila más antigua).
4. Si quieres guardar el resultado, pulsa **Exportar comparación (CSV)**.

La selección vive solo en memoria: no se guarda, y los filtros del historial no la cambian (puedes filtrar y seguir teniendo marcadas filas que ahora no se ven). Al eliminar o borrar pruebas, las filas que dejan de existir se quitan de la selección.

## Qué muestra

**Tabla comparativa**, en orden cronológico, con fecha, stick, mando, umbral, resultado, sesgo X, sesgo Y, desviación estándar, % sobre umbral y muestras. Debajo de cada valor aparece su **diferencia con la referencia**.

| Métrica | Diferencia que se muestra |
|---|---|
| Sesgo X, Sesgo Y | absoluta, con signo |
| Desviación estándar | absoluta y variación relativa en % |
| % sobre umbral | absoluta, en puntos porcentuales (pp) |
| Muestras | absoluta |

El sesgo no lleva porcentaje porque tiene signo y puede cambiar de lado entre pruebas: un porcentaje relativo no tendría sentido. Tampoco se muestra porcentaje si el valor de referencia es 0.

**Gráficas** de evolución en el tiempo: sesgo X, sesgo Y y una tercera que alterna entre desviación estándar y % sobre umbral.

- Una serie por stick; **nunca se unen puntos de sticks distintos**. Se distinguen por color, forma del marcador (círculo o cuadrado) y trazo (continuo o discontinuo).
- El eje horizontal es **tiempo real** (no el orden de las pruebas) y el vertical incluye siempre el 0.
- Al pasar el ratón por un punto sale su fecha, stick y valor. Los mismos valores están en la tabla.

## Avisos de interpretación

El comparador **solo describe**. Una variación entre pruebas no demuestra por sí sola que el drift haya aparecido o cambiado: las lecturas dependen de cómo se suelta el stick, la temperatura, la conexión, el navegador y el ruido de medición. Por eso no etiqueta ningún mando como «mejorado» o «empeorado».

Además, avisa cuando:

- las pruebas usaron **umbrales distintos** (el «% sobre umbral» no es directamente comparable);
- tuvieron **distinta duración** o número de muestras;
- alguna es **anterior a la v1.5.0** y no guarda sesgo X e Y por separado (se muestra «No disponible»);
- alguna tiene una **fecha no válida** (no aparece en las gráficas).

Una métrica ausente nunca se inventa ni se recalcula: se muestra como «No disponible».

## CSV de la comparación

El archivo se llama `drift-resultados-comparacion-N-filas.csv`. Lleva una fila por cada fila comparada, con estas columnas:

| Columna | Contenido |
|---|---|
| `referencia` | `si` en la fila de referencia, `no` en las demás |
| `prueba_n`, `fecha`, `stick` | número de prueba en el historial, fecha y hora, stick |
| `mando`, `nombre_mando` | nombre que da el navegador y nombre personalizado |
| `umbral`, `muestras` | umbral usado (3 decimales) y número de muestras |
| `sesgo_x`, `sesgo_y`, `desv_est` | valores a 4 decimales |
| `pct_sobre_umbral` | porcentaje a 1 decimal |
| `resultado` | veredicto de la prueba |
| `dif_sesgo_x`, `dif_sesgo_y`, `dif_desv_est` | diferencia absoluta con la referencia |
| `var_pct_desv_est` | variación relativa de la desviación estándar, en % |
| `dif_pct_sobre_umbral_puntos` | diferencia en puntos porcentuales |
| `dif_muestras` | diferencia en número de muestras |

Una celda vacía significa que el dato no está disponible. El CSV general del historial (**Exportar CSV**) no cambia.

## Privacidad y límites

- Todo se calcula en tu navegador; no se envía nada a ningún servidor.
- Máximo **8 filas** a la vez, para que las gráficas se lean bien.
- Las pruebas guardadas antes de la v1.5.1 no tienen identificador propio: al eliminar una prueba, su selección se suelta para no apuntar a otra distinta.