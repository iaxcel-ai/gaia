import { createContext, useContext, useState } from 'react';
import { login as loginRequest } from '../api/auth';

const TOKEN_KEY = 'gaia_token';
const USER_KEY = 'gaia_user';

export const AuthContext = createContext(null);

// The middle part of a token holds its expiry time in seconds.
function isExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Reads the login saved on this device, so a page refresh does not log the user out.
// A missing or expired login is cleared and treated as logged out.
function loadSavedLogin() {
  const token = localStorage.getItem(TOKEN_KEY);
  const savedUser = localStorage.getItem(USER_KEY);
  if (!token || !savedUser || isExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { token: null, user: null };
  }
  return { token, user: JSON.parse(savedUser) };
}

export function AuthProvider({ children }) {
  const [saved] = useState(loadSavedLogin);
  const [token, setToken] = useState(saved.token);
  const [user, setUser] = useState(saved.user);

  async function login(username, password) {
    const result = await loginRequest(username, password);
    setToken(result.token);
    setUser(result.user);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return result;
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
