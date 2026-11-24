const { query, closePool } = require('../src/db');
const { verifyPassword } = require('../src/services/authService');
const { seedDemo, DEMO_FACILITY_NAMES, DEMO_ACCOUNTS } = require('../scripts/seed-demo');

const PASSWORD = 'demo-test-pass';

// The demo data hangs off the Gasabo facilities, which the main seed creates.
// The test database does not have them, so make sure they exist.
beforeAll(async () => {
  process.env.DEMO_PASSWORD = PASSWORD;
  let district = await query(`SELECT id FROM districts WHERE name = 'Gasabo' ORDER BY id LIMIT 1`);
  if (district.rows.length === 0) {
    district = await query(`INSERT INTO districts (name) VALUES ('Gasabo') RETURNING id`);
  }
  for (const name of DEMO_FACILITY_NAMES) {
    await query(
      `INSERT INTO facilities (district_id, name, tier)
       SELECT $1, $2, 'health_center'
       WHERE NOT EXISTS (SELECT 1 FROM facilities WHERE district_id = $1 AND name = $2)`,
      [district.rows[0].id, name]
    );
  }
});

afterAll(() => closePool());

async function counts() {
  const demoUsers = DEMO_ACCOUNTS.map((a) => a.username);
  const users = await query('SELECT COUNT(*)::int AS n FROM users WHERE username = ANY($1)', [demoUsers]);
  const referrals = await query(
    `SELECT COUNT(*)::int AS n FROM referrals r JOIN users u ON u.id = r.created_by WHERE u.username = ANY($1)`,
    [demoUsers]
  );
  const resources = await query(
    `SELECT COUNT(*)::int AS n FROM resource_status rs
     JOIN facilities f ON f.id = rs.facility_id
     JOIN districts d ON d.id = f.district_id
     WHERE d.name = 'Gasabo' AND f.name = ANY($1)`,
    [DEMO_FACILITY_NAMES]
  );
  return { users: users.rows[0].n, referrals: referrals.rows[0].n, resources: resources.rows[0].n };
}

test('creates the demo accounts, each at its own facility, and they can log in', async () => {
  await seedDemo();
  const result = await query(
    `SELECT u.username, u.role, u.password_hash, u.active, f.name AS facility
     FROM users u JOIN facilities f ON f.id = u.facility_id
     WHERE u.username = ANY($1)`,
    [DEMO_ACCOUNTS.map((a) => a.username)]
  );
  expect(result.rows).toHaveLength(DEMO_ACCOUNTS.length);
  for (const row of result.rows) {
    const expected = DEMO_ACCOUNTS.find((a) => a.username === row.username);
    expect(row.role).toBe(expected.role);
    expect(row.facility).toBe(expected.facility);
    expect(row.active).toBe(true);
    expect(await verifyPassword(PASSWORD, row.password_hash)).toBe(true);
  }
});

test('creates referrals in several states, including declines with a reason and one waiting for King Faisal', async () => {
  await seedDemo();
  const statuses = await query(
    `SELECT r.status, COUNT(*)::int AS n FROM referrals r JOIN users u ON u.id = r.created_by
     WHERE u.username = ANY($1) GROUP BY r.status`,
    [DEMO_ACCOUNTS.map((a) => a.username)]
  );
  const byStatus = Object.fromEntries(statuses.rows.map((r) => [r.status, r.n]));
  for (const status of ['pending', 'accepted', 'completed', 'declined', 'cancelled']) {
    expect(byStatus[status]).toBeGreaterThan(0);
  }

  const declined = await query(
    `SELECT r.decline_reason FROM referrals r JOIN users u ON u.id = r.created_by
     WHERE u.username = ANY($1) AND r.status = 'declined'`,
    [DEMO_ACCOUNTS.map((a) => a.username)]
  );
  expect(declined.rows.every((r) => r.decline_reason !== null)).toBe(true);

  const incoming = await query(
    `SELECT COUNT(*)::int AS n FROM referrals r
     JOIN facilities f ON f.id = r.receiving_facility_id
     WHERE f.name = 'King Faisal Hospital' AND r.status = 'pending'`
  );
  expect(incoming.rows[0].n).toBeGreaterThan(0);
});

test('running it again adds no accounts or referrals, only fresh resource counts', async () => {
  await seedDemo();
  const before = await counts();
  await seedDemo();
  const after = await counts();
  expect(after.users).toBe(before.users);
  expect(after.referrals).toBe(before.referrals);
  expect(after.resources).toBeGreaterThan(before.resources);
});

test('each demo facility has a current count for beds, specialists and supplies', async () => {
  await seedDemo();
  const result = await query(
    `SELECT f.name, COUNT(DISTINCT rs.type)::int AS types
     FROM facilities f
     JOIN districts d ON d.id = f.district_id
     JOIN resource_status rs ON rs.facility_id = f.id AND rs.updated_at > now() - interval '1 hour'
     WHERE d.name = 'Gasabo' AND f.name = ANY($1)
     GROUP BY f.name`,
    [['Kacyiru District Hospital', 'King Faisal Hospital', 'Remera Health Center']]
  );
  expect(result.rows).toHaveLength(3);
  expect(result.rows.every((r) => r.types === 3)).toBe(true);
});

test('the demo gaps and one stale facility are created once, not on every run', async () => {
  await seedDemo();
  const gaps = await query(
    `SELECT COUNT(*)::int AS n FROM resource_status rs
     JOIN facilities f ON f.id = rs.facility_id
     WHERE f.name = 'Remera Health Center' AND rs.type = 'supply' AND rs.quantity = 0
       AND rs.updated_at < now() - interval '1 day'`
  );
  expect(gaps.rows[0].n).toBe(2);
});
