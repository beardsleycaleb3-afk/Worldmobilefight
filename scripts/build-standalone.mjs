import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const STANDALONE_DIR = path.join(ROOT, 'standalone');
const ICONS_DIR = path.join(STANDALONE_DIR, 'icons');
const SPRITES_DIR = path.join(STANDALONE_DIR, 'src', 'sprites');
const STYLES_DIR = path.join(STANDALONE_DIR, 'styles');
const PUBLIC_STANDALONE_DIR = path.join(ROOT, 'public', 'standalone');

fs.mkdirSync(ICONS_DIR, { recursive: true });
fs.mkdirSync(SPRITES_DIR, { recursive: true });
fs.mkdirSync(STYLES_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_STANDALONE_DIR, { recursive: true });

// --- Pure Node PNG Encoder (Zero Dependencies) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setPixel(rgba, w, h, x, y, r, g, b, a = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
  const idx = (iy * w + ix) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
}

function fillCircle(rgba, w, h, cx, cy, rad, rgb, a = 255) {
  const r2 = rad * rad;
  const minX = Math.max(0, Math.floor(cx - rad));
  const maxX = Math.min(w - 1, Math.ceil(cx + rad));
  const minY = Math.max(0, Math.floor(cy - rad));
  const maxY = Math.min(h - 1, Math.ceil(cy + rad));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const shade = Math.max(0.65, 1 - Math.hypot(dx, dy) / (rad * 1.6));
        setPixel(
          rgba,
          w,
          h,
          x,
          y,
          Math.round(rgb[0] * shade),
          Math.round(rgb[1] * shade),
          Math.round(rgb[2] * shade),
          a
        );
      }
    }
  }
}

function fillCapsule(rgba, w, h, x1, y1, x2, y2, rad, rgb) {
  const steps = Math.max(4, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(rgba, w, h, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, rad, rgb);
  }
}

function renderIconPng(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const ny = y / size;
      rgba[idx] = Math.round(11 + ny * 10);
      rgba[idx + 1] = Math.round(14 + ny * 8);
      rgba[idx + 2] = Math.round(20 + ny * 16);
      rgba[idx + 3] = 255;
    }
  }
  const margin = maskable ? size * 0.14 : size * 0.06;
  const cx = size * 0.5;
  const cy = size * 0.5;
  const outerR = size * 0.5 - margin;

  // Gold championship ring
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= outerR && d >= outerR * 0.82) {
        setPixel(rgba, size, size, x, y, 245, 158, 11, 255);
      }
    }
  }
  // Titan Fist emblem inside ring
  const gold = [245, 158, 11];
  const amber = [251, 191, 36];
  const dark = [15, 23, 42];
  fillCircle(rgba, size, size, cx, cy, outerR * 0.72, dark);
  fillCapsule(rgba, size, size, cx - outerR * 0.24, cy - outerR * 0.05, cx + outerR * 0.24, cy - outerR * 0.05, outerR * 0.22, gold);
  fillCapsule(rgba, size, size, cx - outerR * 0.18, cy + outerR * 0.22, cx + outerR * 0.18, cy + outerR * 0.22, outerR * 0.16, amber);
  fillCircle(rgba, size, size, cx, cy - outerR * 0.34, outerR * 0.16, amber);
  return encodePngRgba(size, size, rgba);
}

// --- 8 Heavyweight Fighters Data ---
const FIGHTERS = [
  {
    id: 'india-vikram',
    rank: 1,
    country: 'India',
    countryCode: 'IND',
    populationLabel: '1.45B',
    name: 'Vikram Rathore',
    epithet: 'Iron Pehelwan',
    discipline: 'Kushti Wrestling',
    signatureMove: 'Vajra Palm Slam',
    projectileName: 'Vajra Shockwave',
    projectileColor: '#f59e0b',
    stats: { power: 93, speed: 75, reach: 86 },
    skinHex: '#9c6644',
    trunksHex: '#ea580c',
    accentHex: '#facc15',
    wrapHex: '#f5efe6',
    arena: { name: 'Jaipur Akhara Pit', skyTop: '#24142c', skyBottom: '#9a3412', mat: '#7c4a2d', accent: '#f59e0b', lighting: 'shifting_sunlight' },
    rivalLine: 'Strength forged in the akhara pit breaks every challenger.',
    victoryQuote: 'The akhara earth remembers only the victor.',
  },
  {
    id: 'china-zhao',
    rank: 2,
    country: 'China',
    countryCode: 'CHN',
    populationLabel: '1.41B',
    name: 'Zhao Shen',
    epithet: 'Jade Colossus',
    discipline: 'Bajiquan Iron Body',
    signatureMove: 'Dragon Shoulder Ram',
    projectileName: 'Jade Chi Pulse',
    projectileColor: '#10b981',
    stats: { power: 89, speed: 84, reach: 83 },
    skinHex: '#d4a373',
    trunksHex: '#b91c1c',
    accentHex: '#10b981',
    wrapHex: '#fef3c7',
    arena: { name: 'Mount Song Courtyard', skyTop: '#0f172a', skyBottom: '#7f1d1d', mat: '#334155', accent: '#dc2626', lighting: 'shifting_sunlight' },
    rivalLine: 'One Bajiquan shoulder strike shatters stone and steel alike.',
    victoryQuote: 'Balance and explosive force decide the mountain.',
  },
  {
    id: 'usa-marcus',
    rank: 3,
    country: 'United States',
    countryCode: 'USA',
    populationLabel: '345M',
    name: 'Marcus Vance',
    epithet: 'Gridiron Titan',
    discipline: 'Heavyweight Boxing',
    signatureMove: 'Haymaker Blitz',
    projectileName: 'Iron Concussion',
    projectileColor: '#60a5fa',
    stats: { power: 95, speed: 78, reach: 89 },
    skinHex: '#6c4331',
    trunksHex: '#1d4ed8',
    accentHex: '#e2e8f0',
    wrapHex: '#dc2626',
    arena: { name: 'Brooklyn Steel Dock', skyTop: '#090d16', skyBottom: '#1e3a8a', mat: '#1e293b', accent: '#3b82f6', lighting: 'industrial_flicker' },
    rivalLine: 'Brooklyn steel hits harder than any heavyweight belt.',
    victoryQuote: 'Keep your hands high — the storm never stops.',
  },
  {
    id: 'indonesia-bima',
    rank: 4,
    country: 'Indonesia',
    countryCode: 'IDN',
    populationLabel: '283M',
    name: 'Bima Santoso',
    epithet: 'Volcanic Garuda',
    discipline: 'Pencak Silat Heavy',
    signatureMove: 'Krakatoa Elbow',
    projectileName: 'Magma Crescent',
    projectileColor: '#fb923c',
    stats: { power: 86, speed: 90, reach: 80 },
    skinHex: '#a47148',
    trunksHex: '#1c1917',
    accentHex: '#f59e0b',
    wrapHex: '#b45309',
    arena: { name: 'Merapi Stone Ring', skyTop: '#18111c', skyBottom: '#7c2d12', mat: '#292524', accent: '#f59e0b', lighting: 'volcanic_ember' },
    rivalLine: 'Speed is the spark; Merapi turns it into an eruption.',
    victoryQuote: 'Swift as wind, heavy as volcanic basalt.',
  },
  {
    id: 'pakistan-tariq',
    rank: 5,
    country: 'Pakistan',
    countryCode: 'PAK',
    populationLabel: '251M',
    name: 'Tariq Khan',
    epithet: 'Sher-e-Punjab',
    discipline: 'Kabaddi & Pehlwani',
    signatureMove: 'Lion Tackle',
    projectileName: 'Lahore Tremor',
    projectileColor: '#34d399',
    stats: { power: 96, speed: 72, reach: 90 },
    skinHex: '#b07d56',
    trunksHex: '#047857',
    accentHex: '#f8fafc',
    wrapHex: '#10b981',
    arena: { name: 'Lahore Fort Arena', skyTop: '#062019', skyBottom: '#065f46', mat: '#1f2937', accent: '#10b981', lighting: 'shifting_sunlight' },
    rivalLine: 'Try to slip a hold once Sher-e-Punjab closes distance.',
    victoryQuote: 'No rope can hold back the roar of Lahore.',
  },
  {
    id: 'nigeria-chukwuemeka',
    rank: 6,
    country: 'Nigeria',
    countryCode: 'NGA',
    populationLabel: '233M',
    name: 'Chukwuemeka Okafor',
    epithet: 'Lagos Thunder',
    discipline: 'Dambe Heavy Fist',
    signatureMove: 'Thunder Spear Fist',
    projectileName: 'Thunder Spear',
    projectileColor: '#facc15',
    stats: { power: 97, speed: 77, reach: 87 },
    skinHex: '#4f3122',
    trunksHex: '#15803d',
    accentHex: '#facc15',
    wrapHex: '#facc15',
    arena: { name: 'Eko Waterfront Ring', skyTop: '#081c15', skyBottom: '#1b4332', mat: '#262626', accent: '#22c55e', lighting: 'industrial_flicker' },
    rivalLine: 'One Dambe wrapped fist drops giants before they blink.',
    victoryQuote: 'Lagos thunder answers every challenge with knockout power.',
  },
  {
    id: 'brazil-rafael',
    rank: 7,
    country: 'Brazil',
    countryCode: 'BRA',
    populationLabel: '212M',
    name: 'Rafael Silva',
    epithet: 'Rio Colosso',
    discipline: 'Luta Livre Heavy',
    signatureMove: 'Martelo Crusher',
    projectileName: 'Copacabana Arc',
    projectileColor: '#38bdf8',
    stats: { power: 88, speed: 89, reach: 84 },
    skinHex: '#8d5b3c',
    trunksHex: '#0284c7',
    accentHex: '#facc15',
    wrapHex: '#38bdf8',
    arena: { name: 'Copacabana Night Stage', skyTop: '#081226', skyBottom: '#0369a1', mat: '#1e293b', accent: '#eab308', lighting: 'stadium_sweep' },
    rivalLine: 'Under the Rio floodlights, Luta Livre owns both ground and sky.',
    victoryQuote: 'Rhythm, pressure, and an unstoppable finish.',
  },
  {
    id: 'bangladesh-arif',
    rank: 8,
    country: 'Bangladesh',
    countryCode: 'BGD',
    populationLabel: '174M',
    name: 'Arif Rahman',
    epithet: 'Bengal Titan',
    discipline: 'Boli Khela Wrestling',
    signatureMove: 'Padma Uppercut',
    projectileName: 'Padma Surge',
    projectileColor: '#f43f5e',
    stats: { power: 91, speed: 81, reach: 83 },
    skinHex: '#8f5f40',
    trunksHex: '#065f46',
    accentHex: '#ef4444',
    wrapHex: '#f43f5e',
    arena: { name: 'Chittagong Boli Arena', skyTop: '#0b1915', skyBottom: '#881337', mat: '#3f2e26', accent: '#ef4444', lighting: 'shifting_sunlight' },
    rivalLine: 'Chittagong Boli wrestling forged this frame for five rounds.',
    victoryQuote: 'Steadfast as the Bengal river — unmoved.',
  },
];

