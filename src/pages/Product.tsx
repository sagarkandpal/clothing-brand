import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { categoryLabel } from '../../shared/catalog';
import type { Product as P, ProductCard, ProductImage as Img } from '../../shared/types';
import { formatINR, productEnquiryMessage, whatsappLink } from '../../shared/whatsapp';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { Price } from '../components/Price';
import { ProductGrid } from '../components/ProductCard';
import { ProductImage } from '../components/ProductImage';
import { ErrorState } from '../components/States';
import { usePageTitle, useStore } from '../lib/store';
import { useApi } from '../lib/useApi';
import NotFound from './NotFound';

function Gallery({ images, name, colorKey }: { images: Img[]; name: string; colorKey: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    track.current?.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
  }, [colorKey]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    setIndex(clamped);
  };

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  if (!images.length) {
    return (
      <div className="gallery">
        <div className="gallery__main">
          <ProductImage image={null} alt={name} ratio="4 / 5" />
        </div>
      </div>
    );
  }

  return (
    <div className="gallery" key={colorKey}>
      {images.length > 1 && (
        <div className="gallery__thumbs" role="tablist" aria-label="Product images">
          {images.map((img, i) => (
            <button
              key={img.id}
              role="tab"
              aria-selected={i === index}
              aria-label={`Image ${i + 1} of ${images.length}`}
              className={`gallery__thumb ${i === index ? 'is-active' : ''}`}
              onClick={() => go(i)}
            >
              <ProductImage image={img} alt="" ratio="4 / 5" thumbOnly />
            </button>
          ))}
        </div>
      )}
      <div className="gallery__main">
        <div
          className="gallery__track"
          ref={track}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={`${name} images`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(index + 1);
            if (e.key === 'ArrowLeft') go(index - 1);
          }}
        >
          {images.map((img, i) => (
            <div className="gallery__slide" key={img.id}>
              <ProductImage
                image={img}
                alt={`${name}${img.color ? ` in ${img.color}` : ''} — image ${i + 1}`}
                ratio="4 / 5"
                priority={i === 0}
                sizes="(min-width: 900px) 50vw, 100vw"
              />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button className="gallery__arrow gallery__arrow--prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">
              <Icon name="chevron-left" />
            </button>
            <button className="gallery__arrow gallery__arrow--next" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label="Next image">
              <Icon name="chevron" />
            </button>
            <div className="gallery__dots" aria-hidden="true">
              {images.map((img, i) => (
                <span key={img.id} className={i === index ? 'is-active' : ''} />
              ))}
            </div>
            <p className="gallery__count mono" aria-hidden="true">
              {String(index + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
            </p>
          </>
        )}
        {images.some((img) => img.kind === 'mockup') && (
          <p className="gallery__kind mono">{images[index]?.kind === 'mockup' ? 'Mockup' : 'Actual product photo'}</p>
        )}
      </div>
    </div>
  );
}

function ProductView({ product, related }: { product: P; related: ProductCard[] }) {
  const { settings } = useStore();
  usePageTitle(product.name);

  const hasColors = product.colors.length > 0;
  const stockOf = (size: string, color: string | null) =>
    product.variants.find((v) => v.size === size && v.color === color)?.stock ?? 0;
  const colorHasStock = (c: string) => product.variants.some((v) => v.color === c && v.stock > 0);

  // A colour picked on the shop card arrives as ?color=…; otherwise start on the first available one.
  const [params] = useSearchParams();
  const [color, setColor] = useState<string | null>(() => {
    if (!hasColors) return null;
    const asked = product.colors.find((c) => c.name === params.get('color'));
    return (asked ?? product.colors.find((c) => colorHasStock(c.name)) ?? product.colors[0]).name;
  });
  const availableSizes = product.sizes.filter((s) => stockOf(s, color) > 0);
  const [size, setSize] = useState<string | null>(() => (availableSizes.length === 1 ? availableSizes[0] : null));
  const [sizePrompt, setSizePrompt] = useState(false);

  // Drop a selected size that isn't available in the newly chosen colour.
  useEffect(() => {
    if (size && stockOf(size, color) <= 0) setSize(null);
  }, [color]);

  const images = useMemo(() => {
    if (!color) return product.images;
    const own = product.images.filter((i) => i.color === color);
    const shared = product.images.filter((i) => !i.color);
    const list = [...own, ...shared];
    return list.length ? list : product.images;
  }, [product.images, color]);

  const selectedStock = size ? stockOf(size, color) : null;
  const colorStock = product.variants.filter((v) => v.color === color).reduce((s, v) => s + v.stock, 0);
  const soldOut = !product.inStock;
  const colorSoldOut = !soldOut && colorStock === 0;

  const productUrl = `${window.location.origin}/product/${product.slug}`;
  const message = productEnquiryMessage({ name: product.name, price: product.price, size, color, url: productUrl });
  const waHref = whatsappLink(settings.whatsappNumber, message);
  const needsSize = !soldOut && !colorSoldOut && !size && availableSizes.length > 0;

  const onEnquire = (e: MouseEvent) => {
    if (needsSize) {
      e.preventDefault();
      setSizePrompt(true);
      document.getElementById('size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  let status: { tone: string; text: string };
  if (soldOut) status = { tone: 'sold', text: 'Out of stock' };
  else if (colorSoldOut) status = { tone: 'sold', text: `${color} is out of stock` };
  else if (selectedStock !== null) status = { tone: 'ok', text: `In stock in ${size}` };
  else status = { tone: 'ok', text: 'In stock' };

  const ctaLabel = soldOut || colorSoldOut ? 'Ask about restock' : 'Order via WhatsApp';

  const enquiryButton = (cls = '') =>
    waHref ? (
      <a className={`btn btn--whatsapp btn--block ${cls}`} href={waHref} target="_blank" rel="noopener noreferrer" onClick={onEnquire}>
        <WhatsAppIcon size={19} /> {ctaLabel}
      </a>
    ) : (
      <button className={`btn btn--block ${cls}`} disabled aria-describedby="wa-missing">
        <WhatsAppIcon size={19} /> WhatsApp ordering unavailable
      </button>
    );

  return (
    <>
      <div className="container pdp">
        <nav className="crumbs pdp__crumbs" aria-label="Breadcrumb">
          <Link to="/">All products</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/shop/${product.category}`}>{categoryLabel(product.category)}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className="pdp__grid">
          <Gallery images={images} name={product.name} colorKey={color ?? 'all'} />

          <div className="pdp__info">
            <div className="pdp__sticky">
              <p className="eyebrow">{categoryLabel(product.category)}</p>
              <h1 className="pdp__title display">{product.name}</h1>
              <Price price={product.price} originalPrice={product.originalPrice} size="lg" />

              <p className={`stock stock--${status.tone}`} role="status">
                <span className="stock__dot" />
                {status.text}
              </p>

              {hasColors && (
                <fieldset className="opt">
                  <legend className="opt__label">
                    Colour <span className="opt__value">{color}</span>
                  </legend>
                  <div className="opt__swatches">
                    {product.colors.map((c) => {
                      const available = colorHasStock(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          className={`swatch ${color === c.name ? 'is-active' : ''} ${available ? '' : 'is-unavailable'}`}
                          aria-pressed={color === c.name}
                          aria-label={`${c.name}${available ? '' : ' (out of stock)'}`}
                          title={c.name}
                          onClick={() => setColor(c.name)}
                        >
                          <span style={{ background: c.hex }} />
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <fieldset className={`opt ${sizePrompt && needsSize ? 'opt--prompt' : ''}`} id="size-picker">
                <legend className="opt__label">
                  Size {size && <span className="opt__value">{size}</span>}
                </legend>
                <div className="opt__sizes">
                  {product.sizes.map((s) => {
                    const ok = stockOf(s, color) > 0;
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`size ${size === s ? 'is-active' : ''}`}
                        disabled={!ok}
                        aria-pressed={size === s}
                        aria-label={ok ? `Size ${s}` : `Size ${s}, unavailable`}
                        onClick={() => {
                          setSize(s);
                          setSizePrompt(false);
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                {sizePrompt && needsSize && (
                  <p className="opt__error" role="alert">
                    Please select a size first.
                  </p>
                )}
              </fieldset>

              <div className="pdp__cta">
                {enquiryButton()}
                {waHref ? (
                  <p className="pdp__note">
                    Opens WhatsApp with this product{size ? `, size ${size}` : ''}
                    {color ? ` and colour ${color}` : ''} filled in. Your order is confirmed once we reply.
                  </p>
                ) : (
                  <p className="pdp__note" id="wa-missing">
                    Online enquiries are not set up yet. Please check back soon.
                  </p>
                )}
              </div>

              {product.description && (
                <div className="pdp__desc">
                  <h2 className="opt__label">Details</h2>
                  {product.description.split(/\n{2,}/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              )}

              <dl className="pdp__specs">
                <div>
                  <dt>Category</dt>
                  <dd>
                    <Link to={`/shop/${product.category}`}>{categoryLabel(product.category)}</Link>
                  </dd>
                </div>
                <div>
                  <dt>Sizes</dt>
                  <dd>{product.sizes.join(', ')}</dd>
                </div>
                {hasColors && (
                  <div>
                    <dt>Colours</dt>
                    <dd>{product.colors.map((c) => c.name).join(', ')}</dd>
                  </div>
                )}
                <div>
                  <dt>Price</dt>
                  <dd>{formatINR(product.price)} (INR)</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section related" aria-labelledby="related-title">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">Keep looking</span>
                <h2 id="related-title" className="display">You may also like</h2>
              </div>
              <Link to={`/shop/${product.category}`} className="text-link">
                More {categoryLabel(product.category)} <Icon name="arrow" size={16} />
              </Link>
            </div>
            <ProductGrid products={related.slice(0, 4)} className="pgrid--home" />
          </div>
        </section>
      )}

      {waHref && (
      <div className="pdp-bar">
        <div className="pdp-bar__info">
          <span className="pdp-bar__name">{product.name}</span>
          <span className="mono">
            {formatINR(product.price)}
            {size ? ` · ${size}` : ''}
          </span>
        </div>
        {enquiryButton('btn--sm')}
      </div>
      )}
    </>
  );
}

export default function Product() {
  const { slug = '' } = useParams();
  const { data, error, loading, reload } = useApi<{ product: P; related: ProductCard[] }>(`/products/${encodeURIComponent(slug)}`);

  if (error?.status === 404) return <NotFound what="product" />;
  if (error) {
    return (
      <div className="container pdp">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="container pdp" aria-busy="true">
        <div className="pdp__grid">
          <div className="skeleton" style={{ aspectRatio: '4 / 5' }} />
          <div className="pdp__info">
            <div className="skeleton" style={{ height: 12, width: 100 }} />
            <div className="skeleton" style={{ height: 48, width: '80%', marginTop: 16 }} />
            <div className="skeleton" style={{ height: 24, width: 120, marginTop: 16 }} />
            <div className="skeleton" style={{ height: 52, width: '100%', marginTop: 40 }} />
          </div>
        </div>
      </div>
    );
  }
  return <ProductView key={data.product._id} product={data.product} related={data.related} />;
}
