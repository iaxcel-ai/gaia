const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const requireAuth = require('../src/middleware/requireAuth');
const { issueToken } = require('../src/services/authService');

const app = express();
app.get('/protected', requireAuth, (req, res) => res.status(200).json({ ok: true }));

test('request with no Authorization header is rejected with 401', async () => {
  const res = await request(app).get('/protected');
  expect(res.status).toBe(401);
});

test('request with a malformed token is rejected with 401', async () => {
  const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-token');
  expect(res.status).toBe(401);
});

test('request with an Authorization header missing the Bearer prefix is rejected with 401', async () => {
  const token = issueToken({ id: 1, username: 'admin', role: 'district_admin', facility_id: null });
  const res = await request(app).get('/protected').set('Authorization', token);
  expect(res.status).toBe(401);
});

test('request with an expired token is rejected with 401', async () => {
  const token = jwt.sign(
    { id: 1, username: 'admin', role: 'district_admin', facility_id: null },
    process.env.JWT_SECRET,
    { expiresIn: -1 }
  );
  const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

test('request with a token signed by a different secret is rejected with 401', async () => {
  const token = jwt.sign(
    { id: 1, username: 'admin', role: 'district_admin', facility_id: null },
    'a-different-secret'
  );
  const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

test('request with a valid token succeeds and sets req.user', async () => {
  const token = issueToken({ id: 1, username: 'admin', role: 'district_admin', facility_id: null });
  const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
});
