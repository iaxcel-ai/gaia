const { writeAudit } = require('../src/services/auditService');
const { query, closePool } = require('../src/db');

let userId;

beforeAll(async () => {
  const result = await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ('audit-tester', 'x', 'nurse')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`
  );
  userId = result.rows[0].id;
});

afterAll(() => closePool());

test('writeAudit inserts a row with the user id and action', async () => {
  await writeAudit(userId, 'referral_created');
  const result = await query('SELECT * FROM audit_log WHERE user_id = $1 AND action = $2', [userId, 'referral_created']);
  expect(result.rows.length).toBeGreaterThan(0);
});
