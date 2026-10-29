# SPEC 03 — Power-up de multibola

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-29
> **Objetivo:** Que cualquier ladrillo roto pueda soltar una cápsula que cae en vertical y que, si la atrapa la paleta, añade 3 bolas más a la partida, de modo que solo se pierde una vida cuando cae la última bola.

## Por qué existe este spec

El SPEC 01 y el SPEC 02 dejaron fuera los power-ups y la multibola. Este spec añade un único power-up, al estilo de la cápsula Disruption del Arkanoid clásico. Su cambio más profundo es que la pelota deja de ser un objeto único (`state.ball`) y pasa a ser una lista (`state.balls`). Por eso el primer paso del plan es esa refactorización, sin cambiar el comportamiento.

## Alcance

**Dentro:**

- `state.ball` pasa a ser `state.balls`, un array de bolas. Fuera de la multibola el array tiene 1 bola.
- Al romperse, un ladrillo suelta una cápsula con una probabilidad del 10% (`POWERUP_CHANCE`).
- La regla vale para cualquier color, incluido el gris al romperse en su segundo golpe.
- Solo puede soltarse una cápsula si no hay otra cayendo y hay exactamente 1 bola en juego.
- La cápsula nace en la posición del ladrillo roto y cae en vertical a 150 px/s (`CAPSULE_SPEED`).
- La cápsula se dibuja con canvas porque el spritesheet no tiene un sprite para ella. Es un rectángulo redondeado naranja de 32×14 con una "D" blanca.
- Si la cápsula toca la paleta, se atrapa: suena `ball-bounce.mp3`, no suma puntos y se activa la multibola.
- Si la cápsula sale por debajo del canvas, se pierde sin efecto.
- La multibola añade 3 bolas en la posición de la bola existente. Salen hacia arriba a −45°, 0° y +45° respecto a la vertical, con la velocidad del nivel (`ballSpeed()`). La bola original conserva su velocidad.
- Cada bola rebota en paredes, techo, paleta y ladrillos como la bola del SPEC 01, con un ladrillo como máximo por bola y frame.
- Las bolas chocan entre sí. Solo rebotan si se solapan y se están acercando. Cada una conserva su rapidez y sale alejándose de la otra.
- Cada choque entre bolas reproduce `ball-bounce.mp3`.
- Una bola que cae por abajo se elimina sin coste. La vida solo se pierde cuando cae la última bola.
- Al perder una vida, al pasar de nivel y al reiniciar, desaparece la cápsula en vuelo y se vuelve a 1 bola en la paleta.
- En pausa, la cápsula y las bolas quedan congeladas.
- `spawnCapsule(x, y)` es una función global que se puede llamar desde la consola para probar sin depender del azar.
- Todo el código nuevo va en `game.js`.

**Fuera de alcance (para futuros specs):**

- Otros power-ups (láser, paleta ancha, pegamento, vida extra, bola lenta, salto de nivel…).
- Varias cápsulas cayendo a la vez.
- Que un ladrillo suelte la cápsula mientras haya más de 1 bola.
- Ladrillos marcados en la cuadrícula para que lleven el power-up.
- Puntos por atrapar la cápsula.
- Sprite propio para la cápsula o cambios en `assets/`.
- Tecla de depuración para soltar cápsulas dentro del juego.
- Choques elásticos con intercambio de velocidad entre bolas.
- Cambios en las decisiones de implementación del SPEC 01 y del SPEC 02.
- Todo lo que los specs anteriores ya dejaban fuera: enemigos, controles táctiles, escalado del canvas, pausa automática y música.

## Modelo de datos

```js
// Power-up de multibola
const POWERUP_CHANCE = 0.1;       // probabilidad de soltar cápsula al romper un ladrillo
const CAPSULE_W = 32, CAPSULE_H = 14;
const CAPSULE_SPEED = 150;        // px/s, caída vertical
const CAPSULE_COLOR = '#f80';
const MULTIBALL_ANGLES = [-Math.PI / 4, 0, Math.PI / 4]; // 3 bolas nuevas, respecto a la vertical, hacia arriba

// Campos nuevos o cambiados en state (el resto, igual que en el SPEC 02)
const state = {
  balls: [ /* { x, y, vx, vy, size } */ ], // sustituye a state.ball
  capsule: null,   // null | { x, y }: la cápsula en vuelo, como mucho una
  // ...mode, level, score, lives, highScores, newEntryIndex, paddle, bricks, explosions, input
};
```

