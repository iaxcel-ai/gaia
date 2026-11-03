const express = require('express');
const { query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const VALID_TYPES = ['bed', 'specialist', 'supply'];
const MAX_PG_INTEGER = 2147483647;

function isValidFacilityId(id) {
  return Number.isInteger(id) && id > 0 && id <= MAX_PG_INTEGER;
}

const router = express.Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await query('SELECT id, name, tier, district_id FROM facilities ORDER BY id');
  res.status(200).json(result.rows);
}));

router.get('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const facilityId = Number(req.params.id);
  if (!isValidFacilityId(facilityId)) {
    return res.status(404).json({ error: 'Facility not found' });
  }

  const facility = await query('SELECT id FROM facilities WHERE id = $1', [facilityId]);
  if (facility.rows.length === 0) {
    return res.status(404).json({ error: 'Facility not found' });
  }

  const result = await query(
    `SELECT DISTINCT ON (type) type, quantity, updated_at
     FROM resource_status
     WHERE facility_id = $1
     ORDER BY type, updated_at DESC`,
    [facilityId]
  );

  const status = result.rows.map((row) => ({
    type: row.type,
    quantity: row.quantity,
    updated_at: row.updated_at,
    stale: Date.now() - new Date(row.updated_at).getTime() > STALE_THRESHOLD_MS,
  }));

  res.status(200).json({ facility_id: facilityId, status });
}));

router.put('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const { type, quantity } = req.body;
  if (!VALID_TYPES.includes(type) || !Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: 'Invalid type or quantity' });
  }

  const facilityId = Number(req.params.id);
  if (req.user.facility_id !== facilityId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await query(
    `INSERT INTO resource_status (facility_id, type, quantity)
     VALUES ($1, $2, $3)
     RETURNING type, quantity, updated_at`,
    [facilityId, type, quantity]
  );

  const row = result.rows[0];
  res.status(201).json({ type: row.type, quantity: row.quantity, updated_at: row.updated_at, stale: false });
}));

module.exports = router;
