import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import { AuthContext } from '../src/context/AuthContext';
import Login from '../src/pages/Login';

function renderLogin(authValue) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={authValue}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<p>Dashboard coming in Phase 2</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

test('submitting valid credentials calls login and navigates to the dashboard', async () => {
  const mockLogin = vi.fn().mockResolvedValue({ token: 'abc', user: { role: 'nurse' } });
  renderLogin({ login: mockLogin });
  await userEvent.type(screen.getByLabelText(/username/i), 'nurse1');
  await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
  expect(mockLogin).toHaveBeenCalledWith('nurse1', 'secret123');
  expect(await screen.findByText('Dashboard coming in Phase 2')).toBeInTheDocument();
});

test('shows an error message when login fails', async () => {
  const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
  renderLogin({ login: mockLogin });
  await userEvent.type(screen.getByLabelText(/username/i), 'nurse1');
  await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
});

test('the password is hidden by default and the Show button reveals it', async () => {
  renderLogin({ login: vi.fn() });
  const password = screen.getByLabelText(/password/i);
  expect(password).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Show' }));
  expect(password).toHaveAttribute('type', 'text');
  await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
  expect(password).toHaveAttribute('type', 'password');
});

test('explains how to get an account and how to recover a forgotten password', () => {
  renderLogin({ login: vi.fn() });
  expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  expect(screen.getByText(/district admin can reset your password/i)).toBeInTheDocument();
  expect(screen.getByText('Need an account?')).toBeInTheDocument();
  expect(screen.getByText(/accounts are created by your district admin/i)).toBeInTheDocument();
});

test('shows the Gaia logo and what the app is for', () => {
  renderLogin({ login: vi.fn() });
  expect(screen.getByRole('img', { name: 'Gaia logo' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Gaia' })).toBeInTheDocument();
  expect(screen.getByText('The right care, at the right facility.')).toBeInTheDocument();
});
