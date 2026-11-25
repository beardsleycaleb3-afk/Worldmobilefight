import React from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import type { FighterProfile } from '../data/fighters';
import type { HudSnapshot } from '../engine/combatTypes';

interface FightHudProps {
  p1: FighterProfile;
  p2: FighterProfile;
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
}

export const FightHud: React.FC<FightHudProps> = ({
  p1,
  p2,
  hud,
  muted,
  onToggleMute,
  onTogglePause,
}) => {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col px-2.5 pt-2">
      {/* Top 10% Compact Fight Bar */}
      <div className="flex items-start justify-between gap-1.5">
        {/* P1 Health & Fury */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-tight text-white">
            <span className="truncate">{p1.countryCode} · {p1.name.split(' ')[0]}</span>
            <span className="font-mono-tabular text-amber-300">HP {hud.p1Hp}</span>
          </div>
          <div className="mt-0.5 h-3 w-full overflow-hidden rounded-sm border border-slate-600/80 bg-slate-950/90">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-[width] duration-75"
              style={{ width: `${Math.max(0, hud.p1Hp)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
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
        </div>

        {/* Center Timer */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700/90 bg-slate-950/90 px-2 py-0.5 shrink-0">
          <span className="text-[9px] font-bold tracking-wider text-slate-400">
            R{hud.roundNumber}
          </span>
          <span className="font-mono-tabular text-lg font-extrabold leading-none text-white">
            {String(hud.timerSeconds).padStart(2, '0')}
          </span>
        </div>

        {/* P2 Health & Fury */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-tight text-white">
            <span className="font-mono-tabular text-amber-300">HP {hud.p2Hp}</span>
            <span className="truncate">{p2.name.split(' ')[0]} · {p2.countryCode}</span>
          </div>
          <div className="mt-0.5 h-3 w-full overflow-hidden rounded-sm border border-slate-600/80 bg-slate-950/90">
            <div
              className="ml-auto h-full bg-gradient-to-l from-rose-500 to-orange-400 transition-[width] duration-75"
              style={{ width: `${Math.max(0, hud.p2Hp)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-1.5">
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
        </div>
      </div>

      {/* Sub-row: Compact Utility Controls (44x44 touch targets) & Still Counter */}
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onClick={onTogglePause}
          aria-label="Pause Fight"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-slate-200 active:scale-95"
        >
          <Pause className="h-4 w-4" />
        </button>

        <div className="text-[10px] font-mono-tabular text-slate-300/90 bg-slate-950/75 px-2 py-0.5 rounded border border-slate-800">
          {hud.p1State.toUpperCase()} · STILL #{String(hud.p1StillFrame + 1).padStart(3, '0')}/480
        </div>

        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-slate-200 active:scale-95"
        >
          {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Dynamic Combo Meter */}
      <div className="mt-2.5 flex items-start justify-between">
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
              <span className="font-mono-tabular text-slate-400">
                BEST {hud.p1MaxCombo}x
              </span>
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

      {/* Center Round / KO Banner */}
      {hud.bannerText && (
        <div className="mt-16 flex flex-col items-center text-center">
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
