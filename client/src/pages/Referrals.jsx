import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getReferrals, respondToReferral } from '../api/referrals';
import ReferralStatusBadge from '../components/ReferralStatusBadge';

export default function Referrals() {
  const { user } = useAuth();
  const { lastReferralEvent } = useSocket();
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    getReferrals().then(setReferrals);
  }, [lastReferralEvent]);

  async function respond(id, action) {
    await respondToReferral(id, action);
    const result = await getReferrals();
    setReferrals(result);
  }

  return (
    <div>
      <h1>Referrals</h1>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
