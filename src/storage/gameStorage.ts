import type { GameMode, MatchReplayData } from '../engine/combatTypes';

export type HapticIntensity = 'off' | 'light' | 'full';

export interface ControlSettings {
  hapticIntensity: HapticIntensity;
  runThreshold: number; // 0.55 to 0.85
  swapButtons: boolean;
  sfxVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1
  controlScale: number; // 0.85 to 1.12
  thumbSpacing: number; // 0 to 24 px
  chassisOpacity: number; // 0.65 to 1.0
}

export interface MatchStatRecord {
  id: string;
  dateIso: string;
  mode: GameMode;
  p1Id: string;
  p2Id: string;
  winner: 'p1' | 'p2' | 'draw';
  p1Rounds: number;
  p2Rounds: number;
  maxCombo: number;
  totalDamage: number;
  hitsLanded: number;
  parries: number;
  blocks: number;
  durationSeconds: number;
  replay?: MatchReplayData;
}

export interface FighterMasteryRecord {
  xp: number;
  wins: number;
  kos: number;
}

export interface FighterMasteryTier {
  level: number;
  rankTitle: 'ROOKIE' | 'CONTENDER' | 'ENFORCER' | 'CHAMPION' | 'LEGEND';
  currentXp: number;
  nextThreshold: number;
  progressRatio: number;
}

export interface ArcadeProgress {
  goldenBeltUnlockedIds: string[];
  bestArcadeSeconds: Record<string, number>;
  bestSurvivalStreak: number;
  completedDailyDates: string[];
  careerMedals: string[];
  completedTrialIds: string[];
  fighterMastery: Record<string, FighterMasteryRecord>;
  tournamentWins: number;
  totalWins: number;
  totalParries: number;
  maxComboEver: number;
}

const SETTINGS_KEY = 'iron-titan-settings-v1';
const HISTORY_KEY = 'iron-titan-history-v1';
const ARCADE_KEY = 'iron-titan-arcade-v1';

export const DEFAULT_SETTINGS: ControlSettings = {
  hapticIntensity: 'full',
  runThreshold: 0.72,
  swapButtons: false,
  sfxVolume: 0.9,
  musicVolume: 0.55,
  controlScale: 1.0,
  thumbSpacing: 6,
  chassisOpacity: 1.0,
};

export function getFighterMasteryTier(xp: number): FighterMasteryTier {
  if (xp >= 900) {
    return { level: 5, rankTitle: 'LEGEND', currentXp: xp, nextThreshold: 900, progressRatio: 1 };
  }
  if (xp >= 500) {
    return {
      level: 4,
      rankTitle: 'CHAMPION',
      currentXp: xp,
      nextThreshold: 900,
      progressRatio: (xp - 500) / 400,
    };
  }
  if (xp >= 250) {
    return {
      level: 3,
      rankTitle: 'ENFORCER',
      currentXp: xp,
      nextThreshold: 500,
      progressRatio: (xp - 250) / 250,
    };
  }
  if (xp >= 100) {
    return {
      level: 2,
      rankTitle: 'CONTENDER',
      currentXp: xp,
      nextThreshold: 250,
      progressRatio: (xp - 100) / 150,
    };
  }
  return {
    level: 1,
    rankTitle: 'ROOKIE',
    currentXp: xp,
    nextThreshold: 100,
    progressRatio: xp / 100,
  };
}

