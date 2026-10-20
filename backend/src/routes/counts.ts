import { Router } from 'express';
import { z } from 'zod';
import type { CountRecord, Services } from '../domain/types.js';
import { requireRole, requireUser } from '../middleware/auth.js';
import { asyncHandler, parse } from '../utils/http.js';
import { HttpError } from '../utils/httpError.js';

const createSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            productId: z.string().regex(/^\d{1,10}$/),
            counted: z.number().finite().min(0).max(1_000_000),
          })
          .strict()
      )
      .min(1)
      .max(2000)
      .refine(
        (entries) =>
          new Set(entries.map((e) => e.productId)).size === entries.length,
        'duplicated product'
      ),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const listSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

const idSchema = z.string().uuid();

const shrinkageSchema = z
  .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
  .strict();

const serializeRecord = (c: CountRecord) => ({
  id: c.id,
  countedAt: c.countedAt,
  createdBy: { id: c.createdBy.id, name: c.createdBy.name },
  note: c.note,
  summary: c.summary,
});

export function countsRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth));

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(createSchema, req.body);
      const result = await services.counts.create(req.user!, input);
      // A counter never sees the system figures: the count stays blind.
      res
        .status(201)
        .json(
          req.user!.role === 'owner'
            ? { id: result.id, summary: result.summary }
            : { id: result.id }
        );
    })
  );

  router.get(
    '/',
    requireRole('owner'),
    asyncHandler(async (req, res) => {
      const { limit } = parse(listSchema, req.query);
      const counts = await services.counts.list(limit);
      res.json({ counts: counts.map(serializeRecord) });
    })
  );

  router.get(
    '/:id',
    requireRole('owner'),
    asyncHandler(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const count = await services.counts.get(id);
      if (!count) throw new HttpError(404, 'Conteo no encontrado');
      res.json({
        count: {
          ...serializeRecord(count),
          lines: count.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            counted: l.counted,
            systemStock: l.systemStock,
            cost: l.cost,
            basis: l.basis,
            previous: l.previous,
            bought: l.bought,
            sold: l.sold,
            expected: l.expected,
            difference: l.difference,
            differenceValue: l.differenceValue,
          })),
        },
      });
    })
  );

  return router;
}

export function reportsRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth), requireRole('owner'));

  router.get(
    '/shrinkage',
    asyncHandler(async (req, res) => {
      const { days } = parse(shrinkageSchema, req.query);
      const rows = await services.counts.shrinkage(days);
      res.json({
        days,
        products: rows.map((r) => ({
          productId: r.productId,
          name: r.name,
          counts: r.counts,
          missingUnits: r.missingUnits,
          missingValue: r.missingValue,
          lastCountedAt: r.lastCountedAt,
        })),
      });
    })
  );

  return router;
}
