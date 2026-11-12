import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import AdminUsers from '../src/pages/AdminUsers';
import { getFacilities } from '../src/api/facilities';
import { createUser, getStaff } from '../src/api/admin';

vi.mock('../src/api/facilities');
vi.mock('../src/api/admin');
vi.mock('../src/api/auth');

function renderPage() {
  return render(
    <AuthContext.Provider value={{ user: { role: 'district_admin', facility_id: 1 } }}>
      <AdminUsers />
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getFacilities.mockResolvedValue([
    { id: 1, name: 'Facility One', district_id: 7 },
    { id: 2, name: 'Facility Two', district_id: 7 },
    { id: 3, name: 'Other District Facility', district_id: 8 },
  ]);
  getStaff.mockResolvedValue([
    { id: 5, username: 'nurse1', role: 'nurse', facility_id: 1, facility_name: 'Facility One' },
    { id: 6, username: 'chw1', role: 'chw', facility_id: 2, facility_name: 'Facility Two' },
  ]);
});

async function fillAndSubmit({ chooseFacility = true } = {}) {
  await userEvent.type(screen.getByLabelText('Username'), 'newnurse');
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.selectOptions(screen.getByLabelText(/role/i), 'nurse');
  if (chooseFacility) {
    await userEvent.selectOptions(screen.getByLabelText(/facility/i), 'Facility Two');
  }
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
}

test('submitting the form calls createUser and shows a confirmation', async () => {
  createUser.mockResolvedValue({ id: 9, username: 'newnurse', role: 'nurse', facility_id: 2 });
  renderPage();
  await screen.findByRole('option', { name: 'Facility Two' });
  await fillAndSubmit();
  expect(createUser).toHaveBeenCalledWith({
    username: 'newnurse', password: 'secret123', role: 'nurse', facility_id: 2,
  });
  expect(await screen.findByText(/account created for newnurse/i)).toBeInTheDocument();
});

test('shows the server error when creation fails', async () => {
  createUser.mockRejectedValue(new Error('Username already exists'));
  renderPage();
  await screen.findByRole('option', { name: 'Facility Two' });
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Username already exists');
});

test('only facilities in the admin district are offered', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Facility Two' });
  expect(screen.queryByText('Other District Facility')).not.toBeInTheDocument();
});

test('submitting without choosing a facility asks for one and does not call createUser', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Facility Two' });
  await fillAndSubmit({ chooseFacility: false });
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a facility');
  expect(createUser).not.toHaveBeenCalled();
});

test('the page also offers the password reset form', async () => {
  renderPage();
  expect(await screen.findByRole('button', { name: 'Reset password' })).toBeInTheDocument();
});

test('lists the registered staff with a count', async () => {
  renderPage();
  expect(await screen.findByText('Registered staff (2)')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'nurse1' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Facility Two' })).toBeInTheDocument();
});

test('the staff list is reloaded after an account is created', async () => {
  createUser.mockResolvedValue({ id: 9, username: 'newnurse', role: 'nurse', facility_id: 2 });
  renderPage();
  await screen.findByText('Registered staff (2)');
  await fillAndSubmit();
  await screen.findByText(/account created for newnurse/i);
  expect(getStaff).toHaveBeenCalledTimes(2);
});

test('the new account password can be shown and hidden', async () => {
  renderPage();
  const password = screen.getByLabelText('Password');
  expect(password).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getAllByRole('button', { name: 'Show' })[0]);
  expect(password).toHaveAttribute('type', 'text');
});