export function loadSettings(): ControlSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ControlSettings>;
    return {
      hapticIntensity:
        parsed.hapticIntensity === 'off' ||
        parsed.hapticIntensity === 'light' ||
        parsed.hapticIntensity === 'full'
          ? parsed.hapticIntensity
          : 'full',
      runThreshold:
        typeof parsed.runThreshold === 'number'
          ? Math.max(0.55, Math.min(0.85, parsed.runThreshold))
          : 0.72,
      swapButtons: Boolean(parsed.swapButtons),
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.sfxVolume))
          : 0.9,
      musicVolume:
        typeof parsed.musicVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : 0.55,
      controlScale:
        typeof parsed.controlScale === 'number'
          ? Math.max(0.85, Math.min(1.12, parsed.controlScale))
          : 1.0,
      thumbSpacing:
        typeof parsed.thumbSpacing === 'number'
          ? Math.max(0, Math.min(24, parsed.thumbSpacing))
          : 6,
      chassisOpacity:
        typeof parsed.chassisOpacity === 'number'
          ? Math.max(0.65, Math.min(1.0, parsed.chassisOpacity))
          : 1.0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ControlSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadMatchHistory(): MatchStatRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MatchStatRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveMatchRecord(record: MatchStatRecord): MatchStatRecord[] {
  const prev = loadMatchHistory();
  const next = [record, ...prev].slice(0, 12).map((item, idx) =>
    idx >= 6 && item.replay ? { ...item, replay: undefined } : item
  );
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    const stripped = next.map((item, idx) =>
      idx > 0 && item.replay ? { ...item, replay: undefined } : item
    );
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(stripped));
    } catch {
      // Ignore
    }
  }
  return next;
}

const DEFAULT_PROGRESS: ArcadeProgress = {
  goldenBeltUnlockedIds: [],
  bestArcadeSeconds: {},
  bestSurvivalStreak: 0,
  completedDailyDates: [],
  careerMedals: [],
  completedTrialIds: [],
  fighterMastery: {},
  tournamentWins: 0,
  totalWins: 0,
  totalParries: 0,
  maxComboEver: 0,
};

