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

test('a receiving-facility user sees a complete button on an accepted referral', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'accepted', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
});

test('clicking complete calls respondToReferral with complete', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'accepted', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  respondToReferral.mockResolvedValue({ id: 1, status: 'completed' });
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  await userEvent.click(screen.getByRole('button', { name: /complete/i }));
  expect(respondToReferral).toHaveBeenCalledWith(1, 'complete');
});

test('a referring-facility user sees a cancel button on a pending referral', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
});

test('clicking cancel calls respondToReferral with cancel', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  respondToReferral.mockResolvedValue({ id: 1, status: 'cancelled' });
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(respondToReferral).toHaveBeenCalledWith(1, 'cancel');
});

test('a receiving-facility user sees no cancel button and a referring-facility user sees no complete button', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'accepted', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  expect(screen.queryByRole('button', { name: /complete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
});

test('shows an error message when the referral list fails to load', async () => {
  getReferrals.mockRejectedValue(new Error('Request failed'));
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText('Request failed')).toBeInTheDocument();
});

test('shows an error message when accepting a referral fails', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, patient_ref: 'P-1', status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  respondToReferral.mockRejectedValue(new Error('Referral is not pending'));
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  await userEvent.click(screen.getByRole('button', { name: /accept/i }));
  expect(await screen.findByText('Referral is not pending')).toBeInTheDocument();
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

test('an empty list explains what to do next', async () => {
  getReferrals.mockResolvedValue([]);
  renderWithAuth({ facility_id: 1 });
  expect(await screen.findByText(/no referrals yet/i)).toBeInTheDocument();
});

test('each referral can be opened to see what it is about', async () => {
  getReferrals.mockResolvedValue([
    {
      id: 1, patient_ref: 'P-1', status: 'pending', condition: 'fracture', resource_required: 'bed',
      referring_facility_id: 1, receiving_facility_id: 2,
      referring_facility_name: 'Facility One', receiving_facility_name: 'Facility Two',
      created_at: '2026-11-12T08:30:00Z',
    },
  ]);
  renderWithAuth({ facility_id: 1 });
  await screen.findByText('P-1');
  expect(screen.getByText('To Facility Two')).toBeInTheDocument();
  expect(screen.getByText('fracture')).toBeInTheDocument();
  expect(screen.getByText('bed')).toBeInTheDocument();
  expect(screen.getByText('Facility One')).toBeInTheDocument();
});

test('a received referral is labelled with the facility it came from', async () => {
  getReferrals.mockResolvedValue([
    {
      id: 1, patient_ref: 'P-1', status: 'pending', condition: 'fracture', resource_required: 'bed',
      referring_facility_id: 1, receiving_facility_id: 2,
      referring_facility_name: 'Facility One', receiving_facility_name: 'Facility Two',
      created_at: '2026-11-12T08:30:00Z',
    },
  ]);
  renderWithAuth({ facility_id: 2 });
  await screen.findByText('P-1');
  expect(screen.getByText('From Facility One')).toBeInTheDocument();
});
