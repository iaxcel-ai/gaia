import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

// Top bar shown on every page behind the login: page links, theme switch, log out.
// The two admin pages are only listed for district admins.
export default function NavBar() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === 'district_admin';

  return (
    <header className="topbar">
      <strong className="brand">Gaia</strong>
      <nav>
        <NavLink to="/dashboard"><HomeIcon className="icon" />Dashboard</NavLink>
        <NavLink to="/referrals"><ArrowsRightLeftIcon className="icon" />Referrals</NavLink>
        {isAdmin && <NavLink to="/reports"><ChartBarIcon className="icon" />District report</NavLink>}
        {isAdmin && <NavLink to="/admin/users"><UsersIcon className="icon" />Staff accounts</NavLink>}
      </nav>
      <span className="who">{user.username}</span>
      <ThemeToggle />
      <button onClick={logout}><ArrowRightStartOnRectangleIcon className="icon" />Log out</button>
    </header>
  );
}
