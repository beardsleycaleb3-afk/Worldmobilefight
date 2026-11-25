import type { FighterActionState } from '../engine/combatTypes';
import { FIGHTERS } from './fighters';

export type TrialStepMove = Extract<
  FighterActionState,
  'jab' | 'cross' | 'launcher' | 'air_kick' | 'projectile' | 'special' | 'clinch_throw' | 'springboard'
>;

export interface ComboTrialStep {
  move: TrialStepMove;
  label: string;
}

export interface ComboTrialSpec {
  id: string;
  fighterId: string;
  title: string;
  steps: ComboTrialStep[];
}

export function getTrialsForFighter(fighterId: string): ComboTrialSpec[] {
  const f = FIGHTERS.find((item) => item.id === fighterId) || FIGHTERS[0];
  const waveShort = f.frameData.projectile.name.split(' ')[0];
  const specShort = f.signatureMove.split(' ').slice(0, 2).join(' ');

  return [
    {
      id: `${f.id}__trial_1`,
      fighterId: f.id,
      title: 'Iron Foundation',
      steps: [
        { move: 'jab', label: 'A (Jab)' },
        { move: 'cross', label: 'B (Cross)' },
        { move: 'launcher', label: '▼+A (Launch)' },
      ],
    },
    {
      id: `${f.id}__trial_2`,
      fighterId: f.id,
      title: 'Sky Juggle',
      steps: [
        { move: 'launcher', label: '▼+A (Launch)' },
        { move: 'air_kick', label: '▲ then A (Air)' },
        { move: 'projectile', label: `▼▶+B (${waveShort})` },
      ],
    },
    {
      id: `${f.id}__trial_3`,
      fighterId: f.id,
      title: 'Titan Finisher',
      steps: [
        { move: 'cross', label: 'B (Cross)' },
        { move: 'clinch_throw', label: 'Close A+B (Grab)' },
        { move: 'special', label: `Fury B (${specShort})` },
      ],
    },
  ];
}
