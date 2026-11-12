import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

// A password field with an eye button that shows or hides what was typed.
export default function PasswordInput({ id, value, onChange }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-row">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="secondary"
        aria-label={visible ? 'Hide' : 'Show'}
        title={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeSlashIcon className="icon" /> : <EyeIcon className="icon" />}
      </button>
    </div>
  );
}
