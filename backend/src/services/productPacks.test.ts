import { createProductPacksService } from './productPacks.js';
import type { ProductPacksRepo } from './productPacks.js';
import type { ProductPack } from '../domain/types.js';

const countable = ['13', '14', '16'];

const setup = (overrides: Partial<ProductPacksRepo> = {}) => {
  const saved: ProductPack[][] = [];
  const repo: ProductPacksRepo = {
    all: async () => new Map(),
    upsert: async (packs) => {
      saved.push(packs);
    },
    remove: async (id) => id === '14',
    ...overrides,
  };
  const service = createProductPacksService({
    repo,
    countableProductIds: async () => new Set(countable),
  });
  return { service, saved };
};

describe('product packs service', () => {
  it('rejects packs for products that FUDO does not offer for counting', async () => {
    const { service, saved } = setup();
    await expect(
      service.upsert([{ productId: '999', units: 24, label: 'cajón' }])
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(saved).toHaveLength(0);
  });

  it('saves valid packs', async () => {
    const { service, saved } = setup();
    await service.upsert([{ productId: '14', units: 24, label: 'cajón' }]);
    expect(saved).toEqual([[{ productId: '14', units: 24, label: 'cajón' }]]);
  });

  it('passes a missing pack removal through', async () => {
    const { service } = setup();
    await expect(service.remove('999')).resolves.toBe(false);
  });

  it('propagates repository failures', async () => {
    const failure = new Error('database unavailable');
    const { service } = setup({
      upsert: async () => {
        throw failure;
      },
    });
    await expect(
      service.upsert([{ productId: '14', units: 24, label: 'cajón' }])
    ).rejects.toBe(failure);
  });
});
