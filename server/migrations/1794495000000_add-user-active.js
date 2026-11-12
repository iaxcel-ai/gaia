/**
 * Lets a district admin deactivate a staff account instead of deleting it,
 * so the referrals and audit history of someone who has left are kept.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('users', { active: { type: 'boolean', notNull: true, default: true } });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('users', 'active');
};
