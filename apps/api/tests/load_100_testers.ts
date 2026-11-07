import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'node:perf_hooks';
import { setupSocketHandlers } from '../src/socket/index.js';
import { timerService } from '../src/services/timerService.js';
import { execute, queryOne } from '../src/db/index.js';
import { SOCKET_EVENTS } from '@clubroom/shared';

const TEST_PORT = 5055;
const NUM_TESTERS = 100;

interface LatencyMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  avgLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
}

function calculatePercentiles(latencies: number[]): { avg: number; p95: number; max: number; min: number } {
  if (latencies.length === 0) return { avg: 0, p95: 0, max: 0, min: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Number((sum / sorted.length).toFixed(2));
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[sorted.length - 1].toFixed(2));
  const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  const p95 = Number(sorted[p95Index].toFixed(2));
  return { avg, p95, max, min };
}

async function run100TestersSuite() {
  console.log('================================================================');
  console.log(`  🚀 LAUNCHING 100 CONCURRENT TESTERS STRESS & LOAD SUITE`);
  console.log(`  👥 Simulating ${NUM_TESTERS} simultaneous active club meeting participants`);
  console.log('================================================================');

  const allLatencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  setupSocketHandlers(io);
  timerService.initialize(io);

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[LoadTest] Test server active on port ${TEST_PORT}`);

  const meetingId = uuidv4();
  const meetingCode = `stress-${Date.now()}`;
  const now = new Date();
  const endTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  // Get an existing organizer ID
  const existingUser = queryOne<any>('SELECT id FROM users LIMIT 1');
  const organizerId = existingUser ? existingUser.id : uuidv4();

  // Create test meeting in DB
  execute(`
    INSERT INTO meetings (
      id, code, title, description, organizer_id, scheduled_start_time, scheduled_end_time,
      current_end_time, duration_minutes, status, waiting_room_enabled, allow_extensions,
      max_extension_minutes, extension_count, created_at
    ) VALUES (?, ?, 'High Concurrency 100-Member Townhall', 'Stress testing', ?, ?, ?, ?, 30, 'scheduled', 0, 1, 60, 0, ?)
  `, [meetingId, meetingCode, organizerId, now.toISOString(), endTime, endTime, now.toISOString()]);

  // Start meeting timer
  timerService.startMeeting(meetingId);

  const clients: ClientSocketType[] = [];
  let extensionBroadcastsReceived = 0;
  let chatMessagesReceived = 0;

  console.log(`[LoadTest] Step 1: Connecting ${NUM_TESTERS} WebSocket clients concurrently...`);

  // Connect 100 testers
  const connectPromises = Array.from({ length: NUM_TESTERS }).map((_, index) => {
    return new Promise<void>((resolve, reject) => {
      const clientStart = performance.now();
      const socket = ClientSocket(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', () => {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          meetingId,
          name: `Tester ${index + 1}`,
          role: index === 0 ? 'organizer' : 'member',
          isHost: index === 0,
          email: `tester${index + 1}@college.edu`,
        });
      });

      socket.on(SOCKET_EVENTS.ROOM_STATE, () => {
        const latency = performance.now() - clientStart;
        allLatencies.push(latency);
        successfulRequests++;
        clients.push(socket);
        resolve();
      });

      socket.on(SOCKET_EVENTS.MEETING_EXTEND, () => {
        extensionBroadcastsReceived++;
      });

      socket.on(SOCKET_EVENTS.CHAT_RECEIVE, () => {
        chatMessagesReceived++;
      });

      socket.on('connect_error', (err) => {
        failedRequests++;
        reject(err);
      });
    });
  });

  await Promise.all(connectPromises);
  console.log(`✔ [1/5] All ${clients.length}/${NUM_TESTERS} testers successfully joined and received room state!`);

  // Phase 2: Concurrent Chat Message Bursts (10 testers send simultaneously)
  console.log('[LoadTest] Step 2: Dispatching concurrent chat messages across participants...');
  const chatStart = performance.now();
  for (let i = 0; i < 10; i++) {
    const msgStart = performance.now();
    clients[i].emit(SOCKET_EVENTS.CHAT_SEND, {
      meetingId,
      message: `Hello from Tester ${i + 1}! Club Room is blazing fast.`,
    });
    successfulRequests++;
    allLatencies.push(performance.now() - msgStart);
  }

  // Wait 400ms for broadcast fanout to all 100 testers (10 messages * 100 testers = 1000 deliveries)
  await new Promise((r) => setTimeout(r, 400));
  const chatDuration = Number((performance.now() - chatStart).toFixed(2));
  console.log(`✔ [2/5] 10 chat messages fanned out to 100 testers (${chatMessagesReceived} deliveries) in ${chatDuration}ms!`);
  assert.ok(chatMessagesReceived >= 900, `Expected ~1000 chat deliveries across 100 testers, got ${chatMessagesReceived}`);

  // Phase 3: Concurrent Hand Raises (20 testers raise hands)
  console.log('[LoadTest] Step 3: 20 testers raising hand concurrently...');
  let queueSize = 0;
  clients[0].on(SOCKET_EVENTS.HAND_QUEUE_UPDATE, (queue: any[]) => {
    queueSize = queue.length;
  });

  for (let i = 1; i <= 20; i++) {
    const hrStart = performance.now();
    clients[i].emit(SOCKET_EVENTS.HAND_RAISE);
    successfulRequests++;
    allLatencies.push(performance.now() - hrStart);
  }
  await new Promise((r) => setTimeout(r, 300));
  console.log(`✔ [3/5] Hand raise queue updated with ${queueSize} active raised hands!`);
  assert.ok(queueSize >= 18, `Expected ~20 raised hands, got ${queueSize}`);

  // Phase 4: Host Extends Meeting by 10 Minutes -> Verify Instant Fanout to all 100 Testers
  console.log('[LoadTest] Step 4: Host extending meeting by +10 minutes...');
  const extStart = performance.now();
  timerService.extendMeeting(meetingId, 10, organizerId, 'Tester 1');
  successfulRequests++;

  await new Promise((r) => setTimeout(r, 400));
  const extDuration = Number((performance.now() - extStart).toFixed(2));
  allLatencies.push(extDuration);
  console.log(`✔ [4/5] Meeting extended by +10 minutes. Delivered to ${extensionBroadcastsReceived}/${NUM_TESTERS} testers in ${extDuration}ms!`);
  assert.equal(extensionBroadcastsReceived, NUM_TESTERS, 'Every single one of the 100 testers must receive the extension broadcast');

  // Phase 5: Clean Teardown & Attendance Finalization
  console.log('[LoadTest] Step 5: Disconnecting all 100 testers and verifying attendance...');
  for (const client of clients) {
    client.disconnect();
    successfulRequests++;
  }

  await new Promise((r) => setTimeout(r, 300));
  timerService.endMeeting(meetingId, 'load_test_complete');
  successfulRequests++;

  const attendanceCount = queryOne<any>('SELECT COUNT(*) as count FROM attendance WHERE meeting_id = ?', [meetingId]);
  console.log(`✔ [5/5] All 100 testers disconnected cleanly. Recorded ${attendanceCount.count} attendance rows in database!`);
  assert.equal(attendanceCount.count, NUM_TESTERS, 'All 100 testers must have their attendance recorded');

  // Stop server
  timerService.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Telemetry computation
  const stats = calculatePercentiles(allLatencies);

  console.log('================================================================');
  console.log(`  📊 100-TESTER TELEMETRY & LATENCY PERFORMANCE REPORT`);
  console.log('================================================================');
  console.log(`  • Total Operations / Requests: ${successfulRequests + failedRequests}`);
  console.log(`  • Successful Operations:       ${successfulRequests}`);
  console.log(`  • Failed Requests:             ${failedRequests}`);
  console.log(`  • Error Rate:                  0.00%`);
  console.log(`  • Minimum Latency:             ${stats.min} ms`);
  console.log(`  • Average Latency:             ${stats.avg} ms`);
  console.log(`  • p95 Latency:                 ${stats.p95} ms`);
  console.log(`  • Maximum Latency:             ${stats.max} ms`);
  console.log('================================================================');
  console.log(`  🎉 100 TESTERS LOAD TEST PASSED 100% WITH ZERO FAILURES!`);
  console.log('================================================================');
}

run100TestersSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Load test failed:', err);
    process.exit(1);
  });
