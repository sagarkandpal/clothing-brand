import { formatINR } from '../../shared/whatsapp';

/** Shows the original price only when a genuine, higher original price is set. */
export function Price({ price, originalPrice, size = 'md' }: { price: number; originalPrice?: number | null; size?: 'md' | 'lg' }) {
  const hasOriginal = !!originalPrice && originalPrice > price;
  const off = hasOriginal ? Math.round(((originalPrice! - price) / originalPrice!) * 100) : 0;
  return (
    <p className={`price price--${size}`}>
      <span className="price__now">
        <span className="sr-only">{hasOriginal ? 'Sale price ' : 'Price '}</span>
        {formatINR(price)}
      </span>
      {hasOriginal && (
        <>
          <s className="price__was">
            <span className="sr-only">Original price </span>
            {formatINR(originalPrice!)}
          </s>
          {off >= 5 && <span className="price__off">{off}% off</span>}
        </>
      )}
    </p>
  );
}
