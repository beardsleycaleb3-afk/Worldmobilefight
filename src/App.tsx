import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Users } from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { ConsoleController } from './components/ConsoleController';
import { FightHud } from './components/FightHud';
import { FighterSelectScreen } from './components/FighterSelectScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { FIGHTERS } from './data/fighters';
import { bakeArenaBackdropPng } from './engine/arenaBaker';
import { CombatEngine } from './engine/combatEngine';
import type { HudSnapshot, TouchControlState } from './engine/combatTypes';
import {
  bakeFighterPortraitPng,
  bakeFighterSheets,
  TOTAL_STILLS_PER_FIGHTER,
} from './engine/fighterBaker';

type ScreenPhase = 'SELECT' | 'BAKING' | 'FIGHT';

const INITIAL_HUD: HudSnapshot = {
  p1Hp: 100,
  p2Hp: 100,
  p1Fury: 0,
  p2Fury: 0,
  p1Rounds: 0,
  p2Rounds: 0,
  roundNumber: 1,
  timerSeconds: 60,
  bannerText: null,
  bannerSubtext: null,
  p1Combo: 0,
  p1ComboTimerRatio: 0,
  p1ComboDamage: 0,
  p1MaxCombo: 0,
  p2Combo: 0,
  p2ComboTimerRatio: 0,
  matchWinner: null,
  p1State: 'idle',
  p1StillFrame: 0,
  hapticEvent: null,
};

