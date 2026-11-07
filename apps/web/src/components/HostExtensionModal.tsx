import React, { useState } from 'react';
import { X, Clock, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

interface HostExtensionModalProps {
  meetingId: string;
  currentEndTime: string;
  maxExtensionMinutes: number;
  isOpen: boolean;
  onClose: () => void;
  onExtended?: (data: any) => void;
}

export const HostExtensionModal: React.FC<HostExtensionModalProps> = ({
  meetingId,
  currentEndTime,
  maxExtensionMinutes,
  isOpen,
  onClose,
  onExtended,
}) => {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(10);
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickOptions = [5, 10, 15, 30];
  const minutesToAdd = customMinutes ? parseInt(customMinutes, 10) || 0 : selectedMinutes;

  const currentEndDate = new Date(currentEndTime);
  const newEndDate = new Date(currentEndDate.getTime() + minutesToAdd * 60 * 1000);

  const handleExtend = async () => {
    if (minutesToAdd <= 0) {
      setError('Please select or enter a valid number of extension minutes.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.extendMeeting(meetingId, minutesToAdd);
      if (onExtended) onExtended(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to extend meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#111726] border border-indigo-500/20 shadow-2xl p-6 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Extend Meeting Duration</h3>
            <p className="text-xs text-slate-400">Add synchronized time for all participants</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Quick Extension Options
            </label>
            <div className="grid grid-cols-4 gap-2">
              {quickOptions.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setSelectedMinutes(mins);
                    setCustomMinutes('');
                  }}
                  className={`py-2.5 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                    !customMinutes && selectedMinutes === mins
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/25'
                      : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  +{mins}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Or Custom Minutes
            </label>
            <input
              type="number"
              min="1"
              max={maxExtensionMinutes}
              placeholder="e.g. 20"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Preview banner */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Current Ending:</span>
              <span className="font-mono text-slate-300">
                {currentEndDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-emerald-400">
              <span>New Ending:</span>
              <span className="font-mono">
                {newEndDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
              Max allowed total extensions: {maxExtensionMinutes} minutes
            </div>
          </div>

          <div className="pt-2 flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleExtend}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              {loading ? (
                <span>Extending...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm +{minutesToAdd}m</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

