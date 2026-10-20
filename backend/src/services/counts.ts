import type {
  CountDetail,
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

export interface NewCountRow {
  createdBy: string;
  countedAt: Date;
  note: string | null;
  summary: CountSummary;
  lines: CountLine[];
}

export interface CountsRepo {
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
  repo: CountsRepo;
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
  fudo,
  notify,
  now = () => new Date(),
}: Deps) {
  return {
    async create(user: User, input: NewCount) {
      const countedAt = now();
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
      const summary = summarizeLines(lines);
      const id = await repo.insert({
        createdBy: user.id,
        countedAt,
        note: input.note || null,
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
