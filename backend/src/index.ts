import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import pool from './db/connect.js';
import { countsRepo } from './db/queries/counts.js';
import { countListsRepo } from './db/queries/countLists.js';
import { productPacksRepo } from './db/queries/productPacks.js';
import { sessionsRepo, usersRepo } from './db/queries/users.js';
import type { Services } from './domain/types.js';
import { createAuthService, createUsersService } from './services/auth.js';
import { createCountsService } from './services/counts.js';
import { createCountListsService } from './services/countLists.js';
import { FudoClient } from './services/fudoClient.js';
import {
  fetchCategories,
  fetchMovements,
  fetchProducts,
} from './services/fudoData.js';
import { createTelegramNotifier } from './services/notifier.js';
import { createProductsService } from './services/products.js';
import { createProductPacksService } from './services/productPacks.js';
import logger from './utils/logger.js';

const config = loadConfig();
const fudo = new FudoClient(config.fudo);
const users = usersRepo(pool);
const usersService = createUsersService(users);
const lists = countListsRepo(pool);
const packs = productPacksRepo(pool);
const productsService = createProductsService({
  products: () => fetchProducts(fudo),
  categories: () => fetchCategories(fudo),
  packs: () => packs.all(),
});

const services: Services = {
  auth: createAuthService({ users, sessions: sessionsRepo(pool) }),
  users: usersService,
  products: productsService,
  counts: createCountsService({
    recountMinDifference: config.recountMinDifference,
    repo: countsRepo(pool),
    lists,
    fudo: {
      products: () => fetchProducts(fudo),
      movements: (from, to) => fetchMovements(fudo, from, to),
    },
    notify: config.telegram
      ? createTelegramNotifier({ ...config.telegram, appUrl: config.appUrl })
      : async () => undefined,
  }),
  countLists: createCountListsService({
    repo: lists,
    countableProductIds: async () =>
      new Set((await productsService.listForCount()).map((p) => p.id)),
  }),
  productPacks: createProductPacksService({
    repo: packs,
    countableProductIds: async () =>
      new Set((await productsService.listForCount()).map((p) => p.id)),
  }),
  health: async () => {
    await pool.query('SELECT 1');
  },
};

const start = async () => {
  const { email, password, name } = config.bootstrapOwner;
  if (await usersService.bootstrapOwner(email, password, name)) {
    logger.info('Created the first owner user from BOOTSTRAP_OWNER_*');
  }
  if (!config.telegram) {
    logger.warn('Telegram is not configured: shortage alerts are disabled');
  }

  const server = createApp(services).listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
  });

  server.on('error', (err) => {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      pool
        .end()
        .then(() => {
          logger.info('Connections closed');
          process.exit(0);
        })
        .catch((err) => {
          logger.error({ err }, 'Error closing database pool');
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
};

start().catch((err) => {
  logger.error({ err }, 'Startup failed');
  process.exit(1);
});
