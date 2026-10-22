# FDMST

Flores-Dizon Dental Clinic Management System. One Node.js project: a React/Vite frontend and an Express/MongoDB server with Socket.IO messaging, installed, built and started from the repository root.

## Project Layout

| Path | Contents |
| --- | --- |
| `server.js`, `app.js` | Express server entry point and app setup |
| `config/`, `middleware/`, `models/`, `routes/`, `services/`, `utils/`, `scripts/` | Server code |
| `tests/` | Server tests |
| `src/`, `public/`, `index.html` | React frontend (Vite) |
| `dist/` | Built frontend, created by `npm run build` and served by the server |
| `Dockerfile` | Production image |

## Requirements

- Node.js 20.19 or newer (Node 22 LTS recommended)
- npm 10 or newer
- MongoDB
- Supabase Storage buckets for public clinic images and private clinical/chat files

## Local Development

```bash
npm ci
cp .env.example .env
npm run dev
```

The frontend runs on `http://localhost:5173` and the API on `http://127.0.0.1:5050/api`.

## Verification

```bash
npm run check
```

This runs frontend linting, server tests, and the production frontend build.

## Production Deployment

FDMST deploys as one app from the repository root. The server serves the built pages, the API at `/api` and Socket.IO from the same domain (`https://fdmsd.wonderprotect.net`), so there is no CORS or mixed-content setup to maintain.

```bash
npm ci
npm run build
npm start
```

Or with Docker:

```bash
docker build -t fdmst .
docker run --env-file .env -p 5050:5050 fdmst
```

### Coolify Settings

| Setting | Value |
| --- | --- |
| Base Directory | `/` |
| Build Pack | Nixpacks (configured by `nixpacks.toml`) or Dockerfile (`/Dockerfile`). Do not enable the static-site option |
| Ports Exposes | `5050` |
| Domains | `https://fdmsd.wonderprotect.net` |
| Health check path | `/api/ready` |

Add the variables below as environment variables on the app. Leave `VITE_API_URL` unset so the pages call `/api` on their own domain.

### Required Production Variables

- `NODE_ENV=production`
- `PORT` (the Docker image defaults to `5050`) and optionally `HOST=0.0.0.0`
- `MONGO_URI`
- `JWT_SECRET` with at least 32 random characters
- Optional: `APP_URL`, `CLIENT_URL`, or `CORS_ORIGINS` for other sites that call the API. The domain serving the app is always allowed, and `https://fdmsd.wonderprotect.net` is allowed when none are set
- `MAIL_API_URL`, `MAIL_API_KEY`, and `MAIL_FROM_NAME`
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_CLINICAL_STORAGE_BUCKET` and `SUPABASE_CHAT_STORAGE_BUCKET`
- Optional: `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` for AI-assisted appointment forecasts and service comparisons; data-based recommendations still work without them

`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are optional. Configure both only for the first deployment if an administrator does not already exist, then remove them after the account is created. The bootstrap password must contain at least 12 characters and should be changed immediately.

### Storage Setup

Create the Supabase buckets named by the storage variables before deployment. The main image bucket must permit the intended public image access. Clinical and chat buckets should remain private because the API creates expiring signed URLs for those files.

### Legacy Clinical-Note Data Cleanup

Back up MongoDB before running this one-time cleanup. With the application environment configured, run from the repository root in PowerShell:

```powershell
$env:CONFIRM_CLINICAL_NOTE_DATA_DELETION = "YES"
npm run remove:clinical-notes
Remove-Item Env:CONFIRM_CLINICAL_NOTE_DATA_DELETION
```

The migration deletes legacy clinical-note records and note-only fields, and removes managed attachments only when no other record references them. Shared or unmanaged attachments are retained.

### Health Checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready` (returns HTTP 503 until MongoDB is connected)

### Release Checklist

1. Rotate any credentials that have ever been shared, logged, or committed.
2. Restrict MongoDB network access to the deployment provider where possible.
3. Set exact HTTPS origins in `APP_URL`, `CLIENT_URL`, or `CORS_ORIGINS`; do not use `*`.
4. Confirm Supabase bucket policies and keep the secret key server-only.
5. Run `npm run check` and test registration OTP, login, uploads, appointments, notifications, and real-time chat in staging.
6. Configure the platform health check to `/api/ready` and enable automatic restart.
7. Back up MongoDB before the first production release and before schema-changing releases.

The appointment and promotion expiry jobs run inside the API process. Deploy one API instance unless those jobs are moved to a dedicated worker or protected by a distributed lock.
