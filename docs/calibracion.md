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