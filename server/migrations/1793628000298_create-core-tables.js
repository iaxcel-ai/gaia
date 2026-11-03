/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable('districts', {
    id: 'id',
    name: { type: 'text', notNull: true },
  });

  pgm.createTable('facilities', {
    id: 'id',
    district_id: {
      type: 'integer',
      notNull: true,
      references: 'districts',
      onDelete: 'cascade',
    },
    name: { type: 'text', notNull: true },
    tier: { type: 'text', notNull: true },
    phone_number: { type: 'text' },
  });

  pgm.createTable('users', {
    id: 'id',
    facility_id: {
      type: 'integer',
      references: 'facilities',
      onDelete: 'cascade',
    },
    username: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: {
      type: 'text',
      notNull: true,
      check: "role IN ('chw', 'nurse', 'district_admin')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('resource_status', {
    id: 'id',
    facility_id: {
      type: 'integer',
      notNull: true,
      references: 'facilities',
      onDelete: 'cascade',
    },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('bed', 'specialist', 'supply')",
    },
    quantity: { type: 'integer', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('referrals', {
    id: 'id',
    patient_ref: { type: 'text', notNull: true },
    condition: { type: 'text', notNull: true },
    resource_required: { type: 'text', notNull: true },
    referring_facility_id: {
      type: 'integer',
      notNull: true,
      references: 'facilities',
    },
    receiving_facility_id: {
      type: 'integer',
      notNull: true,
      references: 'facilities',
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')",
    },
    created_by: {
      type: 'integer',
      notNull: true,
      references: 'users',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('notifications', {
    id: 'id',
    referral_id: {
      type: 'integer',
      notNull: true,
      references: 'referrals',
      onDelete: 'cascade',
    },
    channel: {
      type: 'text',
      notNull: true,
      check: "channel IN ('in_app', 'sms')",
    },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('audit_log', {
    id: 'id',
    user_id: {
      type: 'integer',
      references: 'users',
    },
    action: { type: 'text', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('audit_log');
  pgm.dropTable('notifications');
  pgm.dropTable('referrals');
  pgm.dropTable('resource_status');
  pgm.dropTable('users');
  pgm.dropTable('facilities');
  pgm.dropTable('districts');
};
