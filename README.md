# Gaia

A real-time referral and resource-visibility platform for Rwanda's rural health centers. See `docs/design-spec.md` and `docs/SRS.pdf` for the full specification, and `docs/plans/` for the implementation plans this project is being built from.

## Status

**Phase 1 (Foundation) is complete.** Project scaffold, the full PostgreSQL schema, and JWT-based authentication (login, logout, role checks, admin-assisted password reset) are implemented end to end, with a React login page wired to the real API. Both test suites are green, and the flow has been verified in a real browser: logging in as the seeded admin takes you to the dashboard placeholder.

Not yet built: the resource dashboard, the referral workflow (create/accept/decline/complete, real-time alerts, SMS fallback), district-level reporting, and Kinyarwanda translations. These are Phases 2-4; each gets its own plan in `docs/plans/` before work starts.

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
   The seed script prints a dev admin username and password you can use to log in.
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

## Tech stack

Node.js, Express, PostgreSQL (`node-pg-migrate` for schema migrations, no ORM), JWT auth, React + Vite, Jest/Supertest (backend), Vitest/React Testing Library (frontend).
