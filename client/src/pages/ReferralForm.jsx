import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createReferral } from '../api/referrals';
import { getFacilities, getFacilityStatus } from '../api/facilities';
import ResourceCard from '../components/ResourceCard';

const RESOURCE_TYPES = ['bed', 'specialist', 'supply'];

export default function ReferralForm() {
  const { facilityId } = useParams();
  const receivingId = Number(facilityId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [status, setStatus] = useState([]);
  const [patientRef, setPatientRef] = useState('');
  const [condition, setCondition] = useState('');
  const [resourceRequired, setResourceRequired] = useState(RESOURCE_TYPES[0]);
  const [error, setError] = useState(null);

  // Load the facility names and what the receiving facility has right now,
  // so the referral is based on what it can actually provide.
  useEffect(() => {
    getFacilities().then(setFacilities).catch((e) => setError(e.message));
    getFacilityStatus(receivingId)
      .then((result) => setStatus(result.status))
      .catch((e) => setError(e.message));
  }, [receivingId]);

  const referring = facilities.find((f) => f.id === user.facility_id);
  const receiving = facilities.find((f) => f.id === receivingId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await createReferral({
        receiving_facility_id: receivingId,
        patient_ref: patientRef,
        condition,
        resource_required: resourceRequired,
      });
      navigate('/referrals');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Send a referral</h1>
      <div className="columns">
        <form onSubmit={handleSubmit}>
          <dl>
            <dt>From</dt>
            <dd>{referring ? referring.name : ''}</dd>
            <dt>To</dt>
            <dd>{receiving ? receiving.name : ''}</dd>
          </dl>
          <label htmlFor="patient-ref">Patient reference</label>
          <input id="patient-ref" value={patientRef} onChange={(e) => setPatientRef(e.target.value)} />
          <small>Use the patient's file number or initials, not their full name.</small>
          <label htmlFor="condition">Condition</label>
          <input id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
          <label htmlFor="resource-required">Resource needed</label>
          <select
            id="resource-required"
            value={resourceRequired}
            onChange={(e) => setResourceRequired(e.target.value)}
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="submit">Send referral</button>
          {error && <p role="alert">{error}</p>}
        </form>

        <section>
          <h2>Available at {receiving ? receiving.name : 'this facility'}</h2>
          <div className="resources">
            {RESOURCE_TYPES.map((t) => {
              const entry = status.find((s) => s.type === t);
              return entry
                ? <ResourceCard key={t} type={entry.type} quantity={entry.quantity} stale={entry.stale} updatedAt={entry.updated_at} />
                : <p key={t} className="resource">{t}: no data</p>;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
