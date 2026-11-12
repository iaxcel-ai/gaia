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

export async function createReferral(body) {
  const res = await fetch('/api/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function getReferrals() {
  const res = await fetch('/api/referrals', { headers: authHeaders() });
  return handle(res);
}

export async function getReferral(id) {
  const res = await fetch(`/api/referrals/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function respondToReferral(id, action, reason) {
  const res = await fetch(`/api/referrals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ action, reason }),
  });
  return handle(res);
}
