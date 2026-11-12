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

export async function getDistrictReport(districtId) {
  const res = await fetch(`/api/reports/district/${districtId}`, { headers: authHeaders() });
  return handle(res);
}
