# SPEC 01 — MVP jugable de Arkanoid

> **Estado:** Aprobado
> **Depende de:** ninguno
> **Fecha:** 2026-10-26
> **Objetivo:** Un Arkanoid de un solo nivel, jugable de principio a fin en el navegador, con paleta, pelota, ladrillos, vidas, puntuación, pausa, sonidos y explosiones.

## Por qué existe este spec

El proyecto solo tiene assets. Este spec construye el núcleo jugable completo sobre el que se apoyarán los siguientes. La petición original incluía varios niveles y récord persistente. Se dividió en dos specs para que este no toque cinco áreas a la vez. Los niveles y el récord quedan para el SPEC 02.

## Alcance

**Dentro:**

- `index.html`, `styles.css` y `game.js` en la raíz del proyecto.
- Canvas fijo de 480×640 centrado en la página, sin reescalado.
- Paleta controlada con teclado (←/→ y A/D) y con ratón (sigue el eje X del cursor).
- Pelota que arranca pegada a la paleta y se lanza con Espacio o clic.
- Rebote en paredes laterales y techo; caer por abajo cuesta una vida.
- Rebote en la paleta con ángulo según el punto de impacto (máx. 60° respecto a la vertical).
- Un único nivel definido como cuadrícula ASCII (formato preparado para el SPEC 02).
- Ladrillos de color de 1 golpe; ladrillos grises de 2 golpes con destello blanco al primer golpe.
- Puntuación por color de ladrillo.
- 3 vidas.
- HUD dentro del canvas con puntuación y vidas.
- Estados: inicio, saque, jugando, pausa, victoria y game over.
- Pausa y reanudación con P o Esc.
- Reinicio completo con Espacio desde victoria o game over.
- Sonido `ball-bounce.mp3` en cada rebote (paredes, techo, paleta, ladrillo gris no roto).
- Sonido `break-sound.mp3` al romper un ladrillo.
- Animación de explosión de 4 frames (`EXPLOSION_FRAMES`) al romper un ladrillo.

**Fuera de alcance (para futuros specs):**

- Varios niveles y transición entre niveles (SPEC 02).
- Récord guardado en localStorage (SPEC 02).
- Aumento de velocidad de la pelota por nivel (SPEC 02).
- Power-ups, enemigos, multibola, láser.
- Controles táctiles y versión móvil.
- Escalado del canvas al tamaño de la ventana.
- Pausa automática al perder el foco de la ventana.
- Música de fondo y control de volumen.

## Modelo de datos

```js
// Constantes de geometría (px)
const W = 480, H = 640;
const HUD_H = 32;                 // franja superior para puntos y vidas
const BRICK_W = 32, BRICK_H = 16;
const COLS = 13;                  // 13 × 32 = 416 px
const GRID_X = 32, GRID_Y = 64;   // esquina superior izquierda de la cuadrícula
const PADDLE_W = 80, PADDLE_H = 14, PADDLE_Y = 600;
const BALL_SIZE = 12;

// Velocidades en px/segundo (movimiento con delta time)
const PADDLE_SPEED = 420;
const BALL_SPEED = 300;           // constante en este spec
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° respecto a la vertical

// Leyenda del nivel: letra → color de sprite
const BRICK_TYPES = {
  S: { color: 'gray',    hits: 2, points: 50 },
  Y: { color: 'yellow',  hits: 1, points: 120 },
  P: { color: 'hotpink', hits: 1, points: 110 },
  M: { color: 'magenta', hits: 1, points: 100 },
  R: { color: 'red',     hits: 1, points: 90 },
  G: { color: 'green',   hits: 1, points: 80 },
  C: { color: 'cyan',    hits: 1, points: 70 },
};

// Nivel único: 13 columnas por fila, '.' = hueco
const LEVEL_1 = [
  'SSSSSSSSSSSSS',
  'YYYYYYYYYYYYY',
  'PPPPPPPPPPPPP',
  'MMMMMMMMMMMMM',
  'RRRRRRRRRRRRR',
  'GGGGGGGGGGGGG',
  'CCCCCCCCCCCCC',
];

// Estado del juego
const state = {
  mode: 'start',   // 'start' | 'serve' | 'playing' | 'paused' | 'won' | 'gameover'
  score: 0,
  lives: 3,
  paddle: { x: 200, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H },
  ball: { x: 0, y: 0, vx: 0, vy: 0, size: BALL_SIZE },
  bricks: [ /* { x, y, color, hits, points, flashUntil } */ ],
  explosions: [ /* { x, y, color, startedAt } */ ],
  input: { left: false, right: false, mouseX: null },
};
```

Convenciones:

