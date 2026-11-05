# Calibración orientativa

Medidas con cinco mandos DualSense (A–E) el 3 de noviembre de 2026.

- **Mandos con síntomas de drift al jugar:** C y E. Sin síntomas: A, B y D (impresión subjetiva).
- **Protocolo:** modo estático, 30 s, umbral 0,05. Cinco pruebas por mando, en este orden: neutra y soltando ambos sticks desde arriba, abajo, izquierda y derecha.
- **Condiciones:** mando sobre una mesa plana. Conexión: [USB / Bluetooth]. Navegador: [navegador].

## Resultados por stick (sesgo en las 5 pruebas)

| Mando | Stick | Sesgo mín / mediana / máx | Desv. est. máx |
|---|---|---|---|
| A | Izq | 0,041 / 0,042 / 0,050 | 0,003 |
| A | Der | 0,009 / 0,016 / 0,017 | 0,004 |
| B | Izq | 0,018 / 0,022 / 0,028 | 0,004 |
| B | Der | 0,018 / 0,022 / 0,036 | 0,004 |
| C | Izq | 0,024 / 0,042 / 0,042 | 0,005 |
| C | Der | 0,009 / 0,021 / 0,044 | 0,041 |
| D | Izq | 0,000 / 0,008 / 0,022 | 0,004 |
| D | Der | 0,000 / 0,004 / 0,008 | 0,004 |
| E | Izq | 0,024 / 0,370 / 0,615 | 0,193 |
| E | Der | 0,053 / 0,060 / 0,070 | 0,002 |

## Qué se observó

- **E izquierdo:** normal en reposo, pero no vuelve al centro tras llevarlo a un extremo (sesgo 0,12–0,61 y desviación hasta 0,19).
- **C derecho:** sesgo normal, pero desviación de 0,041 y 0,024 en dos de las cinco pruebas, frente a un máximo de 0,005 en el resto de sticks sin síntomas.
- **A izquierdo:** sesgo de 0,041–0,050, justo en el borde del umbral. Una de las pruebas lo superó por 0,0002.
- Las lecturas son múltiplos de unos 0,0078, lo que sugiere una resolución de 8 bits.

## Qué se cambió

Se añadió un límite de desviación estándar de 0,02 como regla de inestabilidad, independiente del umbral de sesgo, que se mantiene en 0,05.

## Limitaciones

Cinco mandos y una sola sesión: es una comprobación orientativa, no un estudio. «Sin síntomas» es una impresión subjetiva, no prueba que el mando esté sano.

## Modo calibración: valores iniciales

El modo calibración (v1.2.0) usa valores que **no se han calibrado** con las medidas de arriba ni con otra muestra de mandos. Son puntos de partida:

| Valor | Para qué sirve | Valor inicial |
|---|---|---|
| Margen de ruido | La zona muerta sugerida cubre el sesgo del centro más este múltiplo del ruido | 2,5 × desviación estándar |
| Zona muerta mínima | Nunca se sugiere menos | 0,05 |
| Zona muerta «normal» y «alta» | Hasta 0,10 se muestra como normal; hasta 0,25, como alta; por encima, como aviso | 0,10 y 0,25 |
| Ruido de aviso | Mismo criterio que el modo estático (desviación estándar) | 0,02 |
| Alcance mínimo para juzgar el recorrido | Por debajo, la circularidad no se considera fiable | 0,9 |
| Circularidad «correcta» e «irregular» | Desde 0,90, correcta; entre 0,80 y 0,90, irregular; por debajo de 0,80, aplastada | 0,90 y 0,80 |

Como comprobación previa, se aplicaron estas reglas a la tabla de arriba (mediana del sesgo y desviación máxima de cada stick). Es una estimación hecha con datos del modo estático, no una medición con el modo calibración. Con ella, A, B y D saldrían normales, C derecho y E izquierdo recibirían avisos, y E derecho saldría normal.

**Pendiente:** repetir las mediciones con el modo calibración y revisar estos valores. En especial el límite de 0,10, que no coincide con el umbral de sesgo de 0,05 del modo estático: un stick con sesgo de 0,06, como E derecho, puede salir como «posible drift» en el modo estático y como «normal» en el de calibración.