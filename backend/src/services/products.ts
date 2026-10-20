import type { CountProduct } from '../domain/types.js';
import type { FudoProduct } from './fudoData.js';

const CACHE_MS = 5 * 60 * 1000;

interface Deps {
  products(): Promise<FudoProduct[]>;
  categories(): Promise<Map<string, string>>;
  packs(): Promise<Map<string, { units: number; label: string }>>;
  now?: () => number;
}

// List shown on the count screen. Cached briefly: it only drives the form,
// the count itself re-reads FUDO when it is saved.
export function createProductsService({
  products,
  categories,
  packs,
  now = Date.now,
}: Deps) {
  let cache: { at: number; list: Omit<CountProduct, 'pack'>[] } | null = null;

  return {
    async listForCount(): Promise<CountProduct[]> {
      if (!cache || now() - cache.at >= CACHE_MS) {
        const [items, names] = await Promise.all([products(), categories()]);
        const list = items
          .map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            category: (p.categoryId && names.get(p.categoryId)) || null,
          }))
          .sort(
            (a, b) =>
              (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0) ||
              (a.category ?? '').localeCompare(b.category ?? '', 'es') ||
              a.name.localeCompare(b.name, 'es')
          );
        cache = { at: now(), list };
      }
      const currentPacks = await packs();
      return cache.list.map((item) => ({
        ...item,
        pack: currentPacks.get(item.id) ?? null,
      }));
    },
  };
}
