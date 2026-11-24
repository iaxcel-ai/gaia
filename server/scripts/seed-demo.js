// Demo data for the live site: staff accounts, resource counts and referrals in several states,
// so the dashboard, referral list and district report have something to show.
// It only runs when SEED_DEMO=true, and it is safe to run on every start.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, closePool } = require('../src/db');

const DISTRICT = 'Gasabo';
const DEFAULT_DEMO_PASSWORD = 'gaia-demo-2026';

const DEMO_ACCOUNTS = [
  { username: 'admin.demo', role: 'district_admin', facility: 'Kacyiru District Hospital' },
  { username: 'nurse.kacyiru', role: 'nurse', facility: 'Kacyiru District Hospital' },
  { username: 'nurse.kingfaisal', role: 'nurse', facility: 'King Faisal Hospital' },
  { username: 'chw.kibagabaga', role: 'chw', facility: 'Kibagabaga Level Two Teaching Hospital' },
  { username: 'nurse.remera', role: 'nurse', facility: 'Remera Health Center' },
];

// Current counts [bed, specialist, supply]. These are written fresh on every start,
// so the demo does not show everything as out of date.
const CURRENT_COUNTS = {
  'Kacyiru District Hospital': [12, 4, 20],
  'King Faisal Hospital': [3, 6, 15],
  'Kibagabaga Level Two Teaching Hospital': [8, 3, 9],
  'Remera Health Center': [5, 1, 12],
  'Kigali Medical Center': [2, 2, 6],
  'Ndera Neuropsychiatric Hospital': [6, 5, 8],
  'Hôpital La Croix du Sud': [0, 2, 10],
};

// Written once. A facility that is out of beds twice in a week shows up as a recurring gap,
// and one facility that has not updated for hours shows the stale flag.
const ONE_TIME_RESOURCES = [
  { facility: 'Remera Health Center', type: 'supply', quantity: 0, ago: '5 days' },
  { facility: 'Remera Health Center', type: 'supply', quantity: 0, ago: '2 days' },
  { facility: 'Kigali Medical Center', type: 'bed', quantity: 0, ago: '6 days' },
  { facility: 'Kigali Medical Center', type: 'bed', quantity: 0, ago: '3 days' },
  { facility: 'Kigali Mental Health Referral Center', type: 'bed', quantity: 4, ago: '5 hours' },
  { facility: 'Kigali Mental Health Referral Center', type: 'specialist', quantity: 2, ago: '5 hours' },
  { facility: 'Kigali Mental Health Referral Center', type: 'supply', quantity: 7, ago: '5 hours' },
];

// Written once: [patient reference, condition, resource, from, to, status, decline reason, sent how long ago].
const REFERRALS = [
  ['P-1001', 'Open fracture of the leg', 'bed', 'Kacyiru District Hospital', 'King Faisal Hospital', 'pending', null, '20 minutes'],
  ['P-1008', 'Severe trauma after an accident', 'specialist', 'Kacyiru District Hospital', 'Kibagabaga Level Two Teaching Hospital', 'pending', null, '2 hours'],
  ['P-1002', 'Premature labour', 'specialist', 'Remera Health Center', 'Kacyiru District Hospital', 'accepted', null, '1 day'],
  ['P-1006', 'Severe burns', 'specialist', 'Remera Health Center', 'King Faisal Hospital', 'accepted', null, '6 hours'],
  ['P-1003', 'Kidney failure needing dialysis', 'supply', 'Kibagabaga Level Two Teaching Hospital', 'Kacyiru District Hospital', 'completed', null, '3 days'],
  ['P-1004', 'Suspected stroke', 'bed', 'Kacyiru District Hospital', 'Kigali Medical Center', 'declined', 'no_bed', '2 days'],
  ['P-1005', 'Severe asthma attack', 'bed', 'Remera Health Center', 'Kibagabaga Level Two Teaching Hospital', 'declined', 'no_bed', '4 days'],
  ['P-1007', 'Suspected malaria', 'supply', 'Remera Health Center', 'Kibagabaga Level Two Teaching Hospital', 'cancelled', null, '5 days'],
];

