import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CATEGORIES, COLLECTIONS, LEGACY_CATEGORIES, categoryLabel, collectionBySlug, isCategory, type Category } from '../../shared/catalog';
import type { ProductCard, ProductListResponse } from '../../shared/types';
import { Icon } from '../components/Icon';
import { ProductGrid } from '../components/ProductCard';
import { EmptyState, ErrorState } from '../components/States';
import { api, ApiError } from '../lib/api';
import { usePageTitle } from '../lib/store';
import { useApi } from '../lib/useApi';
import NotFound from './NotFound';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'featured', label: 'New arrivals first' },
];

const PAGE_SIZE = 24;
/** Cards per segment on the "All products" view; the rest is one tap away. */
const SEGMENT_SIZE = 8;

/** One segment (Upper Wear / Bottom Wear) with its own heading and cards. */
function SegmentSection({ segment, filters }: { segment: Category; filters: string }) {
  const sp = new URLSearchParams(filters);
  sp.set('category', segment.slug);
  sp.set('limit', String(SEGMENT_SIZE));
  sp.set('facets', '0');
  const { data, loading } = useApi<ProductListResponse>(`/products?${sp.toString()}`);
  if (data && data.total === 0) return null;
  const viewAll = `/shop/${segment.slug}${filters ? `?${filters}` : ''}`;
  return (
    <section className="segment" aria-labelledby={`seg-${segment.slug}`}>
      <div className="section-head">
        <div>
          <span className="eyebrow">{data ? `${data.total} ${data.total === 1 ? 'piece' : 'pieces'}` : ' '}</span>
          <h3 id={`seg-${segment.slug}`} className="display segment__title">
            {segment.label}
          </h3>
        </div>
        <Link to={viewAll} className="text-link">
          View all <Icon name="arrow" size={14} />
        </Link>
      </div>
      <ProductGrid products={data?.items} loading={loading && !data} skeletons={4} className="pgrid--shop" />
      {data && data.total > SEGMENT_SIZE && (
        <div className="shop__more">
          <Link to={viewAll} className="btn btn--ghost">
            See all {data.total} in {segment.label}
          </Link>
        </div>
      )}
    </section>
  );
}

