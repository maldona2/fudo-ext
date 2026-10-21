import type { Pool } from 'pg';
import type { ProductBarcodesRepo } from '../../services/productBarcodes.js';

export function productBarcodesRepo(pool: Pool): ProductBarcodesRepo {
  return {
    async all() {
      const { rows } = await pool.query<{
        product_id: string;
        barcode: string;
      }>('SELECT product_id, barcode FROM product_barcodes ORDER BY barcode');
      const result = new Map<string, string[]>();
      for (const row of rows)
        result.set(row.product_id, [
          ...(result.get(row.product_id) ?? []),
          row.barcode,
        ]);
      return result;
    },
    async add({ productId, barcode }) {
      const inserted = await pool.query(
        'INSERT INTO product_barcodes (barcode, product_id) VALUES ($1, $2) ON CONFLICT (barcode) DO NOTHING',
        [barcode, productId]
      );
      if (inserted.rowCount) return 'created';
      const current = await pool.query<{ product_id: string }>(
        'SELECT product_id FROM product_barcodes WHERE barcode = $1',
        [barcode]
      );
      return current.rows[0]?.product_id === productId ? 'exists' : 'conflict';
    },
    async remove({ productId, barcode }) {
      const result = await pool.query(
        'DELETE FROM product_barcodes WHERE product_id = $1 AND barcode = $2',
        [productId, barcode]
      );
      return Boolean(result.rowCount);
    },
  };
}
