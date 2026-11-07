import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { TimerState, MeetingStatus, SOCKET_EVENTS } from '@clubroom/shared';
import { db, queryOne, queryAll, execute } from '../db/index.js';

interface MeetingTimerMemory {
  meetingId: string;
  status: MeetingStatus;
  startedAt: string;
  currentEndTime: string;
  durationMinutes: number;
  extensionCount: number;
  warningsTriggered: {
    tenMin: boolean;
    fiveMin: boolean;
    oneMin: boolean;
    thirtySec: boolean;
  };
}

class TimerService {
  private activeTimers = new Map<string, MeetingTimerMemory>();
  private io: SocketIOServer | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;

  public initialize(io: SocketIOServer) {
    this.io = io;
    this.loadActiveMeetingsFromDB();
    
    // Start central tick loop
    if (!this.intervalHandle) {
      this.intervalHandle = setInterval(() => this.tick(), 1000);
      console.log('[TimerService] Central meeting timer synchronization loop started (1s interval)');
    }
  }

  private loadActiveMeetingsFromDB() {
    try {
      const liveMeetings = queryAll<any>(`
        SELECT id, status, actual_start_time, current_end_time, duration_minutes, extension_count
        FROM meetings
        WHERE status IN ('live', 'extended')
      `);

      for (const m of liveMeetings) {
        this.activeTimers.set(m.id, {
          meetingId: m.id,
          status: m.status as MeetingStatus,
          startedAt: m.actual_start_time || new Date().toISOString(),
          currentEndTime: m.current_end_time,
          durationMinutes: m.duration_minutes,
          extensionCount: m.extension_count || 0,
          warningsTriggered: {
            tenMin: false,
            fiveMin: false,
            oneMin: false,
            thirtySec: false
          }
        });
      }
      console.log(`[TimerService] Restored ${liveMeetings.length} active meeting timers from database`);
    } catch (err) {
      console.error('[TimerService] Error loading active meetings from DB:', err);
    }
  }

  public startMeeting(meetingId: string): TimerState {
    const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const actualId = meeting.id;
    let timer = this.activeTimers.get(actualId);

    if (timer && (timer.status === 'live' || timer.status === 'extended')) {
      return this.computeTimerState(timer);
    }

    const now = new Date();
    const currentEndTime = new Date(now.getTime() + meeting.duration_minutes * 60 * 1000).toISOString();
    const startedAt = now.toISOString();

    execute(`
      UPDATE meetings
      SET status = 'live', actual_start_time = ?, current_end_time = ?
      WHERE id = ?
    `, [startedAt, currentEndTime, actualId]);

    timer = {
      meetingId: actualId,
      status: 'live',
      startedAt,
      currentEndTime,
      durationMinutes: meeting.duration_minutes,
      extensionCount: meeting.extension_count || 0,
      warningsTriggered: {
        tenMin: false,
        fiveMin: false,
        oneMin: false,
        thirtySec: false
      }
    };

    this.activeTimers.set(actualId, timer);

    const state = this.computeTimerState(timer);
    if (this.io) {
      this.io.to(actualId).emit(SOCKET_EVENTS.MEETING_START, {
        meetingId: actualId,
        startedAt,
        currentEndTime,
        timerState: state
      });
      this.io.to(actualId).emit(SOCKET_EVENTS.TIMER_SYNC, state);
    }

    return state;
  }

