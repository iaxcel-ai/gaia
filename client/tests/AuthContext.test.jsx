import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { login as loginRequest } from '../src/api/auth';

vi.mock('../src/api/auth');

let store;

// The test environment has no working localStorage, so use a small in-memory one.
beforeEach(() => {
  vi.resetAllMocks();
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  });
});

// Builds a token whose middle part says when it expires, like the server's tokens.
function tokenExpiringIn(seconds) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.signature`;
}

function Probe() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <p>{user ? `Logged in as ${user.username}` : 'Logged out'}</p>
      <button onClick={() => login('nurse1', 'secret')}>Log in</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
}

function renderProbe() {
  return render(<AuthProvider><Probe /></AuthProvider>);
}

test('a saved login is restored, so a refresh does not log the user out', () => {
  store.gaia_token = tokenExpiringIn(3600);
  store.gaia_user = JSON.stringify({ username: 'nurse1', role: 'nurse', facility_id: 1 });
  renderProbe();
  expect(screen.getByText('Logged in as nurse1')).toBeInTheDocument();
});

test('an expired saved login is cleared', () => {
  store.gaia_token = tokenExpiringIn(-60);
  store.gaia_user = JSON.stringify({ username: 'nurse1' });
  renderProbe();
  expect(screen.getByText('Logged out')).toBeInTheDocument();
  expect(store.gaia_token).toBeUndefined();
  expect(store.gaia_user).toBeUndefined();
});

test('logging in saves the login and logging out removes it', async () => {
  loginRequest.mockResolvedValue({ token: tokenExpiringIn(3600), user: { username: 'nurse1' } });
  renderProbe();
  expect(screen.getByText('Logged out')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByText('Logged in as nurse1')).toBeInTheDocument();
  expect(JSON.parse(store.gaia_user)).toEqual({ username: 'nurse1' });

  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(screen.getByText('Logged out')).toBeInTheDocument();
  expect(store.gaia_user).toBeUndefined();
});