function drawFighterPoseRgba(w, h, fighter, action, t) {
  const rgba = Buffer.alloc(w * h * 4);
  const skin = hexToRgb(fighter.skinHex);
  const trunks = hexToRgb(fighter.trunksHex);
  const accent = hexToRgb(fighter.accentHex);
  const wrap = hexToRgb(fighter.wrapHex);
  const hair = [20, 18, 18];

  const cx = w * 0.48;
  const baseY = h * 0.88;
  const bob =
    action === 'idle'
      ? Math.sin(t * Math.PI * 2) * 2
      : action === 'walk'
      ? Math.abs(Math.sin(t * Math.PI * 2)) * -3
      : action === 'run'
      ? Math.abs(Math.sin(t * Math.PI * 4)) * -4
      : -2;

  const stride =
    action === 'idle'
      ? 5
      : action === 'walk'
      ? Math.sin(t * Math.PI * 2) * 10
      : action === 'run'
      ? Math.sin(t * Math.PI * 4) * 14
      : 11;

  const lean = action === 'run' ? 6 : action === 'attack' ? 9 : 1;
  const torsoY = baseY - 26 + bob;

  // Back leg & Front leg
  fillCapsule(rgba, w, h, cx - 5, torsoY + 6, cx - 7 - stride, baseY, 4.5, skin);
  fillCapsule(rgba, w, h, cx + 5, torsoY + 6, cx + 8 + stride, baseY, 4.8, skin);
  // Trunks & Belt
  fillCapsule(rgba, w, h, cx - 7, torsoY + 3, cx + 7, torsoY + 3, 6.2, trunks);
  fillCapsule(rgba, w, h, cx - 8, torsoY - 1, cx + 8, torsoY - 1, 2.2, accent);
  // Muscular Broad Torso
  fillCapsule(rgba, w, h, cx + lean * 0.4, torsoY - 13, cx, torsoY + 2, 10.5, skin);
  // Head + Hair
  fillCircle(rgba, w, h, cx + lean * 0.65, torsoY - 25, 6.5, skin);
  fillCircle(rgba, w, h, cx + lean * 0.65 - 1, torsoY - 28, 4.6, hair);

  // Arms
  const punchExt = action === 'attack' ? Math.sin(Math.min(1, t * 1.4) * Math.PI) * 18 : 2;
  fillCapsule(rgba, w, h, cx + 7 + lean * 0.5, torsoY - 13, cx + 14 + punchExt, torsoY - 11, 3.8, skin);
  fillCircle(rgba, w, h, cx + 15 + punchExt, torsoY - 11, 4.2, wrap);
  fillCapsule(rgba, w, h, cx - 7 + lean * 0.3, torsoY - 13, cx - 2, torsoY - 8, 3.6, skin);
  fillCircle(rgba, w, h, cx - 1, torsoY - 7, 3.8, wrap);

  return rgba;
}

function buildSpritesheetPng(fighter) {
  const frameW = 72;
  const frameH = 96;
  const cols = 12; // 12 frames per row
  const actions = ['idle', 'walk', 'run', 'attack'];
  const sheetW = frameW * cols;
  const sheetH = frameH * actions.length;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);

  const keyFrames = {};
  actions.forEach((act, row) => {
    for (let col = 0; col < cols; col++) {
      const frameRgba = drawFighterPoseRgba(frameW, frameH, fighter, act, col / cols);
      if (col === 0) {
        keyFrames[act] = encodePngRgba(frameW, frameH, frameRgba);
      }
      for (let y = 0; y < frameH; y++) {
        const srcOff = y * frameW * 4;
        const dstOff = ((row * frameH + y) * sheetW + col * frameW) * 4;
        frameRgba.copy(sheet, dstOff, srcOff, srcOff + frameW * 4);
      }
    }
  });

  return {
    sheetPng: encodePngRgba(sheetW, sheetH, sheet),
    keyFrames,
    sheetW,
    sheetH,
    frameW,
    frameH,
    cols,
    rows: actions.length,
  };
}

// 1. Write PNG Icons
const icon32 = renderIconPng(32, false);
const icon192 = renderIconPng(192, false);
const icon512 = renderIconPng(512, false);
const iconMaskable = renderIconPng(512, true);

fs.writeFileSync(path.join(ICONS_DIR, 'icon-32.png'), icon32);
fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), icon512);
fs.writeFileSync(path.join(ICONS_DIR, 'icon-maskable-512.png'), iconMaskable);

// 2. Write Fighter PNG Spritesheets + Animation Frame PNGs
const spritesManifest = {
  format: 'image/png',
  stillsPerFighter: 480,
  animations: { idle: 120, walk: 120, run: 120, attack: 120 },
  fighters: {},
};

for (const fighter of FIGHTERS) {
  const fDir = path.join(SPRITES_DIR, fighter.id);
  fs.mkdirSync(fDir, { recursive: true });
  const baked = buildSpritesheetPng(fighter);
  fs.writeFileSync(path.join(fDir, 'spritesheet.png'), baked.sheetPng);
  fs.writeFileSync(path.join(fDir, 'idle_00.png'), baked.keyFrames.idle);
  fs.writeFileSync(path.join(fDir, 'walk_00.png'), baked.keyFrames.walk);
  fs.writeFileSync(path.join(fDir, 'run_00.png'), baked.keyFrames.run);
  fs.writeFileSync(path.join(fDir, 'attack_00.png'), baked.keyFrames.attack);

  spritesManifest.fighters[fighter.id] = {
    spritesheet: `src/sprites/${fighter.id}/spritesheet.png`,
    sheetWidth: baked.sheetW,
    sheetHeight: baked.sheetH,
    frameWidth: baked.frameW,
    frameHeight: baked.frameH,
    rows: ['idle', 'walk', 'run', 'attack'],
    keyframePngs: {
      idle: `src/sprites/${fighter.id}/idle_00.png`,
      walk: `src/sprites/${fighter.id}/walk_00.png`,
      run: `src/sprites/${fighter.id}/run_00.png`,
      attack: `src/sprites/${fighter.id}/attack_00.png`,
    },
  };
}

fs.writeFileSync(
  path.join(SPRITES_DIR, 'sprites-manifest.json'),
  JSON.stringify(spritesManifest, null, 2)
);

// 3. Companion Standalone Files (styles, metadata.json, manifest.webmanifest, sw.js)
const STANDALONE_CSS = `/* Iron Titan 8 — TCL Ion V 360x720 Portrait CSS3 Stylesheet (Android 13 Chrome Touch-Only) */
:root {
  --bg-deep: #07090d;
  --bg-shell: #0b0e14;
  --bg-panel: #111724;
  --border-subtle: #252e42;
  --text-main: #f4f6fa;
  --text-muted: #94a3b8;
  --accent-gold: #f59e0b;
  --accent-crimson: #ef4444;
  --accent-sky: #38bdf8;
  --accent-emerald: #10b981;
  --font-display: 'Barlow Condensed', 'Roboto Condensed', Arial, sans-serif;
  --font-sans: 'Roboto', system-ui, -apple-system, sans-serif;
  --font-mono: 'Roboto Mono', ui-monospace, monospace;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: manipulation;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-deep);
  color: var(--text-main);
  font-family: var(--font-sans);
  overflow: hidden;
  overscroll-behavior: none;
}

body {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tcl-shell {
  width: 360px;
  height: 720px;
  max-width: 100vw;
  max-height: 100dvh;
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #101520 0%, #0b0e14 60%, #080a0f 100%);
  border: 2px solid #1e293b;
  border-radius: 22px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
}

@media (max-width: 420px) and (max-height: 820px) {
  .tcl-shell {
    width: 100vw;
    height: 100dvh;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
}

.screen {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.hidden { display: none !important; }

/* Select Screen */
.select-screen {
  padding: 10px 12px;
  justify-content: space-between;
  gap: 6px;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.brand-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  margin: 0;
}

.brand-sub {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.icon-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  min-width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
}

.icon-btn.accent {
  background: var(--accent-gold);
  color: #090d14;
  border-color: #fbbf24;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 4px;
}

.mode-btn {
  min-height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.mode-btn.active {
  background: var(--accent-gold);
  color: #0b0e14;
}

.slot-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 4px;
}

.slot-btn {
  min-height: 42px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
  text-align: left;
  padding: 4px 8px;
}

.slot-btn.active-p1 { background: var(--accent-gold); color: #0b0e14; }
.slot-btn.active-p2 { background: var(--accent-crimson); color: #ffffff; }

.slot-tag { font-size: 9px; font-weight: 700; opacity: 0.85; }
.slot-name { font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.spotlight-card {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #1e293b;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.85);
  padding: 8px;
}

.spotlight-portrait {
  width: 68px;
  height: 68px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #070a10;
  flex-shrink: 0;
  object-fit: cover;
}

.spotlight-info { flex: 1; min-width: 0; }
.spotlight-title { font-family: var(--font-display); font-size: 18px; font-weight: 800; line-height: 1.05; }
.spotlight-meta { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.spotlight-xp { font-family: var(--font-mono); font-size: 9px; color: var(--accent-sky); margin-top: 3px; font-weight: 700; }

.stat-bars {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.stat-bar-label {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 9px;
  color: #cbd5e1;
}

.bar-track {
  height: 4px;
  background: #1e293b;
  overflow: hidden;
  margin-top: 2px;
}

.bar-fill { height: 100%; }

.roster-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.fighter-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 82px;
  padding: 5px 4px;
  border-radius: 12px;
  border: 1px solid #1e293b;
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
}

.fighter-card.p1 { border-color: var(--accent-gold); background: rgba(245, 158, 11, 0.16); }
.fighter-card.p2 { border-color: var(--accent-crimson); background: rgba(239, 68, 68, 0.16); }

.fighter-card-top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
}

.fighter-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #070a10;
  border: 1px solid #1e293b;
  margin-top: 2px;
  object-fit: cover;
}

.fighter-cc { font-size: 10px; font-weight: 800; margin-top: 2px; }
.fighter-fn { font-size: 8px; color: var(--text-muted); }

.primary-cta {
  min-height: 48px;
  width: 100%;
  border: none;
  border-radius: 12px;
  background: linear-gradient(90deg, #f59e0b 0%, #f97316 100%);
  color: #0b0e14;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.06em;
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.25);
}

/* Fight Canvas & HUD */
.fight-screen {
  justify-content: flex-end;
}

#combat-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hud-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  padding: 8px 10px 0;
  pointer-events: none;
}

.hud-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.hud-side { flex: 1; min-width: 0; }
.hud-names {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 800;
}

.hp-track {
  height: 12px;
  border: 1px solid #475569;
  background: rgba(7, 10, 16, 0.92);
  margin-top: 2px;
  overflow: hidden;
}

.hp-fill-p1 { height: 100%; background: linear-gradient(90deg, #10b981, #84cc16); transition: width 70ms linear; }
.hp-fill-p2 { height: 100%; margin-left: auto; background: linear-gradient(270deg, #f43f5e, #fb923c); transition: width 70ms linear; }

.posture-track {
  height: 4px;
  background: rgba(7, 10, 16, 0.92);
  margin-top: 2px;
  overflow: hidden;
}
.posture-fill { height: 100%; background: #22d3ee; transition: width 70ms linear; }

.fury-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.fury-track {
  flex: 1;
  height: 6px;
  border: 1px solid #334155;
  background: rgba(7, 10, 16, 0.92);
}
.fury-fill { height: 100%; background: var(--accent-gold); transition: width 70ms linear; }

.rounds-dots { display: flex; gap: 3px; }
.round-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid #64748b;
  background: #0f172a;
}
.round-dot.won { background: var(--accent-gold); border-color: #fde68a; }

.timer-box {
  min-width: 44px;
  padding: 2px 7px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(7, 10, 16, 0.92);
  text-align: center;
}
.timer-box.ot { border-color: #f43f5e; background: rgba(136, 19, 55, 0.85); }
.timer-label { font-size: 9px; font-weight: 800; color: var(--text-muted); }
.timer-val { font-family: var(--font-mono); font-size: 18px; font-weight: 800; line-height: 1.05; }

.hud-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
}

.hud-util-btn {
  pointer-events: auto;
  min-width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(7, 10, 16, 0.85);
  color: #f8fafc;
  font-size: 10px;
  font-weight: 800;
  padding: 0 8px;
}

.hud-combo {
  margin-top: 6px;
  display: inline-block;
  border: 1px solid rgba(251, 191, 36, 0.7);
  border-radius: 8px;
  background: rgba(7, 10, 16, 0.9);
  padding: 5px 9px;
}
.hud-combo-title { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--accent-gold); line-height: 1; }
.hud-combo-sub { font-family: var(--font-mono); font-size: 9px; color: #e2e8f0; margin-top: 2px; }

.hud-banner {
  margin-top: 22px;
  align-self: center;
  text-align: center;
  border: 1px solid rgba(251, 191, 36, 0.6);
  border-radius: 12px;
  background: rgba(7, 10, 16, 0.92);
  padding: 10px 20px;
}
.hud-banner-main { font-family: var(--font-display); font-size: 34px; font-weight: 800; color: var(--accent-gold); line-height: 1; }
.hud-banner-sub { font-size: 11px; font-weight: 700; color: #ffffff; margin-top: 3px; }

.dojo-trial-box {
  pointer-events: auto;
  margin-top: 6px;
  margin-left: auto;
  max-width: 210px;
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 8px;
  background: rgba(7, 10, 16, 0.9);
  padding: 6px 8px;
  font-family: var(--font-mono);
  font-size: 9px;
}

/* CSS3 Hardware Console Chassis & Touch-Only Controls */
.console-chassis {
  position: relative;
  z-index: 25;
  height: 226px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 14px 14px;
  background: linear-gradient(180deg, #1b202c 0%, #11151e 48%, #0a0d13 100%);
  border-top: 2px solid #2e3648;
  box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.08), inset 0 -8px 18px rgba(0, 0, 0, 0.75);
  touch-action: none;
}

.console-status {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
}

.console-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dpad-well {
  position: relative;
  width: 152px;
  height: 152px;
  border-radius: 50%;
  border: 2px solid #334155;
  background: radial-gradient(circle at 50% 45%, #0e121a 0%, #171c28 64%, #262e40 100%);
  box-shadow: inset 0 6px 14px rgba(0, 0, 0, 0.85), 0 2px 6px rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.dpad-arm {
  position: absolute;
  width: 38px;
  height: 38px;
  background: linear-gradient(180deg, #2b3242 0%, #1b202b 100%);
  border: 1px solid #3c465c;
  pointer-events: none;
}
.dpad-arm.active {
  background: linear-gradient(180deg, #f59e0b 0%, #b45309 100%);
  border-color: #fcd34d;
}
.dpad-up { top: 10px; border-radius: 8px 8px 0 0; }
.dpad-down { bottom: 10px; border-radius: 0 0 8px 8px; }
.dpad-left { left: 10px; border-radius: 8px 0 0 8px; }
.dpad-right { right: 10px; border-radius: 0 8px 8px 0; }

.joystick-nub {
  position: relative;
  z-index: 5;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid #596580;
  background: radial-gradient(circle at 35% 30%, #4b556b 0%, #232938 55%, #12161f 100%);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.85);
  pointer-events: none;
  will-change: transform;
}

.ab-cluster {
  display: flex;
  align-items: center;
  gap: 14px;
}

.arcade-btn {
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  touch-action: none;
  transition: transform 60ms ease, box-shadow 60ms ease;
}

.arcade-btn-a {
  width: 72px;
  height: 72px;
  margin-top: -26px;
  background: radial-gradient(circle at 35% 28%, #f87171 0%, #dc2626 52%, #7f1d1d 100%);
  border: 2px solid #fca5a5;
  box-shadow: 0 6px 0 #5c1111, 0 10px 16px rgba(0, 0, 0, 0.75);
  color: #ffffff;
}
.arcade-btn-a.pressed {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #5c1111, 0 0 14px rgba(239, 68, 68, 0.65);
}

.arcade-btn-b {
  width: 68px;
  height: 68px;
  margin-top: 28px;
  background: radial-gradient(circle at 35% 28%, #fbbf24 0%, #d97706 54%, #78350f 100%);
  border: 2px solid #fde68a;
  box-shadow: 0 6px 0 #522308, 0 10px 16px rgba(0, 0, 0, 0.75);
  color: #0b0e14;
}
.arcade-btn-b.pressed {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #522308, 0 0 14px rgba(245, 158, 11, 0.65);
}

.btn-letter { font-family: var(--font-display); font-size: 24px; font-weight: 800; line-height: 1; }
.btn-cap { font-size: 9px; font-weight: 800; }

/* Modals */
.modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}

.modal-card {
  width: 100%;
  max-width: 320px;
  max-height: 90%;
  overflow-y: auto;
  border-radius: 18px;
  border: 1px solid #334155;
  background: #0f172a;
  padding: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
}

.modal-title { font-family: var(--font-display); font-size: 26px; font-weight: 800; margin: 0; }
.modal-btn {
  min-height: 44px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  margin-top: 8px;
}
.modal-btn.gold { background: var(--accent-gold); border-color: #fbbf24; color: #0b0e14; font-family: var(--font-display); font-size: 18px; }
`;

