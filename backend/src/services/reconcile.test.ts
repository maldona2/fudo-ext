import { reconcileCount, summarizeLines } from './reconcile.js';
import type { ReconcileInput } from './reconcile.js';

const at = (iso: string) => new Date(iso);

const base = (): ReconcileInput => ({
  now: at('2026-10-22T10:50:00Z'),
  entries: [{ productId: '14', counted: 10 }],
  products: new Map([
    ['14', { name: 'Carne suave', cost: 700, systemStock: 12 }],
  ]),
  previous: new Map([
    ['14', { counted: 40, countedAt: at('2026-10-19T10:50:00Z') }],
  ]),
  movements: [],
});

describe('reconcileCount', () => {
  it('expects previous count plus purchases minus sales since that count', () => {
    const input = base();
    input.movements = [
      {
        productId: '14',
        kind: 'purchase',
        quantity: 120,
        at: at('2026-10-20T12:00:00Z'),
      },
      {
        productId: '14',
        kind: 'sale',
        quantity: 148,
        at: at('2026-10-21T20:00:00Z'),
      },
    ];

    const [line] = reconcileCount(input);

    expect(line.basis).toBe('previous_count');
    expect(line.bought).toBe(120);
    expect(line.sold).toBe(148);
    expect(line.expected).toBe(12);
    expect(line.difference).toBe(-2);
    expect(line.differenceValue).toBe(-1400);
  });

  it('ignores movements at or before the previous count and after now', () => {
    const input = base();
    input.movements = [
      {
        productId: '14',
        kind: 'sale',
        quantity: 5,
        at: at('2026-10-19T10:50:00Z'),
      },
      {
        productId: '14',
        kind: 'sale',
        quantity: 7,
        at: at('2026-10-22T10:50:01Z'),
      },
      {
        productId: '14',
        kind: 'sale',
        quantity: 30,
        at: at('2026-10-20T10:00:00Z'),
      },
    ];

    const [line] = reconcileCount(input);

    expect(line.sold).toBe(30);
    expect(line.expected).toBe(10);
    expect(line.difference).toBe(0);
  });

  it('ignores movements of other products', () => {
    const input = base();
    input.movements = [
      {
        productId: '99',
        kind: 'sale',
        quantity: 30,
        at: at('2026-10-20T10:00:00Z'),
      },
    ];

    const [line] = reconcileCount(input);

    expect(line.sold).toBe(0);
    expect(line.difference).toBe(-30);
  });

  it('compares against the FUDO stock when the product was never counted', () => {
    const input = base();
    input.previous = new Map();

    const [line] = reconcileCount(input);

    expect(line.basis).toBe('system');
    expect(line.previous).toBeNull();
    expect(line.expected).toBe(12);
    expect(line.difference).toBe(-2);
  });

  it('reports a surplus as a positive difference', () => {
    const input = base();
    input.entries = [{ productId: '14', counted: 45 }];

    const [line] = reconcileCount(input);

    expect(line.difference).toBe(5);
    expect(line.differenceValue).toBe(3500);
  });

  it('leaves the money value empty when the product has no cost', () => {
    const input = base();
    input.products = new Map([
      ['14', { name: 'Carne suave', cost: null, systemStock: 12 }],
    ]);

    const [line] = reconcileCount(input);

    expect(line.difference).toBe(-30);
    expect(line.differenceValue).toBeNull();
  });

  it('does not produce floating point noise on fractional quantities', () => {
    const input = base();
    input.entries = [{ productId: '14', counted: 0.3 }];
    input.previous = new Map([
      ['14', { counted: 0.1, countedAt: at('2026-10-19T10:50:00Z') }],
    ]);
    input.movements = [
      {
        productId: '14',
        kind: 'purchase',
        quantity: 0.2,
        at: at('2026-10-20T10:00:00Z'),
      },
    ];

    const [line] = reconcileCount(input);

    expect(line.expected).toBe(0.3);
    expect(line.difference).toBe(0);
  });

  it('throws when an entry references a product that is not known', () => {
    const input = base();
    input.entries = [{ productId: '404', counted: 1 }];

    expect(() => reconcileCount(input)).toThrow('Unknown product 404');
  });
});

describe('summarizeLines', () => {
  it('adds shortages and surpluses separately, in units and money', () => {
    const input = base();
    input.entries = [
      { productId: '14', counted: 10 },
      { productId: '13', counted: 25 },
      { productId: '15', counted: 8 },
    ];
    input.products = new Map([
      ['14', { name: 'Carne suave', cost: 700, systemStock: 12 }],
      ['13', { name: 'Carne picante', cost: 700, systemStock: 20 }],
      ['15', { name: 'Pollo', cost: 650, systemStock: 8 }],
    ]);
    input.previous = new Map();

    const summary = summarizeLines(reconcileCount(input));

    expect(summary).toEqual({
      products: 3,
      withDifference: 2,
      missingUnits: 2,
      missingValue: 1400,
      surplusUnits: 5,
      surplusValue: 3500,
    });
  });
});
