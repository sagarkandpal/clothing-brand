import { useEffect, useState, type FormEvent } from 'react';
import type { PublicSettings } from '../../shared/types';
import { normalizeWhatsAppNumber, whatsappLink } from '../../shared/whatsapp';
import { WhatsAppIcon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { invalidateApiCache } from '../lib/useApi';
import { useAdmin } from './AdminApp';
import { useToast } from './ui';

interface Form {
  storeName: string;
  tagline: string;
  whatsappNumber: string;
  instagramHandle: string;
  announcements: string;
  heroHeadline: string;
  heroSubline: string;
  heroImageId: string | null;
  brandStatement: string;
  aboutHeadline: string;
  aboutText: string;
  aboutImageId: string | null;
}

function toForm(s: PublicSettings): Form {
  return {
    storeName: s.storeName,
    tagline: s.tagline,
    whatsappNumber: s.whatsappNumber ? '+' + s.whatsappNumber : '',
    instagramHandle: s.instagramHandle ?? '',
    // One offer line in the admin; saving replaces any older extra messages.
    announcements: s.announcements[0] ?? '',
    heroHeadline: s.heroHeadline,
    heroSubline: s.heroSubline,
    heroImageId: s.heroImageId,
    brandStatement: s.brandStatement,
    aboutHeadline: s.aboutHeadline,
    aboutText: s.aboutText,
    aboutImageId: s.aboutImageId,
  };
}

export default function Settings() {
  const { fail } = useAdmin();
  const toast = useToast();
  const store = useStore();
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api<PublicSettings>('/admin/settings')
      .then((s) => {
        const f = toForm(s);
        setForm(f);
        setInitial(JSON.stringify(f));
      })
      .catch((err) => {
        setError(err.message);
        fail(err, 'Could not load settings.');
      });
  };
  useEffect(load, []);

  if (!form) {
    return (
      <div className="admin-page">
        {error ? (
          <div className="admin-card" role="alert">
            <p>{error}</p>
            <button className="btn btn--sm" onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <div className="skeleton" style={{ height: 400 }} />
        )}
      </div>
    );
  }

  const set = (k: keyof Form, v: string | null) => {
    setForm({ ...form, [k]: v });
    if (errors[k]) setErrors({ ...errors, [k]: '' });
  };

  const waNormalized = normalizeWhatsAppNumber(form.whatsappNumber);
  const waTest = whatsappLink(waNormalized, 'Test message from my store settings.');
  const dirty = JSON.stringify(form) !== initial;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.whatsappNumber.trim() && !waNormalized) errs.whatsappNumber = 'This does not look like a valid mobile number.';
    if (form.storeName.trim().length < 2) errs.storeName = 'Enter your shop name.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await api<PublicSettings>('/admin/settings', {
        method: 'PUT',
        json: {
          ...form,
          announcements: form.announcements
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 5),
        },
      });
      const f = toForm(saved);
      setForm(f);
      setInitial(JSON.stringify(f));
      invalidateApiCache();
      store.reload();
      toast('Settings saved — your store is updated.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      fail(err, 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page admin-page--form">
      <header className="admin-page__head">
        <div>
          <p className="eyebrow">Store</p>
          <h1>Settings</h1>
        </div>
      </header>

      {/* Only the basics a shop owner needs; other store texts keep their saved values. */}
      <form className="pform" onSubmit={save} noValidate>
        <section className="admin-card">
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="storeName">Shop name</label>
              <input id="storeName" className="input" maxLength={40} value={form.storeName} onChange={(e) => set('storeName', e.target.value)} aria-invalid={!!errors.storeName} />
              {errors.storeName && <p className="error-text">{errors.storeName}</p>}
            </div>
            <div className="field field--full">
              <label htmlFor="wa">WhatsApp number</label>
              <input
                id="wa"
                className="input"
                inputMode="tel"
                placeholder="e.g. 98XXX XXXXX"
                value={form.whatsappNumber}
                onChange={(e) => set('whatsappNumber', e.target.value)}
                aria-invalid={!!errors.whatsappNumber}
              />
              {errors.whatsappNumber ? (
                <p className="error-text">{errors.whatsappNumber}</p>
              ) : waNormalized ? (
                <p className="hint">
                  Customers will message you here.{' '}
                  <a href={waTest!} target="_blank" rel="noopener noreferrer" className="inline-link">
                    <WhatsAppIcon size={13} /> Send a test
                  </a>
                </p>
              ) : (
                <p className="hint">Customers order on this number.</p>
              )}
            </div>
            <div className="field field--full">
              <label htmlFor="ig">Instagram — optional</label>
              <input id="ig" className="input" placeholder="e.g. yourshop" value={form.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} aria-invalid={!!errors.instagramHandle} />
              {errors.instagramHandle && <p className="error-text">{errors.instagramHandle}</p>}
            </div>
            <div className="field field--full">
              <label htmlFor="ann">Offer line at the top — optional</label>
              <input id="ann" className="input" maxLength={120} placeholder="e.g. Free delivery above ₹999" value={form.announcements} onChange={(e) => set('announcements', e.target.value)} />
            </div>
          </div>
        </section>

        <div className="form-bar">
          <div className="form-bar__actions">
            <button className="btn" disabled={saving || !dirty}>
              {saving && <span className="spinner" />} {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
