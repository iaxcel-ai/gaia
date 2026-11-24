# Gaia

Gaia is a web platform for Rwanda's rural health network. It shows which facility in a district has beds, specialists and supplies right now, and lets staff send a referral to a facility that can actually treat the patient, instead of phoning around and guessing. District health offices get a report on referral patterns and recurring shortages.

It was built as a course project (African Leadership University, student Ishimwe Axcel) from a Software Requirements Specification: [`docs/SRS.pdf`](docs/SRS.pdf).

## Live demo

**https://gaia-yig6.onrender.com**

The site runs on a free host that sleeps after about 15 minutes without visitors. If the first page takes up to a minute to load, wait: it is waking up.

Log in with one of these demo accounts. They all use the password `gaia-demo-2026`, and they only hold made-up data.

| Username | Role | Facility | What to try |
|---|---|---|---|
| `admin.demo` | District admin | Kacyiru District Hospital | District report, Staff accounts (create, reset password, deactivate) |
| `nurse.kacyiru` | Nurse | Kacyiru District Hospital | Update your facility's counts, send a referral, cancel one you sent that is still pending |
| `nurse.kingfaisal` | Nurse | King Faisal Hospital | Referrals tab: accept or decline the pending referral |
| `chw.kibagabaga` | Community health worker | Kibagabaga Level Two Teaching Hospital | Has a pending incoming referral to accept or decline, like a nurse |
| `nurse.remera` | Nurse | Remera Health Center | See referrals you sent that were accepted, declined with a reason, or cancelled |

**A three-minute tour**

1. Log in as `nurse.kacyiru`. The Dashboard shows your facility's beds, specialists and supplies, and a "Refer a patient" list of the other Gasabo facilities with their latest counts. Choose "Patient needs: bed" to hide facilities with none.
2. Click "Refer patient here" on King Faisal Hospital, fill in a patient reference and condition, and send. The referral appears under Referrals.
3. Log out and log in as `nurse.kingfaisal`. The Referrals tab shows a badge for referrals waiting. Open the new one and choose Accept, or Decline and give a reason.
4. Log in as `admin.demo` and open District report to see referral counts, the decline rate and reasons, and facilities with recurring shortages.

## What it does

The requirements come from the SRS. This is where each one lives in the app.

| SRS feature | In the app |
|---|---|
| Resource visibility across facilities | Dashboard: your facility, a selector for any other facility, and a referral list showing every facility's latest bed, specialist and supply counts |
| Resource status updates | "Update your facility" form on the Dashboard. History is append-only, and values older than two hours are flagged "Stale" with an "Updated 3 h ago" time |
| Referral management | Send, receive, accept, decline (with a reason), complete and cancel referrals. A referral can only be answered by the receiving facility and cancelled by the sender before it is answered |
| Real-time notification and SMS fallback | A live badge on the Referrals tab over Socket.IO. When the receiving facility has nobody connected, a message goes to an SMS stub (logged, not sent) |
| Authentication and access control | Username and password login, three roles (community health worker, nurse, district admin), and role checks on every route |
| Staff accounts | District admins create accounts, reset passwords from a list of registered staff, and deactivate or reactivate accounts. Accounts are never self-registered, by design |
| Referral outcomes and district reporting | Every action is audit-logged. The district report shows referral counts by status, the decline rate, why referrals were declined, which facilities decline most, and recurring zero-stock gaps |

**Actors:** community health workers and nurses at facilities (send and answer referrals, update their facility), and the district admin (accounts and reports).

## Known limitations

- **Kinyarwanda is not built.** The SRS asks for an English and Kinyarwanda interface. Accurate clinical translation needs a native speaker, so the interface is English only for now.
- **SMS is a stub.** The fallback logs the message it would send. A real gateway can be added in one file (`server/src/services/notificationService.js`).
- **No self-registration.** The SRS has district admins create staff accounts, so there is no sign-up page.
- **Deactivating takes effect at next login.** A user who is already logged in keeps working until their session (8 hours) ends.
- **The demo site sleeps** when idle, as described above.

## Run it locally

You need Git, Node.js 20 or newer, and Docker Desktop (for the database).

1. Clone the repository and go into it:
   ```
   git clone https://github.com/iaxcel-ai/gaia.git
   cd gaia
   ```
2. Start Docker Desktop and wait until it says it is running. Then start the database from the repository folder:
   ```
   docker compose up -d
   ```
3. Create the server's settings file. On macOS, Linux or Git Bash:
   ```
   cp server/.env.example server/.env
   ```
   On Windows Command Prompt use `copy server\.env.example server\.env`. The defaults already match the Docker database.
4. Install and prepare the server, then start it (leave this terminal open):
   ```
   cd server
   npm install
   npm run migrate up
   node scripts/seed.js
   npm run dev
   ```
   `migrate up` creates the tables. `seed.js` adds the Gasabo district, its 29 facilities and an `admin` account, and prints the login. It is safe to run again. The server listens on port 4000.
5. In a second terminal, install and start the client:
   ```
   cd client
   npm install
   npm run dev
   ```
6. Open **http://localhost:5173** and log in as `admin` with the password `admin_dev_password`.

**Optional: demo data.** To add the demo accounts, resource counts and referrals from the live site, run this in the `server` folder (macOS, Linux or Git Bash):
```
SEED_DEMO=true node scripts/seed-demo.js
```
In PowerShell use `$env:SEED_DEMO="true"; node scripts/seed-demo.js`. The demo accounts use the password `gaia-demo-2026`.

**If something does not work**

- `ECONNREFUSED` on port 5432: Docker Desktop is not running, or step 2 was skipped.
- Port 4000 or 5173 already in use: close the other program using it.
- Login fails after setup: check that `node scripts/seed.js` finished without errors.

## Run the tests

```
cd server && npm test
cd client && npm test
```

The backend tests use their own database, `gaia_test`, so they never add rows to the dev database. `npm test` creates it and applies the migrations by itself; Postgres only needs to be running.

## Deploy to Render

The repository includes a `render.yaml` blueprint. One Render web service serves both the API (under `/api`) and the built React client, so there is a single public address. The database is hosted separately, for example on Neon.

1. Create a Postgres database (for example a free Neon project) and copy its connection string.
2. On Render, choose **New > Blueprint**, connect this GitHub repository, and let it read `render.yaml`.
3. Set the two secrets Render asks for: `DATABASE_URL` (the connection string) and `ADMIN_PASSWORD` (the password for the `admin` account, at least 7 characters). `JWT_SECRET` is generated for you.
4. Deploy. On every start the service applies the database migrations, adds the Gasabo district, its facilities and the `admin` account, and adds the demo data, all only if missing.

Every later push to `main` redeploys automatically. Remove `SEED_DEMO` from `render.yaml` to turn the demo data off.

## Project layout and documents

```
gaia/
├── server/    Express API, PostgreSQL migrations, seed scripts, backend tests
├── client/    React + Vite app and frontend tests
├── docs/      SRS, design spec, implementation plans, onboarding guide
└── render.yaml
```

- [SRS](docs/SRS.pdf): the requirements this project is built from
- [Design spec](docs/design-spec.md): architecture, data model and API
- [Onboarding guide](docs/onboarding-guide.md): how staff use the app
- [Implementation plans](docs/plans/): the plans for each build phase

## Tech stack

Node.js and Express, PostgreSQL (`node-pg-migrate` for migrations, no ORM), Socket.IO, JWT authentication, React and Vite, Jest and Supertest (backend tests), Vitest and React Testing Library (frontend tests). Hosted on Render with a Neon database.
