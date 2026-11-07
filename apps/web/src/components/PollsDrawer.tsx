import React, { useState } from 'react';
import { BarChart3, Plus, CheckCircle2 } from 'lucide-react';
import { Poll } from '@clubroom/shared';

interface PollsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  polls: Poll[];
  isHost: boolean;
  currentUserId: string;
  onCreatePoll: (question: string, options: string[]) => void;
  onVote: (pollId: string, optionId: string) => void;
}

export const PollsDrawer: React.FC<PollsDrawerProps> = ({
  isOpen,
  onClose,
  polls,
  isHost,
  currentUserId,
  onCreatePoll,
  onVote,
}) => {
  const [question, setQuestion] = useState('');
  const [option1, setOption1] = useState('');
  const [option2, setOption2] = useState('');
  const [option3, setOption3] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const options = [option1, option2, option3].filter((o) => o.trim().length > 0);
    if (!question.trim() || options.length < 2) return;

    onCreatePoll(question.trim(), options);
    setQuestion('');
    setOption1('');
    setOption2('');
    setOption3('');
    setShowCreate(false);
  };

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#0d121f] flex flex-col h-full shadow-2xl z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-white text-sm">Live Polls &amp; Voting</h3>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Host Poll Creator */}
        {isHost && (
          <div>
            {!showCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-semibold text-xs flex items-center justify-center space-x-1.5 hover:bg-indigo-600/30 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Launch New Live Poll</span>
              </button>
            ) : (
              <form onSubmit={handleCreate} className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-2.5">
                <div className="text-xs font-bold text-white">Create Quick Poll</div>
                <input
                  type="text"
                  placeholder="Poll question (e.g. Next session date?)"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Option 1"
                  value={option1}
                  onChange={(e) => setOption1(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Option 2"
                  value={option2}
                  onChange={(e) => setOption2(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Option 3 (optional)"
                  value={option3}
                  onChange={(e) => setOption3(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none"
                />
                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    Launch
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Polls list */}
        {polls.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No live polls running right now.
          </div>
        ) : (
          polls.map((poll) => {
            const hasVoted = poll.voters.includes(currentUserId);
            const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);

            return (
              <div
                key={poll.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <h4 className="text-xs font-bold text-white">{poll.question}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-2">
                  {poll.options.map((opt) => {
                    const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;

                    return (
                      <button
                        key={opt.id}
                        disabled={hasVoted}
                        onClick={() => onVote(poll.id, opt.id)}
                        className={`w-full text-left relative overflow-hidden p-2.5 rounded-xl border text-xs transition ${
                          hasVoted
                            ? 'bg-slate-950/60 border-slate-800 cursor-default'
                            : 'bg-slate-850 hover:bg-slate-800 border-slate-750 hover:border-indigo-500 cursor-pointer'
                        }`}
                      >
                        {/* Vote progress fill bar */}
                        <div
                          className="absolute inset-0 bg-indigo-600/20 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                        <div className="relative flex items-center justify-between z-10">
                          <span className="font-medium text-slate-200">{opt.text}</span>
                          <span className="font-mono text-slate-400 font-semibold">{percentage}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {hasVoted && (
                  <div className="flex items-center space-x-1 text-[11px] text-emerald-400 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Your vote has been counted</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

