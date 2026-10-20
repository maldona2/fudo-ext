import type { Pool } from 'pg';
import type { ProductPacksRepo } from '../../services/productPacks.js';
import { inTransaction } from './tx.js';

interface PackRow {
  product_id: string;
  units: number;
  label: string;
}

export function productPacksRepo(pool: Pool): ProductPacksRepo {
  return {
    async all() {
      const { rows } = await pool.query<PackRow>(
        'SELECT product_id, units, label FROM product_packs'
      );
      return new Map(
        rows.map((row) => [
          row.product_id,
          {
            units: row.units,
            label: row.label,
          },
        ])
      );
    },
    upsert: (packs) =>
      inTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO product_packs (product_id, units, label)
         SELECT unnest($1::text[]), unnest($2::int[]), unnest($3::text[])
         ON CONFLICT (product_id) DO UPDATE
           SET units = EXCLUDED.units, label = EXCLUDED.label, updated_at = now()`,
          [
            packs.map((pack) => pack.productId),
            packs.map((pack) => pack.units),
            packs.map((pack) => pack.label),
          ]
        );
      }),
    async remove(productId) {
      const { rowCount } = await pool.query(
        'DELETE FROM product_packs WHERE product_id = $1',
        [productId]
      );
      return Boolean(rowCount);
    },
  };
}
