import { useState } from 'react';
import { imageUrl } from '../lib/api';
import type { ProductImage as Img } from '../../shared/types';

interface Props {
  image: Img | null | undefined;
  alt: string;
  /** CSS `sizes` hint so phones download the thumbnail, desktops the large file. */
  sizes?: string;
  ratio?: string;
  priority?: boolean;
  className?: string;
  /** Use only the thumbnail file (small UI such as admin rows). */
  thumbOnly?: boolean;
}

/**
 * Fixed-ratio frame (no layout shift) with a responsive srcset, lazy loading,
 * a fade-in once decoded, and a neutral fallback when an image is missing.
 */
export function ProductImage({ image, alt, sizes = '(min-width: 900px) 25vw, 50vw', ratio, priority, className = '', thumbOnly }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const style = ratio ? { aspectRatio: ratio } : undefined;

  if (!image || failed) {
    return (
      <div className={`pimg pimg--empty ${className}`} style={style} role="img" aria-label={`${alt} — image unavailable`}>
        <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
          <path d="M17 9l7 4 7-4 9 5-3 8-5-2v19H15V20l-5 2-3-8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  const sm = imageUrl(image.id, 'sm');
  const lg = imageUrl(image.id, 'lg');
  return (
    <div className={`pimg ${image.cutout ? 'pimg--cutout' : ''} ${loaded ? 'is-loaded' : ''} ${className}`} style={style}>
      <img
        src={thumbOnly ? sm : lg}
        srcSet={thumbOnly ? undefined : `${sm} 480w, ${lg} 1200w`}
        sizes={thumbOnly ? undefined : sizes}
        alt={alt}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        // @ts-expect-error -- valid HTML attribute, not yet in React's types
        fetchpriority={priority ? 'high' : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
