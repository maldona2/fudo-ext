import { WalkingOrder } from '@/components/WalkingOrder';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
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
  const [dragging, setDragging] = useState(false);
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
        <CardTitle className="text-xl font-extrabold">
          {initial.id ? 'Editar lista' : 'Nueva lista'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">Nombre de la lista</Label>
            <Input
              id="list-name"
              placeholder="Ej.: Diario - alto riesgo"
              maxLength={80}
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {groups.map(([category, items]) => (
            <fieldset key={category} className="space-y-1">
              <legend className="mb-1 text-xs font-bold tracking-[0.08em] text-foreground-secondary uppercase">
                {category}
              </legend>
              {items.map((p) => (
                <label
                  key={p.id}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-2 text-base font-semibold hover:bg-primary-soft/50"
                >
                  <input
                    type="checkbox"
                    className="size-[26px] shrink-0 accent-primary"
                    disabled={busy}
                    checked={order.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ))}

          <WalkingOrder
            products={products}
            order={order}
            onOrderChange={setOrder}
            disabled={busy}
            onDraggingChange={setDragging}
          />

          {error && <Notice tone="error">{error}</Notice>}
          <p className="text-sm font-medium text-foreground-secondary">
            {plural(order.length, 'producto elegido', 'productos elegidos')}
          </p>
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card shadow-[0_-6px_20px_rgba(29,21,64,0.08)] lg:left-[248px]">
            <div className="mx-auto flex max-w-3xl gap-2 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] lg:max-w-[960px]">
              <Button
                type="submit"
                size="lg"
                className="flex-1"
                disabled={
                  busy || dragging || order.length === 0 || name.trim() === ''
                }
              >
                Guardar lista
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={onCancel}
              >
                Cancelar
              </Button>
            </div>
          </div>
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
        <h1 className="text-2xl font-extrabold">Listas de conteo</h1>
        <p className="text-sm font-medium text-foreground-secondary">
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
            className="flex items-center gap-1 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold break-words">
                {l.name}
              </span>
              <span className="text-sm font-medium text-foreground-secondary">
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
              className="text-destructive hover:bg-danger-soft hover:text-destructive"
              aria-label={`Borrar ${l.name}`}
              onClick={() => void remove(l)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card shadow-[0_-6px_20px_rgba(29,21,64,0.08)] lg:left-[248px]">
        <div className="mx-auto max-w-3xl px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] lg:max-w-[960px]">
          <Button
            size="lg"
            className="w-full"
            onClick={() => setEditing({ id: null, name: '', productIds: [] })}
          >
            Nueva lista
          </Button>
        </div>
      </div>
    </div>
  );
}
