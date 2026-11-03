# Gaia Phase 1: Foundation (Scaffold, Database, Auth) Implementation Plan

**Goal:** Stand up the Gaia monorepo with a working Postgres schema and a complete login flow (JWT issue, verify, role check, logout, admin-assisted password reset) end to end, backend and frontend.

**Architecture:** Express API in `server/`, React + Vite dashboard in `client/`, Postgres via Docker Compose. No ORM: raw parameterized SQL through a small `db.js` pool wrapper. `node-pg-migrate` tracks schema changes. JWT auth with bcrypt-hashed passwords.

**Tech Stack:** Node.js, Express, PostgreSQL, node-pg-migrate, pg, bcrypt, jsonwebtoken, Jest, Supertest, React, Vite, React Router, React Testing Library.

**Spec:** `docs/design-spec.md`

This is phase 1 of 4. Later phases (resource dashboard, referral workflow with realtime/SMS, reporting and admin, i18n polish) get their own plan documents once this phase is merged, matching the iterative-waterfall approach from the project proposal.

## Global Constraints

- Passwords are bcrypt-hashed before storage; plaintext is never persisted (NFR 1).
- Auth is JWT (access token only for phase 1; no refresh-token rotation yet, stateless, matches the spec's "stateless logout").
- Roles are a closed set: `'chw' | 'nurse' | 'district_admin'` (SRS 2.3, FR 3.2).
- No ORM. Raw parameterized SQL via `server/src/db.js`. No service/repository layering beyond what's listed below (per user's simple-code preference).
- Backend: Node.js + Express + PostgreSQL (SRS 2.4).
- Password reset is admin-assisted, not self-service (FR 3.5): only a `district_admin` can trigger it, for another user.

## Review Focus

- Wrong username or wrong password on login must return a generic 401 ("invalid credentials"), never revealing which field was wrong.
- An expired or tampered JWT on a protected route must return 401, not crash the server with an unhandled exception.
- A missing or malformed `Authorization` header must return 401 cleanly, not throw.
- A non-admin calling the password-reset route must get 403, not be allowed through.
- Creating a user with a username that already exists must return a clean 409/400, not leak a raw Postgres constraint-violation stack trace to the client.

---

## File Structure

```
gaia/
├── docker-compose.yml
├── README.md
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── migrations/
│   │   └── <timestamp>_create_core_tables.js
│   ├── scripts/
│   │   └── seed.js
│   ├── src/
│   │   ├── db.js
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── services/
│   │   │   └── authService.js
│   │   ├── middleware/
│   │   │   ├── requireAuth.js
│   │   │   └── requireRole.js
│   │   └── routes/
│   │       ├── auth.js
│   │       └── admin.js
│   └── tests/
│       ├── authService.test.js
│       ├── requireAuth.test.js
│       └── auth.routes.test.js
└── client/
    ├── package.json
    ├── vite.config.js
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── api/
    │   │   └── auth.js
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   └── pages/
    │       └── Login.jsx
    └── tests/
        └── Login.test.jsx
```

---

### Task 1: Monorepo scaffold and Postgres via Docker

**Files:**
- Create: `docker-compose.yml`
- Create: `server/package.json`
- Create: `server/.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: a running Postgres instance on `localhost:5432`, database `gaia`, reachable with the credentials in `.env.example`. Later tasks depend on this being up.

- [ ] **Step 1: Write `docker-compose.yml`** with one `postgres:16` service, named `postgres`, exposing `5432:5432`, env `POSTGRES_DB=gaia`, `POSTGRES_USER=gaia`, `POSTGRES_PASSWORD=gaia_dev_password`, and a named volume for data persistence.

- [ ] **Step 2: Write `server/.env.example`** with `DATABASE_URL=postgres://gaia:gaia_dev_password@localhost:5432/gaia`, `JWT_SECRET=change_me_in_production`, `PORT=4000`.

- [ ] **Step 3: Write `server/package.json`** with dependencies `express`, `pg`, `bcrypt`, `jsonwebtoken`, `cors`, `dotenv`, `node-pg-migrate`; devDependencies `jest`, `supertest`, `nodemon`. Scripts: `"dev": "nodemon src/server.js"`, `"start": "node src/server.js"`, `"migrate": "node-pg-migrate"`, `"test": "jest"`.