const DEMO_FACILITY_NAMES = [
  ...new Set([
    ...DEMO_ACCOUNTS.map((a) => a.facility),
    ...Object.keys(CURRENT_COUNTS),
    ...ONE_TIME_RESOURCES.map((r) => r.facility),
    ...REFERRALS.flatMap((r) => [r[3], r[4]]),
  ]),
];

async function facilityIds() {
  const result = await query(
    `SELECT f.id, f.name FROM facilities f JOIN districts d ON d.id = f.district_id
     WHERE d.name = $1 AND f.name = ANY($2)`,
    [DISTRICT, DEMO_FACILITY_NAMES]
  );
  const ids = Object.fromEntries(result.rows.map((r) => [r.name, r.id]));
  const missing = DEMO_FACILITY_NAMES.filter((name) => !ids[name]);
  if (missing.length > 0) {
    throw new Error(`Facilities not found in ${DISTRICT} (run the main seed first): ${missing.join(', ')}`);
  }
  return ids;
}

async function seedDemo() {
  const ids = await facilityIds();
  const password = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;

  // The accounts are added on every run (existing ones are left alone), so an account added to
  // this list later also reaches a database that was seeded earlier.
  const hash = await bcrypt.hash(password, 10);
  for (const account of DEMO_ACCOUNTS) {
    await query(
      `INSERT INTO users (username, password_hash, role, facility_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [account.username, hash, account.role, ids[account.facility]]
    );
  }

  // The referrals and the one-time resource rows are only added the first time.
  // The first demo referral marks that this already happened.
  const marker = await query('SELECT 1 FROM referrals WHERE patient_ref = $1', [REFERRALS[0][0]]);
  const firstRun = marker.rows.length === 0;

  if (firstRun) {
    for (const r of ONE_TIME_RESOURCES) {
      await query(
        `INSERT INTO resource_status (facility_id, type, quantity, updated_at)
         VALUES ($1, $2, $3, now() - $4::interval)`,
        [ids[r.facility], r.type, r.quantity, r.ago]
      );
    }

    // Each referral is created by the staff member (not the admin) at the sending facility.
    const staff = await query(
      `SELECT id, facility_id FROM users WHERE username = ANY($1) AND role <> 'district_admin'`,
      [DEMO_ACCOUNTS.map((a) => a.username)]
    );
    const creatorAt = Object.fromEntries(staff.rows.map((u) => [u.facility_id, u.id]));
    for (const [ref, condition, resource, from, to, status, reason, ago] of REFERRALS) {
      await query(
        `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id,
                                receiving_facility_id, status, decline_reason, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - $9::interval)`,
        [ref, condition, resource, ids[from], ids[to], status, reason, creatorAt[ids[from]], ago]
      );
    }
  }

  // Fresh counts every time, so the dashboard is not full of stale values after a quiet period.
  const types = ['bed', 'specialist', 'supply'];
  for (const [facility, counts] of Object.entries(CURRENT_COUNTS)) {
    for (let i = 0; i < types.length; i += 1) {
      await query('INSERT INTO resource_status (facility_id, type, quantity) VALUES ($1, $2, $3)', [
        ids[facility], types[i], counts[i],
      ]);
    }
  }

  return { firstRun };
}

module.exports = { seedDemo, DEMO_FACILITY_NAMES, DEMO_ACCOUNTS };

if (require.main === module) {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('SEED_DEMO is not "true", so no demo data was added.');
    process.exit(0);
  }
  seedDemo()
    .then(({ firstRun }) => {
      console.log(firstRun ? 'Demo accounts, referrals and resource counts added.' : 'Demo resource counts refreshed.');
      return closePool();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
