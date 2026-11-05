const { notify } = require('../src/services/notificationService');
const { query, closePool } = require('../src/db');

let facilityId;

function fakeIo(roomHasMembers) {
  const emit = jest.fn();
  return {
    sockets: { adapter: { rooms: new Map(roomHasMembers ? [[`facility:${facilityId}`, new Set(['x'])]] : []) } },
    to: jest.fn(() => ({ emit })),
    _emit: emit,
  };
}

beforeAll(async () => {
  const district = await query(`INSERT INTO districts (name) VALUES ('NotifTestDistrict') RETURNING id`);
  const facs = await query(
    `INSERT INTO facilities (district_id, name, tier) VALUES ($1, 'NotifFac', 'health_center') RETURNING id`,
    [district.rows[0].id]
  );
  facilityId = facs.rows[0].id;
});

afterAll(() => closePool());

test('notify emits in-app and logs an in_app notification when the room has a member', async () => {
  const user = await query(
    `INSERT INTO users (username, password_hash, role) VALUES ('notif-tester-1', 'x', 'nurse')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`
  );
  const referralResult = await query(
    `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id, receiving_facility_id, created_by)
     VALUES ('P-1', 'x', 'bed', $1, $1, $2) RETURNING *`,
    [facilityId, user.rows[0].id]
  );
  const referral = referralResult.rows[0];

  const io = fakeIo(true);
  await notify(io, referral);

  expect(io.to).toHaveBeenCalledWith(`facility:${facilityId}`);
  expect(io._emit).toHaveBeenCalledWith('referral', referral);
  const result = await query('SELECT * FROM notifications WHERE referral_id = $1 AND channel = $2', [referral.id, 'in_app']);
  expect(result.rows.length).toBeGreaterThan(0);
});

test('notify falls back to sendSms and logs an sms notification when the room is empty', async () => {
  const user = await query(
    `INSERT INTO users (username, password_hash, role) VALUES ('notif-tester-2', 'x', 'nurse')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`
  );
  const referralResult = await query(
    `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id, receiving_facility_id, created_by)
     VALUES ('P-2', 'x', 'bed', $1, $1, $2) RETURNING *`,
    [facilityId, user.rows[0].id]
  );
  const referral = referralResult.rows[0];

  const io = fakeIo(false);
  await notify(io, referral);

  expect(io.to).not.toHaveBeenCalled();
  const result = await query('SELECT * FROM notifications WHERE referral_id = $1 AND channel = $2', [referral.id, 'sms']);
  expect(result.rows.length).toBeGreaterThan(0);
});
