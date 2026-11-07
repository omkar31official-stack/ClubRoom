import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../db/index.js';

const router = Router();

// Get agenda and action items for meeting
router.get('/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const agenda = queryAll<any>('SELECT * FROM meeting_agenda WHERE meeting_id = ? ORDER BY order_index ASC', [meeting.id]);
    const tasks = queryAll<any>('SELECT * FROM meeting_tasks WHERE meeting_id = ? ORDER BY created_at ASC', [meeting.id]);

    res.json({
      agenda: agenda.map(a => ({ ...a, completed: Boolean(a.completed) })),
      tasks: tasks.map(t => ({ ...t, completed: Boolean(t.completed) }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add agenda item
router.post('/:meetingId/agenda', (req, res) => {
  try {
    const { meetingId } = req.params;
    const { title, durationMinutes = 10 } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const id = uuidv4();
    const countResult = queryOne<any>('SELECT COUNT(*) as count FROM meeting_agenda WHERE meeting_id = ?', [meeting.id]);
    const orderIndex = countResult ? countResult.count : 0;

    execute(`
      INSERT INTO meeting_agenda (id, meeting_id, title, duration_minutes, completed, order_index)
      VALUES (?, ?, ?, ?, 0, ?)
    `, [id, meeting.id, title.trim(), durationMinutes, orderIndex]);

    res.status(201).json({ id, meetingId: meeting.id, title, durationMinutes, completed: false, orderIndex });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle or update agenda item
router.patch('/:meetingId/agenda/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { completed, title } = req.body;

    if (completed !== undefined) {
      execute(`UPDATE meeting_agenda SET completed = ? WHERE id = ?`, [completed ? 1 : 0, id]);
    }
    if (title) {
      execute(`UPDATE meeting_agenda SET title = ? WHERE id = ?`, [title.trim(), id]);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add assigned task / action item
router.post('/:meetingId/tasks', (req, res) => {
  try {
    const { meetingId } = req.params;
    const { task, assigneeName, assigneeEmail, dueDate } = req.body;
    if (!task) return res.status(400).json({ error: 'Task description is required' });

    const meeting = queryOne<any>('SELECT id FROM meetings WHERE id = ? OR code = ?', [meetingId, meetingId]);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const id = uuidv4();
    const now = new Date().toISOString();

    execute(`
      INSERT INTO meeting_tasks (id, meeting_id, task, assignee_name, assignee_email, due_date, completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `, [id, meeting.id, task.trim(), assigneeName || null, assigneeEmail || null, dueDate || null, now]);

    res.status(201).json({
      id,
      meetingId: meeting.id,
      task,
      assigneeName,
      assigneeEmail,
      dueDate,
      completed: false,
      createdAt: now
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle task completion
router.patch('/:meetingId/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;

    execute(`UPDATE meeting_tasks SET completed = ? WHERE id = ?`, [completed ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

