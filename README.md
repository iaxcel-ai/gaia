# Gaia

A real-time referral and resource-visibility platform for Rwanda's rural health centers. See `docs/design-spec.md` and `docs/SRS.pdf` for the full specification, and `docs/plans/` for the implementation plans this project is being built from.

## Status

Phases 1 to 4 are built. Each has its own plan in `docs/plans/`.

- **Phase 1 (Foundation):** project scaffold, the PostgreSQL schema, and JWT-based authentication (login, logout, role checks, admin-assisted password reset), with a React login page.
- **Phase 2 (Resource dashboard):** facility resource status (beds, specialists, supplies) with append-only history and a stale-data flag, shown in a facility view and a read-only network view.
- **Phase 3 (Referral workflow):** create, accept, decline, complete and cancel referrals, with real-time alerts over Socket.IO, a logged SMS stub as fallback, and audit logging.
- **Phase 4 (District reporting and staff accounts):** a district admin can view a district report (referral counts by status, facilities sending and receiving the most referrals, recurring resource gaps) and create staff accounts.

Not yet built: Kinyarwanda translations (accurate clinical translation needs a native speaker) and visual styling.

## Running it locally

1. Start Postgres: `docker compose up -d`
2. Copy `server/.env.example` to `server/.env`
3. Install, migrate, and seed the backend:
   ```
   cd server
   npm install
   npm run migrate up
   node scripts/seed.js
   npm run dev
   ```
   The seed script loads the Gasabo district with its healthcare facilities and prints a dev admin username and password you can use to log in. It is safe to run again.
4. Run the client:
   ```
   cd client
   npm install
   npm run dev
   ```
   The dev server proxies `/api` to the backend on port 4000.

## Running the tests

```
cd server && npm test
cd client && npm test
```

The backend tests use their own database, `gaia_test`, so they never add test rows to the dev database. `npm test` creates it and applies the migrations automatically; Postgres only needs to be running.

## Tech stack

Node.js, Express, PostgreSQL (`node-pg-migrate` for schema migrations, no ORM), JWT auth, React + Vite, Jest/Supertest (backend), Vitest/React Testing Library (frontend).
