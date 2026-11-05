# DualSense Drift Tester

Herramienta web para comprobar si los sticks analógicos de un mando **DualSense (PS5)** presentan *drift*: desviaciones del centro o fluctuaciones cuando nadie los toca.

**Pruébala aquí:** https://drifttester.com/

> ⚠️ **Herramienta orientativa.** No sustituye una revisión física del mando. Las zonas muertas de los juegos pueden ocultar desviaciones pequeñas, y los resultados dependen de lo que el navegador y el sistema operativo reportan, no de una medida física del recorrido del stick.

## Capturas

### Modo estático

![Modo estático con una prueba terminada](docs/modo-estatico.png)

Prueba de drift con los sticks sueltos: estadísticas de cada stick, gráfica de la desviación con la línea del umbral y veredicto orientativo.

### Modo movimiento

![Modo movimiento con los sectores iluminados](docs/modo-movimiento.png)

Anillo de 8 sectores que se ilumina al llegar al borde en cada dirección, gráfica de X e Y de los últimos 10 segundos y observaciones sobre picos y vuelta al centro.

### Modo calibración

![Modo calibración con los sectores iluminados](docs/modo-calibracion.png)

Anillo de 16 sectores que mide el centro real y el recorrido de cada stick y sugiere una zona muerta de partida.

## Qué hace

Lee los ejes del mando en tiempo real mediante la **Gamepad API** del navegador y ofrece tres modos.

### Modo estático (prueba de drift)

Con los sticks sueltos, graba posiciones durante 10, 30, 60 o 120 segundos (tras una cuenta atrás de 5 s) y calcula, para cada stick:

- Posición media (X, Y) y **sesgo**: distancia entre el centro medio y el centro ideal.
- Desviación estándar y distancia máxima al centro.
- Porcentaje de muestras por encima de un **umbral configurable**.
- Número de fluctuaciones y porcentaje de lecturas válidas.

Con eso emite un veredicto orientativo por stick: **Normal**, **Posible drift** o **Drift significativo**. La decisión combina sesgo, persistencia y dispersión, de modo que un pico puntual no basta para marcar un stick como defectuoso. Un stick inestable (desviación estándar mayor que 0,02) también se marca como posible drift, aunque su centro parezca correcto.

### Modo movimiento

Para comprobar el funcionamiento general de cada stick:

- Un anillo de **8 sectores** que indica si has llegado cerca del borde en cada dirección.
- Una gráfica de **X e Y** de los últimos 10 segundos.
- Detección de **picos aislados** (un valor que salta y vuelve en menos de 100 ms).
- Medición de si el stick **vuelve al centro** tras soltarlo.

Los resultados se presentan como observaciones («posible anomalía a revisar»), nunca como un defecto confirmado.

### Modo calibración

Mide el centro real y el recorrido de cada stick y sugiere una **zona muerta** de partida:

1. **Centro:** con los sticks sueltos (tras una cuenta atrás de 3 s), mide durante 5 s dónde está el centro de cada stick y cuánto tiembla. Si mueves un stick durante la medición, empieza de nuevo.
2. **Rango:** gira los dos sticks por todo el borde. Un anillo de **16 sectores** se ilumina al llegar al tope en cada dirección.
3. **Resultado:** para cada stick, el centro, el ruido, el alcance máximo, la circularidad del recorrido y una zona muerta sugerida, con observaciones en tres niveles (correcto, informativo y aviso).

La zona muerta sugerida cubre el sesgo del centro más 2,5 veces el ruido, con un mínimo de 0,05. Se ofrece también en porcentaje y en la versión «recentrando», para los programas que permiten además corregir el centro.

> **Es una calibración por software:** la página solo lee el mando. No puede cambiar su configuración interna ni arreglar el drift; solo mide y sugiere un valor de partida para los juegos o programas que permitan ajustar la zona muerta.

### Historial

Cada prueba estática se guarda en el navegador (`localStorage`) y puede exportarse a **CSV**.

## Cómo usarla

1. Conecta el mando por **USB** (con un cable que transmita datos) o por **Bluetooth**.
2. Abre la página en **Chrome, Brave, Edge o Firefox** de escritorio.
3. **Pulsa cualquier botón del mando.** El navegador no expone el mando hasta que lo tocas.
4. Elige el modo y sigue las indicaciones en pantalla.

