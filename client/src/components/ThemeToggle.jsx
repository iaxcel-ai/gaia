import { useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

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

  // The button is icon-only, so the label is what screen readers and tooltips use.
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
  return (
    <button onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
    </button>
  );
}
