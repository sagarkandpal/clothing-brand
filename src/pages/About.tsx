import { Link } from 'react-router-dom';
import { whatsappLink } from '../../shared/whatsapp';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { ProductImage } from '../components/ProductImage';
import { usePageTitle, useStore } from '../lib/store';

/** About page. All text and the photo are edited in Admin → Settings → About page. */
export default function About() {
  const { settings } = useStore();
  usePageTitle('About');
  const wa = whatsappLink(settings.whatsappNumber, 'Hi! I have a question about your shop.');
  const paragraphs = settings.aboutText.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div className="container about">
      <div className={`about__grid ${settings.aboutImageId ? '' : 'about__grid--text'}`}>
        <div className="about__body">
          <p className="eyebrow">{settings.storeName}</p>
          <h1 className="display about__title">{settings.aboutHeadline}</h1>
          {paragraphs.map((p, i) => (
            <p key={i} className="about__text">
              {p}
            </p>
          ))}

          <div className="about__actions">
            {wa && (
              <a className="btn btn--whatsapp" href={wa} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon size={18} /> Chat on WhatsApp
              </a>
            )}
            <Link className="btn btn--ghost" to="/">
              See all products
            </Link>
          </div>

          {settings.instagramHandle && (
            <a
              className="about__ig"
              href={`https://instagram.com/${settings.instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="instagram" size={18} /> @{settings.instagramHandle}
            </a>
          )}
        </div>

        {settings.aboutImageId && (
          <div className="about__photo">
            <ProductImage
              image={{ id: settings.aboutImageId, width: 1200, height: 1500, color: null }}
              alt={`${settings.storeName} shop`}
              ratio="4 / 5"
              priority
              sizes="(min-width: 900px) 45vw, 100vw"
            />
          </div>
        )}
      </div>
    </div>
  );
}
