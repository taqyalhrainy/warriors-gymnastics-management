import { createContext, useContext, useEffect, useState } from 'react';
import api, { clearStoredAuth, getStoredToken } from '../services/api.js';
import { clearCache } from '../services/cache.js';
import { warmAdminAppCache, warmParentAppCache, resetPrefetchState } from '../services/prefetch.js';

const AuthContext = createContext(null);
let verifiedServerToken = '';
const adminDataRoles = ['admin', 'coach', 'receptionist'];
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

    setIsServerReady(true);
    setIsServerChecking(false);

    if (verifiedServerToken === token) {
      return;
    }

    let isMounted = true;
    const needsAdminData = adminDataRoles.includes(user.role);

    api.get('/auth/me', { __maxRetries: 2 })
      .then((response) => {
        if (!isMounted) return;
        const verifiedUser = normalizeUser(response.data?.user);
        if (verifiedUser) {
          setUser(verifiedUser);
          writeStoredAuth({ token, user: verifiedUser, remember: rememberSession });
        }
        verifiedServerToken = token;
        if (needsAdminData) warmAdminAppCache(verifiedUser || user).catch(console.error);
        if ((verifiedUser || user).role === 'parent') warmParentAppCache(verifiedUser || user).catch(console.error);
      })
      .catch((error) => {
        console.error('Session verification failed in background.', error);
      });

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
    setIsServerReady(true);
    setIsServerChecking(false);
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
