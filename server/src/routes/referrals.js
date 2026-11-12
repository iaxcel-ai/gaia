const express = require('express');
const { query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const { writeAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

const RESOURCE_TYPES = ['bed', 'specialist', 'supply'];
const DECLINE_REASONS = ['no_bed', 'no_specialist', 'no_supply', 'other'];

const router = express.Router();

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { patient_ref, condition, resource_required } = req.body;
  const receivingFacilityId = Number(req.body.receiving_facility_id);

  if (!req.user.facility_id) {
    return res.status(400).json({ error: 'You must belong to a facility to create a referral' });
  }
  if (!Number.isInteger(receivingFacilityId)) {
    return res.status(400).json({ error: 'A valid receiving_facility_id is required' });
  }
  if (receivingFacilityId === req.user.facility_id) {
    return res.status(400).json({ error: 'Cannot refer to your own facility' });
  }
  if (typeof patient_ref !== 'string' || !patient_ref
    || typeof condition !== 'string' || !condition
    || typeof resource_required !== 'string' || !resource_required) {
    return res.status(400).json({ error: 'patient_ref, condition, and resource_required are required' });
  }

  if (!RESOURCE_TYPES.includes(resource_required)) {
    return res.status(400).json({ error: 'resource_required must be bed, specialist or supply' });
  }

  const facility = await query('SELECT id FROM facilities WHERE id = $1', [receivingFacilityId]);
  if (facility.rows.length === 0) {
    return res.status(400).json({ error: 'Receiving facility not found' });
  }

  const result = await query(
    `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id, receiving_facility_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [patient_ref, condition, resource_required, req.user.facility_id, receivingFacilityId, req.user.id]
  );
  const referral = result.rows[0];

  await writeAudit(req.user.id, 'referral_created');
  await notify(req.app.get('io'), referral.receiving_facility_id, referral);

  res.status(201).json(referral);
}));

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.facility_id) {
    return res.status(200).json([]);
  }

  const result = await query(
    `SELECT r.*, a.name AS referring_facility_name, b.name AS receiving_facility_name
     FROM referrals r
     JOIN facilities a ON a.id = r.referring_facility_id
     JOIN facilities b ON b.id = r.receiving_facility_id
     WHERE r.referring_facility_id = $1 OR r.receiving_facility_id = $1
     ORDER BY r.created_at DESC`,
    [req.user.facility_id]
  );
  res.status(200).json(result.rows);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Referral not found' });
  }

  const result = await query('SELECT * FROM referrals WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Referral not found' });
  }

  const referral = result.rows[0];
  if (req.user.facility_id !== referral.referring_facility_id && req.user.facility_id !== referral.receiving_facility_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.status(200).json(referral);
}));

const ACTIONS = {
  accept: { requiredFacilityRole: 'receiving', requiredStatus: 'pending', newStatus: 'accepted', auditAction: 'referral_accepted' },
  decline: { requiredFacilityRole: 'receiving', requiredStatus: 'pending', newStatus: 'declined', auditAction: 'referral_declined' },
  complete: { requiredFacilityRole: 'receiving', requiredStatus: 'accepted', newStatus: 'completed', auditAction: 'referral_completed' },
  cancel: { requiredFacilityRole: 'referring', requiredStatus: 'pending', newStatus: 'cancelled', auditAction: 'referral_cancelled' },
};

// The outcome of an action is reported back to whichever facility didn't perform it.
function otherFacility(rule, referral) {
  return rule.requiredFacilityRole === 'receiving' ? referral.referring_facility_id : referral.receiving_facility_id;
}

router.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { action } = req.body;
  const rule = ACTIONS[action];
  if (!rule) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  // A decline must say why, so the district can see which shortages turn patients away.
  const reason = action === 'decline' ? req.body.reason : null;
  if (action === 'decline' && !DECLINE_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'A decline needs a reason: no_bed, no_specialist, no_supply or other' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Referral not found' });
  }

  const result = await query('SELECT * FROM referrals WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Referral not found' });
  }
  const referral = result.rows[0];

  const requiredFacilityId = rule.requiredFacilityRole === 'receiving'
    ? referral.receiving_facility_id
    : referral.referring_facility_id;
  if (req.user.facility_id !== requiredFacilityId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updateResult = await query(
    'UPDATE referrals SET status = $1, decline_reason = $4 WHERE id = $2 AND status = $3 RETURNING *',
    [rule.newStatus, referral.id, rule.requiredStatus, reason]
  );
  if (updateResult.rows.length === 0) {
    return res.status(409).json({ error: `Referral is not ${rule.requiredStatus}` });
  }
  const updated = updateResult.rows[0];

  await writeAudit(req.user.id, rule.auditAction);
  await notify(req.app.get('io'), otherFacility(rule, updated), updated);

  res.status(200).json(updated);
}));

module.exports = router;
