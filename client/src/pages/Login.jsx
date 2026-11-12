import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildingOffice2Icon, ArrowsRightLeftIcon, SignalIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';

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
    <div className="login-page">
      {/* Left: what Gaia is. Right: the login form. They stack on a phone. */}
      <aside className="login-brand">
        <div className="login-name">
          <Logo size={44} />
          <h1>Gaia</h1>
        </div>
        <p className="login-lead">The right care, at the right facility.</p>
        <ul>
          <li><BuildingOffice2Icon className="icon" />See beds, specialists and supplies across your district</li>
          <li><ArrowsRightLeftIcon className="icon" />Send referrals and follow them as they are answered</li>
          <li><SignalIcon className="icon" />Built for small screens and slow connections</li>
        </ul>
      </aside>

      <form className="login" onSubmit={handleSubmit}>
        <h2>Log in</h2>
        <p className="tagline">Use the account your district admin gave you.</p>
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
    </div>
  );
}
