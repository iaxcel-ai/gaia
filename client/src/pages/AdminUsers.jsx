import { useState, useEffect } from 'react';
import { getFacilities } from '../api/facilities';
import { createUser } from '../api/admin';

const STAFF_ROLES = ['chw', 'nurse'];

export default function AdminUsers() {
  const [facilities, setFacilities] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(STAFF_ROLES[0]);
  const [facilityId, setFacilityId] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getFacilities().then(setFacilities).catch((e) => setError(e.message));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const created = await createUser({ username, password, role, facility_id: Number(facilityId) });
      setMessage(`Account created for ${created.username}`);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Create a staff account</h1>
      <label htmlFor="new-username">Username</label>
      <input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="new-password">Password</label>
      <input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="new-role">Role</label>
      <select id="new-role" value={role} onChange={(e) => setRole(e.target.value)}>
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <label htmlFor="new-facility">Facility</label>
      <select id="new-facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
        <option value="">Choose a facility</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
      <button type="submit">Create account</button>
      {message && <p>{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
