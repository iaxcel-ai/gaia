import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFacilities } from '../api/facilities';
import { createUser, getStaff, setStaffActive } from '../api/admin';
import PasswordInput from '../components/PasswordInput';
import ResetPasswordForm from '../components/ResetPasswordForm';

const STAFF_ROLES = ['chw', 'nurse'];

export default function AdminUsers() {
  const { user } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [staff, setStaff] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(STAFF_ROLES[0]);
  const [facilityId, setFacilityId] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  function loadStaff() {
    return getStaff().then(setStaff).catch((e) => setError(e.message));
  }

  useEffect(() => {
    getFacilities().then(setFacilities).catch((e) => setError(e.message));
    loadStaff();
  }, []);

  // The server only accepts facilities in the admin's own district, so only offer those.
  const own = facilities.find((f) => f.id === user.facility_id);
  const districtFacilities = own ? facilities.filter((f) => f.district_id === own.district_id) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!facilityId) {
      setError('Choose a facility');
      return;
    }
    try {
      const created = await createUser({ username, password, role, facility_id: Number(facilityId) });
      setMessage(`Account created for ${created.username}`);
      setUsername('');
      setPassword('');
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  }

  // Deactivating keeps the account and its history but stops it logging in.
  async function changeActive(staffMember, active) {
    setMessage(null);
    setError(null);
    try {
      await setStaffActive(staffMember.id, active);
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Staff accounts</h1>
      <div className="columns">
        <form onSubmit={handleSubmit}>
          <h2>Create a staff account</h2>
          <label htmlFor="new-username">Username</label>
          <input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="new-password">Password</label>
          <PasswordInput id="new-password" value={password} onChange={setPassword} />
          <label htmlFor="new-role">Role</label>
          <select id="new-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label htmlFor="new-facility">Facility</label>
          <select id="new-facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            <option value="">Choose a facility</option>
            {districtFacilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button type="submit">Create account</button>
          {message && <p className="notice">{message}</p>}
          {error && <p role="alert">{error}</p>}
        </form>

        <ResetPasswordForm staff={staff} />
      </div>

      <section className="panel staff">
        <h2>Registered staff ({staff.length})</h2>
        {staff.length === 0 ? (
          <p>No staff accounts yet. Create the first one above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Facility</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.username}</td>
                  <td>{s.role}</td>
                  <td>{s.facility_name}</td>
                  <td>{s.active ? 'Active' : 'Deactivated'}</td>
                  <td>
                    {/* Admin accounts, including your own, cannot be deactivated here. */}
                    {s.role !== 'district_admin' && (
                      <button className="secondary" onClick={() => changeActive(s, !s.active)}>
                        {s.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
