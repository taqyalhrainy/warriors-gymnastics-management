import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { login } from '../services/auth.js';
import api from '../services/api.js';
import warriorsLogo from '../assets/warriors-logo.png';
import { isNativeAndroidApp } from '../utils/nativePushNotifications.js';

const SERVER_WAKE_RETRY_MS = 3000;
const SERVER_WAKE_MAX_MS = 180000;
const AUTH_REMEMBER_KEY = 'warriors-remember-auth';
const REMEMBERED_ADMIN_LOGIN_KEY = 'warriors-remembered-admin-login';
let hasRequestedServerWake = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isServerWakeError = (error) => {
  const status = error.response?.status;
  return !error.response || error.code === 'ECONNABORTED' || [502, 503, 504].includes(status);
};

const sendAuthWithWakeRetry = async (requestFn, onWaiting) => {
  const startedAt = Date.now();
  while (true) {
    try {
      return await requestFn();
    } catch (error) {
      const maxWait = isNativeAndroidApp() ? 30000 : SERVER_WAKE_MAX_MS;
      if (!isServerWakeError(error) || Date.now() - startedAt > maxWait) throw error;
      onWaiting(true);
      await wait(SERVER_WAKE_RETRY_MS);
    }
  }
};

const getAuthErrorMessage = (error) => {
  const status = error.response?.status;
  const message = error.response?.data?.message || '';
  const lowerMessage = message.toLowerCase();

  if (error.code === 'ECONNABORTED') return 'Connection timed out. Please try again in a moment.';
  if (!error.response) return 'Could not connect to the server. Please check your connection and try again.';
  if (status === 404 || lowerMessage.includes('no account found')) return 'No account found with these login details.';
  if (status === 401 || lowerMessage.includes('incorrect password')) return 'Incorrect password. Please try again.';
  if (status === 403 || lowerMessage.includes('inactive')) return 'This account is inactive. Please contact the admin.';
  if (status === 400) return message || 'Username and password are required.';
  if (status === 429) return 'Too many attempts. Please wait and try again.';
  if (status >= 500) return 'Unable to sign in because of a server error. Please try again later.';
  return message || 'Something went wrong. Please try again.';
};

const ParentLoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(() => localStorage.getItem(AUTH_REMEMBER_KEY) !== 'false');
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForServer, setIsWaitingForServer] = useState(false);
  const { user, login: authLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hasRequestedServerWake) return;
    hasRequestedServerWake = true;
    localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);
    api.get('/health', { timeout: 15000 }).catch(() => {
      hasRequestedServerWake = false;
    });
  }, []);

  useEffect(() => {
    if (user?.role === 'parent') navigate('/parent', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFieldErrors({});
    setGeneralError('');

    const trimmedIdentifier = identifier.trim();
    const newErrors = {};
    if (!trimmedIdentifier) newErrors.identifier = 'Name is required.';
    if (!password) newErrors.password = 'Password is required.';
    if (Object.keys(newErrors).length) {
      setFieldErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setIsWaitingForServer(false);
    try {
      const data = await sendAuthWithWakeRetry(
        () => login({ name: trimmedIdentifier, password, remember: rememberLogin }),
        setIsWaitingForServer
      );
      if (data.user?.role !== 'parent') {
        setGeneralError('No account found with these login details.');
        return;
      }
      localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);
      authLogin(data, { remember: rememberLogin });
      navigate('/parent');
    } catch (error) {
      setGeneralError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      setIsWaitingForServer(false);
    }
  };

  const loadingTitle = isWaitingForServer ? 'Connecting to the server' : 'Signing you in';
  const loadingMessage = isWaitingForServer
    ? 'The connection is taking longer than expected. Retrying...'
    : 'Checking your details securely...';

  return (
    <div className="page login-page">
      {isSubmitting && (
        <div className="auth-loading-overlay" role="status" aria-live="polite">
          <img src={warriorsLogo} alt="" />
          <span className="loading-spinner" />
          <strong>{loadingTitle}</strong>
          <p>{loadingMessage}</p>
        </div>
      )}
      <div className="login-card">
        <div className="login-logo-frame">
          <img className="login-logo" src={warriorsLogo} alt="Warriors Gymnastics Academy" />
        </div>
        <h2>Warriors Gym Login</h2>
        {generalError && <p className="alert-error">{generalError}</p>}
        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            inputMode="text"
          />
          {fieldErrors.identifier && <p className="field-error">{fieldErrors.identifier}</p>}

          <label>Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

          <label className="remember-login-row">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(event) => setRememberLogin(event.target.checked)}
            />
            <span>Remember me on this device</span>
          </label>

          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing In...' : 'Sign In'}</button>
        </form>
      </div>
    </div>
  );
};

export default ParentLoginPage;
