import { createContext, useContext, useEffect, useState } from 'react';
import api, { waitForApiHealth } from '../services/api.js';
import { clearCache } from '../services/cache.js';
import { warmAdminAppCache, resetPrefetchState } from '../services/prefetch.js';

const AuthContext = createContext(null);
let verifiedServerToken = '';

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
      setIsServerReady(true);
      setIsServerChecking(false);
      return;
    }

    let isMounted = true;
    setIsServerReady(true);
    setIsServerChecking(true);

    waitForApiHealth({ timeout: 5000, maxRetries: 4 })
      .then(() => {
        verifiedServerToken = token;
      })
      .catch((error) => {
        console.error(error);
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

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    if (isServerReady && !isServerChecking && ['admin', 'coach', 'receptionist'].includes(user.role)) {
      const warmupTimer = setTimeout(() => {
        warmAdminAppCache(user).catch(console.error);
      }, 6000);

      return () => clearTimeout(warmupTimer);
    }

    return undefined;
  }, [token, user, isServerReady, isServerChecking]);

  const login = (data) => {
    clearCache();
    resetPrefetchState();
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    localStorage.setItem('warriors-token', data.token);
    localStorage.setItem('warriors-user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    verifiedServerToken = data.token;
    setIsServerReady(true);
    setIsServerChecking(false);
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
