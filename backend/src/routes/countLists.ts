import { Router } from 'express';
import { z } from 'zod';
import type { CountList, Services } from '../domain/types.js';
import { requireRole, requireUser } from '../middleware/auth.js';
import { asyncHandler, parse } from '../utils/http.js';
import { HttpError } from '../utils/httpError.js';

const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    productIds: z
      .array(z.string().regex(/^\d{1,10}$/))
      .min(1)
      .max(2000)
      .refine((ids) => new Set(ids).size === ids.length, 'duplicated product'),
  })
  .strict();

const idSchema = z.string().uuid();

const serialize = (l: CountList) => ({
  id: l.id,
  name: l.name,
  productIds: [...l.productIds],
});

export function countListsRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth));

  // Counters read the lists to choose what to count; only owners edit them.
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const lists = await services.countLists.list();
      res.json({ lists: lists.map(serialize) });
    })
  );

  router.post(
    '/',
    requireRole('owner'),
    asyncHandler(async (req, res) => {
      const list = await services.countLists.create(
        parse(inputSchema, req.body)
      );
      res.status(201).json({ list: serialize(list) });
    })
  );

  router.put(
    '/:id',
    requireRole('owner'),
    asyncHandler(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const list = await services.countLists.update(
        id,
        parse(inputSchema, req.body)
      );
      if (!list) throw new HttpError(404, 'Lista no encontrada');
      res.json({ list: serialize(list) });
    })
  );

  router.delete(
    '/:id',
    requireRole('owner'),
    asyncHandler(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      if (!(await services.countLists.remove(id))) {
        throw new HttpError(404, 'Lista no encontrada');
      }
      res.status(204).end();
    })
  );

  return router;
}
