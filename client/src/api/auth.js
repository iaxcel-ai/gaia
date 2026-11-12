export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Login failed');
  }
  return body;
}

export async function resetPassword(username, newPassword) {
  const token = localStorage.getItem('gaia_token');
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, newPassword }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Password reset failed');
  }
  return body;
}
