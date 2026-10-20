import type {
  CountDetail,
  CountList,
  CountRecord,
  NewCount,
  ShrinkageRow,
  User,
} from '../domain/types.js';
import { HttpError } from '../utils/httpError.js';
import logger from '../utils/logger.js';
import type { FudoProduct } from './fudoData.js';
import {
  reconcileCount,
  summarizeLines,
  type CountLine,
  type CountSummary,
  type PreviousCount,
  type StockMovement,
} from './reconcile.js';

// A previous count older than this is not trusted as a starting point
// (and would mean paging through too many sales): fall back to FUDO stock.
const MAX_PREVIOUS_AGE_MS = 45 * 24 * 60 * 60 * 1000;

export interface CountCheck {
  id: string;
  userId: string;
  createdAt: Date;
  usedAt: Date | null;
  listId: string | null;
  entries: { productId: string; counted: number }[];
  recountIds: string[];
}

export interface NewCountRow {
  checkId: string | null;
  createdBy: string;
  countedAt: Date;
  note: string | null;
  list: { id: string; name: string } | null;
  summary: CountSummary;
  lines: CountLine[];
}

export interface CountsRepo {
  insertCheck(row: {
    userId: string;
    listId: string | null;
    entries: { productId: string; counted: number }[];
    recountIds: string[];
  }): Promise<string>;
  getCheck(id: string): Promise<CountCheck | null>;
  latestByProduct(productIds: string[]): Promise<Map<string, PreviousCount>>;
  insert(row: NewCountRow): Promise<string>;
  list(limit: number): Promise<CountRecord[]>;
  get(id: string): Promise<CountDetail | null>;
  shrinkage(since: Date): Promise<ShrinkageRow[]>;
}

export interface ShortageEvent {
  countId: string;
  countedBy: string;
  countedAt: Date;
  summary: CountSummary;
  missing: Pick<
    CountLine,
    'name' | 'difference' | 'differenceValue' | 'basis' | 'previous'
  >[];
}

interface Deps {
  recountMinDifference: number;
  repo: CountsRepo;
  lists: { get(id: string): Promise<CountList | null> };
  fudo: {
    products(): Promise<FudoProduct[]>;
    movements(from: Date, to: Date): Promise<StockMovement[]>;
  };
  notify(event: ShortageEvent): Promise<void>;
  now?: () => Date;
}

async function fromFudo<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    logger.error({ err }, 'FUDO read failed');
    throw new HttpError(502, 'No se pudo leer FUDO. Probá de nuevo.');
  }
}

export function createCountsService({
  repo,
  recountMinDifference,
  lists,
  fudo,
  notify,
  now = () => new Date(),
}: Deps) {
  async function computeLines(input: NewCount, countedAt: Date) {
    const list = input.listId ? await lists.get(input.listId) : null;
    if (input.listId && !list) {
      throw new HttpError(400, 'La lista de conteo no existe');
    }
    const products = await fromFudo(() => fudo.products());
    const byId = new Map(products.map((p) => [p.id, p]));
    if (input.entries.some((e) => !byId.has(e.productId))) {
      throw new HttpError(400, 'Hay productos que no se pueden contar');
    }

    const ids = input.entries.map((e) => e.productId);
    const previous = new Map(
      [...(await repo.latestByProduct(ids))].filter(
        ([, p]) =>
          countedAt.getTime() - p.countedAt.getTime() <= MAX_PREVIOUS_AGE_MS
      )
    );

    let movements: StockMovement[] = [];
    if (previous.size > 0) {
      const from = new Date(
        Math.min(...[...previous.values()].map((p) => p.countedAt.getTime()))
      );
      movements = await fromFudo(() => fudo.movements(from, countedAt));
    }

    const lines = reconcileCount({
      now: countedAt,
      entries: input.entries,
      products: new Map(
        products.map((p) => [
          p.id,
          { name: p.name, cost: p.cost, systemStock: p.stock },
        ])
      ),
      previous,
      movements,
    });
    return { list, lines };
  }

  return {
    async check(user: User, input: NewCount) {
      const { list, lines } = await computeLines(input, now());
      const recount = lines
        .filter((line) => Math.abs(line.difference) >= recountMinDifference)
        .map((line) => line.productId);
      const checkId = await repo.insertCheck({
        userId: user.id,
        listId: list?.id ?? null,
        entries: input.entries,
        recountIds: recount,
      });
      return { checkId, recount };
    },

    async create(user: User, input: NewCount) {
      const countedAt = now();
      const check = input.checkId ? await repo.getCheck(input.checkId) : null;
      if (input.checkId) {
        if (
          !check ||
          check.userId !== user.id ||
          check.usedAt !== null ||
          countedAt.getTime() - check.createdAt.getTime() > 2 * 60 * 60 * 1000
        ) {
          throw new HttpError(400, 'El recuento venció. Volvé a empezar.');
        }
        const submitted = new Set(
          input.entries.map((entry) => entry.productId)
        );
        if (check.recountIds.some((id) => !submitted.has(id))) {
          throw new HttpError(400, 'Falta recontar productos.');
        }
        const original = new Map(
          check.entries.map((entry) => [entry.productId, entry.counted])
        );
        if (
          input.entries.length !== original.size ||
          submitted.size !== original.size ||
          [...original.keys()].some((id) => !submitted.has(id)) ||
          (input.listId ?? null) !== check.listId
        ) {
          throw new HttpError(400, 'El conteo cambió. Volvé a empezar.');
        }
        const recountIds = new Set(check.recountIds);
        if (
          input.entries.some(
            (entry) =>
              !recountIds.has(entry.productId) &&
              entry.counted !== original.get(entry.productId)
          )
        ) {
          throw new HttpError(400, 'El conteo cambió. Volvé a empezar.');
        }
      }
      const { list, lines } = await computeLines(input, countedAt);
      if (check) {
        const firstCounts = new Map(
          check.entries.map((entry) => [entry.productId, entry.counted])
        );
        const recountIds = new Set(check.recountIds);
        for (const line of lines) {
          if (recountIds.has(line.productId)) {
            line.firstCounted = firstCounts.get(line.productId) ?? null;
          }
        }
      }
      const summary = summarizeLines(lines);
      const id = await repo.insert({
        checkId: input.checkId ?? null,
        createdBy: user.id,
        countedAt,
        note: input.note || null,
        list: list ? { id: list.id, name: list.name } : null,
        summary,
        lines,
      });

      if (summary.missingUnits > 0) {
        const missing = lines
          .filter((l) => l.difference < 0)
          .sort(
            (a, b) =>
              (a.differenceValue ?? a.difference) -
              (b.differenceValue ?? b.difference)
          )
          .map(({ name, difference, differenceValue, basis, previous }) => ({
            name,
            difference,
            differenceValue,
            basis,
            previous,
          }));
        // The count is saved; a failed alert must not turn it into an error.
        await notify({
          countId: id,
          countedBy: user.name,
          countedAt,
          summary,
          missing,
        }).catch((err) => logger.error({ err }, 'Shortage alert failed'));
      }

      return { id, summary };
    },

    list: (limit: number) => repo.list(limit),
    get: (id: string) => repo.get(id),
    shrinkage: (days: number) =>
      repo.shrinkage(new Date(now().getTime() - days * 24 * 60 * 60 * 1000)),
  };
}