fs.writeFileSync(path.join(STYLES_DIR, 'console.css'), STANDALONE_CSS);

const METADATA_JSON = {
  name: 'Iron Titan 8',
  shortName: 'IronTitan8',
  version: '2.0.0-standalone',
  targetDevice: 'TCL Ion V (Android 13 Chrome Portrait)',
  viewport: { width: 360, height: 720, canvasWidth: 720, canvasHeight: 1440 },
  inputMode: 'touch-only',
  assets: { format: 'image/png', stillsPerFighter: 480, totalStills: 3840 },
  fighters: FIGHTERS,
};

fs.writeFileSync(path.join(STANDALONE_DIR, 'metadata.json'), JSON.stringify(METADATA_JSON, null, 2));

const MANIFEST_JSON = {
  id: './index.html',
  name: 'Iron Titan 8',
  short_name: 'IronTitan8',
  description: 'Touch-only Android 13 portrait fighting game for TCL Ion V with 8 heavyweight champions and 480 PNG stills per fighter.',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: '#0b0e14',
  background_color: '#0b0e14',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

fs.writeFileSync(path.join(STANDALONE_DIR, 'manifest.webmanifest'), JSON.stringify(MANIFEST_JSON, null, 2));

const SW_JS = `const CACHE_NAME = 'iron-titan-8-standalone-v2';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './metadata.json',
  './styles/console.css',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/sprites/sprites-manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`;

fs.writeFileSync(path.join(STANDALONE_DIR, 'sw.js'), SW_JS);

// --- Build Inline ES Module Plugins (ImportMap Data URLs) ---
const b64Icon32 = icon32.toString('base64');
const b64Icon192 = icon192.toString('base64');
const b64Icon512 = icon512.toString('base64');
const b64IconMask = iconMaskable.toString('base64');

const INLINE_MANIFEST_WITH_B64 = {
  ...MANIFEST_JSON,
  icons: [
    { src: `data:image/png;base64,${b64Icon192}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `data:image/png;base64,${b64Icon512}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `data:image/png;base64,${b64IconMask}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

function toModuleDataUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
}

const pluginMetadata = `
export function loadInlineMetadata() {
  const el = document.getElementById('app-metadata');
  return JSON.parse(el.textContent);
}
export function loadInlineManifest() {
  const el = document.getElementById('pwa-manifest-json');
  return JSON.parse(el.textContent);
}
export function registerInlinePwa() {
  const manifestData = loadInlineManifest();
  const mBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/manifest+json' });
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = URL.createObjectURL(mBlob);
  document.head.appendChild(link);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      const swCode = "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());";
      const swBlob = new Blob([swCode], { type: 'application/javascript' });
      navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(() => {});
    });
  }
}
`;

const pluginHaptics = `
const PATTERNS = {
  light: 18,
  heavy: [45, 20, 35],
  special: [70, 25, 55, 25, 90],
  damage: [35, 25, 35],
  parry: [25, 15, 48],
  throw_tech: [28, 16, 40],
  guard_break: [95, 25, 75, 25, 95],
  rope_bounce: [32, 16, 26],
  ko: [110, 40, 80, 40, 140]
};
export function triggerHaptic(kind, intensity = 'full') {
  if (intensity === 'off' || typeof navigator.vibrate !== 'function') return;
  const p = PATTERNS[kind] || 16;
  const s = intensity === 'light' ? 0.5 : 1;
  const scaled = Array.isArray(p) ? p.map(ms => Math.max(6, Math.round(ms * s))) : Math.max(6, Math.round(p * s));
  try { navigator.vibrate(scaled); } catch {}
}
`;

const pluginAudio = `
class SoundPlugin {
  constructor() { this.ctx = null; this.muted = false; this.sfxVol = 0.9; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  setMuted(m) { this.muted = m; return this.muted; }
  setVolume(v) { this.sfxVol = v; }
  tone(freq, endFreq, dur, type = 'triangle', gainPeak = 0.22) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + dur);
    g.gain.setValueAtTime(gainPeak * this.sfxVol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }
  uiTap() { this.tone(520, 320, 0.05, 'sine', 0.14); }
  jab() { this.tone(240, 85, 0.08, 'triangle', 0.24); }
  heavy() { this.tone(160, 48, 0.16, 'sawtooth', 0.3); }
  parry() { this.tone(1040, 620, 0.12, 'sine', 0.25); }
  clinch() { this.tone(140, 92, 0.1, 'triangle', 0.22); }
  slam() { this.tone(110, 36, 0.24, 'sawtooth', 0.34); }
  springboard() { this.tone(280, 640, 0.14, 'sine', 0.22); }
  ko() { this.tone(190, 40, 0.38, 'sawtooth', 0.36); }
  victory() { this.tone(440, 660, 0.2, 'triangle', 0.22); }
}
export const soundPlugin = new SoundPlugin();
`;

const pluginStorage = `
const KEY = 'iron-titan-8-standalone-career-v1';
const SETTINGS_KEY = 'iron-titan-8-standalone-settings-v1';
export function getMasteryTier(xp) {
  if (xp >= 900) return { level: 5, title: 'LEGEND', ratio: 1 };
  if (xp >= 500) return { level: 4, title: 'CHAMPION', ratio: (xp - 500) / 400 };
  if (xp >= 250) return { level: 3, title: 'ENFORCER', ratio: (xp - 250) / 250 };
  if (xp >= 100) return { level: 2, title: 'CONTENDER', ratio: (xp - 100) / 150 };
  return { level: 1, title: 'ROOKIE', ratio: xp / 100 };
}
export function loadCareer() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { wins: 0, cupWins: 0, bestSurvival: 0, mastery: {}, completedTrials: [] };
}
export function saveCareer(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {}
  return c;
}
export function loadControls() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { haptic: 'full', runThreshold: 0.72, scale: 1.0, gap: 6, opacity: 1.0, swap: false, sfx: 0.9 };
}
export function saveControls(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  return s;
}
`;

const pluginSprites = `
const STILLS_PER_ACTION = 120;
const ACTIONS = ['idle', 'walk', 'run', 'attack'];
const COLS = 12;
const FW = 96;
const FH = 128;

