import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import ResetPasswordForm from '../src/components/ResetPasswordForm';
import { resetPassword } from '../src/api/auth';

vi.mock('../src/api/auth');

const STAFF = [
  { id: 5, username: 'nurse1', role: 'nurse' },
  { id: 6, username: 'chw1', role: 'chw' },
];

beforeEach(() => {
  vi.resetAllMocks();
});

async function fillAndSubmit() {
  await userEvent.selectOptions(screen.getByLabelText('Staff member'), 'nurse1');
  await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

test('offers only the registered staff', () => {
  render(<ResetPasswordForm staff={STAFF} />);
  expect(screen.getByRole('option', { name: 'nurse1' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'chw1' })).toBeInTheDocument();
});

test('submitting calls resetPassword and shows a confirmation', async () => {
  resetPassword.mockResolvedValue({ ok: true });
  render(<ResetPasswordForm staff={STAFF} />);
  await fillAndSubmit();
  expect(resetPassword).toHaveBeenCalledWith('nurse1', 'newsecret1');
  expect(await screen.findByText('Password reset for nurse1')).toBeInTheDocument();
});

test('shows the server error when the reset fails', async () => {
  resetPassword.mockRejectedValue(new Error('User not found'));
  render(<ResetPasswordForm staff={STAFF} />);
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
});

test('does not call resetPassword when nothing is chosen', async () => {
  render(<ResetPasswordForm staff={STAFF} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a staff member and enter a new password');
  expect(resetPassword).not.toHaveBeenCalled();
});

test('the new password can be shown and hidden', async () => {
  render(<ResetPasswordForm staff={STAFF} />);
  const password = screen.getByLabelText('New password');
  expect(password).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Show' }));
  expect(password).toHaveAttribute('type', 'text');
});
