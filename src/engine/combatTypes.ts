export interface TouchControlState {
  moveX: number; // -1 to 1
  moveY: number; // -1 (up) to 1 (down)
  activeDir: string; // 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'CENTER'
  strikeDown: boolean;
  powerDown: boolean;
  strikeTriggerCount: number;
  powerTriggerCount: number;
  directionalSpecialCount: number;
  tagTriggerCount: number;
  grappleTriggerCount: number;
  strikeChargeRatio: number; // 0 to 1
  powerHoldMs: number;
}

export type FighterActionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'guard'
  | 'jab'
  | 'cross'
  | 'special'
  | 'projectile'
  | 'launcher'
  | 'air_kick'
  | 'springboard'
  | 'clinch_throw'
  | 'stagger'
  | 'hit'
  | 'victory'
  | 'ko';

export type GameMode =
  | 'versus'
  | 'arcade'
  | 'tournament'
  | 'tag'
  | 'survival'
  | 'dojo'
  | 'online';

export type DojoCpuMode = 'idle' | 'guard' | 'counter' | 'spar';
export type SkinVariant = 'default' | 'gold' | 'shadow';

export type HapticEventKind =
  | 'light_hit'
  | 'heavy_hit'
  | 'special_hit'
  | 'take_damage'
  | 'take_heavy_damage'
  | 'block'
  | 'parry'
  | 'guard_break'
  | 'rope_bounce'
  | 'tag_swap'
  | 'throw_tech'
  | 'ko';

export interface HapticFeedbackEvent {
  id: number;
  kind: HapticEventKind;
}

export interface InputHistoryEntry {
  id: number;
  dir: string;
  button: 'A' | 'B' | 'WAVE' | 'LAUNCH' | 'AIR' | 'TAG' | 'GRAB' | null;
  framesSincePrev: number;
}

export interface CombatMatchStats {
  totalDamage: number;
  hitsLanded: number;
  parries: number;
  blocks: number;
  guardBreaks: number;
  specialsUsed: number;
  jumpsUsed: number;
  airJuggleHits: number;
  clinchThrows: number;
  springboards: number;
  durationSeconds: number;
}

export interface ReplayFrame {
  t: number; // match elapsed seconds
  p1: TouchControlState;
  p2?: TouchControlState;
}

export interface MatchReplayData {
  seed: number;
  mode: GameMode;
  p1Id: string;
  p2Id: string;
  p1Skin: SkinVariant;
  p2Skin: SkinVariant;
  p1PartnerId?: string;
  p2PartnerId?: string;
  frames: ReplayFrame[];
}

export interface RemoteActorSync {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  fury: number;
  posture: number;
  state: FighterActionState;
  animFrame: number;
  comboCount: number;
  comboDamage: number;
  maxCombo: number;
}

export interface RemoteCombatSnapshot {
  p1: RemoteActorSync;
  p2: RemoteActorSync;
  p1Rounds: number;
  p2Rounds: number;
  roundNumber: number;
  roundTimer: number;
  phase: 'intro' | 'fight' | 'round_end' | 'match_end';
  calloutText: string | null;
  projectiles: Array<{
    x: number;
    y: number;
    vx: number;
    ownerSlot: 'p1' | 'p2';
    color: string;
    radius: number;
  }>;
  hapticForGuest: HapticFeedbackEvent | null;
}

export interface HudSnapshot {
  p1Hp: number;
  p2Hp: number;
  p1Fury: number;
  p2Fury: number;
  p1Posture: number;
  p2Posture: number;
  p1Broken: boolean;
  p2Broken: boolean;
  p1PartnerHp: number | null;
  p2PartnerHp: number | null;
  p1PartnerName: string | null;
  p2PartnerName: string | null;
  p1ActiveName: string;
  p2ActiveName: string;
  tagCooldown: number;
  survivalStreak: number;
  isSuddenDeath: boolean;
  victoryQuote: string | null;
  dojoTrialStep: number;
  p1Rounds: number;
  p2Rounds: number;
  roundNumber: number;
  timerSeconds: number;
  bannerText: string | null;
  bannerSubtext: string | null;
  calloutText: string | null;
  frameAdvantageLabel: string | null;
  p1Combo: number;
  p1ComboTimerRatio: number;
  p1ComboDamage: number;
  p1MaxCombo: number;
  p2Combo: number;
  p2ComboTimerRatio: number;
  matchWinner: 'p1' | 'p2' | 'draw' | null;
  p1State: FighterActionState;
  p1StillFrame: number;
  hapticEvent: HapticFeedbackEvent | null;
  matchStats: CombatMatchStats;
}
