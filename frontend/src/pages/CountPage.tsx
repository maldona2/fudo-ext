import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/Notice';
import { useAuth } from '@/contexts/AuthContext';
import {
  countLists,
  counts,
  errorMessage,
  products as productsApi,
} from '@/lib/api';
import { normalize, plural } from '@/lib/format';
import {
  draftToEntries,
  parseQuantity,
  parsePacks,
  type CountDraft,
  type PackDraft,
} from '@/lib/countDraft';
import type { CountList, CountProduct } from '@/types/api';
import { cn } from '@/lib/utils';

// The draft survives a reload or a locked phone. It only holds what was
// typed (no system figures), so browser storage is acceptable here.
const DRAFT_KEY = 'count-draft';
const PACKS_KEY = 'count-draft-packs';
const LIST_KEY = 'count-list';

const loadListId = (): string | null => {
  try {
    return localStorage.getItem(LIST_KEY);
  } catch {
    return null;
  }
};

const loadDraft = (key = DRAFT_KEY): CountDraft => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as CountDraft;
  } catch {
    return {};
  }
};

export function CountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<CountProduct[] | null>(null);
  const [lists, setLists] = useState<CountList[]>([]);
  const [listId, setListId] = useState<string | null>(loadListId);
  const [draft, setDraft] = useState<CountDraft>(() => loadDraft());
  const [packs, setPacks] = useState<PackDraft>(() => loadDraft(PACKS_KEY));
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([productsApi.listForCount(), countLists.list()])
      .then(([products, savedLists]) => {
        setList(products);
        setLists(savedLists);
        // A list deleted since the last visit falls back to all products.
        setListId((id) => (savedLists.some((l) => l.id === id) ? id : null));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    try {
      if (listId) localStorage.setItem(LIST_KEY, listId);
      else localStorage.removeItem(LIST_KEY);
    } catch {
      // storage disabled: the choice just will not be remembered
    }
  }, [listId]);

  const scope = useMemo(() => {
    const chosen = lists.find((l) => l.id === listId);
    return chosen ? new Set(chosen.productIds) : null;
  }, [lists, listId]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage full or disabled: the draft just will not survive a reload
    }
  }, [draft]);

  useEffect(() => {
    try {
      localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
    } catch {
      // storage full or disabled: the draft just will not survive a reload
    }
  }, [packs]);

  const unitsPerPack = useMemo(
    () =>
      new Map(
        (list ?? []).flatMap((p) =>
          p.pack ? [[p.id, p.pack.units] as const] : []
        )
      ),
    [list]
  );

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const visible = (list ?? []).filter(
      (p) =>
        (!scope || scope.has(p.id)) &&
        (!q || normalize(p.name).includes(q) || p.code === q)
    );
    const byCategory = new Map<string, CountProduct[]>();
    for (const p of visible) {
      const key = p.category ?? 'Sin categoría';
      byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
    }
    return [...byCategory];
  }, [list, query, scope]);

  // Only what belongs to the chosen list is sent.
  const { entries, invalid } = draftToEntries(
    scope
      ? Object.fromEntries(
          Object.entries(draft).filter(([id]) => scope.has(id))
        )
      : draft,
    scope
      ? Object.fromEntries(
          Object.entries(packs).filter(([id]) => scope.has(id))
        )
      : packs,
    unitsPerPack
  );

  const save = async () => {
    if (invalid.length > 0) {
      setError(
        'Hay cantidades que no se entienden. Revisá las marcadas en rojo.'
      );
      return;
    }
    if (
      !window.confirm(
        `¿Guardar el conteo de ${entries.length} producto(s)? Después no se puede modificar.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await counts.create(
        scope && listId ? { entries, listId } : { entries }
      );
      setDraft({});
      setPacks({});
      if (user?.role === 'owner') {
        navigate(`/panel/conteos/${result.id}`);
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          <p className="text-lg font-semibold">Conteo guardado ✓</p>
          <p>Gracias. El dueño ya puede ver el resultado.</p>
        </Notice>
        <Button className="h-12 w-full text-lg" onClick={() => setSaved(false)}>
          Hacer otro conteo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conteo de stock</h1>
        <p className="text-muted-foreground">
          Contá lo que hay y anotá la cantidad. Dejá vacío lo que no contaste.
        </p>
      </div>

      {lists.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Qué contar"
        >
          {[{ id: null, name: 'Todos los productos' }, ...lists].map((l) => (
            <button
              key={l.id ?? 'all'}
              type="button"
              aria-pressed={listId === l.id}
              onClick={() => setListId(l.id)}
              className={cn(
                'rounded-full border px-4 py-2 text-base',
                listId === l.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              )}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar producto o código"
          aria-label="Buscar producto"
          className="h-12 pl-10 text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!list && !error && <Notice>Cargando productos…</Notice>}
      {list && groups.length === 0 && (
        <Notice>No hay productos con ese nombre.</Notice>
      )}

      {groups.map(([category, items]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {category}
          </h2>
          <ul className="divide-y rounded-lg border bg-background">
            {items.map((p) => {
              const value = draft[p.id] ?? '';
              const packValue = packs[p.id] ?? '';
              const bad = invalid.includes(p.id);
              const total = draftToEntries(
                { [p.id]: value },
                { [p.id]: packValue },
                unitsPerPack
              ).entries[0]?.counted;
              const packLabel = p.pack
                ? `${p.pack.label.charAt(0).toUpperCase()}${p.pack.label.slice(1)}s`
                : '';
              if (p.pack) {
                const closed = parsePacks(packValue);
                return (
                  <li key={p.id} className="space-y-2 px-3 py-3">
                    <p className="text-base">
                      {p.name}
                      {p.code && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          #{p.code}
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-0 flex-1 space-y-1">
                        <span className="text-sm">{packLabel}</span>
                        <Input
                          aria-label={`${packLabel} de ${p.name}`}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="—"
                          aria-invalid={Number.isNaN(closed) || undefined}
                          className="h-12 text-center text-lg"
                          value={packValue}
                          onChange={(e) =>
                            setPacks((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                        />
                      </label>
                      <label className="min-w-0 flex-1 space-y-1">
                        <span className="text-sm">Sueltas</span>
                        <Input
                          aria-label={`Sueltas de ${p.name}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="—"
                          aria-invalid={
                            Number.isNaN(parseQuantity(value)) || undefined
                          }
                          className="h-12 text-center text-lg"
                          value={value}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        disabled={Number.isNaN(closed)}
                        onClick={() =>
                          setPacks((d) => ({
                            ...d,
                            [p.id]: String(
                              (parsePacks(d[p.id] ?? '') ?? 0) + 1
                            ),
                          }))
                        }
                      >
                        +1 {p.pack.label}
                      </Button>
                    </div>
                    {total !== undefined && (
                      <p className="text-sm font-semibold">= {total} u.</p>
                    )}
                  </li>
                );
              }
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2"
                >
                  <label htmlFor={`q-${p.id}`} className="flex-1 text-base">
                    {p.name}
                    {p.code && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        #{p.code}
                      </span>
                    )}
                  </label>
                  <Input
                    id={`q-${p.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="—"
                    aria-invalid={bad || undefined}
                    className="h-12 w-24 text-center text-lg"
                    value={value}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [p.id]: e.target.value }))
                    }
                  />
                  {packValue.trim() !== '' && (
                    <div className="w-full space-y-2 rounded-md bg-muted p-3">
                      <p className="text-sm">
                        Ya no hay un bulto configurado para este producto. Tu
                        borrador tiene {packValue} bulto(s) que no podemos
                        convertir a unidades. Descartalos y anotá esas unidades
                        en la cantidad; las sueltas que ingresaste se conservan.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        aria-label={`Descartar bultos de ${p.name}`}
                        onClick={() =>
                          setPacks((d) => {
                            const remaining = { ...d };
                            delete remaining[p.id];
                            return remaining;
                          })
                        }
                      >
                        Descartar bultos del borrador
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex-1 text-base">
            {plural(entries.length, 'producto contado', 'productos contados')}
          </span>
          <Button
            className="h-12 px-6 text-lg"
            disabled={busy || entries.length + invalid.length === 0}
            onClick={() => void save()}
          >
            {busy ? 'Guardando…' : 'Guardar conteo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
