const express = require('express');
const { query } = require('../db');
const { hashPassword, verifyPassword, issueToken, MIN_PASSWORD_LENGTH } = require('../services/authService');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = await query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];

  const hash = user ? user.password_hash : null;
  const valid = hash ? await verifyPassword(password, hash) : false;
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Checked after the password, so only the account's owner learns it is deactivated.
  if (!user.active) {
    return res.status(403).json({ error: 'This account has been deactivated. Ask your district admin.' });
  }

  const token = issueToken(user);
  res.status(200).json({
    token,
    user: { id: user.id, username: user.username, role: user.role, facility_id: user.facility_id },
  });
}));

router.post('/logout', (req, res) => {
  res.status(204).end();
});

router.post('/reset-password', requireAuth, requireRole('district_admin'), asyncHandler(async (req, res) => {
  const { username, newPassword } = req.body;
  if (typeof username !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Username and newPassword are required' });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const hash = await hashPassword(newPassword);
  // Only accounts at facilities in the admin's own district can be reset.
  const result = await query(
    `UPDATE users SET password_hash = $1
     WHERE username = $2
       AND facility_id IN (
         SELECT id FROM facilities
         WHERE district_id = (SELECT district_id FROM facilities WHERE id = $3)
       )`,
    [hash, username, req.user.facility_id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.status(200).json({ ok: true });
}));

module.exports = router;
