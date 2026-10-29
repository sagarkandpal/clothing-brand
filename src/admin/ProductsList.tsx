import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, categoryLabel } from '../../shared/catalog';
import type { Product } from '../../shared/types';
import { formatINR } from '../../shared/whatsapp';
import { Icon } from '../components/Icon';
import { ProductImage } from '../components/ProductImage';
import { api } from '../lib/api';
import { invalidateApiCache } from '../lib/useApi';
import { useAdmin } from './AdminApp';
import { ConfirmDialog, useToast } from './ui';

type Row = Pick<
  Product,
  '_id' | 'name' | 'slug' | 'category' | 'price' | 'images' | 'totalStock' | 'inStock' | 'isActive' | 'isFeatured' | 'isDemo' | 'sizes' | 'colors'
>;

interface ListResponse {
  items: Row[];
  total: number;
  page: number;
  pages: number;
}

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'On shop' },
  { value: 'inactive', label: 'Hidden' },
];

export default function ProductsList() {
  const { fail } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const query = new URLSearchParams();
  if (params.get('q')) query.set('q', params.get('q')!);
  if (status) query.set('status', status);
  if (category) query.set('category', category);
  query.set('page', String(page));
  const qs = query.toString();

  const load = () => {
    setLoading(true);
    api<ListResponse>(`/admin/products?${qs}`)
      .then(setData)
      .catch((err) => fail(err, 'Could not load products.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [qs]);

  // Debounced search box → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') === q.trim()) return;
      const next = new URLSearchParams(params);
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const toggle = async (row: Row, field: 'isActive' | 'isFeatured') => {
    setPending(row._id + field);
    try {
      const updated = await api<Product>(`/admin/products/${row._id}`, { method: 'PATCH', json: { [field]: !row[field] } });
      setData((d) => d && { ...d, items: d.items.map((i) => (i._id === row._id ? { ...i, [field]: updated[field] } : i)) });
      invalidateApiCache();
      toast(
        field === 'isActive'
          ? updated.isActive
            ? `“${row.name}” is now live.`
            : `“${row.name}” is hidden from the store.`
          : updated.isFeatured
            ? `“${row.name}” added to new arrivals.`
            : `“${row.name}” removed from new arrivals.`,
      );
    } catch (err) {
      fail(err, 'Could not update the product.');
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/admin/products/${toDelete._id}`, { method: 'DELETE' });
      invalidateApiCache();
      toast(`“${toDelete.name}” deleted.`);
      setToDelete(null);
      load();
    } catch (err) {
      fail(err, 'Could not delete the product.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>Products {data && <span className="admin-page__count">{data.total}</span>}</h1>
        </div>
        <Link to="/admin/products/new" className="btn btn--sm">
          <Icon name="plus" size={16} /> Add product
        </Link>
      </header>

      <div className="list-tools">
        <label className="search-input">
          <Icon name="search" size={18} />
          <span className="sr-only">Search products</span>
          <input type="search" className="input" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className="select" value={category} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tabs" role="tablist" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button key={s.value} role="tab" aria-selected={status === s.value} className={`tab ${status === s.value ? 'is-active' : ''}`} onClick={() => setParam('status', s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className={`plist ${loading ? 'is-loading' : ''}`}>
        {data && data.items.length === 0 && !loading ? (
          <div className="empty-mini">
            <p>{params.get('q') || status || category ? 'No products match.' : 'No products yet.'}</p>
            <Link to="/admin/products/new" className="btn btn--sm">
              Add a product
            </Link>
          </div>
        ) : (
          (data?.items ?? []).map((p) => (
            <article key={p._id} className={`prow ${p.isActive ? '' : 'prow--hidden'}`}>
              <Link to={`/admin/products/${p._id}`} className="prow__img" aria-label={`Edit ${p.name}`}>
                <ProductImage image={p.images[0]} alt="" ratio="4 / 5" thumbOnly />
              </Link>
              <div className="prow__main">
                <Link to={`/admin/products/${p._id}`} className="prow__name">
                  {p.name}
                </Link>
                <p className="prow__meta">
                  {categoryLabel(p.category)} · <span className="mono">{formatINR(p.price)}</span>
                  {p.isDemo && <span className="pill pill--muted">Demo</span>}
                </p>
              </div>
              <div className="prow__stock">
                {(() => {
                  const sold = p.colors.filter((c) => c.soldOut).length;
                  if (!p.inStock) return <span className="pill pill--danger">Sold out</span>;
                  if (sold) return <span className="pill pill--warn">{p.colors.length - sold} of {p.colors.length} colours available</span>;
                  return <span className="pill pill--ok">{p.colors.length ? `${p.colors.length} colours available` : 'Available'}</span>;
                })()}
              </div>
              <div className="prow__toggles">
                <button
                  className={`toggle ${p.isActive ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={p.isActive}
                  onClick={() => toggle(p, 'isActive')}
                  disabled={pending === p._id + 'isActive'}
                >
                  <span className="toggle__track" />
                  <span>On shop</span>
                </button>
              </div>
              <div className="prow__actions">
                {p.isActive && (
                  <a className="icon-btn" href={`/product/${p.slug}`} target="_blank" rel="noopener" aria-label={`View ${p.name} on store`} title="View on store">
                    <Icon name="external" size={18} />
                  </a>
                )}
                <Link className="icon-btn" to={`/admin/products/${p._id}`} aria-label={`Edit ${p.name}`} title="Edit">
                  <Icon name="edit" size={18} />
                </Link>
                <button className="icon-btn icon-btn--danger" onClick={() => setToDelete(p)} aria-label={`Delete ${p.name}`} title="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </article>
          ))
        )}
        {!data && loading && Array.from({ length: 5 }, (_, i) => <div key={i} className="prow prow--skeleton skeleton" />)}
      </div>

      {data && data.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
            Previous
          </button>
          <span className="mono">
            Page {data.page} of {data.pages}
          </span>
          <button className="btn btn--ghost btn--sm" disabled={page >= data.pages} onClick={() => setParam('page', String(page + 1))}>
            Next
          </button>
        </nav>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this product?"
        message={
          <>
            <strong>{toDelete?.name}</strong> and its photos will be deleted for good. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
