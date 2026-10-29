import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useAdmin } from './AdminApp';

interface Meter {
  label: string;
  usedBytes: number;
  limitBytes: number;
  percent: number;
  approx: boolean;
}

interface Usage {
  plan: string;
  meters: Meter[];
  products: number;
  productsLeftApprox: number | null;
  worstPercent: number;
  warnPercent: number;
  dangerPercent: number;
  netlifyUsageUrl: string;
  developerWhatsapp: string | null;
}

/** Green below warnPercent, yellow up to dangerPercent, red above. */
function tone(pct: number, u: Usage) {
  return pct >= u.dangerPercent ? 'red' : pct >= u.warnPercent ? 'yellow' : 'green';
}

/** How much room is left for products, as one bar, with cleanup help when it gets full. */
export function UsageCard() {
  const { fail } = useAdmin();
  const [u, setU] = useState<Usage | null>(null);

  useEffect(() => {
    api<Usage>('/admin/usage')
      .then(setU)
      .catch((err) => fail(err, 'Could not load storage usage.'));
  }, []);

  if (!u) {
    return (
      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Space for products</h2>
        </div>
        <div className="skeleton" style={{ height: 80 }} />
      </section>
    );
  }

  const full = u.worstPercent >= 100;
  const devLink = u.developerWhatsapp
    ? `https://wa.me/${u.developerWhatsapp}?text=${encodeURIComponent('Storage is full, upgrade needed.')}`
    : null;

  // One simple bar for the vendor: whichever limit (photos or products) is closest to full.
  const pct = Math.round(u.worstPercent);

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>Space for products</h2>
      </div>

      <div className="usage">
        <div className="usage__row">
          <span>{u.products} products added</span>
          <strong>{pct}% full</strong>
        </div>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Space used">
          <span style={{ width: `${u.worstPercent}%` }} className={`meter--${tone(u.worstPercent, u)}`} />
        </div>
        {u.productsLeftApprox !== null && !full && (
          <p className="hint">You can add about {u.productsLeftApprox} more products.</p>
        )}
      </div>

      {u.worstPercent >= u.warnPercent && (
        <div className={`notice ${u.worstPercent >= u.dangerPercent ? 'notice--warn' : ''}`}>
          <Icon name="alert" size={20} />
          <div>
            <strong>{full ? 'Storage is full.' : 'Storage is getting full.'}</strong> Free up space:
            <ul className="usage__tips">
              <li>
                <Link to="/admin/products">Delete old products</Link> you will not sell again
              </li>
              <li>Remove extra photos (keep 1 photo per colour)</li>
            </ul>
          </div>
        </div>
      )}

      {full && devLink && (
        <a className="btn btn--whatsapp btn--block" href={devLink} target="_blank" rel="noopener noreferrer">
          Contact developer
        </a>
      )}

    </section>
  );
}
