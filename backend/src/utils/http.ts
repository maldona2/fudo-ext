import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { HttpError } from './httpError.js';

// Express 4 does not forward rejected promises to the error handler.
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<S extends ZodTypeAny>(
  schema: S,
  value: unknown
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'Datos inválidos');
  }
  return result.data;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
