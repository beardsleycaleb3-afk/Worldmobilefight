import { soundEngine } from '../audio/soundEngine';
import { getTrialsForFighter, type TrialStepMove } from '../data/comboTrials';
import type { AttackFrameSpec, FighterProfile } from '../data/fighters';
import { getRivalIntroLine, getVictoryQuote } from '../data/rivalries';
import type {
  CombatMatchStats,
  DojoCpuMode,
  FighterActionState,
  GameMode,
  HapticEventKind,
  HapticFeedbackEvent,
  HudSnapshot,
  MatchReplayData,
  RemoteCombatSnapshot,
  ReplayFrame,
  SkinVariant,
  TouchControlState,
} from './combatTypes';
import {
  FRAMES_PER_SHEET,
  SHEET_COLS,
  STILL_H,
  STILL_W,
  type AnimSheetKey,
  type BakedFighterAssets,
} from './fighterBaker';

interface PartnerSlot {
  profile: FighterProfile;
  assets: BakedFighterAssets;
  hp: number;
  maxHp: number;
  fury: number;
  guardPosture: number;
}

interface FighterActor {
  profile: FighterProfile;
  assets: BakedFighterAssets;
  x: number;
  y: number; // 0 = ground, negative = airborne
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  fury: number;
  guardPosture: number;
  staggerTimer: number;
  state: FighterActionState;
  stateTimer: number;
  animFrame: number;
  hitConfirmed: boolean;
  comboStep: number;
  comboCount: number;
  comboDamage: number;
  maxCombo: number;
  comboDecayTimer: number;
  footstepCooldown: number;
  guardElapsed: number;
  counterWindowTimer: number;
  hitFlashTimer: number;
  clinchHoldTimer: number;
  throwTechWindow: number;
  afterimageTimer: number;
  regenIdleTimer: number;
  aiThinkTimer: number;
  aiAction: 'approach' | 'retreat' | 'guard' | 'idle';
  bench: PartnerSlot | null;
}

interface EnergyProjectile {
  x: number;
  y: number;
  vx: number;
  ownerSlot: 'p1' | 'p2';
  color: string;
  damage: number;
  radius: number;
  life: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface AfterimageGhost {
  x: number;
  y: number;
  facing: 1 | -1;
  sheet: AnimSheetKey;
  frame: number;
  sheets: BakedFighterAssets['sheets'];
  alpha: number;
}

interface DustCloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface MatMark {
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
}

export interface CombatEngineOptions {
  mode: GameMode;
  onlineRole?: 'p1' | 'p2' | null;
  runThreshold?: number;
  showHitboxes?: boolean;
  dojoCpuMode?: DojoCpuMode;
  dojoTrialIndex?: number;
  p1Skin?: SkinVariant;
  p2Skin?: SkinVariant;
  p1Partner?: { profile: FighterProfile; assets: BakedFighterAssets } | null;
  p2Partner?: { profile: FighterProfile; assets: BakedFighterAssets } | null;
  initialP1Hp?: number;
  initialP1Fury?: number;
  survivalStreak?: number;
  replayData?: MatchReplayData | null;
  onTrialComplete?: (trialId: string, fighterId: string) => void;
  onSendInput?: (inp: TouchControlState) => void;
  onSendState?: (snapshot: RemoteCombatSnapshot) => void;
}

const STAGE_WIDTH = 720;
const GROUND_Y = 795;
const STAGE_LEFT = 84;
const STAGE_RIGHT = 636;
const DRAW_W = 290;
const DRAW_H = 362;

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inputsDiffer(a: TouchControlState, b: TouchControlState): boolean {
  return (
    Math.abs(a.moveX - b.moveX) > 0.08 ||
    Math.abs(a.moveY - b.moveY) > 0.08 ||
    a.strikeDown !== b.strikeDown ||
    a.powerDown !== b.powerDown ||
    a.strikeTriggerCount !== b.strikeTriggerCount ||
    a.powerTriggerCount !== b.powerTriggerCount ||
    a.directionalSpecialCount !== b.directionalSpecialCount ||
    a.tagTriggerCount !== b.tagTriggerCount ||
    a.grappleTriggerCount !== b.grappleTriggerCount
  );
}

export class CombatEngine {
  private ctx: CanvasRenderingContext2D;
  private backdrop: ImageBitmap | HTMLImageElement;
  private p1: FighterActor;
  private p2: FighterActor;
  private inputRef: { current: TouchControlState };
  private onHudUpdate: (hud: HudSnapshot) => void;

  private mode: GameMode;
  private onlineRole: 'p1' | 'p2' | null;
  private runThreshold: number;
  private showHitboxes: boolean;
  private dojoCpuMode: DojoCpuMode;
  private dojoTrialIndex = 0;
  private dojoTrialStep = 0;
  private onTrialComplete?: (trialId: string, fighterId: string) => void;
  private p1Skin: SkinVariant;
  private p2Skin: SkinVariant;
  private arenaProfile: FighterProfile['arena'];
  private survivalStreak: number;
  private isSuddenDeath = false;
  private victoryQuote: string | null = null;
  private rivalIntroLine: string;
  private onSendInput?: (inp: TouchControlState) => void;
  private onSendState?: (snapshot: RemoteCombatSnapshot) => void;

  private remoteInput: TouchControlState = {
    moveX: 0,
    moveY: 0,
    activeDir: 'CENTER',
    strikeDown: false,
    powerDown: false,
    strikeTriggerCount: 0,
    powerTriggerCount: 0,
    directionalSpecialCount: 0,
    tagTriggerCount: 0,
    grappleTriggerCount: 0,
    strikeChargeRatio: 0,
    powerHoldMs: 0,
  };

  private rafId = 0;
  private lastTs = 0;
  private paused = false;
  private destroyed = false;

  private p1Rounds = 0;
  private p2Rounds = 0;
  private roundNumber = 1;
  private roundTimer = 60;
  private phase: 'intro' | 'fight' | 'round_end' | 'match_end' = 'intro';
  private phaseTimer = 1.4;
  private hitStopTimer = 0;
  private superFlashTimer = 0;
  private superFlashLabel: string | null = null;
  private koSlowMoTimer = 0;
  private cameraZoom = 1;
  private cameraFocusX = STAGE_WIDTH * 0.5;
  private cameraFocusY = GROUND_Y - 170;
  private critZoomTimer = 0;
  private critTargetZoom = 1.2;
  private critFocusX = STAGE_WIDTH * 0.5;
  private critFocusY = GROUND_Y - 170;
  private clinchDwell = 0;
  private shakeMagnitude = 0;
  private tagCooldown = 0;

  private p1PrevCounts = {
    strike: 0,
    power: 0,
    dirSpecial: 0,
    tag: 0,
    grapple: 0,
    strikeDown: false,
  };
  private p2PrevCounts = {
    strike: 0,
    power: 0,
    dirSpecial: 0,
    tag: 0,
    grapple: 0,
    strikeDown: false,
  };

  private hudThrottle = 0;
  private networkThrottle = 0;
  private hapticSeq = 0;
  private lastHapticEvent: HapticFeedbackEvent | null = null;
  private guestHapticPending: HapticFeedbackEvent | null = null;

  private calloutText: string | null = null;
  private calloutTimer = 0;
  private frameAdvantageLabel: string | null = null;
  private ropeFlashSide: 'left' | 'right' | null = null;
  private ropeFlashTimer = 0;

  private matchStartTime = performance.now();
  private matchElapsed = 0;
  private rngSeed: number;
  private rng: () => number;

  // Replay recording / playback
  private replayPlayback: MatchReplayData | null = null;
  private replayCursor = 0;
  private replaySpeed = 1;
  private recordedFrames: ReplayFrame[] = [];
  private lastRecordedP1: TouchControlState | null = null;
  private lastRecordedAt = -1;

  private stats: CombatMatchStats = {
    totalDamage: 0,
    hitsLanded: 0,
    parries: 0,
    blocks: 0,
    guardBreaks: 0,
    specialsUsed: 0,
    jumpsUsed: 0,
    airJuggleHits: 0,
    clinchThrows: 0,
    springboards: 0,
    durationSeconds: 0,
  };

  private projectiles: EnergyProjectile[] = [];
  private sparks: SparkParticle[] = [];
  private rings: ShockwaveRing[] = [];
  private afterimages: AfterimageGhost[] = [];
  private dustClouds: DustCloud[] = [];
  private matMarks: MatMark[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    backdrop: ImageBitmap | HTMLImageElement,
    p1Profile: FighterProfile,
    p1Assets: BakedFighterAssets,
    p2Profile: FighterProfile,
    p2Assets: BakedFighterAssets,
    inputRef: { current: TouchControlState },
    onHudUpdate: (hud: HudSnapshot) => void,
    options?: CombatEngineOptions
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.backdrop = backdrop;
    this.inputRef = inputRef;
    this.onHudUpdate = onHudUpdate;

    this.mode = options?.mode || 'versus';
    this.onlineRole = options?.onlineRole || null;
    this.runThreshold = options?.runThreshold ?? 0.72;
    this.showHitboxes = options?.showHitboxes ?? false;
    this.dojoCpuMode = options?.dojoCpuMode ?? 'spar';
    this.dojoTrialIndex = options?.dojoTrialIndex ?? 0;
    this.onTrialComplete = options?.onTrialComplete;
    this.p1Skin = options?.p1Skin ?? 'default';
    this.p2Skin = options?.p2Skin ?? 'default';
    this.arenaProfile = p2Profile.arena;
    this.survivalStreak = options?.survivalStreak ?? 0;
    this.rivalIntroLine = getRivalIntroLine(p1Profile.id, p2Profile.id);
    this.onSendInput = options?.onSendInput;
    this.onSendState = options?.onSendState;

    this.replayPlayback = options?.replayData ?? null;
    this.rngSeed = this.replayPlayback ? this.replayPlayback.seed : Math.floor(Date.now() % 1000000);
    this.rng = createSeededRng(this.rngSeed);

    const p1Bench: PartnerSlot | null = options?.p1Partner
      ? {
          profile: options.p1Partner.profile,
          assets: options.p1Partner.assets,
          hp: 100,
          maxHp: 100,
          fury: 0,
          guardPosture: 100,
        }
      : null;
    const p2Bench: PartnerSlot | null = options?.p2Partner
      ? {
          profile: options.p2Partner.profile,
          assets: options.p2Partner.assets,
          hp: 100,
          maxHp: 100,
          fury: 0,
          guardPosture: 100,
        }
      : null;

    this.p1 = this.createActor(p1Profile, p1Assets, 210, 1, p1Bench);
    this.p2 = this.createActor(p2Profile, p2Assets, 510, -1, p2Bench);

    if (typeof options?.initialP1Hp === 'number') {
      this.p1.hp = Math.max(15, Math.min(100, options.initialP1Hp));
    }
    if (typeof options?.initialP1Fury === 'number') {
      this.p1.fury = Math.max(0, Math.min(100, options.initialP1Fury));
    }

    this.p1PrevCounts = {
      strike: inputRef.current.strikeTriggerCount,
      power: inputRef.current.powerTriggerCount,
      dirSpecial: inputRef.current.directionalSpecialCount,
      tag: inputRef.current.tagTriggerCount,
      grapple: inputRef.current.grappleTriggerCount,
      strikeDown: false,
    };

    if (this.mode === 'dojo') {
      this.phase = 'fight';
      this.phaseTimer = 0;
      this.roundTimer = 99;
      this.p1.fury = 100;
      this.p2.fury = 100;
      this.frameAdvantageLabel = 'DOJO · READY';
    }
  }

