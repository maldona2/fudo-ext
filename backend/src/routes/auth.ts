import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../domain/types.js';
import { requireUser, SESSION_COOKIE } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, parse, readCookie } from '../utils/http.js';
import { publicUser } from './serialize.js';

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(200),
  })
  .strict();

export function authRoutes(services: Services): Router {
  const router = Router();
  const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  router.post(
    '/login',
    limiter.middleware((req) => req.ip ?? 'unknown'),
    asyncHandler(async (req, res) => {
      const { email, password } = parse(loginSchema, req.body);
      const result = await services.auth.login(email, password);
      if (!result) {
        res
          .status(401)
          .json({ error: { message: 'Email o contraseña incorrectos' } });
        return;
      }
      res.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_MAX_AGE_MS,
        path: '/',
      });
      res.json({ user: publicUser(result.user) });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) await services.auth.logout(token);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    })
  );

  router.get('/me', requireUser(services.auth), (req, res) => {
    res.json({ user: publicUser(req.user!) });
  });

  return router;
}
