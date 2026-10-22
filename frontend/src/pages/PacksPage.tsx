import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import { errorMessage, productPacks, products as productsApi } from '@/lib/api';
import { normalize, plural } from '@/lib/format';
import { parsePackCsv, type PackInput } from '@/lib/packCsv';
import type { CountProduct } from '@/types/api';

function PackRow({
  product,
  busy,
  onSave,
  onRemove,
}: {
  product: CountProduct;
  busy: boolean;
  onSave: (pack: PackInput) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [units, setUnits] = useState(
    product.pack ? String(product.pack.units) : ''
  );
  const [label, setLabel] = useState(product.pack?.label ?? 'bulto');
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(units) || Number(units) < 2 || Number(units) > 1000) {
      setError('Las unidades deben ser un entero entre 2 y 1000.');
      return;
    }
    if (!label.trim() || label.trim().length > 20) {
      setError('La etiqueta debe tener entre 1 y 20 caracteres.');
      return;
    }
    setError(null);
    await onSave({
      productId: product.id,
      units: Number(units),
      label: label.trim(),
    });
  };
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset
        aria-label={product.name}
        disabled={busy}
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <legend className="px-1 text-[17px] font-semibold">
          {product.name}
        </legend>
        {product.code && (
          <p className="text-sm font-medium text-foreground-secondary">
            Código FUDO: {product.code}
          </p>
        )}
        <div className="flex items-end gap-2">
          <span aria-hidden className="pb-4 text-lg font-extrabold">
            1
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`label-${product.id}`}>Etiqueta</Label>
            <Input
              id={`label-${product.id}`}
              maxLength={20}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <span aria-hidden className="pb-4 text-lg font-extrabold">
            =
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`units-${product.id}`}>Unidades por bulto</Label>
            <Input
              id={`units-${product.id}`}
              inputMode="numeric"
              value={units}
              onChange={(event) => setUnits(event.target.value)}
            />
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" size="md" className="flex-1">
            Guardar
          </Button>
          {product.pack && (
            <Button
              type="button"
              variant="destructive"
              size="md"
              onClick={() => onRemove(product.id)}
            >
              Quitar
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

export function PacksPage() {
  const [products, setProducts] = useState<CountProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    productsApi
      .listForCount()
      .then(setProducts)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  const preview = useMemo(
    () => parsePackCsv(sheet, products ?? []),
    [sheet, products]
  );
  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const byCategory = new Map<string, CountProduct[]>();
    for (const product of products ?? []) {
      if (
        q &&
        !normalize(product.name).includes(q) &&
        product.code !== query.trim()
      )
        continue;
      const category = product.category ?? 'Sin categoría';
      byCategory.set(category, [...(byCategory.get(category) ?? []), product]);
    }
    return [...byCategory];
  }, [products, query]);

  const save = async (packs: PackInput[], importing = false) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await productPacks.save(packs);
      const saved = new Map(packs.map((pack) => [pack.productId, pack]));
      setProducts(
        (current) =>
          current?.map((product) => {
            const pack = saved.get(product.id);
            return pack
              ? { ...product, pack: { units: pack.units, label: pack.label } }
              : product;
          }) ?? null
      );
      if (importing) setSheet('');
      setMessage(importing ? 'Bultos importados.' : 'Bulto guardado.');
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await productPacks.remove(id);
      setProducts(
        (current) =>
          current?.map((product) =>
            product.id === id ? { ...product, pack: null } : product
          ) ?? null
      );
      setMessage('Bulto quitado.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!products)
    return (
      <Notice tone={error ? 'error' : 'info'}>{error ?? 'Cargando…'}</Notice>
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Bultos</h1>
        <p className="text-sm font-medium text-foreground-secondary">
          Definí cuántas unidades trae cada cajón, fardo o bulto.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-extrabold">
            Pegar planilla
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="pack-sheet">Planilla de bultos</Label>
          <p
            id="sheet-help"
            className="text-sm font-medium text-foreground-secondary"
          >
            Una fila por producto: código FUDO o nombre;unidades;etiqueta.
            También podés pegar columnas con tabulaciones o comas. La etiqueta
            es opcional.
          </p>
          <textarea
            id="pack-sheet"
            aria-describedby="sheet-help"
            className="min-h-32 w-full rounded-xl border-2 border-field bg-card p-3 font-mono text-base outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring-soft"
            value={sheet}
            disabled={busy}
            onChange={(event) => setSheet(event.target.value)}
          />
          {preview.errors.length > 0 && (
            <Notice tone="error">
              <ul>
                {preview.errors.map((item) => (
                  <li key={item.line}>
                    Línea {item.line}: {item.text}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {preview.packs.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-primary-soft p-3 text-sm font-semibold text-primary-soft-foreground">
              {preview.packs.map((pack) => (
                <li key={pack.productId}>
                  {
                    products.find((product) => product.id === pack.productId)
                      ?.name
                  }
                  : {pack.units} unidades por {pack.label}
                </li>
              ))}
            </ul>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={busy || preview.packs.length === 0}
            onClick={() => void save(preview.packs, true)}
          >
            Importar {plural(preview.packs.length, 'bulto', 'bultos')}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        <Label htmlFor="pack-search">Buscar producto</Label>
        <Input
          id="pack-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o código FUDO"
        />
      </div>
      {groups.length === 0 && <Notice>No hay productos para mostrar.</Notice>}
      {groups.map(([category, items]) => (
        <section key={category} className="space-y-3" aria-label={category}>
          <h2 className="text-xs font-bold tracking-[0.08em] text-foreground-secondary uppercase">
            {category}
          </h2>
          {items.map((product) => (
            <PackRow
              key={`${product.id}-${product.pack?.units ?? ''}-${product.pack?.label ?? ''}`}
              product={product}
              busy={busy}
              onSave={(pack) => save([pack])}
              onRemove={(id) => void remove(id)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
