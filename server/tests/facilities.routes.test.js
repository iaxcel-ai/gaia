const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let facA;
let facB;
let token;
let ownToken;
let otherFacilityToken;

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
  ownToken = issueToken({ id: 2, username: 'own-facility-nurse', role: 'nurse', facility_id: facA });
  otherFacilityToken = issueToken({ id: 3, username: 'other-facility-nurse', role: 'nurse', facility_id: facB });
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

test('GET /facilities/:id/status for a non-numeric id returns 404, not a crash', async () => {
  const res = await request(app).get('/facilities/abc/status').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
});

test('GET /facilities/:id/status for an id too large for the database returns 404, not a crash', async () => {
  const res = await request(app).get('/facilities/99999999999/status').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
});

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
