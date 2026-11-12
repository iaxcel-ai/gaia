const request = require('supertest');
const app = require('../src/app');
const { query, closePool } = require('../src/db');
const { issueToken } = require('../src/services/authService');

let districtId;
let otherDistrictId;
let emptyDistrictId;
let facA;
let facB;
let adminToken;
let nurseToken;
let chwToken;
let emptyAdminToken;

async function addDistrict(name) {
  const result = await query(`INSERT INTO districts (name) VALUES ($1) RETURNING id`, [name]);
  return result.rows[0].id;
}

async function addFacility(district, name) {
  const result = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, $2, 'health_center') RETURNING id`,
    [district, name]
  );
  return result.rows[0].id;
}

async function addUser(username, role, facilityId) {
  const result = await query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ($1, 'x', $2, $3)
     ON CONFLICT (username) DO UPDATE SET facility_id = EXCLUDED.facility_id
     RETURNING id`,
    [username, role, facilityId]
  );
  return issueToken({ id: result.rows[0].id, username, role, facility_id: facilityId });
}

function getReport(token, id) {
  return request(app).get(`/reports/district/${id}`).set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  districtId = await addDistrict('ReportsTestDistrict');
  otherDistrictId = await addDistrict('ReportsOtherDistrict');
  emptyDistrictId = await addDistrict('ReportsEmptyDistrict');

  facA = await addFacility(districtId, 'Report Facility A');
  facB = await addFacility(districtId, 'Report Facility B');
  const facX = await addFacility(otherDistrictId, 'Report Facility X');
  const facY = await addFacility(otherDistrictId, 'Report Facility Y');
  const facZ = await addFacility(emptyDistrictId, 'Report Facility Z');

  adminToken = await addUser('report-test-admin', 'district_admin', facA);
  nurseToken = await addUser('report-test-nurse', 'nurse', facA);
  chwToken = await addUser('report-test-chw', 'chw', facA);
  emptyAdminToken = await addUser('report-test-empty-admin', 'district_admin', facZ);

  const creator = await query(`SELECT id FROM users WHERE username = 'report-test-nurse'`);
  const createdBy = creator.rows[0].id;

  // A->B pending, A->B completed, B->A declined, A->X accepted (crosses districts),
  // X->Y pending (entirely outside the district, must not be counted).
  await query(
    `INSERT INTO referrals (patient_ref, condition, resource_required,
                            referring_facility_id, receiving_facility_id, status, created_by)
     VALUES ('p1', 'c', 'bed', $1, $2, 'pending', $5),
            ('p2', 'c', 'bed', $1, $2, 'completed', $5),
            ('p3', 'c', 'bed', $2, $1, 'declined', $5),
            ('p4', 'c', 'bed', $1, $3, 'accepted', $5),
            ('p5', 'c', 'bed', $3, $4, 'pending', $5)`,
    [facA, facB, facX, facY, createdBy]
  );

  // A: bed hit zero 3 times recently (a recurring gap), plus one non-zero update.
  // B: supply hit zero once (not recurring), specialist hit zero twice but 40 days ago.
  await query(
    `INSERT INTO resource_status (facility_id, type, quantity, updated_at)
     VALUES ($1, 'bed', 0, now() - interval '1 day'),
            ($1, 'bed', 0, now() - interval '2 days'),
            ($1, 'bed', 0, now() - interval '3 days'),
            ($1, 'bed', 5, now() - interval '4 days'),
            ($2, 'supply', 0, now() - interval '1 day'),
            ($2, 'specialist', 0, now() - interval '40 days'),
            ($2, 'specialist', 0, now() - interval '41 days')`,
    [facA, facB]
  );
});

afterAll(() => closePool());

test('a nurse cannot read district reports', async () => {
  const res = await getReport(nurseToken, districtId);
  expect(res.status).toBe(403);
});

test('a chw cannot read district reports', async () => {
  const res = await getReport(chwToken, districtId);
  expect(res.status).toBe(403);
});

test('an admin cannot read another district report', async () => {
  const res = await getReport(adminToken, otherDistrictId);
  expect(res.status).toBe(403);
});

test('a nonexistent district returns 404', async () => {
  const res = await getReport(adminToken, 2147483647);
  expect(res.status).toBe(404);
});

test('a non-numeric district id returns 404', async () => {
  const res = await getReport(adminToken, 'abc');
  expect(res.status).toBe(404);
});

test('referral totals count each referral touching the district once', async () => {
  const res = await getReport(adminToken, districtId);
  expect(res.status).toBe(200);
  expect(res.body.district_id).toBe(districtId);
  expect(res.body.referrals).toEqual({
    total: 4,
    by_status: { pending: 1, accepted: 1, declined: 1, completed: 1, cancelled: 0 },
    decline_rate: 33,
  });
});

test('top referring and receiving facilities are ranked, district facilities only', async () => {
  const res = await getReport(adminToken, districtId);
  expect(res.body.top_referring).toEqual([
    { facility_id: facA, name: 'Report Facility A', count: 3 },
    { facility_id: facB, name: 'Report Facility B', count: 1 },
  ]);
  expect(res.body.top_receiving).toEqual([
    { facility_id: facB, name: 'Report Facility B', count: 2 },
    { facility_id: facA, name: 'Report Facility A', count: 1 },
  ]);
});

// Of the three referrals that got an answer (accepted, declined, completed), one was declined.
test('facilities that declined referrals are listed with how many they received', async () => {
  const res = await getReport(adminToken, districtId);
  expect(res.body.top_declining).toEqual([
    { facility_id: facA, name: 'Report Facility A', declined: 1, received: 1 },
  ]);
});

test('only recurring zero-quantity gaps from the last 30 days are listed', async () => {
  const res = await getReport(adminToken, districtId);
  expect(res.body.resource_gaps).toEqual([
    { facility_id: facA, name: 'Report Facility A', type: 'bed', zero_count: 3 },
  ]);
});

test('the report contains no patient-identifying fields', async () => {
  const res = await getReport(adminToken, districtId);
  const text = JSON.stringify(res.body);
  expect(text).not.toContain('patient_ref');
  expect(text).not.toContain('condition');
});

test('a district with no activity returns zeros and empty lists', async () => {
  const res = await getReport(emptyAdminToken, emptyDistrictId);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    district_id: emptyDistrictId,
    referrals: {
      total: 0,
      by_status: { pending: 0, accepted: 0, declined: 0, completed: 0, cancelled: 0 },
      decline_rate: 0,
    },
    top_referring: [],
    top_receiving: [],
    top_declining: [],
    resource_gaps: [],
  });
});
