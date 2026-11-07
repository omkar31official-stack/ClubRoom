# ClubRoom — Complete College Club Video Meeting & Collaboration Platform

> **ClubRoom** is a production-oriented, open-source web application tailored for college clubs, core teams, and student organizations. It delivers Google Meet-grade video conferencing with college-specific superpowers: **server-authoritative synchronized meeting countdowns**, **one-click host duration extensions**, **waiting room access control**, **interactive agendas & action item tracking**, **live polls**, and **automated attendance tracking with instant CSV export**.

---

## ⚡ Key Highlights

- **Server-Authoritative Smart Meeting Timer**: Single source of truth managed by backend engine. Synchronized across all participant screens with warning broadcasts at 10m, 5m, 1m, and 30s. Resilient to client reloads, tab throttling, and network drops.
- **Instant Host Meeting Extension**: Organizers can extend ongoing meetings (+5, +10, +15, +30m, or custom) when discussions run long. Instantly recalculates remaining time, updates all participants' timers, and preserves an audit trail.
- **Waiting Room & Access Control**: Members and attendees join with display names without forced Google/OAuth account friction. Organizers review waiting attendees and admit them individually or in bulk.
- **Zero-Friction Attendee Experience**: Regular club members don't need Google logins or cumbersome sign-up flows. Only meeting organizers need an account.
- **Automated Attendance Analytics**: Automatically tracks join/leave timestamps, attendance duration, and flags late arrivals (>10m after start). Downloadable in 1-click as standard `.csv`.
- **Live Collaboration**: Check off live meeting agenda topics in real-time, assign follow-up action items with deadlines, launch instant polls with percentage vote bars, and trigger confetti emoji reactions.
- **Storage-Partition Compliant**: Verified zero consumption on the Ubuntu root partition. All source, dependencies, caches (`.cache/npm`), temporary data (`.tmp`), and database (`database/clubroom.sqlite`) live exclusively on `/media/omkar/Storage`.

---

## 🏗️ System Architecture

```
ClubRoom/
├── apps/
│   ├── api/                   # Express, Socket.IO, LiveKit Server SDK, Native SQLite
│   │   ├── src/
│   │   │   ├── db/            # Schema, migrations, seed script
│   │   │   ├── middleware/    # JWT auth & role validation
│   │   │   ├── routes/        # REST APIs (auth, meetings, attendance, polls, etc.)
│   │   │   ├── services/      # TimerService, AttendanceService, LiveKitService
│   │   │   └── socket/        # Real-time WebSocket hub
│   │   └── tests/             # Comprehensive 100+ assertion automated test suite
│   └── web/                   # Vite, React, TypeScript, Tailwind CSS, Lucide
│       └── src/
│           ├── components/    # TimerDisplay, ExtensionModal, Drawers, Modals
│           ├── context/       # AuthContext, SocketContext
│           ├── pages/         # Dashboard, WaitingRoom, MeetingRoom
│           └── services/      # API client
├── packages/
│   └── shared/                # Universal TypeScript interfaces, DTOs & socket events
├── database/                  # clubroom.sqlite file
├── scripts/                   # dev.sh, test.sh
└── .env.example
```

---

## 🚀 Quick Start Guide

### 1. Requirements
- Node.js v20+ (tested on Node.js v24.16.0 with native `node:sqlite`)
- npm v10+

### 2. Environment Configuration
The `.env` file is already initialized with storage-partition paths:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=clubroom-dev-secret-key-2026
DATABASE_PATH=/media/omkar/Storage/Projects/meeting/database/clubroom.sqlite
TMPDIR=/media/omkar/Storage/Projects/meeting/.tmp
npm_config_cache=/media/omkar/Storage/Projects/meeting/.cache/npm
```

### 3. Start Development Servers
Run both backend and frontend concurrently with one command:
```bash
./scripts/dev.sh
```
- **Web Application**: `http://localhost:5173`
- **Backend API & WebSockets**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/health`

### 4. Default Organizer Credentials
To access organizer actions (schedule meetings, start rooms, extend duration, admit waiting members):
- **Email**: `organizer@clubroom.internal`
- **Password**: `clubroompassword`

*(Or click "Fill Demo" in the Organizer Sign In modal)*

---

## 🧪 Comprehensive Automated Test Suite

Run the automated test suite covering 100+ assertions across 10 critical operational test groups:
```bash
./scripts/test.sh
```

### Tested Scenarios:
1. **Authentication & Roles**: Password hashing, JWT token issuance, unique email constraint enforcement.
2. **Scheduling**: Meeting code generator, start/end timestamp calculations, waiting room settings.
3. **Waiting Room**: Admission, rejection, bulk admit-all, waiting list queries.
4. **Timer Engine**: Server authoritative ticks, warning thresholds (10m, 5m, 1m, 30s).
5. **Host Extensions**: +10m, +15m increments, maximum extension limit enforcement, audit logging.
6. **Attendance & CSV**: Join/leave tracking, late arrival calculation, CSV generation.
7. **LiveKit Tokens**: Grant generation for host (`roomAdmin: true`) and attendees.
8. **Agenda & Polls**: Live toggle, task assignment, single-vote enforcement.
9. **5-Participant Simulation**: 30-min scheduled meeting, 5 attendees join, timer reaches 3 minutes, host extends by 10 minutes, all 5 clients sync to 13 minutes, meeting stays live past original deadline, clean termination at extended deadline with attendance duration recorded.
10. **Storage Persistence**: Verifies DB persistence on storage partition.

---

## 🌐 Production Deployment Guide (Free Tier)

### Frontend (Cloudflare Pages / Vercel)
1. Build the production bundle:
   ```bash
   npm run build --workspace=apps/web
   ```
2. Deploy the `apps/web/dist` directory to Cloudflare Pages (free unlimited bandwidth) or Vercel.
3. Set environment variable `VITE_API_URL` to your backend URL.

### Backend (Render / Railway)
1. Push repository to GitHub.
2. Create a Free Web Service on Render pointing to `apps/api`.
3. Build command: `npm install && npm run build --workspace=apps/api`
4. Start command: `npm run start --workspace=apps/api`

### Database (Supabase PostgreSQL or Persistent SQLite)
- Works out-of-the-box with native SQLite on disk.
- For Supabase free PostgreSQL, export database schema using the standard SQL file at `apps/api/src/db/schema.sql`.

### WebRTC Video (LiveKit Cloud)
1. Create a free account at [LiveKit Cloud](https://cloud.livekit.io) (50GB free monthly bandwidth).
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env`.
3. If credentials are not set, ClubRoom automatically operates in high-performance local WebRTC mode.

