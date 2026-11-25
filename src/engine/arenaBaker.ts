import type { FighterProfile, LandmarkType } from '../data/fighters';

const arenaCache = new Map<string, ImageBitmap | HTMLImageElement>();

function drawLandmark(
  ctx: CanvasRenderingContext2D,
  landmark: LandmarkType,
  horizonHex: string
) {
  ctx.save();
  ctx.fillStyle = '#0a0d14';
  ctx.strokeStyle = `${horizonHex}44`;
  ctx.lineWidth = 2;

  const baseY = 565;

  if (landmark === 'taj_arch') {
    // Dome & minarets
    ctx.beginPath();
    ctx.arc(360, baseY - 115, 76, Math.PI, 0);
    ctx.lineTo(436, baseY);
    ctx.lineTo(284, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (const mx of [170, 550]) {
      ctx.fillRect(mx - 14, baseY - 155, 28, 155);
      ctx.beginPath();
      ctx.arc(mx, baseY - 155, 18, Math.PI, 0);
      ctx.fill();
    }
  } else if (landmark === 'pagoda') {
    for (let tier = 0; tier < 4; tier++) {
      const w = 190 - tier * 32;
      const y = baseY - tier * 42;
      ctx.beginPath();
      ctx.moveTo(360 - w * 0.62, y);
      ctx.lineTo(360 + w * 0.62, y);
      ctx.lineTo(360 + w * 0.45, y - 28);
      ctx.lineTo(360 - w * 0.45, y - 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (landmark === 'steel_bridge') {
    // Towers & suspension cables
    for (const tx of [185, 535]) {
      ctx.fillRect(tx - 22, baseY - 210, 44, 210);
      ctx.strokeRect(tx - 22, baseY - 210, 44, 210);
    }
    ctx.beginPath();
    ctx.moveTo(0, baseY - 60);
    ctx.quadraticCurveTo(90, baseY - 150, 185, baseY - 210);
    ctx.quadraticCurveTo(360, baseY - 95, 535, baseY - 210);
    ctx.quadraticCurveTo(630, baseY - 150, 720, baseY - 60);
    ctx.lineWidth = 4;
    ctx.stroke();
  } else if (landmark === 'volcano_temple') {
    ctx.beginPath();
    ctx.moveTo(80, baseY);
    ctx.lineTo(300, baseY - 190);
    ctx.lineTo(420, baseY - 190);
    ctx.lineTo(640, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (landmark === 'fort_minaret') {
    ctx.fillRect(220, baseY - 135, 280, 135);
    for (const ax of [260, 360, 460]) {
      ctx.fillStyle = `${horizonHex}22`;
      ctx.beginPath();
      ctx.arc(ax, baseY - 65, 28, Math.PI, 0);
      ctx.lineTo(ax + 28, baseY);
      ctx.lineTo(ax - 28, baseY);
      ctx.fill();
    }
  } else if (landmark === 'lagos_skyline') {
    const heights = [120, 185, 145, 210, 165, 130, 175];
    heights.forEach((h, i) => {
      const x = 60 + i * 90;
      ctx.fillRect(x, baseY - h, 68, h);
      ctx.strokeRect(x, baseY - h, 68, h);
    });
  } else if (landmark === 'rio_peaks') {
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(180, baseY - 175);
    ctx.lineTo(310, baseY - 95);
    ctx.lineTo(480, baseY - 205);
    ctx.lineTo(720, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // river_arch
    ctx.beginPath();
    ctx.moveTo(90, baseY);
    ctx.quadraticCurveTo(360, baseY - 220, 630, baseY);
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillRect(140, baseY - 110, 440, 110);
  }

  ctx.restore();
}

export async function bakeArenaBackdropPng(
  fighter: FighterProfile
): Promise<ImageBitmap | HTMLImageElement> {
  const existing = arenaCache.get(fighter.id);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d')!;

  const { arena } = fighter;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 580);
  sky.addColorStop(0, arena.skyTop);
  sky.addColorStop(0.75, arena.skyBottom);
  sky.addColorStop(1, arena.horizonHex);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 720, 580);

  // Arena spotlight beams
  for (const bx of [150, 570]) {
    const beam = ctx.createLinearGradient(bx, 0, 360, 560);
    beam.addColorStop(0, 'rgba(255,255,255,0.16)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(bx - 28, 0);
    ctx.lineTo(bx + 28, 0);
    ctx.lineTo(520, 580);
    ctx.lineTo(200, 580);
    ctx.closePath();
    ctx.fill();
  }

  // Country skyline / monument silhouette
  drawLandmark(ctx, arena.landmark, arena.horizonHex);

  // Crowd tier silhouettes
  ctx.fillStyle = '#090c12';
  ctx.fillRect(0, 540, 720, 75);
  for (let i = 0; i < 42; i++) {
    const cx = i * 18 + 6;
    const cy = 548 + (i % 3) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ring ropes / barricade
  ctx.strokeStyle = arena.matAccent;
  ctx.lineWidth = 4;
  for (const ry of [520, 555, 590]) {
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(720, ry);
    ctx.stroke();
  }

  // Ring mat floor with perspective grid
  const floorGrad = ctx.createLinearGradient(0, 600, 0, 900);
  floorGrad.addColorStop(0, arena.matPrimary);
  floorGrad.addColorStop(1, '#0b0e14');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, 600, 720, 300);

  ctx.strokeStyle = `${arena.matAccent}38`;
  ctx.lineWidth = 2;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(360 + i * 70, 600);
    ctx.lineTo(360 + i * 155, 900);
    ctx.stroke();
  }
  for (const fy of [635, 685, 750, 825]) {
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(720, fy);
    ctx.stroke();
  }

  // Arena trim border
  ctx.fillStyle = arena.matAccent;
  ctx.fillRect(0, 598, 720, 6);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Arena PNG failed'))), 'image/png');
  });

  const drawable =
    typeof createImageBitmap === 'function'
      ? await createImageBitmap(blob)
      : await new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = URL.createObjectURL(blob);
        });

  arenaCache.set(fighter.id, drawable);
  return drawable;
}
