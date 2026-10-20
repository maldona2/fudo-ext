// Startup configuration. Fails closed: a missing required variable stops
// the process instead of falling back to an insecure default.

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

const optional = (name: string) => process.env[name] || undefined;

export function loadConfig() {
  const recountMinDifference = Number(optional('RECOUNT_MIN_DIFFERENCE') ?? 1);
  if (!Number.isFinite(recountMinDifference) || recountMinDifference <= 0) {
    throw new Error('RECOUNT_MIN_DIFFERENCE must be a positive number');
  }
  const telegramToken = optional('TELEGRAM_BOT_TOKEN');
  const telegramChats = optional('TELEGRAM_CHAT_ID');
  return {
    recountMinDifference,
    port: Number(process.env.PORT || 5001),
    fudo: {
      apiKey: required('FUDO_API_KEY'),
      apiSecret: required('FUDO_API_SECRET'),
    },
    // Public URL of the app, used in alert links.
    appUrl:
      optional('APP_URL') ??
      optional('FRONTEND_URL') ??
      'http://localhost:3000',
    telegram:
      telegramToken && telegramChats
        ? {
            token: telegramToken,
            chatIds: telegramChats
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : null,
    bootstrapOwner: {
      email: optional('BOOTSTRAP_OWNER_EMAIL'),
      password: optional('BOOTSTRAP_OWNER_PASSWORD'),
      name: optional('BOOTSTRAP_OWNER_NAME') ?? 'Dueño',
    },
  };
}
