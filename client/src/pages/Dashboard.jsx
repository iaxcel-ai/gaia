import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  const [error, setError] = useState(null);

  useEffect(() => {
    getFacilities().then(setFacilities).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedFacilityId == null) return;
    getFacilityStatus(selectedFacilityId)
      .then((result) => setStatus(result.status))
      .catch((e) => setError(e.message));
  }, [selectedFacilityId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (quantity === '') return;
    setError(null);
    try {
      await updateFacilityStatus(selectedFacilityId, updateType, Number(quantity));
      const result = await getFacilityStatus(selectedFacilityId);
      setStatus(result.status);
    } catch (err) {
      setError(err.message);
    }
  }

  const adminLinks = user.role === 'district_admin' && (
    <>
      <Link to="/reports">District report</Link>
      <Link to="/admin/users">Staff accounts</Link>
    </>
  );

  if (selectedFacilityId == null) {
    return (
      <div>
        <nav className="links">{adminLinks}</nav>
        <p>Select a facility to get started.</p>
      </div>
    );
  }

  return (
    <div>
      <nav className="links">
        <Link to="/referrals">Referrals</Link>
        {adminLinks}
      </nav>
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

      <ul className="rows">
        {facilities.filter((f) => f.id !== user.facility_id).map((f) => (
          <li key={f.id}>
            {f.name} <Link to={`/referrals/new/${f.id}`}>Refer patient here</Link>
          </li>
        ))}
      </ul>

      {error && <p role="alert">{error}</p>}

      <div className="resources">
        {RESOURCE_TYPES.map((t) => {
          const entry = status.find((s) => s.type === t);
          return entry
            ? <ResourceCard key={t} type={entry.type} quantity={entry.quantity} stale={entry.stale} />
            : <p key={t} className="resource">{t}: no data</p>;
        })}
      </div>

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
