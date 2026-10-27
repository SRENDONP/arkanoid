# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Clon de Arkanoid/Breakout hecho con HTML + CSS + JavaScript puro y **cero dependencias** (sin npm, sin bundler, sin frameworks, sin paso de build). El juego todavía no está implementado: por ahora solo existen los assets. Responder siempre en español.

## Cómo ejecutarlo

No hay herramientas de build, lint ni tests. Abre la página HTML de entrada en el navegador, o sirve la carpeta de forma estática para que las rutas de los assets se resuelvan desde la raíz del proyecto, por ejemplo `python -m http.server` y luego abre `http://localhost:8000`.

## Assets

- `assets/spritesheet.js` es un script clásico (no es un módulo) que define variables globales; cárgalo con una etiqueta `<script>` normal antes del código del juego. Expone:
  - `loadSpritesheet(cb)`: carga `assets/spritesheet-breakout.png` (la ruta es relativa a la página HTML, así que la página debe estar en la raíz del proyecto) y llama a `cb` cuando está lista.
  - `drawSprite(ctx, name, x, y, w, h)`: `name` es `paddle`, `ball` o `block_<color>`, donde el color es uno de `gray, red, yellow, cyan, magenta, hotpink, green`.
  - `EXPLOSION_FRAMES[color]` (4 frames, disponible para algunos colores de bloque) junto con `drawFrame(ctx, frame, ...)` y `EXPLOSION_DURATION` (ms), para la animación al romper ladrillos.
  - Las funciones de dibujo no hacen nada hasta que el spritesheet termina de cargar.
- `assets/sounds/` contiene `ball-bounce.mp3` y `break-sound.mp3`.

## Flujo de trabajo con specs

Las funcionalidades grandes se diseñan y se implementan con dos skills del proyecto en `.claude/skills/`:

- `/spec <descripción>`: sesión interactiva de diseño en 4 fases que escribe `specs/NN-slug.md` a partir de `.claude/skills/spec/template.md`. En esta fase no se escribe código.
- `/spec-impl NN-slug`: implementa un spec solo si su estado es `Aprobado` (o `Approved`), en una rama git `spec-NN-slug` (controlado por `AutoCreateBranch` en `specs/.spec-config.yml`, por defecto `true`). Implementa un paso del plan a la vez, pausando para revisar el diff, y **nunca hace commit por su cuenta**.

Al implementar un spec, síguelo al pie de la letra; si hay ambigüedades o pedidos fuera de alcance, plantéalos en lugar de improvisar. Nota: la carpeta todavía no es un repositorio git, y `/spec-impl` lo necesita (ejecuta `git init` primero).
