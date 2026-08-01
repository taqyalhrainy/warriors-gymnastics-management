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

const isRememberedAuth = () => localStorage.getItem(AUTH_REMEMBER_KEY) === 'true';

const readStoredUser = () => {
  try {
    const stored = isRememberedAuth()
      ? localStorage.getItem(AUTH_USER_KEY)
      : sessionStorage.getItem(AUTH_USER_KEY);
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

const writeStoredAuth = ({ token, user, remember }) => {
  const targetStorage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;
  otherStorage.removeItem(AUTH_TOKEN_KEY);
  otherStorage.removeItem(AUTH_USER_KEY);
  if (remember) {
    localStorage.setItem(AUTH_REMEMBER_KEY, 'true');
  } else {
    localStorage.removeItem(AUTH_REMEMBER_KEY);
  }
  if (token) {
    targetStorage.setItem(AUTH_TOKEN_KEY, token);
  }
  if (user) {
    targetStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => normalizeUser(readStoredUser()));
  const [token, setToken] = useState(() => getStoredToken());
  const [rememberSession, setRememberSession] = useState(() => isRememberedAuth());
  const [isServerReady, setIsServerReady] = useState(true);
  const [isServerChecking, setIsServerChecking] = useState(false);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
    if (token || user) {
      writeStoredAuth({ token, user, remember: rememberSession });
    }
  }, [token, user, rememberSession]);

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
              writeStoredAuth({ token, user: verifiedUser, remember: rememberSession });
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
    const remember = Boolean(options.remember);
    setRememberSession(remember);
    writeStoredAuth({ token: data.token, user: nextUser, remember });
    setToken(data.token);
    setUser(nextUser);
    verifiedServerToken = '';
    setIsServerReady(!adminDataRoles.includes(nextUser?.role));
    setIsServerChecking(adminDataRoles.includes(nextUser?.role));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setRememberSession(false);
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
