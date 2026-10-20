import { createCountsService } from './counts.js';
import type { CountsRepo, NewCountRow } from './counts.js';
import type { FudoProduct } from './fudoData.js';
import type { StockMovement, PreviousCount } from './reconcile.js';
import type { User } from '../domain/types.js';

const NOW = new Date('2026-10-22T10:50:00Z');
const DAILY_LIST = '55555555-5555-4555-8555-555555555555';
const DAY = 24 * 60 * 60 * 1000;

const vanessa: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'vanessa@loshornos.com',
  name: 'Vanessa',
  role: 'counter',
  active: true,
};

const products: FudoProduct[] = [
  {
    id: '14',
    name: 'Carne suave',
    code: '51',
    categoryId: '6',
    cost: 700,
    price: 2200,
    stock: 12,
  },
  {
    id: '15',
    name: 'Pollo',
    code: '53',
    categoryId: '6',
    cost: 650,
    price: 2200,
    stock: 30,
  },
];

const setup = (
  previous: Map<string, PreviousCount> = new Map(),
  movements: StockMovement[] = []
) => {
  const inserted: NewCountRow[] = [];
  const movementCalls: { from: Date; to: Date }[] = [];
  const notified: unknown[] = [];
  const repo: CountsRepo = {
    latestByProduct: async () => previous,
    insert: async (row) => {
      inserted.push(row);
      return '33333333-3333-4333-8333-333333333333';
    },
    list: async () => [],
    get: async () => null,
    shrinkage: async () => [],
  };
  const service = createCountsService({
    repo,
    lists: {
      get: async (id) =>
        id === DAILY_LIST ? { id, name: 'Diario', productIds: ['14'] } : null,
    },
    fudo: {
      products: async () => products,
      movements: async (from, to) => {
        movementCalls.push({ from, to });
        return movements;
      },
    },
    notify: async (event) => {
      notified.push(event);
    },
    now: () => NOW,
  });
  return { service, inserted, movementCalls, notified };
};

describe('counts service', () => {
  it('rejects a count with a product FUDO does not list for counting', async () => {
    const { service, inserted } = setup();

    await expect(
      service.create(vanessa, { entries: [{ productId: '99', counted: 1 }] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
  });

  it('compares a first count against the FUDO stock and does not read movements', async () => {
    const { service, inserted, movementCalls } = setup();

    const result = await service.create(vanessa, {
      entries: [{ productId: '14', counted: 10 }],
    });

    expect(movementCalls).toHaveLength(0);
    expect(result.summary.missingUnits).toBe(2);
    expect(inserted[0].lines[0]).toMatchObject({
      basis: 'system',
      expected: 12,
      difference: -2,
    });
    expect(inserted[0].createdBy).toBe(vanessa.id);
    expect(inserted[0].countedAt).toEqual(NOW);
  });

  it('reads movements from the oldest previous count up to now', async () => {
    const previous = new Map<string, PreviousCount>([
      ['14', { counted: 40, countedAt: new Date(NOW.getTime() - 3 * DAY) }],
      ['15', { counted: 20, countedAt: new Date(NOW.getTime() - 1 * DAY) }],
    ]);
    const { service, movementCalls, inserted } = setup(previous, [
      {
        productId: '14',
        kind: 'sale',
        quantity: 28,
        at: new Date(NOW.getTime() - 2 * DAY),
      },
    ]);

    await service.create(vanessa, {
      entries: [
        { productId: '14', counted: 10 },
        { productId: '15', counted: 20 },
      ],
    });

    expect(movementCalls).toEqual([
      { from: new Date(NOW.getTime() - 3 * DAY), to: NOW },
    ]);
    expect(inserted[0].lines[0]).toMatchObject({
      basis: 'previous_count',
      expected: 12,
      difference: -2,
    });
  });

  it('ignores a previous count older than 45 days and uses the FUDO stock', async () => {
    const previous = new Map<string, PreviousCount>([
      ['14', { counted: 40, countedAt: new Date(NOW.getTime() - 46 * DAY) }],
    ]);
    const { service, movementCalls, inserted } = setup(previous);

    await service.create(vanessa, {
      entries: [{ productId: '14', counted: 10 }],
    });

    expect(movementCalls).toHaveLength(0);
    expect(inserted[0].lines[0].basis).toBe('system');
  });

  it('notifies only when something is missing', async () => {
    const short = setup();
    await short.service.create(vanessa, {
      entries: [{ productId: '14', counted: 10 }],
    });
    const exact = setup();
    await exact.service.create(vanessa, {
      entries: [{ productId: '14', counted: 12 }],
    });

    expect(short.notified).toHaveLength(1);
    expect(short.notified[0]).toMatchObject({
      countedBy: 'Vanessa',
      missing: [
        { name: 'Carne suave', difference: -2, differenceValue: -1400 },
      ],
    });
    expect(exact.notified).toHaveLength(0);
  });

  it('still saves the count when the notification fails', async () => {
    const { service, inserted } = setup();
    const failing = createCountsService({
      repo: {
        latestByProduct: async () => new Map(),
        insert: async (row) => {
          inserted.push(row);
          return 'id';
        },
        list: async () => [],
        get: async () => null,
        shrinkage: async () => [],
      },
      lists: { get: async () => null },
      fudo: { products: async () => products, movements: async () => [] },
      notify: async () => {
        throw new Error('telegram down');
      },
      now: () => NOW,
    });
    void service;

    await expect(
      failing.create(vanessa, { entries: [{ productId: '14', counted: 10 }] })
    ).resolves.toMatchObject({ id: 'id' });
    expect(inserted).toHaveLength(1);
  });

  it('fails the count when FUDO cannot be read, saving nothing', async () => {
    const inserted: NewCountRow[] = [];
    const service = createCountsService({
      repo: {
        latestByProduct: async () => new Map(),
        insert: async (row) => {
          inserted.push(row);
          return 'id';
        },
        list: async () => [],
        get: async () => null,
        shrinkage: async () => [],
      },
      lists: { get: async () => null },
      fudo: {
        products: async () => {
          throw new Error('FUDO HTTP 503');
        },
        movements: async () => [],
      },
      notify: async () => undefined,
      now: () => NOW,
    });

    await expect(
      service.create(vanessa, { entries: [{ productId: '14', counted: 10 }] })
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(inserted).toHaveLength(0);
  });

  it('records the list a count was made with, by id and name', async () => {
    const { service, inserted } = setup();

    await service.create(vanessa, {
      entries: [{ productId: '14', counted: 12 }],
      listId: DAILY_LIST,
    });

    expect(inserted[0].list).toEqual({ id: DAILY_LIST, name: 'Diario' });
  });

  it('records a free count without a list', async () => {
    const { service, inserted } = setup();

    await service.create(vanessa, {
      entries: [{ productId: '14', counted: 12 }],
    });

    expect(inserted[0].list).toBeNull();
  });

  it('rejects a count tied to a list that does not exist', async () => {
    const { service, inserted } = setup();

    await expect(
      service.create(vanessa, {
        entries: [{ productId: '14', counted: 12 }],
        listId: '66666666-6666-4666-8666-666666666666',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
  });
});
