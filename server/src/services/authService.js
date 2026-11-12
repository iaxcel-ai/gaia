const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '8h';

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function issueToken(user) {
  const { id, username, role, facility_id } = user;
  return jwt.sign({ id, username, role, facility_id }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Shortest password accepted when an account is created or a password is reset.
const MIN_PASSWORD_LENGTH = 7;

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, MIN_PASSWORD_LENGTH };
