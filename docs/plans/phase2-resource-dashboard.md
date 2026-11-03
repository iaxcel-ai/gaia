# Gaia Phase 2: Resource Dashboard Implementation Plan

**Goal:** Let facility staff see real-time bed/specialist/supply availability across facilities (FR 1) and keep their own facility's status current, with stale data flagged automatically (FR 4), end to end from the database through the browser dashboard.

**Architecture:** A new `facilities` Express route (GET list, GET status, PUT status) backed by the existing `resource_status` table from Phase 1, reusing `requireAuth`/`asyncHandler`. The frontend gets a real `Dashboard` page (replacing the Phase 1 placeholder) with two views: the logged-in user's own facility (editable) and a network view of other facilities (read-only), matching SRS 3.1.

**Tech Stack:** Same as Phase 1 (Express, PostgreSQL via `pg`, React + Vite). No new dependencies.

**Spec:** `docs/design-spec.md` (Data model, API, Frontend structure sections); business rule 6.7 and FR 4.2 in `docs/SRS.pdf`.

## Global Constraints

- Resource `type` is a closed set: `'bed' | 'specialist' | 'supply'` (matches the Phase 1 migration's CHECK constraint).
- `resource_status` is append-only: an update inserts a new row, it never overwrites one (design-spec Data model, DB 4). "Current" value = latest row per `(facility_id, type)`.
- Staleness is computed at read time from `updated_at`, not stored (design-spec, FR 4.2). Threshold: 2 hours, matching the design-spec's own example value.
- Only staff registered to a facility may update that facility's resource status (SRS business rule 6.7) — enforced by comparing `req.user.facility_id` to the route's `:id`, regardless of role.
- Viewing status (GET) has no facility restriction — any authenticated user can view any facility's status (FR 1: "view... at nearby facilities").
- No ORM, raw parameterized SQL, minimal layering (carried over from Phase 1's code-style decision).
- Reuse `requireAuth` and `asyncHandler` from Phase 1 rather than duplicating error handling.

## Review Focus

- Updating with a non-integer or negative quantity must be rejected with 400, not stored (data integrity).
- Updating with a `type` outside the closed set must be rejected with 400, not surfaced as a raw 500 from the database's CHECK constraint.
- A user updating a facility other than their own must get 403, not succeed (business rule 6.7 — the core security property of this feature).
- Requesting status for a facility id that doesn't exist must return 404, not an empty-looking 200 or a crash.
- A resource type that has never been reported for a facility must render as "no data" on the dashboard, not crash or show a stale badge on data that doesn't exist.

---

## File Structure

```
server/
├── src/
│   ├── routes/
│   │   └── facilities.js          (new) GET /facilities, GET /:id/status, PUT /:id/status
│   └── app.js                     (modify) mount facilities router
└── tests/
    └── facilities.routes.test.js  (new)

client/
├── src/
│   ├── api/
│   │   └── facilities.js          (new) getFacilities, getFacilityStatus, updateFacilityStatus
│   ├── components/
│   │   ├── ResourceCard.jsx       (new) one resource type's quantity + stale badge
│   │   └── StaleFlag.jsx          (new) small "Stale" badge
│   ├── pages/
│   │   └── Dashboard.jsx          (new) replaces the Phase 1 inline placeholder
│   └── App.jsx                    (modify) import Dashboard from pages/Dashboard.jsx
└── tests/
    ├── ResourceCard.test.jsx      (new)
    └── Dashboard.test.jsx         (new)
```

---

### Task 1: Read endpoints — list facilities and facility status with stale flag

**Files:**
- Create: `server/src/routes/facilities.js`
- Modify: `server/src/app.js` (mount at `/facilities`)
- Test: `server/tests/facilities.routes.test.js`

**Interfaces:**
- Consumes: `query` from `server/src/db.js`, `requireAuth` from `server/src/middleware/requireAuth.js`, `asyncHandler` from `server/src/middleware/asyncHandler.js`.
- Produces: Express router exported from `facilities.js`, mounted at `/facilities`. `GET /facilities` → `200 [{id, name, tier, district_id}, ...]`. `GET /facilities/:id/status` → `200 {facility_id, status: [{type, quantity, updated_at, stale}, ...]}` on an existing facility, `404 {error: 'Facility not found'}` otherwise. Task 2 mounts `PUT /facilities/:id/status` on this same router.

- [ ] **Step 1: Write the failing tests** in `server/tests/facilities.routes.test.js` (seed two facilities and some `resource_status` rows in `beforeAll`, matching Phase 1's seeding pattern — one facility `facA` with a fresh `bed` row and a `specialist` row inserted with `updated_at` 3 hours in the past via a direct `query` call, one facility `facB` with no status rows):

```js
test('GET /facilities lists all facilities', async () => {
  const res = await request(app).get('/facilities').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.some((f) => f.id === facA)).toBe(true);
});

test('GET /facilities requires auth', async () => {
  const res = await request(app).get('/facilities');
  expect(res.status).toBe(401);
});

test('GET /facilities/:id/status returns current status with a stale flag on old data', async () => {
  const res = await request(app).get(`/facilities/${facA}/status`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.facility_id).toBe(facA);
  const bed = res.body.status.find((s) => s.type === 'bed');
  const specialist = res.body.status.find((s) => s.type === 'specialist');
  expect(bed.stale).toBe(false);
  expect(specialist.stale).toBe(true);
});

test('GET /facilities/:id/status for a facility with no reported status returns an empty status list', async () => {
  const res = await request(app).get(`/facilities/${facB}/status`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toEqual([]);
});

test('GET /facilities/:id/status for a nonexistent facility returns 404', async () => {
  const res = await request(app).get('/facilities/999999/status').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest facilities.routes -v`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/src/routes/facilities.js`.** `GET /facilities` (behind `requireAuth`): `SELECT id, name, tier, district_id FROM facilities ORDER BY id`, respond `200` with the rows. `GET /facilities/:id/status` (behind `requireAuth`): first check the facility exists (`SELECT id FROM facilities WHERE id = $1`), `404` if not; then `SELECT DISTINCT ON (type) type, quantity, updated_at FROM resource_status WHERE facility_id = $1 ORDER BY type, updated_at DESC` to get the latest row per type, map each to `{type, quantity, updated_at, stale: (Date.now() - new Date(updated_at).getTime()) > STALE_THRESHOLD_MS}`, respond `200 {facility_id: Number(id), status}`. Define `const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;` at the top of the file.

- [ ] **Step 4: Mount the router in `server/src/app.js`**: `app.use('/facilities', require('./routes/facilities'))`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest facilities.routes -v`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/facilities.js server/src/app.js server/tests/facilities.routes.test.js
git commit -m "feat: add facility list and status read endpoints"
```

---

### Task 2: Write endpoint — update own facility's resource status

**Files:**
- Modify: `server/src/routes/facilities.js`
- Test: `server/tests/facilities.routes.test.js`

**Interfaces:**
- Consumes: the same router and helpers as Task 1.
- Produces: `PUT /facilities/:id/status` on the facilities router, body `{type, quantity}`, `201 {type, quantity, updated_at, stale: false}` on success. Later phases (the Dashboard's update form in Task 5) call this route directly; no shared helper is produced beyond the route itself.

- [ ] **Step 1: Write the failing tests**, appended to `server/tests/facilities.routes.test.js` (issue a token for a user whose `facility_id` is `facA`, and a second token for a user whose `facility_id` is `facB`, to exercise the ownership check):

```js
test('PUT /facilities/:id/status by the facility\'s own staff inserts a new status row', async () => {
  const res = await request(app).put(`/facilities/${facA}/status`)
    .set('Authorization', `Bearer ${ownToken}`)
    .send({ type: 'supply', quantity: 10 });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ type: 'supply', quantity: 10, stale: false });
});

test('PUT /facilities/:id/status by staff from a different facility is rejected with 403', async () => {
  const res = await request(app).put(`/facilities/${facA}/status`)
    .set('Authorization', `Bearer ${otherFacilityToken}`)
    .send({ type: 'supply', quantity: 10 });
  expect(res.status).toBe(403);
});

test('PUT /facilities/:id/status with a negative quantity is rejected with 400', async () => {
  const res = await request(app).put(`/facilities/${facA}/status`)
    .set('Authorization', `Bearer ${ownToken}`)
    .send({ type: 'bed', quantity: -1 });
  expect(res.status).toBe(400);
});

test('PUT /facilities/:id/status with an invalid type is rejected with 400', async () => {
  const res = await request(app).put(`/facilities/${facA}/status`)
    .set('Authorization', `Bearer ${ownToken}`)
    .send({ type: 'ambulance', quantity: 1 });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest facilities.routes -v`
Expected: FAIL, 404 (route not found) on all four new tests.

- [ ] **Step 3: Implement `PUT /:id/status`** on the facilities router, behind `requireAuth`, wrapped in `asyncHandler`. Validate `type` is one of `'bed' | 'specialist' | 'supply'` and `quantity` is `Number.isInteger(quantity) && quantity >= 0`; `400 {error: 'Invalid type or quantity'}` otherwise. Then check `req.user.facility_id === Number(req.params.id)`; `403 {error: 'Forbidden'}` otherwise. On success, `INSERT INTO resource_status (facility_id, type, quantity) VALUES ($1, $2, $3) RETURNING type, quantity, updated_at`, respond `201` with the returned row plus `stale: false`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest facilities.routes -v`
Expected: PASS, all 9 tests in the file.

- [ ] **Step 5: Run the full backend suite**

Run: `cd server && npx jest`
Expected: PASS, all tests (no regressions in Phase 1's auth tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/facilities.js server/tests/facilities.routes.test.js
git commit -m "feat: add resource status update endpoint"
```

---

### Task 3: Frontend facilities API client and ResourceCard component

**Files:**
- Create: `client/src/api/facilities.js`
- Create: `client/src/components/StaleFlag.jsx`
- Create: `client/src/components/ResourceCard.jsx`
- Test: `client/tests/ResourceCard.test.jsx`

**Interfaces:**
- Produces: `getFacilities() => Promise<Array>`, `getFacilityStatus(id) => Promise<{facility_id, status}>`, `updateFacilityStatus(id, type, quantity) => Promise<object>`, all exported from `client/src/api/facilities.js`, following the same fetch-and-throw-on-error pattern as Phase 1's `client/src/api/auth.js`. `<ResourceCard type quantity stale />` exported from `client/src/components/ResourceCard.jsx`. Task 4 and Task 5 (the Dashboard page) consume all of these by these exact names.

- [ ] **Step 1: Implement `client/src/api/facilities.js`** with the three functions above, each `fetch`-ing `/api/facilities...` (matching the Vite proxy from Phase 1), parsing the JSON body, and throwing `new Error(body.error)` on a non-OK response — same shape as `client/src/api/auth.js`'s `login`. `updateFacilityStatus` issues a `PUT` with a JSON body `{type, quantity}`.

- [ ] **Step 2: Write the failing test** in `client/tests/ResourceCard.test.jsx`:

```jsx
test('renders the resource type and quantity', () => {
  render(<ResourceCard type="bed" quantity={5} stale={false} />);
  expect(screen.getByText(/bed/i)).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
});

test('shows a stale badge when stale is true', () => {
  render(<ResourceCard type="specialist" quantity={2} stale={true} />);
  expect(screen.getByText(/stale/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run ResourceCard`
Expected: FAIL, component not found.

- [ ] **Step 4: Implement `client/src/components/StaleFlag.jsx`**: a component taking no props beyond being conditionally rendered by its caller, rendering `<span>Stale</span>` (styling left minimal, this is a course-project dashboard not a design exercise).

- [ ] **Step 5: Implement `client/src/components/ResourceCard.jsx`**: takes props `{type, quantity, stale}`, renders the type name, the quantity, and `<StaleFlag />` only when `stale` is true.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run ResourceCard`
Expected: PASS, both tests.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/facilities.js client/src/components/StaleFlag.jsx client/src/components/ResourceCard.jsx client/tests/ResourceCard.test.jsx
git commit -m "feat: add facilities api client and resource card component"
```

---

### Task 4: Dashboard page — view own facility and browse the network (read-only)

**Files:**
- Create: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/App.jsx` (use the real `Dashboard` instead of the inline placeholder)
- Test: `client/tests/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `getFacilities`, `getFacilityStatus` from `client/src/api/facilities.js` (Task 3); `ResourceCard` (Task 3); `useAuth` from `client/src/context/AuthContext.jsx` (Phase 1) for `user.facility_id`.
- Produces: `Dashboard` default export from `client/src/pages/Dashboard.jsx`. Task 5 extends this same file with the editable update form; no other task consumes `Dashboard`'s internals.

- [ ] **Step 1: Write the failing tests** in `client/tests/Dashboard.test.jsx`, mocking `client/src/api/facilities.js` with `vi.mock`:

```jsx
test('on load, shows the user\'s own facility status', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('5')).toBeInTheDocument();
});

test('selecting another facility from the network list shows its status read-only', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockImplementation((id) =>
    Promise.resolve(id === 2
      ? { facility_id: 2, status: [{ type: 'supply', quantity: 9, stale: false }] }
      : { facility_id: 1, status: [] })
  );
  renderWithAuth({ facility_id: 1 });
  await userEvent.selectOptions(await screen.findByLabelText(/facility/i), 'Other Facility');
  expect(await screen.findByText('9')).toBeInTheDocument();
});
```

(`renderWithAuth(user)` is a small local test helper that renders `<AuthContext.Provider value={{user}}><Dashboard /></AuthContext.Provider>`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run Dashboard`
Expected: FAIL, `Dashboard` not found.

- [ ] **Step 3: Implement `client/src/pages/Dashboard.jsx`.** On mount, call `getFacilities()` and store the list; also call `getFacilityStatus(user.facility_id)` and store as `status`, with `selectedFacilityId` state initialized to `user.facility_id`. Render a `<select>` labeled "Facility" (`<label htmlFor="facility-select">Facility</label>`) listing every facility by name; on change, update `selectedFacilityId` and re-fetch its status via `getFacilityStatus`. Render one `<ResourceCard>` per entry in `status`.

- [ ] **Step 4: Wire `Dashboard` into `client/src/App.jsx`**, importing it from `./pages/Dashboard` and replacing the inline placeholder function.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run Dashboard`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Dashboard.jsx client/src/App.jsx client/tests/Dashboard.test.jsx
git commit -m "feat: add dashboard page with facility and network views"
```

---

### Task 5: Dashboard page — editable update form for the user's own facility

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`
- Test: `client/tests/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `updateFacilityStatus` from `client/src/api/facilities.js` (Task 3).
- Produces: nothing new for later tasks; this is the last Phase 2 task.

- [ ] **Step 1: Write the failing test**, appended to `client/tests/Dashboard.test.jsx`:

```jsx
test('when viewing the own facility, submitting a status update calls updateFacilityStatus and refreshes the view', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  updateFacilityStatus.mockResolvedValue({ type: 'bed', quantity: 7, stale: false });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('5');
  await userEvent.selectOptions(screen.getByLabelText(/type/i), 'bed');
  await userEvent.clear(screen.getByLabelText(/quantity/i));
  await userEvent.type(screen.getByLabelText(/quantity/i), '7');
  await userEvent.click(screen.getByRole('button', { name: /update/i }));
  expect(updateFacilityStatus).toHaveBeenCalledWith(1, 'bed', 7);
});

test('the update form is not shown when viewing another facility', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 2, status: [] });
  renderWithAuth({ facility_id: 1 });
  await userEvent.selectOptions(await screen.findByLabelText(/facility/i), 'Other Facility');
  expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run Dashboard`
Expected: FAIL, no update form present.

- [ ] **Step 3: Extend `Dashboard.jsx`** to render an update form only when `selectedFacilityId === user.facility_id`: a `<select>` labeled "Type" (`bed`/`specialist`/`supply` options) and a `<input type="number">` labeled "Quantity", plus an "Update" submit button. On submit, call `updateFacilityStatus(selectedFacilityId, type, Number(quantity))`, then re-fetch and re-render the facility's status via `getFacilityStatus`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run Dashboard`
Expected: PASS, all 4 tests in the file.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd client && npx vitest run`
Expected: PASS, all tests (no regressions in Phase 1's Login tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Dashboard.jsx client/tests/Dashboard.test.jsx
git commit -m "feat: add editable resource status update form"
```

---

## End of Phase 2

At this point: a logged-in user lands on `/dashboard`, sees their own facility's resource status (with stale badges where relevant), can update it, and can switch to any other facility in the network to view its status read-only. Phase 3 (referral workflow, Socket.IO, SMS stub) builds on this same facilities data and gets its own plan document.
