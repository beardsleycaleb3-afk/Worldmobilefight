import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, RotateCcw, Settings, Users } from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { ConsoleController } from './components/ConsoleController';
import { FightHud } from './components/FightHud';
import { FighterSelectScreen } from './components/FighterSelectScreen';
import { HistorySheet } from './components/HistorySheet';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OnlineLobbyModal } from './components/OnlineLobbyModal';
import { SettingsSheet } from './components/SettingsSheet';
import {
  TournamentBracketModal,
  advanceBracketWithPlayerResult,
  createTournamentBracket,
  getNextTournamentOpponentId,
  type TournamentBracketState,
} from './components/TournamentBracketModal';
import { FIGHTERS } from './data/fighters';
import { bakeArenaBackdropPng } from './engine/arenaBaker';
import { CombatEngine } from './engine/combatEngine';
import type {
  DojoCpuMode,
  GameMode,
  HudSnapshot,
  InputHistoryEntry,
  MatchReplayData,
  SkinVariant,
  TouchControlState,
} from './engine/combatTypes';
import {
  bakeFighterPortraitPng,
  bakeFighterSheets,
  getCachedFighterIds,
  TOTAL_STILLS_PER_FIGHTER,
} from './engine/fighterBaker';
import { generateMatchStatCardPng } from './engine/statCardGenerator';
import { versusClient } from './network/versusClient';
import { evaluateDailyCondition, getDailyChallenge } from './storage/dailyChallenges';
import {
  loadArcadeProgress,
  loadMatchHistory,
  loadSettings,
  recordTournamentCupWin,
  recordTrialCompleted,
  saveMatchRecord,
  saveSettings,
  unlockGoldenBelt,
  updateCareerAfterBout,
  type ControlSettings,
} from './storage/gameStorage';

type ScreenPhase = 'SELECT' | 'BAKING' | 'FIGHT';

const SKIN_CYCLE: SkinVariant[] = ['default', 'gold', 'shadow'];

function nextSkin(current: SkinVariant): SkinVariant {
  return SKIN_CYCLE[(SKIN_CYCLE.indexOf(current) + 1) % SKIN_CYCLE.length];
}

const INITIAL_HUD: HudSnapshot = {
  p1Hp: 100,
  p2Hp: 100,
  p1Fury: 0,
  p2Fury: 0,
  p1Posture: 100,
  p2Posture: 100,
  p1Broken: false,
  p2Broken: false,
  p1PartnerHp: null,
  p2PartnerHp: null,
  p1PartnerName: null,
  p2PartnerName: null,
  p1ActiveName: 'Titan',
  p2ActiveName: 'Challenger',
  tagCooldown: 0,
  survivalStreak: 0,
  p1Rounds: 0,
  p2Rounds: 0,
  roundNumber: 1,
  timerSeconds: 60,
  bannerText: null,
  bannerSubtext: null,
  calloutText: null,
  frameAdvantageLabel: null,
  p1Combo: 0,
  p1ComboTimerRatio: 0,
  p1ComboDamage: 0,
  p1MaxCombo: 0,
  p2Combo: 0,
  p2ComboTimerRatio: 0,
  matchWinner: null,
  p1State: 'idle',
  p1StillFrame: 0,
  isSuddenDeath: false,
  victoryQuote: null,
  dojoTrialStep: 0,
  hapticEvent: null,
  matchStats: {
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
  },
};

interface LaunchOptions {
  role?: 'p1' | 'p2' | null;
  p1SkinOverride?: SkinVariant;
  p2SkinOverride?: SkinVariant;
  p1PartnerIdOverride?: string | null;
  p2PartnerIdOverride?: string | null;
  initialP1Hp?: number;
  initialP1Fury?: number;
  survivalStreak?: number;
  replayData?: MatchReplayData | null;
}

