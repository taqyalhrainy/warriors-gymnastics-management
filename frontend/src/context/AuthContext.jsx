import { createContext, useContext, useEffect, useState } from 'react';
import api, { clearStoredAuth, waitForApiHealth } from '../services/api.js';
import { clearCache } from '../services/cache.js';
import { warmAdminAppCache, resetPrefetchState } from '../services/prefetch.js';

const AuthContext = createContext(null);
let verifiedServerToken = '';
const adminDataRoles = ['admin', 'coach', 'receptionist'];
const retryPreparationAfter = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTH_TOKEN_KEY = 'warriors-token';
const AUTH_USER_KEY = 'warriors-user';

const readSessionUser = () => {
  try {
    const stored = sessionStorage.getItem(AUTH_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    sessionStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
};

const normalizeUser = (user) => user ? {
  ...user,
  id: user.id || user._id
} : null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => normalizeUser(readSessionUser()));
  const [token, setToken] = useState(() => sessionStorage.getItem(AUTH_TOKEN_KEY));
  const [isServerReady, setIsServerReady] = useState(true);
  const [isServerChecking, setIsServerChecking] = useState(false);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    if (user) {
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
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
      while (isMounted) {
        try {
          if (verifiedServerToken !== token) {
            await waitForApiHealth({ timeout: 4000, maxWaitMs: 180000, pollIntervalMs: 500 });
            const response = await api.get('/auth/me', {
              __skipRetry: true
            });
            const verifiedUser = normalizeUser(response.data?.user);
            if (!verifiedUser) {
              throw new Error('Unable to verify current session.');
            }
            if (isMounted) {
              setUser(verifiedUser);
              sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(verifiedUser));
            }
            verifiedServerToken = token;
          }

          if (needsAdminData) {
            await warmAdminAppCache(user);
          }

          if (isMounted) {
            setIsServerReady(true);
            setIsServerChecking(false);
          }
          return;
        } catch (error) {
          console.error('System preparation failed; retrying.', error);
          if (!isMounted) return;
          setIsServerReady(false);
          setIsServerChecking(true);
          await retryPreparationAfter(1500);
        }
      }
    };

    prepareApp();

    return () => {
      isMounted = false;
    };
  }, [token, user]);

  const login = (data) => {
    clearCache();
    resetPrefetchState();
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    const nextUser = normalizeUser(data.user);
    sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
    setToken(data.token);
    setUser(nextUser);
    verifiedServerToken = '';
    setIsServerReady(!adminDataRoles.includes(nextUser?.role));
    setIsServerChecking(adminDataRoles.includes(nextUser?.role));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearStoredAuth();
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
