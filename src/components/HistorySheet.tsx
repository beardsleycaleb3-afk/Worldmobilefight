import React, { useState } from 'react';
import { Award, Download, Medal, Play, X } from 'lucide-react';
import { FIGHTERS } from '../data/fighters';
import type { MatchReplayData } from '../engine/combatTypes';
import { generateMatchStatCardPng } from '../engine/statCardGenerator';
import { CAREER_MEDALS } from '../storage/dailyChallenges';
import type { ArcadeProgress, MatchStatRecord } from '../storage/gameStorage';

interface HistorySheetProps {
  history: MatchStatRecord[];
  arcadeProgress: ArcadeProgress;
  portraits: Record<string, string>;
  onWatchReplay: (replay: MatchReplayData) => void;
  onClose: () => void;
}

export const HistorySheet: React.FC<HistorySheetProps> = ({
  history,
  arcadeProgress,
  portraits,
  onWatchReplay,
  onClose,
}) => {
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExportRecord = async (rec: MatchStatRecord) => {
    const p1 = FIGHTERS.find((f) => f.id === rec.p1Id);
    const p2 = FIGHTERS.find((f) => f.id === rec.p2Id);
    if (!p1 || !p2) return;
    setExportingId(rec.id);
    try {
      const blob = await generateMatchStatCardPng({
        p1,
        p2,
        p1PortraitUrl: portraits[p1.id] || '',
        p2PortraitUrl: portraits[p2.id] || '',
        winner: rec.winner,
        p1Rounds: rec.p1Rounds,
        p2Rounds: rec.p2Rounds,
        maxCombo: rec.maxCombo,
        stats: {
          totalDamage: rec.totalDamage,
          hitsLanded: rec.hitsLanded,
          parries: rec.parries,
          blocks: rec.blocks,
          guardBreaks: 0,
          specialsUsed: 0,
          jumpsUsed: 0,
          airJuggleHits: 0,
          clinchThrows: 0,
          springboards: 0,
          durationSeconds: rec.durationSeconds,
        },
        modeLabel: rec.mode,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iron-titan-${p1.countryCode}-vs-${p2.countryCode}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/75">
      <div className="flex max-h-[88%] w-full flex-col rounded-t-3xl border-t border-slate-700 bg-slate-900 p-4 pb-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-white">
            CAREER, MEDALS & REPLAYS
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Bout History"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Career Summary Strip */}
        <div className="mt-2 grid grid-cols-5 gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-2 text-center font-mono-tabular text-[10px]">
          <div>
            <div className="text-slate-400">WINS</div>
            <div className="text-sm font-bold text-white">{arcadeProgress.totalWins}</div>
          </div>
          <div>
            <div className="text-slate-400">CUPS</div>
            <div className="text-sm font-bold text-amber-400">{arcadeProgress.tournamentWins}</div>
          </div>
          <div>
            <div className="text-slate-400">PARRIES</div>
            <div className="text-sm font-bold text-cyan-300">{arcadeProgress.totalParries}</div>
          </div>
          <div>
            <div className="text-slate-400">MAX CMB</div>
            <div className="text-sm font-bold text-amber-300">{arcadeProgress.maxComboEver}x</div>
          </div>
          <div>
            <div className="text-slate-400">SURVIVAL</div>
            <div className="text-sm font-bold text-emerald-300">
              {arcadeProgress.bestSurvivalStreak}
            </div>
          </div>
        </div>

        {/* Career Medals */}
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Medal className="h-3.5 w-3.5 text-amber-400" />
              CAREER MEDALS
            </span>
            <span className="font-mono-tabular text-amber-300">
              {arcadeProgress.careerMedals.length}/{CAREER_MEDALS.length}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {CAREER_MEDALS.map((m) => {
              const unlocked = arcadeProgress.careerMedals.includes(m.id);
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-2 py-1 text-[10px] ${
                    unlocked
                      ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
                      : 'border-slate-800 bg-slate-900/60 text-slate-500'
                  }`}
                >
                  <div className="font-bold truncate">{m.title}</div>
                  <div className="text-[9px] truncate opacity-85">{m.description}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Golden Belt Unlocks */}
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-slate-950/70 p-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-amber-300">
            <span className="flex items-center gap-1">
              <Award className="h-3.5 w-3.5" />
              GOLDEN BELTS ({arcadeProgress.goldenBeltUnlockedIds.length}/{FIGHTERS.length})
            </span>
            <span className="font-mono-tabular text-slate-400">
              DAILY CLEARS: {arcadeProgress.completedDailyDates.length}
            </span>
          </div>
        </div>

        {/* Match History & Replay List */}
        <div className="mt-2.5 flex-1 space-y-2 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Complete a Versus, Arcade, Tag, or Survival bout to record stats and replays.
            </div>
          ) : (
            history.map((rec) => {
              const p1 = FIGHTERS.find((f) => f.id === rec.p1Id);
              const p2 = FIGHTERS.find((f) => f.id === rec.p2Id);
              if (!p1 || !p2) return null;
              return (
                <div
                  key={rec.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <span
                        className={
                          rec.winner === 'p1' ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {rec.winner === 'p1' ? 'WIN' : rec.winner === 'p2' ? 'LOSS' : 'DRAW'}
                      </span>
                      <span className="truncate">
                        {p1.countryCode} vs {p2.countryCode}
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {rec.p1Rounds}-{rec.p2Rounds}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-[10px] text-slate-400">
                      {rec.mode.toUpperCase()} · {rec.maxCombo}x · {rec.totalDamage} DMG
                    </div>
                  </div>
                  <div className="ml-1.5 flex items-center gap-1 shrink-0">
                    {rec.replay && rec.replay.frames.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onWatchReplay(rec.replay!)}
                        aria-label="Watch Match Replay"
                        className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-lg border border-sky-400/50 bg-sky-500/15 px-2 text-[10px] font-bold text-sky-300 active:scale-95"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleExportRecord(rec)}
                      disabled={exportingId === rec.id}
                      aria-label="Export PNG Card"
                      className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 text-[10px] font-bold text-amber-300 active:scale-95"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PNG
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
