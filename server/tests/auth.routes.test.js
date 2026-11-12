const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

beforeAll(async () => {
  const hash = await bcrypt.hash('testpass123', 10);
  await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ('testadmin', $1, 'district_admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [hash]
  );
});

afterAll(() => closePool());

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

test('login with a missing password returns 400 and does not crash the server', async () => {
  const res = await request(app).post('/auth/login').send({ username: 'testadmin' });
  expect(res.status).toBe(400);

  const followUp = await request(app).post('/auth/login').send({ username: 'testadmin', password: 'testpass123' });
  expect(followUp.status).toBe(200);
});

test('a malformed JSON body returns 400, not 500', async () => {
  const res = await request(app)
    .post('/auth/login')
    .set('Content-Type', 'application/json')
    .send('{not valid json');
  expect(res.status).toBe(400);
});

test('logout returns 204', async () => {
  const res = await request(app).post('/auth/logout');
  expect(res.status).toBe(204);
});

// Password reset: an admin may only reset accounts in their own district.
let resetAdminToken;
let resetNurseToken;

async function addResetFixtures() {
  await query(`DELETE FROM users WHERE username LIKE 'reset-test-%'`);
  const district = await query(`INSERT INTO districts (name) VALUES ('ResetTestDistrict') RETURNING id`);
  const other = await query(`INSERT INTO districts (name) VALUES ('ResetOtherDistrict') RETURNING id`);
  const facility = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'Reset Facility', 'health_center') RETURNING id`,
    [district.rows[0].id]
  );
  const otherFacility = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'Reset Other Facility', 'health_center') RETURNING id`,
    [other.rows[0].id]
  );
  const facilityId = facility.rows[0].id;
  const hash = await bcrypt.hash('oldpass123', 10);
  const users = await query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ('reset-test-admin', $1, 'district_admin', $2),
            ('reset-test-nurse', $1, 'nurse', $2),
            ('reset-test-elsewhere', $1, 'nurse', $3)
     RETURNING id`,
    [hash, facilityId, otherFacility.rows[0].id]
  );
  resetAdminToken = issueToken({ id: users.rows[0].id, username: 'reset-test-admin', role: 'district_admin', facility_id: facilityId });
  resetNurseToken = issueToken({ id: users.rows[1].id, username: 'reset-test-nurse', role: 'nurse', facility_id: facilityId });
}

function resetPassword(token, body) {
  return request(app).post('/auth/reset-password').set('Authorization', `Bearer ${token}`).send(body);
}

test('reset-password by a district_admin succeeds and the new password works', async () => {
  await addResetFixtures();
  const res = await resetPassword(resetAdminToken, { username: 'reset-test-nurse', newPassword: 'newpass456' });
  expect(res.status).toBe(200);

  const loginRes = await request(app).post('/auth/login').send({ username: 'reset-test-nurse', password: 'newpass456' });
  expect(loginRes.status).toBe(200);
});

test('reset-password for a user in another district returns 404 and leaves the password alone', async () => {
  const res = await resetPassword(resetAdminToken, { username: 'reset-test-elsewhere', newPassword: 'hijacked123' });
  expect(res.status).toBe(404);

  const loginRes = await request(app).post('/auth/login').send({ username: 'reset-test-elsewhere', password: 'oldpass123' });
  expect(loginRes.status).toBe(200);
});

test('reset-password by a non-admin is rejected with 403', async () => {
  const res = await resetPassword(resetNurseToken, { username: 'reset-test-nurse', newPassword: 'x' });
  expect(res.status).toBe(403);
});

test('reset-password without a newPassword returns 400', async () => {
  const res = await resetPassword(resetAdminToken, { username: 'reset-test-nurse' });
  expect(res.status).toBe(400);
});

test('reset-password for a username that does not exist returns 404', async () => {
  const res = await resetPassword(resetAdminToken, { username: 'nobody', newPassword: 'whatever123' });
  expect(res.status).toBe(404);
});
