import { useState } from 'react';
import { resetPassword } from '../api/auth';

// Lets a district admin set a new password for a staff member who forgot theirs.
export default function ResetPasswordForm() {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (username.trim() === '' || newPassword === '') {
      setError('Enter a username and a new password');
      return;
    }
    try {
      await resetPassword(username.trim(), newPassword);
      setMessage(`Password reset for ${username.trim()}`);
      setUsername('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Reset a password</h2>
      <label htmlFor="reset-username">Staff username</label>
      <input id="reset-username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="reset-password">New password</label>
      <input
        id="reset-password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <button type="submit">Reset password</button>
      {message && <p className="notice">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
