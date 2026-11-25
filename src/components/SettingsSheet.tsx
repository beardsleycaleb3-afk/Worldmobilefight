import React, { useState } from 'react';
import { HardDriveDownload, X } from 'lucide-react';
import { FIGHTERS } from '../data/fighters';
import { prewarmAllFighters } from '../engine/fighterBaker';
import type { ControlSettings, HapticIntensity } from '../storage/gameStorage';

interface SettingsSheetProps {
  settings: ControlSettings;
  cachedCount: number;
  onUpdateSettings: (next: ControlSettings) => void;
  onCacheUpdated: () => void;
  onClose: () => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  settings,
  cachedCount,
  onUpdateSettings,
  onCacheUpdated,
  onClose,
}) => {
  const [prewarming, setPrewarming] = useState(false);
  const [warmProgress, setWarmProgress] = useState({ done: 0, total: FIGHTERS.length, name: '' });

  const handlePrewarm = async () => {
    if (prewarming) return;
    setPrewarming(true);
    await prewarmAllFighters(FIGHTERS, (done, total, name) => {
      setWarmProgress({ done, total, name });
    });
    setPrewarming(false);
    onCacheUpdated();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/75">
      <div className="max-h-[88%] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 p-4 pb-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold text-white">
            CONTROLS & AUDIO
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Haptic Intensity */}
        <div className="mt-3">
          <div className="text-[11px] font-bold text-slate-400">HAPTIC VIBRATION</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-1">
            {(['off', 'light', 'full'] as HapticIntensity[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, hapticIntensity: lvl })}
                className={`min-h-[44px] rounded-lg text-xs font-bold uppercase ${
                  settings.hapticIntensity === lvl
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* SFX & Adaptive Music Volumes */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-400">SFX VOL</span>
              <span className="font-mono-tabular text-amber-400">
                {Math.round(settings.sfxVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(e) =>
                onUpdateSettings({ ...settings, sfxVolume: Number(e.target.value) / 100 })
              }
              className="mt-1.5 h-3 w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-400">MUSIC VOL</span>
              <span className="font-mono-tabular text-sky-400">
                {Math.round(settings.musicVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.musicVolume * 100)}
              onChange={(e) =>
                onUpdateSettings({ ...settings, musicVolume: Number(e.target.value) / 100 })
              }
              className="mt-1.5 h-3 w-full accent-sky-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Run Threshold Slider */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-400">JOYSTICK SPRINT THRESHOLD</span>
            <span className="font-mono-tabular text-amber-400">
              {Math.round(settings.runThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={55}
            max={85}
            value={Math.round(settings.runThreshold * 100)}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                runThreshold: Number(e.target.value) / 100,
              })
            }
            className="mt-1.5 h-3 w-full accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Swap A / B Action Buttons */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
          <div>
            <div className="text-xs font-bold text-white">Action Button Layout</div>
            <div className="text-[10px] text-slate-400">
              {settings.swapButtons ? 'Swapped (A Bottom / B Top)' : 'Standard (B Bottom / A Top)'}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ ...settings, swapButtons: !settings.swapButtons })
            }
            className={`min-h-[44px] rounded-lg px-3 text-xs font-bold ${
              settings.swapButtons
                ? 'bg-amber-500 text-slate-950'
                : 'border border-slate-700 bg-slate-800 text-white'
            }`}
          >
            {settings.swapButtons ? 'SWAPPED' : 'STANDARD'}
          </button>
        </div>

        {/* Thumb Ergonomics & Chassis Opacity */}
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
          <div className="text-[11px] font-bold text-slate-400">THUMB ERGONOMICS</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-400">PAD SCALE</span>
                <span className="font-mono-tabular text-amber-400">
                  {Math.round(settings.controlScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={85}
                max={112}
                value={Math.round(settings.controlScale * 100)}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    controlScale: Number(e.target.value) / 100,
                  })
                }
                className="mt-1 h-3 w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-400">THUMB GAP</span>
                <span className="font-mono-tabular text-amber-400">
                  {settings.thumbSpacing}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                value={settings.thumbSpacing}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    thumbSpacing: Number(e.target.value),
                  })
                }
                className="mt-1 h-3 w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-slate-400">CHASSIS OPACITY</span>
              <span className="font-mono-tabular text-sky-400">
                {Math.round(settings.chassisOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={65}
              max={100}
              value={Math.round(settings.chassisOpacity * 100)}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  chassisOpacity: Number(e.target.value) / 100,
                })
              }
              className="mt-1 h-3 w-full accent-sky-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Pre-Warm All 8 Fighters PNG Cache */}
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">Offline PNG Sprite Cache</span>
            <span className="font-mono-tabular text-emerald-400">
              {cachedCount}/{FIGHTERS.length} Ready
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Pre-bake all 3,840 Three.js PNG stills (480 × 8 fighters) into IndexedDB.
          </p>

          {prewarming ? (
            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] font-mono-tabular text-amber-300">
                <span>Baking {warmProgress.name}...</span>
                <span>
                  {warmProgress.done}/{warmProgress.total}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-150"
                  style={{
                    width: `${Math.round((warmProgress.done / warmProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePrewarm}
              disabled={cachedCount >= FIGHTERS.length}
              className={`mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg text-xs font-bold ${
                cachedCount >= FIGHTERS.length
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              <HardDriveDownload className="h-4 w-4" />
              {cachedCount >= FIGHTERS.length
                ? 'ALL 3,840 PNG STILLS CACHED'
                : 'PRE-BAKE ALL 8 FIGHTERS'}
            </button>
          )}
        </div>

        {/* Standalone Android 13 Vanilla Package Download */}
        <a
          href="/standalone/index.html"
          download="iron-titan-8-standalone.html"
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-sky-400/50 bg-sky-500/15 px-3 text-xs font-bold text-sky-300"
        >
          <HardDriveDownload className="h-4 w-4" />
          DOWNLOAD STANDALONE VANILLA INDEX.HTML
        </a>
      </div>
    </div>
  );
};
