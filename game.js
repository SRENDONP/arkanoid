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
const BALL_SPEED = 300;           // velocidad en el nivel 1
const SPEED_STEP = 0.15;          // +15% por nivel sobre BALL_SPEED
const SERVE_ANGLE = Math.PI / 6;  // saque: 30° a la derecha respecto a la vertical
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° respecto a la vertical

const FLASH_MS = 100;             // destello blanco del gris al primer golpe

// Récords: top 5 en localStorage
const HIGHSCORES_KEY = 'arkanoid:highscores:v1';
const HIGHSCORES_MAX = 5;

// dt máximo por frame (s), para que una pestaña en segundo plano no provoque saltos
const MAX_DT = 1 / 30;

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

// Niveles: 13 columnas por fila, '.' = hueco
const LEVEL_1 = [
  'SSSSSSSSSSSSS',
  'YYYYYYYYYYYYY',
  'PPPPPPPPPPPPP',
  'MMMMMMMMMMMMM',
  'RRRRRRRRRRRRR',
  'GGGGGGGGGGGGG',
  'CCCCCCCCCCCCC',
];

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

// Convierte una cuadrícula ASCII en la lista de ladrillos
function buildBricks(level) {
  const bricks = [];
  level.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const type = BRICK_TYPES[row[c]];
      if (!type) continue;
      bricks.push({
        x: GRID_X + c * BRICK_W,
        y: GRID_Y + r * BRICK_H,
        color: type.color,
        hits: type.hits,
        points: type.points,
        flashUntil: 0,
      });
    }
  });
  return bricks;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Estado del juego
const state = {
  mode: 'start',   // 'start' | 'serve' | 'playing' | 'paused' | 'levelclear' | 'won' | 'gameover'
  level: 1,        // 1..LEVELS.length; el nivel actual es LEVELS[level - 1]
  score: 0,
  lives: 3,
  highScores: [],  // { score, level, date }, ordenado de mayor a menor score
  newEntryIndex: -1, // posición en highScores de la partida recién terminada, o -1
  paddle: { x: 200, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H },
  ball: { x: 0, y: 0, vx: 0, vy: 0, size: BALL_SIZE },
  bricks: [],
  explosions: [],
  input: { left: false, right: false, mouseX: null },
};

let lastTime = 0;

// Sonidos precargados; cada reproducción usa un clon para que se puedan solapar
const SOUNDS = {
  bounce: new Audio('assets/sounds/ball-bounce.mp3'),
  break: new Audio('assets/sounds/break-sound.mp3'),
};

function playSound(sound) {
  // play() puede rechazarse por la política de autoplay; no debe romper el juego
  sound.cloneNode().play().catch(() => {});
}

// Una entrada válida: score entero > 0, level entero 1..LEVELS.length y date 'YYYY-MM-DD'
function isValidEntry(e) {
  return e !== null && typeof e === 'object' &&
    Number.isInteger(e.score) && e.score > 0 &&
    Number.isInteger(e.level) && e.level >= 1 && e.level <= LEVELS.length &&
    typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
}

// Lee el top 5; ante JSON inválido, un valor que no es array o localStorage
// inaccesible devuelve []. Las entradas con campos incorrectos se descartan
function loadHighScores() {
  try {
    const data = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    if (!Array.isArray(data)) return [];
    return data.filter(isValidEntry).slice(0, HIGHSCORES_MAX);
  } catch (err) {
    return [];
  }
}

// Si localStorage falla (modo privado, cuota), la tabla vive solo en memoria
function saveHighScores() {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(state.highScores));
  } catch (err) {
    // sin persistencia; el juego sigue funcionando
  }
}

// Fecha local en formato 'YYYY-MM-DD'
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// Al terminar la partida: entra si score > 0 y hay hueco o supera estrictamente
// a la 5ª. Ante un empate la nueva va detrás
function submitScore() {
  const scores = state.highScores;
  const fits = scores.length < HIGHSCORES_MAX || state.score > scores[HIGHSCORES_MAX - 1].score;
  if (state.score <= 0 || !fits) {
    state.newEntryIndex = -1;
    return;
  }

  let index = scores.findIndex((e) => e.score < state.score);
  if (index === -1) index = scores.length;
  scores.splice(index, 0, { score: state.score, level: state.level, date: todayISO() });
  scores.length = Math.min(scores.length, HIGHSCORES_MAX);
  saveHighScores();
  state.newEntryIndex = index;
}

