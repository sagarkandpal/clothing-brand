import { useStore } from '../lib/store';

/**
 * Typographic logo. The text comes from store settings (falling back to
 * shared/brand.ts), so a rename never touches component code.
 */
export function Wordmark({ size = 'md', tone = 'ink' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; tone?: 'ink' | 'light' }) {
  const { settings } = useStore();
  return (
    <span className={`wordmark wordmark--${size} wordmark--${tone}`} aria-label={settings.storeName}>
      <span aria-hidden="true">{settings.storeName}</span>
      <span className="wordmark__dot" aria-hidden="true" />
    </span>
  );
}
