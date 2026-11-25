# Iron Titan 8 — Standalone Android 13 Portrait PWA Package

Built specifically for the **TCL Ion V** smartphone (**360×720** viewport, **720×1440** combat canvas) on **Android 13 Chrome** using **touch-only input** (`touchstart`, `touchmove`, `touchend`, `touchcancel`, touch-hold) with **no desktop, keyboard, mouse, or Apple/iOS dependencies**.

## Package Contents
- `standalone/index.html` — Fully self-contained single-file HTML5 app with inline CSS3, inline JSON metadata & PWA manifest, inline PNG icons, and ES module `importmap` plugins.
- `standalone/styles/console.css` — CSS3 hardware console chassis, D-pad/joystick combo, and portrait shell styles.
- `standalone/metadata.json` & `standalone/manifest.webmanifest` — App metadata and Android Chrome standalone portrait manifest.
- `standalone/sw.js` — Offline service worker precaching icons, styles, metadata, and PNG spritesheets.
- `standalone/icons/` — Generated PNG launcher icons (`32×32`, `192×192`, `512×512`, and maskable `512×512`).
- `standalone/src/sprites/` — PNG spritesheets and animation keyframe PNGs (`idle_00.png`, `walk_00.png`, `run_00.png`, `attack_00.png`) for all 8 heavyweight champions (480 stills per fighter / 3,840 total).

## Inline ES Module Plugin Architecture
`standalone/index.html` wires all subsystems via `<script type="importmap">` with explicit ES module `import` and `export` bindings:
1. `@iron-titan/metadata` — Parses inline JSON metadata and registers the inline PWA manifest + Service Worker.
2. `@iron-titan/audio` — Web Audio API synthesized combat effects (jab, heavy, slam, parry, clinch, springboard, KO, victory).
3. `@iron-titan/haptics` — `navigator.vibrate` tactile patterns scaled by user intensity setting.
4. `@iron-titan/storage` — LocalStorage persistence for Fighter Mastery XP/Ranks, 8-Nation Cup titles, Dojo trials, and thumb ergonomics.
5. `@iron-titan/sprites` — Procedural PNG spritesheet & portrait generator covering Idle, Walk, Run, and Attack animations.
6. `@iron-titan/tournament` — 8-Nation Knockout Cup single-elimination bracket progression.
7. `@iron-titan/controller` — Touch-only D-pad/analog joystick combo and `A`/`B` buttons with adjustable scale, thumb gap, and opacity.
8. `@iron-titan/engine` — 720×1440 combat loop with clinch grapples (`A+B`), throw techs, springboard corner rebounds, afterimages, hit-flashes, mat dust, arena lighting overlays, critical/clinch camera zoom, and Sudden-Death Overtime.
