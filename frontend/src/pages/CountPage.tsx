import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/Notice';
import { useAuth } from '@/contexts/AuthContext';
import { counts, errorMessage, products as productsApi } from '@/lib/api';
import { plural } from '@/lib/format';
import {
  draftToEntries,
  parseQuantity,
  type CountDraft,
} from '@/lib/countDraft';
import type { CountProduct } from '@/types/api';

// The draft survives a reload or a locked phone. It only holds what was
// typed (no system figures), so browser storage is acceptable here.
const DRAFT_KEY = 'count-draft';

const loadDraft = (): CountDraft => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as CountDraft;
  } catch {
    return {};
  }
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<CountProduct[] | null>(null);
  const [draft, setDraft] = useState<CountDraft>(loadDraft);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    productsApi
      .listForCount()
      .then(setList)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage full or disabled: the draft just will not survive a reload
    }
  }, [draft]);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const visible = (list ?? []).filter(
      (p) => !q || normalize(p.name).includes(q) || p.code === q
    );
    const byCategory = new Map<string, CountProduct[]>();
    for (const p of visible) {
      const key = p.category ?? 'Sin categoría';
      byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
    }
    return [...byCategory];
  }, [list, query]);

  const { entries, invalid } = draftToEntries(draft);

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
      const result = await counts.create({ entries });
      setDraft({});
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
              const bad = Number.isNaN(parseQuantity(value) ?? 0);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
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
