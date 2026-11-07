import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { ChatMessage } from '@clubroom/shared';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (msg: string) => void;
  onSendReaction: (emoji: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onSendReaction,
}) => {
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  const reactionEmojis = ['👍', '👏', '🎉', '❤️', '🚀', '😂'];

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#0d121f] flex flex-col h-full shadow-2xl z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-white text-sm">In-Call Messages</h3>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No messages yet. Send a message to start the discussion!
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`p-3 rounded-xl text-xs space-y-1 ${
                m.isSystem
                  ? 'bg-indigo-950/40 border border-indigo-800/30 text-indigo-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 flex items-center space-x-1">
                  <span>{m.senderName}</span>
                  {m.senderRole && m.senderRole !== 'member' && (
                    <span className="text-[10px] font-normal px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                      {m.senderRole}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reactions Bar */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>React</span>
        </span>
        <div className="flex space-x-1">
          {reactionEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              className="text-base hover:scale-125 transition-transform p-1 cursor-pointer"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 flex space-x-2">
        <input
          type="text"
          placeholder="Send a message to everyone..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
};

