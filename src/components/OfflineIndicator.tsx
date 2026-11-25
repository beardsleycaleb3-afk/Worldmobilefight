import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="absolute top-12 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-slate-950/95 px-2.5 py-1 text-[11px] font-semibold text-amber-300 shadow-lg whitespace-nowrap">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Offline Mode · Cached Arena</span>
    </div>
  );
};
