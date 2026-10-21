import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMoney, formatUnits } from '@/lib/format';
import { cn } from '@/lib/utils';

export function DifferenceBadge({
  difference,
  value,
}: {
  difference: number;
  value: number | null;
}) {
  if (difference === 0) {
    return (
      <Badge className="bg-success-soft text-success-foreground">
        <Check aria-hidden />
        Sin diferencias
      </Badge>
    );
  }
  const missing = difference < 0;
  const money = value === null ? '' : ` · ${formatMoney(value)}`;
  return (
    <Badge
      className={cn(
        'h-auto py-1 text-sm whitespace-normal',
        missing
          ? 'bg-danger-soft text-danger-foreground'
          : 'bg-warning-soft text-warning-foreground'
      )}
    >
      {missing ? 'Faltan' : 'Sobran'} {formatUnits(difference)}
      {money}
    </Badge>
  );
}
