import { ApiError } from '../lib/api';

/**
 * Downloads the full JSON backup (products incl. Trash, settings, photo list)
 * as a file. Used by the "Download backup" button and automatically before
 * anything is deleted for good.
 */
export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/admin/backup', { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'Your session has expired.' : 'Could not create the backup.');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'store-backup.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