Convenciones:

- Cada bola tiene la misma forma que el antiguo `state.ball`: `{ x, y, vx, vy, size }`, con `size = BALL_SIZE`.
- En `serve` hay exactamente 1 bola, `state.balls[0]`, pegada sobre el centro de la paleta.
- `capsule.x` y `capsule.y` son la esquina superior izquierda. Al nacer, `x = brick.x` e `y = brick.y + 1`, que la centra verticalmente en el hueco de 16 px del ladrillo.
- Como la cápsula solo nace con 1 bola en juego, al atraparla sigue habiendo 1 bola. Esa bola, `state.balls[0]`, es el origen de las 3 nuevas.
- Velocidad de una bola nueva con ángulo `a`: `vx = ballSpeed() * sin(a)` y `vy = -ballSpeed() * cos(a)`.
- Choque entre bolas: `n` es el vector unitario del centro de la bola A al de la B. Hay choque si la distancia entre centros es mayor que 0 y menor que `BALL_SIZE`, y además `(vB − vA) · n < 0`, es decir, si se acercan. En el choque, la componente de A sobre `n` toma signo negativo y la de B, positivo. Así la magnitud de cada velocidad no cambia.
- Como en el SPEC 02, todos los rebotes salvo el de la paleta solo cambian signos y conservan la magnitud. La rapidez de cualquier bola es siempre `ballSpeed()`.

## Plan de implementación

1. **Lista de bolas.** Sustituir `state.ball` por `state.balls` y añadir `createBall()`, que devuelve `{ x: 0, y: 0, vx: 0, vy: 0, size: BALL_SIZE }`. `resetGame`, `nextLevel` y `loseLife` (cuando quedan vidas) dejan `state.balls = [createBall()]` y colocan esa bola en la paleta. `placeBallOnPaddle` y `launchBall` actúan sobre `state.balls[0]`. `updateBall` pasa a recorrer todas las bolas. Cada bola que cae por debajo de `H` se elimina, y si el array queda vacío se llama a `loseLife`. `draw` dibuja todas las bolas. Prueba manual: el juego se comporta igual que antes y `state.balls.length` vale 1 durante la partida.
2. **Cápsula.** Añadir `CAPSULE_W`, `CAPSULE_H`, `CAPSULE_SPEED`, `CAPSULE_COLOR` y `state.capsule = null`. Añadir también `spawnCapsule(x, y)`. En `playing`, la cápsula baja `CAPSULE_SPEED * dt`. Si se solapa (AABB) con la paleta, suena `ball-bounce.mp3` y `capsule` vuelve a `null`. Si `y > H`, `capsule` vuelve a `null` sin sonido. Se dibuja después de las explosiones y antes de la paleta, con `ctx.roundRect` de radio 7 relleno de `CAPSULE_COLOR` y una "D" blanca centrada en `bold 12px monospace`. `resetGame`, `nextLevel` y `loseLife` ponen `capsule = null`. Prueba manual: con la pelota en juego, `spawnCapsule(200, 300)` en la consola muestra la cápsula cayendo. Si se atrapa, suena y desaparece. Si no, desaparece por abajo.
3. **Caída aleatoria.** Añadir `POWERUP_CHANCE`. En `collideBricks`, al eliminar un ladrillo, se llama a `spawnCapsule(brick.x, brick.y + 1)` si `state.capsule === null`, `state.balls.length === 1` y `Math.random() < POWERUP_CHANCE`. Prueba manual: al jugar el nivel 1 aparecen cápsulas de vez en cuando, nunca dos a la vez.
4. **Multibola.** Añadir `MULTIBALL_ANGLES` y `activateMultiball()`, que añade 3 bolas en la posición `x, y` de `state.balls[0]` con las velocidades de la convención. Se llama al atrapar la cápsula. Con la condición `state.balls.length === 1` del paso 3, no caen cápsulas mientras dure la multibola. Prueba manual: con `spawnCapsule` desde la consola y atrapando la cápsula, aparecen 4 bolas y `state.balls.length` vale 4. Al caer 3 de ellas, las vidas no cambian. Al caer la última, se pierde 1 vida y vuelve 1 bola a la paleta.
5. **Choques entre bolas.** Añadir `collideBalls()`, que recorre cada par de bolas una vez por frame y aplica la regla de choque de la convención. Reproduce `ball-bounce.mp3` por cada par que rebota. Se llama en `updateBall` después de mover y hacer rebotar todas las bolas, antes de eliminar las que han caído. Prueba manual: tras activar la multibola, las 4 bolas se separan al nacer sin rebotar. Más tarde, dos bolas que se cruzan rebotan, y `Math.hypot(vx, vy)` de cada bola sigue dando la velocidad del nivel.

