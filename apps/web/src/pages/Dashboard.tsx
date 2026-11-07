import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Video,
  Play,
  Users,
  Copy,
  Check,
  Megaphone,
  Radio,
  FileSpreadsheet,
  ArrowRight,
  Shield,
  Sparkles,
  Search
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AttendanceModal } from '../components/AttendanceModal';

interface DashboardProps {
  onOpenSchedule: () => void;
  onOpenLogin: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenSchedule, onOpenLogin }) => {
  const navigate = useNavigate();
  const { isOrganizer } = useAuth();

  const [meetings, setMeetings] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'upcoming' | 'past'>('all');
  const [searchCode, setSearchCode] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Attendance modal state
  const [selectedMeetingForAttendance, setSelectedMeetingForAttendance] = useState<string | null>(null);

  const fetchMeetings = async () => {
    try {
      const data = await api.getMeetings();
      setMeetings(data.meetings);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const data = await api.getAnnouncements();
      setAnnouncements(data.announcements);
    } catch (err) {
      console.error('Error fetching announcements:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchMeetings(), fetchAnnouncements()]).finally(() => setLoading(false));
    const interval = setInterval(fetchMeetings, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/meeting/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    navigate(`/meeting/${searchCode.trim()}`);
  };

  const handleStartMeeting = async (meetingId: string) => {
    try {
      await api.startMeeting(meetingId);
      await fetchMeetings();
      navigate(`/meeting/${meetingId}`);
    } catch (err: any) {
      alert(err.message || 'Failed to start meeting');
    }
  };

  // Filter meetings
  const filteredMeetings = meetings.filter((m) => {
    if (activeTab === 'live') return m.status === 'live' || m.status === 'extended';
    if (activeTab === 'upcoming') return m.status === 'scheduled';
    if (activeTab === 'past') return m.status === 'ended';
    return true;
  });

  const liveMeetingsCount = meetings.filter((m) => m.status === 'live' || m.status === 'extended').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Header */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-950/80 via-[#0d1322] to-[#0a0d14] border border-indigo-500/20 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Welcome to ClubRoom Collaboration Ecosystem</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Seamless Club Video Meetings with Real-Time Time Control
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Scheduled workshops, smart synchronized timers, waiting room moderation, instant host extensions, and automatic attendance reports for our college club.
          </p>

          {/* Quick Join / Action Bar */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleJoinByCode} className="flex-1 flex max-w-md">
              <input
                type="text"
                placeholder="Enter meeting code (e.g. core-team-sync)..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-l-xl bg-slate-900/90 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-r-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition flex items-center space-x-1 cursor-pointer shrink-0"
              >
                <span>Join</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {isOrganizer ? (
              <button
                onClick={onOpenSchedule}
                className="px-5 py-2.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm border border-indigo-400/30 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
              >
                + Schedule Meeting
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm transition font-medium cursor-pointer"
              >
                Organizer Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Scheduled Meetings</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono mt-2">{meetings.length}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Live Rooms Now</span>
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-2">{liveMeetingsCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Announcements</span>
            <Megaphone className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono mt-2">
            {announcements.length}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Verified System</span>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xs font-semibold text-purple-300 font-mono mt-2">Server Authoritative</div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Meetings List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
            <div className="flex space-x-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({meetings.length})
              </button>
              <button
                onClick={() => setActiveTab('live')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                  activeTab === 'live' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                <span>Active ({liveMeetingsCount})</span>
              </button>
              <button
                onClick={() => setActiveTab('upcoming')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'upcoming' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab('past')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'past' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Past &amp; Reports
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-500 text-sm">Loading club meetings...</div>
          ) : filteredMeetings.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
              <Video className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-slate-400 text-sm font-semibold">No meetings found in this category</div>
              {isOrganizer && (
                <button
                  onClick={onOpenSchedule}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
                >
                  Schedule a meeting now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMeetings.map((m) => {
                const isLive = m.status === 'live' || m.status === 'extended';
                const isEnded = m.status === 'ended';

                return (
                  <div
                    key={m.id}
                    className="p-5 rounded-2xl bg-[#0f1523] border border-slate-800/80 hover:border-indigo-500/40 transition-all shadow-lg space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-bold text-white">{m.title}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isLive
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse'
                                : isEnded
                                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {m.status}
                          </span>
                        </div>
                        {m.description && <p className="text-xs text-slate-400 line-clamp-2">{m.description}</p>}
                      </div>

                      <button
                        onClick={() => handleCopyLink(m.code)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Copy meeting invite link"
                      >
                        {copiedId === m.code ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Metadata pills */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                      <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{new Date(m.scheduledStartTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{new Date(m.scheduledStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                        {m.durationMinutes} mins
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Code: <span className="text-slate-300">{m.code}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-xs text-slate-400 flex items-center space-x-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>Organizer: {m.organizerName}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Attendance Report button */}
                        <button
                          onClick={() => setSelectedMeetingForAttendance(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">Attendance</span>
                        </button>

                        {/* Start meeting (Host only) if scheduled */}
                        {isOrganizer && m.status === 'scheduled' && (
                          <button
                            onClick={() => handleStartMeeting(m.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 shadow transition cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Start Room</span>
                          </button>
                        )}

                        {/* Join Room */}
                        {!isEnded ? (
                          <button
                            onClick={() => navigate(`/meeting/${m.code}`)}
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Enter Room</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 font-mono">Concluded</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Announcements & Guidelines */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[#0f1523] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Club Announcements</h3>
              </div>
            </div>

            {announcements.length === 0 ? (
              <div className="text-xs text-slate-500 py-4">No new club announcements</div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{a.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">{a.content}</p>
                    <div className="text-[10px] text-indigo-400 font-medium">By {a.authorName}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-900/40 text-xs text-slate-300 space-y-2.5">
            <div className="font-bold text-indigo-300 flex items-center space-x-1.5">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Smart Meeting Controls</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              All meetings in ClubRoom operate on a server-authoritative timer. When 5 and 1 minute thresholds approach, synchronized warnings appear. Organizers can extend meetings smoothly with one click.
            </p>
          </div>
        </div>
      </div>

      {/* Attendance Modal */}
      {selectedMeetingForAttendance && (
        <AttendanceModal
          meetingId={selectedMeetingForAttendance}
          isOpen={Boolean(selectedMeetingForAttendance)}
          onClose={() => setSelectedMeetingForAttendance(null)}
        />
      )}
    </div>
  );
};

