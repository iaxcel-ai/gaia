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

export async function getFacilities() {
  const res = await fetch('/api/facilities', { headers: authHeaders() });
  return handle(res);
}

export async function getFacilityStatus(id) {
  const res = await fetch(`/api/facilities/${id}/status`, { headers: authHeaders() });
  return handle(res);
}

export async function updateFacilityStatus(id, type, quantity) {
  const res = await fetch(`/api/facilities/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ type, quantity }),
  });
  return handle(res);
}
