import type { ProductPack } from '../domain/types.js';
import { HttpError } from '../utils/httpError.js';

export interface ProductPacksRepo {
  all(): Promise<Map<string, { units: number; label: string }>>;
  upsert(packs: ProductPack[]): Promise<void>;
  remove(productId: string): Promise<boolean>;
}

interface Deps {
  repo: ProductPacksRepo;
  countableProductIds(): Promise<Set<string>>;
}

export function createProductPacksService({ repo, countableProductIds }: Deps) {
  return {
    async upsert(packs: ProductPack[]): Promise<void> {
      const countable = await countableProductIds();
      if (packs.some((pack) => !countable.has(pack.productId))) {
        throw new HttpError(400, 'Hay productos que no se pueden contar');
      }
      await repo.upsert(packs);
    },
    remove: (productId: string) => repo.remove(productId),
  };
}
