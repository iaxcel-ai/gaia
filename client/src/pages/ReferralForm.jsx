import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createReferral } from '../api/referrals';

export default function ReferralForm() {
  const { facilityId } = useParams();
  const navigate = useNavigate();
  const [patientRef, setPatientRef] = useState('');
  const [condition, setCondition] = useState('');
  const [resourceRequired, setResourceRequired] = useState('');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await createReferral({
        receiving_facility_id: Number(facilityId),
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
    <form onSubmit={handleSubmit}>
      <h1>Send a referral</h1>
      <label htmlFor="patient-ref">Patient</label>
      <input id="patient-ref" value={patientRef} onChange={(e) => setPatientRef(e.target.value)} />
      <label htmlFor="condition">Condition</label>
      <input id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
      <label htmlFor="resource-required">Resource needed</label>
      <input id="resource-required" value={resourceRequired} onChange={(e) => setResourceRequired(e.target.value)} />
      <button type="submit">Send referral</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