## Criterios de aceptación

- [ ] Servida con `python -m http.server`, `http://localhost:8000` carga el juego sin errores en la consola.
- [ ] Con 1 bola, el juego se comporta como en el SPEC 02: saque, rebotes, vidas, niveles y récords.
- [ ] Al romper ladrillos aparecen cápsulas de vez en cuando, en la posición del ladrillo roto.
- [ ] Un ladrillo gris solo puede soltar la cápsula al romperse, no en su primer golpe.
- [ ] Nunca hay más de una cápsula en pantalla.
- [ ] Mientras haya más de 1 bola en juego no aparece ninguna cápsula.
- [ ] La cápsula se ve como un rectángulo redondeado naranja con una "D" blanca y cae en vertical, sin desplazarse en horizontal.
- [ ] Si la cápsula toca la paleta, desaparece, suena `ball-bounce.mp3` y la puntuación no cambia.
- [ ] Si la cápsula llega abajo sin tocar la paleta, desaparece y no pasa nada más.
- [ ] Al atrapar la cápsula hay 4 bolas en juego.
- [ ] Las 3 bolas nuevas nacen en la posición de la bola existente y salen hacia arriba en abanico: a la izquierda, en vertical y a la derecha.
- [ ] Las 3 bolas nuevas no rebotan entre sí ni con la original al nacer.
- [ ] Todas las bolas rompen ladrillos, suman puntos y rebotan en paredes, techo y paleta.
- [ ] Dos bolas que se cruzan acercándose rebotan y suena `ball-bounce.mp3`.
- [ ] La velocidad de cada bola es la del nivel (300, 345 o 390 px/s), también tras chocar con otra bola.
- [ ] Si cae una bola y quedan otras en juego, las vidas no cambian.
- [ ] Al caer la última bola se pierde 1 vida y vuelve 1 bola a la paleta en modo saque.
- [ ] Al perder la última vida con la última bola aparece "Game Over".
- [ ] Al perder una vida, al pasar de nivel y al reiniciar no queda ninguna cápsula en pantalla y hay exactamente 1 bola.
- [ ] Romper el último ladrillo con varias bolas en juego lleva a "Nivel N superado" o a "¡Has ganado!" como en el SPEC 02.
- [ ] En pausa, la cápsula y todas las bolas quedan quietas y se reanudan sin saltos.
- [ ] `spawnCapsule(200, 300)` en la consola, con la pelota en juego, hace caer una cápsula desde ese punto.
- [ ] El proyecto no añade dependencias, ni `package.json`, ni paso de build, y sigue teniendo solo `index.html`, `styles.css` y `game.js`.

## Decisiones

