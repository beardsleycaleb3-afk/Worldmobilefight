import { FIGHTERS, type FighterProfile } from '../data/fighters';
import type { CombatMatchStats } from '../engine/combatTypes';

export type DailyConditionId =
  | 'parry_two'
  | 'combo_four'
  | 'no_jump'
  | 'fury_finish'
  | 'guard_break';

export interface DailyChallengeSpec {
  dateKey: string;
  title: string;
  description: string;
  p1: FighterProfile;
  p2: FighterProfile;
  conditionId: DailyConditionId;
}

export interface CareerMedal {
  id: string;
  title: string;
  description: string;
}

export const CAREER_MEDALS: CareerMedal[] = [
  { id: 'first_blood', title: 'First Victory', description: 'Win your first sanctioned bout.' },
  { id: 'parry_master', title: 'Iron Reflex', description: 'Land 10 career Perfect Parries.' },
  { id: 'combo_king_6', title: 'Unstoppable', description: 'Hit a 6x+ combo in a single string.' },
  { id: 'shield_breaker', title: 'Guard Shatter', description: 'Trigger a Guard Break stagger.' },
  { id: 'arcade_champ', title: 'Golden Belt', description: 'Clear the 7-stage Arcade Ladder.' },
  { id: 'survivor_5', title: 'Iron Endurance', description: 'Reach a 5-KO Survival streak.' },
  { id: 'tag_champion', title: 'Tag Syndicate', description: 'Win a 2v2 Tag Team match.' },
  { id: 'daily_victor', title: 'Daily Contender', description: 'Complete a Daily Challenge bout.' },
  { id: 'cup_winner', title: '8-Nation Cup', description: 'Win the 8-Nation Knockout Cup.' },
  { id: 'trial_master', title: 'Dojo Scholar', description: 'Complete 5 Dojo Combo Trials.' },
];

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDailyChallenge(dateKey = getTodayDateKey()): DailyChallengeSpec {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx1 = Math.abs(hash) % FIGHTERS.length;
  const idx2 = (idx1 + 1 + (Math.abs(hash >> 4) % (FIGHTERS.length - 1))) % FIGHTERS.length;
  const conditions: Array<{ id: DailyConditionId; title: string; description: string }> = [
    {
      id: 'parry_two',
      title: 'Iron Reflex Trial',
      description: 'Win the bout and land at least 2 Perfect Parries.',
    },
    {
      id: 'combo_four',
      title: 'Rush Combo Trial',
      description: 'Win the bout while hitting a 4x+ Combo.',
    },
    {
      id: 'no_jump',
      title: 'Grounded Titan',
      description: 'Win the bout without jumping once.',
    },
    {
      id: 'fury_finish',
      title: 'Fury Overload',
      description: 'Win the bout and unleash at least 2 Specials/Waves.',
    },
    {
      id: 'guard_break',
      title: 'Posture Crusher',
      description: 'Win the bout and break opponent guard posture.',
    },
  ];
  const cond = conditions[Math.abs(hash >> 8) % conditions.length];
  return {
    dateKey,
    title: cond.title,
    description: cond.description,
    p1: FIGHTERS[idx1],
    p2: FIGHTERS[idx2],
    conditionId: cond.id,
  };
}

export function evaluateDailyCondition(
  conditionId: DailyConditionId,
  winner: 'p1' | 'p2' | 'draw',
  maxCombo: number,
  stats: CombatMatchStats
): boolean {
  if (winner !== 'p1') return false;
  switch (conditionId) {
    case 'parry_two':
      return stats.parries >= 2;
    case 'combo_four':
      return maxCombo >= 4;
    case 'no_jump':
      return stats.jumpsUsed === 0;
    case 'fury_finish':
      return stats.specialsUsed >= 2;
    case 'guard_break':
      return stats.guardBreaks >= 1;
    default:
      return false;
  }
}
