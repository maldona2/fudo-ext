import type { CountList, CountListInput } from '../domain/types.js';
import { HttpError } from '../utils/httpError.js';

export interface CountListsRepo {
  list(): Promise<CountList[]>;
  get(id: string): Promise<CountList | null>;
  insert(input: CountListInput): Promise<CountList>;
  update(id: string, input: CountListInput): Promise<CountList | null>;
  remove(id: string): Promise<boolean>;
}

interface Deps {
  repo: CountListsRepo;
  // Ids FUDO currently offers for counting (active, with stock control).
  countableProductIds(): Promise<Set<string>>;
}

export function createCountListsService({ repo, countableProductIds }: Deps) {
  const check = async (input: CountListInput) => {
    const countable = await countableProductIds();
    if (input.productIds.some((id) => !countable.has(id))) {
      throw new HttpError(400, 'Hay productos que no se pueden contar');
    }
  };

  const saving = async <T>(save: () => Promise<T>) => {
    try {
      return await save();
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Ya existe una lista con ese nombre');
      }
      throw err;
    }
  };

  return {
    // A product removed or deactivated in FUDO silently drops out of lists.
    async list() {
      const [lists, countable] = await Promise.all([
        repo.list(),
        countableProductIds(),
      ]);
      return lists.map((l) => ({
        ...l,
        productIds: l.productIds.filter((id) => countable.has(id)),
      }));
    },

    async create(input: CountListInput) {
      await check(input);
      return saving(() => repo.insert(input));
    },

    async update(id: string, input: CountListInput) {
      await check(input);
      return saving(() => repo.update(id, input));
    },

    remove: (id: string) => repo.remove(id),
  };
}
