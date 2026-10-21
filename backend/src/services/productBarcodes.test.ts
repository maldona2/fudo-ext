import {
  createProductBarcodesService,
  type ProductBarcodesRepo,
} from './productBarcodes.js';

describe('barcode associations', () => {
  const setup = () => {
    const stored = new Map<string, string>();
    const repo: ProductBarcodesRepo = {
      all: async () => new Map(),
      add: async ({ barcode, productId }) => {
        const previous = stored.get(barcode);
        if (previous) return previous === productId ? 'exists' : 'conflict';
        stored.set(barcode, productId);
        return 'created';
      },
      remove: async ({ barcode, productId }) =>
        stored.get(barcode) === productId && stored.delete(barcode),
    };
    return {
      repo,
      service: createProductBarcodesService({
        repo,
        countableProductIds: async () => new Set(['14', '16']),
      }),
    };
  };
  it('canonicalizes UPC and prevents assigning its EAN equivalent to another product', async () => {
    const { service } = setup();
    await service.add({ productId: '14', barcode: '036000291452' });
    await service.add({ productId: '14', barcode: '0036000291452' });
    await expect(
      service.add({ productId: '16', barcode: '0036000291452' })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.remove({ productId: '16', barcode: '0036000291452' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await service.remove({ productId: '14', barcode: '036000291452' });
  });
  it('rejects invalid identifiers and unavailable products', async () => {
    const { service } = setup();
    await expect(
      service.add({ productId: '14', barcode: 'bad' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.add({ productId: '999', barcode: '2000000000015' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it('propagates storage and catalog failures to the generic HTTP error handler', async () => {
    const { service, repo } = setup();
    repo.add = async () => {
      throw new Error('db unavailable');
    };
    await expect(
      service.add({ productId: '14', barcode: '2000000000015' })
    ).rejects.toThrow('db unavailable');
    const unavailable = createProductBarcodesService({
      repo,
      countableProductIds: async () => {
        throw new Error('catalog unavailable');
      },
    });
    await expect(
      unavailable.add({ productId: '14', barcode: '2000000000015' })
    ).rejects.toThrow('catalog unavailable');
  });
});
