import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext({ lastReferralEvent: null });

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [lastReferralEvent, setLastReferralEvent] = useState(null);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io('/', { auth: { token }, path: '/socket.io' });
    socket.on('referral', (referral) => setLastReferralEvent(referral));

    return () => socket.disconnect();
  }, [token]);

  return (
    <SocketContext.Provider value={{ lastReferralEvent }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
