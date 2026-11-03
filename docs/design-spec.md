# Gaia - Design Spec

Date: 2026-11-02
Source: `Ishimwe_Axcel_[Assignment2]_[10232026].pdf` (Project Proposal + SRS v2)

## Purpose

Gaia is a web-based referral and resource-visibility platform for Rwanda's
district health network. It replaces phone-call-and-guesswork referrals with
a shared dashboard of facility resource status (beds, specialists, supplies)
and a structured referral workflow, so a referral is based on what a
receiving facility can actually provide.

This spec translates the SRS (functional requirements FR1–FR6,
non-functional requirements NFR1–NFR9, and Appendix requirements DB/I18N/
LEG/REU/DEP) into a concrete, buildable system for a course-project pilot
scope (5–8 facilities). Full requirement text lives in the SRS; this spec
does not repeat requirement rationale, only the design decisions needed to
implement them.

## Scope decisions (confirmed with stakeholder)

- **Build target**: full-stack app, real Express API, real PostgreSQL
  schema, real React dashboard. Not a mockup.
- **SMS (FR 2.5)**: stubbed. `NotificationService.sendSms()` logs the
  message instead of calling a real gateway. Same call signature as a real
  integration, so swapping in a provider later is a one-file change.
- **Localization (FR 6.1, I18N 1–2)**: i18n-ready structure (`react-i18next`,
  separate `en.json` / `rw.json` string files) but only English strings are
  filled in for this build. `rw.json` exists as an empty-keyed stub.
- **Code style**: simple, explainable code over abstraction. Plain Express
  route handlers, parameterized SQL (no ORM), minimal layering. The person
  building this needs to be able to explain every file in a defense.

## Architecture

Monorepo, two apps, one shared docs folder:

```
gaia/
├── server/     Node.js + Express API, PostgreSQL (pg + node-pg-migrate)
├── client/     React + Vite dashboard
└── docs/       SRS, this spec, onboarding guide
```

- **Backend**: Express REST API + Socket.IO for real-time referral push
  (FR 2.2). JWT auth (access + refresh token), bcrypt password hashing
  (NFR 1). Role-check middleware per route (FR 3.2).
- **Database**: PostgreSQL. Schema below. Migrations tracked with
  `node-pg-migrate` (REU 4: use a well-supported library, not custom
  migration code).
- **Realtime**: Socket.IO, one room per facility (`facility:<id>`). On
  referral create/update, the server emits to the relevant facility room if
  connected; `NotificationService` falls back to the SMS stub when the
  receiving facility has no active socket connection within a short window
  (approximates "no data connection" from FR 2.5 without needing real
  presence detection beyond socket connection state).
- **Frontend**: React + Vite, React Router, Context API for auth + socket
  state (no Redux, unnecessary for this scope), `react-i18next` for
  localization, a thin `fetch`-based API client per resource.
- **Local dev**: `docker-compose.yml` with a single `postgres` service.
  `npm run dev` per app (`server/`, `client/`), or a root script running
  both concurrently.

## Data model

Maps directly to the SRS class diagram (Appendix B.2).

```sql
districts(id, name)

facilities(id, district_id FK, name, tier, phone_number)

users(id, facility_id FK, username, password_hash, role, created_at)
  -- role: 'chw' | 'nurse' | 'district_admin'

resource_status(id, facility_id FK, type, quantity, updated_at)
  -- type: 'bed' | 'specialist' | 'supply'
  -- append-only: a new row per update, never overwritten (DB 4).
  -- "current" value = latest row per (facility_id, type).
  -- staleness is computed at read time from updated_at, not stored.

referrals(id, patient_ref, condition, resource_required,
          referring_facility_id FK, receiving_facility_id FK,
          status, created_by FK users, created_at)
  -- status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'

notifications(id, referral_id FK, channel, sent_at)
  -- channel: 'in_app' | 'sms'

audit_log(id, user_id FK, action, timestamp)
  -- written on every referral and resource-status mutation (NFR 6)
```

Foreign keys enforce referential integrity per DB 1 (a referral can never
point to a nonexistent facility or user). Referral and audit rows are never
hard-deleted from the app layer (DB 3): no DELETE route exists for them.

## API

REST, one route file per feature area, mirroring the FR groupings:

| Method | Path | FR | Notes |
|---|---|---|---|
| POST | `/auth/login` | 3.1 | returns JWT |
| POST | `/auth/logout` | 3.4 | client discards token; stateless |
| POST | `/auth/reset-password` | 3.5 | admin-assisted channel |
| GET | `/facilities/:id/status` | 1.1–1.3 | current + stale flag |
| PUT | `/facilities/:id/status` | 4.1 | own facility only (business rule 6.7) |
| POST | `/referrals` | 2.1 | creates pending referral, triggers notification |
| GET | `/referrals/:id` | 2.6 | |
| GET | `/referrals` | 2.6 | list for logged-in user's facility |
| PATCH | `/referrals/:id` | 2.3, 2.4, 2.7 | body `{action: accept\|decline\|complete\|cancel}` |
| GET | `/reports/district/:id` | 5.2 | district_admin only |
| POST | `/admin/users` | 3.3 | district_admin only |

Role-based middleware checks `req.user.role` against a static allow-list per
route. No permissions table; three roles is simple enough for an inline
check (FR 3.2).

## Frontend structure

```
client/src/
├── pages/        Login, Dashboard, ReferralForm, ReferralDetail,
│                  DistrictReports, AdminUsers
├── components/    ResourceCard, ReferralStatusBadge, StaleFlag,
│                  LanguageSwitcher
├── api/           auth.js, referrals.js, facilities.js, reports.js
├── context/       AuthContext, SocketContext
└── i18n/          en.json, rw.json (stub)
```

Dashboard has two views per SRS 3.1: facility view (editable, own facility)
and network view (read-only, nearby facilities, used to pick a referral
target).

## Testing

- **Backend**: Jest + Supertest, one test file per route group, happy path
  + 1–2 edge cases per route (e.g. non-owner tries to update another
  facility's status → 403; decline before accept → 400).
- **Frontend**: React Testing Library on the highest-value components:
  login form, referral creation form, accept/decline action.
- Not exhaustive coverage. Enough to demonstrate the workflow works and to
  have something concrete to show in a defense.

## Explicitly out of scope (per SRS)

- Electronic medical records integration (future integration point only).
- Rwanda HMIS link (future, REU 3: documented API is the only prep for
  this now).
- Real SMS gateway (stubbed, see Scope decisions).
- Facility-specific configuration/customization (SRS 2.5).
- Kinyarwanda translations (structure only, not content).

## Open items for a later iteration (not blocking this build)

- Legal/Ministry of Health approval for a real pilot (LEG 1, LEG 4), which
  is outside a course project's control but noted for completeness.
- Real SMS gateway selection and credentials.
- Production deployment target (DEP 1 describes constraints; no specific
  host chosen yet since this is a course build, not a live pilot).
