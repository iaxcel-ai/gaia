const { query } = require('../db');

function writeAudit(userId, action) {
  return query('INSERT INTO audit_log (user_id, action) VALUES ($1, $2)', [userId, action]);
}

module.exports = { writeAudit };