// Partida nueva: nivel 1, 0 puntos, 3 vidas, nivel completo y pelota en la paleta
function resetGame(mode) {
  state.mode = mode;
  state.level = 1;
  state.score = 0;
  state.lives = 3;
  state.newEntryIndex = -1;
  state.paddle.x = 200;
  state.bricks = buildBricks(LEVELS[0]);
  state.explosions = [];
  placeBallOnPaddle();
}

// Nivel siguiente: conserva puntos y vidas; paleta al centro y pelota en la paleta
function nextLevel() {
  state.level += 1;
  state.bricks = buildBricks(LEVELS[state.level - 1]);
  state.explosions = [];
  state.paddle.x = 200;
  placeBallOnPaddle();
  state.mode = 'serve';
}

function placeBallOnPaddle() {
  const ball = state.ball;
  const paddle = state.paddle;
  ball.x = paddle.x + paddle.w / 2 - ball.size / 2;
  ball.y = paddle.y - ball.size;
}

// Entrada: teclado
const KEYS_LEFT = ['ArrowLeft', 'KeyA'];
const KEYS_RIGHT = ['ArrowRight', 'KeyD'];

function onKey(e, pressed) {
  if (e.code === 'Space') {
    if (pressed && !e.repeat) onSpace();
    e.preventDefault();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (pressed && !e.repeat) togglePause();
    e.preventDefault();
  } else if (KEYS_LEFT.includes(e.code)) {
    state.input.left = pressed;
    e.preventDefault();
  } else if (KEYS_RIGHT.includes(e.code)) {
    state.input.right = pressed;
    e.preventDefault();
  }
}

window.addEventListener('keydown', (e) => onKey(e, true));
window.addEventListener('keyup', (e) => onKey(e, false));

// Entrada: ratón (X del cursor relativo al canvas)
canvas.addEventListener('mousemove', (e) => {
  state.input.mouseX = e.clientX - canvas.getBoundingClientRect().left;
});

canvas.addEventListener('click', () => launchBall());

function onSpace() {
  if (state.mode === 'start') {
    state.mode = 'serve';
  } else if (state.mode === 'serve') {
    launchBall();
  } else if (state.mode === 'levelclear') {
    nextLevel();
  } else if (state.mode === 'won' || state.mode === 'gameover') {
    resetGame('serve');
  }
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
  }
}

// Velocidad de la pelota en el nivel actual: 300, 345 y 390 px/s
function ballSpeed() {
  return BALL_SPEED * (1 + SPEED_STEP * (state.level - 1));
}

function launchBall() {
  if (state.mode !== 'serve') return;
  const speed = ballSpeed();
  state.ball.vx = speed * Math.sin(SERVE_ANGLE);
  state.ball.vy = -speed * Math.cos(SERVE_ANGLE);
  state.mode = 'playing';
}

function loseLife() {
  state.lives -= 1;
  if (state.lives > 0) {
    state.mode = 'serve';
  } else {
    state.mode = 'gameover';
    submitScore();
  }
}

function updatePaddle(dt) {
  const paddle = state.paddle;
  const input = state.input;

  // El ratón coloca el centro de la paleta en el X del cursor; se consume
  // para que el teclado vuelva a mandar hasta el siguiente movimiento
  if (input.mouseX !== null) {
    paddle.x = input.mouseX - paddle.w / 2;
    input.mouseX = null;
  }

  let dir = 0;
  if (input.left) dir -= 1;
  if (input.right) dir += 1;
  paddle.x += dir * PADDLE_SPEED * dt;

  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
}

