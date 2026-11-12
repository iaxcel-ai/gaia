import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="password-row">
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className="secondary"
          aria-label={showPassword ? 'Hide' : 'Show'}
          title={showPassword ? 'Hide password' : 'Show password'}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeSlashIcon className="icon" /> : <EyeIcon className="icon" />}
        </button>
      </div>
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
