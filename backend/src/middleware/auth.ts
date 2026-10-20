import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Role, Services, User } from '../domain/types.js';
import { readCookie } from '../utils/http.js';

export const SESSION_COOKIE = 'sid';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

const unauthorized = (res: Response) =>
  res.status(401).json({ error: { message: 'Iniciá sesión' } });

export function requireUser(auth: Services['auth']): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) {
      unauthorized(res);
      return;
    }
    auth
      .userForToken(token)
      .then((user) => {
        if (!user || !user.active) {
          unauthorized(res);
          return;
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}

export function requireRole(role: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: { message: 'No tenés permiso' } });
      return;
    }
    next();
  };
}
