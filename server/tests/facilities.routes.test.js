const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let facA;
let facB;
let token;

beforeAll(async () => {
  const district = await query(`INSERT INTO districts (name) VALUES ('TestDistrict') RETURNING id`);
  const districtId = district.rows[0].id;

  const facs = await query(
    `INSERT INTO facilities (district_id, name, tier)
     VALUES ($1, 'Facility A', 'health_center'), ($1, 'Facility B', 'health_center')
     RETURNING id`,
    [districtId]
  );
  facA = facs.rows[0].id;
  facB = facs.rows[1].id;

  await query(
    `INSERT INTO resource_status (facility_id, type, quantity, updated_at) VALUES ($1, 'bed', 5, now())`,
    [facA]
  );
  await query(
    `INSERT INTO resource_status (facility_id, type, quantity, updated_at)
     VALUES ($1, 'specialist', 1, now() - interval '3 hours')`,
    [facA]
  );

  token = issueToken({ id: 1, username: 'facilities-tester', role: 'nurse', facility_id: facA });
});

afterAll(() => closePool());

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
