function authHeaders() {
  const token = localStorage.getItem('gaia_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
}

export async function createUser(body) {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function getStaff() {
  const res = await fetch('/api/admin/users', { headers: authHeaders() });
  return handle(res);
}
