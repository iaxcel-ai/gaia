const express = require('express');
const { query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

const router = express.Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await query('SELECT id, name, tier, district_id FROM facilities ORDER BY id');
  res.status(200).json(result.rows);
}));

router.get('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const facilityId = Number(req.params.id);
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

module.exports = router;
