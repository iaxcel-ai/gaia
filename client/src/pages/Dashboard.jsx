import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFacilities, getFacilityStatus } from '../api/facilities';
import ResourceCard from '../components/ResourceCard';

export default function Dashboard() {
  const { user } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState(user.facility_id);
  const [status, setStatus] = useState([]);

  useEffect(() => {
    getFacilities().then(setFacilities);
  }, []);

  useEffect(() => {
    getFacilityStatus(selectedFacilityId).then((result) => setStatus(result.status));
  }, [selectedFacilityId]);

  return (
    <div>
      <label htmlFor="facility-select">Facility</label>
      <select
        id="facility-select"
        value={selectedFacilityId}
        onChange={(e) => setSelectedFacilityId(Number(e.target.value))}
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>

      {status.map((s) => (
        <ResourceCard key={s.type} type={s.type} quantity={s.quantity} stale={s.stale} />
      ))}
    </div>
  );
}
