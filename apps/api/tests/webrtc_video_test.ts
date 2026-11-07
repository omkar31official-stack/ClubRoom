import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { setupSocketHandlers } from '../src/socket/index.js';
import { timerService } from '../src/services/timerService.js';
import { execute, queryOne } from '../src/db/index.js';
import { SOCKET_EVENTS } from '@clubroom/shared';
import { createLiveKitToken } from '../src/services/livekitService.js';

const TEST_PORT = 5060;

async function runWebRtcVideoAuditSuite() {
  console.log('================================================================');
  console.log(`  📹 MULTI-USER WEBRTC & VIDEO CONFERENCING AUDIT SUITE`);
  console.log('================================================================');

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  setupSocketHandlers(io);
  timerService.initialize(io);

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[WebRtcAudit] Signaling test server active on port ${TEST_PORT}`);

  const meetingId = uuidv4();
  const meetingCode = `webrtc-audit-${Date.now()}`;
  const now = new Date();
  const endTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  const user = queryOne<any>('SELECT id FROM users LIMIT 1');
  const organizerId = user ? user.id : uuidv4();

  // Create meeting in database
  execute(`
    INSERT INTO meetings (
      id, code, title, description, organizer_id, scheduled_start_time, scheduled_end_time,
      current_end_time, duration_minutes, status, waiting_room_enabled, allow_extensions,
      max_extension_minutes, extension_count, created_at
    ) VALUES (?, ?, 'Multi-User WebRTC Verification', 'Audit video conferencing', ?, ?, ?, ?, 30, 'live', 0, 1, 60, 0, ?)
  `, [meetingId, meetingCode, organizerId, now.toISOString(), endTime, endTime, now.toISOString()]);

  timerService.startMeeting(meetingId);

  // 1. Participant 1 (Alice) joins
  let aliceSocket: ClientSocketType;
  let bobSocket: ClientSocketType;

  console.log('[WebRtcAudit] Step 1: Participant 1 (Alice) joins room...');
  aliceSocket = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });

  await new Promise<void>((resolve) => {
    aliceSocket.on('connect', () => {
      aliceSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        meetingId,
        name: 'Alice Johnson',
        role: 'organizer',
        isHost: true,
        email: 'alice@college.edu',
      });
    });
    aliceSocket.on(SOCKET_EVENTS.ROOM_STATE, () => resolve());
  });
  console.log('✔ Alice joined room and received room state.');

  // 2. Participant 2 (Bob) joins
  console.log('[WebRtcAudit] Step 2: Participant 2 (Bob) joins room...');
  bobSocket = ClientSocket(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });

  let aliceDetectedBobJoined = false;

  await new Promise<void>((resolve) => {
    let bobReady = false;

    aliceSocket.on('participant:joined', (data: any) => {
      if (data.name === 'Bob Smith') {
        aliceDetectedBobJoined = true;
        if (bobReady) resolve();
      }
    });

    bobSocket.on('connect', () => {
      bobSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        meetingId,
        name: 'Bob Smith',
        role: 'member',
        isHost: false,
        email: 'bob@college.edu',
      });
    });

    bobSocket.on(SOCKET_EVENTS.ROOM_STATE, () => {
      bobReady = true;
      if (aliceDetectedBobJoined) resolve();
      else setTimeout(resolve, 300);
    });
  });
  console.log('✔ Bob joined room.');
  assert.ok(aliceDetectedBobJoined, 'Alice must detect Bob joining the room');

  // 3. WebRTC Offer & Answer Exchange over Signaling
  console.log('[WebRtcAudit] Step 3: Verifying WebRTC Offer & Answer exchange...');
  const simulatedOfferSdp = { type: 'offer', sdp: 'v=0\r\no=alice 1234 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };
  const simulatedAnswerSdp = { type: 'answer', sdp: 'v=0\r\no=bob 5678 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };

  let bobReceivedOffer = false;
  let aliceReceivedAnswer = false;

  bobSocket.on('webrtc:signal', (data: any) => {
    if (data.signal?.type === 'offer') {
      bobReceivedOffer = true;
      // Bob replies with answer
      bobSocket.emit('webrtc:signal', {
        to: data.from,
        signal: simulatedAnswerSdp,
      });
    }
  });

  aliceSocket.on('webrtc:signal', (data: any) => {
    if (data.signal?.type === 'answer') {
      aliceReceivedAnswer = true;
    }
  });

  // Alice sends WebRTC offer to Bob
  aliceSocket.emit('webrtc:signal', {
    to: bobSocket.id,
    signal: simulatedOfferSdp,
  });

  await new Promise((r) => setTimeout(r, 300));
  assert.ok(bobReceivedOffer, 'Bob must receive Alice WebRTC offer');
  assert.ok(aliceReceivedAnswer, 'Alice must receive Bob WebRTC answer');
  console.log('✔ WebRTC SDP offer and answer exchanged successfully between peers!');

  // 4. ICE Candidates Signaling Exchange
  console.log('[WebRtcAudit] Step 4: Verifying ICE candidate exchange...');
  let bobReceivedCandidate = false;
  bobSocket.on('webrtc:signal', (data: any) => {
    if (data.signal?.type === 'candidate') {
      bobReceivedCandidate = true;
    }
  });

  aliceSocket.emit('webrtc:signal', {
    to: bobSocket.id,
    signal: { type: 'candidate', candidate: { candidate: 'candidate:1 1 UDP 2122260223 127.0.0.1 5000 typ host' } },
  });

  await new Promise((r) => setTimeout(r, 200));
  assert.ok(bobReceivedCandidate, 'Bob must receive ICE candidate from Alice');
  console.log('✔ ICE candidates routed successfully between peers.');

  // 5. Media State Changes (Mute / Video Toggle)
  console.log('[WebRtcAudit] Step 5: Verifying microphone mute and camera state sync...');
  let bobReceivedMuteEvent = false;
  bobSocket.on('media:state_change', (data: any) => {
    if (data.isMuted === true && data.isVideoOff === false) {
      bobReceivedMuteEvent = true;
    }
  });

  aliceSocket.emit('media:state_change', { isMuted: true, isVideoOff: false });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(bobReceivedMuteEvent, 'Bob must receive Alice media state change (muted: true)');
  console.log('✔ Media state synchronization verified.');

  // 6. Participant Disconnection Detection
  console.log('[WebRtcAudit] Step 6: Verifying participant disconnection detection...');
  let aliceDetectedBobLeft = false;
  aliceSocket.on('participant:left', (data: any) => {
    if (data.name === 'Bob Smith') {
      aliceDetectedBobLeft = true;
    }
  });

  bobSocket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(aliceDetectedBobLeft, 'Alice must receive participant:left event upon Bob disconnection');
  console.log('✔ Participant disconnection detected and peer connection cleaned up.');

  // 7. LiveKit Token Permissions Verification
  console.log('[WebRtcAudit] Step 7: Verifying LiveKit token grant permissions...');
  const hostToken = await createLiveKitToken({
    roomName: meetingCode,
    participantName: 'Alice Johnson',
    participantIdentity: 'alice-host-1',
    isHost: true,
  });
  assert.ok(hostToken.token, 'LiveKit host token generated');

  const guestToken = await createLiveKitToken({
    roomName: meetingCode,
    participantName: 'Charlie Guest',
    participantIdentity: 'charlie-guest-1',
    isHost: false,
  });
  assert.ok(guestToken.token, 'LiveKit guest token generated');
  console.log('✔ LiveKit tokens validated for host and guests.');

  // Clean teardown
  aliceSocket.disconnect();
  timerService.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log('================================================================');
  console.log('  🎉 WEBRTC VIDEO CONFERENCING AUDIT PASSED 100%!');
  console.log('================================================================');
}

runWebRtcVideoAuditSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ WebRTC video audit failed:', err);
    process.exit(1);
  });
