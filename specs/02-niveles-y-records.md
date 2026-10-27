# SPEC 02 — Niveles, velocidad progresiva y récords

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-26
> **Objetivo:** Ampliar el MVP a 3 niveles con transición entre ellos, una velocidad de pelota que sube un 15% por nivel y un top 5 de puntuaciones guardado en localStorage.

## Por qué existe este spec

El SPEC 01 dejó fuera, a propósito, los niveles, el aumento de velocidad y el récord para no tocar cinco áreas a la vez. Este spec recoge esos tres pendientes. Las decisiones que quedaron abiertas al implementar el SPEC 01 (control con ratón y teclado, rebote en ladrillos, doble Espacio al empezar y pausa solo en `playing`) se anotan en el propio SPEC 01 y no entran aquí.

## Alcance

**Dentro:**

- 3 niveles definidos como cuadrículas ASCII con la leyenda `BRICK_TYPES` del SPEC 01. El nivel 1 es `LEVEL_1` sin cambios.
- Nuevo modo `levelclear`. Al romper todos los ladrillos de los niveles 1 o 2 se muestra "Nivel N superado" y "Espacio para continuar".
- Al pasar de nivel se conservan la puntuación y las vidas. La paleta vuelve al centro y la pelota, a la paleta en modo `serve`.
- Al romper todos los ladrillos del nivel 3 se pasa a `won`.
- Reiniciar desde `won` o `gameover` vuelve al nivel 1.
- Velocidad de la pelota: `BALL_SPEED × (1 + 0.15 × (nivel − 1))`, es decir, 300, 345 y 390 px/s.
- Top 5 de puntuaciones `{ score, level, date }` guardado en localStorage bajo la clave `arkanoid:highscores:v1`.
- La puntuación se envía al top 5 al entrar en `won` o `gameover`.
- HUD con cuatro datos: PUNTOS, RÉCORD (la 1ª puntuación del top 5, o 0), NIVEL y VIDAS.
- Tabla del top 5 en las pantallas `start`, `won` y `gameover`.
- La fila de la partida recién terminada se resalta en amarillo. Si esa fila es la 1ª, aparece además "¡Nuevo récord!".
- Todo el código nuevo va en `game.js`.

**Fuera de alcance (para futuros specs):**

- Nombres o iniciales del jugador en la tabla.
- Pantalla propia de récords o tecla para consultarlos.
- Más de 3 niveles, editor de niveles y niveles cargados desde archivos.
- Vidas extra al pasar de nivel.
- Ladrillos indestructibles o tipos de ladrillo nuevos.
- Borrar el top 5 desde el juego.
- Cambios en las decisiones de implementación del SPEC 01.
- Todo lo que el SPEC 01 ya dejaba fuera: power-ups, controles táctiles, escalado del canvas, pausa automática y música.

## Modelo de datos

```js
// Velocidad por nivel
const SPEED_STEP = 0.15;          // +15% por nivel sobre BALL_SPEED

// Récords
const HIGHSCORES_KEY = 'arkanoid:highscores:v1';
const HIGHSCORES_MAX = 5;

// Niveles: 13 columnas por fila, '.' = hueco (leyenda BRICK_TYPES del SPEC 01)
const LEVEL_2 = [
  '.YYYYYYYYYYY.',
  '..PPPPPPPPP..',
  'S..MMMMMMM..S',
  'SS..RRRRR..SS',
  'SSS..GGG..SSS',
  'SSSS..C..SSSS',
];

const LEVEL_3 = [
  'SSSSSSSSSSSSS',
  'Y.Y.Y.Y.Y.Y.Y',
  'PPPPPPPPPPPPP',
  'S.S.S.S.S.S.S',
  'MMMMMMMMMMMMM',
  'RRRRRRRRRRRRR',
  'G.G.G.G.G.G.G',
  'CCCCCCCCCCCCC',
];

const LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3];

// Campos nuevos en state (el resto, igual que en el SPEC 01)
const state = {
  mode: 'start',   // añade 'levelclear' a los modos del SPEC 01
  level: 1,        // 1..LEVELS.length
  highScores: [ /* { score, level, date }, ordenado de mayor a menor score */ ],
  newEntryIndex: -1, // posición en highScores de la partida recién terminada, o -1
  // ...score, lives, paddle, ball, bricks, explosions, input del SPEC 01
};
```

