import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import ReferralForm from '../src/pages/ReferralForm';
import { createReferral } from '../src/api/referrals';
import { getFacilities, getFacilityStatus } from '../src/api/facilities';

vi.mock('../src/api/referrals');
vi.mock('../src/api/facilities');

beforeEach(() => {
  vi.resetAllMocks();
  getFacilities.mockResolvedValue([{ id: 1, name: 'Own Facility' }, { id: 2, name: 'Receiving Facility' }]);
  getFacilityStatus.mockResolvedValue({ facility_id: 2, status: [{ type: 'bed', quantity: 4, stale: false }] });
});

function renderForm() {
  return render(
    <AuthContext.Provider value={{ user: { facility_id: 1 } }}>
      <MemoryRouter initialEntries={['/referrals/new/2']}>
        <Routes>
          <Route path="/referrals/new/:facilityId" element={<ReferralForm />} />
          <Route path="/referrals" element={<p>Referrals</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

test('submitting the form calls createReferral with the chosen facility and navigates to the referrals list', async () => {
  createReferral.mockResolvedValue({ id: 1 });
  renderForm();
  await userEvent.type(screen.getByLabelText(/patient/i), 'P-1');
  await userEvent.type(screen.getByLabelText(/condition/i), 'fracture');
  await userEvent.selectOptions(screen.getByLabelText(/resource/i), 'specialist');
  await userEvent.click(screen.getByRole('button', { name: /send referral/i }));
  expect(createReferral).toHaveBeenCalledWith({
    receiving_facility_id: 2, patient_ref: 'P-1', condition: 'fracture', resource_required: 'specialist',
  });
  expect(await screen.findByText(/referrals/i)).toBeInTheDocument();
});

test('shows which facility the referral is from and to', async () => {
  renderForm();
  expect(await screen.findByText('Own Facility')).toBeInTheDocument();
  expect(screen.getByText('Receiving Facility')).toBeInTheDocument();
});

test('shows what the receiving facility has available', async () => {
  renderForm();
  expect(await screen.findByText('4')).toBeInTheDocument();
  expect(getFacilityStatus).toHaveBeenCalledWith(2);
  expect(screen.getByText('specialist: no data')).toBeInTheDocument();
});

test('the resource is chosen from bed, specialist or supply', () => {
  renderForm();
  const options = screen.getAllByRole('option').map((o) => o.textContent);
  expect(options).toEqual(['bed', 'specialist', 'supply']);
});

test('asks for a patient reference rather than a name', () => {
  renderForm();
  expect(screen.getByLabelText('Patient reference')).toBeInTheDocument();
  expect(screen.getByText(/not their full name/i)).toBeInTheDocument();
});
