import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  MessageSquare,
  Users,
  ListTodo,
  BarChart3,
  Hand,
  AlertTriangle,
  Shield,
  Copy,
  Check,
  Radio
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { SOCKET_EVENTS, ChatMessage, Poll, AgendaItem, ActionItem } from '@clubroom/shared';

import { TimerDisplay } from '../components/TimerDisplay';
import { HostExtensionModal } from '../components/HostExtensionModal';
import { WaitingRoomDrawer } from '../components/WaitingRoomDrawer';
import { ChatDrawer } from '../components/ChatDrawer';
import { AgendaDrawer } from '../components/AgendaDrawer';
import { PollsDrawer } from '../components/PollsDrawer';
import { AttendanceModal } from '../components/AttendanceModal';
import { RemoteVideoTile } from '../components/RemoteVideoTile';

interface RemoteParticipantStream {
  socketId: string;
  name: string;
  role: string;
  isHost: boolean;
  stream: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
}

export const MeetingRoom: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Participant identity
  const participantName = sessionStorage.getItem('clubroom_name') || user?.fullName || 'Guest Member';
  const participantEmail = sessionStorage.getItem('clubroom_email') || user?.email || undefined;
  const isHost = Boolean(user && meeting && user.id === meeting.organizerId);

  // Meeting Timer state
  const [timerState, setTimerState] = useState<{
    remainingSeconds: number;
    currentEndTime: string;
    isExtended: boolean;
    extensionCount: number;
    status: string;
  }>({
    remainingSeconds: 1800,
    currentEndTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    isExtended: false,
    extensionCount: 0,
    status: 'scheduled',
  });

  // Warning Toast notification
  const [warningToast, setWarningToast] = useState<string | null>(null);

  // Extension Modal
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);

  // Active drawer tab ('chat' | 'waiting' | 'agenda' | 'polls' | null)
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'waiting' | 'agenda' | 'polls' | null>(null);

  // Waiting list (host view)
  const [waitingList, setWaitingList] = useState<any[]>([]);

  // Participants & Hand raise
  const [participants, setParticipants] = useState<any[]>([]);
  const [raisedHands, setRaisedHands] = useState<Array<{ socketId: string; name: string }>>([]);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Chat & Polls & Agenda
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [tasks, setTasks] = useState<ActionItem[]>([]);

  // Attendance modal
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);

  // Media streams & controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Real Multi-Peer WebRTC Mesh State
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteParticipantStream>>(new Map());
  const [copiedLink, setCopiedLink] = useState(false);

  // Meeting ended state
  const [meetingEndedReason, setMeetingEndedReason] = useState<string | null>(null);

  // 1. Fetch meeting info
  useEffect(() => {
    if (!code) return;
    api
      .getMeeting(code)
      .then((res) => {
        setMeeting(res.meeting);
        if (res.timerState) {
          setTimerState({
            remainingSeconds: res.timerState.remainingSeconds,
            currentEndTime: res.timerState.currentEndTime,
            isExtended: res.timerState.isExtended,
            extensionCount: res.timerState.extensionCount,
            status: res.timerState.status,
          });
        }
        if (res.agenda) setAgenda(res.agenda);
      })
      .catch((err) => setError(err.message || 'Meeting not found'))
      .finally(() => setLoading(false));
  }, [code]);

  // 2. Setup local user media
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function initMedia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Could not initialize local camera/microphone:', err);
        setIsVideoOff(true);
        setIsMuted(true);
      }
    }
    initMedia();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, []);

  // WebRTC PeerConnection factory
  const createPeerConnection = (
    remoteSocketId: string,
    remoteName: string,
    remoteRole: string,
    remoteIsHost: boolean
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local media tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream from:', remoteSocketId);
      const incomingStream = event.streams[0];
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(remoteSocketId, {
          socketId: remoteSocketId,
          name: remoteName,
          role: remoteRole,
          isHost: remoteIsHost,
          stream: incomingStream,
          isMuted: false,
          isVideoOff: false,
        });
        return next;
      });
    };

    // ICE candidate negotiation
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc:signal', {
          to: remoteSocketId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    return pc;
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
        socket?.emit('media:state_change', { isMuted: !isMuted, isVideoOff });
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
        socket?.emit('media:state_change', { isMuted, isVideoOff: !isVideoOff });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];
        peersRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            peersRef.current.forEach((pc) => {
              const senders = pc.getSenders();
              const videoSender = senders.find((s) => s.track?.kind === 'video');
              if (videoSender && camTrack) {
                videoSender.replaceTrack(camTrack);
              }
            });
          }
        };
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  };

  // 3. Socket.IO Room Lifecycle & WebRTC Signaling
  useEffect(() => {
    if (!socket || !meeting) return;

    // Join room
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      meetingId: meeting.id,
      name: participantName,
      role: user?.role || 'member',
      isHost,
      email: participantEmail,
    });

    // Room initial state
    socket.on(SOCKET_EVENTS.ROOM_STATE, (data: any) => {
      if (data.timerState) {
        setTimerState({
          remainingSeconds: data.timerState.remainingSeconds,
          currentEndTime: data.timerState.currentEndTime,
          isExtended: data.timerState.isExtended,
          extensionCount: data.timerState.extensionCount,
          status: data.timerState.status,
        });
      }
      if (data.messages) setMessages(data.messages);
      if (data.polls) setPolls(data.polls);
      if (data.agenda) setAgenda(data.agenda);
      if (data.participants) setParticipants(data.participants);
      if (data.waitingList) setWaitingList(data.waitingList);
      if (data.raisedHands) setRaisedHands(data.raisedHands);
    });

    // New participant joined -> initiate WebRTC offer
    socket.on('participant:joined', async (data: { socketId: string; name: string; role: string; isHost: boolean }) => {
      console.log('[WebRTC] Participant joined:', data);
      const pc = createPeerConnection(data.socketId, data.name, data.role, data.isHost);
      peersRef.current.set(data.socketId, pc);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', {
          to: data.socketId,
          signal: { type: 'offer', sdp: offer, senderName: participantName, isHost },
        });
      } catch (err) {
        console.error('[WebRTC] Error initiating offer:', err);
      }
    });

    // WebRTC Signaling Exchange (Offers, Answers, ICE candidates)
    socket.on('webrtc:signal', async (data: { from: string; signal: any }) => {
      const { from, signal } = data;

      if (signal.type === 'offer') {
        let pc = peersRef.current.get(from);
        if (!pc) {
          pc = createPeerConnection(from, signal.senderName || 'Member', 'member', signal.isHost);
          peersRef.current.set(from, pc);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:signal', {
          to: from,
          signal: { type: 'answer', sdp: answer },
        });
      } else if (signal.type === 'answer') {
        const pc = peersRef.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        const pc = peersRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[WebRTC] ICE Candidate error:', e);
          }
        }
      }
    });

    // Participant left -> cleanup peer connection
    socket.on('participant:left', (data: { socketId: string; name: string }) => {
      const pc = peersRef.current.get(data.socketId);
      if (pc) {
        pc.close();
        peersRef.current.delete(data.socketId);
      }
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(data.socketId);
        return next;
      });
    });

    // Remote participant audio/video mute state change
    socket.on('media:state_change', (data: { socketId: string; isMuted: boolean; isVideoOff: boolean }) => {
      setRemoteStreams((prev) => {
        const target = prev.get(data.socketId);
        if (!target) return prev;
        const next = new Map(prev);
        next.set(data.socketId, {
          ...target,
          isMuted: data.isMuted,
          isVideoOff: data.isVideoOff,
        });
        return next;
      });
    });

    // Second-by-second Timer ticks from server
    socket.on(SOCKET_EVENTS.TIMER_TICK, (data: { remainingSeconds: number; currentEndTime: string }) => {
      setTimerState((prev) => ({
        ...prev,
        remainingSeconds: data.remainingSeconds,
        currentEndTime: data.currentEndTime,
      }));
    });

    // Synchronized Timer Warnings
    socket.on(SOCKET_EVENTS.TIMER_WARNING, (data: { warningType: string; message: string }) => {
      setWarningToast(data.message);
      setTimeout(() => setWarningToast(null), 8000);
    });

    // Meeting Extended event
    socket.on(SOCKET_EVENTS.MEETING_EXTEND, (data: any) => {
      setTimerState((prev) => ({
        ...prev,
        remainingSeconds: data.timerState.remainingSeconds,
        currentEndTime: data.newEndTime,
        isExtended: true,
        extensionCount: data.timerState.extensionCount,
      }));
      setWarningToast(`Meeting extended by +${data.addedMinutes}m by host.`);
      setTimeout(() => setWarningToast(null), 6000);
      confetti({ particleCount: 35, spread: 60, origin: { y: 0.1 } });
    });

    // Meeting End event
    socket.on(SOCKET_EVENTS.MEETING_END, (data: any) => {
      setTimerState((prev) => ({ ...prev, status: 'ended', remainingSeconds: 0 }));
      setMeetingEndedReason(data.reason || 'Meeting concluded');
    });

    // Waiting list updates
    socket.on(SOCKET_EVENTS.WAITING_UPDATE, (list: any[]) => {
      setWaitingList(list);
    });

    // Chat
    socket.on(SOCKET_EVENTS.CHAT_RECEIVE, (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Reactions
    socket.on(SOCKET_EVENTS.REACTION, () => {
      confetti({ particleCount: 30, spread: 70, origin: { y: 0.8 } });
    });

    // Raised hands
    socket.on(SOCKET_EVENTS.HAND_QUEUE_UPDATE, (queue: any[]) => {
      setRaisedHands(queue);
    });

    // Poll updates
    socket.on(SOCKET_EVENTS.POLL_UPDATE, (poll: Poll) => {
      setPolls((prev) => {
        const idx = prev.findIndex((p) => p.id === poll.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = poll;
          return next;
        }
        return [poll, ...prev];
      });
    });

    // Agenda updates
    socket.on(SOCKET_EVENTS.AGENDA_UPDATE, (updatedAgenda: AgendaItem[]) => {
      setAgenda(updatedAgenda);
    });

    // Host force mute
    socket.on('host:force_mute', () => {
      setIsMuted(true);
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
      }
    });

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE);
      socket.off('participant:joined');
      socket.off('webrtc:signal');
      socket.off('participant:left');
      socket.off('media:state_change');
      socket.off(SOCKET_EVENTS.TIMER_TICK);
      socket.off(SOCKET_EVENTS.TIMER_WARNING);
      socket.off(SOCKET_EVENTS.MEETING_EXTEND);
      socket.off(SOCKET_EVENTS.MEETING_END);
      socket.off(SOCKET_EVENTS.WAITING_UPDATE);
      socket.off(SOCKET_EVENTS.CHAT_RECEIVE);
      socket.off(SOCKET_EVENTS.REACTION);
      socket.off(SOCKET_EVENTS.HAND_QUEUE_UPDATE);
      socket.off(SOCKET_EVENTS.POLL_UPDATE);
      socket.off(SOCKET_EVENTS.AGENDA_UPDATE);
      socket.off('host:force_mute');
    };
  }, [socket, meeting, participantName, participantEmail, isHost, user]);

  // Hand raise toggle
  const toggleHandRaise = () => {
    if (!socket) return;
    if (isHandRaised) {
      socket.emit(SOCKET_EVENTS.HAND_LOWER);
      setIsHandRaised(false);
    } else {
      socket.emit(SOCKET_EVENTS.HAND_RAISE);
      setIsHandRaised(true);
    }
  };

  // Chat send
  const handleSendMessage = (msg: string) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.CHAT_SEND, { meetingId: meeting.id, message: msg });
  };

  // Reaction send
  const handleSendReaction = (emoji: string) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.REACTION, { meetingId: meeting.id, emoji });
    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
  };

  // Waiting room actions
  const handleAdmit = (waitingId: string) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.WAITING_ADMIT, { meetingId: meeting.id, waitingId });
  };

  const handleAdmitAll = () => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.WAITING_ADMIT_ALL, { meetingId: meeting.id });
  };

  const handleReject = (waitingId: string) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.WAITING_REJECT, { meetingId: meeting.id, waitingId });
  };

  // Agenda toggle
  const handleToggleAgenda = (agendaId: string, completed: boolean) => {
    if (!socket) return;
    socket.emit('agenda:toggle', { agendaId, completed });
  };

  const handleAddAgendaItem = async (title: string) => {
    if (!meeting) return;
    await api.addAgendaItem(meeting.id, { title });
  };

  const handleAddTask = async (task: string, assigneeName?: string, dueDate?: string) => {
    if (!meeting) return;
    await api.addTask(meeting.id, { task, assigneeName, dueDate });
    const res = await api.getAgenda(meeting.id);
    setTasks(res.tasks);
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    if (!meeting) return;
    await api.toggleTask(meeting.id, taskId, completed);
    const res = await api.getAgenda(meeting.id);
    setTasks(res.tasks);
  };

  // Poll actions
  const handleCreatePoll = (question: string, options: string[]) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.POLL_CREATE, { meetingId: meeting.id, question, options });
  };

  const handleVotePoll = (pollId: string, optionId: string) => {
    if (!socket || !meeting) return;
    socket.emit(SOCKET_EVENTS.POLL_VOTE, { pollId, optionId });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/meeting/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // End meeting
  const handleLeaveOrEnd = async () => {
    if (isHost && confirm('End meeting for all participants?')) {
      await api.endMeeting(meeting.id);
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Connecting to ClubRoom session...
      </div>
    );
  }

  const remoteParticipantsList = Array.from(remoteStreams.values());
  const totalVideoTiles = 1 + remoteParticipantsList.length;

  return (
    <div className="h-screen flex flex-col bg-[#070a11] text-slate-100 overflow-hidden select-none">
      {/* Warning Toast Banner */}
      {warningToast && (
        <div className="absolute top-18 inset-x-0 mx-auto max-w-lg z-50 p-3 rounded-2xl bg-amber-500/95 border border-amber-300 text-slate-950 font-bold text-xs shadow-2xl flex items-center justify-between animate-bounce">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{warningToast}</span>
          </div>
          <button onClick={() => setWarningToast(null)} className="px-2 py-0.5 rounded hover:bg-amber-600/30">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-800 bg-[#0a0e1a]/90 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-extrabold text-white text-xs">
            CR
          </div>
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
              {meeting?.title}
            </h2>
            <div className="flex items-center space-x-2 text-[10px] text-slate-400">
              <span className="font-mono text-indigo-400">{code}</span>
              <span>•</span>
              <span className="flex items-center space-x-1 text-slate-300">
                <Users className="w-2.5 h-2.5" />
                <span>{totalVideoTiles} in Call</span>
              </span>
              <span>•</span>
              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1 text-slate-400 hover:text-white cursor-pointer"
                title="Copy meeting link"
              >
                {copiedLink ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copiedLink ? 'Copied' : 'Invite'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* The Signature Synchronized Timer */}
        <div className="flex items-center space-x-3">
          <TimerDisplay
            remainingSeconds={timerState.remainingSeconds}
            status={timerState.status}
            isExtended={timerState.isExtended}
            extensionCount={timerState.extensionCount}
            isHost={isHost}
            onOpenExtendModal={() => setIsExtendModalOpen(true)}
          />
        </div>
      </header>

      {/* Main Workspace (Video Grid + Optional Side Drawer) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Video Arena */}
        <main className="flex-1 p-4 flex flex-col items-center justify-center relative overflow-hidden bg-radial from-slate-900/40 to-[#070a11]">
          {/* If screen is being shared, spotlight it */}
          {isScreenSharing ? (
            <div className="w-full h-full flex flex-col lg:flex-row gap-4 items-center justify-center">
              <div className="flex-1 w-full h-full rounded-2xl overflow-hidden bg-black border border-indigo-500/40 shadow-2xl relative">
                <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-mono text-emerald-400 flex items-center space-x-1.5 border border-slate-700">
                  <ScreenShare className="w-3.5 h-3.5" />
                  <span>You are sharing your screen</span>
                </div>
              </div>
              {/* Floating Camera Tile */}
              <div className="w-48 h-32 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shadow-xl shrink-0 relative">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                  You ({participantName})
                </div>
              </div>
            </div>
          ) : (
            /* Standard Real Participant Video Grid */
            <div className="w-full max-w-6xl h-full flex items-center justify-center">
              <div
                className={`grid gap-4 w-full max-h-[82vh] ${
                  totalVideoTiles === 1
                    ? 'grid-cols-1 max-w-2xl'
                    : totalVideoTiles === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : totalVideoTiles <= 4
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2'
                    : 'grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {/* Local user tile */}
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center group">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover -scale-x-100 ${isVideoOff ? 'hidden' : ''}`}
                  />
                  {isVideoOff && (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                      {participantName.charAt(0)}
                    </div>
                  )}

                  {/* Tile name badge */}
                  <div className="absolute bottom-3 left-3 flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-medium text-white border border-white/10">
                    <span className="truncate max-w-[140px]">{participantName} (You)</span>
                    {isHost && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1 rounded">Host</span>
                    )}
                  </div>

                  {/* Audio status indicator */}
                  <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                    {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                </div>

                {/* Real Remote Participants Tiles */}
                {remoteParticipantsList.map((remote) => (
                  <RemoteVideoTile
                    key={remote.socketId}
                    socketId={remote.socketId}
                    name={remote.name}
                    role={remote.role}
                    isHost={remote.isHost}
                    stream={remote.stream}
                    isMuted={remote.isMuted}
                    isVideoOff={remote.isVideoOff}
                  />
                ))}

                {/* Helpful invitation state when only you are present */}
                {remoteParticipantsList.length === 0 && (
                  <div className="aspect-video rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Radio className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">You are the first in the room</h4>
                      <p className="text-xs text-slate-400 max-w-xs mt-1">
                        Share the link or code <span className="font-mono text-indigo-300">{code}</span> with members.
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Invitation Link'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Side Drawers */}
        <WaitingRoomDrawer
          isOpen={activeDrawer === 'waiting'}
          onClose={() => setActiveDrawer(null)}
          waitingList={waitingList}
          participants={participants}
          raisedHands={raisedHands}
          isHost={isHost}
          onAdmit={handleAdmit}
          onAdmitAll={handleAdmitAll}
          onReject={handleReject}
          onMuteParticipant={(sockId) => socket?.emit(SOCKET_EVENTS.HOST_MUTE_PARTICIPANT, { targetSocketId: sockId })}
        />

        <ChatDrawer
          isOpen={activeDrawer === 'chat'}
          onClose={() => setActiveDrawer(null)}
          messages={messages}
          onSendMessage={handleSendMessage}
          onSendReaction={handleSendReaction}
        />

        <AgendaDrawer
          isOpen={activeDrawer === 'agenda'}
          onClose={() => setActiveDrawer(null)}
          agenda={agenda}
          tasks={tasks}
          onToggleAgenda={handleToggleAgenda}
          onAddAgendaItem={handleAddAgendaItem}
          onAddTask={handleAddTask}
          onToggleTask={handleToggleTask}
        />

        <PollsDrawer
          isOpen={activeDrawer === 'polls'}
          onClose={() => setActiveDrawer(null)}
          polls={polls}
          isHost={isHost}
          currentUserId={participantEmail || participantName}
          onCreatePoll={handleCreatePoll}
          onVote={handleVotePoll}
        />
      </div>

      {/* Bottom Meeting Control Bar */}
      <footer className="h-20 border-t border-slate-800 bg-[#0a0e1a] px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 font-mono">
          <span>WebRTC P2P</span>
          <span>•</span>
          <span className="text-emerald-400">Low-Latency Mesh</span>
        </div>

        {/* Core Media Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3 mx-auto">
          {/* Mic */}
          <button
            onClick={toggleMic}
            className={`p-3.5 rounded-2xl border transition cursor-pointer ${
              !isMuted
                ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-600/25'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-2xl border transition cursor-pointer ${
              !isVideoOff
                ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-600/25'
            }`}
            title={isVideoOff ? 'Start camera' : 'Stop camera'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-2xl border transition cursor-pointer ${
              isScreenSharing
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-600/25'
                : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
            }`}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          >
            <ScreenShare className="w-5 h-5" />
          </button>

          {/* Raise Hand */}
          <button
            onClick={toggleHandRaise}
            className={`p-3.5 rounded-2xl border transition cursor-pointer ${
              isHandRaised
                ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 border-yellow-400 font-bold shadow-lg shadow-yellow-500/25'
                : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
            }`}
            title={isHandRaised ? 'Lower your hand' : 'Raise hand'}
          >
            <Hand className="w-5 h-5" />
          </button>

          {/* Leave / End Call */}
          <button
            onClick={handleLeaveOrEnd}
            className="p-3.5 px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold border border-rose-500 shadow-lg shadow-rose-600/30 transition flex items-center space-x-1.5 cursor-pointer"
            title={isHost ? 'End meeting for all' : 'Leave meeting'}
          >
            <PhoneOff className="w-5 h-5" />
            <span className="hidden md:inline text-xs">{isHost ? 'End Meeting' : 'Leave'}</span>
          </button>
        </div>

        {/* Drawer toggles */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Participants & Waiting Room */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'waiting' ? null : 'waiting')}
            className={`p-2.5 rounded-xl border relative transition cursor-pointer ${
              activeDrawer === 'waiting'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Participants & Waiting Room"
          >
            <Users className="w-4 h-4" />
            {isHost && waitingList.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-bold text-[9px] flex items-center justify-center animate-pulse">
                {waitingList.length}
              </span>
            )}
          </button>

          {/* Chat */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            className={`p-2.5 rounded-xl border relative transition cursor-pointer ${
              activeDrawer === 'chat'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="In-call Chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Agenda & Tasks */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'agenda' ? null : 'agenda')}
            className={`p-2.5 rounded-xl border relative transition cursor-pointer ${
              activeDrawer === 'agenda'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Meeting Agenda"
          >
            <ListTodo className="w-4 h-4" />
          </button>

          {/* Polls */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'polls' ? null : 'polls')}
            className={`p-2.5 rounded-xl border relative transition cursor-pointer ${
              activeDrawer === 'polls'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Live Polls"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* Host Extension Modal */}
      {isExtendModalOpen && (
        <HostExtensionModal
          meetingId={meeting?.id}
          currentEndTime={timerState.currentEndTime}
          maxExtensionMinutes={meeting?.maxExtensionMinutes || 60}
          isOpen={isExtendModalOpen}
          onClose={() => setIsExtendModalOpen(false)}
        />
      )}

      {/* Attendance Modal */}
      {showAttendanceModal && meeting && (
        <AttendanceModal
          meetingId={meeting.id}
          isOpen={showAttendanceModal}
          onClose={() => setShowAttendanceModal(false)}
        />
      )}

      {/* Meeting Concluded Overlay */}
      {meetingEndedReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="p-8 max-w-md w-full rounded-3xl bg-[#111726] border border-slate-800 text-center space-y-6 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center mx-auto text-indigo-400">
              <Shield className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Meeting Concluded</h3>
              <p className="text-xs text-slate-400">
                {meetingEndedReason === 'automatic_time_expired'
                  ? 'Scheduled duration and extension time expired. All attendance data has been finalized.'
                  : 'The host has ended this meeting session.'}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => setShowAttendanceModal(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
              >
                View Attendance Report
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Return to Club Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