Convenciones:

- `level` empieza en 1 y el nivel actual es `LEVELS[state.level - 1]`.
- La velocidad de la pelota en el nivel actual es `BALL_SPEED * (1 + SPEED_STEP * (state.level - 1))`. Se usa en el saque y en el rebote con la paleta. Los rebotes en paredes y ladrillos solo cambian signos y conservan la magnitud.
- En localStorage, `HIGHSCORES_KEY` guarda un array JSON de como mucho 5 objetos `{ score, level, date }`.
- `score` es un entero mayor que 0 y `level` es el nivel en el que terminó la partida (en `won`, 3).
- `date` es la fecha local en formato `YYYY-MM-DD`. En pantalla se muestra como `DD/MM/AAAA`.
- Al cargar, una entrada con algún campo de tipo incorrecto se descarta. Si el JSON es inválido o no es un array, el top 5 empieza vacío.
- Una partida entra en el top 5 si `score > 0` y además hay menos de 5 entradas o supera estrictamente a la 5ª. Si empata con otra puntuación, la nueva va detrás.
- `newEntryIndex` vale -1 al empezar o reiniciar una partida. Al terminar, toma la posición de la nueva entrada, o -1 si no ha entrado.

## Plan de implementación

1. **Niveles.** Añadir `LEVEL_2`, `LEVEL_3`, `LEVELS` y `state.level`. `resetGame` construye `LEVELS[0]` y pone `level = 1`. El HUD pasa a cuatro huecos en `bold 14px monospace`: "PUNTOS: N" alineado a la izquierda en x = 12, "RÉCORD: 0" centrado en x = 190, "NIVEL: N" centrado en x = 320 y "VIDAS: N" alineado a la derecha en x = W − 12. Prueba manual: ejecutar `state.bricks = buildBricks(LEVELS[1])` en la consola muestra el nivel 2 en su sitio, y el HUD muestra "NIVEL: 1".
2. **Transición entre niveles.** Al vaciarse `state.bricks`: si `level < LEVELS.length`, pasar a `levelclear`; si no, pasar a `won`. En `levelclear`, `drawMessage` muestra "Nivel N superado" y "Espacio para continuar". Espacio en `levelclear` suma 1 a `level`, reconstruye los ladrillos, vacía `explosions`, centra la paleta (`x = 200`), coloca la pelota en la paleta y pasa a `serve`. Reiniciar desde `won` o `gameover` vuelve al nivel 1. Prueba manual: con `state.bricks.length = 1` en la consola y rompiendo un ladrillo, se pasa del nivel 1 al 2 y del 2 al 3 conservando puntos y vidas, y en el 3 aparece "¡Has ganado!".
3. **Velocidad por nivel.** Añadir `SPEED_STEP` y una función `ballSpeed()`. `launchBall` y `bounceOffPaddle` usan `ballSpeed()` en lugar de `BALL_SPEED`. Prueba manual: con la pelota en juego, `Math.hypot(state.ball.vx, state.ball.vy)` da 300, 345 y 390 en los niveles 1, 2 y 3.
4. **Carga y guardado del top 5.** Añadir `HIGHSCORES_KEY` y `HIGHSCORES_MAX`. Añadir también `loadHighScores()`, que lee la clave, valida las entradas y devuelve `[]` ante cualquier error, y `saveHighScores()`, que escribe el JSON y captura la excepción si falla. `state.highScores` se carga al arrancar. Prueba manual: con `localStorage.setItem('arkanoid:highscores:v1', 'basura')` y recargando, el juego arranca sin errores en la consola y `state.highScores` es `[]`.
5. **Registro de la puntuación.** Añadir `submitScore()`, que aplica la regla de entrada al top 5, inserta la entrada `{ score, level, date }`, recorta la tabla a 5, guarda y asigna `newEntryIndex`. Se llama una vez al entrar en `won` o `gameover`. `resetGame` pone `newEntryIndex = -1`. El HUD muestra "RÉCORD: N" con `highScores[0].score`, o 0 si la tabla está vacía. Prueba manual: tras un game over con más de 0 puntos, `state.highScores` contiene la partida, y al recargar la página sigue ahí.
6. **Tabla en pantalla.** En `start`, `won` y `gameover` se dibuja debajo del mensaje la tabla del top 5 en `16px monospace`. Cada fila sigue el formato `1. 12345  NIVEL 3  26/10/2026`. La fila `newEntryIndex` va en amarillo (`#ff0`). Si `newEntryIndex === 0`, se dibuja "¡Nuevo récord!" encima de la tabla. Con la tabla vacía se muestra "Sin récords todavía". El título y el subtítulo de `drawMessage` se suben lo necesario para que todo quepa en el canvas. Prueba manual: se ve la tabla en las tres pantallas, la partida recién terminada aparece resaltada y "¡Nuevo récord!" solo sale cuando la partida queda la 1ª.

