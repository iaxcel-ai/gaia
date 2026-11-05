import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import ReferralForm from '../src/pages/ReferralForm';
import { createReferral } from '../src/api/referrals';

vi.mock('../src/api/referrals');

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/referrals/new/2']}>
      <Routes>
        <Route path="/referrals/new/:facilityId" element={<ReferralForm />} />
        <Route path="/referrals" element={<p>Referrals</p>} />
      </Routes>
    </MemoryRouter>
  );
}

test('submitting the form calls createReferral with the chosen facility and navigates to the referrals list', async () => {
  createReferral.mockResolvedValue({ id: 1 });
  renderForm();
  await userEvent.type(screen.getByLabelText(/patient/i), 'P-1');
  await userEvent.type(screen.getByLabelText(/condition/i), 'fracture');
  await userEvent.type(screen.getByLabelText(/resource/i), 'bed');
  await userEvent.click(screen.getByRole('button', { name: /send referral/i }));
  expect(createReferral).toHaveBeenCalledWith({
    receiving_facility_id: 2, patient_ref: 'P-1', condition: 'fracture', resource_required: 'bed',
  });
  expect(await screen.findByText(/referrals/i)).toBeInTheDocument();
});
