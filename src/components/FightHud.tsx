import React from 'react';
import { ArrowLeftRight, Box, Check, FastForward, Pause, Volume2, VolumeX } from 'lucide-react';
import { getTrialsForFighter } from '../data/comboTrials';
import type { FighterProfile } from '../data/fighters';
import type {
  DojoCpuMode,
  GameMode,
  HudSnapshot,
  InputHistoryEntry,
} from '../engine/combatTypes';

interface FightHudProps {
  p1: FighterProfile;
  p2: FighterProfile;
  hud: HudSnapshot;
  mode: GameMode;
  arcadeStage?: number;
  onlineRoomCode?: string | null;
  onlineRole?: 'p1' | 'p2' | null;
  pingMs?: number | null;
  showHitboxes?: boolean;
  dojoCpuMode?: DojoCpuMode;
  dojoTrialIndex?: number;
  completedTrialIds?: string[];
  inputHistory?: InputHistoryEntry[];
  isReplay?: boolean;
  replaySpeed?: 1 | 2;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onToggleHitboxes?: () => void;
  onCycleDojoCpu?: () => void;
  onCycleDojoTrial?: () => void;
  onTriggerTag?: () => void;
  onSendTaunt?: (text: string) => void;
  onToggleReplaySpeed?: () => void;
  onExitReplay?: () => void;
}

const DIR_GLYPHS: Record<string, string> = {
  N: '▲',
  NE: '◥',
  E: '▶',
  SE: '◢',
  S: '▼',
  SW: '◣',
  W: '◀',
  NW: '◤',
  CENTER: '●',
};

