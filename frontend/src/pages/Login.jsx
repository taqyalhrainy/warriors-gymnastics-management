import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import InstallAppButton from '../components/InstallAppButton.jsx';
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
      const maxWait = isNativeAndroidApp() ? 30000 : SERVER_WAKE_MAX_MS;
      if (!isServerWakeError(err) || Date.now() - startedAt > maxWait) {
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
    return 'Could not connect to the server. Please check your connection and try again.';
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

const LoginPage = ({ initialRole = 'parent' }) => {
  const [loginRole, setLoginRole] = useState(initialRole);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(() => localStorage.getItem(AUTH_REMEMBER_KEY) !== 'false');
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForServer, setIsWaitingForServer] = useState(false);
  const { user, login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (hasRequestedServerWake) return;
    hasRequestedServerWake = true;
    localStorage.removeItem(REMEMBERED_ADMIN_LOGIN_KEY);

    api.get('/health', { timeout: 15000 }).catch(() => {
      hasRequestedServerWake = false;
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    if (loginRole === 'admin' && user.role === 'parent') return;
    if (loginRole === 'parent' && user.role !== 'parent') return;
    navigate(user.role === 'parent' ? '/parent' : '/admin', { replace: true });
  }, [user, navigate, loginRole]);

  useEffect(() => {
    if (initialRole === 'admin' || searchParams.get('admin') === '1') {
      setLoginRole('admin');
    }
  }, [initialRole, searchParams]);

  useLayoutEffect(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return undefined;

    const originalHref = manifestLink.getAttribute('href') || '/manifest.webmanifest';
    if (loginRole === 'admin') {
      manifestLink.setAttribute('href', '/admin-manifest.webmanifest');
      document.title = 'Warriors Admin Login';
      window.__warriorsInstallPrompt = null;
    }

    return () => {
      manifestLink.setAttribute('href', originalHref);
      document.title = 'Warriors Gymnastics Management';
    };
  }, [loginRole]);

  const clearErrors = () => {
    setFieldErrors({});
    setGeneralError('');
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
        {loginRole === 'admin' && (
          <div className="admin-install-row">
            <InstallAppButton label="Install Admin Application" installPath="/admin/login?source=admin-pwa" appName="Admin" />
          </div>
        )}
        <h2>{loginRole === 'admin' ? 'Admin Login' : 'Warriors Gym Login'}</h2>
        {loginRole === 'admin' && <p className="admin-login-mode-label">ADMIN</p>}
        {generalError && <p className="alert-error">{generalError}</p>}
        <form onSubmit={handleSubmit}>
          <label>{loginRole === 'parent' ? 'Name' : 'Email'}</label>
          <input
            type="text"
            className={loginRole === 'admin' ? 'masked-admin-identifier' : ''}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            inputMode={loginRole === 'admin' ? 'email' : 'text'}
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
