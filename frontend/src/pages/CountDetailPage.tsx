import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DifferenceBadge } from '@/components/DifferenceBadge';
import { Notice } from '@/components/Notice';
import { counts as countsApi, errorMessage } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatUnits,
  plural,
} from '@/lib/format';
import type { CountDetail, CountLine } from '@/types/api';

function Explanation({ line }: { line: CountLine }) {
  if (!line.previous) {
    return (
      <>
        Primer conteo: el sistema dice {formatUnits(line.expected)}, contaste{' '}
        {formatUnits(line.counted)}.
      </>
    );
  }
  return (
    <>
      Había {formatUnits(line.previous.counted)} el{' '}
      {formatDate(line.previous.countedAt)}
      {line.bought > 0 && <> + entraron {formatUnits(line.bought)}</>}
      {line.sold > 0 && <> − se vendieron {formatUnits(line.sold)}</>} = tendría
      que haber {formatUnits(line.expected)}. Contaste{' '}
      {formatUnits(line.counted)}.
    </>
  );
}

export function CountDetailPage() {
  const { id = '' } = useParams();
  const [count, setCount] = useState<CountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    countsApi
      .get(id)
      .then(setCount)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!count) return <Notice>Cargando…</Notice>;

  const withDifference = count.lines.filter((l) => l.difference !== 0);
  const ok = count.lines.filter((l) => l.difference === 0);

  return (
    <div className="space-y-4">
      <Link
        to="/panel"
        className="inline-flex items-center gap-1 text-base text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Volver al panel
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          Conteo del {formatDateTime(count.countedAt)}
        </h1>
        <p className="text-muted-foreground">
          Lo hizo {count.createdBy.name} ·{' '}
          {plural(count.summary.products, 'producto', 'productos')}
          {count.note && <> · “{count.note}”</>}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Faltan</p>
            <p className="text-2xl font-bold text-destructive">
              {formatUnits(count.summary.missingUnits)} u.
            </p>
            <p className="text-base">
              {formatMoney(count.summary.missingValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Sobran</p>
            <p className="text-2xl font-bold">
              {formatUnits(count.summary.surplusUnits)} u.
            </p>
            <p className="text-base">
              {formatMoney(count.summary.surplusValue)}
            </p>
          </div>
        </CardContent>
      </Card>

      {withDifference.length === 0 ? (
        <Notice tone="success">
          ✅ Todo lo contado coincide con lo esperado.
        </Notice>
      ) : (
        <ul className="space-y-2">
          {withDifference.map((l) => (
            <li
              key={l.productId}
              className="rounded-lg border bg-background px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-lg font-medium">{l.name}</span>
                <DifferenceBadge
                  difference={l.difference}
                  value={l.differenceValue}
                />
              </div>
              <p className="mt-1 text-base text-muted-foreground">
                <Explanation line={l} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <details className="rounded-lg border bg-background px-4 py-3">
          <summary className="cursor-pointer text-base">
            {plural(ok.length, 'producto', 'productos')} sin diferencias
          </summary>
          <ul className="mt-2 space-y-1 text-base text-muted-foreground">
            {ok.map((l) => (
              <li key={l.productId}>
                {l.name}: {formatUnits(l.counted)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
