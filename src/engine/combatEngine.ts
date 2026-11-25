import { soundEngine } from '../audio/soundEngine';
import type { FighterProfile } from '../data/fighters';
import type {
  FighterActionState,
  HapticEventKind,
  HapticFeedbackEvent,
  HudSnapshot,
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
  aiThinkTimer: number;
  aiDesiredRange: number;
  aiAction: 'approach' | 'retreat' | 'guard' | 'idle';
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

const STAGE_WIDTH = 720;
const GROUND_Y = 795;
const STAGE_LEFT = 84;
const STAGE_RIGHT = 636;
const DRAW_W = 290;
const DRAW_H = 362;

export class CombatEngine {
  private ctx: CanvasRenderingContext2D;
  private backdrop: ImageBitmap | HTMLImageElement;
  private p1: FighterActor;
  private p2: FighterActor;
  private inputRef: { current: TouchControlState };
  private onHudUpdate: (hud: HudSnapshot) => void;

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
  private shakeMagnitude = 0;

  private lastStrikeCount = 0;
  private lastPowerCount = 0;
  private prevStrikeDown = false;
  private hudThrottle = 0;
  private hapticSeq = 0;
  private lastHapticEvent: HapticFeedbackEvent | null = null;

  private sparks: SparkParticle[] = [];
  private rings: ShockwaveRing[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    backdrop: ImageBitmap | HTMLImageElement,
    p1Profile: FighterProfile,
    p1Assets: BakedFighterAssets,
    p2Profile: FighterProfile,
    p2Assets: BakedFighterAssets,
    inputRef: { current: TouchControlState },
    onHudUpdate: (hud: HudSnapshot) => void
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.backdrop = backdrop;
    this.inputRef = inputRef;
    this.onHudUpdate = onHudUpdate;

    this.p1 = this.createActor(p1Profile, p1Assets, 210, 1);
    this.p2 = this.createActor(p2Profile, p2Assets, 510, -1);

    this.lastStrikeCount = inputRef.current.strikeTriggerCount;
    this.lastPowerCount = inputRef.current.powerTriggerCount;
  }

  private createActor(
    profile: FighterProfile,
    assets: BakedFighterAssets,
    x: number,
    facing: 1 | -1
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
      aiThinkTimer: 0.25,
      aiDesiredRange: 130,
      aiAction: 'approach',
    };
  }

  public start(): void {
    this.lastTs = performance.now();
    soundEngine.playBell();
    this.emitHud();
    const loop = (ts: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
      this.lastTs = ts;

      if (!this.paused) {
        this.update(dt);
        this.render();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.lastTs = performance.now();
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private resetRound(): void {
    this.p1.x = 210;
    this.p1.y = 0;
    this.p1.vx = 0;
    this.p1.vy = 0;
    this.p1.hp = 100;
    this.p1.state = 'idle';
    this.p1.stateTimer = 0;
    this.p1.comboCount = 0;
    this.p1.comboDamage = 0;
    this.p1.comboDecayTimer = 0;

    this.p2.x = 510;
    this.p2.y = 0;
    this.p2.vx = 0;
    this.p2.vy = 0;
    this.p2.hp = 100;
    this.p2.state = 'idle';
    this.p2.stateTimer = 0;
    this.p2.comboCount = 0;
    this.p2.comboDamage = 0;
    this.p2.comboDecayTimer = 0;

    this.roundTimer = 60;
    this.phase = 'intro';
    this.phaseTimer = 1.4;
    soundEngine.playBell();
  }

  private update(dt: number): void {
    if (this.shakeMagnitude > 0) {
      this.shakeMagnitude = Math.max(0, this.shakeMagnitude - dt * 36);
    }

    // Update FX even during hit-stop
    this.updateParticles(dt);

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
      return;
    }

    if (this.phase === 'round_end') {
      this.phaseTimer -= dt;
      this.advanceActorPhysics(this.p1, dt);
      this.advanceActorPhysics(this.p2, dt);
      if (this.phaseTimer <= 0) {
        if (this.p1Rounds >= 2 || this.p2Rounds >= 2 || this.roundNumber >= 3) {
          this.phase = 'match_end';
        } else {
          this.roundNumber++;
          this.resetRound();
        }
        this.emitHud();
      }
      return;
    }

    if (this.phase === 'match_end') {
      this.advanceActorPhysics(this.p1, dt);
      this.advanceActorPhysics(this.p2, dt);
      this.emitHudThrottled(dt);
      return;
    }

    // Active combat phase
    this.roundTimer = Math.max(0, this.roundTimer - dt);

    // Face each other when neutral
    if (this.isNeutralState(this.p1.state)) {
      this.p1.facing = this.p2.x >= this.p1.x ? 1 : -1;
    }
    if (this.isNeutralState(this.p2.state)) {
      this.p2.facing = this.p1.x >= this.p2.x ? 1 : -1;
    }

    this.handlePlayerInput(dt);
    this.handleOpponentAI(dt);

    this.advanceActorPhysics(this.p1, dt);
    this.advanceActorPhysics(this.p2, dt);

    // Pushbox separation
    const minSep = 96;
    const dx = this.p2.x - this.p1.x;
    if (Math.abs(dx) < minSep && Math.abs(this.p1.y - this.p2.y) < 110) {
      const push = (minSep - Math.abs(dx)) * 0.5;
      const sign = dx >= 0 ? 1 : -1;
      this.p1.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p1.x - sign * push));
      this.p2.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.p2.x + sign * push));
    }

    this.resolveAttackHit(this.p1, this.p2);
    this.resolveAttackHit(this.p2, this.p1);

    // Check KO or time out
    if (this.p1.hp <= 0 || this.p2.hp <= 0 || this.roundTimer <= 0) {
      this.finishRound();
    }

    this.emitHudThrottled(dt);
  }

  private isNeutralState(s: FighterActionState): boolean {
    return s === 'idle' || s === 'walk' || s === 'run' || s === 'guard';
  }

  private handlePlayerInput(dt: number): void {
    const inp = this.inputRef.current;
    const p1 = this.p1;

    // Detect fresh Strike button tap or release of charged hold
    const strikeTapped = inp.strikeTriggerCount !== this.lastStrikeCount;
    const powerTapped = inp.powerTriggerCount !== this.lastPowerCount;
    const strikeReleasedCharge = this.prevStrikeDown && !inp.strikeDown && inp.strikeChargeRatio >= 0.85;

    this.lastStrikeCount = inp.strikeTriggerCount;
    this.lastPowerCount = inp.powerTriggerCount;
    this.prevStrikeDown = inp.strikeDown;

    if (p1.state === 'hit' || p1.state === 'ko') return;

    const canAttack = this.isNeutralState(p1.state) || p1.state === 'jump';

    // Charge-released heavy guard-breaker
    if (strikeReleasedCharge && canAttack) {
      this.triggerAttack(p1, 'cross');
      return;
    }

    // Power Button B (Tap -> Heavy/Signature, Hold -> Iron Guard)
    if (powerTapped && canAttack) {
      if (p1.fury >= 50) {
        p1.fury -= 50;
        this.triggerAttack(p1, 'special');
      } else {
        this.triggerAttack(p1, 'cross');
      }
      return;
    }

    // Strike Button A (Tap -> 3-hit Jab/Cross/Uppercut chain)
    if (strikeTapped && canAttack) {
      const nextStep = (p1.comboStep + 1) % 3;
      p1.comboStep = nextStep;
      this.triggerAttack(p1, nextStep === 2 ? 'cross' : 'jab');
      return;
    }

    // Don't override active attack animations
    if (p1.state === 'jab' || p1.state === 'cross' || p1.state === 'special') {
      return;
    }

    // Hold Power or Push Down = Iron Guard
    const holdingGuard = (inp.powerDown && inp.powerHoldMs > 180) || inp.moveY > 0.55;
    if (holdingGuard && p1.y >= 0) {
      p1.state = 'guard';
      p1.vx *= 0.72;
      p1.animFrame = 100;
      return;
    }

    // Jump on Up input
    if (inp.moveY < -0.58 && p1.y >= 0) {
      p1.state = 'jump';
      p1.vy = -790;
      p1.vx = inp.moveX * 290;
      soundEngine.playJump();
      return;
    }

    if (p1.y < 0) {
      // Air control
      p1.vx = inp.moveX * 260;
      return;
    }

    // Walk vs Run based on analog/D-Pad magnitude
    const magX = Math.abs(inp.moveX);
    const speedFactor = 0.8 + p1.profile.stats.speed * 0.0045;
    if (magX > 0.72) {
      p1.state = 'run';
      p1.vx = Math.sign(inp.moveX) * 340 * speedFactor;
      p1.footstepCooldown -= dt;
      if (p1.footstepCooldown <= 0) {
        soundEngine.playFootstep(true);
        p1.footstepCooldown = 0.24;
      }
    } else if (magX > 0.16) {
      p1.state = 'walk';
      p1.vx = Math.sign(inp.moveX) * 165 * speedFactor;
      p1.footstepCooldown -= dt;
      if (p1.footstepCooldown <= 0) {
        soundEngine.playFootstep(false);
        p1.footstepCooldown = 0.36;
      }
    } else {
      p1.state = 'idle';
      p1.vx *= 0.65;
    }
  }

  private handleOpponentAI(dt: number): void {
    const ai = this.p2;
    const foe = this.p1;
    if (ai.state === 'hit' || ai.state === 'ko') return;
    if (ai.state === 'jab' || ai.state === 'cross' || ai.state === 'special') return;

    const dist = Math.abs(foe.x - ai.x);
    ai.aiThinkTimer -= dt;

    if (ai.aiThinkTimer <= 0) {
      ai.aiThinkTimer = 0.22 + Math.random() * 0.28;
      const foeAttacking = foe.state === 'jab' || foe.state === 'cross' || foe.state === 'special';

      if (foeAttacking && dist < 175 && Math.random() < 0.48) {
        ai.aiAction = 'guard';
      } else if (dist < 145) {
        const r = Math.random();
        if (ai.fury >= 50 && r < 0.32) {
          ai.fury -= 50;
          this.triggerAttack(ai, 'special');
          return;
        } else if (r < 0.56) {
          this.triggerAttack(ai, 'jab');
          return;
        } else if (r < 0.78) {
          this.triggerAttack(ai, 'cross');
          return;
        } else {
          ai.aiAction = 'retreat';
        }
      } else {
        ai.aiAction = Math.random() < 0.85 ? 'approach' : 'idle';
      }
    }

    const speedFactor = 0.75 + ai.profile.stats.speed * 0.004;
    if (ai.aiAction === 'guard') {
      ai.state = 'guard';
      ai.vx *= 0.7;
      ai.animFrame = 100;
    } else if (ai.aiAction === 'approach') {
      const dir = foe.x > ai.x ? 1 : -1;
      if (dist > 260) {
        ai.state = 'run';
        ai.vx = dir * 290 * speedFactor;
      } else {
        ai.state = 'walk';
        ai.vx = dir * 150 * speedFactor;
      }
    } else if (ai.aiAction === 'retreat') {
      const dir = foe.x > ai.x ? -1 : 1;
      ai.state = 'walk';
      ai.vx = dir * 135 * speedFactor;
    } else {
      ai.state = 'idle';
      ai.vx *= 0.7;
    }
  }

  private triggerAttack(actor: FighterActor, kind: 'jab' | 'cross' | 'special'): void {
    actor.state = kind;
    actor.stateTimer = 0;
    actor.hitConfirmed = false;
    if (kind === 'special') {
      actor.vx = actor.facing * 260;
      if (actor.y >= 0) actor.vy = -340;
      soundEngine.playSpecial();
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

  private triggerHaptic(kind: HapticEventKind): void {
    this.hapticSeq += 1;
    this.lastHapticEvent = { id: this.hapticSeq, kind };
  }

  private advanceActorPhysics(actor: FighterActor, dt: number): void {
    if (actor.comboDecayTimer > 0) {
      actor.comboDecayTimer -= dt;
      if (actor.comboDecayTimer <= 0) {
        actor.comboCount = 0;
        actor.comboDamage = 0;
      }
    }

    actor.x += actor.vx * dt;
    actor.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, actor.x));

    if (actor.y < 0 || actor.vy < 0) {
      actor.vy += 1950 * dt;
      actor.y += actor.vy * dt;
      if (actor.y >= 0) {
        actor.y = 0;
        actor.vy = 0;
        if (actor.state === 'jump') actor.state = 'idle';
        soundEngine.playLand();
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
      actor.stateTimer += dt;
      const dur = 0.28;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = Math.floor(p * 29);
      actor.vx *= 0.88;
      if (actor.stateTimer >= dur) actor.state = 'idle';
    } else if (actor.state === 'cross') {
      actor.stateTimer += dt;
      const dur = 0.42;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 30 + Math.floor(p * 29);
      actor.vx *= 0.9;
      if (actor.stateTimer >= dur) actor.state = 'idle';
    } else if (actor.state === 'special') {
      actor.stateTimer += dt;
      const dur = 0.58;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 60 + Math.floor(p * 35);
      actor.vx *= 0.92;
      if (actor.stateTimer >= dur) actor.state = 'idle';
    } else if (actor.state === 'hit') {
      actor.stateTimer += dt;
      const dur = 0.26;
      const p = Math.min(1, actor.stateTimer / dur);
      actor.animFrame = 108 + Math.floor(p * 11);
      actor.vx *= 0.85;
      if (actor.stateTimer >= dur) actor.state = 'idle';
    } else if (actor.state === 'ko') {
      actor.animFrame = 119;
      actor.vx *= 0.84;
    }
  }

  private resolveAttackHit(attacker: FighterActor, defender: FighterActor): void {
    if (attacker.hitConfirmed) return;
    if (defender.state === 'ko') return;

    let activeMin = 0;
    let activeMax = 0;
    let reach = 132 + attacker.profile.stats.reach * 0.45;
    let baseDamage = 7;
    let knockback = 190;
    let hitStop = 0.045;

    if (attacker.state === 'jab') {
      activeMin = 0.08;
      activeMax = 0.19;
      baseDamage = 6 + attacker.profile.stats.power * 0.03;
      knockback = 160;
    } else if (attacker.state === 'cross') {
      activeMin = 0.14;
      activeMax = 0.3;
      reach += 14;
      baseDamage = 11 + attacker.profile.stats.power * 0.05;
      knockback = 290;
      hitStop = 0.075;
    } else if (attacker.state === 'special') {
      activeMin = 0.22;
      activeMax = 0.44;
      reach += 32;
      baseDamage = 19 + attacker.profile.stats.power * 0.08;
      knockback = 420;
      hitStop = 0.12;
    } else {
      return;
    }

    if (attacker.stateTimer < activeMin || attacker.stateTimer > activeMax) return;

    const dx = (defender.x - attacker.x) * attacker.facing;
    const dy = Math.abs(defender.y - attacker.y);
    if (dx < -25 || dx > reach || dy > 125) return;

    attacker.hitConfirmed = true;
    const isBlocked = defender.state === 'guard' && attacker.state !== 'special';
    const impactX = (attacker.x + defender.x) * 0.5;
    const impactY = GROUND_Y + defender.y - 175;

    if (isBlocked) {
      const chip = Math.max(1, Math.round(baseDamage * 0.2));
      defender.hp = Math.max(0, defender.hp - chip);
      defender.vx = attacker.facing * knockback * 0.45;
      attacker.fury = Math.min(100, attacker.fury + 6);
      defender.fury = Math.min(100, defender.fury + 10);
      soundEngine.playBlock();
      this.triggerHaptic('block');
      this.spawnSparks(impactX, impactY, '#38bdf8', 9);
      this.hitStopTimer = 0.03;
    } else {
      const dmg = Math.round(baseDamage);
      defender.hp = Math.max(0, defender.hp - dmg);
      defender.state = defender.hp <= 0 ? 'ko' : 'hit';
      defender.stateTimer = 0;
      defender.vx = attacker.facing * knockback;
      if (attacker.state === 'special') defender.vy = -260;

      attacker.fury = Math.min(100, attacker.fury + 14);
      defender.fury = Math.min(100, defender.fury + 9);
      attacker.comboCount++;
      attacker.comboDamage += dmg;
      if (attacker.comboCount > attacker.maxCombo) {
        attacker.maxCombo = attacker.comboCount;
      }
      attacker.comboDecayTimer = 1.8;

      if (attacker === this.p1) {
        if (attacker.state === 'special') this.triggerHaptic('special_hit');
        else if (attacker.state === 'cross') this.triggerHaptic('heavy_hit');
        else this.triggerHaptic('light_hit');
      } else {
        if (attacker.state === 'special' || attacker.state === 'cross') {
          this.triggerHaptic('take_heavy_damage');
        } else {
          this.triggerHaptic('take_damage');
        }
      }

      if (attacker.state === 'jab') soundEngine.playHitLight();
      else soundEngine.playHitHeavy();

      this.shakeMagnitude = attacker.state === 'special' ? 16 : attacker.state === 'cross' ? 9 : 4;
      this.hitStopTimer = hitStop;
      this.spawnSparks(
        impactX,
        impactY,
        attacker.state === 'special' ? '#f59e0b' : '#ef4444',
        attacker.state === 'special' ? 18 : 11
      );
      if (attacker.state !== 'jab') {
        this.rings.push({
          x: impactX,
          y: impactY,
          radius: 12,
          maxRadius: attacker.state === 'special' ? 150 : 88,
          life: 0,
          maxLife: 0.24,
          color: attacker.profile.appearance.accentHex,
        });
      }
    }
    this.emitHud();
  }

  private finishRound(): void {
    this.phase = 'round_end';
    this.phaseTimer = 2.1;

    if (this.p1.hp <= 0 && this.p2.hp <= 0) {
      // Double KO
    } else if (this.p2.hp <= 0 || (this.roundTimer <= 0 && this.p1.hp > this.p2.hp)) {
      this.p1Rounds++;
      this.p2.state = this.p2.hp <= 0 ? 'ko' : 'idle';
    } else if (this.p1.hp <= 0 || (this.roundTimer <= 0 && this.p2.hp > this.p1.hp)) {
      this.p2Rounds++;
      this.p1.state = this.p1.hp <= 0 ? 'ko' : 'idle';
    }
    soundEngine.playKO();
    this.triggerHaptic('ko');
    this.emitHud();
  }

  private spawnSparks(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 340;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 60,
        life: 0,
        maxLife: 0.22 + Math.random() * 0.16,
        color,
        size: 4 + Math.random() * 5,
      });
    }
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
      actor.state === 'jab' ||
      actor.state === 'cross' ||
      actor.state === 'special' ||
      actor.state === 'guard' ||
      actor.state === 'hit' ||
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

    // Ground contact shadow
    const shadowScale = Math.max(0.45, 1 + actor.y / 420);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    this.ctx.beginPath();
    this.ctx.ellipse(actor.x, GROUND_Y + 4, 72 * shadowScale, 18 * shadowScale, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Draw PNG still frame
    this.ctx.save();
    const drawY = GROUND_Y + actor.y - DRAW_H + 34;
    this.ctx.translate(actor.x, drawY + DRAW_H * 0.5);
    this.ctx.scale(actor.facing, 1);
    if (actor.state === 'ko') {
      this.ctx.rotate(-Math.PI * 0.42);
      this.ctx.translate(-35, 65);
    }

    // Subtle guard aura when blocking
    if (actor.state === 'guard') {
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 16;
    } else if (actor.state === 'special') {
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
    this.ctx.restore();
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeMagnitude > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeMagnitude;
      const sy = (Math.random() - 0.5) * this.shakeMagnitude;
      ctx.translate(sx, sy);
    }

    // Fill lower console underlay cleanly
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, STAGE_WIDTH, 1440);

    // Draw pre-baked PNG arena backdrop
    ctx.drawImage(this.backdrop, 0, 0, STAGE_WIDTH, 900);

    // Draw fighters (attacker on top)
    if (this.p1.state === 'jab' || this.p1.state === 'cross' || this.p1.state === 'special') {
      this.drawActor(this.p2);
      this.drawActor(this.p1);
    } else {
      this.drawActor(this.p1);
      this.drawActor(this.p2);
    }

    // Shockwave rings
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

    // Impact sparks
    for (const s of this.sparks) {
      const alpha = Math.max(0, 1 - s.life / s.maxLife);
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x - s.size * 0.5, s.y - s.size * 0.5, s.size, s.size);
      ctx.restore();
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
      bannerText = `ROUND ${this.roundNumber}`;
      bannerSubtext = this.phaseTimer < 0.5 ? 'FIGHT!' : 'READY';
    } else if (this.phase === 'round_end') {
      if (this.p1.hp <= 0 || this.p2.hp <= 0) {
        bannerText = 'KNOCKOUT';
        bannerSubtext =
          this.p2.hp <= 0 ? `${this.p1.profile.name} Wins Round` : `${this.p2.profile.name} Wins Round`;
      } else {
        bannerText = 'TIME OVER';
        bannerSubtext =
          this.p1.hp >= this.p2.hp
            ? `${this.p1.profile.name} Leads`
            : `${this.p2.profile.name} Leads`;
      }
    }

    let matchWinner: 'p1' | 'p2' | 'draw' | null = null;
    if (this.phase === 'match_end') {
      if (this.p1Rounds > this.p2Rounds) matchWinner = 'p1';
      else if (this.p2Rounds > this.p1Rounds) matchWinner = 'p2';
      else matchWinner = 'draw';
    }

    this.onHudUpdate({
      p1Hp: this.p1.hp,
      p2Hp: this.p2.hp,
      p1Fury: this.p1.fury,
      p2Fury: this.p2.fury,
      p1Rounds: this.p1Rounds,
      p2Rounds: this.p2Rounds,
      roundNumber: this.roundNumber,
      timerSeconds: Math.ceil(this.roundTimer),
      bannerText,
      bannerSubtext,
      p1Combo: this.p1.comboCount,
      p1ComboTimerRatio: Math.max(0, Math.min(1, this.p1.comboDecayTimer / 1.8)),
      p1ComboDamage: this.p1.comboDamage,
      p1MaxCombo: this.p1.maxCombo,
      p2Combo: this.p2.comboCount,
      p2ComboTimerRatio: Math.max(0, Math.min(1, this.p2.comboDecayTimer / 1.8)),
      matchWinner,
      p1State: this.p1.state,
      p1StillFrame: Math.floor(this.p1.animFrame) % FRAMES_PER_SHEET,
      hapticEvent: this.lastHapticEvent,
    });
  }
}
