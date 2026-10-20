import { formatShortageMessage, createTelegramNotifier } from './notifier.js';
import type { ShortageEvent } from './counts.js';

const event: ShortageEvent = {
  countId: '33333333-3333-4333-8333-333333333333',
  countedBy: 'Vanessa',
  countedAt: new Date('2026-10-22T10:50:00Z'),
  summary: {
    products: 40,
    withDifference: 2,
    missingUnits: 3,
    missingValue: 2050,
    surplusUnits: 0,
    surplusValue: 0,
  },
  missing: [
    {
      name: 'Carne suave',
      difference: -2,
      differenceValue: -1400,
      basis: 'previous_count',
      previous: { counted: 40, countedAt: new Date('2026-10-19T10:50:00Z') },
    },
    {
      name: 'Coca <1.5L> & co',
      difference: -1,
      differenceValue: -650,
      basis: 'system',
      previous: null,
    },
  ],
};

describe('formatShortageMessage', () => {
  it('says who counted, what is missing and the money, in Argentine format', () => {
    const text = formatShortageMessage(event, 'https://app.example.com');

    expect(text).toContain('Vanessa');
    expect(text).toContain('jueves 22/10 07:50');
    expect(text).toContain('Faltan 3 unidades ($2.050)');
    expect(text).toContain('2 Carne suave ($1.400) desde el conteo del 19/10');
    expect(text).toContain(
      'https://app.example.com/panel/conteos/33333333-3333-4333-8333-333333333333'
    );
  });

  it('escapes HTML so product names cannot break the message', () => {
    const text = formatShortageMessage(event, 'https://app.example.com');

    expect(text).toContain('Coca &lt;1.5L&gt; &amp; co');
    expect(text).toContain('vs. sistema');
  });
});

describe('createTelegramNotifier', () => {
  it('posts the message to every configured chat', async () => {
    const calls: { url: string; body: { chat_id: string } }[] = [];
    const notify = createTelegramNotifier({
      token: 'bot-token',
      chatIds: ['1', '2'],
      appUrl: 'https://app.example.com',
      fetchFn: (async (url: string, init: Parameters<typeof fetch>[1]) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response('{"ok":true}');
      }) as unknown as typeof fetch,
    });

    await notify(event);

    expect(calls.map((c) => c.body.chat_id)).toEqual(['1', '2']);
    expect(calls[0].url).toBe(
      'https://api.telegram.org/botbot-token/sendMessage'
    );
  });

  it('throws when Telegram rejects the message', async () => {
    const notify = createTelegramNotifier({
      token: 'bot-token',
      chatIds: ['1'],
      appUrl: 'https://app.example.com',
      fetchFn: (async () =>
        new Response('{"ok":false}', {
          status: 400,
        })) as unknown as typeof fetch,
    });

    await expect(notify(event)).rejects.toThrow('Telegram');
  });
});
