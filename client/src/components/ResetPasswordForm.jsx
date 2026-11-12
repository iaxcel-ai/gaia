import { useState } from 'react';
import { resetPassword } from '../api/auth';
import PasswordInput from './PasswordInput';

// Lets a district admin set a new password for a staff member who forgot theirs.
// The admin picks from the registered staff, so the username always exists.
export default function ResetPasswordForm({ staff }) {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (username === '' || newPassword === '') {
      setError('Choose a staff member and enter a new password');
      return;
    }
    try {
      await resetPassword(username, newPassword);
      setMessage(`Password reset for ${username}`);
      setUsername('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Reset a password</h2>
      <label htmlFor="reset-username">Staff member</label>
      <select id="reset-username" value={username} onChange={(e) => setUsername(e.target.value)}>
        <option value="">Choose a staff member</option>
        {staff.map((s) => (
          <option key={s.id} value={s.username}>{s.username}</option>
        ))}
      </select>
      <label htmlFor="reset-password">New password</label>
      <PasswordInput id="reset-password" value={newPassword} onChange={setNewPassword} />
      <button type="submit">Reset password</button>
      {message && <p className="notice">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