  private createActor(
    profile: FighterProfile,
    assets: BakedFighterAssets,
    x: number,
    facing: 1 | -1,
    bench: PartnerSlot | null
  ): FighterActor {
    return {
      profile,
      assets,
      x,
      y: 0,
      vx: 0,
      vy: 0,
      facing,
      hp: 100,
      maxHp: 100,
      fury: 0,
      guardPosture: 100,
      staggerTimer: 0,
      state: 'idle',
      stateTimer: 0,
      animFrame: 0,
      hitConfirmed: false,
      comboStep: 0,
      comboCount: 0,
      comboDamage: 0,
      maxCombo: 0,
      comboDecayTimer: 0,
      footstepCooldown: 0,
      guardElapsed: 0,
      counterWindowTimer: 0,
      hitFlashTimer: 0,
      clinchHoldTimer: 0,
      throwTechWindow: 0,
      afterimageTimer: 0,
      regenIdleTimer: 0,
      aiThinkTimer: 0.25,
      aiAction: 'approach',
      bench,
    };
  }

  public start(): void {
    this.lastTs = performance.now();
    this.matchStartTime = this.lastTs;
    soundEngine.playBell();
    soundEngine.startMusic();
    this.emitHud();

    const loop = (ts: number) => {
      if (this.destroyed) return;
      const rawDt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
      this.lastTs = ts;

      if (!this.paused) {
        const dt = this.replayPlayback ? rawDt * this.replaySpeed : rawDt;
        this.update(dt);
        this.render();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (!p) {
      this.lastTs = performance.now();
      soundEngine.startMusic();
    } else {
      soundEngine.stopMusic();
    }
  }

  public setShowHitboxes(show: boolean): void {
    this.showHitboxes = show;
  }

  public setDojoCpuMode(cpuMode: DojoCpuMode): void {
    this.dojoCpuMode = cpuMode;
  }

  public setDojoTrialIndex(idx: number): void {
    this.dojoTrialIndex = Math.max(0, idx);
    this.dojoTrialStep = 0;
    this.emitHud();
  }

  public setRunThreshold(val: number): void {
    this.runThreshold = Math.max(0.55, Math.min(0.85, val));
  }

  public setReplaySpeed(speed: 1 | 2): void {
    this.replaySpeed = speed;
  }

  public triggerTagButton(): void {
    if (this.mode !== 'tag' || this.replayPlayback) return;
    this.inputRef.current.tagTriggerCount += 1;
  }

  public showTauntBanner(text: string, fromSlot: 'p1' | 'p2'): void {
    const speaker = fromSlot === 'p1' ? this.p1.profile.name.split(' ')[0] : this.p2.profile.name.split(' ')[0];
    this.showCallout(`${speaker}: "${text}"`);
    soundEngine.playTaunt();
  }

  public getReplayData(): MatchReplayData {
    return {
      seed: this.rngSeed,
      mode: this.mode,
      p1Id: this.p1.bench ? this.p1.profile.id : this.p1.profile.id,
      p2Id: this.p2.profile.id,
      p1Skin: this.p1Skin,
      p2Skin: this.p2Skin,
      p1PartnerId: this.p1.bench?.profile.id,
      p2PartnerId: this.p2.bench?.profile.id,
      frames: this.recordedFrames,
    };
  }

  public applyRemoteInput(inp: TouchControlState): void {
    this.remoteInput = { ...inp };
  }

  public applyRemoteState(snap: RemoteCombatSnapshot): void {
    if (this.mode !== 'online' || this.onlineRole !== 'p2') return;
    const syncActor = (actor: FighterActor, s: RemoteCombatSnapshot['p1']) => {
      actor.x = s.x;
      actor.y = s.y;
      actor.vx = s.vx;
      actor.vy = s.vy;
      actor.facing = s.facing;
      actor.hp = s.hp;
      actor.fury = s.fury;
      actor.guardPosture = s.posture;
      actor.state = s.state;
      actor.animFrame = s.animFrame;
      actor.comboCount = s.comboCount;
      actor.comboDamage = s.comboDamage;
      actor.maxCombo = s.maxCombo;
    };
    syncActor(this.p1, snap.p1);
    syncActor(this.p2, snap.p2);
    this.p1Rounds = snap.p1Rounds;
    this.p2Rounds = snap.p2Rounds;
    this.roundNumber = snap.roundNumber;
    this.roundTimer = snap.roundTimer;
    this.phase = snap.phase;
    if (snap.calloutText) {
      this.calloutText = snap.calloutText;
      this.calloutTimer = 0.7;
      if (/CRITICAL|COUNTER|GUARD BREAK|LAUNCHER|PARRY/.test(snap.calloutText)) {
        this.triggerCriticalCamera(
          (this.p1.x + this.p2.x) * 0.5,
          GROUND_Y - 180,
          1.2,
          0.44
        );
      }
    }
    this.projectiles = snap.projectiles.map((pr) => ({
      ...pr,
      damage: 14,
      life: 0,
    }));
    if (snap.hapticForGuest && snap.hapticForGuest.id !== this.lastHapticEvent?.id) {
      this.lastHapticEvent = snap.hapticForGuest;
    }
    this.emitHud();
  }

  public destroy(): void {
    this.destroyed = true;
    soundEngine.stopMusic();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private getAttackSpec(
    actor: FighterActor,
    kind: 'jab' | 'cross' | 'special' | 'launcher' | 'air_kick' | 'springboard'
  ): AttackFrameSpec {
    if (kind === 'launcher') {
      const base = actor.profile.frameData.cross;
      return {
        startup: 0.11,
        activeEnd: 0.27,
        duration: 0.44,
        damage: Math.max(12, Math.round(base.damage * 0.9)),
        reachBonus: base.reachBonus + 4,
        knockback: 145,
      };
    }
    if (kind === 'air_kick') {
      return {
        startup: 0.08,
        activeEnd: 0.28,
        duration: 0.36,
        damage: 15,
        reachBonus: 18,
        knockback: 260,
      };
    }
    if (kind === 'springboard') {
      return {
        startup: 0.08,
        activeEnd: 0.46,
        duration: 0.54,
        damage: 21,
        reachBonus: 26,
        knockback: 380,
      };
    }
    return actor.profile.frameData[kind];
  }

  private resetRound(suddenDeath = false): void {
    const resetSide = (actor: FighterActor, x: number, facing: 1 | -1) => {
      actor.x = x;
      actor.y = 0;
      actor.vx = 0;
      actor.vy = 0;
      actor.facing = facing;
      actor.hp = suddenDeath ? 25 : 100;
      actor.fury = suddenDeath ? 100 : actor.fury;
      actor.guardPosture = 100;
      actor.staggerTimer = 0;
      actor.clinchHoldTimer = 0;
      actor.throwTechWindow = 0;
      actor.hitFlashTimer = 0;
      actor.state = 'idle';
      actor.stateTimer = 0;
      actor.comboCount = 0;
      actor.comboDamage = 0;
      actor.comboDecayTimer = 0;
      if (actor.bench) {
        actor.bench.hp = suddenDeath ? 25 : 100;
        actor.bench.guardPosture = 100;
      }
    };

    resetSide(this.p1, 210, 1);
    resetSide(this.p2, 510, -1);

    this.isSuddenDeath = suddenDeath;
    this.victoryQuote = null;
    this.projectiles = [];
    this.afterimages = [];
    this.roundTimer = suddenDeath ? 15 : 60;
    this.koSlowMoTimer = 0;
    this.critZoomTimer = 0;
    this.clinchDwell = 0;
    this.cameraZoom = 1;
    this.cameraFocusX = STAGE_WIDTH * 0.5;
    this.cameraFocusY = GROUND_Y - 170;
    this.phase = 'intro';
    this.phaseTimer = suddenDeath ? 1.65 : 1.5;
    if (suddenDeath) {
      soundEngine.playSuddenDeath();
      soundEngine.setMusicIntensity('final');
    } else {
      soundEngine.playBell();
    }
  }

  private triggerCriticalCamera(
    focusX: number,
    focusY: number,
    zoom = 1.2,
    duration = 0.44
  ): void {
    this.critFocusX = focusX;
    this.critFocusY = focusY;
    this.critTargetZoom = Math.max(this.critZoomTimer > 0 ? this.critTargetZoom : 1, zoom);
    this.critZoomTimer = Math.max(this.critZoomTimer, duration);
  }

  private updateCamera(dt: number): void {
    if (this.critZoomTimer > 0) {
      this.critZoomTimer = Math.max(0, this.critZoomTimer - dt);
    }

    const dist = Math.abs(this.p2.x - this.p1.x);
    const inClinchRange =
      this.phase === 'fight' &&
      dist <= 136 &&
      Math.abs(this.p1.y - this.p2.y) < 85 &&
      this.p1.state !== 'ko' &&
      this.p2.state !== 'ko';

    if (inClinchRange) {
      this.clinchDwell = Math.min(0.4, this.clinchDwell + dt);
    } else {
      this.clinchDwell = Math.max(0, this.clinchDwell - dt * 1.6);
    }

    let targetZoom = 1.0;
    let targetX = STAGE_WIDTH * 0.5;
    let targetY = GROUND_Y - 170;

    if (this.koSlowMoTimer > 0 || this.p1.state === 'ko' || this.p2.state === 'ko') {
      const koActor = this.p1.state === 'ko' ? this.p1 : this.p2.state === 'ko' ? this.p2 : null;
      targetZoom = 1.22;
      targetX = koActor ? (koActor.x + (this.p1.x + this.p2.x) * 0.5) * 0.5 : (this.p1.x + this.p2.x) * 0.5;
      targetY = GROUND_Y - 155;
    } else if (this.superFlashTimer > 0 || this.critZoomTimer > 0) {
      targetZoom =
        this.superFlashTimer > 0 ? Math.max(this.critTargetZoom, 1.18) : this.critTargetZoom;
      targetX = this.critFocusX;
      targetY = this.critFocusY;
    } else if (this.p1.state === 'stagger' || this.p2.state === 'stagger') {
      const staggered = this.p1.state === 'stagger' ? this.p1 : this.p2;
      targetZoom = 1.15;
      targetX = (staggered.x + (this.p1.x + this.p2.x) * 0.5) * 0.5;
      targetY = GROUND_Y - 180;
    } else if (this.clinchDwell >= 0.12) {
      targetZoom = 1.12;
      targetX = (this.p1.x + this.p2.x) * 0.5;
      targetY = GROUND_Y - 185 + (this.p1.y + this.p2.y) * 0.25;
    }

    const clampedX = Math.max(155, Math.min(STAGE_WIDTH - 155, targetX));
    const clampedY = Math.max(GROUND_Y - 260, Math.min(GROUND_Y - 135, targetY));

    const zoomRate = targetZoom > this.cameraZoom ? 10.5 : 5.2;
    this.cameraZoom += (targetZoom - this.cameraZoom) * Math.min(1, dt * zoomRate);
    this.cameraFocusX += (clampedX - this.cameraFocusX) * Math.min(1, dt * 8.5);
    this.cameraFocusY += (clampedY - this.cameraFocusY) * Math.min(1, dt * 8.5);
  }

  private showCallout(text: string): void {
    this.calloutText = text;
    this.calloutTimer = 0.85;
  }

  private triggerHaptic(kind: HapticEventKind, target: 'p1' | 'p2' | 'both' = 'p1'): void {
    if (this.replayPlayback) return;
    this.hapticSeq += 1;
    const evt: HapticFeedbackEvent = { id: this.hapticSeq, kind };
    if (target === 'p1' || target === 'both') {
      this.lastHapticEvent = evt;
    }
    if (target === 'p2' || target === 'both') {
      this.guestHapticPending = evt;
    }
  }

  private updateMusicMood(): void {
    const minHp = Math.min(this.p1.hp, this.p2.hp);
    if (this.roundNumber >= 3 || minHp <= 30) {
      soundEngine.setMusicIntensity('final');
    } else if (minHp <= 62 || this.p1.comboCount >= 3) {
      soundEngine.setMusicIntensity('intense');
    } else {
      soundEngine.setMusicIntensity('normal');
    }
  }

  private recordReplayTick(): void {
    if (this.replayPlayback || this.mode === 'dojo' || this.mode === 'online') return;
    if (this.recordedFrames.length >= 2400) return;

    const p1Snap = { ...this.inputRef.current };
    const changed = !this.lastRecordedP1 || inputsDiffer(p1Snap, this.lastRecordedP1);
    const intervalElapsed = this.matchElapsed - this.lastRecordedAt >= 0.08;
    if (changed || intervalElapsed) {
      this.recordedFrames.push({
        t: Number(this.matchElapsed.toFixed(3)),
        p1: p1Snap,
      });
      this.lastRecordedP1 = p1Snap;
      this.lastRecordedAt = this.matchElapsed;
    }
  }

  private pullReplayInput(): void {
    if (!this.replayPlayback) return;
    const frames = this.replayPlayback.frames;
    while (
      this.replayCursor < frames.length &&
      frames[this.replayCursor].t <= this.matchElapsed
    ) {
      this.inputRef.current = { ...frames[this.replayCursor].p1 };
      this.replayCursor += 1;
    }
  }

  private swapWithPartner(actor: FighterActor, slot: 'p1' | 'p2'): boolean {
    if (!actor.bench || actor.bench.hp <= 0) return false;
    const incoming = actor.bench;
    const outgoing: PartnerSlot = {
      profile: actor.profile,
      assets: actor.assets,
      hp: actor.hp,
      maxHp: actor.maxHp,
      fury: actor.fury,
      guardPosture: actor.guardPosture,
    };

    actor.profile = incoming.profile;
    actor.assets = incoming.assets;
    actor.hp = incoming.hp;
    actor.maxHp = incoming.maxHp;
    actor.fury = Math.max(actor.fury * 0.5, incoming.fury);
    actor.guardPosture = incoming.guardPosture;
    actor.bench = outgoing;
    actor.state = 'idle';
    actor.stateTimer = 0;
    actor.vx = actor.facing * 240;

    soundEngine.playTagSwap();
    this.triggerHaptic('tag_swap', slot);
    this.showCallout(`TAG IN · ${actor.profile.name.split(' ')[0].toUpperCase()}!`);
    this.rings.push({
      x: actor.x,
      y: GROUND_Y - 160,
      radius: 14,
      maxRadius: 110,
      life: 0,
      maxLife: 0.25,
      color: actor.profile.appearance.accentHex,
    });
    return true;
  }

  private update(dt: number): void {
    this.matchElapsed += dt;

    if (this.shakeMagnitude > 0) {
      this.shakeMagnitude = Math.max(0, this.shakeMagnitude - dt * 36);
    }
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.calloutText = null;
    }
    if (this.ropeFlashTimer > 0) {
      this.ropeFlashTimer -= dt;
      if (this.ropeFlashTimer <= 0) this.ropeFlashSide = null;
    }
    if (this.tagCooldown > 0) {
      this.tagCooldown = Math.max(0, this.tagCooldown - dt);
    }

    this.updateCamera(dt);

    // Super Flash Freeze (dark spotlight pause before Fury special strikes)
    if (this.superFlashTimer > 0) {
      this.superFlashTimer -= dt;
      if (this.superFlashTimer <= 0) this.superFlashLabel = null;
      return;
    }

    // Slow-Motion KO Kill-Cam scaling
    let simDt = dt;
    if (this.koSlowMoTimer > 0) {
      this.koSlowMoTimer = Math.max(0, this.koSlowMoTimer - dt);
      simDt = dt * 0.26;
    }

    this.updateParticles(simDt);

    if (this.mode === 'online' && this.onlineRole === 'p2') {
      this.networkThrottle += dt;
      if (this.networkThrottle >= 0.033) {
        this.networkThrottle = 0;
        this.onSendInput?.({ ...this.inputRef.current });
      }
      this.emitHudThrottled(dt);
      return;
    }

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    if (this.phase === 'intro') {
      this.phaseTimer -= dt;
      this.advanceIdle(this.p1, dt);
      this.advanceIdle(this.p2, dt);
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        soundEngine.playBell();
      }
      this.emitHudThrottled(dt);
      this.broadcastOnlineState(dt);
      return;
    }

    if (this.phase === 'round_end') {
      this.phaseTimer -= simDt;
      this.advanceActorPhysics(this.p1, simDt);
      this.advanceActorPhysics(this.p2, simDt);
      if (this.phaseTimer <= 0) {
        const isSingleRoundMode =
          this.mode === 'survival' || this.mode === 'tag' || this.mode === 'tournament';
        const isDrawAtEnd =
          this.p1Rounds === this.p2Rounds && (isSingleRoundMode || this.roundNumber >= 3);

        if (isDrawAtEnd && !this.isSuddenDeath) {
          this.roundNumber += 1;
          this.resetRound(true);
        } else if (
          isSingleRoundMode ||
          this.isSuddenDeath ||
          this.p1Rounds >= 2 ||
          this.p2Rounds >= 2 ||
          this.roundNumber >= 3
        ) {
          this.phase = 'match_end';
          this.stats.durationSeconds = Math.max(
            1,
            Math.round((performance.now() - this.matchStartTime) / 1000)
          );
          if (this.p1Rounds > this.p2Rounds) {
            this.victoryQuote = getVictoryQuote(this.p1.profile.id);
          } else if (this.p2Rounds > this.p1Rounds) {
            this.victoryQuote = getVictoryQuote(this.p2.profile.id);
          }
          soundEngine.playVictoryFanfare();
          soundEngine.stopMusic();
        } else {
          this.roundNumber++;
          this.resetRound(false);
        }
        this.emitHud();
      }
      this.broadcastOnlineState(dt);
      return;
    }

    if (this.phase === 'match_end') {
      this.advanceActorPhysics(this.p1, simDt);
      this.advanceActorPhysics(this.p2, simDt);
      this.emitHudThrottled(dt);
      this.broadcastOnlineState(dt);
      return;
    }

    // Active fight updates
    this.updateMusicMood();
    if (this.replayPlayback) {
      this.pullReplayInput();
    } else {
      this.recordReplayTick();
    }

    if (this.mode !== 'dojo') {
      this.roundTimer = Math.max(0, this.roundTimer - simDt);
    } else {
      for (const actor of [this.p1, this.p2]) {
        if (actor.state !== 'hit' && actor.state !== 'stagger' && actor.hp < 100) {
          actor.regenIdleTimer += simDt;
          if (actor.regenIdleTimer > 1.6) {
            actor.hp = Math.min(100, actor.hp + 40 * simDt);
          }
        } else {
          actor.regenIdleTimer = 0;
        }
        actor.fury = Math.min(100, actor.fury + 18 * simDt);
      }
    }

    // Benched Tag Partner slow red-health recovery (up to +25 HP cap or 100)
    for (const actor of [this.p1, this.p2]) {
      if (actor.bench && actor.bench.hp > 0 && actor.bench.hp < 100) {
        actor.bench.hp = Math.min(100, actor.bench.hp + 2.8 * simDt);
        actor.bench.guardPosture = Math.min(100, actor.bench.guardPosture + 14 * simDt);
      }
    }

    if (this.isNeutralState(this.p1.state)) {
      this.p1.facing = this.p2.x >= this.p1.x ? 1 : -1;
    }
    if (this.isNeutralState(this.p2.state)) {
      this.p2.facing = this.p1.x >= this.p2.x ? 1 : -1;
    }

    this.handlePlayerInput(this.p1, this.inputRef.current, this.p1PrevCounts, simDt, 'p1');

    if (this.mode === 'online' && this.onlineRole === 'p1') {
      this.handlePlayerInput(this.p2, this.remoteInput, this.p2PrevCounts, simDt, 'p2');
    } else {
      this.handleOpponentAI(simDt);
    }

    this.advanceActorPhysics(this.p1, simDt);
    this.advanceActorPhysics(this.p2, simDt);
    this.updateProjectiles(simDt);

    // Pushbox separation
    const minSep = 96;
    const dx = this.p2.x - this.p1.x;
    if (Math.abs(dx) < minSep && Math.abs(this.p1.y - this.p2.y) < 110) {
      const push = (minSep - Math.abs(dx)) * 0.5;
      const sign = dx >= 0 ? 1 : -1;
      this.p1.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p1.x - sign * push));
      this.p2.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p2.x + sign * push));
    }

    this.resolveAttackHit(this.p1, this.p2, 'p1');
    this.resolveAttackHit(this.p2, this.p1, 'p2');

    // Auto-Tag swap when active fighter drops to 0 HP and partner is still standing
    if (this.mode === 'tag') {
      if (this.p1.hp <= 0 && this.p1.bench && this.p1.bench.hp > 0) {
        this.swapWithPartner(this.p1, 'p1');
      }
      if (this.p2.hp <= 0 && this.p2.bench && this.p2.bench.hp > 0) {
        this.swapWithPartner(this.p2, 'p2');
      }
    }

    if (this.mode !== 'dojo' && (this.p1.hp <= 0 || this.p2.hp <= 0 || this.roundTimer <= 0)) {
      this.finishRound();
    }

    this.emitHudThrottled(dt);
    this.broadcastOnlineState(dt);
  }

  private broadcastOnlineState(dt: number): void {
    if (this.mode !== 'online' || this.onlineRole !== 'p1' || !this.onSendState) return;
    this.networkThrottle += dt;
    if (this.networkThrottle < 0.033) return;
    this.networkThrottle = 0;

    const pack = (a: FighterActor) => ({
      x: a.x,
      y: a.y,
      vx: a.vx,
      vy: a.vy,
      facing: a.facing,
      hp: a.hp,
      fury: a.fury,
      posture: a.guardPosture,
      state: a.state,
      animFrame: a.animFrame,
      comboCount: a.comboCount,
      comboDamage: a.comboDamage,
      maxCombo: a.maxCombo,
    });

    this.onSendState({
      p1: pack(this.p1),
      p2: pack(this.p2),
      p1Rounds: this.p1Rounds,
      p2Rounds: this.p2Rounds,
      roundNumber: this.roundNumber,
      roundTimer: this.roundTimer,
      phase: this.phase,
      calloutText: this.calloutText,
      projectiles: this.projectiles.map((p) => ({
        x: p.x,
        y: p.y,
        vx: p.vx,
        ownerSlot: p.ownerSlot,
        color: p.color,
        radius: p.radius,
      })),
      hapticForGuest: this.guestHapticPending,
    });
    this.guestHapticPending = null;
  }

  private isNeutralState(s: FighterActionState): boolean {
    return s === 'idle' || s === 'walk' || s === 'run' || s === 'guard';
  }

  private isAttackState(s: FighterActionState): boolean {
    return (
      s === 'jab' ||
      s === 'cross' ||
      s === 'special' ||
      s === 'projectile' ||
      s === 'launcher' ||
      s === 'air_kick' ||
      s === 'springboard' ||
      s === 'clinch_throw'
    );
  }

  private advanceDojoTrial(move: TrialStepMove, slot: 'p1' | 'p2'): void {
    if (this.mode !== 'dojo' || slot !== 'p1') return;
    const trials = getTrialsForFighter(this.p1.profile.id);
    const activeTrial = trials[this.dojoTrialIndex % trials.length];
    if (!activeTrial) return;

    const expected = activeTrial.steps[this.dojoTrialStep];
    if (expected && expected.move === move) {
      this.dojoTrialStep += 1;
      if (this.dojoTrialStep >= activeTrial.steps.length) {
        this.showCallout(`TRIAL CLEARED · ${activeTrial.title.toUpperCase()}!`);
        soundEngine.playVictoryFanfare();
        this.rings.push({
          x: this.p1.x,
          y: GROUND_Y - 190,
          radius: 16,
          maxRadius: 170,
          life: 0,
          maxLife: 0.35,
          color: '#facc15',
        });
        this.onTrialComplete?.(activeTrial.id, this.p1.profile.id);
        this.dojoTrialStep = 0;
      }
    } else if (activeTrial.steps[0]?.move === move) {
      this.dojoTrialStep = 1;
    } else {
      this.dojoTrialStep = 0;
    }
  }

  private resolveThrowTech(defender: FighterActor, attacker: FighterActor): void {
    attacker.state = 'hit';
    attacker.stateTimer = 0.08;
    attacker.clinchHoldTimer = 0;
    defender.state = 'hit';
    defender.stateTimer = 0.08;
    defender.throwTechWindow = 0;

    const sign = attacker.x <= defender.x ? -1 : 1;
    attacker.vx = sign * 260;
    defender.vx = -sign * 260;

    const midX = (attacker.x + defender.x) * 0.5;
    const midY = GROUND_Y - 175;
    soundEngine.playParry();
    this.triggerHaptic('throw_tech', 'both');
    this.triggerCriticalCamera(midX, midY, 1.18, 0.36);
    this.showCallout('THROW TECH!');
    this.rings.push({
      x: midX,
      y: midY,
      radius: 14,
      maxRadius: 130,
      life: 0,
      maxLife: 0.24,
      color: '#22d3ee',
    });
    this.spawnSparks(midX, midY, '#22d3ee', 14);
  }

  private triggerClinchGrapple(
    attacker: FighterActor,
    defender: FighterActor,
    slot: 'p1' | 'p2'
  ): void {
    attacker.facing = defender.x >= attacker.x ? 1 : -1;
    attacker.state = 'clinch_throw';
    attacker.stateTimer = 0;
    attacker.clinchHoldTimer = 0.24;
    attacker.hitConfirmed = true;
    attacker.vx = 0;

    defender.x = Math.max(STAGE_LEFT + 16, Math.min(STAGE_RIGHT - 16, attacker.x + attacker.facing * 72));
    defender.vx = 0;
    defender.vy = 0;
    defender.state = 'hit';
    defender.stateTimer = 0;
    defender.throwTechWindow = 0.24;

    soundEngine.playClinchLock();
    this.triggerHaptic('block', slot);
    this.triggerCriticalCamera((attacker.x + defender.x) * 0.5, GROUND_Y - 175, 1.18, 0.45);
    this.showCallout('CLINCH!');
  }

  private handlePlayerInput(
    actor: FighterActor,
    inp: TouchControlState,
    prev: {
      strike: number;
      power: number;
      dirSpecial: number;
      tag: number;
      grapple: number;
      strikeDown: boolean;
    },
    dt: number,
    slot: 'p1' | 'p2'
  ): void {
    const strikeTapped = inp.strikeTriggerCount !== prev.strike;
    const powerTapped = inp.powerTriggerCount !== prev.power;
    const dirSpecialTapped = inp.directionalSpecialCount !== prev.dirSpecial;
    const tagTapped = inp.tagTriggerCount !== prev.tag;
    const grappleTapped = inp.grappleTriggerCount !== prev.grapple;
    const strikeReleasedCharge = prev.strikeDown && !inp.strikeDown && inp.strikeChargeRatio >= 0.85;

    prev.strike = inp.strikeTriggerCount;
    prev.power = inp.powerTriggerCount;
    prev.dirSpecial = inp.directionalSpecialCount;
    prev.tag = inp.tagTriggerCount;
    prev.grapple = inp.grappleTriggerCount;
    prev.strikeDown = inp.strikeDown;

    const foe = slot === 'p1' ? this.p2 : this.p1;

    // Throw Tech Escape Window!
    if (actor.throwTechWindow > 0 && (strikeTapped || powerTapped || grappleTapped)) {
      this.resolveThrowTech(actor, foe);
      return;
    }

    if (actor.state === 'hit' || actor.state === 'ko' || actor.state === 'stagger' || actor.state === 'victory') return;

    const canAttack = this.isNeutralState(actor.state) || actor.state === 'jump';

    // Close-range Clinch Grapple (A+B in pocket range)
    const dist = Math.abs(foe.x - actor.x);
    if (
      grappleTapped &&
      canAttack &&
      actor.y >= 0 &&
      Math.abs(actor.y - foe.y) < 75 &&
      dist <= 136 &&
      foe.state !== 'ko'
    ) {
      this.triggerClinchGrapple(actor, foe, slot);
      return;
    }

    // Tag Swap (Mode === 'tag')
    if (tagTapped && this.mode === 'tag' && this.tagCooldown <= 0 && actor.y >= 0 && canAttack) {
      if (this.swapWithPartner(actor, slot)) {
        this.tagCooldown = 3.0;
        return;
      }
    }

    // Springboard Rope Rebound Attack near corner ropes!
    const nearLeftCorner = actor.x <= STAGE_LEFT + 44 && inp.moveX > 0.25;
    const nearRightCorner = actor.x >= STAGE_RIGHT - 44 && inp.moveX < -0.25;
    if (canAttack && (strikeTapped || powerTapped) && (nearLeftCorner || nearRightCorner)) {
      const corner: 'left' | 'right' = nearLeftCorner ? 'left' : 'right';
      const dir: 1 | -1 = nearLeftCorner ? 1 : -1;
      actor.facing = dir;
      actor.state = 'springboard';
      actor.stateTimer = 0;
      actor.hitConfirmed = false;
      actor.vy = -590;
      actor.vx = dir * 510;
      this.ropeFlashSide = corner;
      this.ropeFlashTimer = 0.35;
      this.spawnDustCloud(nearLeftCorner ? STAGE_LEFT : STAGE_RIGHT, GROUND_Y, 9);
      soundEngine.playSpringboard();
      this.triggerHaptic('rope_bounce', slot);
      this.showCallout('SPRINGBOARD!');
      if (slot === 'p1') {
        this.stats.springboards += 1;
      }
      return;
    }

    // Directional Special Input -> Ranged Energy Wave
    if (dirSpecialTapped && canAttack && actor.fury >= 30) {
      actor.fury -= 30;
      this.triggerProjectile(actor, slot);
      return;
    }

    // Airborne Dive Kick / Air Juggle Strike
    if (actor.y < -18 && (strikeTapped || powerTapped) && canAttack) {
      this.triggerAttack(actor, 'air_kick', slot);
      return;
    }

    if (strikeReleasedCharge && canAttack) {
      this.triggerAttack(actor, 'cross', slot);
      return;
    }

    if (powerTapped && canAttack) {
      if (actor.fury >= 50) {
        actor.fury -= 50;
        this.triggerAttack(actor, 'special', slot);
      } else {
        this.triggerAttack(actor, 'cross', slot);
      }
      return;
    }

    if (strikeTapped && canAttack) {
      // Holding Up or Down while tapping A triggers Uppercut Launcher!
      if (Math.abs(inp.moveY) > 0.45 && actor.y >= 0) {
        this.triggerAttack(actor, 'launcher', slot);
        return;
      }
      const nextStep = (actor.comboStep + 1) % 3;
      actor.comboStep = nextStep;
      this.triggerAttack(actor, nextStep === 2 ? 'cross' : 'jab', slot);
      return;
    }

    if (this.isAttackState(actor.state)) {
      return;
    }

    const holdingGuard = (inp.powerDown && inp.powerHoldMs > 180) || inp.moveY > 0.55;
    if (holdingGuard && actor.y >= 0) {
      if (actor.state !== 'guard') {
        actor.guardElapsed = 0;
      } else {
        actor.guardElapsed += dt;
      }
      actor.state = 'guard';
      actor.vx *= 0.72;
      actor.animFrame = 100;
      return;
    } else {
      actor.guardElapsed = 0;
    }

    if (inp.moveY < -0.58 && actor.y >= 0) {
      actor.state = 'jump';
      actor.vy = -790;
      actor.vx = inp.moveX * 290;
      if (slot === 'p1') this.stats.jumpsUsed += 1;
      this.spawnDustCloud(actor.x, GROUND_Y, 6);
      soundEngine.playJump();
      return;
    }

    if (actor.y < 0) {
      actor.vx = inp.moveX * 260;
      return;
    }

    const magX = Math.abs(inp.moveX);
    const speedFactor = 0.8 + actor.profile.stats.speed * 0.0045;
    if (magX > this.runThreshold) {
      actor.state = 'run';
      actor.vx = Math.sign(inp.moveX) * 345 * speedFactor;
      actor.footstepCooldown -= dt;
      if (actor.footstepCooldown <= 0) {
        soundEngine.playFootstep(true);
        this.spawnDustCloud(actor.x, GROUND_Y, 3);
        this.spawnMatMark(actor.x, GROUND_Y + 6, 18);
        actor.footstepCooldown = 0.24;
      }
    } else if (magX > 0.16) {
      actor.state = 'walk';
      actor.vx = Math.sign(inp.moveX) * 165 * speedFactor;
      actor.footstepCooldown -= dt;
      if (actor.footstepCooldown <= 0) {
        soundEngine.playFootstep(false);
        actor.footstepCooldown = 0.36;
      }
    } else {
      actor.state = 'idle';
      actor.vx *= 0.65;
    }
  }

  private handleOpponentAI(dt: number): void {
    const ai = this.p2;
    const foe = this.p1;
    if (ai.throwTechWindow > 0 && this.mode !== 'dojo' && this.rng() < 0.08) {
      this.resolveThrowTech(ai, foe);
      return;
    }
    if (ai.state === 'hit' || ai.state === 'ko' || ai.state === 'stagger' || ai.state === 'victory') return;
    if (this.isAttackState(ai.state)) return;

    if (this.mode === 'dojo') {
      if (this.dojoCpuMode === 'idle') {
        ai.state = 'idle';
        ai.vx *= 0.7;
        return;
      }
      if (this.dojoCpuMode === 'guard') {
        if (ai.state !== 'guard') ai.guardElapsed = 0.3;
        ai.state = 'guard';
        ai.vx *= 0.7;
        ai.animFrame = 100;
        return;
      }
      if (this.dojoCpuMode === 'counter') {
        if (this.isAttackState(foe.state) && Math.abs(foe.x - ai.x) < 180) {
          if (ai.state !== 'guard') ai.guardElapsed = 0;
          ai.guardElapsed += dt;
          ai.state = 'guard';
          ai.animFrame = 100;
          return;
        }
      }
    }

    // Tag partner AI swap when low HP
    if (this.mode === 'tag' && ai.hp < 28 && ai.bench && ai.bench.hp > 45 && this.rng() < 0.025) {
      this.swapWithPartner(ai, 'p2');
      return;
    }

    const dist = Math.abs(foe.x - ai.x);
    ai.aiThinkTimer -= dt;

    if (ai.aiThinkTimer <= 0) {
      ai.aiThinkTimer = 0.22 + this.rng() * 0.28;
      const foeAttacking = this.isAttackState(foe.state);

      if (foeAttacking && dist < 175 && this.rng() < 0.44) {
        ai.aiAction = 'guard';
      } else if (dist > 250 && ai.fury >= 30 && this.rng() < 0.28) {
        ai.fury -= 30;
        this.triggerProjectile(ai, 'p2');
        return;
      } else if (dist < 145) {
        const r = this.rng();
        if (dist <= 112 && r < 0.14) {
          this.triggerClinchGrapple(ai, foe, 'p2');
          return;
        } else if (ai.fury >= 50 && r < 0.3) {
          ai.fury -= 50;
          this.triggerAttack(ai, 'special', 'p2');
          return;
        } else if (r < 0.56) {
          this.triggerAttack(ai, 'jab', 'p2');
          return;
        } else if (r < 0.76) {
          this.triggerAttack(ai, 'cross', 'p2');
          return;
        } else if (r < 0.86) {
          this.triggerAttack(ai, 'launcher', 'p2');
          return;
        } else {
          ai.aiAction = 'retreat';
        }
      } else {
        ai.aiAction = this.rng() < 0.85 ? 'approach' : 'idle';
      }
    }

    const speedFactor = 0.75 + ai.profile.stats.speed * 0.004;
    if (ai.aiAction === 'guard') {
      if (ai.state !== 'guard') ai.guardElapsed = 0;
      else ai.guardElapsed += dt;
      ai.state = 'guard';
      ai.vx *= 0.7;
      ai.animFrame = 100;
    } else if (ai.aiAction === 'approach') {
      ai.guardElapsed = 0;
      const dir = foe.x > ai.x ? 1 : -1;
      if (dist > 260) {
        ai.state = 'run';
        ai.vx = dir * 290 * speedFactor;
      } else {
        ai.state = 'walk';
        ai.vx = dir * 150 * speedFactor;
      }
    } else if (ai.aiAction === 'retreat') {
      ai.guardElapsed = 0;
      const dir = foe.x > ai.x ? -1 : 1;
      ai.state = 'walk';
      ai.vx = dir * 135 * speedFactor;
    } else {
      ai.guardElapsed = 0;
      ai.state = 'idle';
      ai.vx *= 0.7;
    }
  }

  private triggerProjectile(actor: FighterActor, slot: 'p1' | 'p2'): void {
    actor.state = 'projectile';
    actor.stateTimer = 0;
    actor.hitConfirmed = true;
    const proj = actor.profile.frameData.projectile;
    this.projectiles.push({
      x: actor.x + actor.facing * 72,
      y: GROUND_Y + actor.y - 175,
      vx: actor.facing * proj.speed,
      ownerSlot: slot,
      color: proj.color,
      damage: proj.damage,
      radius: 26,
      life: 0,
    });
    soundEngine.playProjectile();
    if (slot === 'p1') {
      this.stats.specialsUsed += 1;
      this.showCallout(proj.name.toUpperCase());
    }
  }

  private triggerAttack(
    actor: FighterActor,
    kind: 'jab' | 'cross' | 'special' | 'launcher' | 'air_kick',
    slot: 'p1' | 'p2'
  ): void {
    actor.state = kind;
    actor.stateTimer = 0;
    actor.hitConfirmed = false;
    const spec = this.getAttackSpec(actor, kind);

    if (slot === 'p1') {
      const startupMs = Math.round(spec.startup * 1000);
      this.frameAdvantageLabel = `${kind.toUpperCase()} · ${startupMs}ms START · ${spec.damage} DMG`;
      if (kind === 'special') this.stats.specialsUsed += 1;
    }

    if (kind === 'special') {
      actor.vx = actor.facing * 260;
      if (actor.y >= 0) actor.vy = -340;
      this.superFlashTimer = 0.25;
      this.superFlashLabel = `${actor.profile.name.split(' ')[0].toUpperCase()} · ${actor.profile.signatureMove.toUpperCase()}`;
      this.triggerCriticalCamera(actor.x + actor.facing * 50, GROUND_Y + actor.y - 185, 1.18, 0.42);
      soundEngine.playSpecial();
    } else if (kind === 'launcher') {
      actor.vx = actor.facing * 125;
      soundEngine.playWhoosh(1.1);
    } else if (kind === 'air_kick') {
      actor.vx = actor.facing * 235;
      actor.vy = Math.max(actor.vy, 240);
      soundEngine.playWhoosh(1.3);
    } else if (kind === 'cross') {
      actor.vx = actor.facing * 145;
      soundEngine.playWhoosh(0.85);
    } else {
      actor.vx = actor.facing * 85;
      soundEngine.playWhoosh(1.25);
    }
  }

  private advanceIdle(actor: FighterActor, dt: number): void {
    actor.animFrame = (actor.animFrame + dt * 52) % FRAMES_PER_SHEET;
  }

  private advanceActorPhysics(actor: FighterActor, dt: number): void {
    if (actor.hitFlashTimer > 0) {
      actor.hitFlashTimer = Math.max(0, actor.hitFlashTimer - dt);
    }
    if (actor.throwTechWindow > 0) {
      actor.throwTechWindow = Math.max(0, actor.throwTechWindow - dt);
    }

    if (actor.comboDecayTimer > 0) {
      actor.comboDecayTimer -= dt;
      if (actor.comboDecayTimer <= 0) {
        actor.comboCount = 0;
        actor.comboDamage = 0;
        if (this.mode === 'dojo' && actor === this.p1) {
          this.dojoTrialStep = 0;
        }
      }
    }
    if (actor.counterWindowTimer > 0) {
      actor.counterWindowTimer = Math.max(0, actor.counterWindowTimer - dt);
    }
    if (actor.state !== 'guard' && actor.state !== 'stagger' && actor.guardPosture < 100) {
      actor.guardPosture = Math.min(100, actor.guardPosture + 12 * dt);
    }

    // Spawn afterimage motion trails during bursts
    if (
      actor.state === 'run' ||
      actor.state === 'special' ||
      actor.state === 'air_kick' ||
      actor.state === 'springboard' ||
      actor.state === 'launcher'
    ) {
      actor.afterimageTimer -= dt;
      if (actor.afterimageTimer <= 0) {
        actor.afterimageTimer = 0.045;
        const { sheet, frame } = this.getSheetAndFrame(actor);
        if (this.afterimages.length >= 18) this.afterimages.shift();
        this.afterimages.push({
          x: actor.x,
          y: actor.y,
          facing: actor.facing,
          sheet,
          frame,
          sheets: actor.assets.sheets,
          alpha: 0.55,
        });
      }
    }

    // Clinch Grapple execution after 240ms tech window expires!
    if (actor.state === 'clinch_throw') {
      actor.clinchHoldTimer -= dt;
      actor.stateTimer += dt;
      actor.animFrame = 62 + Math.min(20, Math.floor(actor.stateTimer * 70));
      if (actor.clinchHoldTimer <= 0) {
        const slot: 'p1' | 'p2' = actor === this.p1 ? 'p1' : 'p2';
        const defender = actor === this.p1 ? this.p2 : this.p1;
        const throwDmg = 19;
        defender.hp = Math.max(0, defender.hp - throwDmg);
        defender.state = defender.hp <= 0 ? 'ko' : 'hit';
        defender.stateTimer = 0;
        defender.throwTechWindow = 0;
        defender.hitFlashTimer = 0.07;
        defender.vy = -440;
        defender.vx = actor.facing * 305;

        actor.fury = Math.min(100, actor.fury + 16);
        actor.comboCount += 1;
        actor.comboDamage += throwDmg;
        if (actor.comboCount > actor.maxCombo) actor.maxCombo = actor.comboCount;
        actor.comboDecayTimer = 2.0;
        actor.state = 'idle';

        if (slot === 'p1') {
          this.stats.totalDamage += throwDmg;
          this.stats.hitsLanded += 1;
          this.stats.clinchThrows += 1;
          this.advanceDojoTrial('clinch_throw', 'p1');
        }

        const impactX = defender.x;
        const impactY = GROUND_Y - 120;
        soundEngine.playThrowSlam();
        this.triggerHaptic('heavy_hit', slot);
        this.triggerHaptic('take_heavy_damage', slot === 'p1' ? 'p2' : 'p1');
        this.triggerCriticalCamera(impactX, impactY, 1.2, 0.45);
        this.shakeMagnitude = 14;
        this.hitStopTimer = 0.09;
        this.showCallout('CLINCH SLAM!');
        this.spawnDustCloud(impactX, GROUND_Y, 12);
        this.spawnMatMark(impactX, GROUND_Y + 6, 36);
        this.spawnSparks(impactX, impactY, '#facc15', 14);
        this.emitHud();
      }
      return;
    }

    actor.x += actor.vx * dt;

    // Ring Rope Corner Bounce Hazard
    if (actor.x <= STAGE_LEFT) {
      actor.x = STAGE_LEFT;
      if ((actor.state === 'hit' || Math.abs(actor.vx) > 200) && actor.vx < -175) {
        actor.vx = Math.abs(actor.vx) * 0.68;
        this.ropeFlashSide = 'left';
        this.ropeFlashTimer = 0.25;
        soundEngine.playRopeBounce();
        this.triggerHaptic('rope_bounce', 'both');
        this.spawnDustCloud(STAGE_LEFT, GROUND_Y, 8);
        this.spawnSparks(STAGE_LEFT - 12, GROUND_Y - 190, '#facc15', 10);
        this.showCallout('ROPE BOUNCE!');
      } else {
        actor.vx = 0;
      }
    } else if (actor.x >= STAGE_RIGHT) {
      actor.x = STAGE_RIGHT;
      if ((actor.state === 'hit' || Math.abs(actor.vx) > 200) && actor.vx > 175) {
        actor.vx = -Math.abs(actor.vx) * 0.68;
        this.ropeFlashSide = 'right';
        this.ropeFlashTimer = 0.25;
        soundEngine.playRopeBounce();
        this.triggerHaptic('rope_bounce', 'both');
        this.spawnDustCloud(STAGE_RIGHT, GROUND_Y, 8);
        this.spawnSparks(STAGE_RIGHT + 12, GROUND_Y - 190, '#facc15', 10);
        this.showCallout('ROPE BOUNCE!');
      } else {
        actor.vx = 0;
      }
    }

    if (actor.y < 0 || actor.vy < 0) {
      actor.vy += 1950 * dt;
      actor.y += actor.vy * dt;
      if (actor.y >= 0) {
        actor.y = 0;
        actor.vy = 0;
        if (actor.state === 'jump' || actor.state === 'air_kick' || actor.state === 'springboard') {
          actor.state = 'idle';
        }
        soundEngine.playLand();
        this.spawnDustCloud(actor.x, GROUND_Y, 8);
        this.spawnMatMark(actor.x, GROUND_Y + 6, 22);
        this.spawnSparks(actor.x, GROUND_Y + 6, '#94a3b8', 5);
      }
    }

    if (actor.state === 'idle' || actor.state === 'jump') {
      actor.animFrame = (actor.animFrame + dt * 48) % FRAMES_PER_SHEET;
      actor.vx *= 0.82;
    } else if (actor.state === 'walk') {
      actor.animFrame = (actor.animFrame + dt * 60) % FRAMES_PER_SHEET;
    } else if (actor.state === 'run') {
      actor.animFrame = (actor.animFrame + dt * 84) % FRAMES_PER_SHEET;
    } else if (actor.state === 'jab') {
      const dur = actor.profile.frameData.jab.duration;
      actor.stateTimer += dt;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = Math.floor(p * 29);
      actor.vx *= 0.88;
      if (actor.stateTimer >= dur) actor.state = 'idle';
    } else if (actor.state === 'cross' || actor.state === 'projectile' || actor.state === 'air_kick') {
      const dur =
        actor.state === 'projectile'
          ? 0.34
          : actor.state === 'air_kick'
          ? 0.36
          : actor.profile.frameData.cross.duration;
      actor.stateTimer += dt;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 30 + Math.floor(p * 29);
      if (actor.y >= 0) actor.vx *= 0.9;
      if (actor.stateTimer >= dur) actor.state = actor.y < 0 ? 'jump' : 'idle';
    } else if (actor.state === 'special' || actor.state === 'launcher' || actor.state === 'springboard') {
      const dur =
        actor.state === 'launcher'
          ? 0.44
          : actor.state === 'springboard'
          ? 0.54
          : actor.profile.frameData.special.duration;
      actor.stateTimer += dt;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 60 + Math.floor(p * 35);
      if (actor.state !== 'springboard') actor.vx *= 0.92;
      if (actor.stateTimer >= dur) actor.state = actor.y < 0 ? 'jump' : 'idle';
    } else if (actor.state === 'stagger') {
      actor.staggerTimer -= dt;
      actor.animFrame = 108 + Math.floor((actor.staggerTimer * 18) % 10);
      actor.vx *= 0.82;
      if (actor.staggerTimer <= 0) {
        actor.state = 'idle';
        actor.guardPosture = 100;
      }
    } else if (actor.state === 'hit') {
      actor.stateTimer += dt;
      const dur = actor.y < 0 ? 0.45 : 0.28;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 108 + Math.floor(p * 11);
      if (actor.y >= 0) actor.vx *= 0.85;
      if (actor.stateTimer >= dur && actor.y >= 0) actor.state = 'idle';
    } else if (actor.state === 'victory') {
      actor.stateTimer += dt;
      actor.animFrame = 86 + Math.floor((Math.sin(actor.stateTimer * 5) * 0.5 + 0.5) * 8);
      actor.vx *= 0.75;
    } else if (actor.state === 'ko') {
      actor.animFrame = 119;
      actor.vx *= 0.84;
    }
  }

  private applyBlockedHit(
    attacker: FighterActor,
    defender: FighterActor,
    attackerSlot: 'p1' | 'p2',
    defenderSlot: 'p1' | 'p2',
    damage: number,
    knockback: number,
    impactX: number,
    impactY: number
  ): void {
    const postureDrain = Math.max(14, Math.round(damage * 1.65));
    defender.guardPosture = Math.max(0, defender.guardPosture - postureDrain);
    const chip = Math.max(1, Math.round(damage * 0.2));
    defender.hp = Math.max(0, defender.hp - chip);
    defender.vx = attacker.facing * knockback * 0.45;
    attacker.fury = Math.min(100, attacker.fury + 6);
    defender.fury = Math.min(100, defender.fury + 10);

    if (defenderSlot === 'p1') this.stats.blocks += 1;

    if (defender.guardPosture <= 0) {
      // GUARD BREAK!
      defender.state = 'stagger';
      defender.staggerTimer = 1.65;
      defender.counterWindowTimer = 1.65;
      soundEngine.playGuardBreak();
      this.triggerHaptic('guard_break', 'both');
      this.hitStopTimer = 0.14;
      this.shakeMagnitude = 12;
      this.triggerCriticalCamera(impactX, impactY, 1.22, 0.55);
      this.showCallout('GUARD BREAK!');
      if (attackerSlot === 'p1') {
        this.stats.guardBreaks += 1;
        this.frameAdvantageLabel = 'GUARD BREAK · STAGGERED!';
      }
      this.rings.push({
        x: impactX,
        y: impactY,
        radius: 14,
        maxRadius: 155,
        life: 0,
        maxLife: 0.28,
        color: '#f43f5e',
      });
      this.spawnSparks(impactX, impactY, '#f43f5e', 18);
    } else {
      soundEngine.playBlock();
      this.triggerHaptic('block', 'both');
      this.spawnSparks(impactX, impactY, '#38bdf8', 9);
      this.hitStopTimer = 0.03;
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.life += dt;

      const defender = p.ownerSlot === 'p1' ? this.p2 : this.p1;
      const attacker = p.ownerSlot === 'p1' ? this.p1 : this.p2;
      const defSlot = p.ownerSlot === 'p1' ? 'p2' : 'p1';

      if (Math.abs(p.x - defender.x) < 58 && Math.abs(p.y - (GROUND_Y + defender.y - 175)) < 95) {
        if (defender.state === 'guard' && defender.guardElapsed <= 0.19) {
          defender.fury = Math.min(100, defender.fury + 24);
          soundEngine.playParry();
          this.triggerHaptic('parry', defSlot);
          this.showCallout('PARRY WAVE!');
          if (defSlot === 'p1') this.stats.parries += 1;
          this.rings.push({
            x: p.x,
            y: p.y,
            radius: 16,
            maxRadius: 120,
            life: 0,
            maxLife: 0.22,
            color: '#22d3ee',
          });
        } else if (defender.state === 'guard') {
          this.applyBlockedHit(attacker, defender, p.ownerSlot, defSlot, p.damage, 280, p.x, p.y);
        } else {
          defender.hp = Math.max(0, defender.hp - p.damage);
          defender.state = defender.hp <= 0 ? 'ko' : 'hit';
          defender.stateTimer = 0;
          defender.hitFlashTimer = 0.065;
          defender.vx = Math.sign(p.vx) * 280;
          attacker.comboCount++;
          attacker.comboDamage += p.damage;
          attacker.comboDecayTimer = 1.8;
          if (attacker.comboCount > attacker.maxCombo) attacker.maxCombo = attacker.comboCount;
          if (p.ownerSlot === 'p1') {
            this.stats.totalDamage += p.damage;
            this.stats.hitsLanded += 1;
            this.advanceDojoTrial('projectile', 'p1');
            this.triggerHaptic('heavy_hit', 'p1');
          } else {
            this.triggerHaptic('take_heavy_damage', 'p1');
          }
          soundEngine.playHitHeavy();
          this.shakeMagnitude = 10;
          this.spawnSparks(p.x, p.y, p.color, 14);
        }
        this.projectiles.splice(i, 1);
        this.emitHud();
        continue;
      }

      if (p.x < 0 || p.x > STAGE_WIDTH || p.life > 1.8) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private resolveAttackHit(
    attacker: FighterActor,
    defender: FighterActor,
    attackerSlot: 'p1' | 'p2'
  ): void {
    if (attacker.hitConfirmed) return;
    if (defender.state === 'ko') return;
    if (
      attacker.state !== 'jab' &&
      attacker.state !== 'cross' &&
      attacker.state !== 'special' &&
      attacker.state !== 'launcher' &&
      attacker.state !== 'air_kick' &&
      attacker.state !== 'springboard'
    ) {
      return;
    }

    const spec = this.getAttackSpec(attacker, attacker.state);
    const reach = 128 + attacker.profile.stats.reach * 0.42 + spec.reachBonus;
    const hitStop =
      attacker.state === 'special'
        ? 0.12
        : attacker.state === 'cross' ||
          attacker.state === 'launcher' ||
          attacker.state === 'air_kick' ||
          attacker.state === 'springboard'
        ? 0.075
        : 0.045;

    if (attacker.stateTimer < spec.startup || attacker.stateTimer > spec.activeEnd) return;

    const dx = (defender.x - attacker.x) * attacker.facing;
    const dy = Math.abs(defender.y - attacker.y);
    if (dx < -25 || dx > reach || dy > 135) return;

    attacker.hitConfirmed = true;
    const defenderSlot = attackerSlot === 'p1' ? 'p2' : 'p1';
    const impactX = (attacker.x + defender.x) * 0.5;
    const impactY = GROUND_Y + defender.y - 175;

    // Perfect Parry check (within 190ms of pressing Guard)
    if (defender.state === 'guard' && defender.guardElapsed <= 0.19) {
      defender.fury = Math.min(100, defender.fury + 26);
      attacker.state = 'hit';
      attacker.stateTimer = 0;
      attacker.vx = -attacker.facing * 180;
      attacker.counterWindowTimer = 0.85;

      soundEngine.playParry();
      soundEngine.playCrowdCheer(0.45);
      this.triggerHaptic('parry', defenderSlot);
      this.hitStopTimer = 0.14;
      this.triggerCriticalCamera(impactX, impactY, 1.17, 0.36);
      this.showCallout('PERFECT PARRY!');
      if (defenderSlot === 'p1') {
        this.stats.parries += 1;
        this.frameAdvantageLabel = 'PARRY · +14F COUNTER WINDOW';
      }
      this.rings.push({
        x: impactX,
        y: impactY,
        radius: 18,
        maxRadius: 135,
        life: 0,
        maxLife: 0.25,
        color: '#22d3ee',
      });
      this.spawnSparks(impactX, impactY, '#22d3ee', 16);
      this.emitHud();
      return;
    }

    const isBlocked = defender.state === 'guard' && attacker.state !== 'special';
    if (isBlocked) {
      this.applyBlockedHit(
        attacker,
        defender,
        attackerSlot,
        defenderSlot,
        spec.damage,
        spec.knockback,
        impactX,
        impactY
      );
    } else {
      const wasAirborne = defender.y < -16;
      const isCounter =
        defender.counterWindowTimer > 0 ||
        defender.state === 'stagger' ||
        this.isAttackState(defender.state);
      const isCritRoll =
        !isCounter &&
        (attacker.state === 'cross' ||
          attacker.state === 'air_kick' ||
          attacker.state === 'springboard') &&
        this.rng() < 0.22;
      const isCriticalHit =
        isCounter ||
        isCritRoll ||
        attacker.state === 'special' ||
        attacker.state === 'launcher' ||
        attacker.state === 'springboard';
      const dmg = Math.round(spec.damage * (isCounter ? 1.35 : isCritRoll ? 1.25 : 1));
      defender.hp = Math.max(0, defender.hp - dmg);
      defender.state = defender.hp <= 0 ? 'ko' : 'hit';
      defender.stateTimer = 0;
      defender.staggerTimer = 0;
      defender.counterWindowTimer = 0;
      defender.hitFlashTimer = 0.07;
      defender.vx = attacker.facing * spec.knockback;

      if (attacker.state === 'launcher') {
        defender.vy = -790;
        defender.vx = attacker.facing * 130;
        this.showCallout('LAUNCHER!');
      } else if (attacker.state === 'air_kick') {
        defender.vy = wasAirborne ? -360 : -140;
        this.showCallout(wasAirborne ? 'AIR JUGGLE!' : 'DIVE KICK!');
      } else if (attacker.state === 'springboard') {
        defender.vy = -380;
        this.showCallout('SPRINGBOARD HIT!');
      } else if (attacker.state === 'special') {
        defender.vy = -260;
      } else if (wasAirborne) {
        defender.vy = -340;
        this.showCallout('AIR JUGGLE!');
      }

      attacker.fury = Math.min(100, attacker.fury + 14);
      defender.fury = Math.min(100, defender.fury + 9);
      attacker.comboCount++;
      attacker.comboDamage += dmg;
      if (attacker.comboCount > attacker.maxCombo) {
        attacker.maxCombo = attacker.comboCount;
      }
      attacker.comboDecayTimer = 2.0;

      if (attackerSlot === 'p1') {
        this.stats.totalDamage += dmg;
        this.stats.hitsLanded += 1;
        if (wasAirborne) this.stats.airJuggleHits += 1;
        if (
          attacker.state === 'jab' ||
          attacker.state === 'cross' ||
          attacker.state === 'launcher' ||
          attacker.state === 'air_kick' ||
          attacker.state === 'special' ||
          attacker.state === 'springboard'
        ) {
          this.advanceDojoTrial(attacker.state, 'p1');
        }
      }

      if (isCounter) {
        this.showCallout('COUNTER +35%!');
      } else if (isCritRoll) {
        this.showCallout('CRITICAL HIT!');
      }
      if (isCriticalHit) {
        this.triggerCriticalCamera(
          impactX,
          impactY,
          attacker.state === 'special' ? 1.24 : isCounter || isCritRoll ? 1.21 : 1.16,
          attacker.state === 'special' ? 0.52 : 0.42
        );
      }
      if (attacker.comboCount === 4) {
        soundEngine.playCrowdCheer(0.6);
      }

      if (attackerSlot === 'p1') {
        if (attacker.state === 'special' || isCritRoll) this.triggerHaptic('special_hit', 'p1');
        else if (attacker.state === 'cross' || attacker.state === 'launcher')
          this.triggerHaptic('heavy_hit', 'p1');
        else this.triggerHaptic('light_hit', 'p1');

        this.triggerHaptic(
          attacker.state === 'jab' ? 'take_damage' : 'take_heavy_damage',
          'p2'
        );
      } else {
        this.triggerHaptic(
          attacker.state === 'jab' ? 'take_damage' : 'take_heavy_damage',
          'p1'
        );
      }

      if (attacker.state === 'jab') soundEngine.playHitLight();
      else soundEngine.playHitHeavy();

      this.shakeMagnitude =
        attacker.state === 'special'
          ? 16
          : isCriticalHit
          ? 11
          : attacker.state === 'cross' || attacker.state === 'launcher'
          ? 9
          : 4;
      this.hitStopTimer = isCritRoll ? Math.max(hitStop, 0.095) : hitStop;
      this.spawnSparks(
        impactX,
        impactY,
        isCounter ? '#22d3ee' : isCritRoll || attacker.state === 'special' ? '#facc15' : '#ef4444',
        attacker.state === 'special' || isCritRoll ? 18 : 11
      );
      if (attacker.state !== 'jab') {
        this.rings.push({
          x: impactX,
          y: impactY,
          radius: 12,
          maxRadius: attacker.state === 'special' ? 150 : 88,
          life: 0,
          maxLife: 0.24,
          color: isCounter ? '#22d3ee' : attacker.profile.appearance.accentHex,
        });
      }
    }
    this.emitHud();
  }

  private finishRound(): void {
    this.phase = 'round_end';
    this.phaseTimer = 2.1;

    if (this.p1.hp <= 0 || this.p2.hp <= 0) {
      this.koSlowMoTimer = 0.85;
      this.spawnDustCloud(this.p1.hp <= 0 ? this.p1.x : this.p2.x, GROUND_Y, 14);
      this.spawnMatMark(this.p1.hp <= 0 ? this.p1.x : this.p2.x, GROUND_Y + 6, 40);
    }

    if (this.p1.hp <= 0 && this.p2.hp <= 0) {
      // Double KO -> allow Sudden Death check on round_end finish
    } else if (this.p2.hp <= 0 || (this.roundTimer <= 0 && this.p1.hp > this.p2.hp)) {
      this.p1Rounds++;
      this.p2.state = this.p2.hp <= 0 ? 'ko' : 'idle';
      this.p1.state = 'victory';
      this.p1.stateTimer = 0;
    } else if (this.p1.hp <= 0 || (this.roundTimer <= 0 && this.p2.hp > this.p1.hp)) {
      this.p2Rounds++;
      this.p1.state = this.p1.hp <= 0 ? 'ko' : 'idle';
      this.p2.state = 'victory';
      this.p2.stateTimer = 0;
    }
    soundEngine.playKO();
    this.triggerHaptic('ko', 'both');
    this.emitHud();
  }

  private spawnSparks(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = this.rng() * Math.PI * 2;
      const spd = 120 + this.rng() * 340;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 60,
        life: 0,
        maxLife: 0.22 + this.rng() * 0.16,
        color,
        size: 4 + this.rng() * 5,
      });
    }
  }

  private spawnDustCloud(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.dustClouds.length >= 28) this.dustClouds.shift();
      this.dustClouds.push({
        x: x + (this.rng() - 0.5) * 44,
        y: y + (this.rng() - 0.5) * 8,
        vx: (this.rng() - 0.5) * 110,
        vy: -25 - this.rng() * 55,
        radius: 6 + this.rng() * 6,
        maxRadius: 20 + this.rng() * 14,
        life: 0,
        maxLife: 0.35 + this.rng() * 0.25,
      });
    }
  }

  private spawnMatMark(x: number, y: number, width: number): void {
    if (this.matMarks.length >= 30) this.matMarks.shift();
    this.matMarks.push({
      x: x - width * 0.5,
      y,
      w: width,
      h: 4 + this.rng() * 3,
      life: 0,
      maxLife: 4.2,
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 650 * dt;
      if (s.life >= s.maxLife) this.sparks.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      r.radius = (r.life / r.maxLife) * r.maxRadius;
      if (r.life >= r.maxLife) this.rings.splice(i, 1);
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.alpha -= dt * 2.6;
      if (a.alpha <= 0) this.afterimages.splice(i, 1);
    }
    for (let i = this.dustClouds.length - 1; i >= 0; i--) {
      const d = this.dustClouds[i];
      d.life += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.radius = 6 + (d.life / d.maxLife) * d.maxRadius;
      if (d.life >= d.maxLife) this.dustClouds.splice(i, 1);
    }
    for (let i = this.matMarks.length - 1; i >= 0; i--) {
      const m = this.matMarks[i];
      m.life += dt;
      if (m.life >= m.maxLife) this.matMarks.splice(i, 1);
    }
  }

  private getSheetAndFrame(actor: FighterActor): {
    sheet: AnimSheetKey;
    frame: number;
  } {
    if (actor.state === 'walk') {
      return { sheet: 'walk', frame: Math.floor(actor.animFrame) % FRAMES_PER_SHEET };
    }
    if (actor.state === 'run') {
      return { sheet: 'run', frame: Math.floor(actor.animFrame) % FRAMES_PER_SHEET };
    }
    if (
      this.isAttackState(actor.state) ||
      actor.state === 'guard' ||
      actor.state === 'hit' ||
      actor.state === 'stagger' ||
      actor.state === 'victory' ||
      actor.state === 'ko'
    ) {
      return {
        sheet: 'attack',
        frame: Math.max(0, Math.min(FRAMES_PER_SHEET - 1, Math.floor(actor.animFrame))),
      };
    }
    return { sheet: 'idle', frame: Math.floor(actor.animFrame) % FRAMES_PER_SHEET };
  }

  private drawActor(actor: FighterActor): void {
    const { sheet, frame } = this.getSheetAndFrame(actor);
    const img = actor.assets.sheets[sheet];
    const col = frame % SHEET_COLS;
    const row = Math.floor(frame / SHEET_COLS);
    const sx = col * STILL_W;
    const sy = row * STILL_H;

    const shadowScale = Math.max(0.45, 1 + actor.y / 420);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    this.ctx.beginPath();
    this.ctx.ellipse(actor.x, GROUND_Y + 4, 72 * shadowScale, 18 * shadowScale, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.save();
    const drawY = GROUND_Y + actor.y - DRAW_H + 34;
    this.ctx.translate(actor.x, drawY + DRAW_H * 0.5);
    this.ctx.scale(actor.facing, 1);
    if (actor.state === 'ko') {
      this.ctx.rotate(-Math.PI * 0.42);
      this.ctx.translate(-35, 65);
    } else if (actor.state === 'stagger') {
      this.ctx.rotate(Math.sin(this.matchElapsed * 22) * 0.08);
    } else if (actor.state === 'air_kick' || actor.state === 'springboard') {
      this.ctx.rotate(actor.state === 'springboard' ? 0.34 : 0.24);
    }

    if (actor.state === 'guard') {
      this.ctx.shadowColor = actor.guardElapsed <= 0.19 ? '#22d3ee' : '#38bdf8';
      this.ctx.shadowBlur = actor.guardElapsed <= 0.19 ? 24 : 14;
    } else if (actor.state === 'stagger') {
      this.ctx.shadowColor = '#f43f5e';
      this.ctx.shadowBlur = 22;
    } else if (
      actor.state === 'special' ||
      actor.state === 'projectile' ||
      actor.state === 'launcher' ||
      actor.state === 'springboard' ||
      actor.state === 'victory'
    ) {
      this.ctx.shadowColor = actor.profile.appearance.accentHex;
      this.ctx.shadowBlur = 22;
    }

    this.ctx.drawImage(
      img,
      sx,
      sy,
      STILL_W,
      STILL_H,
      -DRAW_W * 0.5,
      -DRAW_H * 0.5,
      DRAW_W,
      DRAW_H
    );

    if (actor.hitFlashTimer > 0) {
      this.ctx.globalCompositeOperation = 'lighter';
      this.ctx.globalAlpha = 0.72;
      this.ctx.drawImage(
        img,
        sx,
        sy,
        STILL_W,
        STILL_H,
        -DRAW_W * 0.5,
        -DRAW_H * 0.5,
        DRAW_W,
        DRAW_H
      );
    }
    this.ctx.restore();

    if (this.showHitboxes) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)';
      this.ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(actor.x - 46, GROUND_Y + actor.y - 290, 92, 275);
      this.ctx.strokeRect(actor.x - 46, GROUND_Y + actor.y - 290, 92, 275);

      if (
        actor.state === 'jab' ||
        actor.state === 'cross' ||
        actor.state === 'special' ||
        actor.state === 'launcher' ||
        actor.state === 'air_kick' ||
        actor.state === 'springboard'
      ) {
        const spec = this.getAttackSpec(actor, actor.state);
        const isActive = actor.stateTimer >= spec.startup && actor.stateTimer <= spec.activeEnd;
        const reach = 128 + actor.profile.stats.reach * 0.42 + spec.reachBonus;
        const hx = actor.facing === 1 ? actor.x + 10 : actor.x - reach;
        this.ctx.strokeStyle = isActive ? '#ef4444' : '#f59e0b';
        this.ctx.fillStyle = isActive ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.14)';
        this.ctx.fillRect(hx, GROUND_Y + actor.y - 235, reach - 10, 120);
        this.ctx.strokeRect(hx, GROUND_Y + actor.y - 235, reach - 10, 120);
      }
      this.ctx.restore();
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();

    if (this.cameraZoom > 1.003) {
      ctx.translate(this.cameraFocusX, this.cameraFocusY);
      ctx.scale(this.cameraZoom, this.cameraZoom);
      ctx.translate(-this.cameraFocusX, -this.cameraFocusY);
    }

    if (this.shakeMagnitude > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeMagnitude;
      const sy = (Math.random() - 0.5) * this.shakeMagnitude;
      ctx.translate(sx, sy);
    }

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, STAGE_WIDTH, 1440);
    ctx.drawImage(this.backdrop, 0, 0, STAGE_WIDTH, 900);

    this.drawArenaLightingOverlay('backdrop');

    // Fading chalk footprints & scuff marks on ring mat
    for (const m of this.matMarks) {
      const alpha = Math.max(0, 1 - m.life / m.maxLife) * 0.24;
      ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(3)})`;
      ctx.fillRect(m.x, m.y, m.w, m.h);
    }

    for (const side of ['left', 'right'] as const) {
      const px = side === 'left' ? 18 : STAGE_WIDTH - 18;
      const lit = this.ropeFlashSide === side;
      ctx.save();
      ctx.strokeStyle = lit ? '#facc15' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = lit ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(px, 490);
      ctx.lineTo(px, 825);
      ctx.stroke();
      ctx.restore();
    }

    // Motion Afterimage Trails
    for (const a of this.afterimages) {
      const col = a.frame % SHEET_COLS;
      const row = Math.floor(a.frame / SHEET_COLS);
      const drawY = GROUND_Y + a.y - DRAW_H + 34;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a.alpha * 0.42);
      ctx.translate(a.x, drawY + DRAW_H * 0.5);
      ctx.scale(a.facing, 1);
      ctx.drawImage(
        a.sheets[a.sheet],
        col * STILL_W,
        row * STILL_H,
        STILL_W,
        STILL_H,
        -DRAW_W * 0.5,
        -DRAW_H * 0.5,
        DRAW_W,
        DRAW_H
      );
      ctx.restore();
    }

    if (this.isAttackState(this.p1.state)) {
      this.drawActor(this.p2);
      this.drawActor(this.p1);
    } else {
      this.drawActor(this.p1);
      this.drawActor(this.p2);
    }

    // Mat Dust Clouds
    for (const d of this.dustClouds) {
      const alpha = Math.max(0, 1 - d.life / d.maxLife) * 0.34;
      ctx.save();
      ctx.fillStyle = `rgba(203, 213, 225, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Super Flash Freeze Spotlight Overlay
    if (this.superFlashTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 7, 16, 0.72)';
      ctx.fillRect(0, 0, STAGE_WIDTH, 960);
      if (this.superFlashLabel) {
        ctx.fillStyle = '#facc15';
        ctx.font = '800 38px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.superFlashLabel, STAGE_WIDTH * 0.5, 420);
      }
      ctx.restore();
    }

    for (const pr of this.projectiles) {
      ctx.save();
      ctx.fillStyle = pr.color;
      ctx.shadowColor = pr.color;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const r of this.rings) {
      const alpha = Math.max(0, 1 - r.life / r.maxLife);
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const s of this.sparks) {
      const alpha = Math.max(0, 1 - s.life / s.maxLife);
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x - s.size * 0.5, s.y - s.size * 0.5, s.size, s.size);
      ctx.restore();
    }

    this.drawArenaLightingOverlay('foreground');

    ctx.restore();
  }

  private drawArenaLightingOverlay(layer: 'backdrop' | 'foreground'): void {
    const ctx = this.ctx;
    const t = this.matchElapsed;
    const style = this.arenaProfile.lightingStyle;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, STAGE_WIDTH, 900);
    ctx.clip();

    if (style === 'industrial_flicker') {
      const buzz = Math.sin(t * 23.0) * 0.5 + 0.5;
      const stutter = Math.sin(t * 6.7) * Math.sin(t * 17.3);
      const dip = stutter > 0.78 ? 0.25 : stutter < -0.84 ? 0.42 : 1.0;
      const lampA = (0.72 + 0.28 * buzz) * dip;
      const lampB = 0.76 + 0.24 * Math.sin(t * 14.2 + 1.4);

      if (layer === 'backdrop') {
        ctx.globalCompositeOperation = 'screen';
        for (const [bx, targetX, strength, tint] of [
          [165, 250, lampA, '226, 232, 240'],
          [555, 470, lampB, '251, 191, 36'],
        ] as const) {
          const beam = ctx.createLinearGradient(bx, 0, targetX, 820);
          beam.addColorStop(0, `rgba(${tint}, ${(0.14 * strength).toFixed(3)})`);
          beam.addColorStop(0.65, `rgba(${tint}, ${(0.06 * strength).toFixed(3)})`);
          beam.addColorStop(1, `rgba(${tint}, 0)`);
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(bx - 30, 0);
          ctx.lineTo(bx + 30, 0);
          ctx.lineTo(targetX + 165, 860);
          ctx.lineTo(targetX - 165, 860);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Subtle electrical power dip & overhead specular wash
        if (dip < 1) {
          ctx.fillStyle = `rgba(6, 10, 18, ${(0.12 * (1 - dip)).toFixed(3)})`;
          ctx.fillRect(0, 0, STAGE_WIDTH, 900);
        }
        ctx.globalCompositeOperation = 'screen';
        const wash = ctx.createRadialGradient(
          360,
          120,
          40,
          360,
          460,
          560
        );
        wash.addColorStop(0, `rgba(186, 230, 253, ${(0.065 * lampA).toFixed(3)})`);
        wash.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, STAGE_WIDTH, 900);
      }
    } else if (style === 'shifting_sunlight') {
      const drift = Math.sin(t * 0.28);
      const sunPulse = 0.68 + 0.32 * Math.sin(t * 0.41 + 0.7);
      const shiftX = drift * 95;

      if (layer === 'backdrop') {
        ctx.globalCompositeOperation = 'screen';
        for (const [originX, widthTop, widthBot, alphaScale] of [
          [140 + shiftX * 0.5, 95, 255, 0.11],
          [430 + shiftX * 0.85, 70, 210, 0.08],
        ] as const) {
          const ray = ctx.createLinearGradient(originX, 0, originX + 150, 840);
          ray.addColorStop(0, `rgba(253, 230, 138, ${(alphaScale * sunPulse).toFixed(3)})`);
          ray.addColorStop(0.65, `rgba(251, 191, 36, ${(alphaScale * 0.45 * sunPulse).toFixed(3)})`);
          ray.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = ray;
          ctx.beginPath();
          ctx.moveTo(originX - widthTop * 0.5, 0);
          ctx.lineTo(originX + widthTop * 0.5, 0);
          ctx.lineTo(originX + 160 + widthBot * 0.5, 860);
          ctx.lineTo(originX + 160 - widthBot * 0.5, 860);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'screen';
        const sunWash = ctx.createLinearGradient(
          160 + shiftX,
          0,
          560 + shiftX * 0.4,
          860
        );
        sunWash.addColorStop(0, `rgba(254, 240, 138, ${(0.055 * sunPulse).toFixed(3)})`);
        sunWash.addColorStop(0.55, `rgba(245, 158, 11, ${(0.03 * sunPulse).toFixed(3)})`);
        sunWash.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = sunWash;
        ctx.fillRect(0, 0, STAGE_WIDTH, 900);
      }
    } else if (style === 'volcanic_ember') {
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.45 + Math.sin(t * 0.6) * 0.8);
      if (layer === 'backdrop') {
        ctx.globalCompositeOperation = 'screen';
        const magma = ctx.createLinearGradient(0, 890, 0, 440);
        magma.addColorStop(0, `rgba(249, 115, 22, ${(0.14 * pulse).toFixed(3)})`);
        magma.addColorStop(0.5, `rgba(234, 88, 12, ${(0.06 * pulse).toFixed(3)})`);
        magma.addColorStop(1, 'rgba(234, 88, 12, 0)');
        ctx.fillStyle = magma;
        ctx.fillRect(0, 440, STAGE_WIDTH, 460);

        // Drifting deterministic embers
        for (let i = 0; i < 8; i++) {
          const cycle = (t * (0.14 + (i % 3) * 0.04) + i * 0.17) % 1;
          const ex = ((i * 97 + 45) % 660) + Math.sin(t * 1.3 + i) * 26;
          const ey = 840 - cycle * 520;
          const alpha = Math.sin(cycle * Math.PI) * 0.35;
          ctx.fillStyle = `rgba(251, 146, 60, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 2.2 + (i % 2), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'screen';
        const heat = ctx.createRadialGradient(360, 840, 40, 360, 740, 520);
        heat.addColorStop(0, `rgba(251, 146, 60, ${(0.065 * pulse).toFixed(3)})`);
        heat.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = heat;
        ctx.fillRect(0, 0, STAGE_WIDTH, 900);
      }
    } else {
      // stadium_sweep
      const targetX1 = 360 + Math.sin(t * 0.65) * 225;
      const targetX2 = 360 + Math.cos(t * 0.52 + 1.1) * 225;
      if (layer === 'backdrop') {
        ctx.globalCompositeOperation = 'screen';
        for (const [ox, tx, rgb] of [
          [110, targetX1, '56, 189, 248'],
          [610, targetX2, '250, 204, 21'],
        ] as const) {
          const beam = ctx.createLinearGradient(ox, 0, tx, 840);
          beam.addColorStop(0, `rgba(${rgb}, 0.12)`);
          beam.addColorStop(0.7, `rgba(${rgb}, 0.045)`);
          beam.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(ox - 24, 0);
          ctx.lineTo(ox + 24, 0);
          ctx.lineTo(tx + 125, 860);
          ctx.lineTo(tx - 125, 860);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'screen';
        const pool1 = ctx.createRadialGradient(targetX1, 795, 10, targetX1, 795, 175);
        pool1.addColorStop(0, 'rgba(56, 189, 248, 0.075)');
        pool1.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = pool1;
        ctx.fillRect(0, 560, STAGE_WIDTH, 340);

        const pool2 = ctx.createRadialGradient(targetX2, 795, 10, targetX2, 795, 175);
        pool2.addColorStop(0, 'rgba(250, 204, 21, 0.065)');
        pool2.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = pool2;
        ctx.fillRect(0, 560, STAGE_WIDTH, 340);
      }
    }

    ctx.restore();
  }

  private emitHudThrottled(dt: number): void {
    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.05) {
      this.hudThrottle = 0;
      this.emitHud();
    }
  }

  private emitHud(): void {
    let bannerText: string | null = null;
    let bannerSubtext: string | null = null;

    if (this.phase === 'intro') {
      if (this.isSuddenDeath) {
        bannerText = 'SUDDEN DEATH';
        bannerSubtext = '25 HP · 100% FURY · FINAL BLOW!';
      } else {
        bannerText =
          this.mode === 'survival' ? `STREAK ${this.survivalStreak}` : `ROUND ${this.roundNumber}`;
        bannerSubtext =
          this.phaseTimer < 0.45
            ? 'FIGHT!'
            : this.roundNumber === 1
            ? this.rivalIntroLine
            : 'READY';
      }
    } else if (this.phase === 'round_end') {
      if (this.p1.hp <= 0 || this.p2.hp <= 0) {
        bannerText = this.p1.hp <= 0 && this.p2.hp <= 0 ? 'DOUBLE KO' : 'KNOCKOUT';
        bannerSubtext =
          this.p1.hp <= 0 && this.p2.hp <= 0
            ? 'OVERTIME TIEBREAKER INCOMING!'
            : this.p2.hp <= 0
            ? `${this.p1.profile.name} Wins Round`
            : `${this.p2.profile.name} Wins Round`;
      } else {
        bannerText = 'TIME OVER';
        bannerSubtext =
          this.p1.hp > this.p2.hp
            ? `${this.p1.profile.name} Leads`
            : this.p2.hp > this.p1.hp
            ? `${this.p2.profile.name} Leads`
            : 'DRAW · OVERTIME!';
      }
    }

    let matchWinner: 'p1' | 'p2' | 'draw' | null = null;
    if (this.phase === 'match_end') {
      if (this.p1Rounds > this.p2Rounds) matchWinner = 'p1';
      else if (this.p2Rounds > this.p1Rounds) matchWinner = 'p2';
      else matchWinner = 'draw';
    }

    this.onHudUpdate({
      p1Hp: Math.round(this.p1.hp),
      p2Hp: Math.round(this.p2.hp),
      p1Fury: Math.round(this.p1.fury),
      p2Fury: Math.round(this.p2.fury),
      p1Posture: Math.round(this.p1.guardPosture),
      p2Posture: Math.round(this.p2.guardPosture),
      p1Broken: this.p1.state === 'stagger',
      p2Broken: this.p2.state === 'stagger',
      p1PartnerHp: this.p1.bench ? Math.round(this.p1.bench.hp) : null,
      p2PartnerHp: this.p2.bench ? Math.round(this.p2.bench.hp) : null,
      p1PartnerName: this.p1.bench ? this.p1.bench.profile.countryCode : null,
      p2PartnerName: this.p2.bench ? this.p2.bench.profile.countryCode : null,
      p1ActiveName: this.p1.profile.name.split(' ')[0],
      p2ActiveName: this.p2.profile.name.split(' ')[0],
      tagCooldown: Number(this.tagCooldown.toFixed(1)),
      survivalStreak: this.survivalStreak,
      isSuddenDeath: this.isSuddenDeath,
      victoryQuote: this.victoryQuote,
      dojoTrialStep: this.dojoTrialStep,
      p1Rounds: this.p1Rounds,
      p2Rounds: this.p2Rounds,
      roundNumber: this.roundNumber,
      timerSeconds: this.mode === 'dojo' ? 99 : Math.ceil(this.roundTimer),
      bannerText,
      bannerSubtext,
      calloutText: this.calloutText,
      frameAdvantageLabel: this.frameAdvantageLabel,
      p1Combo: this.p1.comboCount,
      p1ComboTimerRatio: Math.max(0, Math.min(1, this.p1.comboDecayTimer / 2.0)),
      p1ComboDamage: this.p1.comboDamage,
      p1MaxCombo: this.p1.maxCombo,
      p2Combo: this.p2.comboCount,
      p2ComboTimerRatio: Math.max(0, Math.min(1, this.p2.comboDecayTimer / 2.0)),
      matchWinner,
      p1State: this.p1.state,
      p1StillFrame: Math.floor(this.p1.animFrame) % FRAMES_PER_SHEET,
      hapticEvent: this.lastHapticEvent,
      matchStats: { ...this.stats },
    });
  }
}
