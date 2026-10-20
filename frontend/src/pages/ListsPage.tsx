import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import {
  countLists as listsApi,
  errorMessage,
  products as productsApi,
} from '@/lib/api';
import { plural } from '@/lib/format';
import type { CountList, CountProduct } from '@/types/api';

interface Editing {
  id: string | null; // null: new list
  name: string;
  productIds: string[];
}

function ListEditor({
  products,
  initial,
  onSaved,
  onCancel,
}: {
  products: CountProduct[];
  initial: Editing;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [order, setOrder] = useState(initial.productIds);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const byCategory = new Map<string, CountProduct[]>();
    for (const p of products) {
      const key = p.category ?? 'Sin categoría';
      byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
    }
    return [...byCategory];
  }, [products]);

  const toggle = (id: string) =>
    setOrder((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );

  const move = (index: number, direction: -1 | 1) =>
    setOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input = {
      name: name.trim(),
      productIds: order,
    };
    try {
      if (initial.id) await listsApi.update(initial.id, input);
      else await listsApi.create(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {initial.id ? 'Editar lista' : 'Nueva lista'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name" className="text-base">
              Nombre de la lista
            </Label>
            <Input
              id="list-name"
              className="h-12 text-lg"
              placeholder="Ej.: Diario - alto riesgo"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {groups.map(([category, items]) => (
            <fieldset key={category} className="space-y-1">
              <legend className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {category}
              </legend>
              {items.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-base hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={order.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ))}

          {order.length > 0 && (
            <section aria-labelledby="walking-order" className="space-y-2">
              <h2 id="walking-order" className="text-base font-semibold">
                Orden de recorrido
              </h2>
              <ol className="space-y-2">
                {order.map((id, index) => {
                  const product = productsById.get(id);
                  if (!product) return null;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-lg border p-2"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {index + 1}. {product.name}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="size-12 shrink-0"
                        aria-label={`Subir ${product.name}`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="size-12 shrink-0"
                        aria-label={`Bajar ${product.name}`}
                        disabled={index === order.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button
              type="submit"
              className="h-12 flex-1 text-lg"
              disabled={busy || order.length === 0 || name.trim() === ''}
            >
              Guardar lista
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 text-lg"
              onClick={onCancel}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {plural(order.length, 'producto elegido', 'productos elegidos')}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function ListsPage() {
  const [products, setProducts] = useState<CountProduct[] | null>(null);
  const [lists, setLists] = useState<CountList[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([productsApi.listForCount(), listsApi.list()])
      .then(([p, l]) => {
        setProducts(p);
        setLists(l);
      })
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void load();
  }, []);

  const remove = async (l: CountList) => {
    if (
      !window.confirm(
        `¿Borrar la lista “${l.name}”? Los conteos hechos no se pierden.`
      )
    ) {
      return;
    }
    try {
      await listsApi.remove(l.id);
      void load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (error && !products) return <Notice tone="error">{error}</Notice>;
  if (!products) return <Notice>Cargando…</Notice>;

  if (editing) {
    return (
      <ListEditor
        products={products}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Listas de conteo</h1>
        <p className="text-muted-foreground">
          Armá listas cortas para contar seguido lo que más se pierde, por
          ejemplo un conteo diario de los productos de mayor riesgo.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {lists.length === 0 && <Notice>Todavía no hay listas.</Notice>}
      <ul className="space-y-2">
        {lists.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3"
          >
            <span className="flex-1">
              <span className="block text-base font-medium">{l.name}</span>
              <span className="text-sm text-muted-foreground">
                {plural(l.productIds.length, 'producto', 'productos')}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Editar ${l.name}`}
              onClick={() =>
                setEditing({
                  id: l.id,
                  name: l.name,
                  productIds: [...l.productIds],
                })
              }
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Borrar ${l.name}`}
              onClick={() => void remove(l)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        className="h-12 w-full text-lg"
        onClick={() => setEditing({ id: null, name: '', productIds: [] })}
      >
        Nueva lista
      </Button>
    </div>
  );
}
