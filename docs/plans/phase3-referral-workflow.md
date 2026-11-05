# Gaia Phase 3: Referral Workflow Implementation Plan

**Goal:** Let facility staff create a referral to another facility, have the receiving facility notified in real time (falling back to a logged SMS stub when no one is connected), and let both sides track and act on it through accept/decline/complete/cancel (FR 2), with every action audited (NFR 6).

**Architecture:** A new `referrals` Express route reusing Phase 1/2's `requireAuth`/`asyncHandler`/`query`. A thin Socket.IO layer (one room per facility, `facility:<id>`) wired into the existing HTTP server, with a `notificationService` that emits to a facility's room when someone is connected there and falls back to a `sendSms` stub (console-logged, matching the Phase 1 design-spec decision) otherwise. An `auditService` writes one row per referral action. On the frontend, a `SocketContext` joins the user's facility room and a `Referrals` page lists/acts on referrals, fed by a `ReferralForm` reachable from the Dashboard's network view.

**Tech Stack:** Same as Phases 1-2, plus `socket.io` (server) and `socket.io-client` (frontend), both new dependencies.

**Spec:** `docs/design-spec.md` (Architecture's Realtime section, Data model's `referrals`/`notifications`/`audit_log` tables, API table's `/referrals` routes); SRS business rule 6.7 and FR 2.1-2.7 in `docs/SRS.pdf`.

This is phase 3 of 4. Reporting (FR 5) and Kinyarwanda translations (FR 6) are out of scope here and get their own plan.

## Global Constraints

- `referrals.status` is a closed set: `'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'` (matches the Phase 1 migration's CHECK constraint), default `'pending'`.
- Only the receiving facility may accept, decline, or mark a referral complete (SRS business rule 6.7, FR 2.4). Only the referring facility may cancel, and only before it's accepted (FR 2.7).
- SMS is stubbed: `sendSms(phoneNumber, message)` logs and resolves, it does not call a real gateway (Phase 1 design-spec decision, carried forward).
- Every referral action (create, accept, decline, complete, cancel) writes one `audit_log` row with the acting user's id and a short action string (NFR 6).
- No ORM, raw parameterized SQL, minimal layering (carried over code-style decision).
- Reuse `requireAuth`, `asyncHandler`, `query` from Phases 1-2 rather than duplicating them.

## Review Focus

- Creating a referral where the receiving facility is the same as the referring facility must be rejected with 400: it isn't a referral.
- Accepting, declining, or cancelling a referral that isn't in the state that action requires (e.g. accepting an already-accepted or already-declined referral) must be rejected with 409, not silently reprocessed.
- A referral created with a `receiving_facility_id` that doesn't exist must be rejected with 400, not crash on the foreign-key violation.
- A user whose facility is neither the referring nor the receiving facility must not be able to view that referral's details (privacy: a competing facility shouldn't see another's referral traffic).
- Marking a referral complete by the referring facility (instead of the receiving one) must be rejected with 403, matching business rule 6.7 exactly. This is easy to get backwards from "accept/decline", where the same facility acts.

---

## File Structure

```
server/
├── package.json                        (modify) add socket.io
├── src/
│   ├── socket.js                       (new) Socket.IO wiring, facility room join
│   ├── server.js                       (modify) attach socket.io to the http server
│   ├── app.js                          (modify) mount referrals router
│   ├── services/
│   │   ├── auditService.js             (new) writeAudit(userId, action)
│   │   └── notificationService.js      (new) notify(io, referral) + sendSms stub
│   └── routes/
│       └── referrals.js                (new) POST/GET/PATCH /referrals
└── tests/
    ├── socket.test.js                  (new)
    ├── auditService.test.js            (new)
    ├── notificationService.test.js     (new)
    └── referrals.routes.test.js        (new)

client/
├── package.json                        (modify) add socket.io-client
├── vite.config.js                      (modify) proxy /socket.io with ws: true
├── src/
│   ├── api/
│   │   └── referrals.js                (new) createReferral, getReferrals, getReferral, respondToReferral
│   ├── context/
│   │   └── SocketContext.jsx           (new) connects on login, exposes the latest referral event
│   ├── components/
│   │   └── ReferralStatusBadge.jsx     (new)
│   ├── pages/
│   │   ├── ReferralForm.jsx            (new) create a referral to a chosen facility
│   │   ├── Referrals.jsx               (new) list + act on referrals
│   │   └── Dashboard.jsx               (modify) "Refer patient here" link per network facility
│   └── App.jsx                         (modify) new routes, wrap in SocketProvider
└── tests/
    ├── ReferralForm.test.jsx           (new)
    └── Referrals.test.jsx              (new)
```

---

### Task 1: Socket.IO server wiring and facility rooms

**Files:**
- Create: `server/src/socket.js`
- Modify: `server/src/server.js`
- Modify: `server/package.json` (add `socket.io` dependency; add `socket.io-client` as a devDependency for this task's test)
- Test: `server/tests/socket.test.js`

**Interfaces:**
- Consumes: `verifyToken` from `server/src/services/authService.js` (Phase 1).
- Produces: `attachSocket(httpServer) => Server` default export from `server/src/socket.js`, where `Server` is a `socket.io` server instance. `server.js` calls `app.set('io', io)` so route handlers reach it via `req.app.get('io')`. Task 2's `notificationService` and Task 3's routes consume the `io` instance this way, not by importing `socket.js` directly.

- [ ] **Step 1: Write the failing tests** in `server/tests/socket.test.js`, starting a real `http.createServer(require('../src/app'))` on an ephemeral port and connecting with `socket.io-client`:

```js
const http = require('http');
const { io: ioClient } = require('socket.io-client');
const app = require('../src/app');
const attachSocket = require('../src/socket');
const { issueToken } = require('../src/services/authService');

let httpServer;
let io;
let port;

beforeAll((done) => {
  httpServer = http.createServer(app);
  io = attachSocket(httpServer);
  httpServer.listen(0, () => { port = httpServer.address().port; done(); });
});

afterAll((done) => { io.close(); httpServer.close(done); });

test('a connection without a token is disconnected', (done) => {
  const client = ioClient(`http://localhost:${port}`, { auth: {} });
  client.on('disconnect', () => { client.close(); done(); });
});

test('a connection with a valid token joins its facility room', (done) => {
  const token = issueToken({ id: 1, username: 'nurse1', role: 'nurse', facility_id: 7 });
  const client = ioClient(`http://localhost:${port}`, { auth: { token } });
  client.on('connect', () => {
    setTimeout(() => {
      expect(io.sockets.adapter.rooms.get('facility:7')?.size).toBe(1);
      client.close();
      done();
    }, 50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest socket.test -v`
Expected: FAIL, `attachSocket` not found.

- [ ] **Step 3: Add `socket.io` to dependencies and `socket.io-client` to devDependencies** in `server/package.json`, then `npm install`.

- [ ] **Step 4: Implement `server/src/socket.js`**: `attachSocket(httpServer)` creates `new (require('socket.io').Server)(httpServer, {cors: {origin: '*'}})`. On `connection`, read `socket.handshake.auth.token`, call `verifyToken`; if it returns `null`, `socket.disconnect()`; otherwise, if the payload has a `facility_id`, `socket.join(\`facility:${payload.facility_id}\`)`. Return the `io` instance.

- [ ] **Step 5: Modify `server/src/server.js`** to build an `http.Server` from `app`, call `attachSocket(httpServer)`, `app.set('io', io)`, and `httpServer.listen(...)` instead of `app.listen(...)`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx jest socket.test -v`
Expected: PASS, both tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/socket.js server/src/server.js server/package.json server/package-lock.json server/tests/socket.test.js
git commit -m "feat: add socket.io server with per-facility rooms"
```

---

### Task 2: Audit log and notification services

**Files:**
- Create: `server/src/services/auditService.js`
- Create: `server/src/services/notificationService.js`
- Test: `server/tests/auditService.test.js`
- Test: `server/tests/notificationService.test.js`

**Interfaces:**
- Consumes: `query` from `server/src/db.js`.
- Produces: `writeAudit(userId, action) => Promise<void>` from `auditService.js`. `notify(io, referral) => Promise<void>` and `sendSms(phoneNumber, message) => Promise<void>` from `notificationService.js`, where `referral` is a row shaped `{id, receiving_facility_id, ...}`. Task 3 and Task 4's routes call `writeAudit` after every successful action and `notify` after create/accept/decline/complete/cancel.

- [ ] **Step 1: Write the failing test** in `server/tests/auditService.test.js`:

```js
test('writeAudit inserts a row with the user id and action', async () => {
  await writeAudit(1, 'referral_created');
  const result = await query('SELECT * FROM audit_log WHERE user_id = 1 AND action = $1', ['referral_created']);
  expect(result.rows.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest auditService -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/services/auditService.js`**: `writeAudit(userId, action)` runs `INSERT INTO audit_log (user_id, action) VALUES ($1, $2)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest auditService -v`
Expected: PASS.

- [ ] **Step 5: Write the failing tests** in `server/tests/notificationService.test.js`, with a fake `io` exposing just enough of the socket.io surface to drive the branch:

```js
function fakeIo(roomHasMembers) {
  const emit = jest.fn();
  return {
    sockets: { adapter: { rooms: new Map(roomHasMembers ? [['facility:5', new Set(['x'])]] : []) } },
    to: jest.fn(() => ({ emit })),
    _emit: emit,
  };
}

test('notify emits in-app and logs an in_app notification when the room has a member', async () => {
  const io = fakeIo(true);
  const referral = { id: 1, receiving_facility_id: 5 };
  await notify(io, referral);
  expect(io.to).toHaveBeenCalledWith('facility:5');
  expect(io._emit).toHaveBeenCalledWith('referral', referral);
  const result = await query('SELECT * FROM notifications WHERE referral_id = 1 AND channel = $1', ['in_app']);
  expect(result.rows.length).toBeGreaterThan(0);
});

test('notify falls back to sendSms and logs an sms notification when the room is empty', async () => {
  const io = fakeIo(false);
  const referral = { id: 2, receiving_facility_id: 5 };
  await notify(io, referral);
  expect(io.to).not.toHaveBeenCalled();
  const result = await query('SELECT * FROM notifications WHERE referral_id = 2 AND channel = $1', ['sms']);
  expect(result.rows.length).toBeGreaterThan(0);
});
```

(This test needs a `referrals` row with `id` 1 and 2 to satisfy the `notifications.referral_id` foreign key: insert two minimal referral rows in a `beforeAll`, reusing the facility-seeding pattern from Phase 2's `facilities.routes.test.js`.)

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd server && npx jest notificationService -v`
Expected: FAIL, module not found.

- [ ] **Step 7: Implement `server/src/services/notificationService.js`**: `sendSms(phoneNumber, message)` logs `console.log` and resolves (the Phase 1 stub decision). `notify(io, referral)` checks `io.sockets.adapter.rooms.get(\`facility:${referral.receiving_facility_id}\`)?.size > 0`; if true, `io.to(room).emit('referral', referral)` then `INSERT INTO notifications (referral_id, channel) VALUES ($1, 'in_app')`; else call `sendSms` (with a placeholder message, no facility phone-number lookup needed for this stub) then `INSERT INTO notifications (referral_id, channel) VALUES ($1, 'sms')`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd server && npx jest notificationService -v`
Expected: PASS, both tests.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/auditService.js server/src/services/notificationService.js
git add server/tests/auditService.test.js server/tests/notificationService.test.js
git commit -m "feat: add audit log and notification services"
```

---

### Task 3: Create, list, and view referrals

**Files:**
- Create: `server/src/routes/referrals.js`
- Modify: `server/src/app.js` (mount at `/referrals`)
- Test: `server/tests/referrals.routes.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `asyncHandler`, `query` (Phase 1-2); `writeAudit` (Task 2); `notify` (Task 2).
- Produces: Express router exported from `referrals.js`, mounted at `/referrals`. `POST /referrals` → `201` referral row. `GET /referrals` → `200` array. `GET /referrals/:id` → `200` referral row, `403`/`404`. Task 4 extends this same router with `PATCH /:id`.

- [ ] **Step 1: Write the failing tests** in `server/tests/referrals.routes.test.js` (seed two facilities `facA`/`facB` and two users/tokens, one per facility, following the Phase 2 seeding pattern; set `app.set('io', fakeIo())` in `beforeAll` with a minimal fake `io` whose `to().emit()` and `sockets.adapter.rooms` don't throw):

```js
test('POST /referrals creates a pending referral and audits it', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'pending', referring_facility_id: facA, receiving_facility_id: facB });
});

test('POST /referrals to your own facility is rejected with 400', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facA, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('POST /referrals to a nonexistent facility is rejected with 400', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: 999999, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('GET /referrals lists referrals where the user\'s facility is referring or receiving', async () => {
  const res = await request(app).get('/referrals').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
});

test('GET /referrals/:id is visible to the receiving facility', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-2', condition: 'x', resource_required: 'bed' });
  const res = await request(app).get(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`);
  expect(res.status).toBe(200);
});

test('GET /referrals/:id is forbidden to an unrelated facility', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-3', condition: 'x', resource_required: 'bed' });
  const res = await request(app).get(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenC}`);
  expect(res.status).toBe(403);
});

test('GET /referrals/:id for a nonexistent referral returns 404', async () => {
  const res = await request(app).get('/referrals/999999').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(404);
});
```

(`tokenC` is issued for a third facility, `facC`, seeded alongside `facA`/`facB`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest referrals.routes -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/routes/referrals.js`.** `POST /` (behind `requireAuth`, `asyncHandler`): validate `req.user.facility_id` is set (else `400 {error: 'You must belong to a facility to create a referral'}`); validate `receiving_facility_id !== req.user.facility_id` (else `400 {error: 'Cannot refer to your own facility'}`); check the receiving facility exists (`SELECT id FROM facilities WHERE id = $1`, else `400 {error: 'Receiving facility not found'}`); validate `patient_ref`, `condition`, `resource_required` are non-empty strings (else `400`); `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id, receiving_facility_id, created_by) VALUES (...) RETURNING *`; call `writeAudit(req.user.id, 'referral_created')` and `notify(req.app.get('io'), referral)`; respond `201` with the row. `GET /` (behind `requireAuth`): if `req.user.facility_id` is null, respond `200 []`; else `SELECT * FROM referrals WHERE referring_facility_id = $1 OR receiving_facility_id = $1 ORDER BY created_at DESC`. `GET /:id` (behind `requireAuth`): look up the referral, `404` if missing; `403` if `req.user.facility_id` isn't the referring or receiving facility; else `200` with the row.

- [ ] **Step 4: Mount the router in `server/src/app.js`**: `app.use('/referrals', require('./routes/referrals'))`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest referrals.routes -v`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/referrals.js server/src/app.js server/tests/referrals.routes.test.js
git commit -m "feat: add referral creation, listing, and detail endpoints"
```

---

### Task 4: Accept, decline, complete, and cancel a referral

**Files:**
- Modify: `server/src/routes/referrals.js`
- Test: `server/tests/referrals.routes.test.js`

**Interfaces:**
- Consumes: the same router, `writeAudit`, `notify` as Task 3.
- Produces: `PATCH /referrals/:id` on the referrals router, body `{action: 'accept'|'decline'|'complete'|'cancel'}`, `200` with the updated row. No later task in this plan consumes this beyond the route itself.

- [ ] **Step 1: Write the failing tests**, appended to `server/tests/referrals.routes.test.js` (create a fresh pending referral in each test's own `beforeEach`-style setup, or inline per test, from `facA` to `facB`):

```js
test('PATCH /referrals/:id accept by the receiving facility succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-4', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('accepted');
});

test('PATCH /referrals/:id accept by the referring facility is rejected with 403', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-5', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'accept' });
  expect(res.status).toBe(403);
});

test('PATCH /referrals/:id accepting an already-accepted referral is rejected with 409', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-6', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  expect(res.status).toBe(409);
});

test('PATCH /referrals/:id complete by the referring facility is rejected with 403', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-7', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'complete' });
  expect(res.status).toBe(403);
});

test('PATCH /referrals/:id complete by the receiving facility after accept succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-8', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'complete' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('completed');
});

test('PATCH /referrals/:id cancel by the referring facility before acceptance succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-9', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'cancel' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('cancelled');
});

test('PATCH /referrals/:id with an invalid action is rejected with 400', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-10', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'teleport' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest referrals.routes -v`
Expected: FAIL, 404 (no PATCH route) on all seven new tests.

- [ ] **Step 3: Implement `PATCH /:id`** on the referrals router, behind `requireAuth`, wrapped in `asyncHandler`. Look up the referral, `404` if missing. Validate `action` is one of `'accept' | 'decline' | 'complete' | 'cancel'`, else `400`. For `accept`/`decline`: require `req.user.facility_id === referral.receiving_facility_id` (else `403`) and `referral.status === 'pending'` (else `409`); update status to `'accepted'`/`'declined'`. For `complete`: require `req.user.facility_id === referral.receiving_facility_id` (else `403`, this is business rule 6.7) and `referral.status === 'accepted'` (else `409`); update status to `'completed'`. For `cancel`: require `req.user.facility_id === referral.referring_facility_id` (else `403`) and `referral.status === 'pending'` (else `409`); update status to `'cancelled'`. On success, `UPDATE referrals SET status = $1 WHERE id = $2 RETURNING *`, `writeAudit(req.user.id, \`referral_${action}ed\`)` (e.g. `referral_accepted`, note `cancel` → `referral_cancelled` needs the irregular form handled explicitly, not string-concatenated), `notify(req.app.get('io'), updatedReferral)`, respond `200` with the row.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest referrals.routes -v`
Expected: PASS, all 14 tests in the file.

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && npx jest`
Expected: PASS, all tests (no regressions in Phases 1-2).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/referrals.js server/tests/referrals.routes.test.js
git commit -m "feat: add referral accept, decline, complete, and cancel actions"
```

---

### Task 5: Frontend referrals API client and SocketContext

**Files:**
- Create: `client/src/api/referrals.js`
- Create: `client/src/context/SocketContext.jsx`
- Modify: `client/package.json` (add `socket.io-client`)
- Modify: `client/vite.config.js` (proxy `/socket.io` with `ws: true`)
- Modify: `client/src/App.jsx` (wrap the routed tree in `SocketProvider`)

**Interfaces:**
- Consumes: the `authHeaders()` pattern from `client/src/api/facilities.js` (Phase 2); `useAuth` from `AuthContext` (Phase 1).
- Produces: `createReferral(body)`, `getReferrals()`, `getReferral(id)`, `respondToReferral(id, action)` exported from `client/src/api/referrals.js`, same fetch-and-throw pattern as `facilities.js`. `SocketProvider`/`useSocket()` exported from `SocketContext.jsx`, where `useSocket()` returns `{lastReferralEvent}`: the most recent payload received on the `'referral'` socket event, or `null` before the first one. Task 6 and 7 consume all of these by these exact names.

- [ ] **Step 1: Add `socket.io-client` to `client/package.json` dependencies**, then `npm install`.

- [ ] **Step 2: Add a `/socket.io` proxy entry to `client/vite.config.js`'s existing `server.proxy` block**, alongside the `/api` entry, targeting `http://localhost:4000` with `ws: true`.

- [ ] **Step 3: Implement `client/src/api/referrals.js`** following `facilities.js`'s pattern exactly: a shared `handle(res)` helper, `createReferral(body)` (`POST /api/referrals`), `getReferrals()` (`GET /api/referrals`), `getReferral(id)` (`GET /api/referrals/${id}`), `respondToReferral(id, action)` (`PATCH /api/referrals/${id}`, body `{action}`), each including `authHeaders()`.

- [ ] **Step 4: Implement `client/src/context/SocketContext.jsx`.** `SocketProvider` reads `useAuth()`'s `token`; when present, connects `io('/', {auth: {token}, path: '/socket.io'})` (matching the proxy's default path) in a `useEffect`, listens for `'referral'`, stores the payload in state as `lastReferralEvent`, and disconnects on cleanup or when `token` becomes falsy. Exports `useSocket()` via `useContext`.

- [ ] **Step 5: Wire `SocketProvider` into `client/src/App.jsx`**, nested inside `AuthProvider` (it needs the token) and wrapping the `Routes` tree.

- [ ] **Step 6: Manual smoke check** (no automated test for this task: it's wiring, proven end-to-end by Task 6/7's UI tests and the plan's final manual verification): run both dev servers, log in, and confirm in the browser console / Network tab that a `socket.io` websocket connection opens without errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/referrals.js client/src/context/SocketContext.jsx client/package.json client/package-lock.json client/vite.config.js client/src/App.jsx
git commit -m "feat: add referrals api client and socket.io context"
```

---

### Task 6: Create a referral from the Dashboard's network view

**Files:**
- Create: `client/src/pages/ReferralForm.jsx`
- Modify: `client/src/pages/Dashboard.jsx` ("Refer patient here" link per facility, excluding the user's own)
- Modify: `client/src/App.jsx` (route `/referrals/new/:facilityId`)
- Test: `client/tests/ReferralForm.test.jsx`

**Interfaces:**
- Consumes: `createReferral` from `client/src/api/referrals.js` (Task 5).
- Produces: `ReferralForm` default export from `client/src/pages/ReferralForm.jsx`. Nothing else in this plan consumes it beyond the route.

- [ ] **Step 1: Write the failing test** in `client/tests/ReferralForm.test.jsx`, rendering with a router param for `facilityId` (via `MemoryRouter initialEntries={['/referrals/new/2']}` and a matching `<Route path="/referrals/new/:facilityId" element={<ReferralForm />} />`):

```jsx
test('submitting the form calls createReferral with the chosen facility and navigates to the referrals list', async () => {
  createReferral.mockResolvedValue({ id: 1 });
  renderForm();
  await userEvent.type(screen.getByLabelText(/patient/i), 'P-1');
  await userEvent.type(screen.getByLabelText(/condition/i), 'fracture');
  await userEvent.type(screen.getByLabelText(/resource/i), 'bed');
  await userEvent.click(screen.getByRole('button', { name: /send referral/i }));
  expect(createReferral).toHaveBeenCalledWith({
    receiving_facility_id: 2, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed',
  });
  expect(await screen.findByText(/referrals/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run ReferralForm`
Expected: FAIL, `ReferralForm` not found.

- [ ] **Step 3: Implement `client/src/pages/ReferralForm.jsx`.** Reads `facilityId` via `useParams()`. A form with labeled `patient` (`patient_ref`), `condition`, and `resource` (`resource_required`) text inputs and a "Send referral" submit button. On submit, calls `createReferral({receiving_facility_id: Number(facilityId), patient_ref, condition, resource_required})`; on success, `navigate('/referrals')`; on failure, show the error message (same pattern as `Login.jsx`).

- [ ] **Step 4: Add a `/referrals/new/:facilityId` route in `client/src/App.jsx`**, behind `RequireUser`.

- [ ] **Step 5: Modify `Dashboard.jsx`** to render a link (`<Link to={\`/referrals/new/${f.id}\`}>Refer patient here</Link>`) next to each facility in the facility list, except the user's own facility.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run ReferralForm`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ReferralForm.jsx client/src/pages/Dashboard.jsx client/src/App.jsx client/tests/ReferralForm.test.jsx
git commit -m "feat: add referral creation form linked from the dashboard"
```

---

### Task 7: Referrals list and actions, live-updated

**Files:**
- Create: `client/src/pages/Referrals.jsx`
- Create: `client/src/components/ReferralStatusBadge.jsx`
- Modify: `client/src/App.jsx` (route `/referrals`, a nav link to it)
- Test: `client/tests/Referrals.test.jsx`

**Interfaces:**
- Consumes: `getReferrals`, `respondToReferral` from `client/src/api/referrals.js` (Task 5); `useSocket` from `SocketContext.jsx` (Task 5); `useAuth` for `user.facility_id`.
- Produces: `Referrals` default export from `client/src/pages/Referrals.jsx`. Last task in this plan.

- [ ] **Step 1: Write the failing tests** in `client/tests/Referrals.test.jsx`, mocking `../src/api/referrals` and `../src/context/SocketContext`:

```jsx
test('lists referrals with their status', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('P-1')).toBeInTheDocument();
  expect(screen.getByText('pending')).toBeInTheDocument();
});

test('a receiving-facility user sees accept/decline buttons on a pending referral', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
});

test('clicking accept calls respondToReferral and refreshes the list', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  respondToReferral.mockResolvedValue({ id: 1, status: 'accepted' });
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  await userEvent.click(screen.getByRole('button', { name: /accept/i }));
  expect(respondToReferral).toHaveBeenCalledWith(1, 'accept');
});

test('a referring-facility user sees no accept/decline buttons', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
});

test('a new socket referral event triggers a list refresh', async () => {
  getReferrals.mockResolvedValueOnce([]).mockResolvedValueOnce([
    { id: 2, patient_ref: 'P-2', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  useSocket.mockReturnValue({ lastReferralEvent: { id: 2, receiving_facility_id: 2 } });
  renderWithAuth({ facility_id: 2 });
  expect(await screen.findByText('P-2')).toBeInTheDocument();
});
```

(`renderWithAuth(user)` follows the same local helper pattern as `Dashboard.test.jsx`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run Referrals`
Expected: FAIL, `Referrals` not found.

- [ ] **Step 3: Implement `client/src/components/ReferralStatusBadge.jsx`**: takes `{status}`, renders `<span>{status}</span>` (minimal, matches `StaleFlag`'s plainness).

- [ ] **Step 4: Implement `client/src/pages/Referrals.jsx`.** On mount and whenever `lastReferralEvent` (from `useSocket()`) changes, call `getReferrals()` and store the list. For each referral, render `patient_ref`, a `ReferralStatusBadge`, and, only when `status === 'pending'` and `user.facility_id === referral.receiving_facility_id`, "Accept" and "Decline" buttons calling `respondToReferral(referral.id, 'accept'|'decline')` then re-fetching the list.

- [ ] **Step 5: Add a `/referrals` route in `client/src/App.jsx`**, behind `RequireUser`, plus a simple nav link to it from the Dashboard (a `<Link to="/referrals">Referrals</Link>` near the top).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx vitest run Referrals`
Expected: PASS, all 5 tests.

- [ ] **Step 7: Run the full frontend suite**

Run: `cd client && npx vitest run`
Expected: PASS, all tests (no regressions in Phases 1-2).

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Referrals.jsx client/src/components/ReferralStatusBadge.jsx client/src/App.jsx client/tests/Referrals.test.jsx
git commit -m "feat: add referrals list with live updates and accept/decline actions"
```

---

## End of Phase 3

At this point: a nurse can pick a facility from the Dashboard's network view, send it a referral, and the receiving facility sees it appear live (or gets a logged SMS-stub fallback if no one's connected) and can accept, decline, or later mark it complete; the referring facility can cancel before acceptance. Phase 4 (district-level reporting, FR 5; Kinyarwanda, FR 6) builds on this same `referrals`/`audit_log` data and gets its own plan document.
