import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import Referrals from '../src/pages/Referrals';
import { getReferrals, respondToReferral } from '../src/api/referrals';
import { useSocket } from '../src/context/SocketContext';

vi.mock('../src/api/referrals');
vi.mock('../src/context/SocketContext');

function renderWithAuth(user) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <Referrals />
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  useSocket.mockReturnValue({ lastReferralEvent: null });
});

test('lists referrals with their status', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('P-1')).toBeInTheDocument();
  expect(screen.getByText('pending')).toBeInTheDocument();
});

test('a receiving-facility user sees accept/decline buttons on a pending referral', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
});

test('clicking accept calls respondToReferral and refreshes the list', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  respondToReferral.mockResolvedValue({ id: 1, status: 'accepted' });
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  await userEvent.click(screen.getByRole('button', { name: /accept/i }));
  expect(respondToReferral).toHaveBeenCalledWith(1, 'accept');
});

test('a referring-facility user sees no accept/decline buttons', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
});

test('a new socket referral event triggers a list refresh', async () => {
  getReferrals.mockResolvedValueOnce([]).mockResolvedValueOnce([
    { id: 2, patient_ref: 'P-2', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  useSocket.mockReturnValue({ lastReferralEvent: null });
  const { rerender } = renderWithAuth({ facility_id: 2 });
  await screen.findByText('Referrals');

  useSocket.mockReturnValue({ lastReferralEvent: { id: 2, receiving_facility_id: 2 } });
  rerender(
    <AuthContext.Provider value={{ user: { facility_id: 2 } }}>
      <Referrals />
    </AuthContext.Provider>
  );

  expect(await screen.findByText('P-2')).toBeInTheDocument();
});
