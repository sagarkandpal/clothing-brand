import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/store';

export default function NotFound({ what = 'page' }: { what?: 'page' | 'product' }) {
  usePageTitle('Not found');
  return (
    <div className="container notfound">
      <p className="eyebrow">Error 404</p>
      <h1 className="display">{what === 'product' ? 'This piece is gone' : 'Page not found'}</h1>
      <p>
        {what === 'product'
          ? 'This product may have sold out or been removed from the collection.'
          : 'The link may be broken or the page may have moved.'}
      </p>
      <div className="notfound__actions">
        <Link className="btn" to="/">
          Shop the collection
        </Link>
        <Link className="btn btn--ghost" to="/about">
          About us
        </Link>
      </div>
    </div>
  );
}
