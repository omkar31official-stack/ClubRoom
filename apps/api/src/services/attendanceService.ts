import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../db/index.js';

export class AttendanceService {
  public recordJoin(meetingId: string, participantName: string, participantEmail?: string) {
    const meeting = queryOne<any>('SELECT * FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return null;

    const actualId = meeting.id;

    // Check if participant already has an active session
    const existing = queryOne<any>(`
      SELECT id FROM attendance
      WHERE meeting_id = ? AND participant_name = ? AND left_at IS NULL
    `, [actualId, participantName]);

    if (existing) {
      return existing;
    }

    const now = new Date();
    const joinedAt = now.toISOString();

    // Check if late (joined > 10 min after scheduled start)
    let status = 'present';
    if (meeting.actual_start_time) {
      const startMs = new Date(meeting.actual_start_time).getTime();
      if (now.getTime() - startMs > 10 * 60 * 1000) {
        status = 'late';
      }
    }

    const id = uuidv4();
    execute(`
      INSERT INTO attendance (id, meeting_id, participant_name, participant_email, joined_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, actualId, participantName, participantEmail || null, joinedAt, status]);

    return { id, meetingId: actualId, participantName, joinedAt, status };
  }

  public recordLeave(meetingId: string, participantName: string) {
    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return null;

    const actualId = meeting.id;
    const now = new Date();
    const leftAt = now.toISOString();

    const openRecord = queryOne<any>(`
      SELECT id, joined_at FROM attendance
      WHERE meeting_id = ? AND participant_name = ? AND left_at IS NULL
      ORDER BY joined_at DESC
      LIMIT 1
    `, [actualId, participantName]);

    if (!openRecord) return null;

    const joinMs = new Date(openRecord.joined_at).getTime();
    const durationSeconds = Math.max(0, Math.floor((now.getTime() - joinMs) / 1000));

    execute(`
      UPDATE attendance
      SET left_at = ?, duration_seconds = ?
      WHERE id = ?
    `, [leftAt, durationSeconds, openRecord.id]);

    return { id: openRecord.id, leftAt, durationSeconds };
  }

  public finalizeAttendance(meetingId: string) {
    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return;

    const actualId = meeting.id;
    const now = new Date().toISOString();

    const openRecords = queryAll<any>(`
      SELECT id, joined_at FROM attendance
      WHERE meeting_id = ? AND left_at IS NULL
    `, [actualId]);

    for (const rec of openRecords) {
      const durationSeconds = Math.max(0, Math.floor((new Date(now).getTime() - new Date(rec.joined_at).getTime()) / 1000));
      execute(`
        UPDATE attendance
        SET left_at = ?, duration_seconds = ?
        WHERE id = ?
      `, [now, durationSeconds, rec.id]);
    }
  }

  public getMeetingAttendance(meetingId: string) {
    const meeting = queryOne<any>('SELECT id, title, duration_minutes FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return { records: [], stats: null };

    const records = queryAll<any>(`
      SELECT id, participant_name, participant_email, joined_at, left_at, duration_seconds, status
      FROM attendance
      WHERE meeting_id = ?
      ORDER BY joined_at ASC
    `, [meeting.id]);

    const totalParticipants = records.length;
    const presentCount = records.filter(r => r.status === 'present').length;
    const lateCount = records.filter(r => r.status === 'late').length;
    const totalDurationSeconds = records.reduce((acc, r) => acc + (r.duration_seconds || 0), 0);
    const avgDurationMinutes = totalParticipants > 0 ? Math.round(totalDurationSeconds / totalParticipants / 60) : 0;

    return {
      meeting: { id: meeting.id, title: meeting.title, durationMinutes: meeting.duration_minutes },
      records,
      stats: {
        totalParticipants,
        presentCount,
        lateCount,
        avgDurationMinutes
      }
    };
  }

  public exportAttendanceCsv(meetingId: string): string {
    const { meeting, records } = this.getMeetingAttendance(meetingId);
    if (!meeting) return '';

    const headers = ['Participant Name', 'Email', 'Status', 'Joined At', 'Left At', 'Duration (Minutes)'];
    const rows = records.map(r => [
      `"${r.participant_name.replace(/"/g, '""')}"`,
      `"${(r.participant_email || 'N/A').replace(/"/g, '""')}"`,
      r.status,
      r.joined_at,
      r.left_at || 'Still in meeting',
      Math.round((r.duration_seconds || 0) / 60)
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

export const attendanceService = new AttendanceService();

