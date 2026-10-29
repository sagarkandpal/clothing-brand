import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Wordmark } from '../components/Wordmark';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import '../styles/admin.css';
import Dashboard from './Dashboard';
import Login from './Login';
import ProductForm from './ProductForm';
import ProductsList from './ProductsList';
import Settings from './Settings';
import { ToastProvider, useToast } from './ui';

interface AdminCtx {
  email: string;
  /** Shows an error toast; on an expired session, sends the admin to sign in. */
  fail: (err: unknown, fallback?: string) => void;
}

const AdminContext = createContext<AdminCtx>({ email: '', fail: () => {} });
export const useAdmin = () => useContext(AdminContext);

function RequireAuth({ children }: { children: (email: string) => ReactNode }) {
  const [state, setState] = useState<{ email?: string; error?: string; checked: boolean }>({ checked: false });
  const location = useLocation();

  const check = useCallback(() => {
    setState({ checked: false });
    api<{ email: string }>('/admin/session')
      .then((r) => setState({ email: r.email, checked: true }))
      .catch((err: ApiError) => setState({ checked: true, error: err.status === 401 ? undefined : err.message }));
  }, []);

  useEffect(check, [check]);

  if (!state.checked) {
    return (
      <div className="admin-boot">
        <span className="spinner" />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="admin-boot">
        <div className="admin-card admin-boot__error" role="alert">
          <Icon name="alert" size={28} />
          <p>{state.error}</p>
          <button className="btn btn--sm" onClick={check}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!state.email) {
    const next = location.pathname + location.search;
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children(state.email)}</>;
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/admin/products', label: 'Products', icon: 'box', end: true },
  { to: '/admin/products/new', label: 'Add product', icon: 'plus' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

function AdminLayout({ email }: { email: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const fail = useCallback(
    (err: unknown, fallback = 'Something went wrong.') => {
      if (err instanceof ApiError && err.status === 401) {
        toast('Your session has expired. Please sign in again.', 'error');
        navigate(`/admin/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
        return;
      }
      toast(err instanceof Error && err.message ? err.message : fallback, 'error');
    },
    [navigate, location.pathname, toast],
  );

  const logout = async () => {
    try {
      await api('/admin/logout', { method: 'POST' });
    } catch {
      /* the cookie is cleared server-side when reachable; navigate regardless */
    }
    navigate('/admin/login', { replace: true });
  };

  return (
    <AdminContext.Provider value={{ email, fail }}>
      <div className="admin">
        <aside className="admin__side">
          <Link to="/admin" className="admin__brand">
            <Wordmark size="sm" />
            <span className="admin__badge">Admin</span>
          </Link>
          <nav className="admin__nav" aria-label="Admin">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="admin__link">
                <Icon name={n.icon} size={19} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="admin__side-foot">
            <a href="/" target="_blank" rel="noopener" className="admin__link">
              <Icon name="external" size={19} />
              <span>See shop</span>
            </a>
            <button className="admin__link" onClick={logout}>
              <Icon name="logout" size={19} />
              <span>Sign out</span>
            </button>
            <p className="admin__email" title={email}>
              {email}
            </p>
          </div>
        </aside>
        <div className="admin__main">
          <Outlet />
        </div>
      </div>
    </AdminContext.Provider>
  );
}

export default function AdminApp() {
  const { settings } = useStore();
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = `Admin — ${settings.storeName}`;
    return () => meta.remove();
  }, [settings.storeName]);

  return (
    <ToastProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route element={<RequireAuth>{(email) => <AdminLayout email={email} />}</RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<ProductsList />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id" element={<ProductForm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
