// Reads products and stock movements from FUDO and maps them to our shapes.
import type { FudoClient, JsonApiResource } from './fudoClient.js';
import type { StockMovement } from './reconcile.js';

export interface FudoProduct {
  id: string;
  name: string;
  code: string | null;
  categoryId: string | null;
  cost: number | null;
  price: number | null;
  stock: number;
}

type Reader = Pick<FudoClient, 'getAll'>;

const DAY_MS = 24 * 60 * 60 * 1000;

// FUDO filters accept `YYYY-MM-DDTHH:MM:SSZ` only (no milliseconds).
export const formatFudoDate = (d: Date) =>
  d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const range = (from: Date, to: Date) =>
  `and(gte.${formatFudoDate(from)},lte.${formatFudoDate(to)})`;

const relOne = (r: JsonApiResource, name: string) => {
  const data = r.relationships?.[name]?.data;
  return data && !Array.isArray(data) ? data : null;
};

const relMany = (r: JsonApiResource, name: string) => {
  const data = r.relationships?.[name]?.data;
  return Array.isArray(data) ? data : [];
};

const index = (resources: JsonApiResource[]) =>
  new Map(resources.map((r) => [`${r.type}:${r.id}`, r]));

const num = (v: unknown) => (typeof v === 'number' ? v : null);

export function productsFromResources(
  resources: JsonApiResource[]
): FudoProduct[] {
  return resources
    .filter((p) => p.attributes?.stockControl && p.attributes?.active)
    .map((p) => {
      const a = p.attributes ?? {};
      return {
        id: p.id,
        name: String(a.name ?? ''),
        code: typeof a.code === 'string' && a.code !== '' ? a.code : null,
        categoryId: relOne(p, 'productCategory')?.id ?? null,
        cost: num(a.cost),
        price: num(a.price),
        stock: num(a.stock) ?? 0,
      };
    });
}

export function movementsFromSales(
  sales: JsonApiResource[],
  included: JsonApiResource[]
): StockMovement[] {
  const byKey = index(included);
  const movements: StockMovement[] = [];
  for (const sale of sales) {
    if (sale.attributes?.saleState === 'CANCELED') continue;
    for (const ref of relMany(sale, 'items')) {
      const item = byKey.get(`${ref.type}:${ref.id}`);
      const product = item && relOne(item, 'product');
      if (!item || !product || item.attributes?.canceled) continue;
      movements.push({
        productId: product.id,
        kind: 'sale',
        quantity: Number(item.attributes?.quantity ?? 0),
        at: new Date(String(item.attributes?.createdAt)),
      });
    }
  }
  return movements;
}

export function movementsFromExpenses(
  expenses: JsonApiResource[],
  included: JsonApiResource[]
): StockMovement[] {
  const byKey = index(included);
  const movements: StockMovement[] = [];
  for (const expense of expenses) {
    if (expense.attributes?.canceled) continue;
    const at = new Date(String(expense.attributes?.createdAt));
    for (const ref of relMany(expense, 'expenseItems')) {
      const item = byKey.get(`${ref.type}:${ref.id}`);
      const product = item && relOne(item, 'product');
      if (!item || !product || item.attributes?.canceled) continue;
      movements.push({
        productId: product.id,
        kind: 'purchase',
        quantity: Number(item.attributes?.quantity ?? 0),
        at,
      });
    }
  }
  return movements;
}

export async function fetchProducts(client: Reader): Promise<FudoProduct[]> {
  const { data } = await client.getAll('/products');
  return productsFromResources(data);
}

// Sales are filtered by their creation time, but items can be added later:
// fetch sales from one day earlier and let the reconciliation filter items
// by their own timestamp.
export async function fetchMovements(
  client: Reader,
  from: Date,
  to: Date
): Promise<StockMovement[]> {
  const sales = await client.getAll('/sales', {
    pageSize: 100,
    params: {
      'filter[createdAt]': range(new Date(from.getTime() - DAY_MS), to),
      include: 'items',
    },
  });
  const expenses = await client.getAll('/expenses', {
    pageSize: 100,
    params: {
      'filter[createdAt]': range(from, to),
      include: 'expenseItems',
      // /expenses returns ids only unless fields are requested explicitly.
      'fields[expense]': 'canceled,createdAt,expenseItems',
      'fields[expenseItem]': 'canceled,quantity,product',
    },
  });
  return [
    ...movementsFromSales(sales.data, sales.included),
    ...movementsFromExpenses(expenses.data, expenses.included),
  ];
}

export async function fetchCategories(
  client: Reader
): Promise<Map<string, string>> {
  const { data } = await client.getAll('/product-categories');
  return new Map(data.map((c) => [c.id, String(c.attributes?.name ?? '')]));
}
