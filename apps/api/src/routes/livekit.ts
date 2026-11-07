import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLiveKitToken } from '../services/livekitService.js';
import { queryOne } from '../db/index.js';

const router = Router();

// Generate LiveKit video token
router.post('/token', async (req, res) => {
  try {
    const { roomName, participantName, isHost = false, participantIdentity } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({ error: 'roomName and participantName are required' });
    }

    // Verify room exists and is not ended
    const meeting = queryOne<any>('SELECT id, code, status FROM meetings WHERE id = ? OR code = ?', [roomName, roomName]);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(403).json({ error: `Cannot join room: meeting is ${meeting.status}` });
    }

    const identity = participantIdentity || `${participantName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${uuidv4().slice(0, 6)}`;

    const tokenData = await createLiveKitToken({
      roomName: meeting.code || meeting.id,
      participantName,
      participantIdentity: identity,
      isHost: Boolean(isHost)
    });

    res.json(tokenData);
  } catch (err: any) {
    console.error('[LiveKit] Token generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate token' });
  }
});

export default router;

