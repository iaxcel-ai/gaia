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

test('reset-password by a district_admin succeeds and the new password works', async () => {
  const adminToken = issueToken({ id: 1, username: 'testadmin', role: 'district_admin', facility_id: null });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'testadmin', newPassword: 'newpass456' });
  expect(res.status).toBe(200);

  const loginRes = await request(app).post('/auth/login').send({ username: 'testadmin', password: 'newpass456' });
  expect(loginRes.status).toBe(200);

  await query(
    `UPDATE users SET password_hash = $1 WHERE username = 'testadmin'`,
    [await bcrypt.hash('testpass123', 10)]
  );
});

test('reset-password by a non-admin is rejected with 403', async () => {
  const nurseToken = issueToken({ id: 2, username: 'nurse1', role: 'nurse', facility_id: 1 });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ username: 'testadmin', newPassword: 'x' });
  expect(res.status).toBe(403);
});

test('reset-password without a newPassword returns 400', async () => {
  const adminToken = issueToken({ id: 1, username: 'testadmin', role: 'district_admin', facility_id: null });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'testadmin' });
  expect(res.status).toBe(400);
});

test('reset-password for a username that does not exist returns 404', async () => {
  const adminToken = issueToken({ id: 1, username: 'testadmin', role: 'district_admin', facility_id: null });
  const res = await request(app).post('/auth/reset-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'nobody', newPassword: 'whatever123' });
  expect(res.status).toBe(404);
});
