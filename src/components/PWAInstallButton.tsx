import React from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (isInstalled || !isInstallable) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={install}
      className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
    >
      <Download className="h-3.5 w-3.5" />
      Install App
    </button>
  );
};
