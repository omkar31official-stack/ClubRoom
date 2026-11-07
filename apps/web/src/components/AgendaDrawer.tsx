import React, { useState } from 'react';
import { CheckSquare, Square, Plus, ListTodo, Calendar, UserCheck } from 'lucide-react';
import { AgendaItem, ActionItem } from '@clubroom/shared';

interface AgendaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agenda: AgendaItem[];
  tasks: ActionItem[];
  onToggleAgenda: (agendaId: string, completed: boolean) => void;
  onAddAgendaItem: (title: string) => void;
  onAddTask: (task: string, assigneeName?: string, dueDate?: string) => void;
  onToggleTask: (taskId: string, completed: boolean) => void;
}

export const AgendaDrawer: React.FC<AgendaDrawerProps> = ({
  isOpen,
  onClose,
  agenda,
  tasks,
  onToggleAgenda,
  onAddAgendaItem,
  onAddTask,
  onToggleTask,
}) => {
  const [newTopic, setNewTopic] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [activeTab, setActiveTab] = useState<'agenda' | 'tasks'>('agenda');

  if (!isOpen) return null;

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    onAddAgendaItem(newTopic.trim());
    setNewTopic('');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskDesc.trim()) return;
    onAddTask(newTaskDesc.trim(), assignee.trim() || undefined, dueDate || undefined);
    setNewTaskDesc('');
    setAssignee('');
    setDueDate('');
  };

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#0d121f] flex flex-col h-full shadow-2xl z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('agenda')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'agenda'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Agenda ({agenda.filter((a) => a.completed).length}/{agenda.length})
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'tasks'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Action Items ({tasks.length})
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'agenda' ? (
          <div className="space-y-3">
            {/* Form to add item */}
            <form onSubmit={handleAddTopic} className="flex space-x-2">
              <input
                type="text"
                placeholder="Add meeting discussion topic..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* List */}
            {agenda.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                No agenda topics added yet. Add one above!
              </div>
            ) : (
              <div className="space-y-2">
                {agenda.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onToggleAgenda(item.id, !item.completed)}
                    className={`p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                      item.completed
                        ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                        : 'bg-slate-900 border-indigo-500/20 hover:border-indigo-500/50'
                    }`}
                  >
                    <button className="mt-0.5 text-indigo-400 shrink-0">
                      {item.completed ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <span
                      className={`text-xs font-medium ${
                        item.completed ? 'line-through text-slate-400' : 'text-slate-200'
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Form to add action item */}
            <form onSubmit={handleAddTask} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <input
                type="text"
                placeholder="Action item / task description..."
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Assignee (e.g. John)"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
                />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign Action Item</span>
              </button>
            </form>

            {/* List */}
            {tasks.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                No action items created yet.
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onToggleTask(t.id, !t.completed)}
                    className={`p-3 rounded-xl border flex items-start space-x-3 cursor-pointer transition ${
                      t.completed
                        ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <button className="mt-0.5 text-indigo-400 shrink-0">
                      {t.completed ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <div className="space-y-1">
                      <div
                        className={`text-xs font-medium ${
                          t.completed ? 'line-through text-slate-400' : 'text-slate-200'
                        }`}
                      >
                        {t.task}
                      </div>
                      <div className="flex items-center space-x-3 text-[10px] text-slate-400">
                        {t.assigneeName && (
                          <span className="flex items-center space-x-0.5 text-indigo-300">
                            <UserCheck className="w-2.5 h-2.5" />
                            <span>{t.assigneeName}</span>
                          </span>
                        )}
                        {t.dueDate && (
                          <span className="flex items-center space-x-0.5 text-amber-300">
                            <Calendar className="w-2.5 h-2.5" />
                            <span>{t.dueDate}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

