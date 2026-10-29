import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Wordmark } from '../components/Wordmark';
import { api, ApiError } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = params.get('next');
  const safeNext = next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/login', { method: 'POST', json: { email, password } });
      navigate(safeNext, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__panel">
        <Link to="/" className="login__brand" aria-label="Back to store">
          <Wordmark size="lg" />
        </Link>
        <form className="login__form" onSubmit={submit} noValidate>
          <div>
            <h1>Store admin</h1>
            <p className="login__sub">Sign in to manage your products.</p>
          </div>
          {error && (
            <p className="form-alert" role="alert">
              <Icon name="alert" size={18} /> {error}
            </p>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <input
                id="password"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="input-wrap__btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          <button className="btn btn--block" disabled={busy}>
            {busy && <span className="spinner" />} {busy ? 'Signing in' : 'Sign in'}
          </button>
        </form>
        <Link to="/" className="login__back">
          <Icon name="arrow-left" size={16} /> Back to store
        </Link>
      </div>
    </div>
  );
}
