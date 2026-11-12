const express = require('express');
const { query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const asyncHandler = require('../middleware/asyncHandler');

const MAX_PG_INTEGER = 2147483647;
const GAP_WINDOW_DAYS = 30;
const RECURRING_GAP_MIN = 2;

const router = express.Router();

// Ranks the district's facilities by how many referrals they sent or received.
// column is a fixed name chosen in this file, never user input.
function topFacilities(column, districtId) {
  return query(
    `SELECT f.id AS facility_id, f.name, COUNT(*)::int AS count
     FROM referrals r
     JOIN facilities f ON f.id = r.${column}
     WHERE f.district_id = $1
     GROUP BY f.id, f.name
     ORDER BY count DESC, f.id`,
    [districtId]
  );
}

router.get('/district/:id', requireAuth, requireRole('district_admin'), asyncHandler(async (req, res) => {
  const districtId = Number(req.params.id);
  if (!Number.isInteger(districtId) || districtId <= 0 || districtId > MAX_PG_INTEGER) {
    return res.status(404).json({ error: 'District not found' });
  }

  const district = await query('SELECT id FROM districts WHERE id = $1', [districtId]);
  if (district.rows.length === 0) {
    return res.status(404).json({ error: 'District not found' });
  }

  // An admin may only see the district their own facility belongs to.
  const own = await query('SELECT district_id FROM facilities WHERE id = $1', [req.user.facility_id]);
  if (own.rows.length === 0 || own.rows[0].district_id !== districtId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const statusCounts = await query(
    `SELECT r.status, COUNT(*)::int AS count
     FROM referrals r
     WHERE r.referring_facility_id IN (SELECT id FROM facilities WHERE district_id = $1)
        OR r.receiving_facility_id IN (SELECT id FROM facilities WHERE district_id = $1)
     GROUP BY r.status`,
    [districtId]
  );
  const byStatus = { pending: 0, accepted: 0, declined: 0, completed: 0, cancelled: 0 };
  let total = 0;
  for (const row of statusCounts.rows) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  // Share of answered referrals (accepted, declined or completed) that were declined, as a whole percent.
  const answered = byStatus.accepted + byStatus.declined + byStatus.completed;
  const declineRate = answered === 0 ? 0 : Math.round((byStatus.declined / answered) * 100);

  // Facilities in the district that declined referrals, with how many they received in total.
  const topDeclining = await query(
    `SELECT f.id AS facility_id, f.name,
            COUNT(*) FILTER (WHERE r.status = 'declined')::int AS declined,
            COUNT(*)::int AS received
     FROM referrals r
     JOIN facilities f ON f.id = r.receiving_facility_id
     WHERE f.district_id = $1
     GROUP BY f.id, f.name
     HAVING COUNT(*) FILTER (WHERE r.status = 'declined') > 0
     ORDER BY declined DESC, f.id`,
    [districtId]
  );

  // Why referrals to this district's facilities were declined.
  const reasons = await query(
    `SELECT r.decline_reason AS reason, COUNT(*)::int AS count
     FROM referrals r
     JOIN facilities f ON f.id = r.receiving_facility_id
     WHERE f.district_id = $1 AND r.status = 'declined' AND r.decline_reason IS NOT NULL
     GROUP BY r.decline_reason
     ORDER BY count DESC, r.decline_reason`,
    [districtId]
  );

  const topReferring = await topFacilities('referring_facility_id', districtId);
  const topReceiving = await topFacilities('receiving_facility_id', districtId);

  const gaps = await query(
    `SELECT f.id AS facility_id, f.name, rs.type, COUNT(*)::int AS zero_count
     FROM resource_status rs
     JOIN facilities f ON f.id = rs.facility_id
     WHERE f.district_id = $1
       AND rs.quantity = 0
       AND rs.updated_at > now() - make_interval(days => $2)
     GROUP BY f.id, f.name, rs.type
     HAVING COUNT(*) >= $3
     ORDER BY zero_count DESC, f.id, rs.type`,
    [districtId, GAP_WINDOW_DAYS, RECURRING_GAP_MIN]
  );

  res.status(200).json({
    district_id: districtId,
    referrals: { total, by_status: byStatus, decline_rate: declineRate },
    top_referring: topReferring.rows,
    top_receiving: topReceiving.rows,
    top_declining: topDeclining.rows,
    decline_reasons: reasons.rows,
    resource_gaps: gaps.rows,
  });
}));

module.exports = router;
