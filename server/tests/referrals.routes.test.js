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

test('POST /referrals to your own facility as a string id is still rejected with 400', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: String(facA), patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('POST /referrals with a non-numeric receiving_facility_id is rejected with 400, not a crash', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: 'abc', patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed' });
  expect(res.status).toBe(400);
});

test('POST /referrals with a resource that is not bed, specialist or supply is rejected with 400', async () => {
  const res = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-BAD', condition: 'fever', resource_required: 'helicopter' });
  expect(res.status).toBe(400);
});

test('POST /referrals audits the creation', async () => {
  const res = await request(app).post('/referrals')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-AUDIT', condition: 'x', resource_required: 'bed' });
  const audit = await query(
    'SELECT * FROM audit_log WHERE user_id = $1 AND action = $2',
    [res.body.created_by, 'referral_created']
  );
  expect(audit.rows.length).toBeGreaterThan(0);
});

test('GET /referrals lists referrals where the user\'s facility is referring or receiving', async () => {
  const res = await request(app).get('/referrals').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThan(0);
});

test('GET /referrals includes the names of both facilities', async () => {
  await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-NAMES', condition: 'fever', resource_required: 'bed' });
  const res = await request(app).get('/referrals').set('Authorization', `Bearer ${tokenA}`);
  const referral = res.body.find((r) => r.patient_ref === 'P-NAMES');
  expect(referral.referring_facility_name).toBe('Referral Facility A');
  expect(referral.receiving_facility_name).toBe('Referral Facility B');
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

test('GET /referrals/:id for a non-numeric id returns 404, not a crash', async () => {
  const res = await request(app).get('/referrals/abc').set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(404);
});

test('PATCH /referrals/:id accept by the receiving facility succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-4', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('accepted');
});

test('PATCH /referrals/:id decline stores the reason', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-DECLINE', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`)
    .send({ action: 'decline', reason: 'no_bed' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('declined');
  expect(res.body.decline_reason).toBe('no_bed');
});

test('PATCH /referrals/:id decline without a valid reason is rejected with 400 and stays pending', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-NOREASON', condition: 'x', resource_required: 'bed' });
  const missing = await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`)
    .send({ action: 'decline' });
  expect(missing.status).toBe(400);
  const invalid = await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`)
    .send({ action: 'decline', reason: 'too busy' });
  expect(invalid.status).toBe(400);

  const after = await request(app).get(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`);
  expect(after.body.status).toBe('pending');
});

test('PATCH /referrals/:id accept does not store a decline reason', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-ACCEPTED', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`)
    .send({ action: 'accept', reason: 'no_bed' });
  expect(res.body.decline_reason).toBeNull();
});

test('PATCH /referrals/:id accept by the referring facility is rejected with 403', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-5', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'accept' });
  expect(res.status).toBe(403);
});

test('PATCH /referrals/:id accepting an already-accepted referral is rejected with 409', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-6', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  expect(res.status).toBe(409);
});

test('PATCH /referrals/:id complete by the referring facility is rejected with 403', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-7', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'complete' });
  expect(res.status).toBe(403);
});

test('PATCH /referrals/:id complete by the receiving facility after accept succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-8', condition: 'x', resource_required: 'bed' });
  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenB}`).send({ action: 'complete' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('completed');
});

test('PATCH /referrals/:id cancel by the referring facility before acceptance succeeds', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-9', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'cancel' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('cancelled');
});

test('PATCH /referrals/:id with an invalid action is rejected with 400', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-10', condition: 'x', resource_required: 'bed' });
  const res = await request(app).patch(`/referrals/${created.body.id}`)
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'teleport' });
  expect(res.status).toBe(400);
});

test('PATCH /referrals/:id for a non-numeric id returns 404, not a crash', async () => {
  const res = await request(app).patch('/referrals/abc')
    .set('Authorization', `Bearer ${tokenA}`).send({ action: 'accept' });
  expect(res.status).toBe(404);
});

test('two simultaneous accepts on the same referral only let one succeed', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-RACE', condition: 'x', resource_required: 'bed' });

  const [first, second] = await Promise.all([
    request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' }),
    request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' }),
  ]);

  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 409]);
});

test('PATCH /referrals/:id notifies the other facility, not the one that acted', async () => {
  const created = await request(app).post('/referrals').set('Authorization', `Bearer ${tokenA}`)
    .send({ receiving_facility_id: facB, patient_ref: 'P-NOTIFY', condition: 'x', resource_required: 'bed' });

  const emit = jest.fn();
  const targetedIo = {
    sockets: { adapter: { rooms: new Map([[`facility:${facA}`, new Set(['x'])]]) } },
    to: jest.fn(() => ({ emit })),
  };
  app.set('io', targetedIo);

  await request(app).patch(`/referrals/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ action: 'accept' });

  expect(targetedIo.to).toHaveBeenCalledWith(`facility:${facA}`);
  expect(targetedIo.to).not.toHaveBeenCalledWith(`facility:${facB}`);

  app.set('io', fakeIo());
});
