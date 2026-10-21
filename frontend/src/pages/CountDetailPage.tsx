import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DifferenceBadge } from '@/components/DifferenceBadge';
import { Notice } from '@/components/Notice';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user } = useAuth();
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

  const isOwner = user?.role === 'owner';
  const box = (label: string, value: number) => (
    <div className="rounded-xl bg-muted px-2 py-2 text-center">
      <p className="text-xs font-bold text-foreground-secondary">{label}</p>
      <p className="text-lg font-extrabold tabular-nums">
        {formatUnits(value)}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link
        to="/panel"
        className="inline-flex h-11 items-center gap-1 rounded-full text-base font-bold text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" /> Volver al panel
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold">
          Conteo del {formatDateTime(count.countedAt)}
        </h1>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="font-medium text-foreground-secondary">Lo hizo</dt>
          <dd className="font-bold">{count.createdBy.name}</dd>
          {count.list && (
            <>
              <dt className="font-medium text-foreground-secondary">Lista</dt>
              <dd className="font-bold">{count.list.name}</dd>
            </>
          )}
          <dt className="font-medium text-foreground-secondary">Productos</dt>
          <dd className="font-bold">
            {plural(count.summary.products, 'producto', 'productos')}
          </dd>
          {count.note && (
            <>
              <dt className="font-medium text-foreground-secondary">Nota</dt>
              <dd className="font-bold">“{count.note}”</dd>
            </>
          )}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-danger-soft p-4 text-danger-foreground">
          <p className="text-sm font-bold">Faltan</p>
          <p className="text-2xl font-extrabold tabular-nums">
            {formatUnits(count.summary.missingUnits)} u.
          </p>
          <p className="text-base font-bold">
            {formatMoney(count.summary.missingValue)}
          </p>
        </div>
        <div className="rounded-2xl bg-warning-soft p-4 text-warning-foreground">
          <p className="text-sm font-bold">Sobran</p>
          <p className="text-2xl font-extrabold tabular-nums">
            {formatUnits(count.summary.surplusUnits)} u.
          </p>
          <p className="text-base font-bold">
            {formatMoney(count.summary.surplusValue)}
          </p>
        </div>
      </div>

      {withDifference.length === 0 ? (
        <Notice tone="success">
          Todo lo contado coincide con lo esperado.
        </Notice>
      ) : (
        <ul className="space-y-3">
          {withDifference.map((l) => (
            <li
              key={l.productId}
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="space-y-2">
                <span className="block text-[17px] font-semibold break-words">
                  {l.name}
                </span>
                <DifferenceBadge
                  difference={l.difference}
                  value={l.differenceValue}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {box('Esperado', l.expected)}
                {isOwner && l.firstCounted != null ? (
                  box('1er conteo', l.firstCounted)
                ) : (
                  <div />
                )}
                {box('Final', l.counted)}
              </div>
              <p className="text-sm font-medium text-foreground-secondary">
                <Explanation line={l} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <details className="rounded-2xl border border-border bg-card px-4 py-3">
          <summary className="min-h-11 cursor-pointer text-base font-bold">
            {plural(ok.length, 'producto', 'productos')} sin diferencias
          </summary>
          <ul className="mt-2 space-y-1 text-base font-medium text-foreground-secondary">
            {ok.map((l) => (
              <li key={l.productId}>
                {l.name}: {formatUnits(l.counted)}
                {isOwner && l.firstCounted != null && (
                  <span className="ml-2">
                    (1er conteo: {formatUnits(l.firstCounted)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
