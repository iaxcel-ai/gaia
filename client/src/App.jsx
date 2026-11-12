import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReferralForm from './pages/ReferralForm';
import Referrals from './pages/Referrals';
import DistrictReports from './pages/DistrictReports';
import AdminUsers from './pages/AdminUsers';
import ThemeToggle from './components/ThemeToggle';

// Top bar and page container shared by every page behind the login.
function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link to="/dashboard">Gaia</Link>
        <span>{user.username}</span>
        <ThemeToggle />
        <button onClick={logout}>Log out</button>
      </header>
      <main>{children}</main>
    </>
  );
}

function RequireUser({ children }) {
  const { user } = useAuth();
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />;
}

export function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return user.role === 'district_admin' ? <Layout>{children}</Layout> : <Navigate to="/dashboard" />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? '/dashboard' : '/login'} />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<main><Login /></main>} />
            <Route
              path="/dashboard"
              element={
                <RequireUser>
                  <Dashboard />
                </RequireUser>
              }
            />
            <Route
              path="/referrals/new/:facilityId"
              element={
                <RequireUser>
                  <ReferralForm />
                </RequireUser>
              }
            />
            <Route
              path="/referrals"
              element={
                <RequireUser>
                  <Referrals />
                </RequireUser>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireAdmin>
                  <DistrictReports />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsers />
                </RequireAdmin>
              }
            />
            <Route path="/" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
