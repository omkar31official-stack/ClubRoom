import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Clock,
  Shield,
  ArrowRight,
  AlertCircle,
  Radio,
  CheckCircle2,
  Users
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { SOCKET_EVENTS } from '@clubroom/shared';

export const WaitingRoom: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, isOrganizer } = useAuth();
  const { socket, isConnected } = useSocket();

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Participant form
  const [name, setName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');

  // Media preview
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Waiting state
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState<'initial' | 'waiting' | 'admitted' | 'rejected'>('initial');

  // Fetch meeting details
  useEffect(() => {
    if (!code) return;
    api
      .getMeeting(code)
      .then((res) => {
        setMeeting(res.meeting);
      })
      .catch((err) => {
        setError(err.message || 'Meeting not found');
      })
      .finally(() => setLoading(false));
  }, [code]);

  // Handle local camera preview
  useEffect(() => {
    let localStream: MediaStream | null = null;

    async function setupPreview() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = localStream;
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.warn('Could not acquire media preview (permissions or no device):', err);
        setCameraEnabled(false);
        setMicEnabled(false);
      }
    }

    setupPreview();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !cameraEnabled;
        setCameraEnabled(!cameraEnabled);
      }
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  // Listen for admission on Socket
  useEffect(() => {
    if (!socket) return;

    const handleStatusChange = (data: { status: string; meetingId: string }) => {
      console.log('[WaitingRoom] Status change received:', data);
      if (data.status === 'admitted') {
        setWaitingStatus('admitted');
        // Stop local preview tracks so meeting room can take over devices
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        // Save attendee info for room
        sessionStorage.setItem('clubroom_name', name);
        sessionStorage.setItem('clubroom_email', email);
        navigate(`/room/${code}`);
      } else if (data.status === 'rejected') {
        setWaitingStatus('rejected');
        setIsWaiting(false);
      }
    };

    socket.on(SOCKET_EVENTS.WAITING_STATUS_CHANGE, handleStatusChange);

    return () => {
      socket.off(SOCKET_EVENTS.WAITING_STATUS_CHANGE, handleStatusChange);
    };
  }, [socket, code, name, email, navigate]);

  const handleEnterRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const isHost = Boolean(user && meeting && user.id === meeting.organizerId);

    // If user is host or waiting room is disabled for this meeting, enter directly!
    if (isHost || !meeting?.waitingRoomEnabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      sessionStorage.setItem('clubroom_name', name);
      sessionStorage.setItem('clubroom_email', email);
      navigate(`/room/${code}`);
      return;
    }

    // Otherwise, request entry into waiting room
    if (socket && isConnected) {
      setIsWaiting(true);
      setWaitingStatus('waiting');
      socket.emit(SOCKET_EVENTS.WAITING_JOIN, {
        meetingId: meeting.id,
        name: name.trim(),
        email: email.trim() || undefined,
      });
    } else {
      setError('Connection to server is initializing. Please retry in a moment.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Loading meeting details...
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="p-8 max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Meeting Unavailable</h2>
          <p className="text-sm text-slate-400">{error || 'Meeting not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[88vh] flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left Col: Camera & Audio Device Preview */}
        <div className="space-y-4">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center group">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover -scale-x-100 ${!cameraEnabled ? 'hidden' : ''}`}
            />
            {!cameraEnabled && (
              <div className="flex flex-col items-center justify-center space-y-2 text-slate-500">
                <VideoOff className="w-12 h-12" />
                <span className="text-xs font-semibold">Camera is off</span>
              </div>
            )}

            {/* Media control overlay */}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-center space-x-3 z-10">
              <button
                type="button"
                onClick={toggleMic}
                className={`p-3 rounded-full border backdrop-blur-md transition cursor-pointer ${
                  micEnabled
                    ? 'bg-slate-900/80 border-slate-700 text-white hover:bg-slate-800'
                    : 'bg-rose-600 border-rose-500 text-white'
                }`}
                title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`p-3 rounded-full border backdrop-blur-md transition cursor-pointer ${
                  cameraEnabled
                    ? 'bg-slate-900/80 border-slate-700 text-white hover:bg-slate-800'
                    : 'bg-rose-600 border-rose-500 text-white'
                }`}
                title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="text-center text-xs text-slate-500">
            Check your audio and video before entering the room
          </div>
        </div>

        {/* Right Col: Details & Waiting Status */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111726] border border-slate-800 shadow-2xl space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono uppercase">{meeting.status}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{meeting.title}</h2>
            {meeting.description && <p className="text-xs text-slate-400">{meeting.description}</p>}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Organizer:</span>
              <span className="font-semibold text-slate-200">{meeting.organizerName}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Allocated Duration:</span>
              <span className="font-mono">{meeting.durationMinutes} minutes</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Waiting Room:</span>
              <span className="font-semibold text-indigo-400">
                {meeting.waitingRoomEnabled ? 'Protected Entry' : 'Open Entry'}
              </span>
            </div>
          </div>

          {waitingStatus === 'rejected' ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2">
              <div className="font-bold flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>Entry Declined</span>
              </div>
              <p>The organizer did not admit you to this meeting session.</p>
              <button
                onClick={() => setWaitingStatus('initial')}
                className="text-white underline font-semibold cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : isWaiting ? (
            /* Waiting State Animation */
            <div className="p-6 rounded-2xl bg-slate-900 border border-amber-500/30 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400 animate-pulse">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-white">Waiting to be admitted...</div>
                <p className="text-xs text-slate-400">
                  The organizer has been notified that you are waiting. You will automatically enter when admitted.
                </p>
              </div>
            </div>
          ) : (
            /* Join Form */
            <form onSubmit={handleEnterRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Your Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  College Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. alex@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>{meeting.waitingRoomEnabled ? 'Join Waiting Room' : 'Enter Meeting Directly'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