- Coordenadas con origen arriba a la izquierda; `x`, `y` son la esquina superior izquierda de cada entidad.
- `flashUntil` es un timestamp en ms (`performance.now()`); mientras sea mayor que el tiempo actual, el ladrillo se dibuja en blanco.
- Un ladrillo gris con `hits === 1` se dibuja con `globalAlpha` 0.6 para indicar que está dañado.
- Un ladrillo se elimina de `state.bricks` en cuanto `hits` llega a 0; su explosión vive en `state.explosions` durante `EXPLOSION_DURATION` ms y no colisiona.
- El nivel está ganado cuando `state.bricks` queda vacío.

## Plan de implementación

1. Crear `index.html` (canvas `#game` de 480×640, carga `assets/spritesheet.js` y luego `game.js`), `styles.css` (fondo oscuro, canvas centrado) y `game.js` con un bucle `requestAnimationFrame` que limpia el canvas tras `loadSpritesheet`. Prueba manual: la página carga sin errores y se ve el canvas negro centrado.
2. Paleta: dibujarla con `drawSprite(ctx, 'paddle', ...)`, moverla con ←/→ y A/D usando delta time, y seguir al ratón (centro de la paleta en el X del cursor). Limitarla a los bordes del canvas. Prueba manual: la paleta se mueve con ambos controles y no sale de la pantalla.
3. Pelota y saque: en modo `serve` la pelota va pegada sobre el centro de la paleta; Espacio o clic la lanza hacia arriba con 30° a la derecha respecto a la vertical. Rebote en paredes laterales y techo (el techo es el borde inferior del HUD). Si cae por debajo de `H`, resta una vida y vuelve a `serve`. Prueba manual: la pelota se lanza, rebota y al caer se pierde una vida.
4. Rebote en la paleta según punto de impacto: `offset = (centroPelota - centroPaleta) / (PADDLE_W / 2)`, limitado a [-1, 1], ángulo `offset * MAX_BOUNCE_ANGLE`, magnitud `BALL_SPEED`. Solo rebota si la pelota baja (`vy > 0`). Prueba manual: los bordes de la paleta mandan la pelota en diagonal y el centro, casi vertical.
5. Ladrillos: construir `state.bricks` a partir de `LEVEL_1` y `BRICK_TYPES`, y dibujarlos con `drawSprite(ctx, 'block_<color>', ...)`. Prueba manual: se ven las 7 filas de colores en la posición correcta.
6. Colisión pelota-ladrillo: colisión AABB, como máximo un ladrillo por frame. Se invierte `vx` o `vy` según el eje de menor solapamiento. Se resta un `hit`, y al llegar a 0 se elimina el ladrillo y se suman sus `points`. Los grises en su primer golpe reciben `flashUntil = now + 100` y luego se dibujan con alpha 0.6. Prueba manual: los ladrillos de color se rompen de un golpe, los grises de dos, y la puntuación sube.
7. HUD y estados de partida: dibujar en la franja superior "PUNTOS: N" y "VIDAS: N". Añadir las pantallas de texto `start` ("Pulsa Espacio para empezar"), `won` ("¡Has ganado!") y `gameover` ("Game Over"), estas dos con "Espacio para reiniciar". Al reiniciar, la puntuación vuelve a 0, las vidas a 3 y el nivel se reconstruye. Prueba manual: se puede jugar una partida completa, ganar o perder, y reiniciar.
8. Pausa: P o Esc alterna entre `playing` y `paused`. En pausa no se actualiza nada y se dibuja un overlay semitransparente con "PAUSA". Prueba manual: la pelota se congela y se reanuda sin saltos.
9. Sonidos: precargar los dos MP3 como `Audio`. Reproducir con `cloneNode().play()` para permitir solapamiento y capturar la promesa rechazada. `ball-bounce` suena en paredes, techo, paleta y gris no roto, y `break-sound` al romper un ladrillo. Prueba manual: se oyen los dos sonidos en los momentos correctos.
10. Explosiones: al romper un ladrillo, añadir una entrada a `state.explosions` y dibujar el frame `floor(elapsed / (EXPLOSION_DURATION / 4))` con `drawFrame`. Eliminar la entrada al superar `EXPLOSION_DURATION`. Prueba manual: cada ladrillo roto muestra una breve animación.

## Criterios de aceptación

