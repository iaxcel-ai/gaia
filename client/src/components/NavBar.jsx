import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  UsersIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getReferrals } from '../api/referrals';
import ThemeToggle from './ThemeToggle';

// Top bar shown on every page behind the login: page links, theme switch, log out.
// The two admin pages are only listed for district admins.
export default function NavBar() {
  const { user, logout } = useAuth();
  const { lastReferralEvent } = useSocket();
  const [waiting, setWaiting] = useState(0);
  const isAdmin = user.role === 'district_admin';

  // Count the referrals sent to this facility that nobody has answered yet.
  // It is recounted whenever a referral event arrives, so it is visible from any page.
  useEffect(() => {
    getReferrals()
      .then((referrals) => {
        const incoming = referrals.filter(
          (r) => r.status === 'pending' && r.receiving_facility_id === user.facility_id
        );
        setWaiting(incoming.length);
      })
      .catch(() => {});
  }, [lastReferralEvent, user.facility_id]);

  return (
    <header className="topbar">
      <strong className="brand">Gaia</strong>
      <nav>
        <NavLink to="/dashboard"><HomeIcon className="icon" />Dashboard</NavLink>
        <NavLink to="/referrals">
          <ArrowsRightLeftIcon className="icon" />Referrals
          {waiting > 0 && <span className="count" title="Referrals waiting for an answer">{waiting}</span>}
        </NavLink>
        {isAdmin && <NavLink to="/reports"><ChartBarIcon className="icon" />District report</NavLink>}
        {isAdmin && <NavLink to="/admin/users"><UsersIcon className="icon" />Staff accounts</NavLink>}
      </nav>
      <span className="who">{user.username}</span>
      <ThemeToggle />
      <button onClick={logout}><ArrowRightStartOnRectangleIcon className="icon" />Log out</button>
    </header>
  );
}
