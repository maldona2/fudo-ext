import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../domain/types.js';
import { normalizeBarcode } from '../domain/barcodes.js';
import { requireRole, requireUser } from '../middleware/auth.js';
import { asyncHandler, parse } from '../utils/http.js';

const barcode = z.string().max(64).transform(normalizeBarcode).refine((value): value is string => value !== null, 'Código inválido');
const schema = z.object({ productId: z.string().regex(/^\d{1,10}$/), barcode }).strict();

export function productBarcodesRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth), requireRole('owner'));
  router.put('/', asyncHandler(async (req, res) => {
    await services.productBarcodes.add(parse(schema, req.body));
    res.status(204).end();
  }));
  router.delete('/:productId/:barcode', asyncHandler(async (req, res) => {
    await services.productBarcodes.remove(parse(schema, req.params));
    res.status(204).end();
  }));
  return router;
}
