import { useState, useEffect } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getReferrals, respondToReferral } from '../api/referrals';
import { DECLINE_REASONS } from '../declineReasons';
import ReferralStatusBadge from '../components/ReferralStatusBadge';

export default function Referrals() {
  const { user } = useAuth();
  const { lastReferralEvent } = useSocket();
  const [referrals, setReferrals] = useState([]);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  // The referral being declined (if any) and the reason chosen for it.
  const [decliningId, setDecliningId] = useState(null);
  const [reason, setReason] = useState('no_bed');

  useEffect(() => {
    getReferrals().then(setReferrals).catch((e) => setError(e.message));
  }, [lastReferralEvent]);

  // Only a decline carries a reason.
  async function respond(id, action, declineReason) {
    setError(null);
    try {
      if (declineReason) {
        await respondToReferral(id, action, declineReason);
      } else {
        await respondToReferral(id, action);
      }
      setDecliningId(null);
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
            {/* Click a referral to open it and see what it is about; click again to close it. */}
            <div className={openId === r.id ? 'collapse open' : 'collapse'}>
              <button
                className="row-toggle"
                aria-expanded={openId === r.id}
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
              >
                <ChevronDownIcon className="icon chevron" />
                <span>{r.patient_ref}</span>
                <ReferralStatusBadge status={r.status} />
                <small>
                  {user.facility_id === r.referring_facility_id
                    ? `To ${r.receiving_facility_name}`
                    : `From ${r.referring_facility_name}`}
                </small>
              </button>
              {/* The outer div animates the height, the inner one holds the content. */}
              <div className="collapse-body">
              <div>
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
                {r.decline_reason && (
                  <>
                    <dt>Declined because</dt>
                    <dd>{DECLINE_REASONS[r.decline_reason]}</dd>
                  </>
                )}
              </dl>

              {decliningId === r.id ? (
                // Declining asks for a reason first, so the district can see what turns patients away.
                <div className="actions">
                  <label htmlFor={`reason-${r.id}`}>Why are you declining?</label>
                  <select id={`reason-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {Object.entries(DECLINE_REASONS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button onClick={() => respond(r.id, 'decline', reason)}>Confirm decline</button>
                  <button className="secondary" onClick={() => setDecliningId(null)}>Back</button>
                </div>
              ) : (
                <div className="actions">
                  {r.status === 'pending' && user.facility_id === r.receiving_facility_id && (
                    <>
                      <button onClick={() => respond(r.id, 'accept')}>Accept</button>
                      <button className="secondary" onClick={() => setDecliningId(r.id)}>Decline</button>
                    </>
                  )}
                  {r.status === 'accepted' && user.facility_id === r.receiving_facility_id && (
                    <button onClick={() => respond(r.id, 'complete')}>Complete</button>
                  )}
                  {r.status === 'pending' && user.facility_id === r.referring_facility_id && (
                    <button className="secondary" onClick={() => respond(r.id, 'cancel')}>Cancel</button>
                  )}
                </div>
              )}
              </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
