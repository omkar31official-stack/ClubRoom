import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { execute, queryOne } from '../db/index.js';
import { generateToken, requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Rate limiter to prevent brute force on authentication endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// Register organizer / admin account
router.post('/register', authRateLimiter, async (req, res) => {
  try {
    const { email, password, fullName, role = 'organizer', memberId, department, designation } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    const existing = queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    execute(`
      INSERT INTO users (id, email, password_hash, full_name, role, member_id, department, designation, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      email.toLowerCase().trim(),
      passwordHash,
      fullName.trim(),
      role,
      memberId || null,
      department || null,
      designation || null,
      now,
      now
    ]);

    const user = {
      id: userId,
      email: email.toLowerCase().trim(),
      fullName: fullName.trim(),
      role: role as any,
      memberId,
      department,
      designation
    };

    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err: any) {
    console.error('[Auth] Registration error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Login organizer
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = queryOne<any>('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      memberId: user.member_id,
      department: user.department,
      designation: user.designation,
      avatarUrl: user.avatar_url
    };

    const token = generateToken(authUser);
    res.json({ user: authUser, token });
  } catch (err: any) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Current user profile
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = queryOne<any>('SELECT id, email, full_name, role, member_id, department, designation, avatar_url, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      memberId: user.member_id,
      department: user.department,
      designation: user.designation,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at
    }
  });
});

export default router;