function drawFighterFrame(ctx, ox, oy, fighter, action, t) {
  const cx = ox + FW * 0.48;
  const baseY = oy + FH * 0.88;
  const bob = action === 'idle' ? Math.sin(t * Math.PI * 2) * 3
    : action === 'walk' ? Math.abs(Math.sin(t * Math.PI * 2)) * -4
    : action === 'run' ? Math.abs(Math.sin(t * Math.PI * 4)) * -6 : -3;
  const stride = action === 'idle' ? 7
    : action === 'walk' ? Math.sin(t * Math.PI * 2) * 14
    : action === 'run' ? Math.sin(t * Math.PI * 4) * 19 : 15;
  const lean = action === 'run' ? 9 : action === 'attack' ? 13 : 2;
  const ty = baseY - 38 + bob;

  ctx.save();
  ctx.lineCap = 'round';
  // Back Leg
  ctx.strokeStyle = fighter.skinHex;
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(cx - 7, ty + 8); ctx.lineTo(cx - 9 - stride, baseY); ctx.stroke();
  // Front Leg
  ctx.beginPath(); ctx.moveTo(cx + 7, ty + 8); ctx.lineTo(cx + 10 + stride, baseY); ctx.stroke();
  // Trunks
  ctx.fillStyle = fighter.trunksHex;
  ctx.fillRect(cx - 14, ty - 2, 28, 16);
  ctx.fillStyle = fighter.accentHex;
  ctx.fillRect(cx - 15, ty - 4, 30, 5);
  // Muscular Torso
  ctx.fillStyle = fighter.skinHex;
  ctx.beginPath();
  ctx.moveTo(cx - 17 + lean * 0.4, ty - 24);
  ctx.lineTo(cx + 18 + lean * 0.4, ty - 24);
  ctx.lineTo(cx + 12, ty);
  ctx.lineTo(cx - 12, ty);
  ctx.closePath();
  ctx.fill();
  // Head
  ctx.beginPath(); ctx.arc(cx + lean * 0.65, ty - 35, 9.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#151515';
  ctx.beginPath(); ctx.arc(cx + lean * 0.65 - 1, ty - 39, 7.5, Math.PI, 0); ctx.fill();
  // Arms + Wraps
  const punch = action === 'attack' ? Math.sin(Math.min(1, t * 1.35) * Math.PI) * 26 : 3;
  ctx.strokeStyle = fighter.skinHex;
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(cx + 10 + lean * 0.4, ty - 20); ctx.lineTo(cx + 21 + punch, ty - 16); ctx.stroke();
  ctx.fillStyle = fighter.wrapHex;
  ctx.beginPath(); ctx.arc(cx + 23 + punch, ty - 16, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export async function bakeFighterSpritePng(fighter) {
  const c = document.createElement('canvas');
  c.width = FW * COLS;
  c.height = FH * ACTIONS.length;
  const ctx = c.getContext('2d');
  ACTIONS.forEach((act, row) => {
    for (let col = 0; col < COLS; col++) {
      drawFighterFrame(ctx, col * FW, row * FH, fighter, act, col / COLS);
    }
  });
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise(res => { img.onload = res; img.src = url; });
  return { img, url, fw: FW, fh: FH, cols: COLS, totalStills: STILLS_PER_ACTION * ACTIONS.length };
}

export function bakePortraitPngDataUrl(fighter) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, fighter.arena.skyTop);
  g.addColorStop(1, fighter.arena.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  drawFighterFrame(ctx, 0, -10, fighter, 'idle', 0);
  return c.toDataURL('image/png');
}
`;

const pluginTournament = `
export function createCup(playerId, fighters) {
  const others = fighters.filter(f => f.id !== playerId).map(f => f.id);
  return {
    playerId,
    stage: 'QF',
    championId: null,
    qf: [
      { a: playerId, b: others[0], w: null },
      { a: others[1], b: others[2], w: null },
      { a: others[3], b: others[4], w: null },
      { a: others[5], b: others[6], w: null }
    ],
    sf: [{ a: null, b: null, w: null }, { a: null, b: null, w: null }],
    final: { a: null, b: null, w: null }
  };
}
function sim(a, b, fighters) {
  const fa = fighters.find(f => f.id === a);
  const fb = fighters.find(f => f.id === b);
  return (fa.stats.power + Math.random() * 20) >= (fb.stats.power + Math.random() * 20) ? a : b;
}
export function advanceCup(cup, playerWon, fighters) {
  if (cup.stage === 'QF') {
    cup.qf[0].w = playerWon ? cup.playerId : cup.qf[0].b;
    cup.qf[1].w = sim(cup.qf[1].a, cup.qf[1].b, fighters);
    cup.qf[2].w = sim(cup.qf[2].a, cup.qf[2].b, fighters);
    cup.qf[3].w = sim(cup.qf[3].a, cup.qf[3].b, fighters);
    cup.sf[0].a = cup.qf[0].w; cup.sf[0].b = cup.qf[1].w;
    cup.sf[1].a = cup.qf[2].w; cup.sf[1].b = cup.qf[3].w;
    if (!playerWon) {
      cup.sf[0].w = sim(cup.sf[0].a, cup.sf[0].b, fighters);
      cup.sf[1].w = sim(cup.sf[1].a, cup.sf[1].b, fighters);
      cup.final.a = cup.sf[0].w; cup.final.b = cup.sf[1].w;
      cup.final.w = sim(cup.final.a, cup.final.b, fighters);
      cup.championId = cup.final.w; cup.stage = 'DONE';
    } else cup.stage = 'SF';
  } else if (cup.stage === 'SF') {
    cup.sf[0].w = playerWon ? cup.playerId : cup.sf[0].b;
    cup.sf[1].w = sim(cup.sf[1].a, cup.sf[1].b, fighters);
    cup.final.a = cup.sf[0].w; cup.final.b = cup.sf[1].w;
    if (!playerWon) {
      cup.final.w = sim(cup.final.a, cup.final.b, fighters);
      cup.championId = cup.final.w; cup.stage = 'DONE';
    } else cup.stage = 'FINAL';
  } else if (cup.stage === 'FINAL') {
    cup.final.w = playerWon ? cup.playerId : cup.final.b;
    cup.championId = cup.final.w; cup.stage = 'DONE';
  }
  return cup;
}
`;

const pluginController = `
import { soundPlugin } from '@iron-titan/audio';
import { triggerHaptic } from '@iron-titan/haptics';

export function mountTouchController(elements, inputState, getSettings) {
  const { padEl, nubEl, armUp, armDown, armLeft, armRight, btnA, btnB, statusEl, hintEl, chassisEl, mainEl } = elements;
  let stickId = null, aId = null, bId = null;
  let aDownAt = 0, bDownAt = 0;

  function applyErgonomics() {
    const s = getSettings();
    chassisEl.style.opacity = String(s.opacity);
    mainEl.style.paddingLeft = s.gap + 'px';
    mainEl.style.paddingRight = s.gap + 'px';
    padEl.style.transform = 'scale(' + s.scale + ')';
    padEl.style.transformOrigin = 'left center';
  }
  applyErgonomics();

  function setStick(cx, cy) {
    const r = padEl.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const maxR = 38;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
    inputState.moveX = dx / maxR;
    inputState.moveY = dy / maxR;
    nubEl.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
    armUp.classList.toggle('active', inputState.moveY < -0.35);
    armDown.classList.toggle('active', inputState.moveY > 0.35);
    armLeft.classList.toggle('active', inputState.moveX < -0.35);
    armRight.classList.toggle('active', inputState.moveX > 0.35);
    const absX = Math.abs(inputState.moveX);
    const thr = getSettings().runThreshold;
    statusEl.textContent = absX > thr ? 'PAD · RUN' : absX > 0.16 ? 'PAD · WALK' : 'PAD · IDLE';
  }

  function resetStick() {
    stickId = null;
    inputState.moveX = 0; inputState.moveY = 0;
    nubEl.style.transform = 'translate3d(0,0,0)';
    armUp.classList.remove('active'); armDown.classList.remove('active');
    armLeft.classList.remove('active'); armRight.classList.remove('active');
    statusEl.textContent = 'PAD · IDLE';
  }

  padEl.addEventListener('touchstart', (e) => {
    e.preventDefault(); soundPlugin.unlock();
    const t = e.changedTouches[0];
    if (t) { stickId = t.identifier; setStick(t.clientX, t.clientY); }
  }, { passive: false });

  padEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { setStick(t.clientX, t.clientY); break; }
    }
  }, { passive: false });

  const endPad = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { resetStick(); break; }
    }
  };
  padEl.addEventListener('touchend', endPad, { passive: false });
  padEl.addEventListener('touchcancel', endPad, { passive: false });

  btnA.addEventListener('touchstart', (e) => {
    e.preventDefault(); soundPlugin.unlock();
    const t = e.changedTouches[0]; if (!t) return;
    aId = t.identifier; aDownAt = performance.now();
    inputState.strikeDown = true;
    btnA.classList.add('pressed');
    if (inputState.powerDown && aDownAt - bDownAt <= 140) {
      inputState.grappleCount++;
    } else {
      inputState.strikeCount++;
    }
    triggerHaptic('light', getSettings().haptic);
  }, { passive: false });

  const endA = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === aId) { aId = null; inputState.strikeDown = false; btnA.classList.remove('pressed'); break; }
    }
  };
  btnA.addEventListener('touchend', endA, { passive: false });
  btnA.addEventListener('touchcancel', endA, { passive: false });

  btnB.addEventListener('touchstart', (e) => {
    e.preventDefault(); soundPlugin.unlock();
    const t = e.changedTouches[0]; if (!t) return;
    bId = t.identifier; bDownAt = performance.now();
    inputState.powerDown = true;
    btnB.classList.add('pressed');
    if (inputState.strikeDown && bDownAt - aDownAt <= 140) {
      inputState.grappleCount++;
    } else {
      inputState.powerCount++;
    }
    triggerHaptic('light', getSettings().haptic);
  }, { passive: false });

  const endB = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === bId) { bId = null; inputState.powerDown = false; btnB.classList.remove('pressed'); break; }
    }
  };
  btnB.addEventListener('touchend', endB, { passive: false });
  btnB.addEventListener('touchcancel', endB, { passive: false });

  return { applyErgonomics, hintEl };
}
`;

const pluginEngine = `
import { soundPlugin } from '@iron-titan/audio';
import { triggerHaptic } from '@iron-titan/haptics';

const W = 720, H = 1440, GROUND = 795, LEFT = 86, RIGHT = 634;

export class StandaloneCombatEngine {
  constructor(canvas, f1, s1, f2, s2, inputState, mode, callbacks) {
    this.ctx = canvas.getContext('2d');
    this.f1 = f1; this.s1 = s1;
    this.f2 = f2; this.s2 = s2;
    this.input = inputState;
    this.mode = mode;
    this.cb = callbacks;
    this.raf = 0; this.last = 0; this.paused = false;
    this.round = 1; this.p1Rounds = 0; this.p2Rounds = 0;
    this.timer = 60; this.isOt = false;
    this.phase = 'intro'; this.phaseTimer = 1.3;
    this.zoom = 1; this.critTimer = 0; this.shake = 0; this.hitStop = 0;
    this.sparks = []; this.dust = []; this.ghosts = []; this.projectiles = [];
    this.prevCounts = { s: inputState.strikeCount, p: inputState.powerCount, g: inputState.grappleCount };
    this.trialStep = 0;
    this.p1 = this.makeActor(215, 1, f1, s1);
    this.p2 = this.makeActor(505, -1, f2, s2);
    this.banner = 'ROUND 1'; this.subBanner = f1.rivalLine;
  }

  makeActor(x, facing, prof, sheet) {
    return {
      x, y: 0, vx: 0, vy: 0, facing, prof, sheet,
      hp: 100, fury: 0, posture: 100,
      state: 'idle', timer: 0, hitDone: false,
      combo: 0, maxCombo: 0, comboDmg: 0, comboDecay: 0,
      flash: 0, clinchHold: 0, techWin: 0, aiT: 0.25
    };
  }

