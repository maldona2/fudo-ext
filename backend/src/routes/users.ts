import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../domain/types.js';
import { requireRole, requireUser } from '../middleware/auth.js';
import { asyncHandler, parse } from '../utils/http.js';
import { publicUser } from './serialize.js';

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(8).max(200),
    role: z.enum(['owner', 'counter']),
  })
  .strict();

export function usersRoutes(services: Services): Router {
  const router = Router();
  router.use(requireUser(services.auth), requireRole('owner'));

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const users = await services.users.list();
      res.json({
        users: users.map((u) => ({ ...publicUser(u), active: u.active })),
      });
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const user = await services.users.create(parse(createSchema, req.body));
      res.status(201).json({ user: publicUser(user) });
    })
  );

  return router;
}
