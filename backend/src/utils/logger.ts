import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Never log credentials, session cookies or passwords.
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    '*.password',
    '*.apiSecret',
    '*.token',
  ],
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});

export default logger;