export const FightHud: React.FC<FightHudProps> = ({
  p1,
  p2,
  hud,
  mode,
  arcadeStage,
  onlineRoomCode,
  onlineRole,
  pingMs,
  showHitboxes,
  dojoCpuMode,
  dojoTrialIndex = 0,
  completedTrialIds = [],
  inputHistory = [],
  isReplay = false,
  replaySpeed = 1,
  muted,
  onToggleMute,
  onTogglePause,
  onToggleHitboxes,
  onCycleDojoCpu,
  onCycleDojoTrial,
  onTriggerTag,
  onSendTaunt,
  onToggleReplaySpeed,
  onExitReplay,
}) => {
  const trials = mode === 'dojo' ? getTrialsForFighter(p1.id) : [];
  const activeTrial = trials.length > 0 ? trials[dojoTrialIndex % trials.length] : null;
  const trialCleared = activeTrial ? completedTrialIds.includes(activeTrial.id) : false;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col px-2.5 pt-2">
      {/* Top Compact Fight Bar */}
      <div className="flex items-start justify-between gap-1.5">
        {/* P1 Health, Fury & Posture */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-tight text-white">
            <span className="truncate">
              {p1.countryCode} · {hud.p1ActiveName}
            </span>
            <span className="font-mono-tabular text-amber-300">HP {hud.p1Hp}</span>
          </div>
          <div className="mt-0.5 h-3 w-full overflow-hidden rounded-sm border border-slate-600/80 bg-slate-950/90">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-[width] duration-75"
              style={{ width: `${Math.max(0, hud.p1Hp)}%` }}
            />
          </div>

          {/* Guard Posture Meter */}
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm bg-slate-950/90">
            <div
              className={`h-full transition-[width] duration-75 ${
                hud.p1Broken ? 'bg-rose-500' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.max(0, hud.p1Posture)}%` }}
            />
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-1.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-950/90 border border-slate-700/70">
              <div
                className="h-full bg-amber-400 transition-[width] duration-75"
                style={{ width: `${Math.max(0, hud.p1Fury)}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              {[0, 1].map((idx) => (
                <span
                  key={idx}
                  className={`h-2 w-2 rounded-full border ${
                    hud.p1Rounds > idx
                      ? 'border-amber-300 bg-amber-400'
                      : 'border-slate-500 bg-slate-900'
                  }`}
                />
              ))}
            </div>
          </div>

          {mode === 'tag' && hud.p1PartnerHp !== null && (
            <div className="mt-0.5 flex items-center gap-1 text-[9px] font-mono-tabular text-slate-300">
              <span className="shrink-0">{hud.p1PartnerName}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-sm bg-slate-900">
                <div
                  className="h-full bg-emerald-400/80"
                  style={{ width: `${Math.max(0, hud.p1PartnerHp)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center Timer */}
        <div
          className={`flex flex-col items-center justify-center rounded-lg border px-2 py-0.5 shrink-0 ${
            hud.isSuddenDeath
              ? 'border-rose-500 bg-rose-950/90'
              : 'border-slate-700/90 bg-slate-950/90'
          }`}
        >
          <span
            className={`text-[9px] font-bold tracking-wider ${
              hud.isSuddenDeath ? 'text-rose-300' : 'text-slate-400'
            }`}
          >
            {isReplay
              ? 'RPL'
              : hud.isSuddenDeath
              ? 'OT'
              : mode === 'dojo'
              ? 'DOJO'
              : mode === 'survival'
              ? `S-${hud.survivalStreak}`
              : mode === 'tag'
              ? '2v2'
              : mode === 'tournament'
              ? 'CUP'
              : `R${hud.roundNumber}`}
          </span>
          <span
            className={`font-mono-tabular text-lg font-extrabold leading-none ${
              hud.isSuddenDeath ? 'text-amber-300' : 'text-white'
            }`}
          >
            {mode === 'dojo' ? '∞' : String(hud.timerSeconds).padStart(2, '0')}
          </span>
        </div>

        {/* P2 Health, Fury & Posture */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-tight text-white">
            <span className="font-mono-tabular text-amber-300">HP {hud.p2Hp}</span>
            <span className="truncate">
              {hud.p2ActiveName} · {p2.countryCode}
            </span>
          </div>
          <div className="mt-0.5 h-3 w-full overflow-hidden rounded-sm border border-slate-600/80 bg-slate-950/90">
            <div
              className="ml-auto h-full bg-gradient-to-l from-rose-500 to-orange-400 transition-[width] duration-75"
              style={{ width: `${Math.max(0, hud.p2Hp)}%` }}
            />
          </div>

          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm bg-slate-950/90">
            <div
              className={`ml-auto h-full transition-[width] duration-75 ${
                hud.p2Broken ? 'bg-rose-500' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.max(0, hud.p2Posture)}%` }}
            />
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              {[0, 1].map((idx) => (
                <span
                  key={idx}
                  className={`h-2 w-2 rounded-full border ${
                    hud.p2Rounds > idx
                      ? 'border-amber-300 bg-amber-400'
                      : 'border-slate-500 bg-slate-900'
                  }`}
                />
              ))}
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-950/90 border border-slate-700/70">
              <div
                className="ml-auto h-full bg-amber-400 transition-[width] duration-75"
                style={{ width: `${Math.max(0, hud.p2Fury)}%` }}
              />
            </div>
          </div>

          {mode === 'tag' && hud.p2PartnerHp !== null && (
            <div className="mt-0.5 flex items-center gap-1 text-[9px] font-mono-tabular text-slate-300">
              <div className="h-1 flex-1 overflow-hidden rounded-sm bg-slate-900">
                <div
                  className="ml-auto h-full bg-rose-400/80"
                  style={{ width: `${Math.max(0, hud.p2PartnerHp)}%` }}
                />
              </div>
              <span className="shrink-0">{hud.p2PartnerName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sub-row: Utility Controls & Mode Telemetry */}
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onTouchStart={(e) => e.stopPropagation()}
          onClick={isReplay ? onExitReplay : onTogglePause}
          aria-label={isReplay ? 'Exit Replay' : 'Pause Fight'}
          className="pointer-events-auto flex h-11 min-w-[44px] items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 px-2 text-xs font-bold text-slate-200 active:scale-95 shrink-0"
        >
          {isReplay ? 'EXIT' : <Pause className="h-4 w-4" />}
        </button>

        {isReplay ? (
          <button
            type="button"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onToggleReplaySpeed}
            className="pointer-events-auto flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-400/60 bg-slate-950/85 px-3 text-[11px] font-mono-tabular font-bold text-amber-300"
          >
            <FastForward className="h-3.5 w-3.5" />
            REPLAY {replaySpeed}x
          </button>
        ) : mode === 'dojo' ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onToggleHitboxes}
              className={`pointer-events-auto flex min-h-[44px] items-center gap-1 rounded-lg border px-2.5 text-[10px] font-bold active:scale-95 ${
                showHitboxes
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-950/80 text-slate-300'
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              HITBOX
            </button>
            <button
              type="button"
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onCycleDojoCpu}
              className="pointer-events-auto min-h-[44px] rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 text-[10px] font-bold text-amber-300 active:scale-95"
            >
              CPU: {(dojoCpuMode || 'spar').toUpperCase()}
            </button>
          </div>
        ) : mode === 'tag' ? (
          <button
            type="button"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onTriggerTag}
            disabled={hud.tagCooldown > 0 || (hud.p1PartnerHp ?? 0) <= 0}
            className={`pointer-events-auto flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-[10px] font-extrabold active:scale-95 ${
              hud.tagCooldown > 0 || (hud.p1PartnerHp ?? 0) <= 0
                ? 'border-slate-800 bg-slate-950/75 text-slate-500'
                : 'border-amber-400 bg-amber-500/20 text-amber-300'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {hud.tagCooldown > 0
              ? `TAG ${hud.tagCooldown.toFixed(1)}s`
              : `TAG · ${hud.p1PartnerName}`}
          </button>
        ) : (
          <div className="text-[10px] font-mono-tabular text-slate-300/90 bg-slate-950/75 px-2 py-0.5 rounded border border-slate-800 truncate">
            {mode === 'arcade' && arcadeStage
              ? `ARCADE ${arcadeStage}/7 · #${String(hud.p1StillFrame + 1).padStart(3, '0')}`
              : mode === 'survival'
              ? `SURVIVAL · KO STREAK ${hud.survivalStreak}`
              : mode === 'tournament'
              ? `8-NATION CUP · #${String(hud.p1StillFrame + 1).padStart(3, '0')}`
              : mode === 'online' && onlineRoomCode
              ? `ROOM ${onlineRoomCode} · ${onlineRole?.toUpperCase()}${
                  typeof pingMs === 'number' ? ` · ${pingMs}ms` : ''
                }`
              : `${hud.p1State.toUpperCase()} · STILL #${String(hud.p1StillFrame + 1).padStart(3, '0')}/480`}
          </div>
        )}

        <button
          type="button"
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-slate-200 active:scale-95 shrink-0"
        >
          {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Online Quick Taunts Bar */}
      {mode === 'online' && onSendTaunt && !isReplay && (
        <div className="mt-1 flex items-center justify-center gap-1.5">
          {['BOW!', 'BRING IT!', 'GG!'].map((t) => (
            <button
              key={t}
              type="button"
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => onSendTaunt(t)}
              className="pointer-events-auto min-h-[32px] rounded-md border border-sky-500/40 bg-slate-950/80 px-2.5 text-[10px] font-bold text-sky-300 active:scale-95"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Dojo Frame Advantage Readout */}
      {mode === 'dojo' && hud.frameAdvantageLabel && (
        <div className="mt-1 self-center rounded border border-emerald-500/40 bg-slate-950/85 px-2.5 py-0.5 font-mono-tabular text-[10px] font-bold text-emerald-300">
          {hud.frameAdvantageLabel}
        </div>
      )}

      {/* Dojo Combo Trial Mission + Input Tape */}
      {mode === 'dojo' && activeTrial && (
        <div className="mt-1.5 flex items-start justify-between gap-2">
          {inputHistory.length > 0 ? (
            <div className="flex flex-col gap-0.5 rounded-lg border border-slate-800 bg-slate-950/80 px-1.5 py-1">
              {inputHistory.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 font-mono-tabular text-[10px] text-slate-200"
                >
                  <span className="w-4 text-center text-sky-300">
                    {DIR_GLYPHS[item.dir] || '●'}
                  </span>
                  {item.button && (
                    <span
                      className={`rounded px-1 text-[9px] font-extrabold ${
                        item.button === 'WAVE'
                          ? 'bg-cyan-400 text-slate-950'
                          : item.button === 'LAUNCH'
                          ? 'bg-amber-400 text-slate-950'
                          : item.button === 'GRAB'
                          ? 'bg-emerald-400 text-slate-950'
                          : item.button === 'A'
                          ? 'bg-rose-500 text-white'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {item.button}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-500">{item.framesSincePrev}f</span>
                </div>
              ))}
            </div>
          ) : (
            <div />
          )}

          <div className="pointer-events-auto max-w-[205px] rounded-lg border border-amber-500/40 bg-slate-950/90 px-2 py-1.5 text-left">
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[9px] font-extrabold tracking-wide text-amber-300">
                TRIAL {(dojoTrialIndex % 3) + 1}/3 · {activeTrial.title.toUpperCase()}
              </span>
              {onCycleDojoTrial && (
                <button
                  type="button"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={onCycleDojoTrial}
                  className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-200 active:scale-95"
                >
                  NEXT
                </button>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {activeTrial.steps.map((step, idx) => {
                const done = trialCleared || hud.dojoTrialStep > idx;
                const active = !trialCleared && hud.dojoTrialStep === idx;
                return (
                  <div
                    key={`${activeTrial.id}-${idx}`}
                    className={`flex items-center justify-between gap-2 text-[9px] font-mono-tabular ${
                      done
                        ? 'text-emerald-300'
                        : active
                        ? 'font-bold text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    <span className="truncate">
                      {idx + 1}. {step.label}
                    </span>
                    {done && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                  </div>
                );
              })}
            </div>
            {trialCleared && (
              <div className="mt-1 text-[8px] font-extrabold tracking-wider text-emerald-400">
                TRIAL CLEARED (+25 XP)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Combo Meter */}
      <div className="mt-2 flex items-start justify-between">
        {hud.p1Combo > 1 ? (
          <div className="w-[144px] rounded-lg border border-amber-400/70 bg-slate-950/90 px-2.5 py-1.5 shadow-xl">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-xl font-extrabold leading-none text-amber-400">
                {hud.p1Combo}x COMBO
              </span>
              <span className="font-mono-tabular text-[10px] font-bold text-white">
                {hud.p1ComboDamage} DMG
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] font-bold tracking-wider text-amber-200/90">
              <span>
                {hud.p1Combo >= 9
                  ? 'TITANIC'
                  : hud.p1Combo >= 6
                  ? 'UNSTOPPABLE'
                  : hud.p1Combo >= 4
                  ? 'BRUTAL'
                  : 'RUSH'}
              </span>
              <span className="font-mono-tabular text-slate-400">BEST {hud.p1MaxCombo}x</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-75"
                style={{ width: `${Math.round(hud.p1ComboTimerRatio * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div />
        )}

        {hud.p2Combo > 1 && (
          <div className="w-[122px] rounded-lg border border-rose-500/70 bg-slate-950/90 px-2.5 py-1.5 text-right shadow-xl">
            <div className="font-display text-lg font-extrabold leading-none text-rose-400">
              {hud.p2Combo}x CPU COMBO
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="ml-auto h-full bg-rose-500 transition-[width] duration-75"
                style={{ width: `${Math.round(hud.p2ComboTimerRatio * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Callout Banner */}
      {hud.calloutText && (
        <div className="mt-3 self-center rounded-md border border-cyan-400/70 bg-slate-950/90 px-3 py-1 font-display text-xl font-extrabold tracking-wider text-cyan-300 shadow-lg">
          {hud.calloutText}
        </div>
      )}

      {/* Center Round / KO Banner */}
      {hud.bannerText && (
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="rounded-xl border border-amber-400/60 bg-slate-950/90 px-6 py-3 shadow-2xl">
            <div className="font-display text-4xl font-extrabold tracking-wider text-amber-400">
              {hud.bannerText}
            </div>
            {hud.bannerSubtext && (
              <div className="mt-0.5 text-xs font-bold tracking-wide text-white">
                {hud.bannerSubtext}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