## Criterios de aceptación

- [ ] Servida con `python -m http.server`, `http://localhost:8000` carga el juego sin errores en la consola.
- [ ] El nivel 1 es idéntico al del SPEC 01: 7 filas completas de 13 ladrillos.
- [ ] El nivel 2 y el nivel 3 coinciden con `LEVEL_2` y `LEVEL_3`, incluidos los huecos.
- [ ] Al romper todos los ladrillos del nivel 1 o del 2 aparecen "Nivel N superado" y "Espacio para continuar", y la pelota no se mueve.
- [ ] Espacio en esa pantalla carga el nivel siguiente con la pelota en la paleta y la puntuación y las vidas intactas.
- [ ] Al romper todos los ladrillos del nivel 3 aparece "¡Has ganado!".
- [ ] El HUD muestra en todo momento PUNTOS, RÉCORD, NIVEL y VIDAS sin solaparse.
- [ ] La velocidad de la pelota es 300 px/s en el nivel 1, 345 en el 2 y 390 en el 3.
- [ ] La velocidad se mantiene tras rebotar en paredes, techo, paleta y ladrillos.
- [ ] Reiniciar desde victoria o game over empieza en el nivel 1 con 0 puntos y 3 vidas.
- [ ] Al terminar una partida con más de 0 puntos que entra en el top 5, la partida aparece en la tabla con su puntuación, el nivel en el que terminó y la fecha de hoy.
- [ ] Una partida con 0 puntos no entra en la tabla.
- [ ] Con 5 entradas, una partida que no supera a la 5ª no entra en la tabla.
- [ ] La tabla nunca tiene más de 5 filas y está ordenada de mayor a menor puntuación.
- [ ] Recargar la página conserva el top 5.
- [ ] La tabla se ve en las pantallas de inicio, victoria y game over.
- [ ] La fila de la partida recién terminada se ve en amarillo.
- [ ] "¡Nuevo récord!" aparece solo cuando la partida queda en 1ª posición.
- [ ] El HUD muestra como RÉCORD la 1ª puntuación de la tabla, o 0 si está vacía.
- [ ] Con un valor inválido en `arkanoid:highscores:v1`, el juego arranca sin errores y con la tabla vacía.
- [ ] El proyecto no añade dependencias, ni `package.json`, ni paso de build, y sigue teniendo solo `index.html`, `styles.css` y `game.js`.

## Decisiones

