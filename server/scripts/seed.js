require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/db');

const DEV_ADMIN_PASSWORD = 'admin_dev_password';

// The admin belongs to a facility so that district reports know which district is theirs.
// An admin seeded before this was added gets the facility filled in.
function seedAdmin(passwordHash, facilityId) {
  return query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ('admin', $1, 'district_admin', $2)
     ON CONFLICT (username) DO UPDATE SET facility_id = COALESCE(users.facility_id, EXCLUDED.facility_id)`,
    [passwordHash, facilityId]
  );
}

async function seed() {
  const existing = await query('SELECT 1 FROM districts LIMIT 1');
  if (existing.rows.length > 0) {
    console.log('Seed data already present, skipping district/facility seeding.');
    const adminHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
    const firstFacility = await query('SELECT id FROM facilities ORDER BY id LIMIT 1');
    await seedAdmin(adminHash, firstFacility.rows[0].id);
    console.log('Seeded admin user: username=admin password=%s', DEV_ADMIN_PASSWORD);
    process.exit(0);
  }

  const districtResult = await query(
    `INSERT INTO districts (name) VALUES ($1) RETURNING id`,
    ['Gasabo']
  );
  const districtId = districtResult.rows[0].id;

  const facilitiesResult = await query(
    `INSERT INTO facilities (district_id, name, tier, phone_number)
     VALUES ($1, 'Kacyiru Health Center', 'health_center', '+250700000001'),
            ($1, 'Kimironko District Hospital', 'district_hospital', '+250700000002')
     RETURNING id`,
    [districtId]
  );

  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
  await seedAdmin(passwordHash, facilitiesResult.rows[0].id);

  console.log('Seeded district:', districtId);
  console.log('Seeded facilities:', facilitiesResult.rows.map((r) => r.id));
  console.log('Seeded admin user: username=admin password=%s', DEV_ADMIN_PASSWORD);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
