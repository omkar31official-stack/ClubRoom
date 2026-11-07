import React, { useState, useEffect } from 'react';
import { X, Download, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface AttendanceModalProps {
  meetingId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({ meetingId, isOpen, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !meetingId) return;
    setLoading(true);
    api
      .getAttendance(meetingId)
      .then((res) => setData(res))
      .catch((err) => console.error('Failed to load attendance:', err))
      .finally(() => setLoading(false));
  }, [meetingId, isOpen]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    window.open(api.getAttendanceCsvUrl(meetingId), '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl bg-[#111726] border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Attendance &amp; Participation Report</h3>
            <p className="text-xs text-slate-400">
              {data?.meeting?.title || 'Club Meeting'} • {data?.meeting?.durationMinutes || 30} mins scheduled
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading attendance analytics...</div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Metric stats cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-medium">Total Participants</div>
                <div className="text-xl font-extrabold text-white font-mono mt-1">
                  {data?.stats?.totalParticipants || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-emerald-400 font-medium">Present on Time</div>
                <div className="text-xl font-extrabold text-emerald-300 font-mono mt-1">
                  {data?.stats?.presentCount || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-amber-400 font-medium">Late Arrivals</div>
                <div className="text-xl font-extrabold text-amber-300 font-mono mt-1">
                  {data?.stats?.lateCount || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-indigo-400 font-medium">Avg Duration</div>
                <div className="text-xl font-extrabold text-indigo-300 font-mono mt-1">
                  {data?.stats?.avgDurationMinutes || 0}m
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Participant</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Joined At</th>
                    <th className="p-3">Left At</th>
                    <th className="p-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data?.records?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No attendance records recorded yet.
                      </td>
                    </tr>
                  ) : (
                    data?.records?.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3">
                          <div className="font-semibold text-slate-200">{r.participant_name}</div>
                          {r.participant_email && (
                            <div className="text-[10px] text-slate-500">{r.participant_email}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              r.status === 'present'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400">
                          {new Date(r.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-mono text-slate-400">
                          {r.left_at
                            ? new Date(r.left_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active in call'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-200">
                          {Math.round((r.duration_seconds || 0) / 60)} mins
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

