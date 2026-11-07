import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { SOCKET_EVENTS, ChatMessage, UserRole } from '@clubroom/shared';
import { timerService } from '../services/timerService.js';
import { attendanceService } from '../services/attendanceService.js';
import { execute, queryAll, queryOne } from '../db/index.js';

interface ConnectedUser {
  socketId: string;
  meetingId: string;
  name: string;
  role: UserRole;
  isHost: boolean;
  email?: string;
  isHandRaised: boolean;
}

export function setupSocketHandlers(io: SocketIOServer) {
  // Map socketId -> ConnectedUser
  const connectedUsers = new Map<string, ConnectedUser>();
  // Map meetingId -> Set of socketIds with hands raised
  const raisedHands = new Map<string, Array<{ socketId: string; name: string }>>();

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ==========================================
    // 1. WAITING ROOM FLOW
    // ==========================================
    socket.on(SOCKET_EVENTS.WAITING_JOIN, (data: { meetingId: string; name: string; email?: string }) => {
      const { meetingId, name, email } = data;
      const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
      if (!meeting) {
        socket.emit('error', { message: 'Meeting not found' });
        return;
      }

      const actualId = meeting.id;

      // If waiting room is disabled for this meeting, admit immediately!
      if (!meeting.waiting_room_enabled) {
        socket.emit(SOCKET_EVENTS.WAITING_STATUS_CHANGE, {
          status: 'admitted',
          meetingId: actualId
        });
        return;
      }

      const waitingId = uuidv4();
      const now = new Date().toISOString();

      execute(`
        INSERT INTO waiting_room (id, meeting_id, socket_id, participant_name, participant_email, status, requested_at)
        VALUES (?, ?, ?, ?, ?, 'waiting', ?)
      `, [waitingId, actualId, socket.id, name, email || null, now]);

      socket.join(`waiting_${actualId}`);

      // Notify organizers in the meeting room
      const waitingList = queryAll<any>(`
        SELECT id, socket_id as socketId, participant_name as name, participant_email as email, requested_at as requestedAt
        FROM waiting_room
        WHERE meeting_id = ? AND status = 'waiting'
        ORDER BY requested_at ASC
      `, [actualId]);

      io.to(actualId).emit(SOCKET_EVENTS.WAITING_UPDATE, waitingList);
      socket.emit(SOCKET_EVENTS.WAITING_STATUS_CHANGE, { status: 'waiting', waitingId });
    });

    socket.on(SOCKET_EVENTS.WAITING_ADMIT, (data: { meetingId: string; waitingId: string }) => {
      const { meetingId, waitingId } = data;
      const waitingParticipant = queryOne<any>('SELECT * FROM waiting_room WHERE id = ?', [waitingId]);
      if (!waitingParticipant) return;

      execute(`UPDATE waiting_room SET status = 'admitted' WHERE id = ?`, [waitingId]);

      if (waitingParticipant.socket_id) {
        io.to(waitingParticipant.socket_id).emit(SOCKET_EVENTS.WAITING_STATUS_CHANGE, {
          status: 'admitted',
          meetingId
        });
      }

      // Update remaining waiting list for organizers
      const updatedList = queryAll<any>(`
        SELECT id, socket_id as socketId, participant_name as name, participant_email as email, requested_at as requestedAt
        FROM waiting_room
        WHERE meeting_id = ? AND status = 'waiting'
        ORDER BY requested_at ASC
      `, [meetingId]);

      io.to(meetingId).emit(SOCKET_EVENTS.WAITING_UPDATE, updatedList);
    });

    socket.on(SOCKET_EVENTS.WAITING_ADMIT_ALL, (data: { meetingId: string }) => {
      const { meetingId } = data;
      const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
      if (!meeting) return;

      const waitingParticipants = queryAll<any>(`
        SELECT id, socket_id FROM waiting_room
        WHERE meeting_id = ? AND status = 'waiting'
      `, [meeting.id]);

      execute(`UPDATE waiting_room SET status = 'admitted' WHERE meeting_id = ? AND status = 'waiting'`, [meeting.id]);

      for (const p of waitingParticipants) {
        if (p.socket_id) {
          io.to(p.socket_id).emit(SOCKET_EVENTS.WAITING_STATUS_CHANGE, {
            status: 'admitted',
            meetingId: meeting.id
          });
        }
      }

      io.to(meeting.id).emit(SOCKET_EVENTS.WAITING_UPDATE, []);
    });

    socket.on(SOCKET_EVENTS.WAITING_REJECT, (data: { meetingId: string; waitingId: string }) => {
      const { meetingId, waitingId } = data;
      const waitingParticipant = queryOne<any>('SELECT * FROM waiting_room WHERE id = ?', [waitingId]);
      if (!waitingParticipant) return;

      execute(`UPDATE waiting_room SET status = 'rejected' WHERE id = ?`, [waitingId]);

      if (waitingParticipant.socket_id) {
        io.to(waitingParticipant.socket_id).emit(SOCKET_EVENTS.WAITING_STATUS_CHANGE, {
          status: 'rejected',
          meetingId
        });
      }

      const updatedList = queryAll<any>(`
        SELECT id, socket_id as socketId, participant_name as name, participant_email as email, requested_at as requestedAt
        FROM waiting_room
        WHERE meeting_id = ? AND status = 'waiting'
        ORDER BY requested_at ASC
      `, [meetingId]);

      io.to(meetingId).emit(SOCKET_EVENTS.WAITING_UPDATE, updatedList);
    });

    // ==========================================
    // 2. MAIN MEETING ROOM JOIN & STATE
    // ==========================================
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (data: {
      meetingId: string;
      name: string;
      role?: UserRole;
      isHost?: boolean;
      email?: string;
    }) => {
      const { meetingId, name, role = 'member', isHost = false, email } = data;
      const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
      if (!meeting) {
        socket.emit('error', { message: 'Meeting not found' });
        return;
      }

      const actualId = meeting.id;
      socket.join(actualId);

      const user: ConnectedUser = {
        socketId: socket.id,
        meetingId: actualId,
        name,
        role,
        isHost,
        email,
        isHandRaised: false
      };
      connectedUsers.set(socket.id, user);

      // Record attendance
      attendanceService.recordJoin(actualId, name, email);

      // Fetch room data
      const timerState = timerService.getTimerState(actualId);
      const agenda = queryAll<any>('SELECT * FROM meeting_agenda WHERE meeting_id = ? ORDER BY order_index ASC', [actualId]);
      const messages = queryAll<any>('SELECT * FROM meeting_messages WHERE meeting_id = ? ORDER BY timestamp ASC LIMIT 50', [actualId]);
      const polls = queryAll<any>('SELECT * FROM polls WHERE meeting_id = ? ORDER BY created_at DESC', [actualId]).map(p => ({
        ...p,
        options: JSON.parse(p.options_json),
        voters: JSON.parse(p.voters_json),
        isOpen: Boolean(p.is_open)
      }));

      const roomParticipants = Array.from(connectedUsers.values()).filter(u => u.meetingId === actualId);
      const waitingList = queryAll<any>(`
        SELECT id, socket_id as socketId, participant_name as name, participant_email as email, requested_at as requestedAt
        FROM waiting_room
        WHERE meeting_id = ? AND status = 'waiting'
        ORDER BY requested_at ASC
      `, [actualId]);

      // Emit full state to the joined user
      socket.emit(SOCKET_EVENTS.ROOM_STATE, {
        meeting: {
          id: meeting.id,
          code: meeting.code,
          title: meeting.title,
          description: meeting.description,
          status: meeting.status,
          durationMinutes: meeting.duration_minutes,
          allowExtensions: Boolean(meeting.allow_extensions),
          maxExtensionMinutes: meeting.max_extension_minutes,
          extensionCount: meeting.extension_count
        },
        timerState,
        agenda,
        messages,
        polls,
        participants: roomParticipants,
        waitingList: isHost ? waitingList : [],
        raisedHands: raisedHands.get(actualId) || []
      });

      // Broadcast participant joined to room
      socket.to(actualId).emit('participant:joined', {
        socketId: socket.id,
        name,
        role,
        isHost
      });

      console.log(`[Socket] ${name} (${role}) joined meeting room ${actualId}`);
    });

    // ==========================================
    // WEBRTC PEER-TO-PEER MESH SIGNALING
    // ==========================================
    socket.on('webrtc:signal', (data: { to: string; signal: any }) => {
      io.to(data.to).emit('webrtc:signal', {
        from: socket.id,
        signal: data.signal
      });
    });

    socket.on('media:state_change', (data: { isMuted: boolean; isVideoOff: boolean }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.to(user.meetingId).emit('media:state_change', {
          socketId: socket.id,
          isMuted: data.isMuted,
          isVideoOff: data.isVideoOff
        });
      }
    });

    // ==========================================
    // 3. CHAT & REACTIONS
    // ==========================================
    socket.on(SOCKET_EVENTS.CHAT_SEND, (data: { meetingId: string; message: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      const meetingId = user.meetingId;
      const messageId = uuidv4();
      const now = new Date().toISOString();

      execute(`
        INSERT INTO meeting_messages (id, meeting_id, sender_name, sender_role, sender_id, message, timestamp, is_system)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `, [messageId, meetingId, user.name, user.role, socket.id, data.message, now]);

      const chatMsg: ChatMessage = {
        id: messageId,
        meetingId,
        senderName: user.name,
        senderRole: user.role,
        senderId: socket.id,
        message: data.message,
        timestamp: now,
        isSystem: false
      };

      io.to(meetingId).emit(SOCKET_EVENTS.CHAT_RECEIVE, chatMsg);
    });

    socket.on(SOCKET_EVENTS.REACTION, (data: { emoji: string; meetingId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      io.to(user.meetingId).emit(SOCKET_EVENTS.REACTION, {
        senderName: user.name,
        emoji: data.emoji,
        timestamp: new Date().toISOString()
      });
    });

    // ==========================================
    // 4. RAISED HANDS
    // ==========================================
    socket.on(SOCKET_EVENTS.HAND_RAISE, () => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      user.isHandRaised = true;
      let queue = raisedHands.get(user.meetingId);
      if (!queue) {
        queue = [];
        raisedHands.set(user.meetingId, queue);
      }

      if (!queue.some(h => h.socketId === socket.id)) {
        queue.push({ socketId: socket.id, name: user.name });
      }

      io.to(user.meetingId).emit(SOCKET_EVENTS.HAND_QUEUE_UPDATE, queue);
    });

    socket.on(SOCKET_EVENTS.HAND_LOWER, () => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      user.isHandRaised = false;
      const queue = raisedHands.get(user.meetingId);
      if (queue) {
        const filtered = queue.filter(h => h.socketId !== socket.id);
        raisedHands.set(user.meetingId, filtered);
        io.to(user.meetingId).emit(SOCKET_EVENTS.HAND_QUEUE_UPDATE, filtered);
      }
    });

    // ==========================================
    // 5. POLLS
    // ==========================================
    socket.on(SOCKET_EVENTS.POLL_CREATE, (data: { meetingId: string; question: string; options: string[] }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || (!user.isHost && user.role !== 'club_admin' && user.role !== 'organizer')) return;

      const pollId = uuidv4();
      const options = data.options.map((text, idx) => ({ id: `opt-${idx}`, text, votes: 0 }));
      const now = new Date().toISOString();

      execute(`
        INSERT INTO polls (id, meeting_id, question, options_json, voters_json, is_open, created_at)
        VALUES (?, ?, ?, ?, '[]', 1, ?)
      `, [pollId, user.meetingId, data.question, JSON.stringify(options), now]);

      io.to(user.meetingId).emit(SOCKET_EVENTS.POLL_UPDATE, {
        id: pollId,
        meetingId: user.meetingId,
        question: data.question,
        options,
        voters: [],
        isOpen: true,
        createdAt: now
      });
    });

    socket.on(SOCKET_EVENTS.POLL_VOTE, (data: { pollId: string; optionId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      const poll = queryOne<any>('SELECT * FROM polls WHERE id = ?', [data.pollId]);
      if (!poll || !poll.is_open) return;

      const voters: string[] = JSON.parse(poll.voters_json || '[]');
      const voterIdentifier = user.email || user.name || socket.id;

      if (voters.includes(voterIdentifier)) {
        socket.emit('error', { message: 'You have already voted on this poll' });
        return;
      }

      const options = JSON.parse(poll.options_json);
      const targetOption = options.find((opt: any) => opt.id === data.optionId);
      if (targetOption) {
        targetOption.votes += 1;
        voters.push(voterIdentifier);

        execute(`
          UPDATE polls
          SET options_json = ?, voters_json = ?
          WHERE id = ?
        `, [JSON.stringify(options), JSON.stringify(voters), data.pollId]);

        io.to(user.meetingId).emit(SOCKET_EVENTS.POLL_UPDATE, {
          id: poll.id,
          meetingId: user.meetingId,
          question: poll.question,
          options,
          voters,
          isOpen: Boolean(poll.is_open),
          createdAt: poll.created_at
        });
      }
    });

    // ==========================================
    // 6. AGENDA ITEM TOGGLE
    // ==========================================
    socket.on('agenda:toggle', (data: { agendaId: string; completed: boolean }) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      execute(`
        UPDATE meeting_agenda
        SET completed = ?
        WHERE id = ?
      `, [data.completed ? 1 : 0, data.agendaId]);

      const updatedAgenda = queryAll<any>('SELECT * FROM meeting_agenda WHERE meeting_id = ? ORDER BY order_index ASC', [user.meetingId]);
      io.to(user.meetingId).emit(SOCKET_EVENTS.AGENDA_UPDATE, updatedAgenda);
    });

    // ==========================================
    // 7. HOST CONTROLS
    // ==========================================
    socket.on(SOCKET_EVENTS.HOST_MUTE_PARTICIPANT, (data: { targetSocketId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || (!user.isHost && user.role !== 'club_admin' && user.role !== 'organizer')) return;

      io.to(data.targetSocketId).emit('host:force_mute');
    });

    socket.on(SOCKET_EVENTS.HOST_REMOVE_PARTICIPANT, (data: { targetSocketId: string }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || (!user.isHost && user.role !== 'club_admin' && user.role !== 'organizer')) return;

      io.to(data.targetSocketId).emit('host:removed_from_meeting');
    });

    // ==========================================
    // 8. DISCONNECT HANDLER
    // ==========================================
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        attendanceService.recordLeave(user.meetingId, user.name);

        // Remove from raised hands
        const queue = raisedHands.get(user.meetingId);
        if (queue) {
          const filtered = queue.filter(h => h.socketId !== socket.id);
          raisedHands.set(user.meetingId, filtered);
          io.to(user.meetingId).emit(SOCKET_EVENTS.HAND_QUEUE_UPDATE, filtered);
        }

        socket.to(user.meetingId).emit('participant:left', {
          socketId: socket.id,
          name: user.name
        });

        connectedUsers.delete(socket.id);
        console.log(`[Socket] ${user.name} left meeting ${user.meetingId}`);
      }
    });
  });
}

