import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { BRAND } from '../../shared/brand';
import type { PublicSettings } from '../../shared/types';
import { useApi } from './useApi';

const DEFAULTS: PublicSettings = {
  storeName: BRAND.name,
  tagline: BRAND.tagline,
  announcements: [...BRAND.announcements],
  whatsappNumber: null,
  instagramHandle: null,
  heroHeadline: BRAND.heroHeadline,
  heroSubline: BRAND.heroSubline,
  heroImageId: null,
  brandStatement: BRAND.brandStatement,
  aboutHeadline: BRAND.aboutHeadline,
  aboutText: BRAND.aboutText,
  aboutImageId: null,
};

interface StoreValue {
  settings: PublicSettings;
  ready: boolean;
  reload: () => void;
}

const StoreContext = createContext<StoreValue>({ settings: DEFAULTS, ready: false, reload: () => {} });

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useApi<PublicSettings>('/settings');
  // The storefront still works if settings fail to load: defaults are used.
  const settings = data ?? DEFAULTS;
  return <StoreContext.Provider value={{ settings, ready: !loading, reload }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

export function usePageTitle(title?: string | null) {
  const { settings } = useStore();
  useEffect(() => {
    document.title = title ? `${title} — ${settings.storeName}` : `${settings.storeName} — ${BRAND.descriptor}`;
  }, [title, settings.storeName]);
}
