import { createContext, useContext, useEffect, useState } from 'react';
import api, { clearStoredAuth, getStoredToken, waitForApiHealth } from '../services/api.js';
import { clearCache } from '../services/cache.js';
import { warmAdminAppCache, resetPrefetchState } from '../services/prefetch.js';

const AuthContext = createContext(null);
let verifiedServerToken = '';
const adminDataRoles = ['admin', 'coach', 'receptionist'];
const retryPreparationAfter = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTH_TOKEN_KEY = 'warriors-token';
const AUTH_USER_KEY = 'warriors-user';
const AUTH_REMEMBER_KEY = 'warriors-remember-auth';

const readStoredUser = () => {
  try {
    const stored = sessionStorage.getItem(AUTH_USER_KEY)
      || (localStorage.getItem(AUTH_REMEMBER_KEY) === 'true' ? localStorage.getItem(AUTH_USER_KEY) : null);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    localStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
};

const normalizeUser = (user) => user ? {
  ...user,
  id: user.id || user._id
} : null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => normalizeUser(readStoredUser()));
  const [token, setToken] = useState(() => getStoredToken());
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
              const targetStorage = localStorage.getItem(AUTH_TOKEN_KEY) === token ? localStorage : sessionStorage;
              targetStorage.setItem(AUTH_USER_KEY, JSON.stringify(verifiedUser));
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

  const login = (data, options = {}) => {
    clearCache();
    resetPrefetchState();
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    const nextUser = normalizeUser(data.user);
    const targetStorage = options.remember ? localStorage : sessionStorage;
    const otherStorage = options.remember ? sessionStorage : localStorage;
    otherStorage.removeItem(AUTH_TOKEN_KEY);
    otherStorage.removeItem(AUTH_USER_KEY);
    if (options.remember) {
      localStorage.setItem(AUTH_REMEMBER_KEY, 'true');
    } else {
      localStorage.removeItem(AUTH_REMEMBER_KEY);
    }
    targetStorage.setItem(AUTH_TOKEN_KEY, data.token);
    targetStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
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