  start() {
    this.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.update(dt);
      this.render(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  destroy() { cancelAnimationFrame(this.raf); }

  spawnDust(x, count = 6) {
    for (let i = 0; i < count; i++) {
      this.dust.push({ x: x + (Math.random() - 0.5) * 32, y: GROUND, vx: (Math.random() - 0.5) * 140, vy: -30 - Math.random() * 60, r: 8, life: 0.4 });
    }
  }

  spawnSparks(x, y, col, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 280;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col, life: 0.35 });
    }
  }

  update(dt) {
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.critTimer > 0) this.critTimer -= dt;
    this.shake = Math.max(0, this.shake - dt * 45);

    if (this.phase === 'intro') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        this.banner = this.isOt ? 'OVERTIME!' : 'FIGHT!';
        this.subBanner = this.isOt ? 'SUDDEN DEATH · 25 HP · MAX FURY' : '';
        setTimeout(() => { if (this.phase === 'fight') { this.banner = null; this.subBanner = null; } }, 750);
      }
      this.emitHud(); return;
    }

    if (this.phase === 'fight') {
      if (this.mode !== 'dojo') {
        this.timer = Math.max(0, this.timer - dt);
        if (this.timer <= 0) {
          this.finishRound(this.p1.hp > this.p2.hp ? 'p1' : this.p2.hp > this.p1.hp ? 'p2' : 'draw');
          return;
        }
      } else {
        if (this.p2.hp < 100 && this.p2.state === 'idle') this.p2.hp = Math.min(100, this.p2.hp + dt * 28);
      }

      this.handleP1Input(dt);
      this.handleAi(dt);
      this.stepActor(this.p1, this.p2, dt, 'p1');
      this.stepActor(this.p2, this.p1, dt, 'p2');
      this.resolveOverlap();
      this.updateProjectiles(dt);
      this.checkHits(this.p1, this.p2, 'p1');
      this.checkHits(this.p2, this.p1, 'p2');

      if (this.mode !== 'dojo' && (this.p1.hp <= 0 || this.p2.hp <= 0)) {
        const w = this.p1.hp <= 0 && this.p2.hp <= 0 ? 'draw' : this.p2.hp <= 0 ? 'p1' : 'p2';
        this.finishRound(w);
      }
    } else if (this.phase === 'round_end') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.resetNextRound();
    }

    this.dust = this.dust.filter(d => { d.x += d.vx * dt; d.y += d.vy * dt; d.r += dt * 36; d.life -= dt; return d.life > 0; });
    this.sparks = this.sparks.filter(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 650 * dt; s.life -= dt; return s.life > 0; });
    this.ghosts = this.ghosts.filter(g => { g.a -= dt * 3.2; return g.a > 0; });
    this.emitHud();
  }

  handleP1Input(dt) {
    const a = this.p1, foe = this.p2, inp = this.input;
    const sTap = inp.strikeCount !== this.prevCounts.s;
    const pTap = inp.powerCount !== this.prevCounts.p;
    const gTap = inp.grappleCount !== this.prevCounts.g;
    this.prevCounts = { s: inp.strikeCount, p: inp.powerCount, g: inp.grappleCount };

    if (a.techWin > 0 && (sTap || pTap || gTap)) {
      a.techWin = 0; foe.clinchHold = 0;
      a.state = 'idle'; foe.state = 'idle';
      a.vx = -a.facing * 240; foe.vx = -foe.facing * 240;
      soundPlugin.parry(); triggerHaptic('throw_tech', this.cb.getHaptic());
      this.banner = 'THROW TECH!'; setTimeout(() => { if (this.phase === 'fight') this.banner = null; }, 600);
      return;
    }

    if (a.state === 'hit' || a.state === 'ko' || a.state === 'clinch') return;
    const neutral = a.state === 'idle' || a.state === 'walk' || a.state === 'run' || a.state === 'guard';
    const dist = Math.abs(foe.x - a.x);

    if (gTap && neutral && a.y >= 0 && dist <= 136) {
      a.state = 'clinch'; a.timer = 0; a.clinchHold = 0.24; a.hitDone = true;
      foe.state = 'hit'; foe.techWin = 0.24; foe.x = a.x + a.facing * 72;
      soundPlugin.clinch(); this.critTimer = 0.45;
      return;
    }

    const nearLeft = a.x <= LEFT + 44 && inp.moveX > 0.25;
    const nearRight = a.x >= RIGHT - 44 && inp.moveX < -0.25;
    if (neutral && (sTap || pTap) && (nearLeft || nearRight)) {
      a.facing = nearLeft ? 1 : -1;
      a.state = 'springboard'; a.timer = 0; a.hitDone = false;
      a.vy = -580; a.vx = a.facing * 500;
      this.spawnDust(nearLeft ? LEFT : RIGHT, 9);
      soundPlugin.springboard(); triggerHaptic('rope_bounce', this.cb.getHaptic());
      return;
    }

    if (neutral && a.y >= 0) {
      if (sTap) {
        a.state = inp.moveY > 0.45 ? 'launcher' : 'jab';
        a.timer = 0; a.hitDone = false; soundPlugin.jab();
        this.advanceTrial(a.state);
        return;
      }
      if (pTap) {
        if (inp.moveY > 0.35 && a.fury >= 30) {
          a.fury -= 30;
          this.projectiles.push({ x: a.x + a.facing * 50, y: GROUND - 140, vx: a.facing * 520, owner: 'p1', col: a.prof.projectileColor, dmg: 14, life: 1.4 });
          a.state = 'cross'; a.timer = 0; a.hitDone = true; soundPlugin.heavy();
          this.advanceTrial('projectile');
          return;
        }
        a.state = a.fury >= 50 ? 'special' : 'cross';
        if (a.state === 'special') a.fury -= 50;
        a.timer = 0; a.hitDone = false; soundPlugin.heavy();
        this.advanceTrial(a.state);
        return;
      }
    }

    if (a.y < -15 && (sTap || pTap) && a.state === 'jump') {
      a.state = 'air_kick'; a.timer = 0; a.hitDone = false; soundPlugin.jab();
      this.advanceTrial('air_kick');
      return;
    }

    if (neutral && a.y >= 0) {
      if (inp.powerDown && Math.abs(inp.moveX) < 0.25) { a.state = 'guard'; a.vx = 0; return; }
      if (inp.moveY < -0.55) { a.vy = -660; a.vx = inp.moveX * 320; a.state = 'jump'; a.timer = 0; this.spawnDust(a.x, 5); return; }
      const absX = Math.abs(inp.moveX);
      if (absX > 0.16) {
        const isRun = absX > this.cb.getRunThreshold();
        a.state = isRun ? 'run' : 'walk';
        a.vx = Math.sign(inp.moveX) * (isRun ? 390 : 210);
        a.facing = Math.sign(inp.moveX);
      } else { a.state = 'idle'; a.vx = 0; }
    }
  }

  advanceTrial(move) {
    if (this.mode !== 'dojo') return;
    const seq = ['jab', 'cross', 'launcher'];
    if (seq[this.trialStep] === move) {
      this.trialStep++;
      if (this.trialStep >= seq.length) {
        this.trialStep = 0;
        this.cb.onTrialCleared(this.f1.id);
      }
    } else if (move === seq[0]) this.trialStep = 1;
  }

  handleAi(dt) {
    const ai = this.p2, pl = this.p1;
    if (this.mode === 'dojo' || ai.state === 'hit' || ai.state === 'ko' || ai.state === 'clinch') return;
    ai.aiT -= dt;
    if (ai.aiT > 0) return;
    ai.aiT = 0.22 + Math.random() * 0.2;
    const dist = Math.abs(pl.x - ai.x);
    ai.facing = pl.x >= ai.x ? 1 : -1;
    if (dist > 145) { ai.state = 'run'; ai.vx = ai.facing * 290; }
    else if (Math.random() < 0.45) { ai.state = Math.random() < 0.6 ? 'jab' : 'cross'; ai.timer = 0; ai.hitDone = false; ai.vx = 0; }
    else if (Math.random() < 0.3) { ai.state = 'guard'; ai.vx = 0; }
    else { ai.state = 'idle'; ai.vx = 0; }
  }

  stepActor(a, foe, dt, slot) {
    a.timer += dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.techWin > 0) a.techWin -= dt;
    if (a.comboDecay > 0) { a.comboDecay -= dt; if (a.comboDecay <= 0) { a.combo = 0; a.comboDmg = 0; } }

    if (a.state === 'clinch') {
      if (a.clinchHold > 0) { a.clinchHold -= dt; if (a.clinchHold <= 0) {
        foe.hp = Math.max(0, foe.hp - 18); foe.vy = -440; foe.vx = a.facing * 360;
        foe.state = 'hit'; foe.timer = 0; foe.flash = 0.14;
        a.combo++; a.maxCombo = Math.max(a.maxCombo, a.combo); a.comboDmg += 18; a.comboDecay = 2.0;
        soundPlugin.slam(); this.shake = 18; this.critTimer = 0.45; this.spawnSparks(foe.x, GROUND - 150, '#fbbf24', 18);
        triggerHaptic('heavy', this.cb.getHaptic());
      }} else if (a.timer >= 0.56) { a.state = 'idle'; }
      return;
    }

    if (a.state === 'run' || a.state === 'special' || a.state === 'springboard') {
      if (Math.random() < 0.45) this.ghosts.push({ x: a.x, y: a.y, f: a.facing, act: a.state === 'run' ? 'run' : 'attack', t: a.timer, sheet: a.sheet, a: 0.45 });
    }

    a.x += a.vx * dt;
    if (a.y < 0 || a.vy < 0) {
      a.vy += 1750 * dt; a.y += a.vy * dt;
      if (a.y >= 0) { a.y = 0; a.vy = 0; a.vx = 0; a.state = 'idle'; this.spawnDust(a.x, 7); }
    }

    if (a.x < LEFT) { a.x = LEFT; a.vx = 0; }
    if (a.x > RIGHT) { a.x = RIGHT; a.vx = 0; }

    if ((a.state === 'jab' && a.timer > 0.27) || (a.state === 'cross' && a.timer > 0.42) || (a.state === 'launcher' && a.timer > 0.44) || (a.state === 'special' && a.timer > 0.56) || (a.state === 'hit' && a.y >= 0 && a.timer > 0.28)) {
      a.state = 'idle'; a.vx = 0;
    }
    if (a.state === 'idle' || a.state === 'walk') a.facing = foe.x >= a.x ? 1 : -1;
    if (a.state === 'guard') a.posture = Math.max(0, a.posture - dt * 10);
    else a.posture = Math.min(100, a.posture + dt * 14);
  }

  resolveOverlap() {
    const dx = this.p2.x - this.p1.x;
    if (Math.abs(dx) < 82 && Math.abs(this.p1.y - this.p2.y) < 90) {
      const push = (82 - Math.abs(dx)) * 0.5;
      const dir = dx >= 0 ? 1 : -1;
      this.p1.x = Math.max(LEFT, this.p1.x - dir * push);
      this.p2.x = Math.min(RIGHT, this.p2.x + dir * push);
    }
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter(p => {
      p.x += p.vx * dt; p.life -= dt;
      const tgt = p.owner === 'p1' ? this.p2 : this.p1;
      const atk = p.owner === 'p1' ? this.p1 : this.p2;
      if (Math.abs(p.x - tgt.x) < 55 && Math.abs(p.y - (GROUND - 140 + tgt.y)) < 90) {
        this.applyHit(atk, tgt, p.dmg, 240, 0, p.owner);
        return false;
      }
      return p.life > 0 && p.x > 0 && p.x < W;
    });
  }

  checkHits(atk, def, slot) {
    if (atk.hitDone || def.state === 'ko') return;
    const isAtk = ['jab', 'cross', 'launcher', 'special', 'air_kick', 'springboard'].includes(atk.state);
    if (!isAtk || atk.timer < 0.06) return;
    const reach = atk.state === 'special' || atk.state === 'springboard' ? 148 : 118;
    const dx = (def.x - atk.x) * atk.facing;
    if (dx >= -20 && dx <= reach && Math.abs(def.y - atk.y) < 120) {
      atk.hitDone = true;
      const dmg = atk.state === 'special' ? 25 : atk.state === 'springboard' ? 20 : atk.state === 'cross' ? 15 : atk.state === 'launcher' ? 13 : 9;
      const vy = atk.state === 'launcher' ? -560 : atk.state === 'special' ? -240 : 0;
      this.applyHit(atk, def, dmg, 220, vy, slot);
    }
  }

  applyHit(atk, def, dmg, kb, vy, slot) {
    const guarding = def.state === 'guard';
    const finalDmg = guarding ? Math.max(2, Math.round(dmg * 0.22)) : dmg;
    def.hp = Math.max(0, def.hp - finalDmg);
    def.vx = atk.facing * kb;
    if (!guarding) {
      if (vy < 0) def.vy = vy;
      def.state = 'hit'; def.timer = 0; def.flash = 0.11;
      atk.combo++; atk.maxCombo = Math.max(atk.maxCombo, atk.combo);
      atk.comboDmg += finalDmg; atk.comboDecay = 1.9;
      atk.fury = Math.min(100, atk.fury + 12);
      def.fury = Math.min(100, def.fury + 8);
      this.hitStop = finalDmg >= 15 ? 0.07 : 0.04;
      this.shake = finalDmg >= 15 ? 14 : 6;
      if (finalDmg >= 18) this.critTimer = 0.38;
      this.spawnSparks(def.x, GROUND - 150 + def.y, '#fbbf24', 14);
      soundPlugin[finalDmg >= 15 ? 'heavy' : 'jab']();
      triggerHaptic(finalDmg >= 15 ? 'heavy' : 'light', this.cb.getHaptic());
    } else {
      def.posture = Math.max(0, def.posture - dmg * 1.4);
      this.spawnSparks(def.x, GROUND - 150, '#38bdf8', 8);
      soundPlugin.parry(); triggerHaptic('parry', this.cb.getHaptic());
    }
  }

  finishRound(winner) {
    this.phase = 'round_end'; this.phaseTimer = 1.8;
    soundPlugin.ko(); triggerHaptic('ko', this.cb.getHaptic());
    if (winner === 'p1') { this.p1Rounds++; this.p2.state = 'ko'; this.banner = 'K.O.!'; }
    else if (winner === 'p2') { this.p2Rounds++; this.p1.state = 'ko'; this.banner = 'K.O.!'; }
    else { this.banner = 'DRAW ROUND'; }

    const needed = this.mode === 'survival' ? 1 : 2;
    const drawAfterMax = winner === 'draw' && (this.round >= 3 || this.mode === 'survival');
    if ((this.p1Rounds === 1 && this.p2Rounds === 1 && winner === 'draw') || drawAfterMax) {
      this.isOt = true; this.subBanner = 'SUDDEN DEATH OVERTIME NEXT!';
      return;
    }

    if (this.p1Rounds >= needed || this.p2Rounds >= needed || this.isOt) {
      const mWin = this.p1Rounds > this.p2Rounds ? 'p1' : 'p2';
      this.phase = 'match_end';
      soundPlugin.victory();
      this.cb.onMatchEnd({ winner: mWin, maxCombo: this.p1.maxCombo, p1Rounds: this.p1Rounds, p2Rounds: this.p2Rounds });
    }
  }

  resetNextRound() {
    this.round++;
    this.phase = 'intro'; this.phaseTimer = 1.2;
    this.timer = this.isOt ? 15 : 60;
    const hp = this.isOt ? 25 : 100, fury = this.isOt ? 100 : 0;
    this.p1 = { ...this.makeActor(215, 1, this.f1, this.s1), hp, fury, maxCombo: this.p1.maxCombo };
    this.p2 = { ...this.makeActor(505, -1, this.f2, this.s2), hp, fury };
    this.banner = this.isOt ? 'OVERTIME' : 'ROUND ' + this.round;
    this.subBanner = this.isOt ? '25 HP · 100% FURY · 15 SECONDS' : 'READY';
  }

  emitHud() {
    this.cb.onHud({
      p1Hp: this.p1.hp, p2Hp: this.p2.hp, p1Fury: this.p1.fury, p2Fury: this.p2.fury,
      p1Posture: this.p1.posture, p2Posture: this.p2.posture,
      p1Rounds: this.p1Rounds, p2Rounds: this.p2Rounds,
      round: this.round, timer: Math.ceil(this.timer), isOt: this.isOt,
      combo: this.p1.combo, comboDmg: this.p1.comboDmg, maxCombo: this.p1.maxCombo,
      banner: this.banner, subBanner: this.subBanner, trialStep: this.trialStep
    });
  }

  render(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    const arena = this.f2.arena;

    // Camera Zoom on Clinch / Critical
    const clinch = this.p1.state === 'clinch' || this.p2.state === 'clinch' || Math.abs(this.p1.x - this.p2.x) < 128;
    const targetZ = this.critTimer > 0 ? 1.2 : clinch ? 1.1 : 1.0;
    this.zoom += (targetZ - this.zoom) * 0.14;

    ctx.save();
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const fx = (this.p1.x + this.p2.x) * 0.5;
    ctx.translate(W * 0.5 + sx, (GROUND - 140) + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-fx, -(GROUND - 140));

    // Sky & Floor
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, arena.skyTop); g.addColorStop(1, arena.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(-120, -100, W + 240, GROUND + 100);
    ctx.fillStyle = arena.mat; ctx.fillRect(-120, GROUND, W + 240, H - GROUND);
    ctx.fillStyle = arena.accent; ctx.fillRect(-120, GROUND, W + 240, 8);

    // Ring Ropes
    ctx.strokeStyle = arena.accent; ctx.lineWidth = 4;
    [GROUND - 75, GROUND - 150, GROUND - 225].forEach(ry => {
      ctx.beginPath(); ctx.moveTo(LEFT - 10, ry); ctx.lineTo(RIGHT + 10, ry); ctx.stroke();
    });

    // Dynamic Arena Lighting Overlay
    const pulse = 0.08 + Math.sin(now * 0.004) * 0.05;
    ctx.fillStyle = arena.lighting === 'industrial_flicker' ? \`rgba(96,165,250,\${pulse})\`
      : arena.lighting === 'volcanic_ember' ? \`rgba(251,146,60,\${pulse + 0.04})\`
      : \`rgba(251,191,36,\${pulse})\`;
    ctx.fillRect(-100, 0, W + 200, GROUND);

    // Mat Dust
    this.dust.forEach(d => {
      ctx.fillStyle = \`rgba(226,232,240,\${d.life * 0.9})\`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    });

    // Afterimages
    this.ghosts.forEach(gh => {
      this.drawSpriteActor(ctx, { ...this.p1, x: gh.x, y: gh.y, facing: gh.f, state: gh.act, timer: gh.t, sheet: gh.sheet, flash: 0 }, gh.a * 0.5);
    });

    // Fighters
    this.drawSpriteActor(ctx, this.p1, 1);
    this.drawSpriteActor(ctx, this.p2, 1);

    // Projectiles & Sparks
    this.projectiles.forEach(p => {
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.fill();
    });
    this.sparks.forEach(s => {
      ctx.fillStyle = s.col; ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    });

    ctx.restore();
  }

  drawSpriteActor(ctx, a, alpha) {
    const row = a.state === 'walk' ? 1 : a.state === 'run' ? 2 : ['jab', 'cross', 'launcher', 'special', 'air_kick', 'springboard', 'clinch'].includes(a.state) ? 3 : 0;
    const col = Math.floor((a.timer * 24)) % a.sheet.cols;
    const dw = 220, dh = 292;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(a.x, GROUND + a.y);
    ctx.scale(a.facing, 1);
    if (a.state === 'ko') ctx.rotate(-1.35);
    ctx.drawImage(a.sheet.img, col * a.sheet.fw, row * a.sheet.fh, a.sheet.fw, a.sheet.fh, -dw / 2, -dh + 12, dw, dh);
    if (a.flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-dw / 2, -dh + 12, dw, dh);
    }
    ctx.restore();
  }
}
`;

const IMPORT_MAP = {
  imports: {
    '@iron-titan/metadata': toModuleDataUrl(pluginMetadata),
    '@iron-titan/haptics': toModuleDataUrl(pluginHaptics),
    '@iron-titan/audio': toModuleDataUrl(pluginAudio),
    '@iron-titan/storage': toModuleDataUrl(pluginStorage),
    '@iron-titan/sprites': toModuleDataUrl(pluginSprites),
    '@iron-titan/tournament': toModuleDataUrl(pluginTournament),
    '@iron-titan/controller': toModuleDataUrl(pluginController),
    '@iron-titan/engine': toModuleDataUrl(pluginEngine),
  },
};

const STANDALONE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>Iron Titan 8 — Standalone Android 13 Portrait PWA</title>
  <meta name="description" content="Touch-only standalone portrait fighting game for TCL Ion V (360x720 viewport, 720x1440 resolution) on Android 13 Chrome." />
  <meta name="theme-color" content="#0b0e14" />
  <meta name="mobile-web-app-capable" content="yes" />
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${b64Icon32}" />
  <link rel="icon" type="image/png" sizes="192x192" href="data:image/png;base64,${b64Icon192}" />

  <!-- Inline JSON Metadata & Manifest -->
  <script id="app-metadata" type="application/json">${JSON.stringify(METADATA_JSON)}</script>
  <script id="pwa-manifest-json" type="application/json">${JSON.stringify(INLINE_MANIFEST_WITH_B64)}</script>

  <!-- Inline ES Module ImportMap Plugins -->
  <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>

  <!-- Inline CSS3 Styles -->
  <style id="iron-titan-styles">${STANDALONE_CSS}</style>
</head>
<body>
  <main class="tcl-shell">
    <!-- SELECT SCREEN -->
    <section id="select-screen" class="screen select-screen">
      <div class="header-bar">
        <div>
          <h1 class="brand-title">IRON TITAN 8</h1>
          <div class="brand-sub">TCL Ion V · Android 13 Touch-Only · 480 PNG Stills</div>
        </div>
        <div class="icon-row">
          <button id="btn-install" class="icon-btn accent hidden" type="button">INSTALL</button>
          <button id="btn-settings" class="icon-btn" type="button">PAD</button>
          <button id="btn-mute" class="icon-btn" type="button">SFX</button>
        </div>
      </div>

      <div id="mode-grid" class="mode-grid">
        <button class="mode-btn active" data-mode="versus" type="button">VERSUS</button>
        <button class="mode-btn" data-mode="arcade" type="button">ARCADE</button>
        <button class="mode-btn" data-mode="cup" type="button">8-CUP</button>
        <button class="mode-btn" data-mode="survival" type="button">GAUNTLET</button>
        <button class="mode-btn" data-mode="dojo" type="button">DOJO</button>
      </div>

      <div class="slot-row">
        <button id="slot-p1" class="slot-btn active-p1" type="button">
          <div class="slot-tag">PLAYER 1</div>
          <div id="slot-p1-name" class="slot-name">IND · Vikram</div>
        </button>
        <button id="slot-p2" class="slot-btn" type="button">
          <div class="slot-tag">OPPONENT</div>
          <div id="slot-p2-name" class="slot-name">CHN · Zhao</div>
        </button>
      </div>

      <div class="spotlight-card">
        <img id="spot-img" class="spotlight-portrait" alt="Fighter portrait" />
        <div class="spotlight-info">
          <div id="spot-name" class="spotlight-title">Vikram Rathore</div>
          <div id="spot-meta" class="spotlight-meta">India · Kushti Wrestling · #1</div>
          <div id="spot-xp" class="spotlight-xp">LV.1 ROOKIE · 0 XP</div>
          <div class="stat-bars">
            <div><div class="stat-bar-label"><span>PWR</span><span id="stat-pwr">93</span></div><div class="bar-track"><div id="bar-pwr" class="bar-fill" style="background:#f59e0b;width:93%"></div></div></div>
            <div><div class="stat-bar-label"><span>SPD</span><span id="stat-spd">75</span></div><div class="bar-track"><div id="bar-spd" class="bar-fill" style="background:#38bdf8;width:75%"></div></div></div>
            <div><div class="stat-bar-label"><span>RCH</span><span id="stat-rch">86</span></div><div class="bar-track"><div id="bar-rch" class="bar-fill" style="background:#10b981;width:86%"></div></div></div>
          </div>
        </div>
      </div>

      <div id="roster-grid" class="roster-grid"></div>

      <button id="btn-start" class="primary-cta" type="button">ENTER ARENA · BEST OF 3</button>
    </section>

    <!-- FIGHT SCREEN -->
    <section id="fight-screen" class="screen fight-screen hidden">
      <canvas id="combat-canvas" width="720" height="1440"></canvas>

      <div class="hud-layer">
        <div class="hud-top">
          <div class="hud-side">
            <div class="hud-names"><span id="hud-p1-name">IND · Vikram</span><span id="hud-p1-hp-txt">HP 100</span></div>
            <div class="hp-track"><div id="hud-p1-hp" class="hp-fill-p1" style="width:100%"></div></div>
            <div class="posture-track"><div id="hud-p1-pos" class="posture-fill" style="width:100%"></div></div>
            <div class="fury-row">
              <div class="fury-track"><div id="hud-p1-fury" class="fury-fill" style="width:0%"></div></div>
              <div class="rounds-dots"><span id="r1-p1" class="round-dot"></span><span id="r2-p1" class="round-dot"></span></div>
            </div>
          </div>

          <div id="timer-box" class="timer-box">
            <div id="timer-lbl" class="timer-label">R1</div>
            <div id="timer-val" class="timer-val">60</div>
          </div>

          <div class="hud-side">
            <div class="hud-names"><span id="hud-p2-hp-txt">HP 100</span><span id="hud-p2-name">Zhao · CHN</span></div>
            <div class="hp-track"><div id="hud-p2-hp" class="hp-fill-p2" style="width:100%"></div></div>
            <div class="posture-track"><div id="hud-p2-pos" class="posture-fill" style="width:100%;margin-left:auto"></div></div>
            <div class="fury-row">
              <div class="rounds-dots"><span id="r1-p2" class="round-dot"></span><span id="r2-p2" class="round-dot"></span></div>
              <div class="fury-track"><div id="hud-p2-fury" class="fury-fill" style="width:0%;margin-left:auto"></div></div>
            </div>
          </div>
        </div>

        <div class="hud-sub">
          <button id="btn-exit-fight" class="hud-util-btn" type="button">ROSTER</button>
          <span id="arena-badge" style="font-size:10px;font-weight:800;color:#cbd5e1;background:rgba(7,10,16,0.75);padding:3px 7px;border-radius:6px">ARENA</span>
          <button id="btn-mute-fight" class="hud-util-btn" type="button">SFX</button>
        </div>

        <div id="hud-combo" class="hud-combo hidden">
          <div id="hud-combo-val" class="hud-combo-title">2x COMBO</div>
          <div id="hud-combo-sub" class="hud-combo-sub">0 DMG</div>
        </div>

        <div id="dojo-trial" class="dojo-trial-box hidden">
          <div style="color:#fbbf24;font-weight:800">DOJO TRIAL: IRON FOUNDATION</div>
          <div id="trial-s1">1. Tap A (Jab)</div>
          <div id="trial-s2">2. Tap B (Cross)</div>
          <div id="trial-s3">3. Hold ▼ + A (Launch)</div>
        </div>

        <div id="hud-banner" class="hud-banner hidden">
          <div id="hud-banner-main" class="hud-banner-main">ROUND 1</div>
          <div id="hud-banner-sub" class="hud-banner-sub"></div>
        </div>
      </div>

      <!-- CSS3 Touch-Only Console Controller -->
      <div id="console-chassis" class="console-chassis">
        <div class="console-status">
          <span id="pad-status">PAD · IDLE</span>
          <span id="pad-hint" style="color:#f59e0b">A+B GRAB · ROPE SPRING · ▼+A LAUNCH</span>
        </div>

        <div id="console-main" class="console-main">
          <div id="dpad-well" class="dpad-well" role="application" aria-label="Touch D-Pad and Joystick">
            <div id="arm-up" class="dpad-arm dpad-up"></div>
            <div id="arm-down" class="dpad-arm dpad-down"></div>
            <div id="arm-left" class="dpad-arm dpad-left"></div>
            <div id="arm-right" class="dpad-arm dpad-right"></div>
            <div id="joystick-nub" class="joystick-nub"></div>
          </div>

          <div class="ab-cluster">
            <button id="btn-b" class="arcade-btn arcade-btn-b" type="button"><span class="btn-letter">B</span><span class="btn-cap">POWER</span></button>
            <button id="btn-a" class="arcade-btn arcade-btn-a" type="button"><span class="btn-letter">A</span><span class="btn-cap">STRIKE</span></button>
          </div>
        </div>

        <div class="console-status" style="color:#64748b">
          <span>360×720 · 720×1440 HD+</span>
          <span>TOUCH-ONLY · 480 PNG/FIGHTER</span>
        </div>
      </div>
    </section>

    <!-- SETTINGS / ERGONOMICS MODAL -->
    <div id="modal-settings" class="modal-backdrop hidden">
      <div class="modal-card">
        <h2 class="modal-title">TOUCH & ERGONOMICS</h2>
        <div style="margin-top:10px;font-size:11px;font-weight:700;color:#94a3b8">HAPTIC INTENSITY</div>
        <select id="set-haptic" class="modal-btn"><option value="full">FULL VIBRATION</option><option value="light">LIGHT VIBRATION</option><option value="off">OFF</option></select>
        <div style="margin-top:10px;font-size:11px;font-weight:700;color:#94a3b8">PAD SCALE (<span id="lbl-scale">100%</span>)</div>
        <input id="set-scale" type="range" min="85" max="112" value="100" style="width:100%" />
        <div style="margin-top:8px;font-size:11px;font-weight:700;color:#94a3b8">THUMB GAP (<span id="lbl-gap">6px</span>)</div>
        <input id="set-gap" type="range" min="0" max="24" value="6" style="width:100%" />
        <div style="margin-top:8px;font-size:11px;font-weight:700;color:#94a3b8">CHASSIS OPACITY (<span id="lbl-op">100%</span>)</div>
        <input id="set-op" type="range" min="65" max="100" value="100" style="width:100%" />
        <button id="btn-close-settings" class="modal-btn gold" type="button">SAVE & CLOSE</button>
      </div>
    </div>

    <!-- CUP / MATCH END MODAL -->
    <div id="modal-result" class="modal-backdrop hidden">
      <div class="modal-card" style="text-align:center">
        <div id="res-tag" style="font-size:10px;font-weight:800;color:#f59e0b">BOUT COMPLETE</div>
        <h2 id="res-title" class="modal-title" style="margin-top:4px">WINNER</h2>
        <p id="res-quote" style="font-size:11px;font-style:italic;color:#cbd5e1;margin:8px 0"></p>
        <div id="res-stats" style="font-family:monospace;font-size:11px;color:#38bdf8;margin-bottom:10px"></div>
        <button id="btn-res-next" class="modal-btn gold" type="button">PLAY AGAIN</button>
        <button id="btn-res-roster" class="modal-btn" type="button">BACK TO ROSTER</button>
      </div>
    </div>
  </main>

  <script type="module">
    import { loadInlineMetadata, registerInlinePwa } from '@iron-titan/metadata';
    import { soundPlugin } from '@iron-titan/audio';
    import { loadCareer, saveCareer, loadControls, saveControls, getMasteryTier } from '@iron-titan/storage';
    import { bakeFighterSpritePng, bakePortraitPngDataUrl } from '@iron-titan/sprites';
    import { createCup, advanceCup } from '@iron-titan/tournament';
    import { mountTouchController } from '@iron-titan/controller';
    import { StandaloneCombatEngine } from '@iron-titan/engine';

    registerInlinePwa();
    const META = loadInlineMetadata();
    const FIGHTERS = META.fighters;

    let career = loadCareer();
    let controls = loadControls();
    let mode = 'versus';
    let slotPick = 'p1';
    let p1Id = FIGHTERS[0].id;
    let p2Id = FIGHTERS[1].id;
    let cup = null;
    let arcadeQueue = [];
    let arcadeIdx = 0;
    let survivalStreak = 0;
    let engine = null;
    let deferredInstall = null;

    const inputState = { moveX: 0, moveY: 0, strikeDown: false, powerDown: false, strikeCount: 0, powerCount: 0, grappleCount: 0 };
    const portraits = {};
    FIGHTERS.forEach(f => { portraits[f.id] = bakePortraitPngDataUrl(f); });

    const $ = (id) => document.getElementById(id);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferredInstall = e; $('btn-install').classList.remove('hidden');
    });
    $('btn-install').addEventListener('click', async () => {
      if (!deferredInstall) return;
      await deferredInstall.prompt();
      deferredInstall = null;
      $('btn-install').classList.add('hidden');
    });

    const controller = mountTouchController({
      padEl: $('dpad-well'), nubEl: $('joystick-nub'),
      armUp: $('arm-up'), armDown: $('arm-down'), armLeft: $('arm-left'), armRight: $('arm-right'),
      btnA: $('btn-a'), btnB: $('btn-b'), statusEl: $('pad-status'), hintEl: $('pad-hint'),
      chassisEl: $('console-chassis'), mainEl: $('console-main')
    }, inputState, () => controls);

    function renderSelect() {
      const p1 = FIGHTERS.find(f => f.id === p1Id);
      const p2 = FIGHTERS.find(f => f.id === p2Id);
      const insp = slotPick === 'p2' && (mode === 'versus' || mode === 'dojo') ? p2 : p1;
      const mRec = career.mastery[insp.id] || { xp: 0, wins: 0 };
      const tier = getMasteryTier(mRec.xp);

      $('slot-p1-name').textContent = p1.countryCode + ' · ' + p1.name.split(' ')[0];
      $('slot-p2-name').textContent = p2.countryCode + ' · ' + p2.name.split(' ')[0];
      $('slot-p1').className = 'slot-btn ' + (slotPick === 'p1' ? 'active-p1' : '');
      $('slot-p2').className = 'slot-btn ' + (slotPick === 'p2' ? 'active-p2' : '');

      $('spot-img').src = portraits[insp.id];
      $('spot-name').textContent = insp.name;
      $('spot-meta').textContent = insp.country + ' · ' + insp.discipline + ' · #' + insp.rank;
      $('spot-xp').textContent = 'LV.' + tier.level + ' ' + tier.title + ' · ' + mRec.xp + ' XP';
      $('stat-pwr').textContent = insp.stats.power; $('bar-pwr').style.width = insp.stats.power + '%';
      $('stat-spd').textContent = insp.stats.speed; $('bar-spd').style.width = insp.stats.speed + '%';
      $('stat-rch').textContent = insp.stats.reach; $('bar-rch').style.width = insp.stats.reach + '%';

      const grid = $('roster-grid');
      grid.innerHTML = '';
      FIGHTERS.forEach(f => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isP1 = f.id === p1Id;
        const isP2 = (mode === 'versus' || mode === 'dojo') && f.id === p2Id;
        const fTier = getMasteryTier((career.mastery[f.id] || { xp: 0 }).xp);
        btn.className = 'fighter-card ' + (isP1 ? 'p1' : isP2 ? 'p2' : '');
        btn.innerHTML = '<div class="fighter-card-top"><span>L' + fTier.level + '</span><span>' + (isP1 ? 'P1' : isP2 ? 'CPU' : '') + '</span></div>' +
          '<img class="fighter-thumb" src="' + portraits[f.id] + '" alt="' + f.name + '"/>' +
          '<div class="fighter-cc">' + f.countryCode + '</div><div class="fighter-fn">' + f.name.split(' ')[0] + '</div>';
        btn.onclick = () => {
          soundPlugin.unlock(); soundPlugin.uiTap();
          if (slotPick === 'p1' || (mode !== 'versus' && mode !== 'dojo')) p1Id = f.id;
          else p2Id = f.id;
          renderSelect();
        };
        grid.appendChild(btn);
      });

      $('btn-start').textContent = mode === 'arcade' ? 'START 7-STAGE ARCADE'
        : mode === 'cup' ? 'ENTER 8-NATION CUP (' + career.cupWins + 'x)'
        : mode === 'survival' ? 'SURVIVAL · BEST ' + career.bestSurvival
        : mode === 'dojo' ? 'ENTER DOJO TRIALS' : 'ENTER ARENA · BEST OF 3';
    }

    document.querySelectorAll('#mode-grid .mode-btn').forEach(b => {
      b.onclick = () => {
        soundPlugin.unlock(); soundPlugin.uiTap();
        document.querySelectorAll('#mode-grid .mode-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        mode = b.dataset.mode;
        if (mode !== 'versus' && mode !== 'dojo') slotPick = 'p1';
        renderSelect();
      };
    });
    $('slot-p1').onclick = () => { slotPick = 'p1'; renderSelect(); };
    $('slot-p2').onclick = () => { if (mode === 'versus' || mode === 'dojo') { slotPick = 'p2'; renderSelect(); } };

    const toggleMute = () => {
      const m = soundPlugin.setMuted(!soundPlugin.muted);
      $('btn-mute').textContent = m ? 'MUTE' : 'SFX';
      $('btn-mute-fight').textContent = m ? 'MUTE' : 'SFX';
    };
    $('btn-mute').onclick = toggleMute;
    $('btn-mute-fight').onclick = toggleMute;

    $('btn-settings').onclick = () => {
      $('set-haptic').value = controls.haptic;
      $('set-scale').value = Math.round(controls.scale * 100); $('lbl-scale').textContent = $('set-scale').value + '%';
      $('set-gap').value = controls.gap; $('lbl-gap').textContent = controls.gap + 'px';
      $('set-op').value = Math.round(controls.opacity * 100); $('lbl-op').textContent = $('set-op').value + '%';
      $('modal-settings').classList.remove('hidden');
    };
    ['set-scale', 'set-gap', 'set-op'].forEach(id => {
      $(id).oninput = () => {
        $('lbl-scale').textContent = $('set-scale').value + '%';
        $('lbl-gap').textContent = $('set-gap').value + 'px';
        $('lbl-op').textContent = $('set-op').value + '%';
      };
    });
    $('btn-close-settings').onclick = () => {
      controls = saveControls({
        ...controls,
        haptic: $('set-haptic').value,
        scale: Number($('set-scale').value) / 100,
        gap: Number($('set-gap').value),
        opacity: Number($('set-op').value) / 100
      });
      controller.applyErgonomics();
      $('modal-settings').classList.add('hidden');
    };

    async function launchFight(oppId) {
      p2Id = oppId;
      const f1 = FIGHTERS.find(f => f.id === p1Id);
      const f2 = FIGHTERS.find(f => f.id === p2Id);
      const [s1, s2] = await Promise.all([bakeFighterSpritePng(f1), bakeFighterSpritePng(f2)]);

      $('select-screen').classList.add('hidden');
      $('fight-screen').classList.remove('hidden');
      $('modal-result').classList.add('hidden');
      $('dojo-trial').classList.toggle('hidden', mode !== 'dojo');
      $('hud-p1-name').textContent = f1.countryCode + ' · ' + f1.name.split(' ')[0];
      $('hud-p2-name').textContent = f2.name.split(' ')[0] + ' · ' + f2.countryCode;
      $('arena-badge').textContent = f2.arena.name.toUpperCase();

      engine?.destroy();
      engine = new StandaloneCombatEngine($('combat-canvas'), f1, s1, f2, s2, inputState, mode, {
        getHaptic: () => controls.haptic,
        getRunThreshold: () => controls.runThreshold,
        onTrialCleared: () => {
          const prev = career.mastery[f1.id] || { xp: 0, wins: 0 };
          career.mastery[f1.id] = { ...prev, xp: prev.xp + 25 };
          saveCareer(career);
        },
        onHud: (h) => {
          $('hud-p1-hp').style.width = h.p1Hp + '%'; $('hud-p1-hp-txt').textContent = 'HP ' + h.p1Hp;
          $('hud-p2-hp').style.width = h.p2Hp + '%'; $('hud-p2-hp-txt').textContent = 'HP ' + h.p2Hp;
          $('hud-p1-pos').style.width = h.p1Posture + '%'; $('hud-p2-pos').style.width = h.p2Posture + '%';
          $('hud-p1-fury').style.width = h.p1Fury + '%'; $('hud-p2-fury').style.width = h.p2Fury + '%';
          $('r1-p1').classList.toggle('won', h.p1Rounds >= 1); $('r2-p1').classList.toggle('won', h.p1Rounds >= 2);
          $('r1-p2').classList.toggle('won', h.p2Rounds >= 1); $('r2-p2').classList.toggle('won', h.p2Rounds >= 2);
          $('timer-box').classList.toggle('ot', h.isOt);
          $('timer-lbl').textContent = h.isOt ? 'OT' : mode === 'dojo' ? 'DOJO' : 'R' + h.round;
          $('timer-val').textContent = mode === 'dojo' ? '∞' : String(h.timer).padStart(2, '0');
          $('hud-combo').classList.toggle('hidden', h.combo < 2);
          $('hud-combo-val').textContent = h.combo + 'x COMBO';
          $('hud-combo-sub').textContent = h.comboDmg + ' DMG · BEST ' + h.maxCombo + 'x';
          $('hud-banner').classList.toggle('hidden', !h.banner);
          if (h.banner) { $('hud-banner-main').textContent = h.banner; $('hud-banner-sub').textContent = h.subBanner || ''; }
          $('trial-s1').style.color = h.trialStep >= 1 ? '#10b981' : '#cbd5e1';
          $('trial-s2').style.color = h.trialStep >= 2 ? '#10b981' : '#cbd5e1';
        },
        onMatchEnd: ({ winner, maxCombo, p1Rounds, p2Rounds }) => {
          const xp = (winner === 'p1' ? 65 : 25) + p1Rounds * 12;
          const prev = career.mastery[f1.id] || { xp: 0, wins: 0 };
          career.mastery[f1.id] = { xp: prev.xp + xp, wins: prev.wins + (winner === 'p1' ? 1 : 0) };
          if (winner === 'p1') career.wins++;

          let nextLabel = 'PLAY AGAIN';
          if (mode === 'cup' && cup) {
            const wasFinal = cup.stage === 'FINAL';
            advanceCup(cup, winner === 'p1', FIGHTERS);
            if (wasFinal && winner === 'p1') career.cupWins++;
            nextLabel = cup.stage === 'DONE' ? 'NEW 8-NATION CUP' : 'NEXT CUP: ' + cup.stage;
          } else if (mode === 'arcade' && winner === 'p1' && arcadeIdx < arcadeQueue.length - 1) {
            nextLabel = 'NEXT CHALLENGER (' + (arcadeIdx + 2) + '/7)';
          } else if (mode === 'survival' && winner === 'p1') {
            survivalStreak++; career.bestSurvival = Math.max(career.bestSurvival, survivalStreak);
            nextLabel = 'NEXT GAUNTLET (' + (survivalStreak + 1) + ')';
          }
          saveCareer(career);

          const winFighter = winner === 'p1' ? f1 : f2;
          $('res-tag').textContent = 'BOUT COMPLETE · ' + p1Rounds + ' - ' + p2Rounds;
          $('res-title').textContent = winFighter.name + ' WINS';
          $('res-quote').textContent = '"' + winFighter.victoryQuote + '"';
          $('res-stats').textContent = 'MAX COMBO ' + maxCombo + 'x · +' + xp + ' MASTERY XP';
          $('btn-res-next').textContent = nextLabel;
          $('modal-result').classList.remove('hidden');
        }
      });
      engine.start();
    }

    $('btn-start').onclick = () => {
      soundPlugin.unlock(); soundPlugin.uiTap();
      if (mode === 'arcade') {
        arcadeQueue = FIGHTERS.filter(f => f.id !== p1Id).map(f => f.id);
        arcadeIdx = 0; launchFight(arcadeQueue[0]);
      } else if (mode === 'cup') {
        cup = createCup(p1Id, FIGHTERS);
        launchFight(cup.qf[0].b);
      } else if (mode === 'survival') {
        survivalStreak = 0;
        launchFight(FIGHTERS.find(f => f.id !== p1Id).id);
      } else {
        launchFight(p2Id);
      }
    };

    $('btn-res-next').onclick = () => {
      if (mode === 'cup' && cup) {
        if (cup.stage === 'DONE') cup = createCup(p1Id, FIGHTERS);
        const opp = cup.stage === 'QF' ? cup.qf[0].b : cup.stage === 'SF' ? cup.sf[0].b : cup.final.b;
        launchFight(opp);
      } else if (mode === 'arcade' && arcadeIdx < arcadeQueue.length - 1) {
        arcadeIdx++; launchFight(arcadeQueue[arcadeIdx]);
      } else if (mode === 'survival') {
        const pool = FIGHTERS.filter(f => f.id !== p1Id);
        launchFight(pool[survivalStreak % pool.length].id);
      } else {
        launchFight(p2Id);
      }
    };

    const backToRoster = () => {
      engine?.destroy(); engine = null;
      $('modal-result').classList.add('hidden');
      $('fight-screen').classList.add('hidden');
      $('select-screen').classList.remove('hidden');
      renderSelect();
    };
    $('btn-res-roster').onclick = backToRoster;
    $('btn-exit-fight').onclick = backToRoster;

    renderSelect();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(STANDALONE_DIR, 'index.html'), STANDALONE_HTML);
