import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { login } from '../services/auth.js';
import api from '../services/api.js';
import warriorsLogo from '../assets/warriors-logo.png';

const SERVER_WAKE_RETRY_MS = 3000;
const SERVER_WAKE_MAX_MS = 180000;
const REMEMBERED_ADMIN_LOGIN_KEY = 'warriors-remembered-admin-login';
let hasRequestedServerWake = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isServerWakeError = (err) => {
  const status = err.response?.status;
  return !err.response || err.code === 'ECONNABORTED' || [502, 503, 504].includes(status);
};

const sendAuthWithWakeRetry = async (requestFn, onWaiting) => {
  const startedAt = Date.now();

  while (true) {
    try {
      return await requestFn();
    } catch (err) {
      if (!isServerWakeError(err) || Date.now() - startedAt > SERVER_WAKE_MAX_MS) {
        throw err;
      }

      onWaiting(true);
      await wait(SERVER_WAKE_RETRY_MS);
    }
  }
};

const getAuthErrorMessage = (err) => {
  const status = err.response?.status;
  const message = err.response?.data?.message || '';
  const lowerMessage = message.toLowerCase();

  if (err.code === 'ECONNABORTED') {
    return 'Connection timed out. Please try again in a moment.';
  }
  if (!err.response) {
    return 'Could not connect to the server. Make sure the backend is running.';
  }
  if (status === 404 || lowerMessage.includes('no account found')) {
    return 'No account found with these login details.';
  }
  if (status === 401 || lowerMessage.includes('incorrect password')) {
    return 'Incorrect password. Please try again.';
  }
  if (status === 403 || lowerMessage.includes('inactive')) {
    return 'This account is inactive. Please contact the admin.';
  }
  if (status === 400) {
    return message || 'Username and password are required.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait and try again.';
  }
  if (status >= 500) {
    return 'Unable to sign in because of a server error. Please try again later.';
  }

  return message || 'Something went wrong. Please try again.';
};

const LoginPage = () => {
  const [loginRole, setLoginRole] = useState('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForServer, setIsWaitingForServer] = useState(false);
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hasRequestedServerWake) return;
    hasRequestedServerWake = true;
    localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);

    api.get('/health', { timeout: 15000 }).catch(() => {
      hasRequestedServerWake = false;
    });
  }, []);

  const clearErrors = () => {
    setFieldErrors({});
    setGeneralError('');
  };

  const switchLoginRole = (role) => {
    setLoginRole(role);
    setIdentifier('');
    setPassword('');
    clearErrors();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearErrors();

    const trimmedIdentifier = identifier.trim();
    const newErrors = {};
    if (!trimmedIdentifier) newErrors.identifier = `${loginRole === 'parent' ? 'Name' : 'Email'} is required.`;
    if (!password) newErrors.password = 'Password is required.';
    if (Object.keys(newErrors).length) {
      setFieldErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setIsWaitingForServer(false);

    try {
      const payload = loginRole === 'parent'
        ? { name: trimmedIdentifier, password, remember: rememberLogin }
        : { email: trimmedIdentifier, password, remember: rememberLogin };
      const data = await sendAuthWithWakeRetry(() => login(payload), setIsWaitingForServer);
      localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);
      authLogin(data, { remember: rememberLogin });
      navigate(data.user.role === 'parent' ? '/parent' : '/admin');
    } catch (err) {
      setGeneralError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
      setIsWaitingForServer(false);
    }
  };

  const loadingTitle = isWaitingForServer ? 'Waking up the server' : 'Signing you in';
  const loadingMessage = isWaitingForServer
    ? 'Please wait. Render may need a few moments to start the backend.'
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
        <img className="login-logo" src={warriorsLogo} alt="Warriors Gymnastics Academy" />
        <h2>Warriors Gym Login</h2>
        {generalError && <p className="alert-error">{generalError}</p>}
        <form onSubmit={handleSubmit}>
          <div className="login-role-tabs">
            <button type="button" className={loginRole === 'admin' ? 'active' : ''} onClick={() => switchLoginRole('admin')}>Admin</button>
            <button type="button" className={loginRole === 'parent' ? 'active' : ''} onClick={() => switchLoginRole('parent')}>Parent</button>
          </div>

          <label>{loginRole === 'parent' ? 'Name' : 'Email'}</label>
          <input
            type={loginRole === 'parent' ? 'text' : 'password'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          {fieldErrors.identifier && <p className="field-error">{fieldErrors.identifier}</p>}

          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
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

export default LoginPage;