- [ ] **Step 4: Write `.gitignore`** at repo root covering `node_modules/`, `.env`, `dist/`, `*.log`.

- [ ] **Step 5: Write `README.md`** with a short "how to run this" section: `docker compose up -d`, copy `.env.example` to `.env`, `cd server && npm install && npm run migrate up && npm run dev`, then the client setup (filled in once Task 8 exists; leave a placeholder line for client setup here).

- [ ] **Step 6: Verify Postgres starts**

Run: `docker compose up -d && docker compose ps`
Expected: `postgres` service shows state `running` (or `healthy`).

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml server/package.json server/.env.example .gitignore README.md
git commit -m "chore: scaffold monorepo and postgres service"
```

---

### Task 2: Database schema migration

**Files:**
- Create: `server/migrations/<timestamp>_create_core_tables.js` (use `node-pg-migrate`'s generated timestamp prefix)

**Interfaces:**
- Produces: tables `districts`, `facilities`, `users`, `resource_status`, `referrals`, `notifications`, `audit_log`, exactly as columned in `docs/design-spec.md` under "Data model". Every later task that touches the DB depends on these exact table and column names.

- [ ] **Step 1: Run `npm --prefix server exec node-pg-migrate create create_core_tables`** to generate the timestamped migration file.

- [ ] **Step 2: Implement the migration's `up`/`down`** in the generated file, creating (in dependency order) `districts`, `facilities` (FK `district_id` → `districts.id`), `users` (FK `facility_id` → `facilities.id`, `role` as a `CHECK` constraint or Postgres `ENUM` restricted to `'chw'`, `'nurse'`, `'district_admin'`, `username` `UNIQUE`), `resource_status` (FK `facility_id`, `type` restricted to `'bed'`, `'specialist'`, `'supply'`), `referrals` (FK `referring_facility_id`, `receiving_facility_id` → `facilities.id`, FK `created_by` → `users.id`, `status` restricted to `'pending'`, `'accepted'`, `'declined'`, `'completed'`, `'cancelled'`, default `'pending'`), `notifications` (FK `referral_id`, `channel` restricted to `'in_app'`, `'sms'`), `audit_log` (FK `user_id`). All `id` columns are `SERIAL PRIMARY KEY`. All `created_at`/`updated_at`/`sent_at`/`timestamp` columns default to `now()`. `down` drops tables in reverse dependency order.

- [ ] **Step 3: Run the migration against the local database**

Run: `cd server && npm run migrate up`
Expected: migration reports success, no errors.

- [ ] **Step 4: Verify the tables exist**

Run: `docker compose exec postgres psql -U gaia -d gaia -c "\dt"`
Expected: all 7 tables listed.

- [ ] **Step 5: Commit**

```bash
git add server/migrations
git commit -m "feat: add core database schema migration"
```

---

### Task 3: Database query helper and dev seed script

**Files:**
- Create: `server/src/db.js`
- Create: `server/scripts/seed.js`

**Interfaces:**
- Produces: `query(text: string, params?: any[]) => Promise<{rows: any[]}>` exported from `server/src/db.js`. Every later task that touches the database uses this function, never a raw `pg` client directly.

- [ ] **Step 1: Implement `server/src/db.js`**, creating a `pg.Pool` from `process.env.DATABASE_URL` and exporting `query(text, params)` that delegates to `pool.query(text, params)`.

- [ ] **Step 2: Implement `server/scripts/seed.js`**, a standalone script (run with `node scripts/seed.js`) that inserts one district, two facilities in that district, and one `district_admin` user (username `admin`, a bcrypt-hashed password from a hardcoded dev value, printed to the console after seeding so it's usable for manual login testing). Use `ON CONFLICT DO NOTHING` on the username to make the script idempotent.

- [ ] **Step 3: Run the seed script**

Run: `cd server && node scripts/seed.js`
Expected: script prints the seeded admin username and dev password, exits 0.

- [ ] **Step 4: Verify the seed data landed**

Run: `docker compose exec postgres psql -U gaia -d gaia -c "SELECT username, role FROM users;"`
Expected: one row, `admin` / `district_admin`.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.js server/scripts/seed.js
git commit -m "feat: add db query helper and dev seed script"
```

---

### Task 4: Auth service (hashing and JWT)

**Files:**
- Create: `server/src/services/authService.js`
- Test: `server/tests/authService.test.js`

