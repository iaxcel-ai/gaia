require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/db');

const DEV_ADMIN_PASSWORD = 'admin_dev_password';

async function seed() {
  const existing = await query('SELECT 1 FROM districts LIMIT 1');
  if (existing.rows.length > 0) {
    console.log('Seed data already present, skipping district/facility seeding.');
    const adminHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
    await query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ('admin', $1, 'district_admin')
       ON CONFLICT (username) DO NOTHING`,
      [adminHash]
    );
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
  await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ('admin', $1, 'district_admin')
     ON CONFLICT (username) DO NOTHING`,
    [passwordHash]
  );

  console.log('Seeded district:', districtId);
  console.log('Seeded facilities:', facilitiesResult.rows.map((r) => r.id));
  console.log('Seeded admin user: username=admin password=%s', DEV_ADMIN_PASSWORD);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
