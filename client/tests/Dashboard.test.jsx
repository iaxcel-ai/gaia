import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import Dashboard from '../src/pages/Dashboard';
import { getFacilities, getFacilityStatus } from '../src/api/facilities';

vi.mock('../src/api/facilities');

function renderWithAuth(user) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <Dashboard />
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('on load, shows the user\'s own facility status', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('5')).toBeInTheDocument();
});

test('selecting another facility from the network list shows its status read-only', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockImplementation((id) =>
    Promise.resolve(id === 2
      ? { facility_id: 2, status: [{ type: 'supply', quantity: 9, stale: false }] }
      : { facility_id: 1, status: [] })
  );
  renderWithAuth({ facility_id: 1 });
  await userEvent.selectOptions(await screen.findByLabelText(/facility/i), 'Other Facility');
  expect(await screen.findByText('9')).toBeInTheDocument();
});
