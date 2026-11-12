require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/db');

const DEV_ADMIN_PASSWORD = 'admin_dev_password';
const DISTRICT = 'Gasabo';

// Healthcare facilities in Gasabo district: [name, type, sector].
const FACILITIES = [
  // Public hospitals and referral facilities
  ['Kacyiru District Hospital', 'District hospital', 'Kacyiru'],
  ['Kibagabaga Level Two Teaching Hospital', 'Teaching hospital', 'Kimironko'],
  ['Kigali Mental Health Referral Center', 'Specialized hospital', 'Kinyinya'],
  ['King Faisal Hospital', 'Teaching hospital', 'Kacyiru'],
  ['Ndera Neuropsychiatric Hospital', 'Teaching hospital', 'Ndera'],
  // Private hospitals, clinics and medical centres
  ['Kigali Hill Side Clinic', 'General clinic', 'Gisozi'],
  ['Kigali Medical Center', 'Polyclinic', 'Kimironko'],
  ['Kigali Psycho-Medical Center', 'General clinic', 'Remera'],
  ['Kivu Specialist Clinic', 'Dental clinic', 'Kacyiru'],
  ['Advanced Dental Centre', 'Specialized clinic', 'Remera'],
  ['ADA Dental', 'Dental clinic', 'Remera'],
  ['Alliance Arena Clinic', 'General clinic', 'Rusororo'],
  ['Frontier Polyclinic', 'Polyclinic', 'Remera'],
  ['Galien Medical Clinic', 'General clinic', 'Kimironko'],
  ['Glamerc Polyclinic', 'Polyclinic', 'Remera'],
  ['Hôpital La Croix du Sud', 'Private hospital', 'Remera'],
  ['Horebu Medical Clinic', 'General clinic', 'Remera'],
  ['I Care Dental Clinic', 'Dental clinic', 'Kimironko'],
  ['Kigali Citizens Polyclinic', 'Polyclinic', 'Remera'],
  ['Kigali Eye Care Consultants', 'Specialized clinic', 'Remera'],
  ['Clinique Mpore Liberté', 'General clinic', 'Remera'],
  ['Deva Medical Center', 'Polyclinic', 'Remera'],
  ['Isangano Clinic', 'General clinic', 'Gatsata'],
  ['Iramiro Medical Clinic', 'General clinic', 'Rusororo'],
  ['Minas Medical Center', 'Medical centre', 'Gisozi'],
  ['AHN Kigali Dialysis Center', 'Specialized clinic', 'Kimihurura'],
  ['Remera Health Center', 'Health centre', 'Remera'],
  ['Ivuriro Rapha Medical Clinic', 'Medical clinic', 'Kimironko'],
  ['Clinique Sainte Elisa', 'Medical clinic', 'Kimihurura'],
];

// The first version of this seed created two placeholder facilities.
// They are renamed to real ones so accounts and referrals that point at them keep working.
const RENAMED = [
  ['Kacyiru Health Center', 'Kacyiru District Hospital'],
  ['Kimironko District Hospital', 'Kibagabaga Level Two Teaching Hospital'],
];

// Safe to run again: nothing is duplicated, and existing rows are only brought up to date.
async function seed() {
  // Look for the district by name: tests add their own districts to this database.
  let district = await query('SELECT id FROM districts WHERE name = $1 ORDER BY id LIMIT 1', [DISTRICT]);
  if (district.rows.length === 0) {
    district = await query('INSERT INTO districts (name) VALUES ($1) RETURNING id', [DISTRICT]);
  }
  const districtId = district.rows[0].id;

  for (const [oldName, newName] of RENAMED) {
    await query('UPDATE facilities SET name = $1 WHERE district_id = $2 AND name = $3', [newName, districtId, oldName]);
  }

  for (const [name, tier, sector] of FACILITIES) {
    await query(
      `INSERT INTO facilities (district_id, name, tier, sector)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM facilities WHERE district_id = $1 AND name = $2)`,
      [districtId, name, tier, sector]
    );
    await query(
      'UPDATE facilities SET tier = $3, sector = $4 WHERE district_id = $1 AND name = $2',
      [districtId, name, tier, sector]
    );
  }

  // The admin belongs to a facility so that district reports know which district is theirs.
  // An admin that already has a facility keeps it.
  const home = await query(
    'SELECT id FROM facilities WHERE district_id = $1 AND name = $2',
    [districtId, FACILITIES[0][0]]
  );
  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
  await query(
    `INSERT INTO users (username, password_hash, role, facility_id)
     VALUES ('admin', $1, 'district_admin', $2)
     ON CONFLICT (username) DO UPDATE SET facility_id = COALESCE(users.facility_id, EXCLUDED.facility_id)`,
    [passwordHash, home.rows[0].id]
  );

  console.log('Seeded district %s with %d facilities', DISTRICT, FACILITIES.length);
  console.log('Seeded admin user: username=admin password=%s', DEV_ADMIN_PASSWORD);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
