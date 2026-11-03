import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFacilities, getFacilityStatus, updateFacilityStatus } from '../api/facilities';
import ResourceCard from '../components/ResourceCard';

const RESOURCE_TYPES = ['bed', 'specialist', 'supply'];

export default function Dashboard() {
  const { user } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState(user.facility_id);
  const [status, setStatus] = useState([]);
  const [updateType, setUpdateType] = useState(RESOURCE_TYPES[0]);
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    getFacilities().then(setFacilities);
  }, []);

  useEffect(() => {
    getFacilityStatus(selectedFacilityId).then((result) => setStatus(result.status));
  }, [selectedFacilityId]);

  async function handleSubmit(e) {
    e.preventDefault();
    await updateFacilityStatus(selectedFacilityId, updateType, Number(quantity));
    const result = await getFacilityStatus(selectedFacilityId);
    setStatus(result.status);
  }

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

      {selectedFacilityId === user.facility_id && (
        <form onSubmit={handleSubmit}>
          <label htmlFor="update-type">Type</label>
          <select id="update-type" value={updateType} onChange={(e) => setUpdateType(e.target.value)}>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label htmlFor="update-quantity">Quantity</label>
          <input
            id="update-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <button type="submit">Update</button>
        </form>
      )}
    </div>
  );
}
