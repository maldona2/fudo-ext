import type { ProductBarcode } from '../domain/types.js';
import { normalizeBarcode } from '../domain/barcodes.js';
import { HttpError } from '../utils/httpError.js';

export interface ProductBarcodesRepo {
  all(): Promise<Map<string, string[]>>;
  add(value: ProductBarcode): Promise<'created' | 'exists' | 'conflict'>;
  remove(value: ProductBarcode): Promise<boolean>;
}

export function createProductBarcodesService({ repo, countableProductIds }: {
  repo: ProductBarcodesRepo;
  countableProductIds(): Promise<Set<string>>;
}) {
  const canonical = (value: ProductBarcode): ProductBarcode => {
    const barcode = normalizeBarcode(value.barcode);
    if (!barcode || !/^\d{1,10}$/.test(value.productId)) throw new HttpError(400, 'Código inválido');
    return { productId: value.productId, barcode };
  };
  return {
    async add(value: ProductBarcode): Promise<void> {
      const normalized = canonical(value);
      if (!(await countableProductIds()).has(normalized.productId)) throw new HttpError(400, 'El producto no se puede contar');
      if (await repo.add(normalized) === 'conflict') throw new HttpError(409, 'Este código ya está asociado a otro producto.');
    },
    async remove(value: ProductBarcode): Promise<void> {
      if (!await repo.remove(canonical(value))) throw new HttpError(404, 'Asociación no encontrada');
    },
  };
}
