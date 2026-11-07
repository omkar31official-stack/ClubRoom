import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll } from '../db/index.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Get announcements
router.get('/', (req, res) => {
  try {
    const announcements = queryAll<any>('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20').map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      authorName: a.author_name,
      category: a.category,
      createdAt: a.created_at
    }));

    res.json({ announcements });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create announcement (organizer/admin)
router.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, content, category = 'general' } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const authorName = req.user?.fullName || 'Club Admin';

    execute(`
      INSERT INTO announcements (id, title, content, author_name, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, title.trim(), content.trim(), authorName, category, now]);

    res.status(201).json({
      announcement: { id, title, content, authorName, category, createdAt: now }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

