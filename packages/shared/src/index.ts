export type UserRole = 
  | 'super_admin'
  | 'club_admin'
  | 'event_manager'
  | 'organizer'
  | 'co_host'
  | 'member'
  | 'guest';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  memberId?: string;
  department?: string;
  designation?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export type MeetingStatus = 'scheduled' | 'live' | 'extended' | 'ended' | 'cancelled';

export interface Meeting {
  id: string;
  code: string; // e.g. "club-xyz-123"
  title: string;
  description?: string;
  organizerId: string;
  organizerName?: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime?: string | null;
  currentEndTime: string;
  durationMinutes: number;
  status: MeetingStatus;
  waitingRoomEnabled: boolean;
  allowExtensions: boolean;
  maxExtensionMinutes: number;
  extensionCount: number;
  createdAt: string;
}

export interface MeetingExtension {
  id: string;
  meetingId: string;
  extendedBy: string;
  extendedByName?: string;
  addedMinutes: number;
  previousEndTime: string;
  newEndTime: string;
  createdAt: string;
}

export interface WaitingParticipant {
  id: string;
  meetingId: string;
  socketId: string;
  name: string;
  email?: string;
  requestedAt: string;
  status: 'waiting' | 'admitted' | 'rejected';
}

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  socketId?: string;
  name: string;
  email?: string;
  role: UserRole;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isHandRaised: boolean;
  joinedAt: string;
  leftAt?: string | null;
}

export interface TimerState {
  meetingId: string;
  status: MeetingStatus;
  startedAt: string | null;
  currentEndTime: string;
  remainingSeconds: number;
  elapsedSeconds: number;
  isExtended: boolean;
  extensionCount: number;
  warningsTriggered: {
    tenMin: boolean;
    fiveMin: boolean;
    oneMin: boolean;
    thirtySec: boolean;
  };
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  title: string;
  durationMinutes?: number;
  completed: boolean;
  orderIndex: number;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  task: string;
  assigneeName?: string;
  assigneeEmail?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  meetingId: string;
  participantName: string;
  participantEmail?: string;
  joinedAt: string;
  leftAt?: string | null;
  durationSeconds: number;
  status: 'present' | 'late' | 'left_early';
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  senderName: string;
  senderRole: UserRole;
  senderId?: string;
  message: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  meetingId: string;
  question: string;
  options: PollOption[];
  voters: string[]; // user IDs or socket IDs who voted
  isOpen: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorName: string;
  createdAt: string;
  category?: 'urgent' | 'general' | 'workshop' | 'meeting';
}

// Socket Event Names
export const SOCKET_EVENTS = {
  // Connection
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  ROOM_STATE: 'room:state',

  // Waiting Room
  WAITING_JOIN: 'waiting:join',
  WAITING_UPDATE: 'waiting:update',
  WAITING_ADMIT: 'waiting:admit',
  WAITING_REJECT: 'waiting:reject',
  WAITING_ADMIT_ALL: 'waiting:admit_all',
  WAITING_STATUS_CHANGE: 'waiting:status_change',

  // Timer & Extension
  TIMER_SYNC: 'timer:sync',
  TIMER_TICK: 'timer:tick',
  TIMER_WARNING: 'timer:warning',
  MEETING_START: 'meeting:start',
  MEETING_EXTEND: 'meeting:extend',
  MEETING_END: 'meeting:end',

  // Media & Interaction
  MEDIA_STATE_CHANGE: 'media:state_change',
  HAND_RAISE: 'hand:raise',
  HAND_LOWER: 'hand:lower',
  HAND_QUEUE_UPDATE: 'hand:queue_update',
  REACTION: 'reaction:broadcast',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_RECEIVE: 'chat:receive',
  CHAT_HISTORY: 'chat:history',

  // Agenda & Action Items
  AGENDA_UPDATE: 'agenda:update',
  ACTION_ITEM_UPDATE: 'action:update',

  // Polls
  POLL_CREATE: 'poll:create',
  POLL_VOTE: 'poll:vote',
  POLL_UPDATE: 'poll:update',

  // Host Controls
  HOST_MUTE_PARTICIPANT: 'host:mute_participant',
  HOST_REMOVE_PARTICIPANT: 'host:remove_participant',
  HOST_LOCK_MEETING: 'host:lock_meeting'
} as const;

