CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'organizer',
  member_id TEXT,
  department TEXT,
  designation TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  organizer_id TEXT NOT NULL,
  scheduled_start_time TEXT NOT NULL,
  scheduled_end_time TEXT NOT NULL,
  actual_start_time TEXT,
  current_end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  waiting_room_enabled INTEGER NOT NULL DEFAULT 1,
  allow_extensions INTEGER NOT NULL DEFAULT 1,
  max_extension_minutes INTEGER NOT NULL DEFAULT 60,
  extension_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(organizer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS meeting_extensions (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  extended_by TEXT NOT NULL,
  extended_by_name TEXT,
  added_minutes INTEGER NOT NULL,
  previous_end_time TEXT NOT NULL,
  new_end_time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS waiting_room (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  socket_id TEXT,
  participant_name TEXT NOT NULL,
  participant_email TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  requested_at TEXT NOT NULL,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_email TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'present',
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS meeting_agenda (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 10,
  completed INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS meeting_tasks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  task TEXT NOT NULL,
  assignee_name TEXT,
  assignee_email TEXT,
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  voters_json TEXT NOT NULL DEFAULT '[]',
  is_open INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_code ON meetings(code);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_attendance_meeting ON attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_agenda_meeting ON meeting_agenda(meeting_id);
CREATE INDEX IF NOT EXISTS idx_messages_meeting ON meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_extensions_meeting ON meeting_extensions(meeting_id);