export function loadArcadeProgress(): ArcadeProgress {
  try {
    const raw = localStorage.getItem(ARCADE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<ArcadeProgress>;
    return {
      goldenBeltUnlockedIds: Array.isArray(parsed.goldenBeltUnlockedIds)
        ? parsed.goldenBeltUnlockedIds
        : [],
      bestArcadeSeconds:
        parsed.bestArcadeSeconds && typeof parsed.bestArcadeSeconds === 'object'
          ? parsed.bestArcadeSeconds
          : {},
      bestSurvivalStreak:
        typeof parsed.bestSurvivalStreak === 'number' ? parsed.bestSurvivalStreak : 0,
      completedDailyDates: Array.isArray(parsed.completedDailyDates)
        ? parsed.completedDailyDates
        : [],
      careerMedals: Array.isArray(parsed.careerMedals) ? parsed.careerMedals : [],
      completedTrialIds: Array.isArray(parsed.completedTrialIds) ? parsed.completedTrialIds : [],
      fighterMastery:
        parsed.fighterMastery && typeof parsed.fighterMastery === 'object'
          ? parsed.fighterMastery
          : {},
      tournamentWins: typeof parsed.tournamentWins === 'number' ? parsed.tournamentWins : 0,
      totalWins: typeof parsed.totalWins === 'number' ? parsed.totalWins : 0,
      totalParries: typeof parsed.totalParries === 'number' ? parsed.totalParries : 0,
      maxComboEver: typeof parsed.maxComboEver === 'number' ? parsed.maxComboEver : 0,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function writeArcadeProgress(prog: ArcadeProgress): ArcadeProgress {
  try {
    localStorage.setItem(ARCADE_KEY, JSON.stringify(prog));
  } catch {
    // Ignore
  }
  return prog;
}

export function unlockGoldenBelt(fighterId: string, clearSeconds: number): ArcadeProgress {
  const prog = loadArcadeProgress();
  if (!prog.goldenBeltUnlockedIds.includes(fighterId)) {
    prog.goldenBeltUnlockedIds.push(fighterId);
  }
  const prevBest = prog.bestArcadeSeconds[fighterId];
  if (typeof prevBest !== 'number' || clearSeconds < prevBest) {
    prog.bestArcadeSeconds[fighterId] = clearSeconds;
  }
  if (!prog.careerMedals.includes('arcade_champ')) {
    prog.careerMedals.push('arcade_champ');
  }
  return writeArcadeProgress(prog);
}

export function recordTrialCompleted(trialId: string, fighterId: string): ArcadeProgress {
  const prog = loadArcadeProgress();
  if (!prog.completedTrialIds.includes(trialId)) {
    prog.completedTrialIds.push(trialId);
    const prev = prog.fighterMastery[fighterId] || { xp: 0, wins: 0, kos: 0 };
    prog.fighterMastery[fighterId] = { ...prev, xp: prev.xp + 25 };
  }
  if (prog.completedTrialIds.length >= 5 && !prog.careerMedals.includes('trial_master')) {
    prog.careerMedals.push('trial_master');
  }
  return writeArcadeProgress(prog);
}

export function recordTournamentCupWin(fighterId: string): ArcadeProgress {
  const prog = loadArcadeProgress();
  prog.tournamentWins += 1;
  const prev = prog.fighterMastery[fighterId] || { xp: 0, wins: 0, kos: 0 };
  prog.fighterMastery[fighterId] = { ...prev, xp: prev.xp + 180 };
  if (!prog.careerMedals.includes('cup_winner')) {
    prog.careerMedals.push('cup_winner');
  }
  return writeArcadeProgress(prog);
}

export function updateCareerAfterBout(params: {
  mode: GameMode;
  fighterId: string;
  winner: 'p1' | 'p2' | 'draw';
  p1Rounds: number;
  maxCombo: number;
  parries: number;
  guardBreaks: number;
  survivalStreak: number;
  dailyCompletedDate?: string | null;
}): { progress: ArcadeProgress; xpGained: number } {
  const prog = loadArcadeProgress();

  const xpGained =
    (params.winner === 'p1' ? 65 : 25) +
    params.p1Rounds * 12 +
    params.parries * 4 +
    (params.dailyCompletedDate ? 35 : 0);

  const prevMastery = prog.fighterMastery[params.fighterId] || { xp: 0, wins: 0, kos: 0 };
  prog.fighterMastery[params.fighterId] = {
    xp: prevMastery.xp + xpGained,
    wins: prevMastery.wins + (params.winner === 'p1' ? 1 : 0),
    kos: prevMastery.kos + params.p1Rounds,
  };

  if (params.winner === 'p1') {
    prog.totalWins += 1;
    if (!prog.careerMedals.includes('first_blood')) prog.careerMedals.push('first_blood');
    if (params.mode === 'tag' && !prog.careerMedals.includes('tag_champion')) {
      prog.careerMedals.push('tag_champion');
    }
  }

  prog.totalParries += params.parries;
  if (prog.totalParries >= 10 && !prog.careerMedals.includes('parry_master')) {
    prog.careerMedals.push('parry_master');
  }

  if (params.maxCombo > prog.maxComboEver) {
    prog.maxComboEver = params.maxCombo;
  }
  if (params.maxCombo >= 6 && !prog.careerMedals.includes('combo_king_6')) {
    prog.careerMedals.push('combo_king_6');
  }

  if (params.guardBreaks >= 1 && !prog.careerMedals.includes('shield_breaker')) {
    prog.careerMedals.push('shield_breaker');
  }

  if (params.survivalStreak > prog.bestSurvivalStreak) {
    prog.bestSurvivalStreak = params.survivalStreak;
  }
  if (prog.bestSurvivalStreak >= 5 && !prog.careerMedals.includes('survivor_5')) {
    prog.careerMedals.push('survivor_5');
  }

  if (params.dailyCompletedDate) {
    if (!prog.completedDailyDates.includes(params.dailyCompletedDate)) {
      prog.completedDailyDates.push(params.dailyCompletedDate);
    }
    if (!prog.careerMedals.includes('daily_victor')) {
      prog.careerMedals.push('daily_victor');
    }
  }

  return { progress: writeArcadeProgress(prog), xpGained };
}
