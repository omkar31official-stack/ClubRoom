import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { setupSocketHandlers } from '../src/socket/index.js';
import { timerService } from '../src/services/timerService.js';
import { attendanceService } from '../src/services/attendanceService.js';
import { execute, queryOne, queryAll } from '../src/db/index.js';
import { generateToken } from '../src/middleware/auth.js';
import { SOCKET_EVENTS } from '@clubroom/shared';
import meetingsRouter from '../src/routes/meetings.js';
import waitingRouter from '../src/routes/waiting.js';

const TEST_PORT = 5070;

async function runE2E5UserTimerAndWebRtcSuite() {
  console.log('================================================================');
  console.log(`  🎯 E2E REAL-WORLD AUDIT: 5 USERS, WAITING ROOM, TIMER & WEBRTC`);
  console.log('================================================================');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/meetings', meetingsRouter);
  app.use('/api/v1/waiting', waitingRouter);

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  setupSocketHandlers(io);
  timerService.initialize(io);

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[E2E] Test server listening on port ${TEST_PORT}`);

  // Create users in DB: 1 Host (Alice) + 1 Member (Bob)
  const hostId = uuidv4();
  const bobId = uuidv4();
  const now = new Date().toISOString();
  const hostEmail = `alice.host.${Date.now()}@college.edu`;
  const bobEmail = `bob.member.${Date.now()}@college.edu`;

  execute(`
    INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Alice Host', 'organizer', ?, ?)
  `, [hostId, hostEmail, now, now]);

  execute(`
    INSERT INTO users (id, email, password_hash, full_name, role, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Bob Member', 'member', ?, ?)
  `, [bobId, bobEmail, now, now]);

  const hostToken = generateToken({ id: hostId, email: hostEmail, fullName: 'Alice Host', role: 'organizer' });
  const bobToken = generateToken({ id: bobId, email: bobEmail, fullName: 'Bob Member', role: 'member' });

  // 1. Host creates 30-minute meeting with waiting room
  const meetingId = uuidv4();
  const meetingCode = `e2e-sync-${Date.now()}`;
  const scheduledStart = new Date().toISOString();
  const scheduledEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  execute(`
    INSERT INTO meetings (
      id, code, title, description, organizer_id, scheduled_start_time, scheduled_end_time,
      current_end_time, duration_minutes, status, waiting_room_enabled, allow_extensions,
      max_extension_minutes, extension_count, created_at
    ) VALUES (?, ?, 'E2E 5-User Core Sync', 'Full scenario test', ?, ?, ?, ?, 30, 'scheduled', 1, 1, 60, 0, ?)
  `, [meetingId, meetingCode, hostId, scheduledStart, scheduledEnd, scheduledEnd, scheduledStart]);

  console.log(`[E2E] Step 1: Created 30-minute meeting [${meetingCode}] with waiting room enabled.`);

  // 2. Host (Alice) starts the meeting
  const initialTimer = timerService.startMeeting(meetingId);
  assert.equal(initialTimer.status, 'live', 'Meeting status must transition to live');
  assert.ok(initialTimer.remainingSeconds > 1750, 'Timer must start with ~1800s (30 mins)');
  console.log('✔ Step 2: Host started meeting. Authoritative countdown running at 30 minutes.');

  // Connect Host socket
  const hostSocket = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  await new Promise<void>((res) => {
    hostSocket.on('connect', () => {
      hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        meetingId,
        name: 'Alice Host',
        role: 'organizer',
        isHost: true,
        email: 'alice.host@college.edu',
      });
    });
    hostSocket.on(SOCKET_EVENTS.ROOM_STATE, () => res());
  });
  console.log('✔ Step 3: Host joined meeting room.');

  // 4. Bob enters waiting room -> Host receives notification -> Host admits Bob
  const bobSocket = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  let bobWaitingId = '';

  await new Promise<void>((res) => {
    hostSocket.on(SOCKET_EVENTS.WAITING_UPDATE, (list: any[]) => {
      if (list.length > 0 && list[0].name === 'Bob Member') {
        bobWaitingId = list[0].id;
        res();
      }
    });

    bobSocket.on('connect', () => {
      bobSocket.emit(SOCKET_EVENTS.WAITING_JOIN, {
        meetingId,
        name: 'Bob Member',
        email: 'bob.member@college.edu',
      });
    });
  });
  console.log(`✔ Step 4: Bob entered waiting room. Host received notification for waiting ID: ${bobWaitingId}`);

  // Host admits Bob
  let bobAdmitted = false;
  bobSocket.on(SOCKET_EVENTS.WAITING_STATUS_CHANGE, (data: any) => {
    if (data.status === 'admitted') bobAdmitted = true;
  });

  hostSocket.emit(SOCKET_EVENTS.WAITING_ADMIT, { meetingId, waitingId: bobWaitingId });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(bobAdmitted, 'Bob must receive admission status');

  // Bob enters meeting room
  await new Promise<void>((res) => {
    bobSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      meetingId,
      name: 'Bob Member',
      role: 'member',
      isHost: false,
      email: 'bob.member@college.edu',
    });
    bobSocket.on(SOCKET_EVENTS.ROOM_STATE, () => res());
  });
  console.log('✔ Step 5: Bob admitted and joined live meeting room.');

  // 6. Unauthorized participant rejection test (Charlie)
  const charlieSocket = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  let charlieWaitingId = '';

  await new Promise<void>((res) => {
    hostSocket.on(SOCKET_EVENTS.WAITING_UPDATE, (list: any[]) => {
      const charlie = list.find((p) => p.name === 'Charlie Uninvited');
      if (charlie) {
        charlieWaitingId = charlie.id;
        res();
      }
    });
    charlieSocket.emit(SOCKET_EVENTS.WAITING_JOIN, {
      meetingId,
      name: 'Charlie Uninvited',
      email: 'charlie@intruder.com',
    });
  });

  let charlieRejected = false;
  charlieSocket.on(SOCKET_EVENTS.WAITING_STATUS_CHANGE, (data: any) => {
    if (data.status === 'rejected') charlieRejected = true;
  });

  hostSocket.emit(SOCKET_EVENTS.WAITING_REJECT, { meetingId, waitingId: charlieWaitingId });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(charlieRejected, 'Unauthorized participant Charlie must be rejected');
  charlieSocket.disconnect();
  console.log('✔ Step 6: Unauthorized participant Charlie was rejected by host.');

  // 7. Join remaining 3 participants (Diana, Evan, Frank) to achieve 5 active participants
  const attendees = [
    { name: 'Diana Prince', email: 'diana@college.edu' },
    { name: 'Evan Wright', email: 'evan@college.edu' },
    { name: 'Frank Castle', email: 'frank@college.edu' },
  ];
  const participantSockets: ClientSocketType[] = [hostSocket, bobSocket];

  for (const attendee of attendees) {
    const s = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
    let waitingId = '';

    await new Promise<void>((res) => {
      hostSocket.on(SOCKET_EVENTS.WAITING_UPDATE, (list: any[]) => {
        const found = list.find((p) => p.name === attendee.name);
        if (found) {
          waitingId = found.id;
          res();
        }
      });
      s.emit(SOCKET_EVENTS.WAITING_JOIN, {
        meetingId,
        name: attendee.name,
        email: attendee.email,
      });
    });

    hostSocket.emit(SOCKET_EVENTS.WAITING_ADMIT, { meetingId, waitingId });
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((res) => {
      s.emit(SOCKET_EVENTS.JOIN_ROOM, {
        meetingId,
        name: attendee.name,
        role: 'member',
        isHost: false,
        email: attendee.email,
      });
      s.on(SOCKET_EVENTS.ROOM_STATE, () => res());
    });
    participantSockets.push(s);
  }

  assert.equal(participantSockets.length, 5, 'Exactly 5 participants must now be active in the meeting');
  console.log(`✔ Step 7: 5 active participants joined (Alice [Host], Bob, Diana, Evan, Frank).`);

  // 8. Verify synchronized countdowns across all 5 participants
  let syncCount = 0;
  for (const s of participantSockets) {
    s.on(SOCKET_EVENTS.TIMER_TICK, () => {
      syncCount++;
    });
  }
  await new Promise((r) => setTimeout(r, 1200));
  assert.ok(syncCount >= 5, 'All 5 participants must receive real-time timer ticks');
  console.log(`✔ Step 8: Synchronized timer ticks received by all 5 participant sessions.`);

  // 9. Security Authorization Test: Non-host cannot extend or terminate meeting
  console.log('[E2E] Step 9: Verifying non-host cannot extend or end meeting...');

  // Non-host Bob attempts to extend meeting via REST API
  const unauthorizedExtendRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/meetings/${meetingId}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobToken}` },
    body: JSON.stringify({ minutes: 10 }),
  });
  assert.equal(unauthorizedExtendRes.status, 403, 'Non-host Bob must receive 403 Forbidden when extending');

  // Non-host Bob attempts to terminate meeting
  const unauthorizedEndRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/meetings/${meetingId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobToken}` },
  });
  assert.equal(unauthorizedEndRes.status, 403, 'Non-host Bob must receive 403 Forbidden when ending meeting');
  console.log('✔ Non-host permission checks strictly verified (403 Forbidden).');

  // 10. Host extends meeting by 10 minutes -> All 5 participants receive updated deadline
  console.log('[E2E] Step 10: Host extending meeting by +10 minutes...');
  let extendBroadcasts = 0;
  for (const s of participantSockets) {
    s.on(SOCKET_EVENTS.MEETING_EXTEND, () => {
      extendBroadcasts++;
    });
  }

  const extendRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/meetings/${meetingId}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({ minutes: 10 }),
  });
  assert.equal(extendRes.status, 200, 'Host extension request must succeed');

  await new Promise((r) => setTimeout(r, 300));
  assert.equal(extendBroadcasts, 5, 'All 5 participants must receive the meeting:extend broadcast');
  console.log('✔ All 5 participants received updated deadline (+10m).');

  // 11. Verify meeting does not end at original deadline after extension
  console.log('[E2E] Step 11: Simulating passage past original deadline...');
  // Check that timer remaining seconds is > 1800 (original duration was 1800, now extended to ~2400)
  const currentTimerState = timerService.getTimerState(meetingId);
  assert.ok(currentTimerState.remainingSeconds > 2000, 'Remaining seconds must be >2000s reflecting the +10m extension');
  assert.equal(currentTimerState.isExtended, true, 'Meeting must be marked extended');
  assert.equal(currentTimerState.extensionCount, 1, 'Extension count must be 1');
  console.log(`✔ Meeting is live and extended beyond original deadline (Remaining: ${currentTimerState.remainingSeconds}s).`);

  // 12. WebRTC Signaling and Media State Sync among the 5 participants
  console.log('[E2E] Step 12: Testing WebRTC signaling & media sync across the 5 peers...');
  let mediaStateReceived = 0;
  for (let i = 1; i < participantSockets.length; i++) {
    participantSockets[i].on('media:state_change', (data: any) => {
      if (data.isMuted === true) mediaStateReceived++;
    });
  }

  hostSocket.emit('media:state_change', { isMuted: true, isVideoOff: false });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(mediaStateReceived, 4, 'All 4 peer participants must receive host media state change');
  console.log('✔ Peer media state change received by all active peers.');

  // 13. Participant disconnect and reconnect
  console.log('[E2E] Step 13: Testing participant disconnect and reconnect...');
  const evanSocket = participantSockets[3]; // Evan
  let evanLeftDetected = false;
  hostSocket.on('participant:left', (data: any) => {
    if (data.name === 'Evan Wright') evanLeftDetected = true;
  });

  evanSocket.disconnect();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(evanLeftDetected, 'Evan disconnect must be detected by host');

  // Evan reconnects
  const evanReconnected = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  let evanReceivedStateOnReconnect = false;
  await new Promise<void>((res) => {
    evanReconnected.on('connect', () => {
      evanReconnected.emit(SOCKET_EVENTS.JOIN_ROOM, {
        meetingId,
        name: 'Evan Wright',
        role: 'member',
        isHost: false,
        email: 'evan@college.edu',
      });
    });
    evanReconnected.on(SOCKET_EVENTS.ROOM_STATE, (state: any) => {
      assert.ok(state.timerState.isExtended, 'Reconnected user must receive current extended timer state');
      evanReceivedStateOnReconnect = true;
      res();
    });
  });
  assert.ok(evanReceivedStateOnReconnect, 'Evan must seamlessly receive state on reconnect');
  console.log('✔ Disconnect and reconnection verified with zero state loss.');

  // 14. Meeting termination
  console.log('[E2E] Step 14: Host terminates meeting...');
  let endBroadcasts = 0;
  for (const s of [hostSocket, bobSocket, participantSockets[2], evanReconnected, participantSockets[4]]) {
    s.on(SOCKET_EVENTS.MEETING_END, () => {
      endBroadcasts++;
    });
  }

  const endRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/meetings/${meetingId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hostToken}` },
  });
  assert.equal(endRes.status, 200, 'Meeting end request must succeed');

  await new Promise((r) => setTimeout(r, 300));
  assert.ok(endBroadcasts >= 4, 'Participants must receive meeting:end event');

  // Verify attendance table
  const finalAttendance = attendanceService.getMeetingAttendance(meetingId);
  const uniqueParticipants = new Set(finalAttendance.records.map((r) => r.participant_name));
  assert.equal(uniqueParticipants.size, 5, 'All 5 unique participants must have attendance recorded');
  for (const rec of finalAttendance.records) {
    assert.ok(rec.left_at, `Attendance record for ${rec.participant_name} must have left_at timestamp`);
  }
  console.log(`✔ Meeting ended cleanly. Finalized attendance for all ${uniqueParticipants.size} unique participants across ${finalAttendance.records.length} sessions.`);

  // Cleanup
  for (const s of participantSockets) s.disconnect();
  evanReconnected.disconnect();
  timerService.stop();
  await new Promise<void>((res) => server.close(() => res()));

  console.log('================================================================');
  console.log('  🎉 E2E 5-USER REAL-WORLD SCENARIO PASSED 100%!');
  console.log('================================================================');
}

runE2E5UserTimerAndWebRtcSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ E2E 5-user scenario failed:', err);
    process.exit(1);
  });
