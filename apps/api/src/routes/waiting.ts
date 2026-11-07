import { Router, Response } from 'express';
import { execute, queryAll, queryOne } from '../db/index.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function checkWaitingPermission(meetingId: string, req: AuthenticatedRequest, res: Response): boolean {
  const meeting = queryOne<any>('SELECT organizer_id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return false;
  }
  const isOwnerOrAdmin = req.user!.id === meeting.organizer_id || ['super_admin', 'club_admin'].includes(req.user!.role);
  if (!isOwnerOrAdmin) {
    res.status(403).json({ error: 'Permission denied: only the meeting host or admin can manage waiting room' });
    return false;
  }
  return true;
}

// Get waiting room participants
router.get('/:meetingId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    if (!checkWaitingPermission(meetingId, req, res)) return;

    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    const waiting = queryAll<any>(`
      SELECT id, socket_id as socketId, participant_name as name, participant_email as email, requested_at as requestedAt
      FROM waiting_room
      WHERE meeting_id = ? AND status = 'waiting'
      ORDER BY requested_at ASC
    `, [meeting.id]);

    res.json({ waiting });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admit participant
router.post('/:meetingId/admit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    if (!checkWaitingPermission(meetingId, req, res)) return;

    const { waitingId } = req.body;
    if (!waitingId) return res.status(400).json({ error: 'waitingId is required' });

    execute(`UPDATE waiting_room SET status = 'admitted' WHERE id = ?`, [waitingId]);
    res.json({ success: true, message: 'Participant admitted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admit all waiting participants
router.post('/:meetingId/admit-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    if (!checkWaitingPermission(meetingId, req, res)) return;

    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    execute(`UPDATE waiting_room SET status = 'admitted' WHERE meeting_id = ? AND status = 'waiting'`, [meeting.id]);
    res.json({ success: true, message: 'All participants admitted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reject participant
router.post('/:meetingId/reject', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    if (!checkWaitingPermission(meetingId, req, res)) return;

    const { waitingId } = req.body;
    if (!waitingId) return res.status(400).json({ error: 'waitingId is required' });

    execute(`UPDATE waiting_room SET status = 'rejected' WHERE id = ?`, [waitingId]);
    res.json({ success: true, message: 'Participant rejected' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
