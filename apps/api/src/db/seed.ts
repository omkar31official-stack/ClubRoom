import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from './index.js';

export async function seed() {
  console.log('[Seed] Verifying administrative accounts...');

  const organizerEmail = (process.env.INITIAL_ORGANIZER_EMAIL || 'organizer@clubroom.internal').toLowerCase().trim();
  const existingAdmin = queryOne('SELECT id FROM users WHERE email = ?', [organizerEmail]);
  let organizerId = existingAdmin ? existingAdmin.id : uuidv4();

  if (!existingAdmin) {
    const initialPassword = process.env.INITIAL_ORGANIZER_PASSWORD || 'ClubRoom#2026!SecureKey';
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const now = new Date().toISOString();

    execute(`
      INSERT INTO users (id, email, password_hash, full_name, role, member_id, department, designation, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      organizerId,
      organizerEmail,
      passwordHash,
      'Club Lead Organizer',
      'club_admin',
      'CR-2026-001',
      'Computer Science & Engineering',
      'Lead Club Coordinator',
      now,
      now
    ]);
    console.log(`[Seed] Created verified club organizer: ${organizerEmail}`);
    console.log(`[Seed] Configured organizer credentials with 12-round bcrypt hash.`);
  }

  // Check if sample meeting exists
  const existingMeeting = queryOne('SELECT id FROM meetings WHERE code = ?', ['core-team-sync']);
  if (!existingMeeting) {
    const meetingId = uuidv4();
    const now = new Date();
    const scheduledStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const scheduledEnd = new Date(now.getTime() + 40 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();

    execute(`
      INSERT INTO meetings (
        id, code, title, description, organizer_id, scheduled_start_time, scheduled_end_time,
        current_end_time, duration_minutes, status, waiting_room_enabled, allow_extensions,
        max_extension_minutes, extension_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      meetingId,
      'core-team-sync',
      'Club Weekly Core Team Sync',
      'Review weekly milestones, upcoming tech fest workshops, and budget allocation.',
      organizerId,
      scheduledStart,
      scheduledEnd,
      scheduledEnd,
      30,
      'scheduled',
      1,
      1,
      60,
      0,
      createdAt
    ]);

    // Agenda items for core team sync
    execute(`
      INSERT INTO meeting_agenda (id, meeting_id, title, duration_minutes, completed, order_index)
      VALUES 
        (?, ?, '1. Welcome & Previous Action Item Review', 5, 0, 0),
        (?, ?, '2. Upcoming Hackathon Planning & Roles', 15, 0, 1),
        (?, ?, '3. Budget Approvals & Sponsor Outreach', 10, 0, 2)
    `, [
      uuidv4(), meetingId,
      uuidv4(), meetingId,
      uuidv4(), meetingId
    ]);

    // Sample announcements
    execute(`
      INSERT INTO announcements (id, title, content, author_name, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      'Annual Club Hackathon Announced!',
      'Registration opens this Friday for our university-wide hackathon. All club members are encouraged to form teams.',
      'Club Executive Organizer',
      'urgent',
      createdAt
    ]);

    console.log('[Seed] Seeded initial meeting "Club Weekly Core Team Sync" [Code: core-team-sync]');
  }

  console.log('[Seed] Database initialization verified.');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().catch(console.error);
}
