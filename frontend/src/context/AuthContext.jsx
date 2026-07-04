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
  const [isServerReady, setIsServerReady] = useState(() => !localStorage.getItem('warriors-token'));
  const [isServerChecking, setIsServerChecking] = useState(() => Boolean(localStorage.getItem('warriors-token')));

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
    setIsServerReady(false);
    setIsServerChecking(true);

    waitForApiHealth({ timeout: 10000, maxRetries: 30 })
      .then(() => {
        verifiedServerToken = token;
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

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    if (isServerReady && ['admin', 'coach', 'receptionist'].includes(user.role)) {
      warmAdminAppCache(user).catch(console.error);
    }
  }, [token, user, isServerReady]);

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
