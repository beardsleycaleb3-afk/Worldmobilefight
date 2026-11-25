import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Flame,
  Palette,
  Settings,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import type { FighterProfile } from '../data/fighters';
import type { GameMode, SkinVariant } from '../engine/combatTypes';
import type { DailyChallengeSpec } from '../storage/dailyChallenges';
import { getFighterMasteryTier, type FighterMasteryRecord } from '../storage/gameStorage';
import { PWAInstallButton } from './PWAInstallButton';

interface FighterSelectScreenProps {
  fighters: FighterProfile[];
  portraits: Record<string, string>;
  cachedIds: string[];
  goldenBeltIds: string[];
  fighterMastery: Record<string, FighterMasteryRecord>;
  tournamentWins: number;
  p1Id: string;
  p2Id: string;
  p1PartnerId: string;
  p1Skin: SkinVariant;
  p2Skin: SkinVariant;
  mode: GameMode;
  muted: boolean;
  dailyChallenge: DailyChallengeSpec;
  dailyCompleted: boolean;
  bestSurvivalStreak: number;
  onSelectP1: (id: string) => void;
  onSelectP2: (id: string) => void;
  onSelectP1Partner: (id: string) => void;
  onCycleP1Skin: () => void;
  onCycleP2Skin: () => void;
  onChangeMode: (mode: GameMode) => void;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onStartDaily: () => void;
  onStartMatch: () => void;
}

