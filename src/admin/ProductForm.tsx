import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, COLOR_PRESETS, SIZE_OPTIONS, normalizeCategory, sortSizes } from '../../shared/catalog';
import type { ImageKind, Product, ProductColor } from '../../shared/types';
import { Icon } from '../components/Icon';
import { ProductImage } from '../components/ProductImage';
import { api, ApiError } from '../lib/api';
import { invalidateApiCache } from '../lib/useApi';
import { useAdmin } from './AdminApp';
import { compressAndUpload } from './imageUpload';
import { ConfirmDialog, useToast } from './ui';

/**
 * One-page product form, kept simple for a non-technical shop owner:
 * details → sizes → colours (each with its own photos and Available / Sold out
 * switch) → extra photos → Save. No stock numbers to type.
 */

interface FormImage {
  id: string;
  width: number;
  height: number;
  color: string | null;
  kind?: ImageKind;
  cutout?: boolean;
}

interface Upload {
  key: string;
  /** Colour the photo belongs to, or null for "all colours". */
  color: string | null;
  preview: string;
  status: 'working' | 'error';
  error?: string;
}

interface FormState {
  name: string;
  description: string;
  category: string;
  price: string;
  images: FormImage[];
  sizes: string[];
  colors: ProductColor[];
  /** Only used when the product has no colours. */
  soldOut: boolean;
  isActive: boolean;
  isFeatured: boolean;
}

/** Light shape from the admin product list, used by "Copy colours from". */
interface ColorSource {
  _id: string;
  name: string;
  colors: ProductColor[];
}

const EMPTY: FormState = {
  name: '',
  description: '',
  category: '',
  price: '',
  images: [],
  sizes: [],
  colors: [],
  soldOut: false,
  isActive: true,
  isFeatured: false,
};

// Must match server/validate.ts.
const MAX_IMAGES = 30;
const MAX_COLORS = 20;

function fromProduct(p: Product): FormState {
  return {
    name: p.name,
    description: p.description,
    category: normalizeCategory(p.category) ?? '',
    price: String(p.price),
    images: p.images.map((i) => ({ ...i })),
    sizes: [...p.sizes],
    // Older products used stock numbers: a colour with no stock counts as sold out.
    colors: p.colors.map((c) => ({
      name: c.name,
      hex: c.hex,
      soldOut: c.soldOut ?? !p.variants.some((v) => v.color === c.name && v.stock > 0),
    })),
    soldOut: !p.inStock,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
  };
}

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length < 2) e.name = 'Enter a product name.';
  if (!f.category) e.category = 'Tap Upper Wear or Bottom Wear.';
  const price = Number(f.price);
  if (!f.price || !Number.isInteger(price) || price < 1) e.price = 'Enter the price in rupees.';
  if (!f.sizes.length) e.sizes = 'Tap at least one size.';
  return e;
}

/** Shared photos first (the first one is the cover), then each colour's photos in colour order. */
function orderedImages(f: FormState): FormImage[] {
  const shared = f.images.filter((i) => !i.color);
  const byColor = f.colors.flatMap((c) => f.images.filter((i) => i.color === c.name));
  return [...shared, ...byColor];
}

function toBody(f: FormState) {
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    category: f.category,
    price: Number(f.price),
    // MRP is no longer entered in the admin; saving clears any old one.
    originalPrice: null,
    images: orderedImages(f).map((i) => ({ id: i.id, color: i.color, kind: i.kind ?? 'photo' })),
    sizes: f.sizes,
    colors: f.colors,
    soldOut: f.soldOut,
    isActive: f.isActive,
    isFeatured: f.isFeatured,
  };
}

