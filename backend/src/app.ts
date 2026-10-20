import express, { Express } from 'express';
import cors from 'cors';
import { errorHandler } from './utils/errorHandler.js';
import logger from './utils/logger.js';
import type { Services } from './domain/types.js';
import { authRoutes } from './routes/auth.js';
import { usersRoutes } from './routes/users.js';
import { productsRoutes } from './routes/products.js';
import { countsRoutes, reportsRoutes } from './routes/counts.js';

export function createApp(services: Services): Express {
  const app: Express = express();

  // Requests arrive through Railway's edge and then nginx (frontend
  // service): trust those two hops so req.ip is the real client.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));

  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else if (
          process.env.NODE_ENV === 'development' &&
          origin.startsWith('http://localhost:')
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await services.health();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, 'Health check DB query failed');
      res
        .status(503)
        .json({ status: 'error', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRoutes(services));
  app.use('/api/users', usersRoutes(services));
  app.use('/api/products', productsRoutes(services));
  app.use('/api/counts', countsRoutes(services));
  app.use('/api/reports', reportsRoutes(services));

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