**Interfaces:**
- Produces: `hashPassword(plain: string) => Promise<string>`, `verifyPassword(plain: string, hash: string) => Promise<boolean>`, `issueToken(user: {id, username, role, facility_id}) => string`, `verifyToken(token: string) => {id, username, role, facility_id} | null`, all exported from `server/src/services/authService.js`. `requireAuth` middleware (Task 5) and the login route (Task 6) depend on these exact names.

- [ ] **Step 1: Write the failing tests** in `server/tests/authService.test.js`:

```js
test('hashPassword then verifyPassword succeeds for the right password', async () => {
  const hash = await hashPassword('correct-horse');
  expect(await verifyPassword('correct-horse', hash)).toBe(true);
});

test('verifyPassword fails for the wrong password', async () => {
  const hash = await hashPassword('correct-horse');
  expect(await verifyPassword('wrong-password', hash)).toBe(false);
});

test('issueToken then verifyToken round-trips the user payload', () => {
  const user = { id: 1, username: 'admin', role: 'district_admin', facility_id: null };
  const token = issueToken(user);
  expect(verifyToken(token)).toMatchObject(user);
});

test('verifyToken returns null for a malformed token', () => {
  expect(verifyToken('not-a-real-token')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest authService -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/services/authService.js`** with the four functions above. `hashPassword`/`verifyPassword` use `bcrypt` (10 salt rounds). `issueToken` signs with `process.env.JWT_SECRET`, 8-hour expiry, payload `{id, username, role, facility_id}`. `verifyToken` wraps `jwt.verify` in try/catch, returning `null` on any failure instead of throwing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest authService -v`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/authService.js server/tests/authService.test.js
git commit -m "feat: add auth service for hashing and jwt"
```

---

### Task 5: Auth middleware (requireAuth, requireRole)

**Files:**
- Create: `server/src/middleware/requireAuth.js`
- Create: `server/src/middleware/requireRole.js`
- Test: `server/tests/requireAuth.test.js`

**Interfaces:**
- Consumes: `verifyToken` from `server/src/services/authService.js` (Task 4).
- Produces: `requireAuth(req, res, next)` default export from `requireAuth.js`, which sets `req.user` on success. `requireRole(...roles: string[]) => (req, res, next) => void` default export from `requireRole.js`. All protected routes in later tasks use both.

- [ ] **Step 1: Write the failing tests** in `server/tests/requireAuth.test.js`, using a minimal Express app with one dummy protected route (`GET /protected`, mounted with `requireAuth`, responding `200 {ok: true}` on success):

```js
test('request with no Authorization header is rejected with 401', async () => {
  const res = await request(app).get('/protected');
  expect(res.status).toBe(401);
});

test('request with a malformed token is rejected with 401', async () => {
  const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-token');
  expect(res.status).toBe(401);
});

test('request with a valid token succeeds and sets req.user', async () => {
  const token = issueToken({ id: 1, username: 'admin', role: 'district_admin', facility_id: null });
  const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest requireAuth -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/middleware/requireAuth.js`**: reads the `Authorization` header, expects `Bearer <token>`; if missing or malformed, `401`; else calls `verifyToken`, and on `null` returns `401`, else sets `req.user` to the payload and calls `next()`.

- [ ] **Step 4: Implement `server/src/middleware/requireRole.js`**: exports a factory `requireRole(...roles)` returning middleware that checks `roles.includes(req.user.role)`, calling `next()` on match or responding `403` otherwise. Assumes it runs after `requireAuth`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest requireAuth -v`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware
git add server/tests/requireAuth.test.js
git commit -m "feat: add requireAuth and requireRole middleware"
```

---

### Task 6: App wiring, auth routes, admin password reset

**Files:**
- Create: `server/src/app.js`
- Create: `server/src/server.js`
- Create: `server/src/routes/auth.js`
- Create: `server/src/routes/admin.js`
- Test: `server/tests/auth.routes.test.js`

**Interfaces:**
- Consumes: `query` from `db.js` (Task 3); `hashPassword`, `verifyPassword`, `issueToken` from `authService.js` (Task 4); `requireAuth`, `requireRole` (Task 5).
- Produces: `server/src/app.js` exports the configured Express `app` (no `listen()` call, so tests can import it directly). `POST /auth/login`, `POST /auth/logout`, `POST /auth/reset-password` routes. Later phases mount their routers onto this same `app`.

