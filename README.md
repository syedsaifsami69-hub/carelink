# CareLink — pseudonymous OPD messaging

Patients message their doctor under a visit label (like `A417`). Reception holds the patient's name; doctors and the patient portal never receive it from the server. Multiple hospitals share one deployment with their data kept apart.

Stack: React 19 + Vite + Tailwind 4 (frontend) · Express 5 + `ws` (backend) · PostgreSQL + Prisma 6.

## Run locally

Requires Node 22+.

1. Install and configure:
   ```bash
   npm install
   cp .env.example .env
   ```
2. Start Postgres, either way:
   - **No Docker** (works on Windows without WSL), in its own terminal: `npm run db:local`
   - **Docker**: `docker compose up -d db`
3. Create the schema and demo data:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
   The seed prints the staff password and a one-time patient access code for each demo visit. Codes are stored only as hashes, so copy them now, or issue new ones from the reception desk later.
4. Start the app (builds the frontend, applies migrations, serves on http://localhost:3001):
   ```bash
   npm start
   ```
   For hot reload use `npm run server` and `npm run dev` in two terminals.

### Demo accounts (development seed only)

Password for all: `carelink-dev-2026` (override with `SEED_PASSWORD`). The seed refuses to run when `NODE_ENV=production`.

| Hospital | Email | Role |
|---|---|---|
| SLIMS Puducherry | admin@slims.dev | Administrator (reception + audit log) |
| SLIMS Puducherry | reception@slims.dev | Reception |
| SLIMS Puducherry | meera@slims.dev, arjun@slims.dev, sana@slims.dev | Doctors |
| Harbour Clinic | reception@harbour.dev | Reception |
| Harbour Clinic | doctor@harbour.dev | Doctor |

## Tests

```bash
npm test
```
Runs the API suite against the `carelink_test` database (created by both Postgres options above). It covers login, sessions, rate limiting, cross-hospital access, doctor scoping, patient codes (expiry, revocation, re-issue), lab upload validation, WebSocket isolation, duplicate detection, status history, queue order and estimates, appointment conflicts (including simultaneous bookings) and the audit log.

## How access works

| Who | Signs in with | Can see |
|---|---|---|
| Admin / reception | email + password | their hospital's visits, with names; no message content |
| Doctor | email + password | only visits assigned to them, without names; messages and labs |
| Patient | 16-character access code from reception | only their own visit |

- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only their SHA-256 hash is stored. Staff sessions last 12 hours, patient sessions 2 hours.
- Patient access codes carry 80 bits of randomness and are stored as hashes. They expire after `PATIENT_ACCESS_TTL_HOURS` (default 72), are cut to `PATIENT_ACCESS_AFTER_DONE_HOURS` (default 24) once a visit is marked Done, and reception can revoke or re-issue them at any time; revoking also ends any open patient session.
- Every API route checks the session, the hospital and the role on the server. Records from another hospital or another doctor answer `404`, so their existence is not confirmed.
- WebSocket connections are authenticated from the session cookie and only receive "update" pings for records that user may see. Clients then re-fetch through the API.
- Lab files are accepted only as PDF, PNG or JPEG (checked by file content), up to 10 MB, and stored outside the web root under `STORAGE_DIR`.
- Logins and patient code attempts are limited to 10 per 15 minutes per client.

## API

| Method | Route | Who |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | staff |
| GET | `/api/auth/me` | anyone signed in |
| POST | `/api/patient/access` `{ code }` | patient |
| GET | `/api/workspace` | open visits (and those closed in the last 24 h) scoped to the caller, with queue positions |
| GET | `/api/patients?q=` | admin, reception (name or phone search) |
| POST | `/api/visits` `{ patientId }` or `{ name, age, sex, phone?, confirmNew? }`, `doctorId`, `priority?` | admin, reception — `409` lists likely duplicates |
| PATCH | `/api/visits/:id` `{ status?, doctorId?, priority? }` | admin, reception; assigned doctor may change status only |
| GET | `/api/visits/:id/history` | staff who can see the visit |
| POST · DELETE | `/api/visits/:id/access` | admin, reception (re-issue / revoke) |
| POST | `/api/visits/:id/messages` | assigned doctor, the patient |
| POST | `/api/visits/:id/labs` | admin, reception |
| GET | `/api/labs/:id/download` | reception, assigned doctor, the patient |
| GET | `/api/appointments?from=&to=` | staff (doctors: own, without names) |
| POST | `/api/appointments` | admin, reception — `409` on overlap |
| PATCH | `/api/appointments/:id` `{ startsAt?, durationMin?, status? }` | admin, reception (reschedule, Cancelled, No-show) |
| POST | `/api/appointments/:id/check-in` | admin, reception — opens a visit and issues an access code |
| GET | `/api/audit?before=` | admin |
| GET | `/api/health` | public |

## Deploy

`render.yaml` provisions the web service, a Postgres database and a persistent disk for uploads; see [DEPLOYMENT.md](DEPLOYMENT.md). Set `NODE_ENV=production`.

## OPD workflow

- **Patients** are one record per person per hospital; each visit hangs off it. Registering a new patient whose phone matches, or whose name (ignoring case, dots and spaces) and age (±1 year) match, returns the likely duplicates first.
- **Statuses:** Waiting → In consult → Labs pending → Follow-up → Done, plus Cancelled and No-show. Every change is stored with who made it and when (`/history`).
- **Queue:** waiting visits per doctor, priority first, then by check-in time. The wait estimate is (people ahead + anyone in consult) × that doctor's average consult length over the last 30 days, and is only shown once there are at least 3 finished consults. It is always labelled an estimate.
- **Appointments** cannot overlap for the same doctor; the check runs in a serializable transaction so simultaneous bookings cannot both win. Check-in opens a queued visit.
- **Audit log** (admins): sign-ins, failed sign-ins and code attempts, patient search, visit and appointment changes, access codes, lab uploads and downloads. It stores ids and counts only — no names, messages or file contents.

## Known limits

- Rate limits live in server memory: they reset on restart and do not work across multiple instances.
- `/api/workspace` returns the caller's whole scope unpaginated.
- Uploads travel as base64 JSON and are stored on local disk, not object storage.
- Audit entries are written just after each action, not inside its transaction, so a database failure at that moment can drop an entry (it is logged to the server console).
- No password reset, MFA, staff/hospital admin screens, persistent notifications or AI features yet; those are later milestones.
- Lifecycle steps and clinic working hours are fixed in code, not configurable per hospital.
- This is not a certified medical system. DPDP Act, medical-confidentiality and ABDM requirements still need specialist review before use with real patients.