export default function App() {
  const [phase, setPhase] = useState<ScreenPhase>('SELECT');
  const [p1Id, setP1Id] = useState(FIGHTERS[0].id);
  const [p2Id, setP2Id] = useState(FIGHTERS[1].id);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [bakeProgress, setBakeProgress] = useState({ done: 0, total: TOTAL_STILLS_PER_FIGHTER * 2 });
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchKey, setMatchKey] = useState(0);

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
    strikeChargeRatio: 0,
    powerHoldMs: 0,
  });

  // Pre-bake 8 Three.js PNG portraits for the Fighter Select grid
  useEffect(() => {
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
          // Ignore individual portrait errors; fallback box renders cleanly
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const p1Profile = FIGHTERS.find((f) => f.id === p1Id) || FIGHTERS[0];
  const p2Profile = FIGHTERS.find((f) => f.id === p2Id) || FIGHTERS[1];

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const launchMatch = useCallback(async () => {
    setPhase('BAKING');
    setPaused(false);
    setHud(INITIAL_HUD);
    setBakeProgress({ done: 0, total: TOTAL_STILLS_PER_FIGHTER * 2 });

    const backdropPromise = bakeArenaBackdropPng(p2Profile);
    const p1Assets = await bakeFighterSheets(p1Profile, (done) => {
      setBakeProgress({ done, total: TOTAL_STILLS_PER_FIGHTER * 2 });
    });
    const p2Assets = await bakeFighterSheets(p2Profile, (done) => {
      setBakeProgress({
        done: TOTAL_STILLS_PER_FIGHTER + done,
        total: TOTAL_STILLS_PER_FIGHTER * 2,
      });
    });
    const backdrop = await backdropPromise;

    setPhase('FIGHT');

    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      engineRef.current?.destroy();
      const engine = new CombatEngine(
        canvas,
        backdrop,
        p1Profile,
        p1Assets,
        p2Profile,
        p2Assets,
        touchInputRef,
        (nextHud) => setHud(nextHud)
      );
      engineRef.current = engine;
      engine.start();
    });
  }, [p1Profile, p2Profile]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, [matchKey]);

  const handleTogglePause = () => {
    soundEngine.playUiTap();
    setPaused((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  };

  const handleRematch = () => {
    soundEngine.playUiTap();
    engineRef.current?.destroy();
    setMatchKey((k) => k + 1);
    launchMatch();
  };

  const handleBackToRoster = () => {
    soundEngine.playUiTap();
    engineRef.current?.destroy();
    engineRef.current = null;
    setPaused(false);
    setPhase('SELECT');
  };

  const bakePercent = Math.min(
    100,
    Math.round((bakeProgress.done / Math.max(1, bakeProgress.total)) * 100)
  );

  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-[#06080c] overflow-hidden">
      {/* TCL Ion V 360x720 Portrait Handheld Shell */}
      <div className="tcl-viewport-shell rounded-[24px] border-2 border-slate-800 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        <OfflineIndicator />

        {phase === 'SELECT' && (
          <FighterSelectScreen
            fighters={FIGHTERS}
            portraits={portraits}
            p1Id={p1Id}
            p2Id={p2Id}
            muted={muted}
            onSelectP1={setP1Id}
            onSelectP2={setP2Id}
            onToggleMute={handleToggleMute}
            onStartMatch={launchMatch}
          />
        )}

        {phase === 'BAKING' && (
          <div className="flex h-full w-full flex-col items-center justify-between bg-[#0b0e14] px-5 py-8 text-center">
            <div className="text-xs font-bold tracking-widest text-amber-400">
              {p2Profile.arena.name.toUpperCase()}
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
                <span>Baking Three.js PNG Stills</span>
                <span>{bakePercent}%</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-[width] duration-75"
                  style={{ width: `${bakePercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                480 Stills × 2 Fighters · Idle / Walk / Run / Attack
              </p>
            </div>
          </div>
        )}

        {phase === 'FIGHT' && (
          <div className="relative flex h-full w-full flex-col justify-end">
            {/* Native 720x1440 HD+ Canvas scaled crisply to 360x720 portrait viewport */}
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
              muted={muted}
              onToggleMute={handleToggleMute}
              onTogglePause={handleTogglePause}
            />

            <ConsoleController
              inputRef={touchInputRef}
              furyPercent={hud.p1Fury}
              signatureMove={p1Profile.signatureMove}
              hapticEvent={hud.hapticEvent}
            />

            {/* Pause Overlay */}
            {paused && !hud.matchWinner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5">
                <div className="w-full max-w-[280px] rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center shadow-2xl">
                  <h2 className="font-display text-3xl font-extrabold text-white">PAUSED</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {p1Profile.name} vs {p2Profile.name}
                  </p>
                  <div className="mt-4 flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={handleTogglePause}
                      className="min-h-[46px] w-full rounded-xl bg-amber-500 font-display text-lg font-extrabold text-slate-950"
                    >
                      RESUME FIGHT
                    </button>
                    <button
                      type="button"
                      onClick={handleRematch}
                      className="min-h-[46px] w-full rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white"
                    >
                      RESTART BOUT
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToRoster}
                      className="min-h-[46px] w-full rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-slate-300"
                    >
                      CHANGE FIGHTERS
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Match End / Victory Modal */}
            {hud.matchWinner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5">
                <div className="w-full max-w-[290px] rounded-2xl border border-amber-500/50 bg-slate-900 p-5 text-center shadow-2xl">
                  <div className="text-[11px] font-bold tracking-widest text-amber-400">
                    BOUT COMPLETE · {hud.p1Rounds} – {hud.p2Rounds}
                  </div>
                  <h2 className="mt-1 font-display text-3xl font-extrabold text-white">
                    {hud.matchWinner === 'p1'
                      ? `${p1Profile.name} WINS`
                      : hud.matchWinner === 'p2'
                      ? `${p2Profile.name} WINS`
                      : 'DRAW MATCH'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {hud.matchWinner === 'p1'
                      ? `${p1Profile.country} claims the Iron Titan belt`
                      : `${p2Profile.country} takes the round decision`}
                  </p>
                  <div className="mt-2 font-mono-tabular text-[11px] font-bold text-amber-300">
                    BEST COMBO · {hud.p1MaxCombo} HITS
                  </div>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={handleRematch}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-xl font-extrabold text-slate-950"
                    >
                      <RotateCcw className="h-4 w-4" />
                      PLAY AGAIN
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToRoster}
                      className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white"
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
      </div>
    </main>
  );
}