- [ ] **Step 1: Write the failing tests** in `server/tests/auth.routes.test.js` (seed a test user directly via `query` in a `beforeAll`, matching the seed script's pattern):

```js
test('login with correct credentials returns a token', async () => {
  const res = await request(app).post('/auth/login').send({ username: 'testadmin', password: 'testpass123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
});

test('login with wrong password returns a generic 401', async () => {
  const res = await request(app).post('/auth/login').send({ username: 'testadmin', password: 'wrong' });
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Invalid credentials');
});

test('login with unknown username returns the same generic 401', async () => {
  const res = await request(app).post('/auth/login').send({ username: 'nobody', password: 'wrong' });
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Invalid credentials');
});

test('logout returns 204', async () => {
  const res = await request(app).post('/auth/logout');
  expect(res.status).toBe(204);
});

test('reset-password by a district_admin succeeds', async () => {
  const adminToken = issueToken({ id: 1, username: 'testadmin', role: 'district_admin', facility_id: null });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'testadmin', newPassword: 'newpass456' });
  expect(res.status).toBe(200);
});

test('reset-password by a non-admin is rejected with 403', async () => {
  const nurseToken = issueToken({ id: 2, username: 'nurse1', role: 'nurse', facility_id: 1 });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ username: 'testadmin', newPassword: 'x' });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest auth.routes -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/routes/auth.js`**: `POST /login` looks up the user by username via `query`, `verifyPassword`s against the stored hash (if no user found, still return the generic 401, do not distinguish), on success `issueToken` and respond `200 {token, user: {id, username, role, facility_id}}`. `POST /logout` responds `204` (stateless, nothing to invalidate). `POST /reset-password`, mounted behind `requireAuth` + `requireRole('district_admin')`, takes `{username, newPassword}`, hashes the new password, updates the `users` row, responds `200 {ok: true}`.

- [ ] **Step 4: Implement `server/src/app.js`**: creates the Express app, applies `express.json()` and `cors()`, mounts `routes/auth.js` at `/auth`, adds a catch-all JSON error handler (so an unhandled exception in a route returns `500 {error: 'Internal server error'}` instead of leaking a stack trace), and exports `app`.

- [ ] **Step 5: Implement `server/src/server.js`**: imports `app`, calls `app.listen(process.env.PORT || 4000)`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx jest auth.routes -v`
Expected: PASS, all 6 tests.

- [ ] **Step 7: Manual smoke test**

Run: `cd server && npm run dev`, then in another terminal: `curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"<seeded dev password>"}'`
Expected: `200` with a `token` in the response body.

- [ ] **Step 8: Commit**

```bash
git add server/src/app.js server/src/server.js server/src/routes
git add server/tests/auth.routes.test.js
git commit -m "feat: wire express app and auth routes"
```

---

### Task 7: Duplicate-username handling on admin user creation stub

This task exists to satisfy the Review Focus item on duplicate usernames, ahead of the full `POST /admin/users` route (FR 3.3), which belongs to Phase 3 (reporting and admin). Phase 1 only needs the shared error-handling helper in place so Phase 3 can reuse it without re-deciding the behavior.

**Files:**
- Modify: `server/src/db.js`
- Test: `server/tests/db.test.js`

