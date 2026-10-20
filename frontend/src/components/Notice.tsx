import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-4 py-3 text-base',
        tone === 'error' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
        tone === 'success' &&
          'border-emerald-600/30 bg-emerald-50 text-emerald-800',
        tone === 'info' && 'bg-background'
      )}
    >
      {children}
    </div>
  );
}
