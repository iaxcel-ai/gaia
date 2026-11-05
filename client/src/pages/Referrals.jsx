import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getReferrals, respondToReferral } from '../api/referrals';
import ReferralStatusBadge from '../components/ReferralStatusBadge';

export default function Referrals() {
  const { user } = useAuth();
  const { lastReferralEvent } = useSocket();
  const [referrals, setReferrals] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    getReferrals().then(setReferrals).catch((e) => setError(e.message));
  }, [lastReferralEvent]);

  async function respond(id, action) {
    setError(null);
    try {
      await respondToReferral(id, action);
      const result = await getReferrals();
      setReferrals(result);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Referrals</h1>
      {error && <p role="alert">{error}</p>}
      <ul>
        {referrals.map((r) => (
          <li key={r.id}>
            {r.patient_ref} <ReferralStatusBadge status={r.status} />
            {r.status === 'pending' && user.facility_id === r.receiving_facility_id && (
              <>
                <button onClick={() => respond(r.id, 'accept')}>Accept</button>
                <button onClick={() => respond(r.id, 'decline')}>Decline</button>
              </>
            )}
            {r.status === 'accepted' && user.facility_id === r.receiving_facility_id && (
              <button onClick={() => respond(r.id, 'complete')}>Complete</button>
            )}
            {r.status === 'pending' && user.facility_id === r.referring_facility_id && (
              <button onClick={() => respond(r.id, 'cancel')}>Cancel</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
