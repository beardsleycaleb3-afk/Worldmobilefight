import React from 'react';
import { Swords, Trophy, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { FIGHTERS } from '../data/fighters';

export interface CupBracketMatch {
  id: string;
  round: 'QF' | 'SF' | 'FINAL';
  aId: string | null;
  bId: string | null;
  winnerId: string | null;
}

export interface TournamentBracketState {
  playerId: string;
  qf: CupBracketMatch[]; // 4 matches (match 0 always contains playerId)
  sf: CupBracketMatch[]; // 2 matches
  final: CupBracketMatch; // 1 match
  currentStage: 'QF' | 'SF' | 'FINAL' | 'DONE';
  championId: string | null;
}

export function createTournamentBracket(playerId: string): TournamentBracketState {
  const others = FIGHTERS.filter((f) => f.id !== playerId).map((f) => f.id);
  // Deterministic rotation so seeding stays competitive
  const rotated = [...others.slice(2), ...others.slice(0, 2)];

  return {
    playerId,
    qf: [
      { id: 'qf-0', round: 'QF', aId: playerId, bId: rotated[0], winnerId: null },
      { id: 'qf-1', round: 'QF', aId: rotated[1], bId: rotated[2], winnerId: null },
      { id: 'qf-2', round: 'QF', aId: rotated[3], bId: rotated[4], winnerId: null },
      { id: 'qf-3', round: 'QF', aId: rotated[5], bId: rotated[6], winnerId: null },
    ],
    sf: [
      { id: 'sf-0', round: 'SF', aId: null, bId: null, winnerId: null },
      { id: 'sf-1', round: 'SF', aId: null, bId: null, winnerId: null },
    ],
    final: { id: 'final', round: 'FINAL', aId: null, bId: null, winnerId: null },
    currentStage: 'QF',
    championId: null,
  };
}

function simulateCpuMatch(aId: string | null, bId: string | null): string | null {
  if (!aId) return bId;
  if (!bId) return aId;
  const fa = FIGHTERS.find((f) => f.id === aId);
  const fb = FIGHTERS.find((f) => f.id === bId);
  if (!fa || !fb) return aId;
  const scoreA = fa.stats.power + fa.stats.speed + Math.random() * 24;
  const scoreB = fb.stats.power + fb.stats.speed + Math.random() * 24;
  return scoreA >= scoreB ? aId : bId;
}

export function advanceBracketWithPlayerResult(
  bracket: TournamentBracketState,
  playerWon: boolean
): TournamentBracketState {
  const next: TournamentBracketState = {
    playerId: bracket.playerId,
    qf: bracket.qf.map((m) => ({ ...m })),
    sf: bracket.sf.map((m) => ({ ...m })),
    final: { ...bracket.final },
    currentStage: bracket.currentStage,
    championId: bracket.championId,
  };

  if (bracket.currentStage === 'QF') {
    const pMatch = next.qf[0];
    pMatch.winnerId = playerWon ? bracket.playerId : pMatch.bId;
    next.qf[1].winnerId = simulateCpuMatch(next.qf[1].aId, next.qf[1].bId);
    next.qf[2].winnerId = simulateCpuMatch(next.qf[2].aId, next.qf[2].bId);
    next.qf[3].winnerId = simulateCpuMatch(next.qf[3].aId, next.qf[3].bId);

    next.sf[0].aId = next.qf[0].winnerId;
    next.sf[0].bId = next.qf[1].winnerId;
    next.sf[1].aId = next.qf[2].winnerId;
    next.sf[1].bId = next.qf[3].winnerId;

    if (!playerWon) {
      next.sf[0].winnerId = simulateCpuMatch(next.sf[0].aId, next.sf[0].bId);
      next.sf[1].winnerId = simulateCpuMatch(next.sf[1].aId, next.sf[1].bId);
      next.final.aId = next.sf[0].winnerId;
      next.final.bId = next.sf[1].winnerId;
      next.final.winnerId = simulateCpuMatch(next.final.aId, next.final.bId);
      next.championId = next.final.winnerId;
      next.currentStage = 'DONE';
    } else {
      next.currentStage = 'SF';
    }
    return next;
  }

  if (bracket.currentStage === 'SF') {
    const sf0 = next.sf[0];
    sf0.winnerId = playerWon ? bracket.playerId : sf0.bId;
    next.sf[1].winnerId = simulateCpuMatch(next.sf[1].aId, next.sf[1].bId);

    next.final.aId = sf0.winnerId;
    next.final.bId = next.sf[1].winnerId;

    if (!playerWon) {
      next.final.winnerId = simulateCpuMatch(next.final.aId, next.final.bId);
      next.championId = next.final.winnerId;
      next.currentStage = 'DONE';
    } else {
      next.currentStage = 'FINAL';
    }
    return next;
  }

  if (bracket.currentStage === 'FINAL') {
    next.final.winnerId = playerWon ? bracket.playerId : next.final.bId;
    next.championId = next.final.winnerId;
    next.currentStage = 'DONE';
    return next;
  }

  return next;
}

export function getNextTournamentOpponentId(bracket: TournamentBracketState): string | null {
  if (bracket.currentStage === 'QF') return bracket.qf[0].bId;
  if (bracket.currentStage === 'SF') return bracket.sf[0].bId;
  if (bracket.currentStage === 'FINAL') return bracket.final.bId;
  return null;
}

interface TournamentBracketModalProps {
  bracket: TournamentBracketState;
  tournamentWins: number;
  portraits: Record<string, string>;
  onStartNextMatch: () => void;
  onRestartCup: () => void;
  onClose: () => void;
}

function fighterTag(id: string | null): string {
  if (!id) return 'TBD';
  const f = FIGHTERS.find((item) => item.id === id);
  return f ? `${f.countryCode} · ${f.name.split(' ')[0]}` : 'TBD';
}

export const TournamentBracketModal: React.FC<TournamentBracketModalProps> = ({
  bracket,
  tournamentWins,
  portraits,
  onStartNextMatch,
  onRestartCup,
  onClose,
}) => {
  const champion = bracket.championId
    ? FIGHTERS.find((f) => f.id === bracket.championId) || null
    : null;
  const playerWonCup = bracket.championId === bracket.playerId;

  const nextStageLabel =
    bracket.currentStage === 'QF'
      ? 'FIGHT QUARTERFINAL'
      : bracket.currentStage === 'SF'
      ? 'FIGHT SEMIFINAL'
      : 'FIGHT GRAND FINAL';

  const renderMatchCard = (m: CupBracketMatch, highlightPlayer: boolean) => {
    const aWon = m.winnerId && m.winnerId === m.aId;
    const bWon = m.winnerId && m.winnerId === m.bId;
    return (
      <div
        key={m.id}
        className={`rounded-lg border px-2 py-1 text-[10px] font-mono-tabular ${
          highlightPlayer && !m.winnerId
            ? 'border-amber-400/80 bg-amber-500/10'
            : 'border-slate-800 bg-slate-950/90'
        }`}
      >
        <div
          className={`flex items-center justify-between truncate ${
            aWon
              ? 'font-extrabold text-amber-300'
              : m.aId === bracket.playerId
              ? 'font-bold text-white'
              : 'text-slate-300'
          }`}
        >
          <span className="truncate">{fighterTag(m.aId)}</span>
          {aWon && <span className="text-[9px] text-emerald-400">W</span>}
        </div>
        <div className="my-0.5 h-px bg-slate-800" />
        <div
          className={`flex items-center justify-between truncate ${
            bWon
              ? 'font-extrabold text-amber-300'
              : m.bId === bracket.playerId
              ? 'font-bold text-white'
              : 'text-slate-400'
          }`}
        >
          <span className="truncate">{fighterTag(m.bId)}</span>
          {bWon && <span className="text-[9px] text-emerald-400">W</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-3">
      <div className="flex max-h-[92%] w-full max-w-[332px] flex-col rounded-2xl border border-amber-500/50 bg-slate-900 p-3.5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-amber-400">
              8-NATION KNOCKOUT CUP · {tournamentWins} TITLES
            </div>
            <h2 className="font-display text-2xl font-extrabold leading-tight text-white">
              TOURNAMENT BRACKET
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              onClose();
            }}
            aria-label="Close Tournament Bracket"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Bracket Columns: QF -> SF -> FINAL */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 items-center">
          <div className="space-y-1.5">
            <div className="text-center text-[9px] font-bold tracking-wider text-slate-400">
              QUARTERFINALS
            </div>
            {bracket.qf.map((m, idx) => renderMatchCard(m, idx === 0 && bracket.currentStage === 'QF'))}
          </div>

          <div className="space-y-6">
            <div className="text-center text-[9px] font-bold tracking-wider text-slate-400">
              SEMIFINALS
            </div>
            {bracket.sf.map((m, idx) => renderMatchCard(m, idx === 0 && bracket.currentStage === 'SF'))}
          </div>

          <div className="space-y-2">
            <div className="text-center text-[9px] font-bold tracking-wider text-amber-400">
              GRAND FINAL
            </div>
            {renderMatchCard(bracket.final, bracket.currentStage === 'FINAL')}

            {champion && (
              <div
                className={`mt-2 flex flex-col items-center rounded-xl border p-2 text-center ${
                  playerWonCup
                    ? 'border-amber-400 bg-amber-500/15'
                    : 'border-rose-500/50 bg-rose-500/10'
                }`}
              >
                <Trophy
                  className={`h-5 w-5 ${playerWonCup ? 'text-amber-400' : 'text-rose-400'}`}
                />
                {portraits[champion.id] && (
                  <img
                    src={portraits[champion.id]}
                    alt={champion.name}
                    className="mt-1 h-10 w-10 rounded-lg border border-amber-400/60 object-cover"
                  />
                )}
                <div className="mt-1 text-[9px] font-extrabold text-white truncate w-full">
                  {champion.countryCode} CUP
                </div>
                <div className="text-[8px] font-bold text-amber-300">
                  {playerWonCup ? '+180 XP BONUS' : 'ELIMINATED'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2">
          {bracket.currentStage !== 'DONE' ? (
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                onStartNextMatch();
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950 active:scale-[0.98]"
            >
              <Swords className="h-5 w-5" />
              {nextStageLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                onRestartCup();
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950 active:scale-[0.98]"
            >
              <Trophy className="h-5 w-5" />
              NEW 8-NATION CUP
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              onClose();
            }}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200"
          >
            BACK TO ROSTER
          </button>
        </div>
      </div>
    </div>
  );
};
