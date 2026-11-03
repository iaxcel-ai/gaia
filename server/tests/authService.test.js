const { hashPassword, verifyPassword, issueToken, verifyToken } = require('../src/services/authService');

test('hashPassword then verifyPassword succeeds for the right password', async () => {
  const hash = await hashPassword('correct-horse');
  expect(await verifyPassword('correct-horse', hash)).toBe(true);
});

test('verifyPassword fails for the wrong password', async () => {
  const hash = await hashPassword('correct-horse');
  expect(await verifyPassword('wrong-password', hash)).toBe(false);
});

test('issueToken then verifyToken round-trips the user payload', () => {
  const user = { id: 1, username: 'admin', role: 'district_admin', facility_id: null };
  const token = issueToken(user);
  expect(verifyToken(token)).toMatchObject(user);
});

test('verifyToken returns null for a malformed token', () => {
  expect(verifyToken('not-a-real-token')).toBeNull();
});