export default function App() {
  const [phase, setPhase] = useState<ScreenPhase>('SELECT');
  const [mode, setMode] = useState<GameMode>('versus');
  const [p1Id, setP1Id] = useState(FIGHTERS[0].id);
  const [p2Id, setP2Id] = useState(FIGHTERS[1].id);
  const [p1PartnerId, setP1PartnerId] = useState(FIGHTERS[2].id);
  const [p1Skin, setP1Skin] = useState<SkinVariant>('default');
  const [p2Skin, setP2Skin] = useState<SkinVariant>('default');

  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [bakeProgress, setBakeProgress] = useState({
    done: 0,
    total: TOTAL_STILLS_PER_FIGHTER * 2,
    fightersCount: 2,
  });
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchKey, setMatchKey] = useState(0);

  const [settings, setSettings] = useState<ControlSettings>(() => loadSettings());
  const [history, setHistory] = useState(() => loadMatchHistory());
  const [arcadeProgress, setArcadeProgress] = useState(() => loadArcadeProgress());

  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOnlineLobby, setShowOnlineLobby] = useState(false);

  const [dojoCpuMode, setDojoCpuMode] = useState<DojoCpuMode>('spar');
  const [dojoTrialIndex, setDojoTrialIndex] = useState(0);
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [inputHistory, setInputHistory] = useState<InputHistoryEntry[]>([]);

  // Arcade Ladder State
  const [arcadeOpponents, setArcadeOpponents] = useState<string[]>([]);
  const [arcadeStageIdx, setArcadeStageIdx] = useState(0);
  const [arcadeStartTime, setArcadeStartTime] = useState(0);
  const [arcadeJustCleared, setArcadeJustCleared] = useState(false);

  // 8-Nation Knockout Cup State
  const [tournamentBracket, setTournamentBracket] = useState<TournamentBracketState | null>(null);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [lastXpGained, setLastXpGained] = useState(0);

  // Daily Challenge State
  const [dailyChallenge] = useState(() => getDailyChallenge());
  const [activeDailyDate, setActiveDailyDate] = useState<string | null>(null);
  const [dailyJustCleared, setDailyJustCleared] = useState(false);

  // Survival Gauntlet State
  const [survivalStreak, setSurvivalStreak] = useState(0);

  // Online State
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [onlineRole, setOnlineRole] = useState<'p1' | 'p2' | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);

  // Replay State
  const [activeReplay, setActiveReplay] = useState<MatchReplayData | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2>(1);

  const recordedMatchIdRef = useRef<number>(-1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CombatEngine | null>(null);
  const touchInputRef = useRef<TouchControlState>({
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
  });

  const refreshCachedIds = useCallback(async () => {
    const ids = await getCachedFighterIds();
    setCachedIds(ids);
  }, []);

  useEffect(() => {
    soundEngine.setVolumes(settings.sfxVolume, settings.musicVolume);
  }, [settings.sfxVolume, settings.musicVolume]);

  useEffect(() => {
    refreshCachedIds();
    let cancelled = false;
    (async () => {
      for (const f of FIGHTERS) {
        if (cancelled) return;
        try {
          const url = await bakeFighterPortraitPng(f);
          if (!cancelled) {
            setPortraits((prev) => ({ ...prev, [f.id]: url }));
          }
        } catch {
          // Ignore individual errors
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCachedIds]);

  const p1Profile = FIGHTERS.find((f) => f.id === p1Id) || FIGHTERS[0];
  const p2Profile = FIGHTERS.find((f) => f.id === p2Id) || FIGHTERS[1];

  const handleUpdateSettings = (next: ControlSettings) => {
    setSettings(next);
    saveSettings(next);
    soundEngine.setVolumes(next.sfxVolume, next.musicVolume);
    engineRef.current?.setRunThreshold(next.runThreshold);
  };

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleInputEvent = useCallback((entry: InputHistoryEntry) => {
    setInputHistory((prev) => [entry, ...prev].slice(0, 10));
  }, []);

  const launchBout = useCallback(
    async (
      boutMode: GameMode,
      fighter1Id: string,
      fighter2Id: string,
      opts?: LaunchOptions
    ) => {
      const role = opts?.role ?? null;
      const f1 = FIGHTERS.find((f) => f.id === fighter1Id) || FIGHTERS[0];
      const f2 = FIGHTERS.find((f) => f.id === fighter2Id) || FIGHTERS[1];

      const s1 = opts?.p1SkinOverride ?? p1Skin;
      const rawS2 = opts?.p2SkinOverride ?? p2Skin;
      const s2: SkinVariant =
        fighter1Id === fighter2Id && s1 === rawS2 ? (s1 === 'shadow' ? 'gold' : 'shadow') : rawS2;

      const resolvedP1PartnerId =
        boutMode === 'tag'
          ? opts?.p1PartnerIdOverride ??
            (p1PartnerId !== fighter1Id
              ? p1PartnerId
              : FIGHTERS.find((f) => f.id !== fighter1Id)?.id || FIGHTERS[2].id)
          : null;
      const resolvedP2PartnerId =
        boutMode === 'tag'
          ? opts?.p2PartnerIdOverride ??
            (FIGHTERS.find(
              (f) => f.id !== fighter2Id && f.id !== fighter1Id && f.id !== resolvedP1PartnerId
            )?.id ||
              FIGHTERS.find((f) => f.id !== fighter2Id)?.id ||
              FIGHTERS[3].id)
          : null;

      const f1Partner = resolvedP1PartnerId
        ? FIGHTERS.find((f) => f.id === resolvedP1PartnerId) || null
        : null;
      const f2Partner = resolvedP2PartnerId
        ? FIGHTERS.find((f) => f.id === resolvedP2PartnerId) || null
        : null;

      const fightersCount = f1Partner && f2Partner ? 4 : 2;
      const totalFrames = TOTAL_STILLS_PER_FIGHTER * fightersCount;

      setPhase('BAKING');
      setPaused(false);
      setArcadeJustCleared(false);
      setDailyJustCleared(false);
      setLastXpGained(0);
      setInputHistory([]);
      setHud(INITIAL_HUD);
      setBakeProgress({ done: 0, total: totalFrames, fightersCount });

      const backdropPromise = bakeArenaBackdropPng(f2);
      const p1Assets = await bakeFighterSheets(
        f1,
        (done) => setBakeProgress({ done, total: totalFrames, fightersCount }),
        s1
      );
      const p2Assets = await bakeFighterSheets(
        f2,
        (done) =>
          setBakeProgress({
            done: TOTAL_STILLS_PER_FIGHTER + done,
            total: totalFrames,
            fightersCount,
          }),
        s2
      );

      let p1PartnerAssets = null;
      let p2PartnerAssets = null;
      if (f1Partner && f2Partner) {
        p1PartnerAssets = await bakeFighterSheets(
          f1Partner,
          (done) =>
            setBakeProgress({
              done: TOTAL_STILLS_PER_FIGHTER * 2 + done,
              total: totalFrames,
              fightersCount,
            }),
          s1
        );
        p2PartnerAssets = await bakeFighterSheets(
          f2Partner,
          (done) =>
            setBakeProgress({
              done: TOTAL_STILLS_PER_FIGHTER * 3 + done,
              total: totalFrames,
              fightersCount,
            }),
          s2
        );
      }

      const backdrop = await backdropPromise;
      refreshCachedIds();

      setPhase('FIGHT');

      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        engineRef.current?.destroy();
        const engine = new CombatEngine(
          canvas,
          backdrop,
          f1,
          p1Assets,
          f2,
          p2Assets,
          touchInputRef,
          (nextHud) => setHud(nextHud),
          {
            mode: boutMode,
            onlineRole: role,
            runThreshold: settings.runThreshold,
            showHitboxes: boutMode === 'dojo' ? showHitboxes : false,
            dojoCpuMode,
            dojoTrialIndex,
            p1Skin: s1,
            p2Skin: s2,
            p1Partner: f1Partner && p1PartnerAssets ? { profile: f1Partner, assets: p1PartnerAssets } : null,
            p2Partner: f2Partner && p2PartnerAssets ? { profile: f2Partner, assets: p2PartnerAssets } : null,
            initialP1Hp: opts?.initialP1Hp,
            initialP1Fury: opts?.initialP1Fury,
            survivalStreak: opts?.survivalStreak,
            replayData: opts?.replayData ?? null,
            onTrialComplete: (trialId, fighterId) => {
              const prog = recordTrialCompleted(trialId, fighterId);
              setArcadeProgress(prog);
            },
            onSendInput: (inp) => versusClient.sendCombatInput(inp),
            onSendState: (snap) => versusClient.sendCombatState(snap),
          }
        );
        engineRef.current = engine;

        if (boutMode === 'online' && !opts?.replayData) {
          versusClient.setCallbacks({
            onPingUpdate: (ms) => setPingMs(ms),
            onRemoteTaunt: (text, fromSlot) => engine.showTauntBanner(text, fromSlot),
            onRemoteInput: (inp) => engine.applyRemoteInput(inp),
            onRemoteState: (snap) => engine.applyRemoteState(snap),
            onPeerLeft: () => {
              engine.setPaused(true);
              setPaused(true);
            },
            onRematch: () => {
              setMatchKey((k) => k + 1);
              launchBout('online', fighter1Id, fighter2Id, { role });
            },
          });
        }

        engine.start();
      });
    },
    [dojoCpuMode, dojoTrialIndex, p1PartnerId, p1Skin, p2Skin, refreshCachedIds, settings.runThreshold, showHitboxes]
  );

  // Record match stats, replay & career progress once upon matchWinner settling
  useEffect(() => {
    if (!hud.matchWinner || mode === 'dojo' || activeReplay) return;
    if (recordedMatchIdRef.current === matchKey) return;
    recordedMatchIdRef.current = matchKey;

    const replay = engineRef.current?.getReplayData();
    const nextHist = saveMatchRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dateIso: new Date().toISOString(),
      mode,
      p1Id,
      p2Id,
      winner: hud.matchWinner,
      p1Rounds: hud.p1Rounds,
      p2Rounds: hud.p2Rounds,
      maxCombo: hud.p1MaxCombo,
      totalDamage: hud.matchStats.totalDamage,
      hitsLanded: hud.matchStats.hitsLanded,
      parries: hud.matchStats.parries,
      blocks: hud.matchStats.blocks,
      durationSeconds: hud.matchStats.durationSeconds,
      replay,
    });
    setHistory(nextHist);

    const clearedDaily =
      activeDailyDate === dailyChallenge.dateKey &&
      evaluateDailyCondition(
        dailyChallenge.conditionId,
        hud.matchWinner,
        hud.p1MaxCombo,
        hud.matchStats
      );
    if (clearedDaily) {
      setDailyJustCleared(true);
    }

    const { progress: updatedCareer, xpGained } = updateCareerAfterBout({
      mode,
      fighterId: p1Id,
      winner: hud.matchWinner,
      p1Rounds: hud.p1Rounds,
      maxCombo: hud.p1MaxCombo,
      parries: hud.matchStats.parries,
      guardBreaks: hud.matchStats.guardBreaks,
      survivalStreak: mode === 'survival' ? survivalStreak : 0,
      dailyCompletedDate: clearedDaily ? dailyChallenge.dateKey : null,
    });
    setLastXpGained(xpGained);
    let finalCareer = updatedCareer;

    if (mode === 'tournament' && tournamentBracket) {
      const wonMatch = hud.matchWinner === 'p1';
      const wasFinal = tournamentBracket.currentStage === 'FINAL';
      const nextBracket = advanceBracketWithPlayerResult(tournamentBracket, wonMatch);
      setTournamentBracket(nextBracket);
      if (wasFinal && wonMatch) {
        finalCareer = recordTournamentCupWin(p1Id);
      }
    }

    if (mode === 'arcade' && hud.matchWinner === 'p1' && arcadeStageIdx >= arcadeOpponents.length - 1) {
      const clearSecs = Math.max(1, Math.round((performance.now() - arcadeStartTime) / 1000));
      finalCareer = unlockGoldenBelt(p1Id, clearSecs);
      setArcadeJustCleared(true);
    }
    setArcadeProgress(finalCareer);
  }, [
    activeDailyDate,
    activeReplay,
    arcadeOpponents.length,
    arcadeStageIdx,
    arcadeStartTime,
    dailyChallenge.conditionId,
    dailyChallenge.dateKey,
    hud.matchStats,
    hud.matchWinner,
    hud.p1MaxCombo,
    hud.p1Rounds,
    hud.p2Rounds,
    matchKey,
    mode,
    p1Id,
    p2Id,
    survivalStreak,
    tournamentBracket,
  ]);

  const handleStartFromSelect = () => {
    setActiveReplay(null);
    setActiveDailyDate(null);

    if (mode === 'online') {
      setShowOnlineLobby(true);
      return;
    }
    if (mode === 'tournament') {
      const bracket = createTournamentBracket(p1Id);
      setTournamentBracket(bracket);
      setShowBracketModal(true);
      return;
    }
    if (mode === 'arcade') {
      const ladder = FIGHTERS.filter((f) => f.id !== p1Id)
        .sort((a, b) => b.rank - a.rank)
        .map((f) => f.id);
      setArcadeOpponents(ladder);
      setArcadeStageIdx(0);
      setArcadeStartTime(performance.now());
      setP2Id(ladder[0]);
      setMatchKey((k) => k + 1);
      launchBout('arcade', p1Id, ladder[0]);
      return;
    }
    if (mode === 'survival') {
      const firstOpp = FIGHTERS.find((f) => f.id !== p1Id)?.id || FIGHTERS[1].id;
      setSurvivalStreak(1);
      setP2Id(firstOpp);
      setMatchKey((k) => k + 1);
      launchBout('survival', p1Id, firstOpp, {
        initialP1Hp: 100,
        initialP1Fury: 0,
        survivalStreak: 1,
      });
      return;
    }
    if (mode === 'tag') {
      const cpuLead = FIGHTERS.find((f) => f.id !== p1Id && f.id !== p1PartnerId)?.id || p2Id;
      setP2Id(cpuLead);
      setMatchKey((k) => k + 1);
      launchBout('tag', p1Id, cpuLead, { p1PartnerIdOverride: p1PartnerId });
      return;
    }

    setMatchKey((k) => k + 1);
    launchBout(mode, p1Id, p2Id);
  };

  const handleLaunchNextTournamentMatch = () => {
    if (!tournamentBracket) return;
    const oppId = getNextTournamentOpponentId(tournamentBracket);
    if (!oppId) return;
    setShowBracketModal(false);
    setP2Id(oppId);
    setMatchKey((k) => k + 1);
    launchBout('tournament', tournamentBracket.playerId, oppId);
  };

  const handleStartDaily = () => {
    setActiveReplay(null);
    setMode('versus');
    setP1Id(dailyChallenge.p1.id);
    setP2Id(dailyChallenge.p2.id);
    setActiveDailyDate(dailyChallenge.dateKey);
    setMatchKey((k) => k + 1);
    launchBout('versus', dailyChallenge.p1.id, dailyChallenge.p2.id);
  };

  const handleNextArcadeStage = () => {
    soundEngine.playUiTap();
    const nextIdx = arcadeStageIdx + 1;
    if (nextIdx >= arcadeOpponents.length) return;
    const nextOpp = arcadeOpponents[nextIdx];
    setArcadeStageIdx(nextIdx);
    setP2Id(nextOpp);
    setMatchKey((k) => k + 1);
    launchBout('arcade', p1Id, nextOpp);
  };

  const handleNextSurvivalStage = () => {
    soundEngine.playUiTap();
    const nextStreak = survivalStreak + 1;
    const candidates = FIGHTERS.filter((f) => f.id !== p1Id && f.id !== p2Id);
    const nextOpp = candidates[nextStreak % candidates.length]?.id || FIGHTERS[1].id;
    const carryHp = Math.min(100, Math.max(25, hud.p1Hp) + 35);
    const carryFury = hud.p1Fury;
    setSurvivalStreak(nextStreak);
    setP2Id(nextOpp);
    setMatchKey((k) => k + 1);
    launchBout('survival', p1Id, nextOpp, {
      initialP1Hp: carryHp,
      initialP1Fury: carryFury,
      survivalStreak: nextStreak,
    });
  };

  const handleRematch = () => {
    soundEngine.playUiTap();
    engineRef.current?.destroy();
    if (activeReplay) {
      setMatchKey((k) => k + 1);
      launchBout(activeReplay.mode, activeReplay.p1Id, activeReplay.p2Id, {
        p1SkinOverride: activeReplay.p1Skin,
        p2SkinOverride: activeReplay.p2Skin,
        p1PartnerIdOverride: activeReplay.p1PartnerId ?? null,
        p2PartnerIdOverride: activeReplay.p2PartnerId ?? null,
        replayData: activeReplay,
      });
      return;
    }
    if (mode === 'online') {
      versusClient.sendRematch();
    }
    if (mode === 'survival') {
      setSurvivalStreak(1);
      setMatchKey((k) => k + 1);
      launchBout('survival', p1Id, p2Id, {
        initialP1Hp: 100,
        initialP1Fury: 0,
        survivalStreak: 1,
      });
      return;
    }
    setMatchKey((k) => k + 1);
    launchBout(mode, p1Id, p2Id, { role: onlineRole });
  };

  const handleBackToRoster = () => {
    soundEngine.playUiTap();
    engineRef.current?.destroy();
    engineRef.current = null;
    if (mode === 'online' && !activeReplay) {
      versusClient.leaveRoom();
      setOnlineRoomCode(null);
      setOnlineRole(null);
      setPingMs(null);
    }
    setActiveReplay(null);
    setActiveDailyDate(null);
    setPaused(false);
    setPhase('SELECT');
  };

  const handleWatchReplay = (replay: MatchReplayData) => {
    soundEngine.playUiTap();
    setShowHistory(false);
    setMode(replay.mode);
    setP1Id(replay.p1Id);
    setP2Id(replay.p2Id);
    if (replay.p1PartnerId) setP1PartnerId(replay.p1PartnerId);
    setActiveReplay(replay);
    setReplaySpeed(1);
    setActiveDailyDate(null);
    setMatchKey((k) => k + 1);
    launchBout(replay.mode, replay.p1Id, replay.p2Id, {
      p1SkinOverride: replay.p1Skin,
      p2SkinOverride: replay.p2Skin,
      p1PartnerIdOverride: replay.p1PartnerId ?? null,
      p2PartnerIdOverride: replay.p2PartnerId ?? null,
      replayData: replay,
    });
  };

  const handleToggleReplaySpeed = () => {
    soundEngine.playUiTap();
    setReplaySpeed((prev) => {
      const next = prev === 1 ? 2 : 1;
      engineRef.current?.setReplaySpeed(next);
      return next;
    });
  };

  const handleTogglePause = () => {
    soundEngine.playUiTap();
    setPaused((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  };

  const handleToggleHitboxes = () => {
    soundEngine.playUiTap();
    setShowHitboxes((prev) => {
      const next = !prev;
      engineRef.current?.setShowHitboxes(next);
      return next;
    });
  };

  const handleCycleDojoCpu = () => {
    soundEngine.playUiTap();
    const order: DojoCpuMode[] = ['spar', 'idle', 'guard', 'counter'];
    const next = order[(order.indexOf(dojoCpuMode) + 1) % order.length];
    setDojoCpuMode(next);
    engineRef.current?.setDojoCpuMode(next);
  };

  const handleCycleDojoTrial = () => {
    soundEngine.playUiTap();
    setDojoTrialIndex((prev) => {
      const next = (prev + 1) % 3;
      engineRef.current?.setDojoTrialIndex(next);
      return next;
    });
  };

  const handleTriggerTag = () => {
    engineRef.current?.triggerTagButton();
  };

  const handleSendTaunt = (text: string) => {
    soundEngine.playUiTap();
    versusClient.sendTaunt(text);
    engineRef.current?.showTauntBanner(text, onlineRole || 'p1');
  };

  const handleExportStatCard = async () => {
    if (!hud.matchWinner) return;
    soundEngine.playUiTap();
    const blob = await generateMatchStatCardPng({
      p1: p1Profile,
      p2: p2Profile,
      p1PortraitUrl: portraits[p1Profile.id] || '',
      p2PortraitUrl: portraits[p2Profile.id] || '',
      winner: hud.matchWinner,
      p1Rounds: hud.p1Rounds,
      p2Rounds: hud.p2Rounds,
      maxCombo: hud.p1MaxCombo,
      stats: hud.matchStats,
      modeLabel: mode,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iron-titan-${p1Profile.countryCode}-vs-${p2Profile.countryCode}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, [matchKey]);

  const bakePercent = Math.min(
    100,
    Math.round((bakeProgress.done / Math.max(1, bakeProgress.total)) * 100)
  );

  const isDailyCompleted = arcadeProgress.completedDailyDates.includes(dailyChallenge.dateKey);

  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-[#06080c] overflow-hidden">
      <div className="tcl-viewport-shell rounded-[24px] border-2 border-slate-800 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        <OfflineIndicator />

        {phase === 'SELECT' && (
          <FighterSelectScreen
            fighters={FIGHTERS}
            portraits={portraits}
            cachedIds={cachedIds}
            goldenBeltIds={arcadeProgress.goldenBeltUnlockedIds}
            fighterMastery={arcadeProgress.fighterMastery}
            tournamentWins={arcadeProgress.tournamentWins}
            p1Id={p1Id}
            p2Id={p2Id}
            p1PartnerId={p1PartnerId}
            p1Skin={p1Skin}
            p2Skin={p2Skin}
            mode={mode}
            muted={muted}
            dailyChallenge={dailyChallenge}
            dailyCompleted={isDailyCompleted}
            bestSurvivalStreak={arcadeProgress.bestSurvivalStreak}
            onSelectP1={setP1Id}
            onSelectP2={setP2Id}
            onSelectP1Partner={setP1PartnerId}
            onCycleP1Skin={() => setP1Skin((s) => nextSkin(s))}
            onCycleP2Skin={() => setP2Skin((s) => nextSkin(s))}
            onChangeMode={setMode}
            onToggleMute={handleToggleMute}
            onOpenSettings={() => setShowSettings(true)}
            onOpenHistory={() => setShowHistory(true)}
            onStartDaily={handleStartDaily}
            onStartMatch={handleStartFromSelect}
          />
        )}

        {phase === 'BAKING' && (
          <div className="flex h-full w-full flex-col items-center justify-between bg-[#0b0e14] px-5 py-8 text-center">
            <div className="text-xs font-bold tracking-widest text-amber-400">
              {activeReplay
                ? `LOADING REPLAY · ${p2Profile.arena.name.toUpperCase()}`
                : mode === 'arcade'
                ? `ARCADE STAGE ${arcadeStageIdx + 1}/7 · ${p2Profile.arena.name.toUpperCase()}`
                : mode === 'tournament' && tournamentBracket
                ? `8-NATION CUP ${tournamentBracket.currentStage} · ${p2Profile.arena.name.toUpperCase()}`
                : mode === 'survival'
                ? `SURVIVAL STREAK ${survivalStreak} · ${p2Profile.arena.name.toUpperCase()}`
                : activeDailyDate
                ? `DAILY TRIAL · ${dailyChallenge.title.toUpperCase()}`
                : p2Profile.arena.name.toUpperCase()}
            </div>

            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex flex-1 flex-col items-center">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-amber-400 bg-slate-900">
                  {portraits[p1Profile.id] && (
                    <img
                      src={portraits[p1Profile.id]}
                      alt={p1Profile.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <span className="mt-2 font-display text-lg font-bold text-white">
                  {p1Profile.name}
                </span>
                <span className="text-[11px] text-slate-400">{p1Profile.country}</span>
              </div>

              <div className="font-display text-3xl font-extrabold text-amber-500">VS</div>

              <div className="flex flex-1 flex-col items-center">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-rose-500 bg-slate-900">
                  {portraits[p2Profile.id] && (
                    <img
                      src={portraits[p2Profile.id]}
                      alt={p2Profile.name}
                      className="h-full w-full object-cover scale-x-[-1]"
                    />
                  )}
                </div>
                <span className="mt-2 font-display text-lg font-bold text-white">
                  {p2Profile.name}
                </span>
                <span className="text-[11px] text-slate-400">{p2Profile.country}</span>
              </div>
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-300">
                <span>Preparing Three.js PNG Stills</span>
                <span>{bakePercent}%</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-[width] duration-75"
                  style={{ width: `${bakePercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                480 Stills × {bakeProgress.fightersCount} Fighters · Idle / Walk / Run / Attack
              </p>
            </div>
          </div>
        )}

        {phase === 'FIGHT' && (
          <div className="relative flex h-full w-full flex-col justify-end">
            <canvas
              ref={canvasRef}
              width={720}
              height={1440}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            <FightHud
              p1={p1Profile}
              p2={p2Profile}
              hud={hud}
              mode={mode}
              arcadeStage={mode === 'arcade' ? arcadeStageIdx + 1 : undefined}
              onlineRoomCode={onlineRoomCode}
              onlineRole={onlineRole}
              pingMs={pingMs}
              showHitboxes={showHitboxes}
              dojoCpuMode={dojoCpuMode}
              dojoTrialIndex={dojoTrialIndex}
              completedTrialIds={arcadeProgress.completedTrialIds}
              inputHistory={inputHistory}
              isReplay={Boolean(activeReplay)}
              replaySpeed={replaySpeed}
              muted={muted}
              onToggleMute={handleToggleMute}
              onTogglePause={handleTogglePause}
              onToggleHitboxes={handleToggleHitboxes}
              onCycleDojoCpu={handleCycleDojoCpu}
              onCycleDojoTrial={handleCycleDojoTrial}
              onTriggerTag={handleTriggerTag}
              onSendTaunt={handleSendTaunt}
              onToggleReplaySpeed={handleToggleReplaySpeed}
              onExitReplay={handleBackToRoster}
            />

            <ConsoleController
              inputRef={touchInputRef}
              furyPercent={onlineRole === 'p2' ? hud.p2Fury : hud.p1Fury}
              signatureMove={
                onlineRole === 'p2' ? p2Profile.signatureMove : p1Profile.signatureMove
              }
              projectileName={
                onlineRole === 'p2'
                  ? p2Profile.frameData.projectile.name
                  : p1Profile.frameData.projectile.name
              }
              hapticEvent={hud.hapticEvent}
              hapticIntensity={settings.hapticIntensity}
              runThreshold={settings.runThreshold}
              swapButtons={settings.swapButtons}
              isTagMode={mode === 'tag'}
              tagCooldown={hud.tagCooldown}
              controlScale={settings.controlScale}
              thumbSpacing={settings.thumbSpacing}
              chassisOpacity={settings.chassisOpacity}
              disabled={Boolean(activeReplay)}
              onInputEvent={mode === 'dojo' ? handleInputEvent : undefined}
            />

            {/* Pause Modal */}
            {paused && !hud.matchWinner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5">
                <div className="w-full max-w-[280px] rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center shadow-2xl">
                  <h2 className="font-display text-3xl font-extrabold text-white">PAUSED</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {p1Profile.name} vs {p2Profile.name}
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePause}
                      className="min-h-[46px] w-full rounded-xl bg-amber-500 font-display text-lg font-extrabold text-slate-950"
                    >
                      RESUME FIGHT
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      CONTROLS & AUDIO
                    </button>
                    {mode !== 'online' && !activeReplay && (
                      <button
                        type="button"
                        onClick={handleRematch}
                        className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white"
                      >
                        RESTART BOUT
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleBackToRoster}
                      className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-slate-300"
                    >
                      EXIT TO ROSTER
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Match End / Victory Modal */}
            {hud.matchWinner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
                <div className="w-full max-w-[305px] rounded-2xl border border-amber-500/50 bg-slate-900 p-4 text-center shadow-2xl">
                  <div className="text-[11px] font-bold tracking-widest text-amber-400">
                    {activeReplay
                      ? `REPLAY COMPLETE · ${hud.p1Rounds} – ${hud.p2Rounds}`
                      : dailyJustCleared
                      ? 'DAILY CHALLENGE CLEARED!'
                      : arcadeJustCleared
                      ? 'GOLDEN BELT UNLOCKED!'
                      : `BOUT COMPLETE · ${hud.p1Rounds} – ${hud.p2Rounds}`}
                  </div>
                  <h2 className="mt-0.5 font-display text-3xl font-extrabold text-white">
                    {hud.matchWinner === 'p1'
                      ? `${p1Profile.name} WINS`
                      : hud.matchWinner === 'p2'
                      ? `${p2Profile.name} WINS`
                      : 'DRAW MATCH'}
                  </h2>

                  {hud.victoryQuote && (
                    <p className="mt-1 text-[10px] italic text-slate-300">
                      &ldquo;{hud.victoryQuote}&rdquo;
                    </p>
                  )}

                  {lastXpGained > 0 && !activeReplay && (
                    <div className="mt-1 font-mono-tabular text-[10px] font-bold text-sky-300">
                      +{lastXpGained} MASTERY XP · {p1Profile.name.split(' ')[0]}
                    </div>
                  )}

                  {activeDailyDate && !dailyJustCleared && (
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      Daily Goal: {dailyChallenge.description}
                    </p>
                  )}

                  {/* Match Breakdown Stats */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-2 font-mono-tabular text-[10px]">
                    <div>
                      <div className="text-slate-400">COMBO</div>
                      <div className="text-sm font-bold text-amber-300">{hud.p1MaxCombo}x</div>
                    </div>
                    <div>
                      <div className="text-slate-400">DAMAGE</div>
                      <div className="text-sm font-bold text-white">{hud.matchStats.totalDamage}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">PARRIES</div>
                      <div className="text-sm font-bold text-cyan-300">{hud.matchStats.parries}</div>
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-col gap-2">
                    {mode === 'tournament' && !activeReplay && tournamentBracket ? (
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playUiTap();
                          engineRef.current?.destroy();
                          engineRef.current = null;
                          setPhase('SELECT');
                          setShowBracketModal(true);
                        }}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950"
                      >
                        VIEW CUP BRACKET
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : mode === 'arcade' &&
                    !activeReplay &&
                    hud.matchWinner === 'p1' &&
                    arcadeStageIdx < arcadeOpponents.length - 1 ? (
                      <button
                        type="button"
                        onClick={handleNextArcadeStage}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950"
                      >
                        NEXT CHALLENGER ({arcadeStageIdx + 2}/7)
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : mode === 'survival' && !activeReplay && hud.matchWinner === 'p1' ? (
                      <button
                        type="button"
                        onClick={handleNextSurvivalStage}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950"
                      >
                        NEXT CHALLENGER (STREAK {survivalStreak + 1})
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRematch}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {activeReplay ? 'REPLAY AGAIN' : 'PLAY AGAIN'}
                      </button>
                    )}

                    {!activeReplay && (
                      <button
                        type="button"
                        onClick={handleExportStatCard}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/15 text-xs font-bold text-amber-300"
                      >
                        <Download className="h-4 w-4" />
                        SAVE PNG STAT CARD
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleBackToRoster}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white"
                    >
                      <Users className="h-4 w-4" />
                      SELECT FIGHTERS
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        {showSettings && (
          <SettingsSheet
            settings={settings}
            cachedCount={cachedIds.length}
            onUpdateSettings={handleUpdateSettings}
            onCacheUpdated={refreshCachedIds}
            onClose={() => setShowSettings(false)}
          />
        )}

        {showHistory && (
          <HistorySheet
            history={history}
            arcadeProgress={arcadeProgress}
            portraits={portraits}
            onWatchReplay={handleWatchReplay}
            onClose={() => setShowHistory(false)}
          />
        )}

        {showOnlineLobby && (
          <OnlineLobbyModal
            selectedFighterId={p1Id}
            onStartOnlineMatch={(code, role, f1Id, f2Id) => {
              setShowOnlineLobby(false);
              setOnlineRoomCode(code);
              setOnlineRole(role);
              setP1Id(f1Id);
              setP2Id(f2Id);
              setActiveReplay(null);
              setActiveDailyDate(null);
              setMatchKey((k) => k + 1);
              launchBout('online', f1Id, f2Id, { role });
            }}
            onClose={() => setShowOnlineLobby(false)}
          />
        )}

        {showBracketModal && tournamentBracket && (
          <TournamentBracketModal
            bracket={tournamentBracket}
            tournamentWins={arcadeProgress.tournamentWins}
            portraits={portraits}
            onStartNextMatch={handleLaunchNextTournamentMatch}
            onRestartCup={() => setTournamentBracket(createTournamentBracket(p1Id))}
            onClose={() => setShowBracketModal(false)}
          />
        )}
      </div>
    </main>
  );
}
