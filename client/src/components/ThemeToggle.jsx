import { useState } from 'react';

const THEME_KEY = 'gaia_theme';

// Applies the saved theme (light by default). Called once at startup from main.jsx.
export function applySavedTheme() {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || 'light';
}

// Switches between light and dark and remembers the choice on this device.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  }

  return (
    <button onClick={toggle}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
  );
}