  public extendMeeting(meetingId: string, addedMinutes: number, extendedBy: string, extendedByName: string) {
    const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const actualId = meeting.id;
    const timer = this.activeTimers.get(actualId);
    if (!timer || (timer.status !== 'live' && timer.status !== 'extended')) {
      throw new Error('Cannot extend a meeting that is not currently active');
    }

    if (!meeting.allow_extensions) {
      throw new Error('Extensions are disabled for this meeting by policy');
    }

    // Check maximum extension limit
    const totalExtensionsResult = queryOne<any>(`
      SELECT COALESCE(SUM(added_minutes), 0) as totalAdded
      FROM meeting_extensions
      WHERE meeting_id = ?
    `, [actualId]);

    const currentTotalAdded = totalExtensionsResult ? totalExtensionsResult.totalAdded : 0;
    if (currentTotalAdded + addedMinutes > meeting.max_extension_minutes) {
      throw new Error(`Extension limit exceeded. Maximum allowed extensions: ${meeting.max_extension_minutes} mins (Already used: ${currentTotalAdded} mins)`);
    }

    const prevEndTimeDate = new Date(timer.currentEndTime);
    const newEndTimeDate = new Date(prevEndTimeDate.getTime() + addedMinutes * 60 * 1000);
    const newEndTime = newEndTimeDate.toISOString();
    const nowIso = new Date().toISOString();

    // Insert extension audit record
    execute(`
      INSERT INTO meeting_extensions (id, meeting_id, extended_by, extended_by_name, added_minutes, previous_end_time, new_end_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      actualId,
      extendedBy,
      extendedByName,
      addedMinutes,
      timer.currentEndTime,
      newEndTime,
      nowIso
    ]);

    // Update meeting table
    const newExtensionCount = (timer.extensionCount || 0) + 1;
    execute(`
      UPDATE meetings
      SET current_end_time = ?, extension_count = ?, status = 'extended'
      WHERE id = ?
    `, [newEndTime, newExtensionCount, actualId]);

    // Update in-memory timer
    timer.currentEndTime = newEndTime;
    timer.status = 'extended';
    timer.extensionCount = newExtensionCount;

    // Reset warnings if new end time moves past warning boundaries
    const newRemainingSeconds = Math.floor((newEndTimeDate.getTime() - Date.now()) / 1000);
    if (newRemainingSeconds > 600) timer.warningsTriggered.tenMin = false;
    if (newRemainingSeconds > 300) timer.warningsTriggered.fiveMin = false;
    if (newRemainingSeconds > 60) timer.warningsTriggered.oneMin = false;
    if (newRemainingSeconds > 30) timer.warningsTriggered.thirtySec = false;

    const state = this.computeTimerState(timer);

    if (this.io) {
      this.io.to(actualId).emit(SOCKET_EVENTS.MEETING_EXTEND, {
        meetingId: actualId,
        addedMinutes,
        extendedByName,
        previousEndTime: timer.currentEndTime,
        newEndTime,
        timerState: state
      });
      this.io.to(actualId).emit(SOCKET_EVENTS.TIMER_SYNC, state);
    }

    return {
      success: true,
      addedMinutes,
      newEndTime,
      timerState: state
    };
  }

  public endMeeting(meetingId: string, reason: string = 'host_ended'): TimerState {
    const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const actualId = meeting.id;
    execute(`
      UPDATE meetings
      SET status = 'ended', current_end_time = ?
      WHERE id = ?
    `, [new Date().toISOString(), actualId]);

    // Finalize open attendance records
    execute(`
      UPDATE attendance
      SET left_at = ?, duration_seconds = ROUND((JULIANDAY(?) - JULIANDAY(joined_at)) * 86400)
      WHERE meeting_id = ? AND left_at IS NULL
    `, [new Date().toISOString(), new Date().toISOString(), actualId]);

    const timer = this.activeTimers.get(actualId);
    let state: TimerState;
    if (timer) {
      timer.status = 'ended';
      state = this.computeTimerState(timer);
      this.activeTimers.delete(actualId);
    } else {
      state = {
        meetingId: actualId,
        status: 'ended',
        startedAt: meeting.actual_start_time,
        currentEndTime: meeting.current_end_time,
        remainingSeconds: 0,
        elapsedSeconds: meeting.duration_minutes * 60,
        isExtended: meeting.extension_count > 0,
        extensionCount: meeting.extension_count,
        warningsTriggered: { tenMin: true, fiveMin: true, oneMin: true, thirtySec: true }
      };
    }

    if (this.io) {
      this.io.to(actualId).emit(SOCKET_EVENTS.MEETING_END, {
        meetingId: actualId,
        reason,
        timerState: state
      });
      this.io.to(actualId).emit(SOCKET_EVENTS.TIMER_SYNC, state);
    }

    return state;
  }

  public getTimerState(meetingId: string): TimerState {
    const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const actualId = meeting.id;
    const timer = this.activeTimers.get(actualId);
    if (timer) {
      return this.computeTimerState(timer);
    }

    // If meeting is not in memory, calculate from DB
    const now = Date.now();
    const endMs = new Date(meeting.current_end_time).getTime();
    const remainingSeconds = Math.max(0, Math.floor((endMs - now) / 1000));
    const startMs = meeting.actual_start_time ? new Date(meeting.actual_start_time).getTime() : now;
    const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1000));

    return {
      meetingId: actualId,
      status: meeting.status as MeetingStatus,
      startedAt: meeting.actual_start_time,
      currentEndTime: meeting.current_end_time,
      remainingSeconds: meeting.status === 'live' || meeting.status === 'extended' ? remainingSeconds : 0,
      elapsedSeconds,
      isExtended: meeting.extension_count > 0,
      extensionCount: meeting.extension_count,
      warningsTriggered: {
        tenMin: remainingSeconds <= 600,
        fiveMin: remainingSeconds <= 300,
        oneMin: remainingSeconds <= 60,
        thirtySec: remainingSeconds <= 30
      }
    };
  }

  public setEndTimeForTesting(meetingId: string, newEndTime: string) {
    const timer = this.activeTimers.get(meetingId);
    if (timer) {
      timer.currentEndTime = newEndTime;
    }
    execute('UPDATE meetings SET current_end_time = ? WHERE id = ?', [newEndTime, meetingId]);
  }

  private computeTimerState(timer: MeetingTimerMemory): TimerState {
    const now = Date.now();
    const endMs = new Date(timer.currentEndTime).getTime();
    const startMs = new Date(timer.startedAt).getTime();
    const remainingSeconds = Math.max(0, Math.floor((endMs - now) / 1000));
    const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1000));

    return {
      meetingId: timer.meetingId,
      status: timer.status,
      startedAt: timer.startedAt,
      currentEndTime: timer.currentEndTime,
      remainingSeconds: timer.status === 'ended' ? 0 : remainingSeconds,
      elapsedSeconds,
      isExtended: timer.extensionCount > 0,
      extensionCount: timer.extensionCount,
      warningsTriggered: { ...timer.warningsTriggered }
    };
  }

  private tick() {
    if (this.activeTimers.size === 0) return;

    for (const [meetingId, timer] of this.activeTimers.entries()) {
      if (timer.status !== 'live' && timer.status !== 'extended') {
        continue;
      }

      const state = this.computeTimerState(timer);

      // Warning broadcasts:
      // 10 minutes warning
      if (state.remainingSeconds <= 600 && state.remainingSeconds > 300 && !timer.warningsTriggered.tenMin) {
        timer.warningsTriggered.tenMin = true;
        this.emitWarning(meetingId, '10min', '10 minutes remaining in scheduled meeting');
      }

      // 5 minutes warning
      if (state.remainingSeconds <= 300 && state.remainingSeconds > 60 && !timer.warningsTriggered.fiveMin) {
        timer.warningsTriggered.fiveMin = true;
        this.emitWarning(meetingId, '5min', '5 minutes remaining in scheduled meeting');
      }

      // 1 minute warning
      if (state.remainingSeconds <= 60 && state.remainingSeconds > 30 && !timer.warningsTriggered.oneMin) {
        timer.warningsTriggered.oneMin = true;
        this.emitWarning(meetingId, '1min', '1 minute remaining - Host can extend time if needed');
      }

      // 30 seconds warning
      if (state.remainingSeconds <= 30 && state.remainingSeconds > 0 && !timer.warningsTriggered.thirtySec) {
        timer.warningsTriggered.thirtySec = true;
        this.emitWarning(meetingId, '30sec', '30 seconds remaining before meeting concludes');
      }

      // Automatic meeting termination when remaining time reaches 0
      if (state.remainingSeconds <= 0) {
        console.log(`[TimerService] Meeting ${meetingId} duration expired. Automatically ending room.`);
        this.endMeeting(meetingId, 'automatic_time_expired');
        continue;
      }

      // Send periodic second-by-second sync to room
      if (this.io) {
        this.io.to(meetingId).emit(SOCKET_EVENTS.TIMER_TICK, {
          remainingSeconds: state.remainingSeconds,
          elapsedSeconds: state.elapsedSeconds,
          currentEndTime: state.currentEndTime
        });
      }
    }
  }

  private emitWarning(meetingId: string, warningType: string, message: string) {
    if (!this.io) return;
    this.io.to(meetingId).emit(SOCKET_EVENTS.TIMER_WARNING, {
      meetingId,
      warningType,
      message,
      timestamp: new Date().toISOString()
    });
  }

  public stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

export const timerService = new TimerService();
