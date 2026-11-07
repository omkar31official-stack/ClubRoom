# ClubRoom — Production Deployment & Infrastructure Guide

This guide details the production deployment, hosting architecture, database migration, WebSockets, HTTPS/CORS, and LiveKit Cloud video infrastructure for **ClubRoom**.

---

## 1. Hosting Architecture & Free-Tier Plan

```
                        ┌──────────────────────────────┐
                        │   Frontend (Cloudflare Pages)│
                        │    Static SPA Build (Vite)   │
                        └──────────────┬───────────────┘
                                       │ HTTPS / WSS
                                       ▼
                        ┌──────────────────────────────┐
                        │     Backend (Render Web)     │
                        │   Express API & Socket.IO    │
                        └───────┬──────────────┬───────┘
                                │              │
            ┌───────────────────▼──┐        ┌──▼────────────────────┐
            │ Database (PostgreSQL │        │ Video Infrastructure  │
            │  / Supabase Free)    │        │ (LiveKit Cloud Free)  │
            └──────────────────────┘        └───────────────────────┘
```

---

## 2. Frontend Hosting (Cloudflare Pages / Vercel)

1. **Repository Setup**: Push repository to GitHub/GitLab.
2. **Build Configuration**:
   - **Framework Preset**: Vite / React
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. **Environment Variables on Cloudflare Pages**:
   - `VITE_API_URL`: `https://clubroom-api.onrender.com`
4. **Benefits on Free Tier**:
   - Cloudflare Pages: Unlimited bandwidth, global CDN edge caching, automatic free SSL certificates.

---

## 3. Backend Hosting (Render / Railway)

1. **Create Web Service**:
   - Connect repository pointing to `apps/api`.
   - **Environment**: Node.js (Node 20+)
   - **Build Command**: `npm install && npm run build --workspace=apps/api`
   - **Start Command**: `npm run start --workspace=apps/api`
   - **Health Check Path**: `/health`
2. **Environment Variables**:
   ```ini
   NODE_ENV=production
   PORT=5000
   JWT_SECRET=generate_a_64_character_random_hex_secret_here
   CORS_ORIGIN=https://clubroom.pages.dev
   INITIAL_ORGANIZER_EMAIL=admin@yourcollege.edu
   INITIAL_ORGANIZER_PASSWORD=ChooseAStrongProductionPassword123!
   DATABASE_PATH=/var/data/clubroom.sqlite  # Or DATABASE_URL for Postgres
   LIVEKIT_URL=wss://your-org.livekit.cloud
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret
   ```
3. **WebSocket Support**:
   - Render and Railway natively support persistent WebSockets (`ws://` / `wss://`) on HTTP/1.1 without additional proxy configuration.

---

## 4. Database Hosting & PostgreSQL Migration

### Option A: Persistent Volume SQLite (Zero Cost)
- Mount a persistent disk (e.g. 1GB disk on Render/Railway) at `/var/data`.
- Set `DATABASE_PATH=/var/data/clubroom.sqlite`.
- Fast, synchronous, zero external network latency.

### Option B: Supabase Free PostgreSQL
- Provision a free project at [supabase.com](https://supabase.com) (500MB database on Free Tier).
- Run the migration schema located at `apps/api/src/db/schema.sql`.
- Attach connection pooler string as `DATABASE_URL`.

### Database Backup Script
Automated daily cron backup for SQLite:
```bash
#!/bin/bash
BACKUP_DIR="/media/omkar/Storage/backups"
mkdir -p "$BACKUP_DIR"
sqlite3 /media/omkar/Storage/Projects/meeting/database/clubroom.sqlite \
  ".backup '$BACKUP_DIR/clubroom_backup_$(date +%Y%m%d_%H%M%S).sqlite'"
find "$BACKUP_DIR" -type f -name "*.sqlite" -mtime +14 -exec rm {} \;
```

---

## 5. Video Infrastructure & WebRTC (LiveKit Cloud)

### LiveKit Cloud (Free Tier)
1. Sign up at [cloud.livekit.io](https://cloud.livekit.io).
2. Create a new project named `ClubRoom`.
3. In Project Settings, generate an **API Key** and **Secret Key**.
4. Free Tier Allowances:
   - 50 GB monthly egress bandwidth.
   - Up to 100 concurrent participants.
   - Built-in global SFU edge routing.
5. Enter keys in backend environment variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

### Fallback Direct WebRTC Mesh
- When running locally or during service outages, ClubRoom automatically operates its peer-to-peer WebRTC mesh via Socket.IO signaling without requiring external cloud accounts or paid credit cards.

---

## 6. HTTPS & Production CORS Enforcement

- When `NODE_ENV=production` is set, ClubRoom enforces:
  - Strict non-default `JWT_SECRET` verification (server refuses to start with development secrets).
  - Explicit `CORS_ORIGIN` matching the production frontend domain.
  - Brute-force rate limiting (20 attempts per 15 min on auth, 300 req/min general).
  - Strict host ownership verification on all meeting mutations (`start`, `extend`, `end`, `admit`).

