import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <p className="state__title display">{title}</p>
      {children && <div className="state__text">{children}</div>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" size={28} />
      <p className="state__text">{message}</p>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
