import React, { useState } from 'react';
import { Swords, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import type { FighterProfile } from '../data/fighters';
import { PWAInstallButton } from './PWAInstallButton';

interface FighterSelectScreenProps {
  fighters: FighterProfile[];
  portraits: Record<string, string>;
  p1Id: string;
  p2Id: string;
  muted: boolean;
  onSelectP1: (id: string) => void;
  onSelectP2: (id: string) => void;
  onToggleMute: () => void;
  onStartMatch: () => void;
}

export const FighterSelectScreen: React.FC<FighterSelectScreenProps> = ({
  fighters,
  portraits,
  p1Id,
  p2Id,
  muted,
  onSelectP1,
  onSelectP2,
  onToggleMute,
  onStartMatch,
}) => {
  const [slotMode, setSlotMode] = useState<'p1' | 'p2'>('p1');

  const p1 = fighters.find((f) => f.id === p1Id) || fighters[0];
  const p2 = fighters.find((f) => f.id === p2Id) || fighters[1];
  const inspected = slotMode === 'p1' ? p1 : p2;

  const handleCardTap = (id: string) => {
    soundEngine.unlock();
    soundEngine.playUiTap();
    if (slotMode === 'p1') {
      onSelectP1(id);
      if (id === p2Id) {
        const next = fighters.find((f) => f.id !== id);
        if (next) onSelectP2(next.id);
      }
    } else {
      onSelectP2(id);
      if (id === p1Id) {
        const next = fighters.find((f) => f.id !== id);
        if (next) onSelectP1(next.id);
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col justify-between bg-gradient-to-b from-[#101520] via-[#0b0e14] to-[#080a0f] px-3.5 py-3 select-none">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold leading-none tracking-wide text-white">
            IRON TITAN 8
          </h1>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
            World Heavyweight Touch Arena · 480 Stills
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <PWAInstallButton />
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

      {/* Slot Toggle (Pick Your Fighter vs Pick Opponent) */}
      <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/90 p-1 border border-slate-800">
        <button
          type="button"
          onClick={() => {
            soundEngine.unlock();
            soundEngine.playUiTap();
            setSlotMode('p1');
          }}
          className={`min-h-[44px] rounded-lg px-2 py-1.5 text-left transition-colors ${
            slotMode === 'p1'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="text-[10px] opacity-80">PLAYER 1 (YOU)</div>
          <div className="truncate text-xs font-extrabold">{p1.countryCode} · {p1.name}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.unlock();
            soundEngine.playUiTap();
            setSlotMode('p2');
          }}
          className={`min-h-[44px] rounded-lg px-2 py-1.5 text-left transition-colors ${
            slotMode === 'p2'
              ? 'bg-rose-500 text-white font-bold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="text-[10px] opacity-85">OPPONENT (CPU)</div>
          <div className="truncate text-xs font-extrabold">{p2.countryCode} · {p2.name}</div>
        </button>
      </div>

      {/* Spotlight Card for Inspected Fighter */}
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-2.5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
          {portraits[inspected.id] ? (
            <img
              src={portraits[inspected.id]}
              alt={`${inspected.name} portrait`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-slate-300"
              style={{ backgroundColor: `${inspected.appearance.trunksHex}33` }}
            >
              {inspected.countryCode}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-display text-xl font-extrabold leading-none text-white">
              {inspected.name}
            </span>
            <span className="font-mono-tabular text-[11px] font-bold text-amber-400 shrink-0">
              #{inspected.rank}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400 truncate">
            {inspected.country} ({inspected.populationLabel}) · {inspected.discipline}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-amber-300/95 truncate">
            Finisher: {inspected.signatureMove}
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px] font-mono-tabular">
            <div>
              <div className="flex justify-between text-slate-400">
                <span>PWR</span>
                <span className="text-white">{inspected.stats.power}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${inspected.stats.power}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-400">
                <span>SPD</span>
                <span className="text-white">{inspected.stats.speed}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-sky-400" style={{ width: `${inspected.stats.speed}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-400">
                <span>RCH</span>
                <span className="text-white">{inspected.stats.reach}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${inspected.stats.reach}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8 Fighters 4x2 Touch Grid */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {fighters.map((f) => {
          const isP1 = f.id === p1Id;
          const isP2 = f.id === p2Id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => handleCardTap(f.id)}
              className={`relative flex flex-col items-center rounded-xl border p-1.5 transition-transform active:scale-95 min-h-[96px] ${
                isP1
                  ? 'border-amber-400 bg-amber-500/15'
                  : isP2
                  ? 'border-rose-500 bg-rose-500/15'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
              }`}
            >
              <div className="flex w-full items-center justify-between text-[9px] font-mono-tabular font-bold">
                <span className="text-slate-400">#{f.rank}</span>
                {isP1 && <span className="text-amber-300">P1</span>}
                {isP2 && <span className="text-rose-400">CPU</span>}
              </div>

              <div className="mt-0.5 h-12 w-12 overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
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

              <span className="mt-1 w-full truncate text-center text-[10px] font-bold text-white">
                {f.countryCode}
              </span>
              <span className="w-full truncate text-center text-[9px] text-slate-400">
                {f.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Primary Fight Launch CTA */}
      <button
        type="button"
        onClick={() => {
          soundEngine.unlock();
          soundEngine.playUiTap();
          onStartMatch();
        }}
        className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 font-display text-xl font-extrabold tracking-wider text-slate-950 shadow-lg active:scale-[0.98] transition-transform"
      >
        <Swords className="h-5 w-5" />
        ENTER ARENA · BEST OF 3
      </button>
    </div>
  );
};
