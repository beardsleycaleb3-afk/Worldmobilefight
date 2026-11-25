import type { FighterProfile } from '../data/fighters';
import type { CombatMatchStats } from './combatTypes';

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function generateMatchStatCardPng(params: {
  p1: FighterProfile;
  p2: FighterProfile;
  p1PortraitUrl: string;
  p2PortraitUrl: string;
  winner: 'p1' | 'p2' | 'draw';
  p1Rounds: number;
  p2Rounds: number;
  maxCombo: number;
  stats: CombatMatchStats;
  modeLabel: string;
}): Promise<Blob> {
  const {
    p1,
    p2,
    p1PortraitUrl,
    p2PortraitUrl,
    winner,
    p1Rounds,
    p2Rounds,
    maxCombo,
    stats,
    modeLabel,
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 900);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.5, '#0b0e14');
  bg.addColorStop(1, '#06080c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 720, 900);

  // Outer championship gold border
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 684, 864);

  // Header
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`IRON TITAN 8 · ${modeLabel.toUpperCase()} BOUT CARD`, 360, 68);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 54px "Barlow Condensed", sans-serif';
  const headline =
    winner === 'p1'
      ? `${p1.name.toUpperCase()} VICTORY`
      : winner === 'p2'
      ? `${p2.name.toUpperCase()} VICTORY`
      : 'SPLIT DRAW';
  ctx.fillText(headline, 360, 126);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText(`ROUNDS ${p1Rounds} - ${p2Rounds} · ${stats.durationSeconds}s`, 360, 162);

  // Portraits
  const [img1, img2] = await Promise.all([loadImg(p1PortraitUrl), loadImg(p2PortraitUrl)]);

  const drawFighterBox = (
    x: number,
    y: number,
    fighter: FighterProfile,
    img: HTMLImageElement | null,
    isWinner: boolean,
    flip: boolean
  ) => {
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = isWinner ? '#f59e0b' : '#334155';
    ctx.lineWidth = isWinner ? 4 : 2;
    ctx.fillRect(x, y, 250, 290);
    ctx.strokeRect(x, y, 250, 290);

    if (img) {
      ctx.save();
      ctx.translate(x + 125, y + 115);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, -95, -95, 190, 190);
      ctx.restore();
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 26px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fighter.name, x + 125, y + 240);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${fighter.countryCode} · ${fighter.discipline}`, x + 125, y + 270);
    ctx.restore();
  };

  drawFighterBox(56, 200, p1, img1, winner === 'p1', false);
  drawFighterBox(414, 200, p2, img2, winner === 'p2', true);

  ctx.fillStyle = '#f59e0b';
  ctx.font = '800 44px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VS', 360, 355);

  // Metrics Grid
  const metrics = [
    { label: 'PEAK COMBO', value: `${maxCombo} HITS` },
    { label: 'TOTAL DAMAGE', value: `${stats.totalDamage} HP` },
    { label: 'STRIKES LANDED', value: `${stats.hitsLanded}` },
    { label: 'PERFECT PARRIES', value: `${stats.parries}` },
    { label: 'GUARD BLOCKS', value: `${stats.blocks}` },
    { label: 'SPECIALS USED', value: `${stats.specialsUsed}` },
  ];

  metrics.forEach((m, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const bx = 56 + col * 316;
    const by = 535 + row * 98;

    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, 292, 82);
    ctx.strokeRect(bx, by, 292, 82);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(m.label, bx + 18, by + 30);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillText(m.value, bx + 18, by + 66);
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText('480 THREE.JS PNG STILLS · TCL ION V 720x1440 ARENA', 360, 855);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to export PNG stat card'))),
      'image/png'
    );
  });
}
