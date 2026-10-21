import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { resolveBarcode } from '@/lib/barcodes';
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
const RECOUNT_KEY = 'count-recount';

interface RecountState {
  checkId: string;
  ids: string[];
  phase?: 'resetting' | 'active';
  entryIds?: string[];
}

interface CountInitialState {
  recount: RecountState | null;
  draft: CountDraft;
  packs: PackDraft;
}

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

const clearDraftIds = (draft: CountDraft, ids: string[]): CountDraft => {
  if (ids.length === 0) return draft;
  const next = { ...draft };
  for (const id of ids) delete next[id];
  return next;
};

const loadRecount = (): RecountState | null => {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(RECOUNT_KEY) ?? 'null'
    );
    if (
      value &&
      typeof value === 'object' &&
      'checkId' in value &&
      typeof value.checkId === 'string' &&
      'ids' in value &&
      Array.isArray(value.ids) &&
      value.ids.every((id) => typeof id === 'string') &&
      (!('entryIds' in value) ||
        (Array.isArray(value.entryIds) &&
          value.entryIds.every((id) => typeof id === 'string')))
    ) {
      return {
        checkId: value.checkId,
        ids: value.ids,
        ...('phase' in value &&
        (value.phase === 'resetting' || value.phase === 'active')
          ? { phase: value.phase }
          : {}),
        ...('entryIds' in value && Array.isArray(value.entryIds)
          ? { entryIds: value.entryIds }
          : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
};

const loadInitialState = (): CountInitialState => {
  let recount = loadRecount();
  let draft = loadDraft();
  let packs = loadDraft(PACKS_KEY);
  if (recount?.phase === 'resetting') {
    draft = clearDraftIds(draft, recount.ids);
    packs = clearDraftIds(packs, recount.ids);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
      recount = { ...recount, phase: 'active' };
      localStorage.setItem(RECOUNT_KEY, JSON.stringify(recount));
    } catch {
      // Keep the resetting marker so a later reload repeats the safe scrub.
    }
  }
  return { recount, draft, packs };
};

export function CountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [initialState] = useState(loadInitialState);
  const [list, setList] = useState<CountProduct[] | null>(null);
  const [lists, setLists] = useState<CountList[]>([]);
  const [listId, setListId] = useState<string | null>(loadListId);
  const [recount, setRecount] = useState<RecountState | null>(
    initialState.recount
  );
  const [draft, setDraft] = useState<CountDraft>(initialState.draft);
  const [packs, setPacks] = useState<PackDraft>(initialState.packs);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canStartAgain, setCanStartAgain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState<{productId: string} | null>(null);
  const scanHandled = useRef(false);
  useEffect(() => {
    if (!scanned) return;
    const input = document.getElementById(`q-${scanned.productId}`);
    input?.scrollIntoView?.({block: 'center', behavior: 'smooth'});
    input?.focus({preventScroll: true});
    const timer = window.setTimeout(() => setScanned(null), 2500);
    return () => window.clearTimeout(timer);
  }, [scanned]);

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

  const chosen = useMemo(
    () => lists.find((l) => l.id === listId),
    [lists, listId]
  );
  const scope = useMemo(
    () => (chosen ? new Set(chosen.productIds) : null),
    [chosen]
  );

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

  const onDetected = (raw: string) => {
    if (scanHandled.current) return;
    scanHandled.current = true;
    setScanning(false);
    const resolution = resolveBarcode(raw, list ?? [], recount ? new Set(recount.ids) : scope);
    if (resolution.kind === 'match') {
      setQuery('');
      setScanMessage(null);
      setScanned({productId: resolution.productId});
      return;
    }
    const messages = {
      invalid: 'El código no es un EAN o UPC válido. Probá de nuevo o buscá por nombre.',
      unknown: 'Código no asociado. Buscá el producto por nombre o avisale al dueño.',
      ambiguous: 'Este código tiene más de una asociación. Avisale al dueño y buscá por nombre.',
      'out-of-scope': recount ? 'Este producto no está entre los que tenés que volver a contar.' : 'Este producto no pertenece a esta lista.',
    };
    setScanMessage(messages[resolution.kind]);
  };

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
    const productsById = new Map(
      (list ?? []).map((product) => [product.id, product])
    );
    const productOrder = recount
      ? [
          ...(recount.entryIds ??
            chosen?.productIds ??
            (list ?? []).map((product) => product.id)),
          ...recount.ids,
        ]
      : (chosen?.productIds ?? (list ?? []).map((product) => product.id));
    const ordered = [...new Set(productOrder)].flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
    const visible = ordered.filter(
      (p) =>
        (!recount || recount.ids.includes(p.id)) &&
        (!q || normalize(p.name).includes(q) || p.code === q)
    );
    if (chosen) {
      return visible.length > 0 ? [[chosen.name, visible] as const] : [];
    }
    const byCategory = new Map<string, CountProduct[]>();
    for (const p of visible) {
      const key = p.category ?? 'Sin categoría';
      byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
    }
    return [...byCategory];
  }, [list, query, chosen, recount]);

  // Only what belongs to the chosen list is sent.
  const entryScope = recount
    ? new Set([...(recount.entryIds ?? []), ...recount.ids])
    : scope;
  const { entries, invalid } = draftToEntries(
    entryScope
      ? Object.fromEntries(
          Object.entries(draft).filter(([id]) => entryScope.has(id))
        )
      : draft,
    entryScope
      ? Object.fromEntries(
          Object.entries(packs).filter(([id]) => entryScope.has(id))
        )
      : packs,
    unitsPerPack
  );

  const availableProductIds = new Set((list ?? []).map((p) => p.id));
  const listTotal = chosen?.productIds.filter((id) =>
    availableProductIds.has(id)
  ).length;
  const countedInList = entries.filter((entry) =>
    availableProductIds.has(entry.productId)
  ).length;
  const recountCounted = recount
    ? entries.filter((entry) => recount.ids.includes(entry.productId)).length
    : countedInList;
  const recountComplete =
    !recount ||
    (Boolean(recount.entryIds) &&
      list !== null &&
      recount.ids.every(
        (id) =>
          availableProductIds.has(id) &&
          entries.some((entry) => entry.productId === id)
      ));
  const unavailableRecountIds =
    recount && list
      ? recount.ids.filter((id) => !availableProductIds.has(id))
      : [];
  const incompleteRecountScope = Boolean(recount && !recount.entryIds);

  const markNone = (id: string) => {
    setDraft((current) => ({ ...current, [id]: '0' }));
    setPacks((current) => {
      const remaining = { ...current };
      delete remaining[id];
      return remaining;
    });
  };

  const save = async () => {
    if (invalid.length > 0) {
      setError(
        'Hay cantidades que no se entienden. Revisá las marcadas en rojo.'
      );
      return;
    }
    if (
      !recount &&
      !window.confirm(
        `¿Guardar el conteo de ${entries.length} producto(s)? Después no se puede modificar.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setCanStartAgain(false);
    try {
      let checkId = recount?.checkId;
      if (!recount) {
        const checked = await counts.check(
          scope && listId ? { entries, listId } : { entries }
        );
        if (checked.recount.length > 0) {
          const checkedIds = new Set(entries.map((entry) => entry.productId));
          const sourceOrder =
            chosen?.productIds ?? (list ?? []).map((p) => p.id);
          const nextRecount = {
            checkId: checked.checkId,
            ids: checked.recount,
            phase: 'resetting' as const,
            entryIds: [
              ...sourceOrder.filter((id) => checkedIds.has(id)),
              ...entries
                .map((entry) => entry.productId)
                .filter((id) => !sourceOrder.includes(id)),
            ],
          };
          const nextDraft = clearDraftIds(draft, checked.recount);
          const nextPacks = clearDraftIds(packs, checked.recount);
          try {
            localStorage.setItem(RECOUNT_KEY, JSON.stringify(nextRecount));
          } catch {
            // The count can continue if storage is unavailable.
          }
          let draftsCleared = false;
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft));
            localStorage.setItem(PACKS_KEY, JSON.stringify(nextPacks));
            draftsCleared = true;
          } catch {
            // The count can continue if storage is unavailable.
          }
          setDraft(nextDraft);
          setPacks(nextPacks);
          const activeRecount = { ...nextRecount, phase: 'active' as const };
          const storedRecount = draftsCleared ? activeRecount : nextRecount;
          try {
            localStorage.setItem(RECOUNT_KEY, JSON.stringify(storedRecount));
          } catch {
            // The count can continue if storage is unavailable.
          }
          setRecount(storedRecount);
          setQuery('');
          return;
        }
        checkId = checked.checkId;
      }
      const result = await counts.create({
        ...(scope && listId ? { listId } : {}),
        entries,
        checkId,
      });
      setDraft({});
      setPacks({});
      setRecount(null);
      try {
        localStorage.removeItem(RECOUNT_KEY);
      } catch {
        // storage disabled: the finished recount state will not be removed
      }
      if (user?.role === 'owner') {
        navigate(`/panel/conteos/${result.id}`);
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(errorMessage(err));
      setCanStartAgain(Boolean(recount));
    } finally {
      setBusy(false);
    }
  };

  const startAgain = () => {
    setRecount(null);
    if (incompleteRecountScope) setListId(null);
    setError(null);
    setCanStartAgain(false);
    try {
      localStorage.removeItem(RECOUNT_KEY);
    } catch {
      // storage disabled: the recount state will not be removed
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

      {lists.length > 0 && !recount && (
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
              disabled={scanning}
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

      <Button type="button" variant="outline" className="h-12 w-full" disabled={!list || busy || scanning || incompleteRecountScope || unavailableRecountIds.length > 0} onClick={() => {scanHandled.current = false; setScanMessage(null); setScanned(null); setScanning(true);}}>Escanear</Button>
      {scanning && <BarcodeScanner onDetected={onDetected} onClose={() => {setScanning(false);}}/>}
      {scanMessage && <Notice tone="error">{scanMessage}</Notice>}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          disabled={scanning}
          type="search"
          placeholder="Buscar producto o código"
          aria-label="Buscar producto"
          className="h-12 pl-10 text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {recount && unavailableRecountIds.length > 0 && (
        <Notice>
          Algunos productos que necesitabas volver a contar ya no están
          disponibles. Empezá de nuevo para continuar.
        </Notice>
      )}
      {recount && incompleteRecountScope && (
        <Notice>
          El recuento anterior no se puede retomar con seguridad. Empezá de
          nuevo para revisar todos los productos.
        </Notice>
      )}
      {recount &&
        !error &&
        !incompleteRecountScope &&
        unavailableRecountIds.length === 0 && (
          <Notice>
            Volvé a contar {recount.ids.length}{' '}
            {recount.ids.length === 1 ? 'producto' : 'productos'}. Contalos de
            nuevo con calma.
          </Notice>
        )}
      {(canStartAgain ||
        unavailableRecountIds.length > 0 ||
        incompleteRecountScope) &&
        recount && (
          <Button type="button" variant="outline" onClick={startAgain}>
            Empezar de nuevo
          </Button>
        )}
      {!list && !error && <Notice>Cargando productos…</Notice>}
      {list && groups.length === 0 && unavailableRecountIds.length === 0 && (
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
                  <li key={p.id} className={cn("space-y-2 px-3 py-3", scanned?.productId === p.id && "ring-2 ring-primary ring-inset")}>
                    <div className="flex items-center gap-2">
                      {total !== undefined && (
                        <Check
                          aria-label={`Contado: ${p.name}`}
                          className="size-5 shrink-0 text-primary"
                        />
                      )}
                      <p className="text-base">
                        {p.name}
                        {p.code && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            #{p.code}
                          </span>
                        )}
                      </p>
                    </div>
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
                          id={`q-${p.id}`}
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`No hay ninguno: ${p.name}`}
                      onClick={() => markNone(p.id)}
                    >
                      No hay ninguno
                    </Button>
                  </li>
                );
              }
              return (
                <li
                  key={p.id}
                  className={cn("flex flex-wrap items-center gap-3 px-3 py-2", scanned?.productId === p.id && "ring-2 ring-primary ring-inset")}
                >
                  {total !== undefined && (
                    <Check
                      aria-label={`Contado: ${p.name}`}
                      className="size-5 shrink-0 text-primary"
                    />
                  )}
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`No hay ninguno: ${p.name}`}
                    onClick={() => markNone(p.id)}
                  >
                    No hay ninguno
                  </Button>
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
            {recount
              ? `Llevás ${recountCounted} de ${recount.ids.length}`
              : chosen
                ? `Llevás ${countedInList} de ${listTotal}`
                : plural(
                    entries.length,
                    'producto contado',
                    'productos contados'
                  )}
          </span>
          <Button
            className="h-12 px-6 text-lg"
            disabled={
              busy || scanning || entries.length + invalid.length === 0 || !recountComplete
            }
            onClick={() => void save()}
          >
            {busy ? 'Guardando…' : 'Guardar conteo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
