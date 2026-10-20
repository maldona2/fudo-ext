import type { Pool } from 'pg';
import type { CountRecord } from '../../domain/types.js';
import { HttpError } from '../../utils/httpError.js';
import type { CountsRepo } from '../../services/counts.js';
import type { CountLine, PreviousCount } from '../../services/reconcile.js';

// pg returns NUMERIC as string to avoid precision loss; our values fit a
// double comfortably (3 decimals, < 10^11).
const n = (v: string | null) => (v === null ? null : Number(v));
const nn = (v: string) => Number(v);

interface CountRow {
  id: string;
  counted_at: Date;
  note: string | null;
  created_by: string;
  created_by_name: string;
  list_id: string | null;
  list_name: string | null;
  products: number;
  with_difference: number;
  missing_units: string;
  missing_value: string;
  surplus_units: string;
  surplus_value: string;
}

const COUNT_COLUMNS = `
  c.id, c.counted_at, c.note, c.created_by, u.name AS created_by_name,
  c.list_id, c.list_name,
  c.products, c.with_difference, c.missing_units, c.missing_value,
  c.surplus_units, c.surplus_value`;

const toRecord = (r: CountRow): CountRecord => ({
  id: r.id,
  countedAt: r.counted_at,
  note: r.note,
  createdBy: { id: r.created_by, name: r.created_by_name },
  list: r.list_name === null ? null : { id: r.list_id, name: r.list_name },
  summary: {
    products: r.products,
    withDifference: r.with_difference,
    missingUnits: nn(r.missing_units),
    missingValue: nn(r.missing_value),
    surplusUnits: nn(r.surplus_units),
    surplusValue: nn(r.surplus_value),
  },
});

