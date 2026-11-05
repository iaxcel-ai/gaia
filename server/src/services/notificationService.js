const { query } = require('../db');

function sendSms(phoneNumber, message) {
  console.log(`[SMS stub] to ${phoneNumber}: ${message}`);
  return Promise.resolve();
}

async function notify(io, targetFacilityId, referral) {
  const room = `facility:${targetFacilityId}`;
  const hasMember = (io.sockets.adapter.rooms.get(room)?.size || 0) > 0;

  if (hasMember) {
    io.to(room).emit('referral', referral);
    await query('INSERT INTO notifications (referral_id, channel) VALUES ($1, $2)', [referral.id, 'in_app']);
  } else {
    await sendSms('unknown', `New referral for patient ${referral.patient_ref}`);
    await query('INSERT INTO notifications (referral_id, channel) VALUES ($1, $2)', [referral.id, 'sms']);
  }
}

module.exports = { notify, sendSms };
