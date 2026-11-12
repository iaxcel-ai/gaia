import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import ThemeToggle, { applySavedTheme } from '../src/components/ThemeToggle';

// The test environment has no working localStorage, so use a small in-memory one.
beforeEach(() => {
  const store = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
  });
  delete document.documentElement.dataset.theme;
});

test('switches to dark mode, remembers it, and switches back', async () => {
  render(<ThemeToggle />);
  await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('gaia_theme')).toBe('dark');

  await userEvent.click(screen.getByRole('button', { name: 'Light mode' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('gaia_theme')).toBe('light');
});

test('applySavedTheme restores the remembered theme and defaults to light', () => {
  applySavedTheme();
  expect(document.documentElement.dataset.theme).toBe('light');

  localStorage.setItem('gaia_theme', 'dark');
  applySavedTheme();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
