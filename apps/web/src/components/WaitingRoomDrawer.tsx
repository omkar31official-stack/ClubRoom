import React from 'react';
import { Users, UserCheck, UserX, Mic, MicOff, Hand, Shield, CheckCheck } from 'lucide-react';

interface WaitingParticipant {
  id: string;
  name: string;
  email?: string;
  requestedAt: string;
}

interface Participant {
  socketId: string;
  name: string;
  role: string;
  isHost: boolean;
  isHandRaised?: boolean;
}

interface WaitingRoomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  waitingList: WaitingParticipant[];
  participants: Participant[];
  raisedHands: Array<{ socketId: string; name: string }>;
  isHost: boolean;
  onAdmit: (waitingId: string) => void;
  onAdmitAll: () => void;
  onReject: (waitingId: string) => void;
  onMuteParticipant?: (socketId: string) => void;
  onRemoveParticipant?: (socketId: string) => void;
}

export const WaitingRoomDrawer: React.FC<WaitingRoomDrawerProps> = ({
  isOpen,
  onClose,
  waitingList,
  participants,
  raisedHands,
  isHost,
  onAdmit,
  onAdmitAll,
  onReject,
  onMuteParticipant,
  onRemoveParticipant,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#0d121f] flex flex-col h-full shadow-2xl z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-white text-sm">Participants &amp; Waiting Room</h3>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Waiting Room Section (Host view) */}
        {isHost && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Waiting Room ({waitingList.length})
                </span>
                {waitingList.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </div>
              {waitingList.length > 1 && (
                <button
                  onClick={onAdmitAll}
                  className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Admit All</span>
                </button>
              )}
            </div>

            {waitingList.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-xs text-slate-500">
                No participants waiting
              </div>
            ) : (
              <div className="space-y-2">
                {waitingList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-between"
                  >
                    <div className="overflow-hidden mr-2">
                      <div className="text-sm font-semibold text-white truncate">{item.name}</div>
                      {item.email && <div className="text-[11px] text-slate-400 truncate">{item.email}</div>}
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => onAdmit(item.id)}
                        className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"
                        title="Admit participant"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onReject(item.id)}
                        className="p-1.5 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                        title="Reject participant"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raised Hands Queue */}
        {raisedHands.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2 flex items-center space-x-1.5">
              <Hand className="w-3.5 h-3.5 text-yellow-400 animate-bounce" />
              <span>Raised Hands ({raisedHands.length})</span>
            </div>
            <div className="space-y-1.5">
              {raisedHands.map((h, i) => (
                <div
                  key={h.socketId}
                  className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-yellow-200">
                    {i + 1}. {h.name}
                  </span>
                  <Hand className="w-3.5 h-3.5 text-yellow-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Connected Participants */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            In Meeting ({participants.length})
          </div>
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.socketId}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center font-bold text-xs text-indigo-300 uppercase shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold text-slate-200 truncate flex items-center space-x-1">
                      <span>{p.name}</span>
                      {p.isHost && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1 rounded flex items-center space-x-0.5">
                          <Shield className="w-2.5 h-2.5" />
                          <span>Host</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isHost && !p.isHost && (
                  <div className="flex items-center space-x-1">
                    {onMuteParticipant && (
                      <button
                        onClick={() => onMuteParticipant(p.socketId)}
                        title="Mute participant"
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                      >
                        <MicOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

