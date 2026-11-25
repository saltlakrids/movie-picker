import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { navigate } from '../router.jsx';

export default function Auth({ next, inviteCode }) {
  const { setUser } = useApp();
  const [mode, setMode] = useState(inviteCode ? 'register' : 'login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api(`/auth/${mode}`, { method: 'POST', body: form });
      setUser(user);
      navigate(next || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="brand">
        <div className="brand-logo">🍿</div>
        <h1>Movie Picker</h1>
        <p className="muted">Swipe together. Match on a movie. Rate it after.</p>
      </div>
      {inviteCode && <div className="notice">You've been invited to a movie party — sign in or create an account to join.</div>}
      <form className="card form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Sign up</button>
        </div>
        <label>
          Username
          <input autoComplete="username" value={form.username} onChange={set('username')} required minLength={3} autoFocus />
        </label>
        {mode === 'register' && (
          <label>
            Display name
            <input value={form.displayName} onChange={set('displayName')} placeholder="What your friends call you" maxLength={40} />
          </label>
        )}
        <label>
          Password
          <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password} onChange={set('password')} required minLength={6} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
    </main>
  );
}
