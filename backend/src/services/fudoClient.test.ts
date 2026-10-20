import { FudoClient, FudoError } from './fudoClient.js';

type Reply = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

// Scripted fetch: each call pops the next reply and records the request.
const scriptedFetch = (replies: Reply[]) => {
  const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = [];
  const fetchFn = async (
    url: string | URL,
    init?: Parameters<typeof fetch>[1]
  ) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request ${url}`);
    return new Response(
      typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
      { status: reply.status, headers: reply.headers }
    );
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
};

const token = (exp: number) => ({
  status: 200,
  body: { token: 'tok', exp: String(exp) },
});
const inOneDay = () => Math.floor(Date.now() / 1000) + 86400;

const makeClient = (fetchFn: typeof fetch) =>
  new FudoClient({
    apiKey: 'key',
    apiSecret: 'secret',
    fetchFn,
    sleep: async () => undefined,
  });

describe('FudoClient', () => {
  it('reuses the token across requests while it is valid', async () => {
    const { fetchFn, calls } = scriptedFetch([
      token(inOneDay()),
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: [] } },
    ]);
    const client = makeClient(fetchFn);

    await client.get('/products');
    await client.get('/products');

    expect(calls.filter((c) => c.url.includes('auth.fu.do'))).toHaveLength(1);
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('requests a new token when the current one is about to expire', async () => {
    const soon = Math.floor(Date.now() / 1000) + 60;
    const { fetchFn, calls } = scriptedFetch([
      token(soon),
      { status: 200, body: { data: [] } },
      token(inOneDay()),
      { status: 200, body: { data: [] } },
    ]);
    const client = makeClient(fetchFn);

    await client.get('/products');
    await client.get('/products');

    expect(calls.filter((c) => c.url.includes('auth.fu.do'))).toHaveLength(2);
  });

  it('waits and retries when FUDO answers 429', async () => {
    const waits: number[] = [];
    const { fetchFn } = scriptedFetch([
      token(inOneDay()),
      { status: 429, body: 'Retry later', headers: { 'Retry-After': '3' } },
      { status: 200, body: { data: [{ id: '1' }] } },
    ]);
    const client = new FudoClient({
      apiKey: 'key',
      apiSecret: 'secret',
      fetchFn,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    const page = await client.get('/products');

    expect(waits).toEqual([3000]);
    expect(page.data).toEqual([{ id: '1' }]);
  });

  it('throws a FudoError with the status on a 4xx answer', async () => {
    const { fetchFn } = scriptedFetch([
      token(inOneDay()),
      { status: 403, body: { errors: [{ code: 'forbidden' }] } },
    ]);

    await expect(makeClient(fetchFn).get('/sales')).rejects.toMatchObject({
      status: 403,
    });
    expect(new FudoError(403, 'x')).toBeInstanceOf(Error);
  });

  it('refuses to send write requests', async () => {
    const { fetchFn, calls } = scriptedFetch([]);
    const client = makeClient(fetchFn);

    await expect(
      // @ts-expect-error the client only exposes reads on purpose
      client.request('PATCH', '/products/1')
    ).rejects.toThrow('read-only');
    expect(calls).toHaveLength(0);
  });

  it('pages until a page comes back shorter than the page size', async () => {
    const { fetchFn, calls } = scriptedFetch([
      token(inOneDay()),
      {
        status: 200,
        body: { data: [{ id: '1' }, { id: '2' }], included: [{ id: 'a' }] },
      },
      { status: 200, body: { data: [{ id: '3' }] } },
    ]);

    const result = await makeClient(fetchFn).getAll('/sales', {
      pageSize: 2,
      params: { 'filter[saleState]': 'eq.CLOSED' },
    });

    expect(result.data.map((d) => d.id)).toEqual(['1', '2', '3']);
    expect(result.included).toEqual([{ id: 'a' }]);
    const second = new URL(calls[2].url);
    expect(second.searchParams.get('page[number]')).toBe('2');
    expect(second.searchParams.get('filter[saleState]')).toBe('eq.CLOSED');
  });
});