export const FighterSelectScreen: React.FC<FighterSelectScreenProps> = ({
  fighters,
  portraits,
  cachedIds,
  goldenBeltIds,
  fighterMastery,
  tournamentWins,
  p1Id,
  p2Id,
  p1PartnerId,
  p1Skin,
  p2Skin,
  mode,
  muted,
  dailyChallenge,
  dailyCompleted,
  bestSurvivalStreak,
  onSelectP1,
  onSelectP2,
  onSelectP1Partner,
  onCycleP1Skin,
  onCycleP2Skin,
  onChangeMode,
  onToggleMute,
  onOpenSettings,
  onOpenHistory,
  onStartDaily,
  onStartMatch,
}) => {
  const [slotMode, setSlotMode] = useState<'p1' | 'p2'>('p1');

  const p1 = fighters.find((f) => f.id === p1Id) || fighters[0];
  const p2 = fighters.find((f) => f.id === p2Id) || fighters[1];
  const p1Partner = fighters.find((f) => f.id === p1PartnerId) || fighters[2];

  const canPickSecondSlot = mode === 'versus' || mode === 'dojo' || mode === 'tag';
  const inspected =
    slotMode === 'p2' && mode === 'tag'
      ? p1Partner
      : slotMode === 'p2' && canPickSecondSlot
      ? p2
      : p1;
  const inspectedSkin = slotMode === 'p2' && (mode === 'versus' || mode === 'dojo') ? p2Skin : p1Skin;
  const hasGoldenBelt = goldenBeltIds.includes(inspected.id);
  const inspectedMastery = fighterMastery[inspected.id] || { xp: 0, wins: 0, kos: 0 };
  const inspectedTier = getFighterMasteryTier(inspectedMastery.xp);

  const handleCardTap = (id: string) => {
    soundEngine.unlock();
    soundEngine.playUiTap();
    if (slotMode === 'p1' || !canPickSecondSlot) {
      onSelectP1(id);
      if (mode === 'tag' && id === p1PartnerId) {
        const next = fighters.find((f) => f.id !== id);
        if (next) onSelectP1Partner(next.id);
      }
    } else if (mode === 'tag') {
      if (id !== p1Id) onSelectP1Partner(id);
    } else {
      onSelectP2(id);
    }
  };

  const ctaLabel =
    mode === 'arcade'
      ? 'START 7-STAGE ARCADE'
      : mode === 'tournament'
      ? `ENTER 8-NATION CUP${tournamentWins > 0 ? ` · ${tournamentWins}x` : ''}`
      : mode === 'tag'
      ? 'ENTER 2v2 TAG ARENA'
      : mode === 'survival'
      ? `SURVIVAL · BEST ${bestSurvivalStreak} KO`
      : mode === 'dojo'
      ? 'ENTER DOJO TRAINING'
      : mode === 'online'
      ? 'OPEN WI-FI ROOM LOBBY'
      : 'ENTER ARENA · BEST OF 3';

  return (
    <div className="flex h-full w-full flex-col justify-between bg-gradient-to-b from-[#101520] via-[#0b0e14] to-[#080a0f] px-3 py-2 select-none">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold leading-none tracking-wide text-white truncate">
            IRON TITAN 8
          </h1>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400 truncate">
            {cachedIds.length}/8 Cached · 480 PNG Stills
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playUiTap();
              onOpenHistory();
            }}
            aria-label="Bout History and Medals"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-amber-400 active:scale-95"
          >
            <Trophy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playUiTap();
              onOpenSettings();
            }}
            aria-label="Controls and Audio Settings"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 active:scale-95"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 active:scale-95"
          >
            {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 7-Mode Compact Grid */}
      <div className="mt-1 grid grid-cols-4 gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
        {(
          [
            { key: 'versus', label: 'VERSUS' },
            { key: 'arcade', label: 'ARCADE' },
            { key: 'tournament', label: '8-CUP' },
            { key: 'tag', label: 'TAG 2v2' },
            { key: 'survival', label: 'SURVIVAL' },
            { key: 'dojo', label: 'DOJO' },
            { key: 'online', label: 'WI-FI' },
          ] as Array<{ key: GameMode; label: string }>
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playUiTap();
              onChangeMode(m.key);
              if (
                m.key === 'arcade' ||
                m.key === 'tournament' ||
                m.key === 'online' ||
                m.key === 'survival'
              ) {
                setSlotMode('p1');
              }
            }}
            className={`min-h-[30px] rounded-lg text-[10px] font-extrabold tracking-wide whitespace-nowrap transition-colors ${
              mode === m.key
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Daily Challenge Strip */}
      <button
        type="button"
        onClick={() => {
          soundEngine.unlock();
          soundEngine.playUiTap();
          onStartDaily();
        }}
        className={`mt-1 flex min-h-[36px] w-full items-center justify-between rounded-xl border px-2.5 py-1 text-left transition-transform active:scale-[0.99] ${
          dailyCompleted
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/10'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Flame className={`h-3.5 w-3.5 shrink-0 ${dailyCompleted ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <div className="truncate text-[10px] font-extrabold text-white">
              DAILY: {dailyChallenge.p1.countryCode} vs {dailyChallenge.p2.countryCode} · {dailyChallenge.title}
            </div>
            <div className="truncate text-[9px] text-slate-300">{dailyChallenge.description}</div>
          </div>
        </div>
        <span
          className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold ${
            dailyCompleted
              ? 'bg-emerald-500/25 text-emerald-300'
              : 'bg-amber-500 text-slate-950'
          }`}
        >
          {dailyCompleted ? 'CLEARED' : 'PLAY'}
        </span>
      </button>

      {/* P1 / P2 (or Tag Partner) Slot Selector */}
      {canPickSecondSlot ? (
        <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/90 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playUiTap();
              setSlotMode('p1');
            }}
            className={`min-h-[38px] rounded-lg px-2 py-0.5 text-left transition-colors ${
              slotMode === 'p1'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="text-[9px] opacity-80">
              {mode === 'tag' ? 'P1 LEAD' : 'PLAYER 1'}
            </div>
            <div className="truncate text-[11px] font-extrabold">
              {p1.countryCode} · {p1.name}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playUiTap();
              setSlotMode('p2');
            }}
            className={`min-h-[38px] rounded-lg px-2 py-0.5 text-left transition-colors ${
              slotMode === 'p2'
                ? 'bg-rose-500 text-white font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="text-[9px] opacity-85">
              {mode === 'tag' ? 'P1 PARTNER' : mode === 'dojo' ? 'DUMMY' : 'OPPONENT'}
            </div>
            <div className="truncate text-[11px] font-extrabold">
              {mode === 'tag'
                ? `${p1Partner.countryCode} · ${p1Partner.name}`
                : `${p2.countryCode} · ${p2.name}`}
            </div>
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-1.5 text-xs">
          <span className="font-bold text-amber-400">
            {mode === 'arcade'
              ? '7-NATION LADDER'
              : mode === 'tournament'
              ? '8-NATION KNOCKOUT CUP'
              : mode === 'survival'
              ? 'ENDLESS GAUNTLET'
              : 'WI-FI FIGHTER'}
          </span>
          <span className="font-bold text-white truncate max-w-[155px]">
            {p1.countryCode} · {p1.name.split(' ')[0]}
          </span>
        </div>
      )}

      {/* Spotlight Card + Skin Toggle */}
      <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/75 p-1.5">
        <div
          className={`relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-xl border ${
            hasGoldenBelt ? 'border-amber-400' : 'border-slate-700'
          } bg-slate-950`}
        >
          {portraits[inspected.id] ? (
            <img
              src={portraits[inspected.id]}
              alt={`${inspected.name} portrait`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-slate-300">
              {inspected.countryCode}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-display text-base font-extrabold leading-none text-white">
              {inspected.name}
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.playUiTap();
                if (slotMode === 'p2' && (mode === 'versus' || mode === 'dojo')) {
                  onCycleP2Skin();
                } else {
                  onCycleP1Skin();
                }
              }}
              className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono-tabular font-bold text-amber-300 shrink-0 active:scale-95"
            >
              <Palette className="h-2.5 w-2.5" />
              {inspectedSkin.toUpperCase()}
            </button>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-400">
            <span className="truncate">
              {inspected.country} · {inspected.discipline}
            </span>
            <span className="flex items-center gap-0.5 font-mono-tabular text-amber-400 shrink-0">
              {hasGoldenBelt && <Award className="h-3 w-3" />}#{inspected.rank}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] font-mono-tabular">
            <span className="font-bold text-sky-300 whitespace-nowrap">
              LV.{inspectedTier.level} · {inspectedTier.rankTitle}
            </span>
            <div className="h-1 flex-1 overflow-hidden bg-slate-800">
              <div
                className="h-full bg-sky-400 transition-[width]"
                style={{ width: `${Math.round(inspectedTier.progressRatio * 100)}%` }}
              />
            </div>
            <span className="text-slate-400 shrink-0">{inspectedMastery.xp}XP</span>
          </div>
          <div className="mt-0.5 font-mono-tabular text-[9px] text-amber-300/95 truncate">
            Jab {Math.round(inspected.frameData.jab.startup * 1000)}ms · Wave:{' '}
            {inspected.frameData.projectile.name}
          </div>

          <div className="mt-1 grid grid-cols-3 gap-1.5 text-[9px] font-mono-tabular">
            <div>
              <div className="flex justify-between text-slate-400">
                <span>PWR</span>
                <span className="text-white">{inspected.stats.power}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${inspected.stats.power}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-400">
                <span>SPD</span>
                <span className="text-white">{inspected.stats.speed}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-sky-400" style={{ width: `${inspected.stats.speed}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-400">
                <span>RCH</span>
                <span className="text-white">{inspected.stats.reach}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${inspected.stats.reach}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8 Fighters 4x2 Grid */}
      <div className="mt-1 grid grid-cols-4 gap-1">
        {fighters.map((f) => {
          const isP1 = f.id === p1Id;
          const isSecond =
            mode === 'tag'
              ? f.id === p1PartnerId
              : (mode === 'versus' || mode === 'dojo') && f.id === p2Id;
          const isCached = cachedIds.includes(f.id);
          const isBelt = goldenBeltIds.includes(f.id);
          const fTier = getFighterMasteryTier((fighterMastery[f.id] || { xp: 0 }).xp);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => handleCardTap(f.id)}
              className={`relative flex flex-col items-center rounded-xl border p-1 transition-transform active:scale-95 min-h-[78px] ${
                isP1
                  ? 'border-amber-400 bg-amber-500/15'
                  : isSecond
                  ? 'border-rose-500 bg-rose-500/15'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="flex w-full items-center justify-between text-[8px] font-mono-tabular font-bold">
                <span className="text-slate-400">L{fTier.level}</span>
                <span className="flex items-center gap-0.5">
                  {isBelt && <Award className="h-2.5 w-2.5 text-amber-400" />}
                  {isCached && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />}
                  {isP1 && <span className="text-amber-300">P1</span>}
                  {isSecond && (
                    <span className="text-rose-400">{mode === 'tag' ? 'TAG' : 'CPU'}</span>
                  )}
                </span>
              </div>

              <div className="mt-0.5 h-10 w-10 overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
                {portraits[f.id] ? (
                  <img
                    src={portraits[f.id]}
                    alt={f.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                    {f.countryCode}
                  </div>
                )}
              </div>

              <span className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-white leading-tight">
                {f.countryCode}
              </span>
              <span className="w-full truncate text-center text-[8px] text-slate-400 leading-tight">
                {f.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Primary Action CTA */}
      <button
        type="button"
        onClick={() => {
          soundEngine.unlock();
          soundEngine.playUiTap();
          onStartMatch();
        }}
        className="mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 font-display text-xl font-extrabold tracking-wider text-slate-950 shadow-lg active:scale-[0.98] transition-transform"
      >
        {mode === 'online' ? <Wifi className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
        {ctaLabel}
      </button>
    </div>
  );
};
