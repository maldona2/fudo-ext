import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Faltantes de los últimos {DAYS} días
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shrinkage.length === 0 ? (
            <p className="text-lg">✅ No hubo faltantes en los conteos.</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-destructive">
                {formatMoney(total)}
              </p>
              <ul className="divide-y">
                {shrinkage.map((r) => (
                  <li
                    key={r.productId}
                    className="flex items-baseline gap-3 py-2"
                  >
                    <span className="flex-1 text-base">
                      {r.name}
                      <span className="block text-sm text-muted-foreground">
                        {plural(r.counts, 'conteo', 'conteos')} con faltante ·
                        último {formatDate(r.lastCountedAt)}
                      </span>
                    </span>
                    <span className="text-right text-base font-semibold">
                      {formatUnits(r.missingUnits)} u.
                      <span className="block text-sm font-normal text-muted-foreground">
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

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Conteos</h2>
        {list.length === 0 && (
          <Notice>Todavía no hay conteos. Empezá desde “Contar”.</Notice>
        )}
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                to={`/panel/conteos/${c.id}`}
                className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 hover:bg-muted"
              >
                <span className="flex-1">
                  <span className="block text-base font-medium">
                    {formatDateTime(c.countedAt)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {c.list && <>{c.list.name} · </>}
                    {c.createdBy.name} ·{' '}
                    {plural(c.summary.products, 'producto', 'productos')}
                  </span>
                </span>
                {c.summary.missingUnits > 0 ? (
                  <span className="text-right font-semibold text-destructive">
                    Faltan {formatUnits(c.summary.missingUnits)}
                    <span className="block text-sm font-normal">
                      {formatMoney(c.summary.missingValue)}
                    </span>
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700">OK</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
