import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="login" onSubmit={handleSubmit}>
      <h1>Gaia</h1>
      <p className="tagline">Referrals and resources across your district.</p>
      <label htmlFor="username">Username</label>
      <input
        id="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" value={password} onChange={setPassword} />
      <button type="submit">Log in</button>
      {error && <p role="alert">{error}</p>}

      {/* Accounts and password resets go through the district admin (SRS: admin-assisted). */}
      <details>
        <summary>Forgot password?</summary>
        <p>Your district admin can reset your password. Ask them to set a new one for your username.</p>
      </details>
      <details>
        <summary>Need an account?</summary>
        <p>Accounts are created by your district admin. Ask them to add you to your facility.</p>
      </details>
    </form>
  );
}
