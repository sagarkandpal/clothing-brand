import { useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryLabel } from '../../shared/catalog';
import type { ProductCard as Card } from '../../shared/types';
import { productEnquiryMessage, whatsappLink } from '../../shared/whatsapp';
import { useStore } from '../lib/store';
import { Icon, WhatsAppIcon } from './Icon';
import { ProductImage } from './ProductImage';
import { Price } from './Price';

/** How many colour dots fit on a card before "+N" (which opens the product). */
const CARD_COLORS = 7;
/** Size chips shown on a card before "+N". */
const CARD_SIZES = 5;

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const { settings } = useStore();
  // Tapping a colour dot shows that colour's photo; opening the card keeps the colour.
  const [color, setColor] = useState<string | null>(null);
  const [primary, alt] = product.images;
  const colorImage = color ? product.colorImages?.[color] : undefined;
  const href = `/product/${product.slug}${color ? `?color=${encodeURIComponent(color)}` : ''}`;
  const sizes = '(min-width: 1200px) 22vw, (min-width: 700px) 30vw, 48vw';
  const wa = product.inStock
    ? whatsappLink(
        settings.whatsappNumber,
        productEnquiryMessage({ name: product.name, price: product.price, color, url: `${window.location.origin}${href}` }),
      )
    : null;
  const shownSizes = product.sizes.slice(0, CARD_SIZES);
  return (
    <article className={`pcard ${product.inStock ? '' : 'pcard--sold'}`}>
      <Link to={href} className="pcard__media" aria-label={product.name}>
        <ProductImage key={colorImage?.id ?? 'main'} image={colorImage ?? primary} alt={product.name} ratio="4 / 5" priority={priority} sizes={sizes} />
        {alt && !colorImage && <ProductImage image={alt} alt="" ratio="4 / 5" className="pcard__alt" sizes={sizes} />}
        <span className="pcard__badges">
          {!product.inStock ? (
            <span className="badge badge--sold">Sold out</span>
          ) : product.isFeatured ? (
            <span className="badge">New</span>
          ) : null}
        </span>
      </Link>
      <div className="pcard__body">
        <span className="eyebrow pcard__cat">{categoryLabel(product.category)}</span>
        <h3 className="pcard__name">
          <Link to={href}>{product.name}</Link>
        </h3>
        <Price price={product.price} originalPrice={product.originalPrice} />
        {product.colors.length > 0 && (
          <div className="pcard__colors" role="group" aria-label="Colours">
            {product.colors.slice(0, CARD_COLORS).map((c) => (
              <button
                key={c.name}
                type="button"
                className={`pcard__color ${color === c.name ? 'is-active' : ''} ${c.soldOut ? 'is-sold' : ''}`}
                style={{ background: c.hex }}
                title={c.soldOut ? `${c.name} (sold out)` : c.name}
                aria-label={c.soldOut ? `${c.name}, sold out` : c.name}
                aria-pressed={color === c.name}
                onClick={() => setColor(color === c.name ? null : c.name)}
              />
            ))}
            {product.colors.length > CARD_COLORS && (
              <Link to={href} className="swatches__more">
                +{product.colors.length - CARD_COLORS}
              </Link>
            )}
          </div>
        )}
        {shownSizes.length > 0 && (
          <ul className="pcard__sizes" aria-label="Sizes">
            {shownSizes.map((sz) => (
              <li key={sz}>{sz}</li>
            ))}
            {product.sizes.length > CARD_SIZES && <li>+{product.sizes.length - CARD_SIZES}</li>}
          </ul>
        )}
        <div className="pcard__foot">
          <Link to={href} className="pcard__more" tabIndex={-1}>
            View details <Icon name="arrow" size={14} />
          </Link>
          {wa && (
            <a className="pcard__wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Order ${product.name} on WhatsApp`}>
              <WhatsAppIcon size={20} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="pcard pcard--skeleton" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '4 / 5' }} />
      <div className="pcard__body">
        <div className="skeleton" style={{ height: 10, width: '40%' }} />
        <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 10 }} />
        <div className="skeleton" style={{ height: 14, width: '30%', marginTop: 10 }} />
      </div>
    </div>
  );
}

export function ProductGrid({
  products,
  loading,
  skeletons = 8,
  priorityCount = 0,
  className = '',
}: {
  products: Card[] | undefined | null;
  loading?: boolean;
  skeletons?: number;
  priorityCount?: number;
  className?: string;
}) {
  return (
    <div className={`pgrid ${className}`}>
      {products?.map((p, i) => <ProductCard key={p._id} product={p} priority={i < priorityCount} />)}
      {loading && Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={'s' + i} />)}
    </div>
  );
}
