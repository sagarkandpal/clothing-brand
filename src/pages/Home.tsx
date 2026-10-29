import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../shared/brand';
import { categoryLabel } from '../../shared/catalog';
import type { CategorySummary, ProductCard, ProductListResponse } from '../../shared/types';
import { formatINR, whatsappLink } from '../../shared/whatsapp';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { ProductImage } from '../components/ProductImage';
import { usePageTitle, useStore } from '../lib/store';
import { useApi } from '../lib/useApi';
import Shop from './Shop';

const HERO_INTERVAL = 6000;

/** Splits the headline into two display lines ("Built for" / "the street."). */
function splitHeadline(text: string): [string, string] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text, ''];
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

function Hero({ products }: { products: ProductCard[] }) {
  const { settings } = useStore();
  const [index, setIndex] = useState(0);
  const slides = settings.heroImageId ? [] : products.filter((p) => p.images.length).slice(0, 4);
  const current = slides[index % Math.max(1, slides.length)];
  const [lineA, lineB] = splitHeadline(settings.heroHeadline);

  // Rotate through featured products; a fixed hero photo from Settings disables rotation.
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), HERO_INTERVAL);
    return () => clearTimeout(t);
  }, [index, slides.length]);

  const ghost = current ? categoryLabel(current.category).split(/[\s-]/)[0] : settings.storeName;

  return (
    <section className="hero" aria-label="Featured">
      <div className="hero__band" aria-hidden="true" />
      <p className="hero__ghost" aria-hidden="true">
        {ghost}
      </p>
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="hero__eyebrow mono">
            {BRAND.heroEyebrow.split('·').map((part) => (
              <span key={part}>{part.trim()}</span>
            ))}
          </p>
          <h1 className="hero__title display">
            <span className="hero__line hero__line--a">{lineA}</span>
            {lineB && <span className="hero__line hero__line--b">{lineB}</span>}
          </h1>
          {settings.heroSubline && <p className="hero__sub">{settings.heroSubline}</p>}
          <div className="hero__ctas">
            <a href="#all-products" className="btn">
              Shop collection <Icon name="arrow" size={16} />
            </a>
          </div>
          {slides.length > 1 && (
            <div className="hero__dots" aria-hidden="true">
              {slides.map((p, i) => (
                <span
                  key={p._id + (i === index ? '-on' : '')}
                  className={i === index ? 'is-active' : ''}
                  style={i === index ? ({ '--dur': `${HERO_INTERVAL}ms` } as CSSProperties) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="hero__stage">
          {settings.heroImageId ? (
            <div className="hero__product hero__product--photo">
              <ProductImage
                image={{ id: settings.heroImageId, width: 1200, height: 1500, color: null }}
                alt={settings.storeName}
                ratio="4 / 5"
                priority
                sizes="(min-width: 900px) 40vw, 80vw"
              />
            </div>
          ) : current ? (
            <>
              <Link
                key={current._id}
                to={`/product/${current.slug}`}
                className={`hero__product ${current.images[0].cutout ? 'hero__product--cutout' : 'hero__product--photo'}`}
                aria-label={current.name}
              >
                <ProductImage image={current.images[0]} alt={current.name} priority sizes="(min-width: 900px) 40vw, 80vw" />
              </Link>
              <Link to={`/product/${current.slug}`} className="hero__caption" key={current._id + '-c'}>
                <span className="mono">{categoryLabel(current.category)}</span>
                <strong>{current.name}</strong>
                <span className="hero__price">{formatINR(current.price)}</span>
              </Link>
            </>
          ) : (
            <div className="hero__product hero__product--photo">
              <ProductImage image={null} alt={settings.storeName} ratio="4 / 5" />
            </div>
          )}
        </div>

        {slides.length > 1 && (
          <div className="hero__thumbs" role="tablist" aria-label="Featured products">
            {slides.map((p, i) => (
              <button
                key={p._id}
                role="tab"
                aria-selected={i === index}
                aria-label={p.name}
                className={`hero__thumb ${i === index ? 'is-active' : ''}`}
                onClick={() => setIndex(i)}
              >
                <ProductImage image={p.images[0]} alt="" ratio="4 / 5" thumbOnly />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Statement({ cats }: { cats: CategorySummary[] }) {
  const { settings } = useStore();
  if (!settings.brandStatement) return null;
  const words = (cats.length ? cats : []).map((c) => c.label);
  const loop = [...words, ...words];
  return (
    <section className="statement" aria-label="About the store">
      <div className="container">
        <p className="eyebrow statement__eyebrow">The idea</p>
        <p className="statement__text">{settings.brandStatement}</p>
      </div>
      {words.length > 0 && (
        <div className="statement__marquee" aria-hidden="true">
          <div className="statement__track">
            {loop.map((w, i) => (
              <span key={i}>
                <span className="display">{w}</span>
                <em className="display">/</em>{' '}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Homepage: hero and brand statement, followed by every product with filters,
 * then a closing CTA.
 */
export default function Home() {
  const { settings } = useStore();
  usePageTitle(null);
  const cats = useApi<CategorySummary[]>('/categories');
  // Products marked "New Arrival" in the admin (the server falls back to the newest ones).
  const newArrivals = useApi<ProductListResponse>('/products?category=new-arrivals&limit=4&facets=0');
  const heroProducts = newArrivals.data?.items;
  const wa = whatsappLink(settings.whatsappNumber, 'Hi! I have a question about your collection.');

  return (
    <>
      <Hero products={heroProducts ?? []} />
      <Statement cats={cats.data ?? []} />

      {/* Every product, with the same filters and cards as the shop page. */}
      <div id="all-products" className="home-all">
        <Shop embedded />
      </div>

      <section className="section final-cta">
        <div className="container final-cta__inner">
          <h2 className="display">Find your next fit.</h2>
          <p>Browse the full collection — new pieces are added regularly.</p>
          <div className="final-cta__actions">
            <a href="#all-products" className="btn">
              Browse collection
            </a>
            {wa && (
              <a className="btn btn--whatsapp" href={wa} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon size={18} /> WhatsApp us
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
