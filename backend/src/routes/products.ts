import { Router } from 'express';
import type { Services } from '../domain/types.js';
import { requireUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

export function productsRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth));

  // Blind count: no stock figures leave this route.
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const products = await services.products.listForCount();
      res.json({
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          category: p.category,
        })),
      });
    })
  );

  return router;
}