/** `embedded`: shown at the bottom of the homepage (uses an h2, leaves the page title alone). */
export default function Shop({ embedded = false }: { embedded?: boolean }) {
  const { category = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? '';
  const size = params.get('size') ?? '';
  const color = params.get('color') ?? '';
  const inStock = params.get('inStock') === '1';

  const valid = !category || isCategory(category) || !!collectionBySlug(category);
  // "All products" without a search shows each segment (Upper / Bottom) as its own section.
  const segmented = !category && !q;
  const title = q ? `“${q}”` : category ? (collectionBySlug(category)?.label ?? categoryLabel(category)) : 'All Products';
  // The shop is also the homepage, so the plain listing uses the default store title.
  usePageTitle(embedded ? undefined : q ? `Search: ${q}` : category ? title : null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (category) sp.set('category', category);
    if (q) sp.set('q', q);
    if (sort) sp.set('sort', sort);
    if (size) sp.set('size', size);
    if (color) sp.set('color', color);
    if (inStock) sp.set('inStock', '1');
    // In the segmented view this request only provides the total and the filter options.
    sp.set('limit', segmented ? '1' : String(PAGE_SIZE));
    return sp.toString();
  }, [category, q, sort, size, color, inStock, segmented]);

  // Filters carried into each segment section and its "View all" link.
  const filters = useMemo(() => {
    const sp = new URLSearchParams();
    if (sort) sp.set('sort', sort);
    if (size) sp.set('size', size);
    if (color) sp.set('color', color);
    if (inStock) sp.set('inStock', '1');
    return sp.toString();
  }, [sort, size, color, inStock]);

  const first = useApi<ProductListResponse>(valid ? `/products?${query}` : null);
  const [extra, setExtra] = useState<ProductCard[]>([]);
  const [page, setPage] = useState(1);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    setExtra([]);
    setPage(1);
    setMoreError(null);
  }, [query]);

  useEffect(() => setFiltersOpen(false), [category]);

  // Search box text; pushed into ?q= after a short pause in typing.
  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);
  useEffect(() => {
    const term = searchText.trim();
    if (term === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term) next.set('q', term);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [filtersOpen]);

  // Old links such as /shop/jeans go to their segment.
  if (LEGACY_CATEGORIES[category]) return <Navigate to={`/shop/${LEGACY_CATEGORIES[category]}${location.search}`} replace />;
  if (!valid) return <NotFound />;

  const data = first.data;
  const items = data ? [...data.items, ...extra] : null;
  const hasMore = !!data && page < data.pages;

  const loadMore = async () => {
    setMoreLoading(true);
    setMoreError(null);
    try {
      const next = await api<ProductListResponse>(`/products?${query}&page=${page + 1}&facets=0`);
      setExtra((e) => [...e, ...next.items.filter((n) => !e.some((x) => x._id === n._id))]);
      setPage((p) => p + 1);
    } catch (err) {
      setMoreError(err instanceof ApiError ? err.message : 'Could not load more products.');
    } finally {
      setMoreLoading(false);
    }
  };

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key !== 'q' });
  };

  const clearAll = () => setParams(q ? { q } : {});
  const activeCount = [size, color, inStock ? '1' : ''].filter(Boolean).length;

  const filterPanel = (
    <div className="filters">
      {!!data?.facets.sizes.length && (
        <div className="filters__group">
          <p className="filters__title" id="size-filter">
            Size
          </p>
          <div className="chip-row" role="group" aria-labelledby="size-filter">
            {data.facets.sizes.map((s) => (
              <button
                key={s}
                className={`chip ${size === s ? 'is-active' : ''}`}
                aria-pressed={size === s}
                onClick={() => update('size', size === s ? null : s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {!!data?.facets.colors.length && (
        <div className="filters__group">
          <p className="filters__title" id="color-filter">
            Colour
          </p>
          <div className="color-filter" role="group" aria-labelledby="color-filter">
            {data.facets.colors.map((c) => (
              <button
                key={c.name}
                className={`color-opt ${color === c.name ? 'is-active' : ''}`}
                aria-pressed={color === c.name}
                onClick={() => update('color', color === c.name ? null : c.name)}
              >
                <span className="swatch-dot swatch-dot--lg" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filters__group">
        <label className="check">
          <input type="checkbox" checked={inStock} onChange={(e) => update('inStock', e.target.checked ? '1' : null)} />
          In stock only
        </label>
      </div>
    </div>
  );

  return (
    <div className="shop">
      <div className="container">
        <header className="shop__head">
          {(category || q) && (
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link to="/">All products</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{q ? 'Search' : title}</span>
            </nav>
          )}
          {embedded ? (
            <h2 className="display shop__title">{q ? <>Results for {title}</> : title}</h2>
          ) : (
            <h1 className="display shop__title">{q ? <>Results for {title}</> : title}</h1>
          )}
          <p className="shop__count mono" aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? 'piece' : 'pieces'}` : ' '}
          </p>
        </header>

        <form className="shop__search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="shop-search" className="sr-only">
            Search products
          </label>
          <Icon name="search" size={18} />
          <input
            id="shop-search"
            type="search"
            className="input"
            placeholder="Search tees, hoodies, cargos…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          {searchText && (
            <button type="button" className="icon-btn" onClick={() => setSearchText('')} aria-label="Clear search">
              <Icon name="close" size={16} />
            </button>
          )}
        </form>

        <nav className="shop__cats" aria-label="Categories">
          <Link
            to={{
              pathname: '/',
              search: q ? `?q=${encodeURIComponent(q)}` : '',
            }}
            className={`chip ${!category ? 'is-active' : ''}`}
          >
            All products
          </Link>
          {[...CATEGORIES, ...COLLECTIONS].map((c) => (
            <Link key={c.slug} to={`/shop/${c.slug}`} className={`chip ${category === c.slug ? 'is-active' : ''}`}>
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="shop__toolbar">
          <button className="btn btn--ghost btn--sm shop__filter-btn" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
            <Icon name="filter" size={16} /> Filters
            {activeCount ? ` (${activeCount})` : ''}
          </button>
          <div className="shop__active">
            {q && (
              <button className="chip chip--removable" onClick={() => update('q', null)}>
                Search: {q} <Icon name="close" size={14} />
              </button>
            )}
            {size && (
              <button className="chip chip--removable" onClick={() => update('size', null)}>
                Size {size} <Icon name="close" size={14} />
              </button>
            )}
            {color && (
              <button className="chip chip--removable" onClick={() => update('color', null)}>
                {color} <Icon name="close" size={14} />
              </button>
            )}
            {inStock && (
              <button className="chip chip--removable" onClick={() => update('inStock', null)}>
                In stock <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <label className="shop__sort">
            <span className="sr-only">Sort by</span>
            <select
              className="select"
              value={sort || 'newest'}
              onChange={(e) => update('sort', e.target.value === 'newest' ? null : e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="shop__layout">
          <div className="shop__results">
            {first.error ? (
              <ErrorState message={first.error.message} onRetry={first.reload} />
            ) : segmented && data && data.total > 0 ? (
              CATEGORIES.map((seg) => <SegmentSection key={seg.slug} segment={seg} filters={filters} />)
            ) : items && items.length === 0 ? (
              <EmptyState
                title={q ? 'No matches' : 'Nothing here yet'}
                action={
                  activeCount || q ? (
                    <button className="btn btn--ghost" onClick={() => setParams({})}>
                      Clear filters
                    </button>
                  ) : (
                    <Link className="btn btn--ghost" to="/">
                      Browse all products
                    </Link>
                  )
                }
              >
                {q
                  ? 'Try a different word — e.g. “hoodie”, “cargo” or “oversized”.'
                  : activeCount
                    ? 'No products match these filters. Try removing one.'
                    : 'New pieces for this category are coming soon.'}
              </EmptyState>
            ) : (
              <>
                <ProductGrid products={items} loading={first.loading && !data} priorityCount={4} skeletons={8} className="pgrid--shop" />
                {data && (
                  <div className="shop__more">
                    <p className="mono">
                      Showing {items?.length} of {data.total}
                    </p>
                    {moreError && (
                      <p className="error-text" role="alert">
                        {moreError}
                      </p>
                    )}
                    {hasMore && (
                      <button className="btn btn--ghost" onClick={loadMore} disabled={moreLoading}>
                        {moreLoading ? <span className="spinner" /> : null}
                        {moreLoading ? 'Loading' : 'Load more'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Rendered on <body> so the panel always sits above the sticky header. */}
      {createPortal(
        <>
          <div className={`drawer-scrim ${filtersOpen ? 'is-open' : ''}`} onClick={() => setFiltersOpen(false)} aria-hidden="true" />
          <aside className={`sheet ${filtersOpen ? 'is-open' : ''}`} aria-label="Filters" aria-hidden={!filtersOpen}>
            <div className="sheet__head">
              <p className="display">Filters</p>
              <button className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <Icon name="close" />
              </button>
            </div>
            <div className="sheet__body">{filterPanel}</div>
            <div className="sheet__foot">
              <button className="btn btn--ghost" onClick={clearAll}>
                Clear
              </button>
              <button className="btn" onClick={() => setFiltersOpen(false)}>
                Show {data?.total ?? ''} results
              </button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </div>
  );
}
