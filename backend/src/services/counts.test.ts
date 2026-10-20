import { createCountsService } from './counts.js';
import type { CountsRepo, NewCountRow } from './counts.js';
import type { FudoProduct } from './fudoData.js';
import type { StockMovement, PreviousCount } from './reconcile.js';
import type { User } from '../domain/types.js';

const NOW = new Date('2026-10-22T10:50:00Z');
const DAILY_LIST = '55555555-5555-4555-8555-555555555555';
const CHECK_ID = '77777777-7777-4777-8777-777777777777';
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
  movements: StockMovement[] = [],
  catalog: FudoProduct[] = products
) => {
  const inserted: NewCountRow[] = [];
  const movementCalls: { from: Date; to: Date }[] = [];
  const notified: unknown[] = [];
  const checks = new Map<
    string,
    {
      id: string;
      userId: string;
      listId: string | null;
      createdAt: Date;
      usedAt: Date | null;
      entries: { productId: string; counted: number }[];
      recountIds: string[];
    }
  >();
  const repo: CountsRepo = {
    insertCheck: async (row) => {
      checks.set(CHECK_ID, {
        ...row,
        id: CHECK_ID,
        createdAt: NOW,
        usedAt: null,
      });
      return CHECK_ID;
    },
    getCheck: async (id) => checks.get(id) ?? null,
    latestByProduct: async () => previous,
    insert: async (row) => {
      if (row.checkId) checks.get(row.checkId)!.usedAt = NOW;
      inserted.push(row);
      return '33333333-3333-4333-8333-333333333333';
    },
    list: async () => [],
    get: async () => null,
    shrinkage: async () => [],
  };
  const service = createCountsService({
    repo,
    recountMinDifference: 1,
    lists: {
      get: async (id) =>
        id === DAILY_LIST ? { id, name: 'Diario', productIds: ['14'] } : null,
    },
    fudo: {
      products: async () => catalog,
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
  return { service, inserted, movementCalls, notified, checks, repo };
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
      recountMinDifference: 1,
      repo: {
        insertCheck: async () => CHECK_ID,
        getCheck: async () => null,
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
      recountMinDifference: 1,
      repo: {
        insertCheck: async () => CHECK_ID,
        getCheck: async () => null,
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

describe('blind recounts', () => {
  const entries = [
    { productId: '14', counted: 8 },
    { productId: '15', counted: 30 },
  ];

  it('asks to recount only products whose difference reaches the threshold, in either direction', async () => {
    const catalog = ['10', '11', '12', '13'].map((id) => ({
      ...products[0],
      id,
      stock: 10,
    }));
    const { service, checks, inserted, notified } = setup(
      new Map(),
      [],
      catalog
    );
    const first = [10, 8, 12, 10.5].map((counted, i) => ({
      productId: catalog[i].id,
      counted,
    }));
    const result = await service.check(vanessa, {
      entries: first,
      listId: DAILY_LIST,
    });
    expect(result.recount).toEqual(['11', '12']);
    expect(checks.get(result.checkId)).toMatchObject({
      userId: vanessa.id,
      listId: DAILY_LIST,
      entries: first,
      recountIds: ['11', '12'],
    });
    expect(inserted).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('includes a difference exactly equal to the configured threshold', async () => {
    const { service } = setup();
    expect(
      (
        await service.check(vanessa, {
          entries: [{ productId: '14', counted: 11 }],
        })
      ).recount
    ).toEqual(['14']);
  });

  it('uses the same previous-count movement reconciliation as final saves', async () => {
    const previousAt = new Date(NOW.getTime() - DAY);
    const { service } = setup(
      new Map([['14', { counted: 8, countedAt: previousAt }]]),
      [{ productId: '14', kind: 'purchase', quantity: 2, at: NOW }]
    );
    expect(
      (
        await service.check(vanessa, {
          entries: [{ productId: '14', counted: 10 }],
        })
      ).recount
    ).toEqual([]);
  });

  it('preserves a first count of zero for a recounted product', async () => {
    const { service, inserted } = setup();
    const { checkId } = await service.check(vanessa, {
      entries: [{ productId: '14', counted: 0 }],
    });
    await service.create(vanessa, {
      checkId,
      entries: [{ productId: '14', counted: 2 }],
    });
    expect(inserted[0].lines[0]).toMatchObject({ firstCounted: 0, counted: 2 });
  });

  it('does not persist a check if FUDO cannot be read', async () => {
    const { repo, checks, inserted, notified } = setup();
    const service = createCountsService({
      repo,
      recountMinDifference: 1,
      lists: { get: async () => null },
      fudo: {
        products: async () => {
          throw new Error('FUDO unavailable');
        },
        movements: async () => [],
      },
      notify: async () => undefined,
    });
    await expect(service.check(vanessa, { entries })).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(checks.size).toBe(0);
    expect(inserted).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('rejects a check for a missing list or unknown product', async () => {
    const { service, checks } = setup();
    await expect(
      service.check(vanessa, { entries, listId: CHECK_ID })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.check(vanessa, { entries: [{ productId: '99', counted: 1 }] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(checks.size).toBe(0);
  });

  it('check never returns figures', async () => {
    const { service } = setup();
    const result = await service.check(vanessa, { entries });
    expect(Object.keys(result)).toEqual(['checkId', 'recount']);
    expect(result).toEqual({ checkId: CHECK_ID, recount: ['14'] });
  });

  it('stores the first count of recounted products and saves the second one as counted', async () => {
    const { service, inserted, checks } = setup();
    const { checkId } = await service.check(vanessa, { entries });
    await service.create(vanessa, {
      checkId,
      entries: [{ productId: '14', counted: 10 }, entries[1]],
    });
    expect(inserted[0].lines[0]).toMatchObject({
      counted: 10,
      firstCounted: 8,
    });
    expect(inserted[0].lines[1]).toMatchObject({
      counted: 30,
      firstCounted: null,
    });
    expect(inserted[0].checkId).toBe(checkId);
    expect(checks.get(checkId)!.usedAt).toEqual(NOW);
  });

  it.each(['another user', 'already used', 'older than 2 hours', 'missing'])(
    'rejects a check that is %s',
    async (invalid) => {
      const { service, checks, inserted } = setup();
      const { checkId } = await service.check(vanessa, { entries });
      const check = checks.get(checkId)!;
      if (invalid === 'another user') check.userId = 'other';
      if (invalid === 'already used') check.usedAt = NOW;
      if (invalid === 'older than 2 hours')
        check.createdAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000 - 1);
      if (invalid === 'missing') checks.delete(checkId);
      await expect(
        service.create(vanessa, { checkId, entries })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'El recuento venció. Volvé a empezar.',
      });
      expect(inserted).toHaveLength(0);
    }
  );

  it('accepts an unused check exactly 2 hours old', async () => {
    const { service, checks, inserted } = setup();
    const { checkId } = await service.check(vanessa, { entries });
    checks.get(checkId)!.createdAt = new Date(
      NOW.getTime() - 2 * 60 * 60 * 1000
    );
    await service.create(vanessa, { checkId, entries });
    expect(inserted).toHaveLength(1);
  });

  it('rejects a final count omitting a product requiring recount without consuming the check', async () => {
    const { service, checks, inserted } = setup();
    const { checkId } = await service.check(vanessa, { entries });
    await expect(
      service.create(vanessa, { checkId, entries: [entries[1]] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
    expect(checks.get(checkId)!.usedAt).toBeNull();
    await expect(
      service.create(vanessa, { checkId, entries })
    ).resolves.toHaveProperty('id');
  });

  it('rejects a final count that changes an unflagged product quantity', async () => {
    const { service, checks, inserted } = setup();
    const { checkId } = await service.check(vanessa, { entries });
    await expect(
      service.create(vanessa, {
        checkId,
        entries: [entries[0], { ...entries[1], counted: 31 }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
    expect(checks.get(checkId)!.usedAt).toBeNull();
  });

  it('requires the final count to have the exact original product set', async () => {
    const { service, checks, inserted } = setup();
    const { checkId } = await service.check(vanessa, { entries });
    await expect(
      service.create(vanessa, { checkId, entries: [entries[0]] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
    expect(checks.get(checkId)!.usedAt).toBeNull();
  });

  it('requires the final count to use the original list scope', async () => {
    const { service, checks, inserted } = setup();
    const { checkId } = await service.check(vanessa, {
      entries,
      listId: DAILY_LIST,
    });
    await expect(
      service.create(vanessa, { checkId, entries })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(inserted).toHaveLength(0);
    expect(checks.get(checkId)!.usedAt).toBeNull();
  });

  it('saves without check when no checkId is sent', async () => {
    const { service, inserted } = setup();
    await service.create(vanessa, { entries });
    expect(inserted[0].checkId).toBeNull();
    expect(inserted[0].lines.every((line) => line.firstCounted === null)).toBe(
      true
    );
  });
});
