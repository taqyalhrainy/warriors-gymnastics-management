import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('warriors-user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('warriors-token'));

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem('warriors-token', token);
    }
    if (user) {
      localStorage.setItem('warriors-user', JSON.stringify(user));
    }
  }, [token, user]);

  const login = (data) => {
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    localStorage.setItem('warriors-token', data.token);
    localStorage.setItem('warriors-user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('warriors-token');
    localStorage.removeItem('warriors-user');
    delete api.defaults.headers.common.Authorization;
  };

  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
