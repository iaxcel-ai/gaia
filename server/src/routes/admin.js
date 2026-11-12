const express = require('express');
const { query } = require('../db');
const { hashPassword } = require('../services/authService');
const { writeAudit } = require('../services/auditService');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const asyncHandler = require('../middleware/asyncHandler');

const STAFF_ROLES = ['chw', 'nurse'];
const MAX_PG_INTEGER = 2147483647;
const UNIQUE_VIOLATION = '23505';

const router = express.Router();

// Lists the staff accounts in the admin's own district, never the password hashes.
router.get('/users', requireAuth, requireRole('district_admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.username, u.role, u.facility_id, f.name AS facility_name, u.active
     FROM users u
     JOIN facilities f ON f.id = u.facility_id
     WHERE f.district_id = (SELECT district_id FROM facilities WHERE id = $1)
     ORDER BY u.username`,
    [req.user.facility_id]
  );
  res.status(200).json(result.rows);
}));

router.post('/users', requireAuth, requireRole('district_admin'), asyncHandler(async (req, res) => {
  const { password, role, facility_id: facilityId } = req.body;
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const validFacilityId = Number.isInteger(facilityId) && facilityId > 0 && facilityId <= MAX_PG_INTEGER;
  if (
    username === '' ||
    typeof password !== 'string' || password === '' ||
    !STAFF_ROLES.includes(role) || !validFacilityId
  ) {
    return res.status(400).json({ error: 'username, password, role (chw or nurse) and facility_id are required' });
  }

  const facility = await query('SELECT district_id FROM facilities WHERE id = $1', [facilityId]);
  if (facility.rows.length === 0) {
    return res.status(400).json({ error: 'Facility not found' });
  }

  // An admin may only create accounts at facilities in their own district.
  const own = await query('SELECT district_id FROM facilities WHERE id = $1', [req.user.facility_id]);
  if (own.rows.length === 0 || own.rows[0].district_id !== facility.rows[0].district_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const hash = await hashPassword(password);
  let result;
  try {
    result = await query(
      `INSERT INTO users (username, password_hash, role, facility_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, facility_id`,
      [username, hash, role, facilityId]
    );
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    throw err;
  }

  await writeAudit(req.user.id, 'user_created');
  res.status(201).json(result.rows[0]);
}));

// Deactivates or reactivates a staff account. Accounts are never deleted,
// so the referrals and audit history of someone who has left are kept.
router.patch('/users/:id', requireAuth, requireRole('district_admin'), asyncHandler(async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || id > MAX_PG_INTEGER) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  // Only staff (not other admins) at facilities in the admin's own district can be changed.
  const result = await query(
    `UPDATE users SET active = $1
     WHERE id = $2
       AND role <> 'district_admin'
       AND facility_id IN (
         SELECT id FROM facilities
         WHERE district_id = (SELECT district_id FROM facilities WHERE id = $3)
       )
     RETURNING id, username, active`,
    [active, id, req.user.facility_id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  await writeAudit(req.user.id, active ? 'user_reactivated' : 'user_deactivated');
  res.status(200).json(result.rows[0]);
}));

module.exports = router;
