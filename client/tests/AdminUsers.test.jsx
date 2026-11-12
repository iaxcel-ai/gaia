import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import AdminUsers from '../src/pages/AdminUsers';
import { getFacilities } from '../src/api/facilities';
import { createUser } from '../src/api/admin';

vi.mock('../src/api/facilities');
vi.mock('../src/api/admin');

beforeEach(() => {
  vi.resetAllMocks();
  getFacilities.mockResolvedValue([{ id: 1, name: 'Facility One' }, { id: 2, name: 'Facility Two' }]);
});

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/username/i), 'newnurse');
  await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
  await userEvent.selectOptions(screen.getByLabelText(/role/i), 'nurse');
  await userEvent.selectOptions(await screen.findByLabelText(/facility/i), 'Facility Two');
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
}

test('submitting the form calls createUser and shows a confirmation', async () => {
  createUser.mockResolvedValue({ id: 9, username: 'newnurse', role: 'nurse', facility_id: 2 });
  render(<AdminUsers />);
  await screen.findByText('Facility Two');
  await fillAndSubmit();
  expect(createUser).toHaveBeenCalledWith({
    username: 'newnurse', password: 'secret123', role: 'nurse', facility_id: 2,
  });
  expect(await screen.findByText(/account created for newnurse/i)).toBeInTheDocument();
});

test('shows the server error when creation fails', async () => {
  createUser.mockRejectedValue(new Error('Username already exists'));
  render(<AdminUsers />);
  await screen.findByText('Facility Two');
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Username already exists');
});
