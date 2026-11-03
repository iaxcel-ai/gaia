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
