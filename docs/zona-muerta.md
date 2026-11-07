# Modo zona muerta

El modo zona muerta simula, con las lecturas reales de un stick, qué pasaría si se aplicara una zona muerta radial. Es una simulación por software: la página solo lee el mando y no cambia nada en él.

## Algoritmo

Para cada lectura `(x, y)` y una zona muerta `d` (de 0 a 0,30):

```
r = sqrt(x² + y²)

si r <= d:   salida = (0, 0)
si r > d:    r_out = min(1, (r − d) / (1 − d))
             salida = (x, y) · r_out / r
```

- La **dirección** se conserva: la salida es la lectura original multiplicada por un factor.
- La salida es **continua**: justo al superar `d`, `r_out` es casi 0, sin saltos.
- El **extremo** se conserva: `r = 1` da `r_out = 1`. Lecturas con `r > 1` (posibles en las esquinas) se limitan a 1.
- Con `d = 0` la salida es igual a la entrada, salvo el límite de 1.
- Las lecturas no numéricas (`NaN`, `null`) se descartan y no cuentan.

### Ejemplos con d = 0,10

| Lectura | r | Salida | r_out |
|---|---|---|---|
| (0,05 ; 0,05) | 0,071 | (0 ; 0) | 0 |
| (0,10 ; 0) | 0,100 | (0 ; 0) | 0 |
| (0,20 ; 0) | 0,200 | (0,111 ; 0) | 0,111 |
| (0,30 ; 0,40) | 0,500 | (0,267 ; 0,356) | 0,444 |
| (1 ; 0) | 1,000 | (1 ; 0) | 1 |

## Estadísticas

- **Muestras:** lecturas válidas procesadas desde que se pulsó «Iniciar prueba».
- **Filtradas:** muestras con `r <= d`. Con 0 % no se filtra ninguna, ni siquiera una lectura exacta de (0, 0).
- **Magnitud media original y filtrada:** media de `r` y de `r_out` sobre todas las muestras. Las filtradas aportan 0 a la media filtrada.
- **Magnitud máxima original:** el mayor `r` visto. Puede superar 1.

Al cambiar la zona muerta o el stick, las estadísticas se reinician: las muestras anteriores se filtraron con otro valor y mezclarlas daría cifras incoherentes.

## Limitaciones

- **Radial frente a por ejes:** muchos juegos aplican la zona muerta a cada eje por separado u otras curvas. Esta simulación es radial, así que el resultado en un juego concreto puede diferir.
- **No corrige el centro:** el círculo está en el (0, 0) ideal, no en el centro real medido. Un stick con sesgo cercano a `d` oscilará entre filtrado y no filtrado. Es útil precisamente para ver eso.
- **Recorrido incompleto:** si un stick no llega a 1, la salida filtrada tampoco llegará a 1.
- **Resolución del mando:** las lecturas son múltiplos de unos 0,0078 (8 bits), así que un paso de 1 punto equivale a poco más de un nivel real.
- **Muestreo:** se lee una vez por fotograma. La Gamepad API no garantiza una frecuencia fija y la página no recibe lecturas con la pestaña oculta.
- **Distinto de la calibración:** el modo calibración *sugiere* una zona muerta a partir del centro y el ruido medidos. Este modo permite *probar* cualquier valor y ver su efecto.