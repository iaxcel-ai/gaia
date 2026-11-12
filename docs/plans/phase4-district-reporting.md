# Gaia Phase 4: District Reporting and Staff Accounts Implementation Plan

**Goal:** Let a district admin see aggregate reports on referral patterns and recurring resource gaps for their district, and create facility staff accounts with a role (SRS reporting and staff account creation requirements).

**Architecture:** Two new Express routers reusing `requireAuth`, `requireRole('district_admin')`, `asyncHandler` and `query`. `GET /reports/district/:id` runs a few aggregate SQL queries and returns one JSON object. `POST /admin/users` hashes a password with the existing `hashPassword` and inserts a user. Two new frontend pages, `DistrictReports` and `AdminUsers`, shown only to `district_admin`. No schema change: counts only, no per-transition timing.

**Tech Stack:** Same as Phases 1-3. No new dependencies.

**Spec:** `docs/design-spec.md` (API table rows for `/reports/district/:id` and `/admin/users`); SRS reporting and staff account creation requirements in `docs/SRS.pdf`.

This is phase 4 of 4. Kinyarwanda translation is out of scope (reported as a project bottleneck). Visual styling stays deferred.

## Global Constraints

- Both routes are `district_admin` only. Other roles get 403.
- A district admin may only read reports for the district their own facility belongs to. Any other district id gets 403.
- Report contents (counts only):
  - Referral totals: total and count per status, for referrals where the referring or receiving facility is in the district.
  - Top referring facilities and top receiving facilities in the district, by referral count, highest first.
  - Recurring resource gaps: per facility and resource type, the number of `resource_status` rows with `quantity = 0` in the last 30 days. Only pairs with 2 or more are listed ("recurring"), highest first.
- Reports never include `patient_ref` or `condition` (patient-identifying data stays out of aggregates).
- `POST /admin/users` body: `{username, password, role, facility_id}`. Role must be `chw` or `nurse` (creating another `district_admin` is not allowed here). `facility_id` must exist (400 otherwise) and be in the admin's own district (403 otherwise). The username is trimmed before it is stored. Duplicate username returns 409. The password hash is never returned.
- No ORM, raw parameterized SQL, minimal layering. Each new admin action writes one `audit_log` row.

## Review Focus

- An admin requesting another district's report must get 403, and a nonexistent or non-numeric district id must get 404, not a crash.
- Nurses and CHWs must get 403 on both routes.
- A district with no referrals or no gaps must return zeros and empty lists, not an error or nulls.
- A referral between a facility in the district and one outside it must be counted once, not twice.
- `POST /admin/users` must reject an unknown `facility_id` with 400 (not a foreign-key crash), a `district_admin` role with 400, and a duplicate username with 409.
- The response of `POST /admin/users` must not contain `password_hash`.

---

## File Structure

```
server/
├── src/
│   ├── app.js                          (modify) mount /reports and /admin
│   └── routes/
│       ├── reports.js                  (new) GET /reports/district/:id
│       └── admin.js                    (new) POST /admin/users
└── tests/
    ├── reports.routes.test.js          (new)
    └── admin.routes.test.js            (new)

client/src/
├── api/reports.js                      (new) getDistrictReport
├── api/admin.js                        (new) createUser
├── pages/DistrictReports.jsx           (new)
├── pages/AdminUsers.jsx                (new)
└── App.jsx                             (modify) routes and links for district_admin
```

## Tasks

Each task is test-first: write the failing test, make it pass, commit.

1. **`POST /admin/users`:** tests for happy path, 403 for non-admin, 400 bad role / unknown facility / missing fields, 409 duplicate, no hash in response. Then the route, then audit row.
2. **`GET /reports/district/:id`, access rules:** tests for 403 (non-admin, other district), 404 (bad id). Then the route skeleton with the access checks.
3. **Report queries:** tests with seeded referrals and resource rows for status counts, top facilities, recurring gaps (threshold of 2, 30-day window), empty district, cross-district referral counted once. Then the SQL.
4. **Frontend API modules** and **`AdminUsers` page:** form (username, password, role, facility select), success and error messages. Component test.
5. **`DistrictReports` page:** fetch on load, render totals, two ranked lists, gaps table, empty states. Component test.
6. **Wiring:** links visible only to `district_admin`, README status update.
7. **Independent review**, fix pass, re-verify.

## Self-Review

- Counts-only scope means no migration, so the risk is confined to SQL correctness; the Review Focus items map to tests in Task 3.
- "Recurring" is defined as 2 or more zero-quantity updates in 30 days. This is a pilot-scale heuristic and easy to change in one constant.
