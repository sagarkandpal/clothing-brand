import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../../shared/catalog';
import { whatsappLink } from '../../shared/whatsapp';
import { useStore } from '../lib/store';
import { Icon, WhatsAppIcon } from './Icon';
import { Wordmark } from './Wordmark';

// Only two public pages in the menu: all products (home) and About.
const NAV = [
  { to: '/', label: 'Shop' },
  { to: '/about', label: 'About' },
];

export function AnnouncementBar() {
  const { settings } = useStore();
  const items = settings.announcements.filter(Boolean);
  if (!items.length) return null;
  // Repeat enough copies to fill wide screens; the track scrolls by half its width.
  const loop = Array.from({ length: Math.max(2, Math.ceil(8 / items.length)) }, () => items).flat();
  return (
    <div className="announce" role="region" aria-label="Announcements">
      <p className="sr-only">{items.join('. ')}</p>
      <div className="announce__track" aria-hidden="true">
        {[0, 1].map((half) => (
          <div className="announce__half" key={half}>
            {loop.map((msg, i) => (
              <span key={i} className="announce__item">
                {msg}
                <span className="announce__sep">/</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/shop?q=${encodeURIComponent(term)}` : '/shop');
    onClose();
  };

  return (
    <div className={`search-panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <form className="container search-panel__form" role="search" onSubmit={submit}>
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        <Icon name="search" size={22} />
        <input
          ref={inputRef}
          id="site-search"
          type="search"
          placeholder="Search tees, hoodies, cargos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          tabIndex={open ? 0 : -1}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search" tabIndex={open ? 0 : -1}>
          <Icon name="close" />
        </button>
      </form>
    </div>
  );
}

export function Header() {
  const { settings } = useStore();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const wa = whatsappLink(settings.whatsappNumber, 'Hi! I have a question about your collection.');

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className={`header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container header__bar">
        <button
          className="icon-btn header__menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <Icon name="menu" size={22} />
        </button>

        <Link to="/" className="header__logo" aria-label={`${settings.storeName} home`}>
          <Wordmark />
        </Link>

        <nav className="header__nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="header__link">
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          <button className="icon-btn" onClick={() => setSearchOpen((o) => !o)} aria-label="Search" aria-expanded={searchOpen}>
            <Icon name="search" size={21} />
          </button>
          {wa ? (
            <a className="header__wa" href={wa} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon size={18} />
              <span className="header__wa-short">WhatsApp</span>
              <span className="header__wa-long">Order via WhatsApp</span>
            </a>
          ) : null}
        </div>
      </div>

      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className={`drawer-scrim ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside id="mobile-menu" className={`drawer ${menuOpen ? 'is-open' : ''}`} aria-label="Menu" aria-hidden={!menuOpen}>
        <div className="drawer__head">
          <Wordmark size="sm" />
          <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        <nav className="drawer__nav" aria-label="Mobile">
          {NAV.map((n, i) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="drawer__link" style={{ ['--i' as string]: i }}>
              <span>{n.label}</span>
              <Icon name="arrow" size={18} />
            </NavLink>
          ))}
        </nav>
        <div className="drawer__cats">
          <p className="eyebrow">All categories</p>
          <ul>
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link to={`/shop/${c.slug}`}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        {wa && (
          <a className="btn btn--whatsapp btn--block" href={wa} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={18} /> Chat on WhatsApp
          </a>
        )}
      </aside>
    </header>
  );
}

export function Footer() {
  const { settings } = useStore();
  const wa = whatsappLink(settings.whatsappNumber, 'Hi! I have a question about your collection.');
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <Wordmark size="lg" tone="light" />
            {settings.tagline && <p className="footer__tagline">{settings.tagline}</p>}
          </div>
          <div className="footer__cols">
            <div>
              <p className="footer__title">Shop</p>
              <ul>
                <li><Link to="/">All products</Link></li>
                <li><Link to="/shop?inStock=1">In stock now</Link></li>
                <li><Link to="/about">About us</Link></li>
              </ul>
            </div>
            <div>
              <p className="footer__title">Categories</p>
              <ul>
                {CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <Link to={`/shop/${c.slug}`}>{c.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="footer__title">Contact</p>
              <ul>
                {wa ? (
                  <li>
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="footer__icon-link">
                      <WhatsAppIcon size={16} /> WhatsApp us
                    </a>
                  </li>
                ) : (
                  <li className="footer__muted">WhatsApp contact coming soon</li>
                )}
                {settings.instagramHandle && (
                  <li>
                    <a
                      href={`https://instagram.com/${settings.instagramHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer__icon-link"
                    >
                      <Icon name="instagram" size={16} /> @{settings.instagramHandle}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <div className="footer__giant display" aria-hidden="true">
          {settings.storeName}
        </div>
        <div className="footer__bottom">
          <p>
            © {year} {settings.storeName}. All rights reserved.
          </p>
          <p>Prices in INR. Orders are confirmed on WhatsApp.</p>
        </div>
      </div>
    </footer>
  );
}

export function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main" className="page-enter" key={pathname}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
