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

  const welcome = (
    <>
      <h1>Hello{user.username ? `, ${user.username}` : ' there'}</h1>
      <p className="tagline">See what each facility has available, and refer patients where there is capacity.</p>
    </>
  );

  if (selectedFacilityId == null) {
    return (
      <div>
        {welcome}
        <p className="empty">Select a facility to get started.</p>
      </div>
    );
  }

  return (
    <div>
      {welcome}
      <div className="columns">
        <section>
          <h2>Resources</h2>
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
              <h2>Update your facility</h2>
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
        </section>

        <section>
          <h2>Refer a patient</h2>
          <ul className="rows scroll">
            {facilities.filter((f) => f.id !== user.facility_id).map((f) => (
              <li key={f.id}>
                <span>
                  {f.name}
                  <small>{[f.tier, f.sector].filter(Boolean).join(', ')}</small>
                </span>
                <Link to={`/referrals/new/${f.id}`}>Refer patient here</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