fs.writeFileSync(path.join(PUBLIC_STANDALONE_DIR, 'index.html'), STANDALONE_HTML);

const README_MD = `# Iron Titan 8 — Standalone Android 13 Portrait PWA Package

Built specifically for the **TCL Ion V** smartphone (**360×720** viewport, **720×1440** combat canvas) on **Android 13 Chrome** using **touch-only input** (\`touchstart\`, \`touchmove\`, \`touchend\`, \`touchcancel\`, touch-hold) with **no desktop, keyboard, mouse, or Apple/iOS dependencies**.

## Package Contents
- \`standalone/index.html\` — Fully self-contained single-file HTML5 app with inline CSS3, inline JSON metadata & PWA manifest, inline PNG icons, and ES module \`importmap\` plugins.
- \`standalone/styles/console.css\` — CSS3 hardware console chassis, D-pad/joystick combo, and portrait shell styles.
- \`standalone/metadata.json\` & \`standalone/manifest.webmanifest\` — App metadata and Android Chrome standalone portrait manifest.
- \`standalone/sw.js\` — Offline service worker precaching icons, styles, metadata, and PNG spritesheets.
- \`standalone/icons/\` — Generated PNG launcher icons (\`32×32\`, \`192×192\`, \`512×512\`, and maskable \`512×512\`).
- \`standalone/src/sprites/\` — PNG spritesheets and animation keyframe PNGs (\`idle_00.png\`, \`walk_00.png\`, \`run_00.png\`, \`attack_00.png\`) for all 8 heavyweight champions (480 stills per fighter / 3,840 total).

## Inline ES Module Plugin Architecture
\`standalone/index.html\` wires all subsystems via \`<script type="importmap">\` with explicit ES module \`import\` and \`export\` bindings:
1. \`@iron-titan/metadata\` — Parses inline JSON metadata and registers the inline PWA manifest + Service Worker.
2. \`@iron-titan/audio\` — Web Audio API synthesized combat effects (jab, heavy, slam, parry, clinch, springboard, KO, victory).
3. \`@iron-titan/haptics\` — \`navigator.vibrate\` tactile patterns scaled by user intensity setting.
4. \`@iron-titan/storage\` — LocalStorage persistence for Fighter Mastery XP/Ranks, 8-Nation Cup titles, Dojo trials, and thumb ergonomics.
5. \`@iron-titan/sprites\` — Procedural PNG spritesheet & portrait generator covering Idle, Walk, Run, and Attack animations.
6. \`@iron-titan/tournament\` — 8-Nation Knockout Cup single-elimination bracket progression.
7. \`@iron-titan/controller\` — Touch-only D-pad/analog joystick combo and \`A\`/\`B\` buttons with adjustable scale, thumb gap, and opacity.
8. \`@iron-titan/engine\` — 720×1440 combat loop with clinch grapples (\`A+B\`), throw techs, springboard corner rebounds, afterimages, hit-flashes, mat dust, arena lighting overlays, critical/clinch camera zoom, and Sudden-Death Overtime.
`;

fs.writeFileSync(path.join(STANDALONE_DIR, 'README.md'), README_MD);
fs.writeFileSync(path.join(ROOT, 'README.md'), README_MD);

console.log('Standalone Android 13 portrait PWA package generated successfully.');