- [ ] Servida con `python -m http.server`, `http://localhost:8000` carga el juego sin errores en la consola.
- [ ] El canvas mide 480×640 y está centrado horizontal y verticalmente en la ventana.
- [ ] Al cargar se muestra "Pulsa Espacio para empezar" y la pelota no se mueve.
- [ ] ←/→ y A/D mueven la paleta; mover el ratón sobre el canvas también la mueve.
- [ ] La paleta nunca sale de los límites horizontales del canvas.
- [ ] En modo saque la pelota sigue a la paleta; Espacio o clic la lanza.
- [ ] La pelota rebota en las paredes laterales y en el borde inferior del HUD.
- [ ] Golpear el extremo izquierdo de la paleta manda la pelota hacia arriba a la izquierda; golpear el extremo derecho, hacia arriba a la derecha.
- [ ] Se ven 7 filas de 13 ladrillos: gris, amarillo, rosa, magenta, rojo, verde y cian, de arriba abajo.
- [ ] Un ladrillo de color desaparece al primer golpe y suma sus puntos (amarillo 120, rosa 110, magenta 100, rojo 90, verde 80, cian 70).
- [ ] Un ladrillo gris destella en blanco al primer golpe, se ve atenuado, y desaparece al segundo golpe sumando 50 puntos.
- [ ] Romper un ladrillo reproduce `break-sound.mp3` y una animación de explosión de unos 150 ms.
- [ ] Los rebotes en paredes, techo, paleta y gris no roto reproducen `ball-bounce.mp3`.
- [ ] Cuando la pelota cae por abajo se resta 1 vida y la pelota vuelve a la paleta.
- [ ] El HUD muestra en todo momento la puntuación y las vidas actuales.
- [ ] Al perder la tercera vida aparece "Game Over".
- [ ] Al romper todos los ladrillos aparece "¡Has ganado!".
- [ ] En victoria o game over, Espacio reinicia con 0 puntos, 3 vidas y el nivel completo.
- [ ] P o Esc pausa la partida (overlay "PAUSA") y vuelve a reanudarla; en pausa la pelota y la paleta no se mueven.
- [ ] El proyecto no añade dependencias, ni `package.json`, ni paso de build.

## Decisiones

- **Sí:** dividir en dos specs (01 MVP con un nivel, 02 niveles y récord). Así este spec no toca cinco áreas a la vez.
- **Sí:** tres archivos en la raíz (`index.html`, `styles.css`, `game.js`). Es el MVP más simple y funciona sin módulos.
- **No:** varios scripts en `src/`. Obligaría a controlar el orden de carga de los scripts globales para un código que aún es pequeño.
- **No:** ES modules. Requieren servidor y `spritesheet.js` es un script clásico con globales.
- **Sí:** controles de teclado y ratón a la vez. El coste extra es mínimo.
- **Sí:** nivel como cuadrícula ASCII con leyenda de letras. Es legible y editable, y el SPEC 02 solo tiene que añadir arrays.
- **No:** niveles generados por código. Menos legibles.
- **Sí:** letra `S` (silver) para el gris. La `G` queda libre para el verde.
- **Sí:** gris de 2 golpes y puntos de 50 a 120 por color, al estilo del Arkanoid clásico.
- **No:** gris indestructible. Complica la condición de victoria sin aportar al MVP.
- **Sí:** destello blanco más alpha 0.6 como feedback del gris dañado, porque el spritesheet no tiene sprite de ladrillo dañado.
- **Sí:** rebote con ángulo según el punto de impacto, máx. 60°. Da control al jugador y evita bucles.
- **No:** reflexión pura en la paleta. Es aburrida y propensa a trayectorias repetitivas.
- **Sí:** velocidades en px/s con delta time. El juego va igual a 60 Hz que a 144 Hz.
- **No:** velocidad en px/frame. Dependería de la tasa de refresco del monitor.
- **Sí:** velocidad de pelota constante en este spec; el aumento por nivel va en el SPEC 02.
- **Sí:** canvas fijo de 480×640 sin reescalado. Es vertical como el original, y el escalado queda fuera de alcance.
- **Sí:** pantalla de inicio. Además, la primera pulsación desbloquea el audio en navegadores con política de autoplay.
- **Sí:** `cloneNode().play()` para los sonidos. Permite que se solapen rebotes rápidos sin cortar el anterior.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Pestaña en segundo plano: al volver, un `dt` enorme hace que la pelota atraviese ladrillos o paredes | Limitar `dt` a un máximo de 1/30 s por frame. |
| Pelota rápida atraviesa un ladrillo en un frame (tunneling) | Con 300 px/s y dt ≤ 1/30 s el avance máximo es 10 px, menor que `BRICK_H` (16). No hace falta sub-stepping en este spec. |
| La pelota choca con dos ladrillos a la vez y el rebote se invierte dos veces | Como máximo una colisión de ladrillo por frame. |
| `play()` rechazado por la política de autoplay | El audio solo se reproduce después de la primera interacción (pantalla de inicio) y la promesa rechazada se captura sin romper el juego. |
| Abrir `index.html` con `file://` | Las rutas son relativas a la raíz y deberían funcionar, pero el método recomendado y verificado es `python -m http.server`. |
| `EXPLOSION_FRAMES.gray` reutiliza las coordenadas de los frames rojos | Se acepta para el MVP: los grises explotan con la animación roja. |

## Qué **no** entra en este spec

- Varios niveles, transiciones y aumento de velocidad por nivel (SPEC 02).
- Récord en localStorage (SPEC 02).
- Power-ups, enemigos, multibola y láser.
- Controles táctiles, versión móvil y escalado del canvas.
- Pausa automática al perder el foco.
- Música y control de volumen.

Cada uno de ellos, si llega, irá en su propio spec.