- **Sí:** 3 niveles. Bastan para probar la progresión y la velocidad sin diseñar demasiadas cuadrículas.
- **No:** 5 niveles. Más contenido que diseñar y partidas más largas de probar en este spec.
- **Sí:** pantalla `levelclear` que espera a Espacio. Encaja con las pantallas de texto del SPEC 01 y deja respirar al jugador.
- **No:** rótulo temporizado con saque automático. Añade un temporizador al estado sin aportar al MVP.
- **No:** transición inmediata sin mensaje. El jugador no sabría que ha cambiado de nivel.
- **Sí:** +15% de velocidad por nivel sobre `BALL_SPEED`. Con 390 px/s y dt ≤ 1/30 s el avance máximo es 13 px, menos que `BRICK_H` (16), así que sigue sin hacer falta sub-stepping.
- **No:** velocidad declarada en cada nivel. Es más flexible, pero abre la puerta a superar el límite de tunneling.
- **Sí:** conservar puntos y vidas entre niveles, como en el Arkanoid clásico.
- **No:** reponer 3 vidas o dar una vida extra por nivel. Lo primero quita tensión y lo segundo obliga a fijar un máximo de vidas.
- **Sí:** top 5 `{ score, level, date }` en vez de una sola puntuación, por decisión del usuario.
- **No:** nombres o iniciales. Exigen una pantalla de entrada de texto.
- **Sí:** clave versionada `arkanoid:highscores:v1`. Permite cambiar el esquema en el futuro sin romper los datos guardados.
- **Sí:** guardar al terminar la partida (`won` o `gameover`) y no en tiempo real. Así solo se escribe en localStorage una vez por partida.
- **Sí:** la tabla se muestra en las pantallas de inicio, victoria y game over. No hace falta una tecla ni un modo nuevo.
- **No:** pantalla de récords propia. Añade un modo y una tecla sin necesidad.
- **Sí:** solo entran puntuaciones mayores que 0 y que superen estrictamente a la 5ª, y ante un empate la nueva va detrás. Evita llenar la tabla de partidas de 0 puntos y respeta la antigüedad en los empates.
- **Sí:** fila resaltada en amarillo y "¡Nuevo récord!" solo si la partida queda la 1ª. Distingue "entrar en la tabla" de "batir el récord".
- **Sí:** fecha local guardada como `YYYY-MM-DD` y mostrada como `DD/MM/AAAA`. El formato ISO se ordena y se valida bien, y el otro es el habitual en español.
- **Sí:** todo en `game.js`. Es coherente con la decisión del SPEC 01 de no usar varios scripts.
- **No:** `levels.js` y `highscores.js` aparte. Obligaría a controlar el orden de carga de los scripts globales.
- **Sí:** las cuadrículas `LEVEL_2` y `LEVEL_3` las propone el spec. El usuario las revisa antes de aprobarlo.
- **Sí:** las decisiones abiertas al implementar el SPEC 01 se anotan en el SPEC 01 y no en este spec. Son detalles del MVP ya implementado.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| localStorage desactivado o lleno (modo privado, cuota) | `loadHighScores` y `saveHighScores` capturan las excepciones. El juego funciona y la tabla vive en memoria durante la sesión. |
| JSON corrupto o editado a mano en `arkanoid:highscores:v1` | Si no se puede parsear o no es un array, la tabla empieza vacía. Las entradas con campos de tipo incorrecto se descartan. |
| Tunneling a 390 px/s en el nivel 3 | El avance máximo por frame es 13 px, menos que `BRICK_H` (16) y que `PADDLE_H` (14). |
| La pantalla con mensaje y tabla no cabe en los 640 px del canvas | El paso 6 sube el título y el subtítulo, y la tabla usa una fuente de 16 px con 5 filas como máximo. |
| `submitScore` se llama dos veces al terminar la misma partida | Se llama solo en la transición a `won` o `gameover`, nunca desde `draw` ni en cada frame. |
| Las puntuaciones altas solapan PUNTOS con RÉCORD en el HUD | La puntuación máxima con los 3 niveles es 20040 (8060 + 4770 + 7210), es decir, 5 cifras. A 14 px, "PUNTOS: 20040" acaba hacia x = 121 y "RÉCORD: 20040", centrado en x = 190, empieza hacia x = 135. |

## Qué **no** entra en este spec

- Nombres o iniciales en la tabla de récords.
- Pantalla propia de récords y borrado del top 5.
- Más de 3 niveles, editor de niveles y niveles cargados desde archivos.
- Vidas extra y nuevos tipos de ladrillo.
- Cambios en las decisiones de implementación del SPEC 01.
- Power-ups, controles táctiles, escalado del canvas, pausa automática y música.

Cada uno de ellos, si llega, irá en su propio spec.
