import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReferralForm from './pages/ReferralForm';
import Referrals from './pages/Referrals';

function RequireUser({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
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
            <Route path="/login" element={<Login />} />
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
            <Route path="/" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
