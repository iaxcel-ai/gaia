import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import ResetPasswordForm from '../src/components/ResetPasswordForm';
import { resetPassword } from '../src/api/auth';

vi.mock('../src/api/auth');

beforeEach(() => {
  vi.resetAllMocks();
});

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Staff username'), 'nurse1');
  await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

test('submitting calls resetPassword and shows a confirmation', async () => {
  resetPassword.mockResolvedValue({ ok: true });
  render(<ResetPasswordForm />);
  await fillAndSubmit();
  expect(resetPassword).toHaveBeenCalledWith('nurse1', 'newsecret1');
  expect(await screen.findByText('Password reset for nurse1')).toBeInTheDocument();
});

test('shows the server error when the user does not exist', async () => {
  resetPassword.mockRejectedValue(new Error('User not found'));
  render(<ResetPasswordForm />);
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
});

test('does not call resetPassword when a field is empty', async () => {
  render(<ResetPasswordForm />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a username and a new password');
  expect(resetPassword).not.toHaveBeenCalled();
});
