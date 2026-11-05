const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let facA;
let facB;
let facC;
let tokenA;
let tokenB;
let tokenC;

function fakeIo() {
  return {
    sockets: { adapter: { rooms: new Map() } },
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
}

beforeAll(async () => {
  const district = await query(`INSERT INTO districts (name) VALUES ('ReferralsTestDistrict') RETURNING id`);
  const districtId = district.rows[0].id;

  const facs = await query(
    `INSERT INTO facilities (district_id, name, tier)
     VALUES ($1, 'Referral Facility A', 'health_center'),
            ($1, 'Referral Facility B', 'health_center'),
            ($1, 'Referral Facility C', 'health_center')
     RETURNING id`,
    [districtId]
  );
  facA = facs.rows[0].id;
  facB = facs.rows[1].id;
  facC = facs.rows[2].id;

  const users = await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ('referral-tester-a', 'x', 'nurse'), ('referral-tester-b', 'x', 'nurse'), ('referral-tester-c', 'x', 'nurse')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`
  );
  tokenA = issueToken({ id: users.rows[0].id, username: 'referral-tester-a', role: 'nurse', facility_id: facA });
  tokenB = issueToken({ id: users.rows[1].id, username: 'referral-tester-b', role: 'nurse', facility_id: facB });
  tokenC = issueToken({ id: users.rows[2].id, username: 'referral-tester-c', role: 'nurse', facility_id: facC });

  app.set('io', fakeIo());
});

afterAll(() => closePool());

test('POST /referrals creates a pending referral and audits it', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'pending', referring_facility_id: facA, receiving_facility_id: facB });
});

test('POST /referrals to your own facility is rejected with 400', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facA, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('POST /referrals to a nonexistent facility is rejected with 400', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: 999999, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('GET /referrals lists referrals where the user\'s facility is referring or receiving', async () => {
  const res = await request(app).get('/referrals').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
});

test('GET /referrals/:id is visible to the receiving facility', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-2', condition: 'x', resource_required: 'bed' });
  const res = await request(app).get(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`);
  expect(res.status).toBe(200);
});

test('GET /referrals/:id is forbidden to an unrelated facility', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-3', condition: 'x', resource_required: 'bed' });
  const res = await request(app).get(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenC}`);
  expect(res.status).toBe(403);
});

test('GET /referrals/:id for a nonexistent referral returns 404', async () => {
  const res = await request(app).get('/referrals/999999').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(404);
});
