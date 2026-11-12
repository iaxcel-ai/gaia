/**
 * Adds the sector a facility is in (for example Remera or Kacyiru),
 * so staff can tell facilities apart when choosing where to refer a patient.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('facilities', { sector: { type: 'text' } });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('facilities', 'sector');
};
