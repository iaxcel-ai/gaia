const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function query(text, params) {
  return pool.query(text, params);
}

function isUniqueViolation(err) {
  return Boolean(err) && err.code === '23505';
}

function closePool() {
  return pool.end();
}

module.exports = { query, isUniqueViolation, closePool };
