import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import Dashboard from '../src/pages/Dashboard';
import { getFacilities, getFacilityStatus, updateFacilityStatus } from '../src/api/facilities';

vi.mock('../src/api/facilities');

function renderWithAuth(user) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user }}>
        <Dashboard />
      </AuthContext.Provider>
    </MemoryRouter>
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

test('when viewing the own facility, submitting a status update calls updateFacilityStatus and refreshes the view', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  updateFacilityStatus.mockResolvedValue({ type: 'bed', quantity: 7, stale: false });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('5');
  await userEvent.selectOptions(screen.getByLabelText(/type/i), 'bed');
  await userEvent.clear(screen.getByLabelText(/quantity/i));
  await userEvent.type(screen.getByLabelText(/quantity/i), '7');
  await userEvent.click(screen.getByRole('button', { name: /update/i }));
  expect(updateFacilityStatus).toHaveBeenCalledWith(1, 'bed', 7);
});

test('the update form is not shown when viewing another facility', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Other Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 2, status: [] });
  renderWithAuth({ facility_id: 1 });
  await userEvent.selectOptions(await screen.findByLabelText(/facility/i), 'Other Facility');
  expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();
});

test('submitting with an empty quantity does not call updateFacilityStatus', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('5');
  await userEvent.click(screen.getByRole('button', { name: /update/i }));
  expect(updateFacilityStatus).not.toHaveBeenCalled();
});

test('shows an error message when updating status fails', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  updateFacilityStatus.mockRejectedValue(new Error('Invalid type or quantity'));
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('5');
  await userEvent.type(screen.getByLabelText(/quantity/i), '3');
  await userEvent.click(screen.getByRole('button', { name: /update/i }));
  expect(await screen.findByText('Invalid type or quantity')).toBeInTheDocument();
});

test('a user with no facility sees a prompt instead of a broken dashboard', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Facility One' }]);
  renderWithAuth({ facility_id: null });
  expect(await screen.findByText(/select a facility/i)).toBeInTheDocument();
  expect(getFacilityStatus).not.toHaveBeenCalled();
});

test('a resource type that was never reported shows as no data', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [{ type: 'bed', quantity: 5, stale: false }] });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('5');
  expect(screen.getByText('specialist: no data')).toBeInTheDocument();
});

test('a district admin sees links to reports and staff accounts', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [] });
  renderWithAuth({ facility_id: 1, role: 'district_admin' });
  expect(await screen.findByRole('link', { name: 'District report' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Staff accounts' })).toBeInTheDocument();
});

test('a nurse does not see the admin links', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [] });
  renderWithAuth({ facility_id: 1, role: 'nurse' });
  await screen.findByRole('link', { name: 'Referrals' });
  expect(screen.queryByRole('link', { name: 'District report' })).not.toBeInTheDocument();
});
