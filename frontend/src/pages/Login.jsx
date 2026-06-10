import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { login, register } from '../services/auth.js';
import warriorsLogo from '../assets/warriors-logo.png';

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
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  const clearErrors = () => {
    setFieldErrors({});
    setGeneralError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();

    if (isRegisterMode) {
      const newErrors = {};
      if (!name.trim()) newErrors.name = 'Name is required.';
      if (!phone.trim()) newErrors.phone = 'Phone is required.';
      if (!email.trim()) newErrors.email = 'Email is required.';
      if (!password) newErrors.password = 'Password is required.';
      if (password.length > 0 && password.length < 6) newErrors.password = 'Password must be at least 6 characters.';
      if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';
      if (Object.keys(newErrors).length) {
        setFieldErrors(newErrors);
        return;
      }

      try {
        const data = await register({ name, email, password, phone, role: 'parent' });
        authLogin(data);
        navigate('/parent');
      } catch (err) {
        const message = err.response?.data?.message || 'حدث خطأ، الرجاء المحاولة لاحقاً.';
        if (message.toLowerCase().includes('invalid encryption key')) {
          setGeneralError('حدث خطأ داخلي في الخادم. حاول التسجيل لاحقاً أو تواصل مع الدعم.');
        } else {
          setGeneralError(message);
        }
      }
      return;
    }

    if (!email.trim() || !password) {
      setFieldErrors({ email: !email.trim() ? 'Email is required.' : '', password: !password ? 'Password is required.' : '' });
      return;
    }

    try {
      const data = await login({ email, password });
      authLogin(data);
      navigate(data.user.role === 'parent' ? '/parent' : '/admin');
    } catch (err) {
      setGeneralError(err.response?.data?.message || 'Login failed.');
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

  return (
    <div className="page login-page">
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
          <button type="submit">{isRegisterMode ? 'Sign Up' : 'Sign In'}</button>
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
