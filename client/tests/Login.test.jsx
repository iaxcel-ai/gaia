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
