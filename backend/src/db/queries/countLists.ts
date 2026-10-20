import type { Pool, PoolClient } from 'pg';
import type { CountList } from '../../domain/types.js';
import type { CountListsRepo } from '../../services/countLists.js';
import { inTransaction } from './tx.js';

interface ListRow {
  id: string;
  name: string;
  product_ids: string[] | null;
}

const SELECT_LISTS = `
  SELECT l.id, l.name,
         array_agg(p.product_id ORDER BY p.position, p.product_id)
           FILTER (WHERE p.product_id IS NOT NULL) AS product_ids
    FROM count_lists l
    LEFT JOIN count_list_products p ON p.list_id = l.id`;

const toList = (r: ListRow): CountList => ({
  id: r.id,
  name: r.name,
  productIds: r.product_ids ?? [],
});

const replaceProducts = async (
  client: PoolClient,
  listId: string,
  productIds: string[]
) => {
  await client.query(`DELETE FROM count_list_products WHERE list_id = $1`, [
    listId,
  ]);
  await client.query(
    `INSERT INTO count_list_products (list_id, product_id, position)
     SELECT $1, id, ord
       FROM unnest($2::text[]) WITH ORDINALITY AS t(id, ord)`,
    [listId, productIds]
  );
};

export function countListsRepo(pool: Pool): CountListsRepo {
  return {
    async list() {
      const { rows } = await pool.query<ListRow>(
        `${SELECT_LISTS} GROUP BY l.id ORDER BY lower(l.name)`
      );
      return rows.map(toList);
    },

    async get(id) {
      const { rows } = await pool.query<ListRow>(
        `${SELECT_LISTS} WHERE l.id = $1 GROUP BY l.id`,
        [id]
      );
      return rows[0] ? toList(rows[0]) : null;
    },

    insert: ({ name, productIds }) =>
      inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO count_lists (name) VALUES ($1) RETURNING id`,
          [name]
        );
        await replaceProducts(client, rows[0].id, productIds);
        return { id: rows[0].id, name, productIds };
      }),

    update: (id, { name, productIds }) =>
      inTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          `UPDATE count_lists SET name = $2, updated_at = now() WHERE id = $1`,
          [id, name]
        );
        if (!rowCount) return null;
        await replaceProducts(client, id, productIds);
        return { id, name, productIds };
      }),

    async remove(id) {
      const { rowCount } = await pool.query(
        `DELETE FROM count_lists WHERE id = $1`,
        [id]
      );
      return Boolean(rowCount);
    },
  };
}