Para una prueba estática fiable: deja el mando sobre una superficie plana, suelta los sticks con suavidad y **repite la prueba varias veces**. Si el sesgo se repite, es un desplazamiento real del centro; si varía mucho, puede depender de cómo sueltas el stick.

## Privacidad

- Los datos de las pruebas **no se envían a ningún servidor**. Se procesan en tu navegador y el historial se guarda solo en él.
- La página **no carga recursos de terceros** (las tipografías se sirven desde el propio proyecto). El hosting es GitHub Pages, que, como cualquier servidor, recibe las visitas.

## Ejecutarla en local

No hay dependencias ni paso de compilación. Los módulos de JavaScript no funcionan abriendo el HTML con doble clic (`file://`), así que hace falta un servidor local sencillo:

```bash
git clone https://github.com/albertofloram05/drift-tester-web.git
cd drift-tester-web
python3 -m http.server 8000
```

Después abre http://localhost:8000. En Windows, si `python3` no existe, usa `python -m http.server 8000`.

## Estructura

```
drift-tester-web/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js                # conecta todo: bucle, eventos y modos
│   ├── gamepadReader.js      # lee el mando (Gamepad API)
│   ├── stickStats.js         # estadísticas de un stick
│   ├── evaluator.js          # veredicto del modo estático
│   ├── driftTester.js        # máquina de estados de la prueba
│   ├── motionAnalyzer.js     # análisis y observaciones del modo movimiento
│   ├── calibration.js        # centro, rango, zona muerta y observaciones de la calibración
│   ├── calibrationWizard.js  # máquina de estados del asistente de calibración
│   ├── history.js            # historial (localStorage) y exportación CSV
│   ├── level.js              # niveles del veredicto
│   └── render.js             # dibujo en canvas y formato de textos
├── fonts/                    # tipografías, servidas desde el propio sitio
└── docs/
    ├── calibracion.md
    ├── modo-estatico.png
    └── modo-movimiento.png
```

La lógica (`stickStats`, `evaluator`, `driftTester`, `motionAnalyzer`, `calibration`, `calibrationWizard`) no depende del navegador ni de la página, así que se puede probar por separado desde la consola.

## Limitaciones

- **Umbrales:** comprobados de forma orientativa con cinco mandos (dos con síntomas) en una sola sesión; el detalle está en [docs/calibracion.md](docs/calibracion.md). Siguen sin ser un estándar y conviene repetir la prueba varias veces.
- **Modo calibración:** la zona muerta sugerida (sesgo + 2,5 × ruido, mínimo 0,05), los límites de zona muerta «normal» y «alta» (0,10 y 0,25) y los de circularidad (0,90 y 0,80) son valores iniciales que no se han calibrado con una muestra de mandos. Tómalos como punto de partida; el detalle está en [docs/calibracion.md](docs/calibracion.md).
- **Los porcentajes son aproximaciones** de los valores que reporta el mando, no medidas físicas del recorrido.
- **La Gamepad API no garantiza una frecuencia de muestreo fija.** Las muestras se recogen en cada fotograma, así que dependen de la frecuencia de tu pantalla.
- **El eje horizontal de la gráfica estática reparte muestras, no segundos.** La gráfica del modo movimiento sí usa tiempo real.
- **No se garantiza identificar un DualSense original.** El nombre que muestra el navegador depende del sistema y del navegador.
- **Navegadores:** probada con un DualSense en Chrome, Brave y Firefox de escritorio. Edge usa el mismo motor que Chrome y debería comportarse igual, pero no se ha verificado. En móviles y otros navegadores la Gamepad API puede variar.
- **Otros mandos:** pensada para el DualSense. Los mandos que el navegador reconoce con el mapeo estándar también muestran sus ejes (una persona probó uno de Nintendo Switch), pero los umbrales se calibraron pensando en el DualSense y no se ha validado la fiabilidad con otros modelos.
- **El historial es de cada navegador.** Borrar los datos del sitio lo elimina. Para conservarlo, usa *Exportar CSV*.

## Origen del proyecto

Nació como una aplicación de escritorio en Java (JavaFX + LWJGL) y se reescribió en JavaScript para poder compartirla con un simple enlace.

## Apoyar el proyecto

Es gratuito y sin anuncios. Si te resulta útil, puedes [invitarme a un café](https://ko-fi.com/albertofloram05).

## Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.
