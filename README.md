# Gaia

A real-time referral and resource-visibility platform for Rwanda's rural health centers. See `docs/design-spec.md` and `docs/SRS.pdf` for the full specification.

## Running it locally

1. Start Postgres: `docker compose up -d`
2. Copy `server/.env.example` to `server/.env`
3. Install and migrate the backend:
   ```
   cd server
   npm install
   npm run migrate up
   npm run dev
   ```
4. Client setup: see `docs/plans/` for what's implemented so far.
