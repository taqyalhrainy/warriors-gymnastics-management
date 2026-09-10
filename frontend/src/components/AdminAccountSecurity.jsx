import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminAccountSecurity({ recovery = false }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(recovery ? 'reset-password' : 'change-password');
  const [form, setForm] = useState({ username: '', recoveryCode: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const field = (name, label, autocomplete, type = 'password') => (
    <label key={name}>
      <span>{label}</span>
      <input required type={type} autoComplete={autocomplete} value={form[name]}
        minLength={name === 'newPassword' ? 12 : undefined}
        maxLength={name === 'username' ? 254 : name === 'recoveryCode' ? 100 : 72}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })} />
    </label>
  );
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (mode !== 'recovery-code' && form.newPassword !== form.confirmPassword) {
      setError('New passwords must match.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/auth/admin/${mode}`, form, { __skipRetry: true, __skipAuthInvalidation: true });
      setForm({ username: '', recoveryCode: '', currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(data.message || 'New recovery code generated.');
      if (mode !== 'recovery-code') logout();
      if (data.recoveryCode) setCode(data.recoveryCode);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to complete the request. Please try again.');
    } finally { setBusy(false); }
  };

  if (code) return (
    <section>
      <h2>Save Your Recovery Code</h2>
      <p>{message}</p>
      <p>This code is shown only once. Keep it somewhere private. Your previous code no longer works.</p>
      <output style={{ display: 'block', overflowWrap: 'anywhere', userSelect: 'all', margin: '16px 0' }}>{code}</output>
      <button type="button" className="btn-primary" onClick={() => {
        setCode(''); setMessage('');
        if (recovery) navigate('/admin/login', { replace: true });
      }}>I saved my code</button>
    </section>
  );

  return (
    <section>
      <h2>{recovery ? 'Reset Admin Password' : 'Admin Settings'}</h2>
      {!recovery && <div className="security-tabs">
        <button type="button" disabled={busy} className={mode === 'change-password' ? 'active' : ''} onClick={() => { setMode('change-password'); setError(''); }}>Change Password</button>
        <button type="button" disabled={busy} className={mode === 'recovery-code' ? 'active' : ''} onClick={() => { setMode('recovery-code'); setError(''); }}>Generate New Recovery Code</button>
      </div>}
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <form className="security-password-form" onSubmit={submit}>
        {recovery ? <>
          {field('username', 'Admin Username (Email)', 'username', 'text')}
          {field('recoveryCode', 'Recovery Code', 'off')}
        </> : field('currentPassword', 'Current Password', 'current-password')}
        {mode !== 'recovery-code' && <>
          {field('newPassword', 'New Password (at least 12 characters)', 'new-password')}
          {field('confirmPassword', 'Confirm New Password', 'new-password')}
        </>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Please wait...' : recovery ? 'Reset Password' : mode === 'recovery-code' ? 'Generate New Recovery Code' : 'Change Password'}</button>
      </form>
      {recovery && <Link to="/admin/login">Back to Admin Login</Link>}
    </section>
  );
}
