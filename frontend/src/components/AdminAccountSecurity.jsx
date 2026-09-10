import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { username: '', recoverySecret: '', currentPassword: '', newPassword: '', confirmPassword: '' };

export default function AdminAccountSecurity({ recovery = false }) {
  const { logout } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const field = (name, label, autocomplete, type = 'password') => (
    <label key={name}>
      <span>{label}</span>
      <input required type={type} autoComplete={autocomplete} value={form[name]}
        minLength={name === 'newPassword' ? 12 : undefined}
        maxLength={name === 'username' ? 254 : name === 'recoverySecret' ? 256 : 72}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })} />
    </label>
  );
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords must match.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/auth/admin/${recovery ? 'reset-password' : 'change-password'}`, form, { __skipRetry: true, __skipAuthInvalidation: true });
      setForm(emptyForm);
      setDone(true);
      logout();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to complete the request. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <section>
      <h2>{recovery ? 'Reset Admin Password' : 'Change Password'}</h2>
      {done ? <p role="status">Password reset. Sign in with your new password.</p> : <>
        {error && <p className="alert-error" role="alert">{error}</p>}
        <form className="security-password-form" onSubmit={submit}>
          {recovery ? <>
            {field('username', 'Admin Username (Email)', 'username', 'text')}
            {field('recoverySecret', 'Recovery Secret', 'off')}
          </> : field('currentPassword', 'Current Password', 'current-password')}
          {field('newPassword', 'New Password (at least 12 characters)', 'new-password')}
          {field('confirmPassword', 'Confirm New Password', 'new-password')}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Please wait...' : recovery ? 'Reset Password' : 'Change Password'}</button>
        </form>
      </>}
      {recovery && <Link to="/admin/login">Back to Admin Login</Link>}
    </section>
  );
}
