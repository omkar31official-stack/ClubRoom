import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../db/index.js';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { timerService } from '../services/timerService.js';

const router = Router();

// Generate unique meeting slug e.g. "team-sync-729"
function generateMeetingCode(title: string): string {
  const prefix = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 15)
    .replace(/^-|-$/g, '') || 'meet';
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${randomSuffix}`;
}

// List all meetings with optional filters
router.get('/', optionalAuth, (req, res) => {
  try {
    const filter = (req.query.filter as string) || 'all';
    let query = `
      SELECT m.*, u.full_name as organizer_name, u.email as organizer_email
      FROM meetings m
      LEFT JOIN users u ON m.organizer_id = u.id
    `;
    const params: any[] = [];

    const now = new Date().toISOString();
    if (filter === 'active') {
      query += ` WHERE m.status IN ('live', 'extended')`;
    } else if (filter === 'upcoming') {
      query += ` WHERE m.status = 'scheduled' AND m.scheduled_start_time >= ?`;
      params.push(now);
    } else if (filter === 'past') {
      query += ` WHERE m.status = 'ended'`;
    }

    query += ` ORDER BY m.scheduled_start_time ASC`;

    const meetings = queryAll<any>(query, params).map(m => ({
      id: m.id,
      code: m.code,
      title: m.title,
      description: m.description,
      organizerId: m.organizer_id,
      organizerName: m.organizer_name || 'Club Organizer',
      scheduledStartTime: m.scheduled_start_time,
      scheduledEndTime: m.scheduled_end_time,
      actualStartTime: m.actual_start_time,
      currentEndTime: m.current_end_time,
      durationMinutes: m.duration_minutes,
      status: m.status,
      waitingRoomEnabled: Boolean(m.waiting_room_enabled),
      allowExtensions: Boolean(m.allow_extensions),
      maxExtensionMinutes: m.max_extension_minutes,
      extensionCount: m.extension_count,
      createdAt: m.created_at
    }));

    res.json({ meetings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Schedule a new meeting (Organizer authenticated)
router.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      description,
      scheduledStartTime,
      durationMinutes = 30,
      waitingRoomEnabled = true,
      allowExtensions = true,
      maxExtensionMinutes = 60,
      agenda = []
    } = req.body;

    if (!title || !scheduledStartTime) {
      return res.status(400).json({ error: 'Title and scheduledStartTime are required' });
    }

    const meetingId = uuidv4();
    const code = generateMeetingCode(title);
    const startMs = new Date(scheduledStartTime).getTime();
    const endMs = startMs + durationMinutes * 60 * 1000;
    const scheduledEndTime = new Date(endMs).toISOString();
    const nowIso = new Date().toISOString();
    const organizerId = req.user!.id;

    execute(`
      INSERT INTO meetings (
        id, code, title, description, organizer_id, scheduled_start_time, scheduled_end_time,
        current_end_time, duration_minutes, status, waiting_room_enabled, allow_extensions,
        max_extension_minutes, extension_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, 0, ?)
    `, [
      meetingId,
      code,
      title.trim(),
      description || null,
      organizerId,
      scheduledStartTime,
      scheduledEndTime,
      scheduledEndTime,
      durationMinutes,
      waitingRoomEnabled ? 1 : 0,
      allowExtensions ? 1 : 0,
      maxExtensionMinutes,
      nowIso
    ]);

    // Insert agenda items if provided
    if (Array.isArray(agenda) && agenda.length > 0) {
      agenda.forEach((itemTitle: string, index: number) => {
        execute(`
          INSERT INTO meeting_agenda (id, meeting_id, title, duration_minutes, completed, order_index)
          VALUES (?, ?, ?, 10, 0, ?)
        `, [uuidv4(), meetingId, itemTitle.trim(), index]);
      });
    }

    const created = queryOne<any>('SELECT * FROM meetings WHERE id = ?', [meetingId]);
    res.status(201).json({
      meeting: {
        id: created.id,
        code: created.code,
        title: created.title,
        description: created.description,
        organizerId: created.organizer_id,
        scheduledStartTime: created.scheduled_start_time,
        scheduledEndTime: created.scheduled_end_time,
        currentEndTime: created.current_end_time,
        durationMinutes: created.duration_minutes,
        status: created.status,
        waitingRoomEnabled: Boolean(created.waiting_room_enabled),
        allowExtensions: Boolean(created.allow_extensions),
        maxExtensionMinutes: created.max_extension_minutes,
        extensionCount: created.extension_count,
        createdAt: created.created_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get meeting details by ID or Code
router.get('/:idOrCode', optionalAuth, (req, res) => {
  try {
    const { idOrCode } = req.params;
    const meeting = queryOne<any>(`
      SELECT m.*, u.full_name as organizer_name, u.email as organizer_email
      FROM meetings m
      LEFT JOIN users u ON m.organizer_id = u.id
      WHERE m.id = ? OR m.code = ?
    `, [idOrCode, idOrCode]);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const agenda = queryAll<any>('SELECT * FROM meeting_agenda WHERE meeting_id = ? ORDER BY order_index ASC', [meeting.id]);
    const timerState = timerService.getTimerState(meeting.id);

    res.json({
      meeting: {
        id: meeting.id,
        code: meeting.code,
        title: meeting.title,
        description: meeting.description,
        organizerId: meeting.organizer_id,
        organizerName: meeting.organizer_name || 'Club Organizer',
        organizerEmail: meeting.organizer_email,
        scheduledStartTime: meeting.scheduled_start_time,
        scheduledEndTime: meeting.scheduled_end_time,
        actualStartTime: meeting.actual_start_time,
        currentEndTime: meeting.current_end_time,
        durationMinutes: meeting.duration_minutes,
        status: meeting.status,
        waitingRoomEnabled: Boolean(meeting.waiting_room_enabled),
        allowExtensions: Boolean(meeting.allow_extensions),
        maxExtensionMinutes: meeting.max_extension_minutes,
        extensionCount: meeting.extension_count,
        createdAt: meeting.created_at
      },
      agenda,
      timerState
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start meeting (Host/Organizer action)
router.post('/:id/start', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const meeting = queryOne<any>('SELECT organizer_id FROM meetings WHERE id = ? OR code = ?', [id, id]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    const isOwnerOrAdmin = req.user!.id === meeting.organizer_id || ['super_admin', 'club_admin'].includes(req.user!.role);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Permission denied: only the meeting host or club admin can start this session' });
    }

    const timerState = timerService.startMeeting(id);
    res.json({ message: 'Meeting started', timerState });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Extend meeting time (Host action)
router.post('/:id/extend', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { minutes } = req.body;

    if (!minutes || typeof minutes !== 'number' || minutes <= 0) {
      return res.status(400).json({ error: 'Valid extension minutes number required (e.g. 5, 10, 15, 30)' });
    }

    const meeting = queryOne<any>('SELECT organizer_id FROM meetings WHERE id = ? OR code = ?', [id, id]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    const isOwnerOrAdmin = req.user!.id === meeting.organizer_id || ['super_admin', 'club_admin'].includes(req.user!.role);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Permission denied: only the meeting host or club admin can extend this meeting' });
    }

    const result = timerService.extendMeeting(
      id,
      minutes,
      req.user!.id,
      req.user!.fullName
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// End meeting early (Host action)
router.post('/:id/end', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const meeting = queryOne<any>('SELECT organizer_id FROM meetings WHERE id = ? OR code = ?', [id, id]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    const isOwnerOrAdmin = req.user!.id === meeting.organizer_id || ['super_admin', 'club_admin'].includes(req.user!.role);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Permission denied: only the meeting host or club admin can terminate this session' });
    }

    const timerState = timerService.endMeeting(id, 'host_terminated');
    res.json({ message: 'Meeting ended successfully', timerState });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get authoritative timer state
router.get('/:id/timer', (req, res) => {
  try {
    const { id } = req.params;
    const timerState = timerService.getTimerState(id);
    res.json(timerState);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get extension history audit
router.get('/:id/extensions', (req, res) => {
  try {
    const { id } = req.params;
    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [id, id]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const extensions = queryAll<any>(`
      SELECT id, meeting_id, extended_by, extended_by_name, added_minutes, previous_end_time, new_end_time, created_at
      FROM meeting_extensions
      WHERE meeting_id = ?
      ORDER BY created_at ASC
    `, [meeting.id]);

    res.json({ extensions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