// Solapamiento AABB entre dos rectángulos
function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// El ángulo de salida depende del punto de impacto: el centro manda la
// pelota casi vertical y los extremos, en diagonal (máx. MAX_BOUNCE_ANGLE)
function bounceOffPaddle(ball, paddle) {
  const ballCenter = ball.x + ball.size / 2;
  const paddleCenter = paddle.x + paddle.w / 2;
  const offset = Math.max(-1, Math.min(1, (ballCenter - paddleCenter) / (PADDLE_W / 2)));
  const angle = offset * MAX_BOUNCE_ANGLE;

  const speed = ballSpeed();
  ball.vx = speed * Math.sin(angle);
  ball.vy = -speed * Math.cos(angle);
  ball.y = paddle.y - ball.size;
}

// Como máximo un ladrillo por frame. Se invierte la velocidad en el eje de
// menor solapamiento, alejando la pelota del ladrillo para no volver a
// invertirla en el frame siguiente si aún se solapan
function collideBricks(ball) {
  for (let i = 0; i < state.bricks.length; i++) {
    const brick = state.bricks[i];
    if (!overlaps(ball.x, ball.y, ball.size, ball.size,
                  brick.x, brick.y, BRICK_W, BRICK_H)) continue;

    const overlapX = Math.min(ball.x + ball.size - brick.x, brick.x + BRICK_W - ball.x);
    const overlapY = Math.min(ball.y + ball.size - brick.y, brick.y + BRICK_H - ball.y);
    const ballLeftOfCenter = ball.x + ball.size / 2 < brick.x + BRICK_W / 2;
    const ballAboveCenter = ball.y + ball.size / 2 < brick.y + BRICK_H / 2;

    if (overlapX < overlapY) {
      ball.vx = ballLeftOfCenter ? -Math.abs(ball.vx) : Math.abs(ball.vx);
    } else {
      ball.vy = ballAboveCenter ? -Math.abs(ball.vy) : Math.abs(ball.vy);
    }

    brick.hits -= 1;
    if (brick.hits <= 0) {
      state.bricks.splice(i, 1);
      state.score += brick.points;
      state.explosions.push({ x: brick.x, y: brick.y, color: brick.color, startedAt: performance.now() });
      playSound(SOUNDS.break);
    } else {
      if (brick.color === 'gray') {
        brick.flashUntil = performance.now() + FLASH_MS;
      }
      playSound(SOUNDS.bounce);
    }
    return;
  }
}

function updateBall(dt) {
  const ball = state.ball;
  const paddle = state.paddle;

  // En el saque la pelota va pegada sobre el centro de la paleta
  if (state.mode === 'serve') {
    placeBallOnPaddle();
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Paredes laterales
  if (ball.x < 0) {
    ball.x = 0;
    ball.vx = Math.abs(ball.vx);
    playSound(SOUNDS.bounce);
  } else if (ball.x + ball.size > W) {
    ball.x = W - ball.size;
    ball.vx = -Math.abs(ball.vx);
    playSound(SOUNDS.bounce);
  }

  // Techo: borde inferior del HUD
  if (ball.y < HUD_H) {
    ball.y = HUD_H;
    ball.vy = Math.abs(ball.vy);
    playSound(SOUNDS.bounce);
  }

  collideBricks(ball);
  if (state.bricks.length === 0) {
    if (state.level < LEVELS.length) {
      state.mode = 'levelclear';
    } else {
      state.mode = 'won';
      submitScore();
    }
    return;
  }

  // Paleta: solo rebota si la pelota baja
  if (ball.vy > 0 && overlaps(ball.x, ball.y, ball.size, ball.size,
                              paddle.x, paddle.y, paddle.w, paddle.h)) {
    bounceOffPaddle(ball, paddle);
    playSound(SOUNDS.bounce);
  }

  // Cae por abajo
  if (ball.y > H) {
    loseLife();
  }
}

function update(dt) {
  // En inicio, pausa, nivel superado, victoria y game over la partida está congelada
  if (state.mode !== 'serve' && state.mode !== 'playing') return;
  updatePaddle(dt);
  updateBall(dt);
}

function drawHud() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, W, HUD_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('PUNTOS: ' + state.score, 12, HUD_H / 2);
  ctx.textAlign = 'center';
  const record = state.highScores.length > 0 ? state.highScores[0].score : 0;
  ctx.fillText('RÉCORD: ' + record, 190, HUD_H / 2);
  ctx.fillText('NIVEL: ' + state.level, 320, HUD_H / 2);
  ctx.textAlign = 'right';
  ctx.fillText('VIDAS: ' + state.lives, W - 12, HUD_H / 2);
}

