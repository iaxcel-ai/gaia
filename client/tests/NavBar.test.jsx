import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import NavBar from '../src/components/NavBar';
import { getReferrals } from '../src/api/referrals';

vi.mock('../src/api/referrals');

beforeEach(() => {
  vi.resetAllMocks();
  getReferrals.mockResolvedValue([]);
});

function renderNav(user, logout = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthContext.Provider value={{ user, logout }}>
        <NavBar />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

test('a district admin sees every page link', () => {
  renderNav({ username: 'admin', role: 'district_admin' });
  expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Referrals' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'District report' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Staff accounts' })).toBeInTheDocument();
});

test('a nurse does not see the admin links', () => {
  renderNav({ username: 'nurse1', role: 'nurse' });
  expect(screen.getByRole('link', { name: 'Referrals' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'District report' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Staff accounts' })).not.toBeInTheDocument();
});

test('the link for the current page is marked as active', () => {
  renderNav({ username: 'nurse1', role: 'nurse' });
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('active');
  expect(screen.getByRole('link', { name: 'Referrals' })).not.toHaveClass('active');
});

test('shows the username and logs out when asked', async () => {
  const logout = vi.fn();
  renderNav({ username: 'nurse1', role: 'nurse' }, logout);
  expect(screen.getByText('nurse1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(logout).toHaveBeenCalled();
});

test('shows how many incoming referrals are waiting for an answer', async () => {
  getReferrals.mockResolvedValue([
    { id: 1, status: 'pending', referring_facility_id: 2, receiving_facility_id: 1 },
    { id: 2, status: 'pending', referring_facility_id: 3, receiving_facility_id: 1 },
    { id: 3, status: 'accepted', referring_facility_id: 2, receiving_facility_id: 1 },
    { id: 4, status: 'pending', referring_facility_id: 1, receiving_facility_id: 2 },
  ]);
  renderNav({ username: 'nurse1', role: 'nurse', facility_id: 1 });
  expect(await screen.findByTitle('Referrals waiting for an answer')).toHaveTextContent('2');
});

test('shows no count when nothing is waiting', async () => {
  renderNav({ username: 'nurse1', role: 'nurse', facility_id: 1 });
  await screen.findByRole('link', { name: 'Referrals' });
  expect(screen.queryByTitle('Referrals waiting for an answer')).not.toBeInTheDocument();
});