/** Small photo strip with remove buttons, plus any uploads still in progress. */
function PhotoStrip({
  images,
  uploads,
  coverId,
  onRemove,
  onDismiss,
}: {
  images: FormImage[];
  uploads: Upload[];
  coverId?: string;
  onRemove: (id: string) => void;
  onDismiss: (key: string) => void;
}) {
  if (!images.length && !uploads.length) return null;
  return (
    <ul className="photo-strip">
      {images.map((img) => (
        <li key={img.id} className="photo-strip__item">
          <ProductImage image={img} alt="" ratio="4 / 5" thumbOnly />
          {img.id === coverId && <span className="img-tile__cover">Cover</span>}
          <button type="button" className="photo-strip__remove" onClick={() => onRemove(img.id)} aria-label="Remove photo">
            <Icon name="close" size={14} />
          </button>
        </li>
      ))}
      {uploads.map((u) => (
        <li key={u.key} className="photo-strip__item">
          <div className="img-tile__preview" style={{ aspectRatio: '4 / 5', backgroundImage: `url(${u.preview})` }} />
          {u.status === 'working' ? (
            <div className="img-tile__overlay">
              <span className="spinner" />
            </div>
          ) : (
            <button type="button" className="img-tile__overlay img-tile__overlay--error" onClick={() => onDismiss(u.key)}>
              <strong>Upload failed</strong>
              {u.error && <span className="img-tile__reason">{u.error}</span>}
              <span>Tap to close</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { fail } = useAdmin();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [initial, setInitial] = useState<string>(JSON.stringify(EMPTY));
  const [version, setVersion] = useState(0);
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [newColor, setNewColor] = useState({ name: '', hex: '#777777' });
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [sources, setSources] = useState<ColorSource[] | null>(null);
  const [removeColor, setRemoveColor] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  // Which colour the next picked files belong to (null = all colours).
  const uploadTarget = useRef<string | null>(null);

  const dirty = !saved && JSON.stringify(form) !== initial;
  const allowLeave = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const loadProduct = () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    api<Product>(`/admin/products/${id}`)
      .then((p) => {
        const f = fromProduct(p);
        setForm(f);
        setInitial(JSON.stringify(f));
        setVersion(p.version);
        setSlug(p.slug);
        setConflict(false);
        setSaved(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) fail(err);
        else setLoadError(err instanceof ApiError && err.status === 404 ? 'This product no longer exists.' : err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (id) loadProduct();
    else {
      setForm(EMPTY);
      setInitial(JSON.stringify(EMPTY));
      setLoading(false);
    }
  }, [id]);

  // Products that have colours, for "Copy colours from".
  useEffect(() => {
    api<{ items: ColorSource[] }>('/admin/products')
      .then((r) => setSources(r.items.filter((p) => p._id !== id && p.colors?.length)))
      .catch(() => setSources([]));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  /** Picking a segment also swaps in its usual sizes, unless sizes were already changed by hand. */
  const pickSegment = (slug: string) => {
    const untouched = !form.sizes.length || CATEGORIES.some((c) => c.defaultSizes.join() === form.sizes.join());
    const seg = CATEGORIES.find((c) => c.slug === slug);
    setForm((f) => ({ ...f, category: slug, sizes: untouched && seg ? [...seg.defaultSizes] : f.sizes }));
    setErrors((e) => ({ ...e, category: '', sizes: '' }));
  };

  // ------------------------------------------------------------ photos
  const pickPhotos = (color: string | null) => {
    uploadTarget.current = color;
    fileInput.current?.click();
  };

  const addFiles = async (files: FileList) => {
    const color = uploadTarget.current;
    const list = Array.from(files);
    const room = MAX_IMAGES - form.images.length - uploads.filter((u) => u.status === 'working').length;
    if (room <= 0) return toast(`A product can have up to ${MAX_IMAGES} photos.`, 'error');
    if (list.length > room) toast(`Only ${room} more photo(s) fit (max ${MAX_IMAGES}).`, 'info');
    for (const file of list.slice(0, room)) {
      const k = Math.random().toString(36).slice(2);
      const preview = URL.createObjectURL(file);
      setUploads((u) => [...u, { key: k, color, preview, status: 'working' }]);
      try {
        const img = await compressAndUpload(file);
        setForm((f) => ({ ...f, images: [...f.images, { ...img, color, kind: 'photo' }] }));
        setUploads((u) => u.filter((x) => x.key !== k));
        URL.revokeObjectURL(preview);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return fail(err);
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        setUploads((u) => u.map((x) => (x.key === k ? { ...x, status: 'error', error: msg } : x)));
      }
    }
  };

  const removeImage = (imgId: string) => set('images', form.images.filter((x) => x.id !== imgId));
  const dismissUpload = (key: string) => setUploads((u) => u.filter((x) => x.key !== key));

  // ------------------------------------------------------------- sizes
  const toggleSize = (s: string) => set('sizes', form.sizes.includes(s) ? form.sizes.filter((x) => x !== s) : sortSizes([...form.sizes, s]));

  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase();
    if (!s || !/^[A-Z0-9][A-Z0-9 ./-]{0,11}$/.test(s)) {
      return toast('Size can use letters and numbers (max 12).', 'error');
    }
    if (!form.sizes.includes(s)) set('sizes', sortSizes([...form.sizes, s]));
    setCustomSize('');
  };

  // ----------------------------------------------------------- colours
  const hasColor = (name: string) => form.colors.some((c) => c.name.toLowerCase() === name.toLowerCase());

  const addColors = (list: { name: string; hex: string }[]) => {
    const fresh = list.filter((c) => !hasColor(c.name));
    if (!fresh.length) return toast('These colours are already added.', 'info');
    const room = MAX_COLORS - form.colors.length;
    if (room <= 0) return toast(`Up to ${MAX_COLORS} colours per product.`, 'error');
    if (fresh.length > room) toast(`Only ${room} more colour(s) fit (max ${MAX_COLORS}).`, 'info');
    set('colors', [...form.colors, ...fresh.slice(0, room).map((c) => ({ name: c.name, hex: c.hex.toUpperCase() }))]);
  };

  const addNewColor = () => {
    const name = newColor.name.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!name) return toast('Type a colour name.', 'error');
    if (hasColor(name)) return toast('This colour is already added.', 'error');
    addColors([{ name, hex: newColor.hex }]);
    setNewColor({ name: '', hex: newColor.hex });
  };

  const copyColorsFrom = (sourceId: string) => {
    const src = sources?.find((s) => s._id === sourceId);
    if (src) addColors(src.colors);
  };

  const setColor = (name: string, patch: Partial<ProductColor>) =>
    set('colors', form.colors.map((c) => (c.name === name ? { ...c, ...patch } : c)));

  const setAllColors = (soldOut: boolean) => set('colors', form.colors.map((c) => ({ ...c, soldOut })));

  /** Removing a colour also removes the photos that were added for it. */
  const deleteColor = (name: string) => {
    setForm((f) => ({
      ...f,
      colors: f.colors.filter((c) => c.name !== name),
      images: f.images.filter((i) => i.color !== name),
    }));
    setRemoveColor(null);
  };

  const askDeleteColor = (name: string) => {
    if (form.images.some((i) => i.color === name)) setRemoveColor(name);
    else deleteColor(name);
  };

  // -------------------------------------------------------------- save
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError('Please fix the boxes marked in red.');
      document.querySelector('[aria-invalid="true"], .field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (uploads.some((u) => u.status === 'working')) return setFormError('Please wait, photos are still uploading.');

    setSaving(true);
    try {
      const body = toBody(form);
      const product = isEdit
        ? await api<Product>(`/admin/products/${id}`, { method: 'PUT', json: { ...body, version } })
        : await api<Product>('/admin/products', { method: 'POST', json: body });
      invalidateApiCache();
      toast(isEdit ? 'Saved. The shop is updated.' : `“${product.name}” is ${product.isActive ? 'now on the shop' : 'saved (hidden)'}.`);
      if (isEdit) {
        const f = fromProduct(product);
        setForm(f);
        setInitial(JSON.stringify(f));
        setVersion(product.version);
      } else {
        setSaved(true);
        allowLeave.current = true;
        navigate('/admin/products', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && isEdit) setConflict(true);
      else if (err instanceof ApiError && err.status === 401) fail(err);
      else {
        setFormError(err instanceof Error ? err.message : 'Could not save the product.');
        if (err instanceof ApiError && err.fields) setErrors(err.fields);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="skeleton" style={{ height: 40, width: 260 }} />
        <div className="skeleton" style={{ height: 320, marginTop: 24 }} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="admin-page">
        <div className="admin-card" role="alert">
          <p>{loadError}</p>
          <div className="row-gap">
            <button className="btn btn--sm" onClick={loadProduct}>
              Try again
            </button>
            <Link className="btn btn--ghost btn--sm" to="/admin/products">
              Back to products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const working = uploads.filter((u) => u.status === 'working').length;
  const coverId = orderedImages(form)[0]?.id;
  const sharedImages = form.images.filter((i) => !i.color);
  const soldOutCount = form.colors.filter((c) => c.soldOut).length;
  const unusedPresets = COLOR_PRESETS.filter((p) => !hasColor(p.name));

  return (
    <div className="admin-page admin-page--form">
      <header className="admin-page__head">
        <div>
          <Link to="/admin/products" className="back-link">
            <Icon name="arrow-left" size={16} /> Products
          </Link>
          <h1>{isEdit ? 'Edit product' : 'Add product'}</h1>
        </div>
        {isEdit && form.isActive && slug && (
          <a className="btn btn--ghost btn--sm" href={`/product/${slug}`} target="_blank" rel="noopener">
            <Icon name="external" size={16} /> See on shop
          </a>
        )}
      </header>

      {conflict && (
        <div className="notice notice--warn" role="alert">
          <Icon name="alert" size={20} />
          <div>
            <strong>This product was changed on another phone or tab.</strong> Your changes were not saved. Reload to see the latest, then
            make your changes again.
          </div>
          <button className="btn btn--sm" onClick={loadProduct}>
            Reload
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <form className="pform" onSubmit={save} noValidate>
        {/* ------------------------------------------------------ segment */}
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>
              <span className="step">1</span> Upper or Bottom?
            </h2>
          </div>
          <div className="segment-pick" role="group" aria-label="Segment">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`segment-pick__btn ${form.category === c.slug ? 'is-active' : ''}`}
                aria-pressed={form.category === c.slug}
                aria-invalid={!!errors.category && !form.category}
                onClick={() => pickSegment(c.slug)}
              >
                <strong>{c.label}</strong>
                <span>{c.blurb}</span>
              </button>
            ))}
          </div>
          {errors.category && <p className="error-text field-error">{errors.category}</p>}
        </section>

        {/* ------------------------------------------------------ details */}
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>
              <span className="step">2</span> Name & price
            </h2>
          </div>
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="name">Product name</label>
              <input
                id="name"
                className="input"
                value={form.name}
                maxLength={120}
                placeholder="e.g. Oversized Cotton T-shirt"
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="price">Price (₹)</label>
              <input
                id="price"
                className="input"
                inputMode="numeric"
                value={form.price}
                placeholder="499"
                onChange={(e) => /^\d{0,8}$/.test(e.target.value) && set('price', e.target.value)}
                aria-invalid={!!errors.price}
              />
              {errors.price && <p className="error-text">{errors.price}</p>}
            </div>
            <div className="field field--full">
              <label htmlFor="description">Details — optional</label>
              <textarea
                id="description"
                className="textarea"
                rows={3}
                value={form.description}
                maxLength={3000}
                placeholder="Fabric, fit, wash care…"
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- sizes */}
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>
              <span className="step">3</span> Sizes
            </h2>
            <span className="hint">Tap to select</span>
          </div>
          <div className="chip-row chip-row--big" role="group" aria-label="Sizes">
            {sortSizes([...new Set([...SIZE_OPTIONS, ...form.sizes])]).map((s) => (
              <button key={s} type="button" className={`chip ${form.sizes.includes(s) ? 'is-active' : ''}`} aria-pressed={form.sizes.includes(s)} onClick={() => toggleSize(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="inline-add">
            <input className="input" placeholder="Other size, e.g. 4XL" value={customSize} maxLength={12} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSize())} aria-label="Other size" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={addCustomSize}>
              Add size
            </button>
          </div>
          {errors.sizes && <p className="error-text field-error">{errors.sizes}</p>}
        </section>

        {/* ------------------------------------------------------ colours */}
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>
              <span className="step">4</span> Colours
            </h2>
            {form.colors.length > 0 && (
              <span className="hint">
                {form.colors.length} colours{soldOutCount ? ` · ${soldOutCount} sold out` : ''}
              </span>
            )}
          </div>

          {/* Quick ways to add many colours at once */}
          <div className="color-add">
            {!!sources?.length && (
              <label className="color-add__copy">
                <span className="field-label">Copy colours from another product</span>
                <select className="select" value="" onChange={(e) => e.target.value && copyColorsFrom(e.target.value)}>
                  <option value="">Choose product…</option>
                  {sources.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.colors.length} colours)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="row-gap">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPresetsOpen((o) => !o)} aria-expanded={presetsOpen}>
                <Icon name="plus" size={16} /> Pick from list
              </button>
            </div>
            {presetsOpen && (
              <div className="chip-row" role="group" aria-label="Colour list">
                {unusedPresets.length ? (
                  unusedPresets.map((c) => (
                    <button key={c.name} type="button" className="chip chip--color" onClick={() => addColors([c])}>
                      <span className="swatch-dot" style={{ background: c.hex }} />
                      {c.name}
                    </button>
                  ))
                ) : (
                  <p className="hint">All colours from the list are added.</p>
                )}
              </div>
            )}
            <div className="inline-add">
              <input type="color" className="color-input" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} aria-label="Colour shade" />
              <input className="input" placeholder="New colour name, e.g. Mustard" value={newColor.name} maxLength={30} onChange={(e) => setNewColor({ ...newColor, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNewColor())} aria-label="New colour name" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={addNewColor}>
                Add
              </button>
            </div>
          </div>

          {form.colors.length === 0 ? (
            <label className="switch-row">
              <span>
                <strong>{form.soldOut ? 'Sold out' : 'Available'}</strong>
                <span className="hint">One colour only? Skip colours and use this switch.</span>
              </span>
              <input type="checkbox" className="switch" checked={!form.soldOut} onChange={(e) => set('soldOut', !e.target.checked)} />
            </label>
          ) : (
            <>
              <div className="row-gap color-bulk">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAllColors(false)}>
                  All available
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAllColors(true)}>
                  All sold out
                </button>
              </div>
              <ul className="color-rows">
                {form.colors.map((c) => {
                  const imgs = form.images.filter((i) => i.color === c.name);
                  const ups = uploads.filter((u) => u.color === c.name);
                  return (
                    <li key={c.name} className={`color-row ${c.soldOut ? 'is-sold' : ''}`}>
                      <div className="color-row__top">
                        <label className="color-row__swatch" title="Change shade">
                          <span className="swatch-dot swatch-dot--lg" style={{ background: c.hex }} />
                          <input type="color" value={c.hex} onChange={(e) => setColor(c.name, { hex: e.target.value.toUpperCase() })} aria-label={`Shade of ${c.name}`} />
                        </label>
                        <strong className="color-row__name">{c.name}</strong>
                        <button
                          type="button"
                          className={`stock-toggle ${c.soldOut ? 'stock-toggle--sold' : ''}`}
                          aria-pressed={!c.soldOut}
                          onClick={() => setColor(c.name, { soldOut: !c.soldOut })}
                        >
                          {c.soldOut ? 'Sold out' : 'Available'}
                        </button>
                        <button type="button" className="icon-btn icon-btn--danger" onClick={() => askDeleteColor(c.name)} aria-label={`Remove ${c.name}`}>
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                      <div className="color-row__photos">
                        <PhotoStrip images={imgs} uploads={ups} coverId={coverId} onRemove={removeImage} onDismiss={dismissUpload} />
                        <button type="button" className="photo-add" onClick={() => pickPhotos(c.name)}>
                          <Icon name="upload" size={18} />
                          <span>{imgs.length ? 'More' : 'Add photo'}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* ------------------------------------------------ shared photos */}
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>
              <span className="step">5</span> {form.colors.length ? 'Photos for all colours' : 'Photos'}
            </h2>
            <span className="hint">
              {form.images.length}/{MAX_IMAGES}
            </span>
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            {form.colors.length
              ? 'Optional: size chart, back side, close-up. The first photo here is the cover on the shop.'
              : 'The first photo is the cover on the shop.'}
          </p>
          <div className="color-row__photos">
            <PhotoStrip
              images={sharedImages}
              uploads={uploads.filter((u) => !u.color)}
              coverId={coverId}
              onRemove={removeImage}
              onDismiss={dismissUpload}
            />
            <button type="button" className="photo-add" onClick={() => pickPhotos(null)}>
              <Icon name="upload" size={18} />
              <span>Add photo</span>
            </button>
          </div>
        </section>

        {/* --------------------------------------------------- visibility */}
        <section className="admin-card">
          <label className="switch-row">
            <span>
              <strong>Show on shop</strong>
              <span className="hint">Turn off to hide this product without deleting it.</span>
            </span>
            <input type="checkbox" className="switch" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          </label>
          <label className="switch-row">
            <span>
              <strong>New Arrival</strong>
              <span className="hint">Show in the slideshow at the top of the homepage and under “New Arrivals”.</span>
            </span>
            <input type="checkbox" className="switch" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
          </label>
        </section>

        <div className="form-bar">
          {formError && (
            <p className="form-alert" role="alert">
              <Icon name="alert" size={18} /> {formError}
            </p>
          )}
          <div className="form-bar__actions">
            <Link to="/admin/products" className="btn btn--ghost">
              Cancel
            </Link>
            <button className="btn" disabled={saving || working > 0}>
              {saving && <span className="spinner" />}
              {working > 0 ? `Uploading ${working} photo${working > 1 ? 's' : ''}…` : saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={!!removeColor}
        title={`Remove ${removeColor}?`}
        message="The photos added for this colour will also be removed from this product."
        confirmLabel="Remove colour"
        danger
        onConfirm={() => removeColor && deleteColor(removeColor)}
        onClose={() => setRemoveColor(null)}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        message="Your changes are not saved yet. If you leave now they will be lost."
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}