export function countsRepo(pool: Pool): CountsRepo {
  return {
    async insertCheck({ userId, listId, entries, recountIds }) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO count_checks (user_id, list_id, entries, recount_ids)
         VALUES ($1, $2, $3::jsonb, $4::text[]) RETURNING id`,
        [userId, listId, JSON.stringify(entries), recountIds]
      );
      return rows[0].id;
    },

    async getCheck(id) {
      const { rows } = await pool.query<{
        id: string;
        user_id: string;
        created_at: Date;
        used_at: Date | null;
        entries: { productId: string; counted: number }[];
        recount_ids: string[];
      }>(
        `SELECT id, user_id, created_at, used_at, entries, recount_ids
           FROM count_checks WHERE id = $1`,
        [id]
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            userId: row.user_id,
            createdAt: row.created_at,
            usedAt: row.used_at,
            entries: row.entries,
            recountIds: row.recount_ids,
          }
        : null;
    },

    async latestByProduct(productIds) {
      const { rows } = await pool.query<{
        product_id: string;
        counted: string;
        counted_at: Date;
      }>(
        `SELECT DISTINCT ON (product_id) product_id, counted, counted_at
           FROM count_lines
          WHERE product_id = ANY($1::varchar[])
          ORDER BY product_id, counted_at DESC`,
        [productIds]
      );
      return new Map<string, PreviousCount>(
        rows.map((r) => [
          r.product_id,
          { counted: nn(r.counted), countedAt: r.counted_at },
        ])
      );
    },

    async insert({
      checkId,
      createdBy,
      countedAt,
      note,
      list,
      summary,
      lines,
    }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (checkId) {
          // Claim under the row lock before saving: concurrent submissions
          // cannot both consume the same check. A failed insert rolls it back.
          const claimed = await client.query(
            `UPDATE count_checks SET used_at = clock_timestamp()
              WHERE id = $1 AND user_id = $2 AND used_at IS NULL
                AND created_at >= clock_timestamp() - interval '2 hours'
              RETURNING id`,
            [checkId, createdBy]
          );
          if (claimed.rowCount !== 1) {
            throw new HttpError(400, 'El recuento venció. Volvé a empezar.');
          }
        }
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO counts (created_by, counted_at, note, list_id,
             list_name, products, with_difference, missing_units,
             missing_value, surplus_units, surplus_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            createdBy,
            countedAt,
            note,
            list?.id ?? null,
            list?.name ?? null,
            summary.products,
            summary.withDifference,
            summary.missingUnits,
            summary.missingValue,
            summary.surplusUnits,
            summary.surplusValue,
          ]
        );
        const id = rows[0].id;
        for (const l of lines) {
          await client.query(
            `INSERT INTO count_lines (count_id, product_id, product_name,
               counted_at, counted, system_stock, cost, basis,
               previous_counted, previous_counted_at, bought, sold, expected,
               difference, difference_value, first_counted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16)`,
            [
              id,
              l.productId,
              l.name,
              countedAt,
              l.counted,
              l.systemStock,
              l.cost,
              l.basis,
              l.previous?.counted ?? null,
              l.previous?.countedAt ?? null,
              l.bought,
              l.sold,
              l.expected,
              l.difference,
              l.differenceValue,
              l.firstCounted,
            ]
          );
        }
        await client.query('COMMIT');
        return id;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async list(limit) {
      const { rows } = await pool.query<CountRow>(
        `SELECT ${COUNT_COLUMNS}
           FROM counts c JOIN users u ON u.id = c.created_by
          ORDER BY c.counted_at DESC
          LIMIT $1`,
        [limit]
      );
      return rows.map(toRecord);
    },

    async get(id) {
      const { rows } = await pool.query<CountRow>(
        `SELECT ${COUNT_COLUMNS}
           FROM counts c JOIN users u ON u.id = c.created_by
          WHERE c.id = $1`,
        [id]
      );
      if (!rows[0]) return null;
      const lines = await pool.query<{
        product_id: string;
        product_name: string;
        counted: string;
        first_counted: string | null;
        system_stock: string;
        cost: string | null;
        basis: CountLine['basis'];
        previous_counted: string | null;
        previous_counted_at: Date | null;
        bought: string;
        sold: string;
        expected: string;
        difference: string;
        difference_value: string | null;
      }>(
        `SELECT product_id, product_name, counted, first_counted, system_stock, cost, basis,
                previous_counted, previous_counted_at, bought, sold, expected,
                difference, difference_value
           FROM count_lines
          WHERE count_id = $1
          ORDER BY difference_value ASC NULLS LAST, difference ASC,
                   product_name`,
        [id]
      );
      return {
        ...toRecord(rows[0]),
        lines: lines.rows.map((l) => ({
          productId: l.product_id,
          name: l.product_name,
          counted: nn(l.counted),
          firstCounted: n(l.first_counted),
          systemStock: nn(l.system_stock),
          cost: n(l.cost),
          basis: l.basis,
          previous:
            l.previous_counted !== null && l.previous_counted_at
              ? {
                  counted: nn(l.previous_counted),
                  countedAt: l.previous_counted_at,
                }
              : null,
          bought: nn(l.bought),
          sold: nn(l.sold),
          expected: nn(l.expected),
          difference: nn(l.difference),
          differenceValue: n(l.difference_value),
        })),
      };
    },

    async shrinkage(since) {
      const { rows } = await pool.query<{
        product_id: string;
        name: string;
        counts: string;
        missing_units: string;
        missing_value: string;
        last_counted_at: Date;
      }>(
        `SELECT product_id,
                (array_agg(product_name ORDER BY counted_at DESC))[1] AS name,
                count(*) AS counts,
                -sum(difference) AS missing_units,
                -coalesce(sum(difference_value), 0) AS missing_value,
                max(counted_at) AS last_counted_at
           FROM count_lines
          WHERE counted_at >= $1 AND difference < 0
          GROUP BY product_id
          ORDER BY missing_value DESC, missing_units DESC`,
        [since]
      );
      return rows.map((r) => ({
        productId: r.product_id,
        name: r.name,
        counts: Number(r.counts),
        missingUnits: nn(r.missing_units),
        missingValue: nn(r.missing_value),
        lastCountedAt: r.last_counted_at,
      }));
    },
  };
}
