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

module.exports = router;
