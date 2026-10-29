import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminStats } from '../../shared/types';
import { formatINR } from '../../shared/whatsapp';
import { Icon } from '../components/Icon';
import { ProductImage } from '../components/ProductImage';
import { api } from '../lib/api';
import { invalidateApiCache } from '../lib/useApi';
import { useStore } from '../lib/store';
import { useAdmin } from './AdminApp';
import { downloadBackup } from './backup';
import { ConfirmDialog, useToast } from './ui';
import { UsageCard } from './UsageCard';

export default function Dashboard() {
  const { fail } = useAdmin();
  const toast = useToast();
  const { settings } = useStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [demoCount, setDemoCount] = useState(0);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const backup = async () => {
    setBackingUp(true);
    try {
      await downloadBackup();
      toast('Backup downloaded. Keep the file safe (e.g. Google Drive).');
    } catch (err) {
      fail(err, 'Could not download the backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const load = () => {
    setLoadError(false);
    api<AdminStats>('/admin/stats')
      .then((r) => {
        setStats(r);
        setDemoCount(r.demo);
      })
      .catch((err) => {
        setLoadError(true);
        fail(err, 'Could not load dashboard.');
      });
  };

  useEffect(load, []);

  const clearDemo = async () => {
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>('/admin/demo/clear', { method: 'POST' });
      invalidateApiCache();
      toast(`Removed ${r.deleted} demo products.`);
      setConfirmDemo(false);
      load();
    } catch (err) {
      fail(err, 'Could not remove demo products.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <Link to="/admin/products/new" className="btn btn--sm">
          <Icon name="plus" size={16} /> Add product
        </Link>
      </header>

      {!settings.whatsappNumber && (
        <div className="notice notice--warn">
          <Icon name="alert" size={20} />
          <div>
            <strong>WhatsApp number not set.</strong> Customers can't send enquiries until you add it.{' '}
            <Link to="/admin/settings">Add it in Settings →</Link>
          </div>
        </div>
      )}

      {demoCount > 0 && (
        <div className="notice">
          <Icon name="sparkle" size={20} />
          <div>
            <strong>Demo products are showing on your store.</strong> They are sample items for testing the layout. Remove them once you add your own products.
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDemo(true)}>
            Remove demo products
          </button>
        </div>
      )}

      {loadError && !stats ? (
        <div className="admin-card">
          <p>Could not load statistics.</p>
          <button className="btn btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <div className="stats">
          {[
            { label: 'All products', value: stats?.total, to: '/admin/products' },
            { label: 'On shop', value: stats?.active, to: '/admin/products?status=active' },
          ].map((s) => (
            <Link key={s.label} to={s.to} className="stat">
              <span className="stat__label">{s.label}</span>
              <span className="stat__value">{s.value ?? <span className="skeleton stat__skel" />}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="dash-grid">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Recently added</h2>
            <Link to="/admin/products" className="text-link">
              All products <Icon name="arrow" size={14} />
            </Link>
          </div>
          {stats && stats.recent.length === 0 ? (
            <div className="empty-mini">
              <p>No products yet.</p>
              <Link to="/admin/products/new" className="btn btn--sm">
                Add your first product
              </Link>
            </div>
          ) : (
            <ul className="recent">
              {(stats?.recent ?? []).map((p) => (
                <li key={p._id}>
                  <Link to={`/admin/products/${p._id}`} className="recent__row">
                    <ProductImage image={p.images[0]} alt="" ratio="4 / 5" thumbOnly className="recent__img" />
                    <span className="recent__name">{p.name}</span>
                    <span className="recent__meta mono">{formatINR(p.price)}</span>
                    <span className={`pill ${!p.isActive ? 'pill--muted' : p.inStock ? 'pill--ok' : 'pill--warn'}`}>
                      {!p.isActive ? 'Hidden' : p.inStock ? 'Live' : 'Sold out'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dash-col">
          <UsageCard />
          <section className="admin-card">
            <div className="admin-card__head">
              <h2>Backup</h2>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>
              Downloads all products and settings as one file. Do this once a week.
            </p>
            <button className="btn btn--block" onClick={backup} disabled={backingUp}>
              {backingUp && <span className="spinner" />} Download backup
            </button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDemo}
        title="Remove demo products?"
        message="All products marked as demo, and their sample images, will be permanently deleted. Your own products are not affected."
        confirmLabel="Remove demo products"
        danger
        busy={busy}
        onConfirm={clearDemo}
        onClose={() => setConfirmDemo(false)}
      />
    </div>
  );
}
