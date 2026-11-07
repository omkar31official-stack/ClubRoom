import React from 'react';
import { Clock, PlusCircle, AlertTriangle } from 'lucide-react';

interface TimerDisplayProps {
  remainingSeconds: number;
  status: string;
  isExtended: boolean;
  extensionCount: number;
  isHost: boolean;
  onOpenExtendModal?: () => void;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  remainingSeconds,
  status,
  isExtended,
  extensionCount,
  isHost,
  onOpenExtendModal,
}) => {
  const formatTime = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Color styles based on time remaining
  let colorClasses = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  let isFlashing = false;

  if (remainingSeconds <= 60) {
    colorClasses = 'text-rose-400 bg-rose-500/15 border-rose-500/40 animate-pulse';
    isFlashing = true;
  } else if (remainingSeconds <= 300) {
    colorClasses = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  } else if (remainingSeconds <= 600) {
    colorClasses = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  }

  return (
    <div className="flex items-center space-x-2">
      <div
        className={`flex items-center space-x-2.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-colors ${colorClasses}`}
        title="Server-authoritative synchronized meeting timer"
      >
        <Clock className={`w-4 h-4 ${isFlashing ? 'text-rose-400 animate-spin' : ''}`} />
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-base sm:text-lg font-extrabold tracking-wider">
              {formatTime(remainingSeconds)}
            </span>
            {isExtended && (
              <span className="text-[10px] uppercase font-bold px-1 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                +{extensionCount} Ext
              </span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">
            {status === 'ended' ? 'Meeting Ended' : 'Time Remaining'}
          </span>
        </div>
      </div>

      {/* Host Extend Button */}
      {isHost && status !== 'ended' && onOpenExtendModal && (
        <button
          onClick={onOpenExtendModal}
          className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold text-xs border border-indigo-400/30 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          title="Extend meeting duration for all participants"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Extend</span>
        </button>
      )}

      {remainingSeconds <= 300 && remainingSeconds > 0 && (
        <div className="hidden lg:flex items-center text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg border border-amber-400/20">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
          <span>Wrap up</span>
        </div>
      )}
    </div>
  );
};

