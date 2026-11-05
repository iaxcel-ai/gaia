const express = require('express');
const { query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const { writeAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

const router = express.Router();

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { receiving_facility_id, patient_ref, condition, resource_required } = req.body;

  if (!req.user.facility_id) {
    return res.status(400).json({ error: 'You must belong to a facility to create a referral' });
  }
  if (receiving_facility_id === req.user.facility_id) {
    return res.status(400).json({ error: 'Cannot refer to your own facility' });
  }
  if (typeof patient_ref !== 'string' || !patient_ref
    || typeof condition !== 'string' || !condition
    || typeof resource_required !== 'string' || !resource_required) {
    return res.status(400).json({ error: 'patient_ref, condition, and resource_required are required' });
  }

  const facility = await query('SELECT id FROM facilities WHERE id = $1', [receiving_facility_id]);
  if (facility.rows.length === 0) {
    return res.status(400).json({ error: 'Receiving facility not found' });
  }

  const result = await query(
    `INSERT INTO referrals (patient_ref, condition, resource_required, referring_facility_id, receiving_facility_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [patient_ref, condition, resource_required, req.user.facility_id, receiving_facility_id, req.user.id]
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
    `SELECT * FROM referrals
     WHERE referring_facility_id = $1 OR receiving_facility_id = $1
     ORDER BY created_at DESC`,
    [req.user.facility_id]
  );
  res.status(200).json(result.rows);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
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

  const result = await query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
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
  if (referral.status !== rule.requiredStatus) {
    return res.status(409).json({ error: `Referral is not ${rule.requiredStatus}` });
  }

  const updateResult = await query(
    'UPDATE referrals SET status = $1 WHERE id = $2 RETURNING *',
    [rule.newStatus, referral.id]
  );
  const updated = updateResult.rows[0];

  await writeAudit(req.user.id, rule.auditAction);
  await notify(req.app.get('io'), otherFacility(rule, updated), updated);

  res.status(200).json(updated);
}));

module.exports = router;
