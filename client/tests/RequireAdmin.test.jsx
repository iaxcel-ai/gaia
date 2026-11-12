import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import { RequireAdmin } from '../src/App';
import { getReferrals } from '../src/api/referrals';

// The navigation bar around the page loads the referral count.
vi.mock('../src/api/referrals');

beforeEach(() => {
  getReferrals.mockResolvedValue([]);
});

function renderAs(user) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<RequireAdmin><p>Admin page</p></RequireAdmin>} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

test('a district admin sees the admin page', () => {
  renderAs({ role: 'district_admin' });
  expect(screen.getByText('Admin page')).toBeInTheDocument();
});

test('a nurse is sent to the dashboard', () => {
  renderAs({ role: 'nurse' });
  expect(screen.getByText('Dashboard page')).toBeInTheDocument();
});

test('a logged-out visitor is sent to the login page', () => {
  renderAs(null);
  expect(screen.getByText('Login page')).toBeInTheDocument();
});
