const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let facilityId;
let adminId;
let adminToken;
let nurseToken;

beforeAll(async () => {
  await query(`DELETE FROM users WHERE username LIKE 'admin-test-%'`);

  const district = await query(`INSERT INTO districts (name) VALUES ('AdminTestDistrict') RETURNING id`);
  const facility = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'Admin Test Facility', 'health_center') RETURNING id`,
    [district.rows[0].id]
  );
  facilityId = facility.rows[0].id;

  const users = await query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ('admin-test-admin', 'x', 'district_admin', $1), ('admin-test-nurse', 'x', 'nurse', $1)
     RETURNING id`,
    [facilityId]
  );
  adminId = users.rows[0].id;
  adminToken = issueToken({ id: adminId, username: 'admin-test-admin', role: 'district_admin', facility_id: facilityId });
  nurseToken = issueToken({ id: users.rows[1].id, username: 'admin-test-nurse', role: 'nurse', facility_id: facilityId });
});

afterAll(() => closePool());

function createUser(token, body) {
  return request(app).post('/admin/users').set('Authorization', `Bearer ${token}`).send(body);
}

test('a district_admin creates a staff account that can then log in', async () => {
  const res = await createUser(adminToken, {
    username: 'admin-test-new', password: 'secret123', role: 'nurse', facility_id: facilityId,
  });
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    id: expect.any(Number), username: 'admin-test-new', role: 'nurse', facility_id: facilityId,
  });

  const login = await request(app).post('/auth/login').send({ username: 'admin-test-new', password: 'secret123' });
  expect(login.status).toBe(200);
});

test('creating a staff account writes an audit row for the admin', async () => {
  await createUser(adminToken, {
    username: 'admin-test-audited', password: 'secret123', role: 'chw', facility_id: facilityId,
  });
  const audit = await query(`SELECT action FROM audit_log WHERE user_id = $1`, [adminId]);
  expect(audit.rows.length).toBeGreaterThan(0);
});

test('a nurse cannot create accounts', async () => {
  const res = await createUser(nurseToken, {
    username: 'admin-test-by-nurse', password: 'secret123', role: 'nurse', facility_id: facilityId,
  });
  expect(res.status).toBe(403);
});

test('a request without a token is rejected with 401', async () => {
  const res = await request(app).post('/admin/users').send({});
  expect(res.status).toBe(401);
});

test('creating another district_admin is rejected with 400', async () => {
  const res = await createUser(adminToken, {
    username: 'admin-test-admin2', password: 'secret123', role: 'district_admin', facility_id: facilityId,
  });
  expect(res.status).toBe(400);
});

test('missing fields are rejected with 400', async () => {
  const res = await createUser(adminToken, { username: 'admin-test-missing', role: 'nurse' });
  expect(res.status).toBe(400);
});

test('an unknown facility_id is rejected with 400', async () => {
  const res = await createUser(adminToken, {
    username: 'admin-test-nofac', password: 'secret123', role: 'nurse', facility_id: 2147483647,
  });
  expect(res.status).toBe(400);
});

test('a duplicate username is rejected with 409', async () => {
  const body = { username: 'admin-test-dup', password: 'secret123', role: 'nurse', facility_id: facilityId };
  await createUser(adminToken, body);
  const res = await createUser(adminToken, body);
  expect(res.status).toBe(409);
});
