export interface TouchControlState {
  moveX: number; // -1 to 1
  moveY: number; // -1 (up) to 1 (down)
  activeDir: string; // 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'CENTER'
  strikeDown: boolean;
  powerDown: boolean;
  strikeTriggerCount: number;
  powerTriggerCount: number;
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
  | 'hit'
  | 'ko';

export type HapticEventKind =
  | 'light_hit'
  | 'heavy_hit'
  | 'special_hit'
  | 'take_damage'
  | 'take_heavy_damage'
  | 'block'
  | 'ko';

export interface HapticFeedbackEvent {
  id: number;
  kind: HapticEventKind;
}

export interface HudSnapshot {
  p1Hp: number;
  p2Hp: number;
  p1Fury: number;
  p2Fury: number;
  p1Rounds: number;
  p2Rounds: number;
  roundNumber: number;
  timerSeconds: number;
  bannerText: string | null;
  bannerSubtext: string | null;
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
}