- **Sí:** un 10% de probabilidad por ladrillo roto, como en el Arkanoid clásico. Salen unas 9 cápsulas en el nivel 1, que tiene 91 ladrillos, y la partida cambia de una vez a otra.
- **No:** 1 o N ladrillos al azar por nivel. Es predecible.
- **No:** ladrillos marcados en la cuadrícula. Obliga a rediseñar los niveles del SPEC 02.
- **Sí:** solo una cápsula a la vez, y ninguna mientras haya más de 1 bola. Evita la explosión de bolas y es el comportamiento de Disruption.
- **No:** sumar 3 bolas por cápsula, con o sin tope. Hay riesgo de caos visual y de rendimiento.
- **Sí:** las 3 bolas nuevas nacen en la bola existente y salen hacia arriba a −45°, 0° y +45°. Ninguna cae al instante aunque la original vaya bajando.
- **No:** nacer desde la paleta. Se pierde la gracia de que la multibola salga de donde está la acción.
- **No:** girar la dirección de la bola original. Si iba bajando, las nuevas también bajarían.
- **Sí:** 150 px/s de caída, la mitad que la bola del nivel 1. Desde la fila más baja tarda unos 3 s en llegar a la paleta.
- **Sí:** la cápsula se dibuja con canvas como un rectángulo naranja con una "D". El spritesheet no tiene sprite para ella y la "D" evoca Disruption.
- **No:** reutilizar el sprite de la bola. Se confundiría con la bola real.
- **Sí:** atrapar la cápsula suena y no da puntos. Hay feedback y no cambia el máximo de 20040 puntos que el SPEC 02 usó para el HUD.
- **Sí:** al perder una vida, pasar de nivel o reiniciar, todo se limpia. El modo `serve` sigue teniendo exactamente 1 bola y ninguna cápsula.
- **No:** dejar caer la cápsula durante el saque. Complica `serve` sin aportar.
- **Sí:** las bolas chocan entre sí, por decisión del usuario.
- **Sí:** en el choque cada bola conserva su rapidez y su componente sobre la línea de centros toma el signo que la aleja de la otra. Así se mantiene la velocidad fija por nivel del SPEC 02 y se sigue la misma idea que el rebote con ladrillos del SPEC 01.
- **No:** choque elástico real con intercambio de velocidades. Una bola podría quedarse casi parada o pasar de 390 px/s y atravesar ladrillos.
- **Sí:** solo rebotan si se solapan y se acercan. Las bolas que nacen en el mismo punto se separan sin chocar y dos bolas solapadas no se quedan pegadas.
- **No:** nacer separadas unos píxeles. Podría sacar una bola por una pared o meterla dentro de un ladrillo.
- **Sí:** `spawnCapsule(x, y)` como función global para probar desde la consola. Las pruebas no dependen del azar y el juego no lleva trucos.
- **No:** tecla de depuración. Habría que quitarla o desactivarla después.
- **Sí:** refactorizar `state.ball` a `state.balls` en el primer paso, sin cambiar el comportamiento. Así el paso es verificable por sí solo y el resto del plan se apoya en él.
- **Sí:** todo en `game.js`, por coherencia con los SPEC 01 y 02.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Al cambiar `state.ball` por `state.balls` queda alguna referencia vieja | El paso 1 hace solo esa refactorización y se prueba jugando una partida completa antes de seguir. Una búsqueda de `state.ball\b` en `game.js` no debe dar resultados. |
| Dos bolas a 390 px/s en sentidos opuestos se acercan 26 px por frame (con dt = 1/30 s), más que su diámetro (12), y pueden atravesarse sin chocar | Se acepta. Atravesarse es inofensivo y no hace falta sub-stepping. Contra paredes, paleta y ladrillos cada bola sigue avanzando como máximo 13 px por frame, como en el SPEC 02. |
| Dos bolas que nacen exactamente en el mismo punto dan una distancia de 0 y no hay dirección de choque | Con una distancia de 0 no hay choque. Las bolas se separan en el frame siguiente porque sus velocidades son distintas. |
| Muchos sonidos a la vez con 4 bolas | `playSound` ya usa `cloneNode()` y cada choque suena una sola vez por par y frame. |
| `ctx.roundRect` no existe en navegadores antiguos | Está en todos los navegadores actuales (Chrome 99+, Firefox 112+ y Safari 16+). El proyecto ya asume un navegador moderno. |
| Una bola choca con un ladrillo que otra bola ha roto en el mismo frame | Cada bola recorre `state.bricks` después de que la anterior haya hecho `splice`, así que nunca ve un ladrillo ya eliminado. |

## Qué **no** entra en este spec

- Otros power-ups y varias cápsulas a la vez.
- Cápsulas mientras haya multibola.
- Ladrillos marcados para llevar el power-up y puntos por atrapar la cápsula.
- Sprite propio para la cápsula y tecla de depuración.
- Choques elásticos reales entre bolas.
- Cambios en las decisiones de los SPEC 01 y 02.
- Enemigos, controles táctiles, escalado del canvas, pausa automática y música.

Cada uno de ellos, si llega, irá en su propio spec.
