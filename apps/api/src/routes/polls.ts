import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../db/index.js';

const router = Router();

// Get polls for meeting
router.get('/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const polls = queryAll<any>('SELECT * FROM polls WHERE meeting_id = ? ORDER BY created_at DESC', [meeting.id]).map(p => ({
      id: p.id,
      meetingId: p.meeting_id,
      question: p.question,
      options: JSON.parse(p.options_json),
      voters: JSON.parse(p.voters_json || '[]'),
      isOpen: Boolean(p.is_open),
      createdAt: p.created_at
    }));

    res.json({ polls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create poll
router.post('/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    const { question, options } = req.body;

    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Question and at least 2 options are required' });
    }

    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const pollId = uuidv4();
    const formattedOptions = options.map((text: string, idx: number) => ({
      id: `opt-${idx}`,
      text: text.trim(),
      votes: 0
    }));
    const now = new Date().toISOString();

    execute(`
      INSERT INTO polls (id, meeting_id, question, options_json, voters_json, is_open, created_at)
      VALUES (?, ?, ?, ?, '[]', 1, ?)
    `, [pollId, meeting.id, question.trim(), JSON.stringify(formattedOptions), now]);

    res.status(201).json({
      id: pollId,
      meetingId: meeting.id,
      question: question.trim(),
      options: formattedOptions,
      voters: [],
      isOpen: true,
      createdAt: now
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vote in poll
router.post('/:meetingId/:pollId/vote', (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionId, voterIdentifier } = req.body;

    if (!optionId || !voterIdentifier) {
      return res.status(400).json({ error: 'optionId and voterIdentifier are required' });
    }

    const poll = queryOne<any>('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (!poll || !poll.is_open) {
      return res.status(400).json({ error: 'Poll is closed or does not exist' });
    }

    const voters: string[] = JSON.parse(poll.voters_json || '[]');
    if (voters.includes(voterIdentifier)) {
      return res.status(400).json({ error: 'Already voted' });
    }

    const options = JSON.parse(poll.options_json);
    const target = options.find((opt: any) => opt.id === optionId);
    if (!target) {
      return res.status(400).json({ error: 'Invalid option' });
    }

    target.votes += 1;
    voters.push(voterIdentifier);

    execute(`
      UPDATE polls
      SET options_json = ?, voters_json = ?
      WHERE id = ?
    `, [JSON.stringify(options), JSON.stringify(voters), pollId]);

    res.json({
      success: true,
      poll: {
        id: poll.id,
        meetingId: poll.meeting_id,
        question: poll.question,
        options,
        voters,
        isOpen: Boolean(poll.is_open),
        createdAt: poll.created_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

