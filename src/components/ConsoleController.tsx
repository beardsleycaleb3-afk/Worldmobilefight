import React, { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import type {
  HapticEventKind,
  HapticFeedbackEvent,
  InputHistoryEntry,
  TouchControlState,
} from '../engine/combatTypes';
import type { HapticIntensity } from '../storage/gameStorage';

interface ConsoleControllerProps {
  inputRef: { current: TouchControlState };
  furyPercent: number;
  signatureMove: string;
  projectileName: string;
  hapticEvent?: HapticFeedbackEvent | null;
  hapticIntensity: HapticIntensity;
  runThreshold: number;
  swapButtons: boolean;
  isTagMode?: boolean;
  tagCooldown?: number;
  controlScale?: number;
  thumbSpacing?: number;
  chassisOpacity?: number;
  disabled?: boolean;
  onInputEvent?: (entry: InputHistoryEntry) => void;
}

const HAPTIC_PATTERNS: Record<HapticEventKind, number | number[]> = {
  light_hit: 18,
  heavy_hit: [45, 20, 35],
  special_hit: [70, 25, 55, 25, 90],
  take_damage: [35, 25, 35],
  take_heavy_damage: [85, 30, 65],
  block: [20, 20, 15],
  parry: [25, 15, 48],
  guard_break: [95, 25, 75, 25, 95],
  rope_bounce: [32, 16, 26],
  tag_swap: [24, 18, 34],
  throw_tech: [28, 16, 40],
  ko: [110, 40, 80, 40, 140],
};

function vibrateWithIntensity(pattern: number | number[], intensity: HapticIntensity): void {
  if (intensity === 'off') return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const scale = intensity === 'light' ? 0.5 : 1;
  const scaled = Array.isArray(pattern)
    ? pattern.map((ms) => Math.max(6, Math.round(ms * scale)))
    : Math.max(6, Math.round(pattern * scale));
  try {
    navigator.vibrate(scaled);
  } catch {
    // Ignore blocked vibration before gesture
  }
}

const STICK_MAX_RADIUS = 38;

export const ConsoleController: React.FC<ConsoleControllerProps> = ({
  inputRef,
  furyPercent,
  signatureMove,
  projectileName,
  hapticEvent,
  hapticIntensity,
  runThreshold,
  swapButtons,
  isTagMode = false,
  tagCooldown = 0,
  controlScale = 1.0,
  thumbSpacing = 6,
  chassisOpacity = 1.0,
  disabled = false,
  onInputEvent,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const stickTouchIdRef = useRef<number | null>(null);
  const strikeTouchIdRef = useRef<number | null>(null);
  const powerTouchIdRef = useRef<number | null>(null);

  const [nubOffset, setNubOffset] = useState({ x: 0, y: 0 });
  const [activeDir, setActiveDir] = useState('CENTER');
  const [moveMode, setMoveMode] = useState<'IDLE' | 'WALK' | 'RUN'>('IDLE');
  const [strikePressed, setStrikePressed] = useState(false);
  const [powerPressed, setPowerPressed] = useState(false);
  const [strikeCharge, setStrikeCharge] = useState(0);
  const [dirMotionPrimed, setDirMotionPrimed] = useState(false);

  const strikeDownAtRef = useRef<number>(0);
  const powerDownAtRef = useRef<number>(0);
  const lastHapticIdRef = useRef<number>(0);
  const chargeReadyVibratedRef = useRef<boolean>(false);
  const prevMoveModeRef = useRef<'IDLE' | 'WALK' | 'RUN'>('IDLE');
  const dirHistoryRef = useRef<Array<{ dir: string; ts: number }>>([]);
  const motionPrimedUntilRef = useRef<number>(0);
  const inputSeqRef = useRef<number>(0);
  const lastInputTsRef = useRef<number>(performance.now());

  const emitTapeEvent = useCallback(
    (dir: string, button: InputHistoryEntry['button']) => {
      if (!onInputEvent) return;
      const now = performance.now();
      const frames = Math.min(99, Math.max(1, Math.round((now - lastInputTsRef.current) / 16.67)));
      lastInputTsRef.current = now;
      inputSeqRef.current += 1;
      onInputEvent({
        id: inputSeqRef.current,
        dir,
        button,
        framesSincePrev: frames,
      });
    },
    [onInputEvent]
  );

  useEffect(() => {
    if (!hapticEvent || hapticEvent.id === lastHapticIdRef.current) return;
    lastHapticIdRef.current = hapticEvent.id;
    vibrateWithIntensity(HAPTIC_PATTERNS[hapticEvent.kind], hapticIntensity);
  }, [hapticEvent, hapticIntensity]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (inputRef.current.strikeDown) {
        const held = now - strikeDownAtRef.current;
        const ratio = Math.min(1, Math.max(0, (held - 120) / 380));
        inputRef.current.strikeChargeRatio = ratio;
        setStrikeCharge(ratio);
        if (ratio >= 1 && !chargeReadyVibratedRef.current) {
          chargeReadyVibratedRef.current = true;
          vibrateWithIntensity([15, 25, 25], hapticIntensity);
        }
      } else {
        chargeReadyVibratedRef.current = false;
        if (inputRef.current.strikeChargeRatio !== 0) {
          inputRef.current.strikeChargeRatio = 0;
          setStrikeCharge(0);
        }
      }

      if (inputRef.current.powerDown) {
        inputRef.current.powerHoldMs = now - powerDownAtRef.current;
      } else {
        inputRef.current.powerHoldMs = 0;
      }

      if (now > motionPrimedUntilRef.current && dirMotionPrimed) {
        setDirMotionPrimed(false);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dirMotionPrimed, hapticIntensity, inputRef]);

  const recordDirectionGesture = useCallback(
    (dir: string) => {
      const now = performance.now();
      const hist = dirHistoryRef.current;
      const prev = hist[hist.length - 1];
      if (prev && prev.dir === dir) return;

      hist.push({ dir, ts: now });
      while (hist.length > 6) hist.shift();
      if (dir !== 'CENTER') emitTapeEvent(dir, null);

      const recent = hist.filter((h) => now - h.ts <= 420);
      const seq = recent.map((h) => h.dir).join(',');
      const hasQuarterCircle = /S,(SE|SW),(E|W)/.test(seq) || /S,(E|W)/.test(seq);
      const hasDoubleTap = /E,CENTER,E/.test(seq) || /W,CENTER,W/.test(seq);

      if (hasQuarterCircle || hasDoubleTap) {
        motionPrimedUntilRef.current = now + 420;
        setDirMotionPrimed(true);
      }
    },
    [emitTapeEvent]
  );

  const updateStickVector = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return;
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist > STICK_MAX_RADIUS) {
        dx = (dx / dist) * STICK_MAX_RADIUS;
        dy = (dy / dist) * STICK_MAX_RADIUS;
      }

      const normX = dx / STICK_MAX_RADIUS;
      const normY = dy / STICK_MAX_RADIUS;

      inputRef.current.moveX = normX;
      inputRef.current.moveY = normY;

      let dir = 'CENTER';
      if (dist > 7) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg >= -22.5 && deg < 22.5) dir = 'E';
        else if (deg >= 22.5 && deg < 67.5) dir = 'SE';
        else if (deg >= 67.5 && deg < 112.5) dir = 'S';
        else if (deg >= 112.5 && deg < 157.5) dir = 'SW';
        else if (deg >= 157.5 || deg < -157.5) dir = 'W';
        else if (deg >= -157.5 && deg < -112.5) dir = 'NW';
        else if (deg >= -112.5 && deg < -67.5) dir = 'N';
        else dir = 'NE';
      }

      inputRef.current.activeDir = dir;
      recordDirectionGesture(dir);
      setNubOffset({ x: dx, y: dy });
      setActiveDir(dir);

      const absX = Math.abs(normX);
      const nextMode = absX > runThreshold ? 'RUN' : absX > 0.16 ? 'WALK' : 'IDLE';
      if (nextMode === 'RUN' && prevMoveModeRef.current !== 'RUN') {
        vibrateWithIntensity(10, hapticIntensity);
      }
      prevMoveModeRef.current = nextMode;
      setMoveMode(nextMode);
    },
    [disabled, hapticIntensity, inputRef, recordDirectionGesture, runThreshold]
  );

  const resetStick = useCallback(() => {
    stickTouchIdRef.current = null;
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
    inputRef.current.activeDir = 'CENTER';
    recordDirectionGesture('CENTER');
    setNubOffset({ x: 0, y: 0 });
    setActiveDir('CENTER');
    prevMoveModeRef.current = 'IDLE';
    setMoveMode('IDLE');
  }, [inputRef, recordDirectionGesture]);

  const onPadTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (disabled) return;
    soundEngine.unlock();
    const touch = e.changedTouches[0];
    if (!touch) return;
    stickTouchIdRef.current = touch.identifier;
    updateStickVector(touch.clientX, touch.clientY);
  };

  const onPadTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (disabled) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === stickTouchIdRef.current) {
        updateStickVector(t.clientX, t.clientY);
        break;
      }
    }
  };

  const onPadTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stickTouchIdRef.current) {
        resetStick();
        break;
      }
    }
  };

  const fireStrikeAction = () => {
    if (disabled) return;
    const now = performance.now();
    // Simultaneous A+B triggers Clinch Grapple (close pocket) or Tag Swap (outside pocket in Tag Mode)
    if (inputRef.current.powerDown && now - powerDownAtRef.current <= 140) {
      inputRef.current.grappleTriggerCount += 1;
      if (isTagMode && tagCooldown <= 0) {
        inputRef.current.tagTriggerCount += 1;
      }
      emitTapeEvent(inputRef.current.activeDir, 'GRAB');
      return;
    }

    inputRef.current.strikeTriggerCount += 1;
    const isLauncher = Math.abs(inputRef.current.moveY) > 0.45;
    emitTapeEvent(inputRef.current.activeDir, isLauncher ? 'LAUNCH' : 'A');
  };

  const firePowerAction = () => {
    if (disabled) return;
    const now = performance.now();
    if (inputRef.current.strikeDown && now - strikeDownAtRef.current <= 140) {
      inputRef.current.grappleTriggerCount += 1;
      if (isTagMode && tagCooldown <= 0) {
        inputRef.current.tagTriggerCount += 1;
      }
      emitTapeEvent(inputRef.current.activeDir, 'GRAB');
      return;
    }

    if (now <= motionPrimedUntilRef.current && furyPercent >= 30) {
      inputRef.current.directionalSpecialCount += 1;
      motionPrimedUntilRef.current = 0;
      setDirMotionPrimed(false);
      emitTapeEvent(inputRef.current.activeDir, 'WAVE');
    } else {
      inputRef.current.powerTriggerCount += 1;
      emitTapeEvent(inputRef.current.activeDir, 'B');
    }
  };

  const onStrikeTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (disabled) return;
    soundEngine.unlock();
    const t = e.changedTouches[0];
    if (!t) return;
    strikeTouchIdRef.current = t.identifier;
    strikeDownAtRef.current = performance.now();
    inputRef.current.strikeDown = true;
    fireStrikeAction();
    setStrikePressed(true);
    vibrateWithIntensity(12, hapticIntensity);
  };

  const onStrikeTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === strikeTouchIdRef.current) {
        strikeTouchIdRef.current = null;
        inputRef.current.strikeDown = false;
        setStrikePressed(false);
        break;
      }
    }
  };

  const onPowerTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (disabled) return;
    soundEngine.unlock();
    const t = e.changedTouches[0];
    if (!t) return;
    powerTouchIdRef.current = t.identifier;
    powerDownAtRef.current = performance.now();
    inputRef.current.powerDown = true;
    firePowerAction();
    setPowerPressed(true);
    vibrateWithIntensity(12, hapticIntensity);
  };

  const onPowerTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === powerTouchIdRef.current) {
        powerTouchIdRef.current = null;
        inputRef.current.powerDown = false;
        setPowerPressed(false);
        break;
      }
    }
  };

  const isUp = activeDir === 'N' || activeDir === 'NE' || activeDir === 'NW';
  const isDown = activeDir === 'S' || activeDir === 'SE' || activeDir === 'SW';
  const isLeft = activeDir === 'W' || activeDir === 'NW' || activeDir === 'SW';
  const isRight = activeDir === 'E' || activeDir === 'NE' || activeDir === 'SE';
  const furyReady = furyPercent >= 50;
  const waveReady = dirMotionPrimed && furyPercent >= 30;

  const buttonA = (
    <button
      type="button"
      onTouchStart={onStrikeTouchStart}
      onTouchEnd={onStrikeTouchEnd}
      onTouchCancel={onStrikeTouchEnd}
      aria-label="Strike Combo Button"
      className={`arcade-btn-a relative flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full ${
        strikePressed ? 'pressed' : ''
      }`}
    >
      {strikeCharge > 0.05 && (
        <span
          style={{
            opacity: 0.35 + strikeCharge * 0.65,
            transform: `scale(${1 + strikeCharge * 0.14})`,
          }}
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white"
        />
      )}
      <span className="font-display text-2xl font-extrabold leading-none text-white">A</span>
      <span className="text-[9px] font-extrabold tracking-wide text-white/95">
        {isDown || isUp ? 'LAUNCH' : 'STRIKE'}
      </span>
    </button>
  );

  const buttonB = (
    <button
      type="button"
      onTouchStart={onPowerTouchStart}
      onTouchEnd={onPowerTouchEnd}
      onTouchCancel={onPowerTouchEnd}
      aria-label="Power and Guard Button"
      className={`arcade-btn-b relative flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full ${
        powerPressed ? 'pressed' : ''
      }`}
    >
      {(furyReady || waveReady) && (
        <span
          className={`pointer-events-none absolute -inset-1.5 rounded-full border-2 ${
            waveReady ? 'border-cyan-300' : 'border-amber-300/80'
          }`}
        />
      )}
      <span className="font-display text-2xl font-extrabold leading-none text-slate-950">B</span>
      <span className="text-[9px] font-extrabold tracking-wide text-slate-950/90">
        {waveReady ? 'WAVE' : furyReady ? 'FURY' : 'POWER'}
      </span>
    </button>
  );

  const safeScale = Math.max(0.85, Math.min(1.12, controlScale));
  const safeSpacing = Math.max(0, Math.min(24, thumbSpacing));
  const safeOpacity = disabled ? 0.65 : Math.max(0.65, Math.min(1.0, chassisOpacity));

  return (
    <div
      style={{ opacity: safeOpacity }}
      className="console-chassis relative z-20 flex h-[226px] w-full flex-col justify-between px-4 pt-2.5 pb-4 select-none transition-opacity"
    >
      <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400">
        <span className="font-mono-tabular whitespace-nowrap shrink-0">
          {disabled ? 'REPLAY PLAYBACK' : `PAD · ${moveMode}`}
        </span>
        <span className="truncate max-w-[205px] text-amber-400/90">
          {waveReady
            ? `WAVE · ${projectileName}`
            : furyReady
            ? `FURY READY · ${signatureMove}`
            : isTagMode
            ? 'A+B GRAB/TAG · ▼+A LAUNCH · ▼▶+B WAVE'
            : 'A+B GRAB · ROPE SPRING · ▼+A LAUNCH'}
        </span>
      </div>

      <div
        className="flex flex-1 items-center justify-between pt-1"
        style={{ paddingLeft: `${safeSpacing}px`, paddingRight: `${safeSpacing}px` }}
      >
        <div
          ref={padRef}
          onTouchStart={onPadTouchStart}
          onTouchMove={onPadTouchMove}
          onTouchEnd={onPadTouchEnd}
          onTouchCancel={onPadTouchEnd}
          role="application"
          aria-label="D-Pad and Analog Joystick"
          style={{ transform: `scale(${safeScale})`, transformOrigin: 'left center' }}
          className="dpad-well relative flex h-[154px] w-[154px] shrink-0 items-center justify-center rounded-full border-2 border-slate-700/80"
        >
          <div
            className={`pointer-events-none absolute inset-1.5 rounded-full border transition-colors ${
              dirMotionPrimed
                ? 'border-cyan-400/90'
                : moveMode === 'RUN'
                ? 'border-amber-400/75'
                : 'border-slate-700/40'
            }`}
          />

          <div className={`dpad-cross-arm pointer-events-none absolute top-2.5 h-10 w-10 rounded-t-lg ${isUp ? 'active' : ''}`} />
          <div className={`dpad-cross-arm pointer-events-none absolute bottom-2.5 h-10 w-10 rounded-b-lg ${isDown ? 'active' : ''}`} />
          <div className={`dpad-cross-arm pointer-events-none absolute left-2.5 h-10 w-10 rounded-l-lg ${isLeft ? 'active' : ''}`} />
          <div className={`dpad-cross-arm pointer-events-none absolute right-2.5 h-10 w-10 rounded-r-lg ${isRight ? 'active' : ''}`} />

          <span className="pointer-events-none absolute top-3.5 text-[9px] font-bold text-slate-300">▲</span>
          <span className="pointer-events-none absolute bottom-3.5 text-[9px] font-bold text-slate-300">▼</span>
          <span className="pointer-events-none absolute left-3.5 text-[9px] font-bold text-slate-300">◀</span>
          <span className="pointer-events-none absolute right-3.5 text-[9px] font-bold text-slate-300">▶</span>

          <div
            style={{
              transform: `translate3d(${nubOffset.x}px, ${nubOffset.y}px, 0)`,
            }}
            className={`joystick-nub pointer-events-none relative z-10 flex h-14 w-14 items-center justify-center rounded-full ${
              activeDir !== 'CENTER' ? 'active' : ''
            }`}
          >
            <div className="h-6 w-6 rounded-full border border-slate-500/40 bg-slate-900/60" />
          </div>
        </div>

        <div
          style={{ transform: `scale(${safeScale})`, transformOrigin: 'right center' }}
          className="flex shrink-0 items-center gap-3.5 pr-0.5"
        >
          <div className="mt-8 flex flex-col items-center gap-1.5">
            {swapButtons ? buttonA : buttonB}
          </div>
          <div className="-mt-7 flex flex-col items-center gap-1.5">
            {swapButtons ? buttonB : buttonA}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>360×720 · 720×1440 HD+</span>
        <span>480 PNG STILLS/FIGHTER</span>
      </div>
    </div>
  );
};
