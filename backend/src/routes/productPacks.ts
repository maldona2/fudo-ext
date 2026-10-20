import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../domain/types.js';
import { requireRole, requireUser } from '../middleware/auth.js';
import { asyncHandler, parse } from '../utils/http.js';
import { HttpError } from '../utils/httpError.js';

const productIdSchema = z.string().regex(/^\d{1,10}$/);
const packSchema = z
  .object({
    productId: productIdSchema,
    units: z.number().int().min(2).max(1000),
    label: z.string().trim().min(1).max(20),
  })
  .strict();
const inputSchema = z
  .object({
    packs: z
      .array(packSchema)
      .min(1)
      .max(2000)
      .refine(
        (packs) =>
          new Set(packs.map((pack) => pack.productId)).size === packs.length,
        'duplicated product'
      ),
  })
  .strict();

export function productPacksRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth));
  router.use(requireRole('owner'));

  router.put(
    '/',
    asyncHandler(async (req, res) => {
      const { packs } = parse(inputSchema, req.body);
      await services.productPacks.upsert(packs);
      res.status(204).end();
    })
  );

  router.delete(
    '/:productId',
    asyncHandler(async (req, res) => {
      const productId = parse(productIdSchema, req.params.productId);
      if (!(await services.productPacks.remove(productId))) {
        throw new HttpError(404, 'Bulto no encontrado');
      }
      res.status(204).end();
    })
  );

  return router;
}