**Interfaces:**
- Produces: `isUniqueViolation(err: Error) => boolean` exported from `server/src/db.js`, checking `err.code === '23505'` (Postgres's unique-violation code). Phase 3's user-creation route uses this to turn a duplicate-username insert into a clean `409`, instead of letting the raw Postgres error reach the client.

- [ ] **Step 1: Write the failing test** in `server/tests/db.test.js`:

```js
test('isUniqueViolation returns true for a postgres unique-violation error', () => {
  expect(isUniqueViolation({ code: '23505' })).toBe(true);
});

test('isUniqueViolation returns false for other errors', () => {
  expect(isUniqueViolation({ code: '23503' })).toBe(false);
  expect(isUniqueViolation(new Error('boom'))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest db.test -v`
Expected: FAIL, `isUniqueViolation` not exported.

- [ ] **Step 3: Add `isUniqueViolation(err)` to `server/src/db.js`**, exported alongside `query`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest db.test -v`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.js server/tests/db.test.js
git commit -m "feat: add unique-violation helper for future admin routes"
```

---

### Task 8: Frontend scaffold and Login page

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/api/auth.js`
- Create: `client/src/context/AuthContext.jsx`
- Create: `client/src/pages/Login.jsx`
- Test: `client/tests/Login.test.jsx`
- Modify: `README.md` (fill in the client setup placeholder from Task 1)

**Interfaces:**
- Produces: `login(username, password) => Promise<{token, user}>` exported from `client/src/api/auth.js`, throwing on a non-2xx response with the server's `error` message. `AuthContext` providing `{user, token, login(username, password), logout()}` to the tree, persisting `token` to `localStorage` under the key `gaia_token`. Later pages (Phase 2+) consume `AuthContext` for the logged-in user's role and facility.

- [ ] **Step 1: Write `client/package.json`** with dependencies `react`, `react-dom`, `react-router-dom`; devDependencies `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`. Scripts: `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`.

- [ ] **Step 2: Write `client/vite.config.js`** with the React plugin and a vitest config block (`environment: 'jsdom'`).

- [ ] **Step 3: Implement `client/src/api/auth.js`**: `login(username, password)` does `fetch('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password})})`; on `!res.ok`, throws an `Error` with the parsed body's `error` field; on success returns the parsed `{token, user}`. (A Vite dev-server proxy from `/api` to `http://localhost:4000` is configured in `vite.config.js` alongside the plugin block from Step 2.)

- [ ] **Step 4: Implement `client/src/context/AuthContext.jsx`**: a `AuthProvider` component holding `user`/`token` state (initialized from `localStorage.getItem('gaia_token')` if present, decoded user left `null` until a login call populates it), exposing `login(username, password)` (calls the API, stores `token` in state + `localStorage`, stores `user`) and `logout()` (clears both). Exports `useAuth()` hook via `useContext`.

- [ ] **Step 5: Write the failing test** in `client/tests/Login.test.jsx`:

```jsx
test('submitting valid credentials calls login and navigates on success', async () => {
  const mockLogin = vi.fn().mockResolvedValue({ token: 'abc', user: { role: 'nurse' } });
  render(<AuthContext.Provider value={{ login: mockLogin }}><Login /></AuthContext.Provider>);
  await userEvent.type(screen.getByLabelText(/username/i), 'nurse1');
  await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
  expect(mockLogin).toHaveBeenCalledWith('nurse1', 'secret123');
});

test('shows an error message when login fails', async () => {
  const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
  render(<AuthContext.Provider value={{ login: mockLogin }}><Login /></AuthContext.Provider>);
  await userEvent.type(screen.getByLabelText(/username/i), 'nurse1');
  await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd client && npx vitest run Login`
Expected: FAIL, `Login` component not found.

- [ ] **Step 7: Implement `client/src/pages/Login.jsx`**: a form with labeled `username` and `password` inputs and a "Log in" submit button, using `useAuth()` for `login`. On submit, calls `login(username, password)`; on rejection, displays the error message in the page (e.g. a `<p role="alert">`); on success, the caller (App-level routing, Step 8) handles navigation.

- [ ] **Step 8: Implement `client/src/App.jsx`** and `client/src/main.jsx`: `App.jsx` wraps the tree in `AuthProvider` and `BrowserRouter`, with a route `/login` → `Login`, and a route `/` that redirects to `/login` if no `user` in context (a placeholder `/dashboard` route can just render `"Dashboard coming in Phase 2"` for now). `main.jsx` mounts `App` into `#root`.

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd client && npx vitest run Login`
Expected: PASS, both tests.

- [ ] **Step 10: Fill in the README's client setup section** (left as a placeholder in Task 1): `cd client && npm install && npm run dev`, note the dev server proxies `/api` to the backend on port 4000.

- [ ] **Step 11: Commit**

```bash
git add client README.md
git commit -m "feat: scaffold react client and login page"
```

---

## End of Phase 1

At this point: `docker compose up -d`, migrate, seed, run both `npm run dev` servers, and log in through the browser as the seeded admin, getting a token and landing on the dashboard placeholder. This is the testable deliverable for this phase. Phase 2 (resource dashboard: FR 1, FR 4) builds on `requireAuth`/`requireRole`, the `resource_status` table, and `AuthContext`, and gets its own plan document.
