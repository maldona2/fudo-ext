import type { ReactNode } from 'react';
import { AlertCircle, Check } from 'lucide-react';
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
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-base font-medium',
        tone === 'error' &&
          'border-danger-ring bg-danger-soft text-danger-foreground',
        tone === 'success' &&
          'border-success/30 bg-success-soft text-success-foreground',
        tone === 'info' && 'border-border bg-card text-foreground-medium'
      )}
    >
      {tone === 'error' && (
        <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
      )}
      {tone === 'success' && (
        <Check aria-hidden className="mt-0.5 size-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