// 'YYYY-MM-DD' → 'DD/MM/AAAA'
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

// Top 5 debajo del mensaje; la partida recién terminada, en amarillo
function drawHighScores(y) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (state.newEntryIndex === 0) {
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('¡Nuevo récord!', W / 2, y);
  }
  y += 36;

  ctx.font = '16px monospace';
  if (state.highScores.length === 0) {
    ctx.fillStyle = '#fff';
    ctx.fillText('Sin récords todavía', W / 2, y);
    return;
  }
  // Puntuación con ancho fijo (5 cifras) para que las columnas queden alineadas
  state.highScores.forEach((e, i) => {
    ctx.fillStyle = i === state.newEntryIndex ? '#ff0' : '#fff';
    const row = (i + 1) + '. ' + String(e.score).padStart(5) + '  NIVEL ' + e.level + '  ' + formatDate(e.date);
    ctx.fillText(row, W / 2, y + i * 26);
  });
}

// Texto centrado sobre un velo semitransparente; con withTable el texto se
// sube para dejar sitio al top 5 debajo
function drawMessage(title, subtitle, withTable) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, HUD_H, W, H - HUD_H);

  const titleY = withTable ? 200 : H / 2;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(title, W / 2, titleY);
  if (subtitle) {
    ctx.font = '18px monospace';
    ctx.fillText(subtitle, W / 2, titleY + 40);
  }
  if (withTable) drawHighScores(titleY + 100);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const now = performance.now();
  for (const brick of state.bricks) {
    if (brick.flashUntil > now) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
      continue;
    }
    // Gris dañado: atenuado, porque el spritesheet no tiene sprite de daño
    ctx.globalAlpha = brick.color === 'gray' && brick.hits === 1 ? 0.6 : 1;
    drawSprite(ctx, 'block_' + brick.color, brick.x, brick.y, BRICK_W, BRICK_H);
  }
  ctx.globalAlpha = 1;

  // Explosiones: 4 frames repartidos en EXPLOSION_DURATION; no colisionan
  state.explosions = state.explosions.filter((ex) => now - ex.startedAt <= EXPLOSION_DURATION);
  for (const ex of state.explosions) {
    const frames = EXPLOSION_FRAMES[ex.color];
    if (!frames) continue;
    const elapsed = now - ex.startedAt;
    const frame = Math.min(frames.length - 1, Math.floor(elapsed / (EXPLOSION_DURATION / 4)));
    drawFrame(ctx, frames[frame], ex.x, ex.y, BRICK_W, BRICK_H);
  }

  const paddle = state.paddle;
  drawSprite(ctx, 'paddle', paddle.x, paddle.y, paddle.w, paddle.h);

  const ball = state.ball;
  drawSprite(ctx, 'ball', ball.x, ball.y, ball.size, ball.size);

  drawHud();

  if (state.mode === 'start') {
    drawMessage('Pulsa Espacio para empezar', null, true);
  } else if (state.mode === 'paused') {
    drawMessage('PAUSA');
  } else if (state.mode === 'levelclear') {
    drawMessage('Nivel ' + state.level + ' superado', 'Espacio para continuar');
  } else if (state.mode === 'won') {
    drawMessage('¡Has ganado!', 'Espacio para reiniciar', true);
  } else if (state.mode === 'gameover') {
    drawMessage('Game Over', 'Espacio para reiniciar', true);
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

state.highScores = loadHighScores();
resetGame('start');

loadSpritesheet(() => {
  requestAnimationFrame((now) => {
    lastTime = now;
    requestAnimationFrame(loop);
  });
});
