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
      {referrals.length === 0 && !error && (
        <p className="empty">No referrals yet. To send one, pick a facility on the dashboard.</p>
      )}
      <ul className="rows">
        {referrals.map((r) => (
          <li key={r.id}>
            {/* Click a referral to open it and see what it is about. */}
            <details>
              <summary>
                <span>{r.patient_ref}</span>
                <ReferralStatusBadge status={r.status} />
                <small>
                  {user.facility_id === r.referring_facility_id
                    ? `To ${r.receiving_facility_name}`
                    : `From ${r.referring_facility_name}`}
                </small>
              </summary>
              <dl>
                <dt>Condition</dt>
                <dd>{r.condition}</dd>
                <dt>Resource needed</dt>
                <dd>{r.resource_required}</dd>
                <dt>From</dt>
                <dd>{r.referring_facility_name}</dd>
                <dt>To</dt>
                <dd>{r.receiving_facility_name}</dd>
                <dt>Sent</dt>
                <dd>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</dd>
              </dl>
              <div className="actions">
                {r.status === 'pending' && user.facility_id === r.receiving_facility_id && (
                  <>
                    <button onClick={() => respond(r.id, 'accept')}>Accept</button>
                    <button className="secondary" onClick={() => respond(r.id, 'decline')}>Decline</button>
                  </>
                )}
                {r.status === 'accepted' && user.facility_id === r.receiving_facility_id && (
                  <button onClick={() => respond(r.id, 'complete')}>Complete</button>
                )}
                {r.status === 'pending' && user.facility_id === r.referring_facility_id && (
                  <button className="secondary" onClick={() => respond(r.id, 'cancel')}>Cancel</button>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
