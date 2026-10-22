import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice } from '@/components/Notice';
import { counts as countsApi, errorMessage } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatUnits,
  plural,
} from '@/lib/format';
import type { CountRecord, ShrinkageRow } from '@/types/api';

const DAYS = 30;

export function PanelPage() {
  const [shrinkage, setShrinkage] = useState<ShrinkageRow[] | null>(null);
  const [list, setList] = useState<CountRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([countsApi.shrinkage(DAYS), countsApi.list(30)])
      .then(([s, c]) => {
        setShrinkage(s);
        setList(c);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!shrinkage || !list) return <Notice>Cargando…</Notice>;

  const total = shrinkage.reduce((sum, r) => sum + r.missingValue, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[5fr_6fr] lg:items-start">
      <Card className="rounded-[20px]">
        <CardHeader>
          <CardTitle className="text-xl font-extrabold">
            Faltantes de los últimos {DAYS} días
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shrinkage.length === 0 ? (
            <p className="flex items-center gap-3 text-lg font-semibold text-success-foreground">
              <span className="grid size-8 place-items-center rounded-full bg-success-soft text-success">
                <Check aria-hidden className="size-5" strokeWidth={3} />
              </span>
              No hubo faltantes en los conteos.
            </p>
          ) : (
            <>
              <p className="text-4xl font-extrabold text-danger tabular-nums lg:text-5xl">
                {formatMoney(total)}
              </p>
              <ul className="divide-y divide-border">
                {shrinkage.map((r) => (
                  <li
                    key={r.productId}
                    className="flex items-baseline gap-3 py-3"
                  >
                    <span className="flex-1 text-base font-semibold">
                      {r.name}
                      <span className="block text-sm font-medium text-foreground-secondary">
                        {plural(r.counts, 'conteo', 'conteos')} con faltante ·
                        último {formatDate(r.lastCountedAt)}
                      </span>
                    </span>
                    <span className="text-right text-base font-bold tabular-nums">
                      {formatUnits(r.missingUnits)} u.
                      <span className="block text-sm font-medium text-foreground-secondary">
                        {formatMoney(r.missingValue)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-extrabold">Conteos</h2>
        {list.length === 0 && (
          <Notice>Todavía no hay conteos. Empezá desde “Contar”.</Notice>
        )}
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                to={`/panel/conteos/${c.id}`}
                className="block space-y-1 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-base font-bold">
                    {formatDateTime(c.countedAt)}
                  </span>
                  {c.summary.missingUnits > 0 ? (
                    <span className="rounded-full bg-danger-soft px-3 py-1 text-[13px] font-bold text-danger-foreground">
                      Faltan {formatUnits(c.summary.missingUnits)} u.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-[13px] font-bold text-success-foreground">
                      <Check aria-hidden className="size-3.5" />
                      Sin diferencias
                    </span>
                  )}
                </span>
                <span className="block text-sm font-medium text-foreground-secondary">
                  {c.list && <>{c.list.name} · </>}
                  {c.createdBy.name} ·{' '}
                  {plural(c.summary.products, 'producto', 'productos')}
                </span>
                {c.summary.missingUnits > 0 && (
                  <span className="block text-sm font-bold text-danger tabular-nums">
                    {formatMoney(c.summary.missingValue)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
