import { createContext, useContext, useEffect, useState } from 'react';
import api, { waitForApiHealth } from '../services/api.js';
import { clearCache } from '../services/cache.js';
import { warmAdminAppCache, resetPrefetchState } from '../services/prefetch.js';

const AuthContext = createContext(null);
let verifiedServerToken = '';
const adminDataRoles = ['admin', 'coach', 'receptionist'];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('warriors-user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('warriors-token'));
  const [isServerReady, setIsServerReady] = useState(true);
  const [isServerChecking, setIsServerChecking] = useState(false);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem('warriors-token', token);
    }
    if (user) {
      localStorage.setItem('warriors-user', JSON.stringify(user));
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) {
      setIsServerReady(true);
      setIsServerChecking(false);
      return;
    }

    if (verifiedServerToken === token) {
      if (!adminDataRoles.includes(user.role)) {
        setIsServerReady(true);
        setIsServerChecking(false);
        return;
      }
    }

    let isMounted = true;
    const needsAdminData = adminDataRoles.includes(user.role);
    setIsServerReady(!needsAdminData);
    setIsServerChecking(true);

    const prepareApp = async () => {
      if (verifiedServerToken !== token) {
        await waitForApiHealth({ timeout: 10000, maxRetries: 30 });
        verifiedServerToken = token;
      }

      if (needsAdminData) {
        await warmAdminAppCache(user);
      }
    };

    prepareApp()
      .then(() => {
        if (isMounted) {
          setIsServerReady(true);
        }
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) {
          setIsServerReady(false);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsServerChecking(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, user]);

  const login = (data) => {
    clearCache();
    resetPrefetchState();
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    localStorage.setItem('warriors-token', data.token);
    localStorage.setItem('warriors-user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    verifiedServerToken = '';
    setIsServerReady(!adminDataRoles.includes(data.user?.role));
    setIsServerChecking(adminDataRoles.includes(data.user?.role));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('warriors-token');
    localStorage.removeItem('warriors-user');
    delete api.defaults.headers.common.Authorization;
    clearCache();
    resetPrefetchState();
    verifiedServerToken = '';
    setIsServerReady(true);
    setIsServerChecking(false);
  };

  useEffect(() => {
    const handleInvalidAuth = () => {
      logout();
    };

    window.addEventListener('auth:invalid', handleInvalidAuth);
    return () => window.removeEventListener('auth:invalid', handleInvalidAuth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isServerReady, isServerChecking }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
