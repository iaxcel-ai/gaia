const { isUniqueViolation } = require('../src/db');

test('isUniqueViolation returns true for a postgres unique-violation error', () => {
  expect(isUniqueViolation({ code: '23505' })).toBe(true);
});

test('isUniqueViolation returns false for other errors', () => {
  expect(isUniqueViolation({ code: '23503' })).toBe(false);
  expect(isUniqueViolation(new Error('boom'))).toBe(false);
});
