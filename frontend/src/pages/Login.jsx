import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { login, register } from '../services/auth.js';
import warriorsLogo from '../assets/warriors-logo.png';

const SERVER_WAKE_RETRY_MS = 3000;
const SERVER_WAKE_MAX_MS = 180000;

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

const getAuthErrorMessage = (err, mode) => {
  const status = err.response?.status;
  const message = err.response?.data?.message || '';
  const lowerMessage = message.toLowerCase();

  if (err.code === 'ECONNABORTED') {
    return 'انتهت مهلة الاتصال بالخادم. يبدو أن الباك إند على Render لا يستجيب حالياً، جرّب بعد لحظات أو افحص Logs.';
  }
  if (!err.response) {
    return 'تعذر الاتصال بالخادم. تأكد أن الباك إند يعمل وأن رابط API مضبوط على Render.';
  }
  if (status === 409 || lowerMessage.includes('already registered')) {
    return 'هذا البريد الإلكتروني مسجل مسبقاً. جرّب تسجيل الدخول بدل إنشاء حساب جديد.';
  }
  if (status === 404 || lowerMessage.includes('no account found')) {
    return 'لا يوجد حساب بهذا البريد الإلكتروني. أنشئ حساباً جديداً أولاً.';
  }
  if (status === 401 || lowerMessage.includes('incorrect password')) {
    return 'كلمة المرور غير صحيحة. تأكد منها وحاول مرة أخرى.';
  }
  if (status === 403 || lowerMessage.includes('inactive')) {
    return 'هذا الحساب غير مفعل حالياً. تواصل مع الإدارة لتفعيله.';
  }
  if (status === 400) {
    if (lowerMessage.includes('invalid email')) return 'البريد الإلكتروني غير صحيح.';
    if (lowerMessage.includes('phone')) return 'رقم الهاتف مطلوب لحساب ولي الأمر.';
    return message || 'البيانات المدخلة غير مكتملة أو غير صحيحة.';
  }
  if (status === 429) {
    return 'تمت محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.';
  }
  if (status >= 500) {
    if (lowerMessage.includes('encryption') || lowerMessage.includes('encrypt')) {
      return 'تعذر إنشاء الحساب بسبب إعداد التشفير في الخادم. تأكد من ENCRYPTION_KEY في Render ثم أعد النشر.';
    }
    return mode === 'register'
      ? 'تعذر إنشاء الحساب بسبب خطأ في الخادم. جرّب لاحقاً أو تواصل مع الدعم.'
      : 'تعذر تسجيل الدخول بسبب خطأ في الخادم. جرّب لاحقاً أو تواصل مع الدعم.';
  }

  return message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
};

const LoginPage = () => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForServer, setIsWaitingForServer] = useState(false);
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  const clearErrors = () => {
    setFieldErrors({});
    setGeneralError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearErrors();
    setIsSubmitting(true);
    setIsWaitingForServer(false);

    try {
      if (isRegisterMode) {
        const newErrors = {};
        if (!name.trim()) newErrors.name = 'الاسم مطلوب.';
        if (!phone.trim()) newErrors.phone = 'رقم الهاتف مطلوب.';
        if (!email.trim()) newErrors.email = 'البريد الإلكتروني مطلوب.';
        if (!password) newErrors.password = 'كلمة المرور مطلوبة.';
        if (password.length > 0 && password.length < 6) newErrors.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
        if (password !== confirmPassword) newErrors.confirmPassword = 'تأكيد كلمة المرور غير مطابق.';
        if (Object.keys(newErrors).length) {
          setFieldErrors(newErrors);
          return;
        }

        try {
          const data = await sendAuthWithWakeRetry(
            () => register({ name, email, password, phone, role: 'parent' }),
            setIsWaitingForServer
          );
          authLogin(data);
          navigate('/parent');
        } catch (err) {
          setGeneralError(getAuthErrorMessage(err, 'register'));
        }
        return;
      }

      if (!email.trim() || !password) {
        setFieldErrors({
          email: !email.trim() ? 'البريد الإلكتروني مطلوب.' : '',
          password: !password ? 'كلمة المرور مطلوبة.' : ''
        });
        return;
      }

      try {
        const data = await sendAuthWithWakeRetry(
          () => login({ email, password }),
          setIsWaitingForServer
        );
        authLogin(data);
        navigate(data.user.role === 'parent' ? '/parent' : '/admin');
      } catch (err) {
        setGeneralError(getAuthErrorMessage(err, 'login'));
      }
    } finally {
      setIsSubmitting(false);
      setIsWaitingForServer(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPhone('');
    setShowPassword(false);
    clearErrors();
  };

  const loadingTitle = isWaitingForServer ? 'Waking up the server' : (isRegisterMode ? 'Creating your account' : 'Signing you in');
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
        <h2>{isRegisterMode ? 'Create a Warriors Gym Account' : 'Warriors Gym Login'}</h2>
        {generalError && <p className="alert-error">{generalError}</p>}
        <form onSubmit={handleSubmit}>
          {isRegisterMode && (
            <>
              <label>Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              <label>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
            </>
          )}
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          <label>Password</label>
          <div className="password-input-row">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          {isRegisterMode && (
            <>
              <label>Confirm Password</label>
              <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
            </>
          )}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (isRegisterMode ? 'Signing Up...' : 'Signing In...') : (isRegisterMode ? 'Sign Up' : 'Sign In')}
          </button>
        </form>
        <div className="auth-switch">
          {isRegisterMode ? (
            <p>
              Already have an account? <button type="button" onClick={toggleMode}>Sign In</button>
            </p>
          ) : (
            <p>
              Don't have an account? <button type="button" onClick={toggleMode}>Sign Up</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
