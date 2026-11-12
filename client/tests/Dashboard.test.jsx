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

const NETWORK = [
  { id: 1, name: 'Own Facility' },
  { id: 2, name: 'Has Beds', bed: 4, specialist: 0, supply: null },
  { id: 3, name: 'Has Specialists', bed: 0, specialist: 2, supply: 7 },
];

test('each facility in the refer list shows its latest resource counts', async () => {
  getFacilities.mockResolvedValue(NETWORK);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [] });
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('bed 4 · specialist 0 · supply no data')).toBeInTheDocument();
  expect(screen.getByText('bed 0 · specialist 2 · supply 7')).toBeInTheDocument();
});

test('choosing what the patient needs lists only facilities that have it', async () => {
  getFacilities.mockResolvedValue(NETWORK);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [] });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('bed 4 · specialist 0 · supply no data');
  await userEvent.selectOptions(screen.getByLabelText('Patient needs'), 'bed');
  expect(screen.getByText('bed 4 · specialist 0 · supply no data')).toBeInTheDocument();
  expect(screen.queryByText('bed 0 · specialist 2 · supply 7')).not.toBeInTheDocument();
});

test('says so when no facility has the needed resource', async () => {
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Empty', bed: 0, specialist: null, supply: null }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 1, status: [] });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('bed 0 · specialist no data · supply no data');
  await userEvent.selectOptions(screen.getByLabelText('Patient needs'), 'supply');
  expect(screen.getByText('No facility has reported this resource as available.')).toBeInTheDocument();
});
