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
    return <Badge variant="secondary">OK</Badge>;
  }
  const missing = difference < 0;
  const money = value === null ? '' : ` (${formatMoney(value)})`;
  return (
    <Badge
      className={cn(
        'text-sm',
        missing ? 'bg-destructive text-white' : 'bg-amber-100 text-amber-900'
      )}
    >
      {missing ? 'Faltan' : 'Sobran'} {formatUnits(difference)}
      {money}
    </Badge>
  );
}
