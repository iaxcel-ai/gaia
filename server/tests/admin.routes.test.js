const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let facilityId;
let otherDistrictFacilityId;
let adminId;
let adminToken;
let nurseToken;
let chwToken;

beforeAll(async () => {
  await query(
    `DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'admin-test-%')`
  );
  await query(`DELETE FROM users WHERE username LIKE 'admin-test-%'`);

  const district = await query(`INSERT INTO districts (name) VALUES ('AdminTestDistrict') RETURNING id`);
  const facility = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'Admin Test Facility', 'health_center') RETURNING id`,
    [district.rows[0].id]
  );
  facilityId = facility.rows[0].id;

  const otherDistrict = await query(`INSERT INTO districts (name) VALUES ('AdminTestOtherDistrict') RETURNING id`);
  const otherFacility = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'Admin Test Other Facility', 'health_center') RETURNING id`,
    [otherDistrict.rows[0].id]
  );
  otherDistrictFacilityId = otherFacility.rows[0].id;

  const users = await query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ('admin-test-admin', 'x', 'district_admin', $1), ('admin-test-nurse', 'x', 'nurse', $1),
            ('admin-test-chw', 'x', 'chw', $1)
     RETURNING id`,
    [facilityId]
  );
  adminId = users.rows[0].id;
  adminToken = issueToken({ id: adminId, username: 'admin-test-admin', role: 'district_admin', facility_id: facilityId });
  nurseToken = issueToken({ id: users.rows[1].id, username: 'admin-test-nurse', role: 'nurse', facility_id: facilityId });
  chwToken = issueToken({ id: users.rows[2].id, username: 'admin-test-chw', role: 'chw', facility_id: facilityId });
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
  const before = await query(`SELECT id FROM audit_log WHERE user_id = $1`, [adminId]);
  const res = await createUser(adminToken, {
    username: 'admin-test-audited', password: 'secret123', role: 'chw', facility_id: facilityId,
  });
  expect(res.status).toBe(201);
  const after = await query(`SELECT action FROM audit_log WHERE user_id = $1 ORDER BY id`, [adminId]);
  expect(after.rows.length).toBe(before.rows.length + 1);
  expect(after.rows[after.rows.length - 1].action).toBe('user_created');
});

test('a username is stored without surrounding spaces', async () => {
  const res = await createUser(adminToken, {
    username: ' admin-test-trim ', password: 'secret123', role: 'nurse', facility_id: facilityId,
  });
  expect(res.status).toBe(201);
  expect(res.body.username).toBe('admin-test-trim');

  const login = await request(app).post('/auth/login').send({ username: 'admin-test-trim', password: 'secret123' });
  expect(login.status).toBe(200);
});

test('an admin cannot create an account at a facility in another district', async () => {
  const res = await createUser(adminToken, {
    username: 'admin-test-other-district', password: 'secret123', role: 'nurse', facility_id: otherDistrictFacilityId,
  });
  expect(res.status).toBe(403);
});

test('a chw cannot create accounts', async () => {
  const res = await createUser(chwToken, {
    username: 'admin-test-by-chw', password: 'secret123', role: 'nurse', facility_id: facilityId,
  });
  expect(res.status).toBe(403);
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

test('a password shorter than 7 characters is rejected with 400', async () => {
  const short = await createUser(adminToken, {
    username: 'admin-test-shortpw', password: 'six666', role: 'nurse', facility_id: facilityId,
  });
  expect(short.status).toBe(400);
  expect(short.body.error).toBe('Password must be at least 7 characters');

  const longEnough = await createUser(adminToken, {
    username: 'admin-test-shortpw', password: 'seven77', role: 'nurse', facility_id: facilityId,
  });
  expect(longEnough.status).toBe(201);
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

function listUsers(token) {
  return request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
}

test('an admin sees the staff of their own district, without password hashes', async () => {
  await query(
    `INSERT INTO users (username, password_hash, role, facility_id) VALUES ('admin-test-elsewhere', 'x', 'nurse', $1)`,
    [otherDistrictFacilityId]
  );
  const res = await listUsers(adminToken);
  expect(res.status).toBe(200);

  const usernames = res.body.map((u) => u.username);
  expect(usernames).toContain('admin-test-admin');
  expect(usernames).toContain('admin-test-nurse');
  expect(usernames).not.toContain('admin-test-elsewhere');

  const nurse = res.body.find((u) => u.username === 'admin-test-nurse');
  expect(nurse).toEqual({
    id: expect.any(Number),
    username: 'admin-test-nurse',
    role: 'nurse',
    facility_id: facilityId,
    facility_name: 'Admin Test Facility',
    active: true,
  });
});

test('the staff list is sorted by username', async () => {
  const res = await listUsers(adminToken);
  const usernames = res.body.map((u) => u.username);
  expect(usernames).toEqual([...usernames].sort());
});

test('a nurse cannot list staff', async () => {
  const res = await listUsers(nurseToken);
  expect(res.status).toBe(403);
});

function setActive(token, id, active) {
  return request(app).patch(`/admin/users/${id}`).set('Authorization', `Bearer ${token}`).send({ active });
}

async function userId(username) {
  const result = await query('SELECT id FROM users WHERE username = $1', [username]);
  return result.rows[0].id;
}

test('a deactivated account cannot log in, and can again once reactivated', async () => {
  await createUser(adminToken, {
    username: 'admin-test-leaver', password: 'secret123', role: 'nurse', facility_id: facilityId,
  });
  const id = await userId('admin-test-leaver');

  const off = await setActive(adminToken, id, false);
  expect(off.status).toBe(200);
  expect(off.body).toEqual({ id, username: 'admin-test-leaver', active: false });
  const blocked = await request(app).post('/auth/login').send({ username: 'admin-test-leaver', password: 'secret123' });
  expect(blocked.status).toBe(403);

  const on = await setActive(adminToken, id, true);
  expect(on.body.active).toBe(true);
  const allowed = await request(app).post('/auth/login').send({ username: 'admin-test-leaver', password: 'secret123' });
  expect(allowed.status).toBe(200);
});

test('deactivating keeps the account in the staff list, marked inactive', async () => {
  const id = await userId('admin-test-leaver');
  await setActive(adminToken, id, false);
  const res = await listUsers(adminToken);
  expect(res.body.find((u) => u.id === id).active).toBe(false);
});

test('deactivating an account writes an audit row', async () => {
  const id = await userId('admin-test-leaver');
  await setActive(adminToken, id, true);
  await setActive(adminToken, id, false);
  const audit = await query('SELECT action FROM audit_log WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [adminId]);
  expect(audit.rows[0].action).toBe('user_deactivated');
});

test('an admin cannot deactivate their own account', async () => {
  const res = await setActive(adminToken, adminId, false);
  expect(res.status).toBe(400);
});

test('an admin cannot deactivate an account in another district', async () => {
  const id = await userId('admin-test-elsewhere');
  const res = await setActive(adminToken, id, false);
  expect(res.status).toBe(404);
});

test('a nurse cannot deactivate accounts', async () => {
  const id = await userId('admin-test-leaver');
  const res = await setActive(nurseToken, id, false);
  expect(res.status).toBe(403);
});

test('active must be true or false', async () => {
  const id = await userId('admin-test-leaver');
  const res = await setActive(adminToken, id, 'no');
  expect(res.status).toBe(400);
});

test('a non-numeric or unknown user id returns 404', async () => {
  expect((await setActive(adminToken, 'abc', false)).status).toBe(404);
  expect((await setActive(adminToken, 2147483647, false)).status).toBe(404);
});
