import type { Request, Response, NextFunction } from 'express';

interface Options {
  windowMs: number;
  max: number;
  now?: () => number;
}

// Fixed-window, in-memory limiter. Good enough for a single backend
// instance; move to the database if the service is ever scaled out.
export function createRateLimiter({ windowMs, max, now = Date.now }: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const hit = (key: string): boolean => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };

  const middleware =
    (keyOf: (req: Request) => string) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (hit(keyOf(req))) return next();
      res
        .status(429)
        .json({ error: { message: 'Demasiados intentos. Probá más tarde.' } });
    };

  return { hit, middleware };
}
