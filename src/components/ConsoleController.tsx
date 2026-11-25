import React, { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import type { HapticEventKind, HapticFeedbackEvent, TouchControlState } from '../engine/combatTypes';

interface ConsoleControllerProps {
  inputRef: { current: TouchControlState };
  furyPercent: number;
  signatureMove: string;
  hapticEvent?: HapticFeedbackEvent | null;
}

const HAPTIC_PATTERNS: Record<HapticEventKind, number | number[]> = {
  light_hit: 18,
  heavy_hit: [45, 20, 35],
  special_hit: [70, 25, 55, 25, 90],
  take_damage: [35, 25, 35],
  take_heavy_damage: [85, 30, 65],
  block: [20, 20, 15],
  ko: [110, 40, 80, 40, 140],
};

function vibrateSafe(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore environments that block vibration prior to gesture
    }
  }
}

const STICK_MAX_RADIUS = 38;

export const ConsoleController: React.FC<ConsoleControllerProps> = ({
  inputRef,
  furyPercent,
  signatureMove,
  hapticEvent,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const stickTouchIdRef = useRef<number | null>(null);
  const strikeTouchIdRef = useRef<number | null>(null);
  const powerTouchIdRef = useRef<number | null>(null);
  const mouseActiveRef = useRef<'stick' | 'strike' | 'power' | null>(null);

  const [nubOffset, setNubOffset] = useState({ x: 0, y: 0 });
  const [activeDir, setActiveDir] = useState('CENTER');
  const [moveMode, setMoveMode] = useState<'IDLE' | 'WALK' | 'RUN'>('IDLE');
  const [strikePressed, setStrikePressed] = useState(false);
  const [powerPressed, setPowerPressed] = useState(false);
  const [strikeCharge, setStrikeCharge] = useState(0);

  const strikeDownAtRef = useRef<number>(0);
  const powerDownAtRef = useRef<number>(0);
  const lastHapticIdRef = useRef<number>(0);
  const chargeReadyVibratedRef = useRef<boolean>(false);
  const prevMoveModeRef = useRef<'IDLE' | 'WALK' | 'RUN'>('IDLE');

  // Fire combat impact / damage haptic waveforms from engine events
  useEffect(() => {
    if (!hapticEvent || hapticEvent.id === lastHapticIdRef.current) return;
    lastHapticIdRef.current = hapticEvent.id;
    vibrateSafe(HAPTIC_PATTERNS[hapticEvent.kind]);
  }, [hapticEvent]);

  // Update hold durations smoothly for charge/guard feedback
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
          vibrateSafe([15, 25, 25]);
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

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inputRef]);

  const updateStickVector = useCallback(
    (clientX: number, clientY: number) => {
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
      setNubOffset({ x: dx, y: dy });
      setActiveDir(dir);

      const absX = Math.abs(normX);
      const nextMode = absX > 0.72 ? 'RUN' : absX > 0.16 ? 'WALK' : 'IDLE';
      if (nextMode === 'RUN' && prevMoveModeRef.current !== 'RUN') {
        vibrateSafe(10);
      }
      prevMoveModeRef.current = nextMode;
      setMoveMode(nextMode);
    },
    [inputRef]
  );

  const resetStick = useCallback(() => {
    stickTouchIdRef.current = null;
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
    inputRef.current.activeDir = 'CENTER';
    setNubOffset({ x: 0, y: 0 });
    setActiveDir('CENTER');
    setMoveMode('IDLE');
  }, [inputRef]);

  // Multi-touch D-Pad / Joystick handlers
  const onPadTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    soundEngine.unlock();
    const touch = e.changedTouches[0];
    if (!touch) return;
    stickTouchIdRef.current = touch.identifier;
    updateStickVector(touch.clientX, touch.clientY);
  };

  const onPadTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
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

  // Mouse fallback for desktop testing (does not interfere with TouchEvents)
  const onPadMouseDown = (e: React.MouseEvent) => {
    soundEngine.unlock();
    mouseActiveRef.current = 'stick';
    updateStickVector(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      if (mouseActiveRef.current === 'stick') {
        updateStickVector(e.clientX, e.clientY);
      }
    };
    const onWinMouseUp = () => {
      if (mouseActiveRef.current === 'stick') {
        mouseActiveRef.current = null;
        resetStick();
      } else if (mouseActiveRef.current === 'strike') {
        mouseActiveRef.current = null;
        inputRef.current.strikeDown = false;
        setStrikePressed(false);
      } else if (mouseActiveRef.current === 'power') {
        mouseActiveRef.current = null;
        inputRef.current.powerDown = false;
        setPowerPressed(false);
      }
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [inputRef, resetStick, updateStickVector]);

  const triggerHaptic = () => {
    vibrateSafe(12);
  };

  // Action Button A (Strike / Hold Charge)
  const onStrikeTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    soundEngine.unlock();
    const t = e.changedTouches[0];
    if (!t) return;
    strikeTouchIdRef.current = t.identifier;
    strikeDownAtRef.current = performance.now();
    inputRef.current.strikeDown = true;
    inputRef.current.strikeTriggerCount += 1;
    setStrikePressed(true);
    triggerHaptic();
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

  // Action Button B (Power / Hold Iron Guard)
  const onPowerTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    soundEngine.unlock();
    const t = e.changedTouches[0];
    if (!t) return;
    powerTouchIdRef.current = t.identifier;
    powerDownAtRef.current = performance.now();
    inputRef.current.powerDown = true;
    inputRef.current.powerTriggerCount += 1;
    setPowerPressed(true);
    triggerHaptic();
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

  return (
    <div className="console-chassis relative z-20 flex h-[226px] w-full flex-col justify-between px-4 pt-2.5 pb-4 select-none">
      {/* Top Recessed Trim Line */}
      <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400">
        <span className="font-mono-tabular">
          PAD · {moveMode}
        </span>
        <span className="truncate max-w-[165px] text-amber-400/90">
          {furyReady ? `FURY READY · ${signatureMove}` : 'HOLD A CHARGE · HOLD B GUARD'}
        </span>
      </div>

      {/* Main Dual-Thumb Console Controls */}
      <div className="flex flex-1 items-center justify-between pt-1">
        {/* LEFT: D-Pad + Analog Joystick Combo */}
        <div
          ref={padRef}
          onTouchStart={onPadTouchStart}
          onTouchMove={onPadTouchMove}
          onTouchEnd={onPadTouchEnd}
          onTouchCancel={onPadTouchEnd}
          onMouseDown={onPadMouseDown}
          role="application"
          aria-label="D-Pad and Analog Joystick"
          className="dpad-well relative flex h-[154px] w-[154px] items-center justify-center rounded-full border-2 border-slate-700/80"
        >
          {/* Outer RUN ring feedback */}
          <div
            className={`pointer-events-none absolute inset-1.5 rounded-full border transition-colors ${
              moveMode === 'RUN' ? 'border-amber-400/75' : 'border-slate-700/40'
            }`}
          />

          {/* Sculpted CSS3 D-Pad Cross Arms */}
          <div
            className={`dpad-cross-arm pointer-events-none absolute top-2.5 h-10 w-10 rounded-t-lg ${
              isUp ? 'active' : ''
            }`}
          />
          <div
            className={`dpad-cross-arm pointer-events-none absolute bottom-2.5 h-10 w-10 rounded-b-lg ${
              isDown ? 'active' : ''
            }`}
          />
          <div
            className={`dpad-cross-arm pointer-events-none absolute left-2.5 h-10 w-10 rounded-l-lg ${
              isLeft ? 'active' : ''
            }`}
          />
          <div
            className={`dpad-cross-arm pointer-events-none absolute right-2.5 h-10 w-10 rounded-r-lg ${
              isRight ? 'active' : ''
            }`}
          />

          {/* Directional Labels */}
          <span className="pointer-events-none absolute top-3.5 text-[9px] font-bold text-slate-300">
            ▲
          </span>
          <span className="pointer-events-none absolute bottom-3.5 text-[9px] font-bold text-slate-300">
            ▼
          </span>
          <span className="pointer-events-none absolute left-3.5 text-[9px] font-bold text-slate-300">
            ◀
          </span>
          <span className="pointer-events-none absolute right-3.5 text-[9px] font-bold text-slate-300">
            ▶
          </span>

          {/* Floating Analog Joystick Nub */}
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

        {/* RIGHT: Two Custom Arcade Action Buttons (A: Strike, B: Power/Guard) */}
        <div className="flex items-center gap-3.5 pr-0.5">
          {/* Button B (Lower-Left Offset Ergonomic Thumb Arc) */}
          <div className="mt-8 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onTouchStart={onPowerTouchStart}
              onTouchEnd={onPowerTouchEnd}
              onTouchCancel={onPowerTouchEnd}
              onMouseDown={() => {
                soundEngine.unlock();
                mouseActiveRef.current = 'power';
                powerDownAtRef.current = performance.now();
                inputRef.current.powerDown = true;
                inputRef.current.powerTriggerCount += 1;
                setPowerPressed(true);
              }}
              aria-label="Power and Guard Button"
              className={`arcade-btn-b relative flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full ${
                powerPressed ? 'pressed' : ''
              }`}
            >
              {furyReady && (
                <span className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-amber-300/80" />
              )}
              <span className="font-display text-2xl font-extrabold leading-none text-slate-950">
                B
              </span>
              <span className="text-[9px] font-extrabold tracking-wide text-slate-950/90">
                {furyReady ? 'FURY' : 'POWER'}
              </span>
            </button>
          </div>

          {/* Button A (Upper-Right Offset Ergonomic Thumb Arc) */}
          <div className="-mt-7 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onTouchStart={onStrikeTouchStart}
              onTouchEnd={onStrikeTouchEnd}
              onTouchCancel={onStrikeTouchEnd}
              onMouseDown={() => {
                soundEngine.unlock();
                mouseActiveRef.current = 'strike';
                strikeDownAtRef.current = performance.now();
                inputRef.current.strikeDown = true;
                inputRef.current.strikeTriggerCount += 1;
                setStrikePressed(true);
              }}
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
              <span className="font-display text-2xl font-extrabold leading-none text-white">
                A
              </span>
              <span className="text-[9px] font-extrabold tracking-wide text-white/95">
                STRIKE
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Hardware Grip Strip */}
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>360×720 · 720×1440 HD+</span>
        <span>480 PNG STILLS/FIGHTER</span>
      </div>
    </div>
  );
};
