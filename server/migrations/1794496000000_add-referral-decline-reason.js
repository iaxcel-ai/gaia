/**
 * Records why a referral was declined (for example no bed available),
 * so the district report can show which shortages turn patients away.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('referrals', {
    decline_reason: {
      type: 'text',
      check: "decline_reason IN ('no_bed', 'no_specialist', 'no_supply', 'other')",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('referrals', 'decline_reason');
};
