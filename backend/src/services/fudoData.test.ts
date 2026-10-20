import {
  fetchMovements,
  formatFudoDate,
  movementsFromExpenses,
  movementsFromSales,
  productsFromResources,
} from './fudoData.js';
import type { JsonApiResource } from './fudoClient.js';

const item = (
  id: string,
  productId: string | null,
  quantity: number,
  createdAt: string,
  canceled: boolean | null = null
): JsonApiResource => ({
  type: 'Item',
  id,
  attributes: { quantity, createdAt, canceled },
  relationships: {
    product: { data: productId ? { type: 'Product', id: productId } : null },
  },
});

const sale = (id: string, state: string, items: string[]): JsonApiResource => ({
  type: 'Sale',
  id,
  attributes: { saleState: state },
  relationships: {
    items: { data: items.map((i) => ({ type: 'Item', id: i })) },
  },
});

describe('movementsFromSales', () => {
  it('turns each live item of a live sale into a sale movement at the item time', () => {
    const movements = movementsFromSales(
      [sale('1', 'CLOSED', ['a', 'b'])],
      [
        item('a', '14', 6, '2026-10-18T14:31:44Z'),
        item('b', '13', 2, '2026-10-18T14:35:00Z'),
      ]
    );

    expect(movements).toEqual([
      {
        productId: '14',
        kind: 'sale',
        quantity: 6,
        at: new Date('2026-10-18T14:31:44Z'),
      },
      {
        productId: '13',
        kind: 'sale',
        quantity: 2,
        at: new Date('2026-10-18T14:35:00Z'),
      },
    ]);
  });

  it('skips canceled items, canceled sales and items without product', () => {
    const movements = movementsFromSales(
      [sale('1', 'CLOSED', ['a', 'b']), sale('2', 'CANCELED', ['c'])],
      [
        item('a', '14', 6, '2026-10-18T14:31:44Z', true),
        item('b', null, 1, '2026-10-18T14:31:44Z'),
        item('c', '14', 3, '2026-10-18T14:31:44Z'),
      ]
    );

    expect(movements).toEqual([]);
  });
});

describe('movementsFromExpenses', () => {
  it('turns live expense items into purchase movements at the expense time', () => {
    const expenses: JsonApiResource[] = [
      {
        type: 'Expense',
        id: '3621',
        attributes: { canceled: null, createdAt: '2026-10-18T12:00:00Z' },
        relationships: {
          expenseItems: {
            data: [
              { type: 'ExpenseItem', id: 'x' },
              { type: 'ExpenseItem', id: 'y' },
            ],
          },
        },
      },
      {
        type: 'Expense',
        id: '3622',
        attributes: { canceled: true, createdAt: '2026-10-18T12:00:00Z' },
        relationships: {
          expenseItems: { data: [{ type: 'ExpenseItem', id: 'z' }] },
        },
      },
    ];
    const included: JsonApiResource[] = [
      {
        type: 'ExpenseItem',
        id: 'x',
        attributes: { quantity: 120, canceled: null },
        relationships: { product: { data: { type: 'Product', id: '14' } } },
      },
      {
        type: 'ExpenseItem',
        id: 'y',
        attributes: { quantity: 4, canceled: true },
        relationships: { product: { data: { type: 'Product', id: '20' } } },
      },
      {
        type: 'ExpenseItem',
        id: 'z',
        attributes: { quantity: 9, canceled: null },
        relationships: { product: { data: { type: 'Product', id: '14' } } },
      },
    ];

    expect(movementsFromExpenses(expenses, included)).toEqual([
      {
        productId: '14',
        kind: 'purchase',
        quantity: 120,
        at: new Date('2026-10-18T12:00:00Z'),
      },
    ]);
  });
});

describe('productsFromResources', () => {
  it('keeps only active products with stock control and normalizes numbers', () => {
    const products = productsFromResources([
      {
        type: 'Product',
        id: '14',
        attributes: {
          name: 'Carne suave',
          code: '51',
          cost: 700,
          price: 2200,
          stock: 227,
          stockControl: true,
          active: true,
        },
        relationships: {
          productCategory: { data: { type: 'ProductCategory', id: '3' } },
        },
      },
      {
        type: 'Product',
        id: '15',
        attributes: { name: 'Sin control', stockControl: false, active: true },
      },
      {
        type: 'Product',
        id: '16',
        attributes: { name: 'Inactivo', stockControl: true, active: false },
      },
      {
        type: 'Product',
        id: '17',
        attributes: {
          name: 'Sin costo',
          code: '',
          cost: null,
          stock: null,
          stockControl: true,
          active: true,
        },
      },
    ]);

    expect(products).toEqual([
      {
        id: '14',
        name: 'Carne suave',
        code: '51',
        categoryId: '3',
        cost: 700,
        price: 2200,
        stock: 227,
      },
      {
        id: '17',
        name: 'Sin costo',
        code: null,
        categoryId: null,
        cost: null,
        price: null,
        stock: 0,
      },
    ]);
  });
});

describe('formatFudoDate', () => {
  it('formats as UTC without milliseconds, as FUDO filters require', () => {
    expect(formatFudoDate(new Date('2026-10-18T14:31:44.123Z'))).toBe(
      '2026-10-18T14:31:44Z'
    );
  });
});

describe('fetchMovements', () => {
  it('queries sales from one day earlier and expenses from the exact start', async () => {
    const requests: { path: string; params: Record<string, string> }[] = [];
    const client = {
      getAll: async (
        path: string,
        opts: { params?: Record<string, string> } = {}
      ) => {
        requests.push({ path, params: opts.params ?? {} });
        return { data: [], included: [] };
      },
    };

    await fetchMovements(
      client,
      new Date('2026-10-19T10:50:00Z'),
      new Date('2026-10-22T10:50:00Z')
    );

    const sales = requests.find((r) => r.path === '/sales');
    const expenses = requests.find((r) => r.path === '/expenses');
    expect(sales?.params['filter[createdAt]']).toBe(
      'and(gte.2026-10-18T10:50:00Z,lte.2026-10-22T10:50:00Z)'
    );
    expect(expenses?.params['filter[createdAt]']).toBe(
      'and(gte.2026-10-19T10:50:00Z,lte.2026-10-22T10:50:00Z)'
    );
    // /expenses returns ids only unless fields are requested explicitly.
    expect(expenses?.params['fields[expenseItem]']).toContain('quantity');
  });
});
