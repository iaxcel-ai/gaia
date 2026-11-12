import { render, screen } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import DistrictReports from '../src/pages/DistrictReports';
import { getFacilities } from '../src/api/facilities';
import { getDistrictReport } from '../src/api/reports';

vi.mock('../src/api/facilities');
vi.mock('../src/api/reports');

const EMPTY_REPORT = {
  district_id: 7,
  referrals: { total: 0, by_status: { pending: 0, accepted: 0, declined: 0, completed: 0, cancelled: 0 } },
  top_referring: [],
  top_receiving: [],
  resource_gaps: [],
};

function renderPage(user) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <DistrictReports />
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getFacilities.mockResolvedValue([{ id: 1, name: 'Facility One', district_id: 7 }]);
});

test('loads the report for the district of the admin facility and shows its contents', async () => {
  getDistrictReport.mockResolvedValue({
    district_id: 7,
    referrals: { total: 4, by_status: { pending: 1, accepted: 1, declined: 2, completed: 0, cancelled: 0 } },
    top_referring: [{ facility_id: 1, name: 'Facility One', count: 3 }],
    top_receiving: [{ facility_id: 2, name: 'Facility Two', count: 2 }],
    resource_gaps: [{ facility_id: 1, name: 'Facility One', type: 'bed', zero_count: 5 }],
  });
  renderPage({ role: 'district_admin', facility_id: 1 });
  expect(await screen.findByText('Total referrals: 4')).toBeInTheDocument();
  expect(getDistrictReport).toHaveBeenCalledWith(7);
  expect(screen.getByText('declined: 2')).toBeInTheDocument();
  expect(screen.getByText('Facility One: 3')).toBeInTheDocument();
  expect(screen.getByText('Facility Two: 2')).toBeInTheDocument();
  expect(screen.getByText('Facility One, bed: 5 times at zero')).toBeInTheDocument();
});

test('an empty report shows empty-state messages', async () => {
  getDistrictReport.mockResolvedValue(EMPTY_REPORT);
  renderPage({ role: 'district_admin', facility_id: 1 });
  expect(await screen.findByText('Total referrals: 0')).toBeInTheDocument();
  expect(screen.getByText('No recurring resource gaps.')).toBeInTheDocument();
  expect(screen.getAllByText('No referrals yet.')).toHaveLength(2);
});

test('shows the server error when the report cannot be loaded', async () => {
  getDistrictReport.mockRejectedValue(new Error('Forbidden'));
  renderPage({ role: 'district_admin', facility_id: 1 });
  expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
});

test('an admin with no facility sees an explanation instead of a report', async () => {
  renderPage({ role: 'district_admin', facility_id: null });
  expect(await screen.findByText(/not assigned to a facility/i)).toBeInTheDocument();
  expect(getDistrictReport).not.toHaveBeenCalled();
});
