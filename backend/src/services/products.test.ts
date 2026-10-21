import { createProductsService } from './products.js';
import type { FudoProduct } from './fudoData.js';

const product = (
  id: string,
  name: string,
  categoryId: string | null
): FudoProduct => ({
  id,
  name,
  code: null,
  categoryId,
  cost: 100,
  price: 200,
  stock: 5,
});

describe('products service', () => {
  it('lists products sorted by category then name, with the category name', async () => {
    const service = createProductsService({
      products: async () => [
        product('2', 'Pollo', '6'),
        product('3', 'Coca 1.5L', '7'),
        product('1', 'Carne suave', '6'),
        product('4', 'Sin categoría', null),
      ],
      categories: async () =>
        new Map([
          ['6', 'Empanadas'],
          ['7', 'Bebidas'],
        ]),
      packs: async () => new Map(),
    });

    const list = await service.listForCount();

    expect(list.map((p) => [p.category, p.name])).toEqual([
      ['Bebidas', 'Coca 1.5L'],
      ['Empanadas', 'Carne suave'],
      ['Empanadas', 'Pollo'],
      [null, 'Sin categoría'],
    ]);
  });

  it('reuses the FUDO answer for 5 minutes', async () => {
    let calls = 0;
    let now = 0;
    const service = createProductsService({
      products: async () => {
        calls += 1;
        return [product('1', 'Carne suave', null)];
      },
      categories: async () => new Map(),
      packs: async () => new Map(),
      now: () => now,
    });

    await service.listForCount();
    now = 4 * 60 * 1000;
    await service.listForCount();
    now = 6 * 60 * 1000;
    await service.listForCount();

    expect(calls).toBe(2);
  });

  it('adds the pack to each product and reads packs fresh even when the product list is cached', async () => {
    let packs = new Map<string, { units: number; label: string }>();
    const service = createProductsService({
      products: async () => [
        product('13', 'Agua', null),
        product('14', 'Gaseosa', null),
      ],
      categories: async () => new Map(),
      packs: async () => packs,
      now: () => 0,
    });

    expect(await service.listForCount()).toEqual([
      expect.objectContaining({ id: '13', pack: null }),
      expect.objectContaining({ id: '14',
          barcodes: [], pack: null }),
    ]);
    packs = new Map([['14', { units: 24, label: 'cajón' }]]);
    expect(await service.listForCount()).toEqual([
      expect.objectContaining({ id: '13', pack: null }),
      expect.objectContaining({
        id: '14',
          barcodes: [],
        pack: { units: 24, label: 'cajón' },
      }),
    ]);
  });
});


it('refreshes barcodes independently of the FUDO catalog cache', async () => {
  let values = ['2000000000015'];
  const service = createProductsService({
    products: async () => [{ id:'14', name:'A', code:null, categoryId:null, cost:null, price:null, stock:0 }],
    categories: async () => new Map(), packs: async () => new Map(),
    barcodes: async () => new Map([['14', values], ['999', ['2000000000022']]]),
  });
  expect((await service.listForCount())[0].barcodes).toEqual(values);
  values = [];
  const list = await service.listForCount();
  expect(list[0].barcodes).toEqual([]);
  expect(list).toHaveLength(1);
});
