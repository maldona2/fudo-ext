import request from 'supertest';
import { createApp } from './app.js';
import type { Services, User } from './domain/types.js';
import { HttpError } from './utils/httpError.js';

const owner: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'evaristo@loshornos.com',
  name: 'Evaristo',
  role: 'owner',
  active: true,
};
const counter: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'vanessa@loshornos.com',
  name: 'Vanessa',
  role: 'counter',
  active: true,
};

const summary = {
  products: 1,
  withDifference: 1,
  missingUnits: 2,
  missingValue: 1400,
  surplusUnits: 0,
  surplusValue: 0,
};

const COUNT_ID = '33333333-3333-4333-8333-333333333333';
const LIST_ID = '55555555-5555-4555-8555-555555555555';

const makeServices = () => {
  const created: unknown[] = [];
  const services: Services = {
    auth: {
      login: async (email, password) =>
        email === owner.email && password === 'secreto123'
          ? { user: owner, token: 'owner-token' }
          : null,
      userForToken: async (token) =>
        token === 'owner-token'
          ? owner
          : token === 'counter-token'
            ? counter
            : null,
      logout: async () => undefined,
    },
    users: {
      list: async () => [owner, counter],
      create: async (input) => {
        if (input.email === owner.email) {
          throw new HttpError(409, 'Ya existe un usuario con ese email');
        }
        created.push(input);
        return { ...counter, email: input.email, name: input.name };
      },
    },
    products: {
      listForCount: async () => [
        {
          id: '14',
          name: 'Carne suave',
          code: '51',
          category: 'Empanadas',
          pack: { units: 24, label: 'cajón' },
        },
      ],
    },
    counts: {
      create: async (_user, input) => {
        created.push(input);
        return { id: COUNT_ID, summary };
      },
      list: async () => [],
      get: async (id) =>
        id === COUNT_ID
          ? {
              id,
              countedAt: new Date('2026-10-22T10:50:00Z'),
              createdBy: { id: counter.id, name: counter.name },
              note: null,
              list: { id: LIST_ID, name: 'Diario' },
              summary,
              lines: [],
            }
          : null,
      shrinkage: async () => [],
    },
    countLists: {
      list: async () => [{ id: LIST_ID, name: 'Diario', productIds: ['14'] }],
      create: async (input) => {
        if (input.name === 'Diario') {
          throw new HttpError(409, 'Ya existe una lista con ese nombre');
        }
        created.push(input);
        return { id: LIST_ID, ...input };
      },
      update: async (id, input) => {
        if (id !== LIST_ID) return null;
        created.push(input);
        return { id, ...input };
      },
      remove: async (id) => id === LIST_ID,
    },
    productPacks: {
      upsert: async (packs) => {
        created.push(packs);
      },
      remove: async (id) => id === '14',
    },
    health: async () => undefined,
  };
  return { services, created };
};

const asOwner = ['Cookie', 'sid=owner-token'] as const;
const asCounter = ['Cookie', 'sid=counter-token'] as const;

describe('auth routes', () => {
  it('rejects a login without password with 400', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/auth/login')
      .send({ email: owner.email });

    expect(res.status).toBe(400);
  });

  it('rejects wrong credentials with 401 and sets no cookie', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('sets an httpOnly session cookie on a valid login', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'secreto123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: owner.id,
      email: owner.email,
      name: owner.name,
      role: 'owner',
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('sid=owner-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('blocks repeated login attempts with 429', async () => {
    const { services } = makeServices();
    const app = createApp(services);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: owner.email, password: 'incorrecta' });
      last = res.status;
    }

    expect(last).toBe(429);
  });

  it('answers 401 on /me without a session', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services)).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('answers 401 on /me with an unknown session', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/auth/me')
      .set('Cookie', 'sid=forged');

    expect(res.status).toBe(401);
  });

  it('returns the current user on /me', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/auth/me')
      .set(...asCounter);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('counter');
  });
});

describe('POST /api/counts', () => {
  const valid = { entries: [{ productId: '14', counted: 10 }] };

  it('requires a session', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/counts')
      .send(valid);

    expect(res.status).toBe(401);
  });

  it.each([
    ['no entries', { entries: [] }],
    ['negative quantity', { entries: [{ productId: '14', counted: -1 }] }],
    ['non numeric product id', { entries: [{ productId: 'abc', counted: 1 }] }],
    ['quantity as text', { entries: [{ productId: '14', counted: '10' }] }],
    [
      'the same product twice',
      {
        entries: [
          { productId: '14', counted: 1 },
          { productId: '14', counted: 2 },
        ],
      },
    ],
    ['unknown keys', { ...valid, systemStock: 12 }],
    ['an over-long note', { ...valid, note: 'x'.repeat(501) }],
  ])('rejects %s with 400', async (_name, body) => {
    const { services, created } = makeServices();
    const res = await request(createApp(services))
      .post('/api/counts')
      .set(...asCounter)
      .send(body);

    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('keeps the count blind for a counter: no differences in the answer', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/counts')
      .set(...asCounter)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: COUNT_ID });
  });

  it('returns the summary to the owner', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/counts')
      .set(...asOwner)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: COUNT_ID, summary });
  });
});

describe('owner-only routes', () => {
  it.each([
    ['get', '/api/counts'],
    ['get', `/api/counts/${COUNT_ID}`],
    ['get', '/api/reports/shrinkage'],
    ['get', '/api/users'],
    ['post', '/api/users'],
  ] as const)('%s %s answers 401 without a session', async (method, path) => {
    const { services } = makeServices();
    const res = await request(createApp(services))[method](path);

    expect(res.status).toBe(401);
  });

  it.each([
    ['get', '/api/counts'],
    ['get', `/api/counts/${COUNT_ID}`],
    ['get', '/api/reports/shrinkage'],
    ['get', '/api/users'],
    ['post', '/api/users'],
  ] as const)('%s %s answers 403 to a counter', async (method, path) => {
    const { services } = makeServices();
    const agent = request(createApp(services));
    const res = await agent[method](path).set(...asCounter);

    expect(res.status).toBe(403);
  });

  it('answers 400 for a malformed count id', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/counts/1 OR 1=1')
      .set(...asOwner);

    expect(res.status).toBe(400);
  });

  it('answers 404 for a count that does not exist', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/counts/44444444-4444-4444-8444-444444444444')
      .set(...asOwner);

    expect(res.status).toBe(404);
  });

  it('returns a count to the owner', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get(`/api/counts/${COUNT_ID}`)
      .set(...asOwner);

    expect(res.status).toBe(200);
    expect(res.body.count.createdBy.name).toBe('Vanessa');
  });

  it('rejects a shrinkage window outside 1..365 days', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/reports/shrinkage?days=0')
      .set(...asOwner);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/users', () => {
  const valid = {
    email: 'nueva@loshornos.com',
    name: 'Nueva',
    password: 'una-clave-larga',
    role: 'counter',
  };

  it.each([
    ['a short password', { ...valid, password: 'corta' }],
    ['an invalid email', { ...valid, email: 'no-es-email' }],
    ['an unknown role', { ...valid, role: 'admin' }],
    ['unknown keys', { ...valid, active: true }],
  ])('rejects %s with 400', async (_name, body) => {
    const { services, created } = makeServices();
    const res = await request(createApp(services))
      .post('/api/users')
      .set(...asOwner)
      .send(body);

    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('answers 409 when the email is taken', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/users')
      .set(...asOwner)
      .send({ ...valid, email: owner.email });

    expect(res.status).toBe(409);
  });

  it('creates a user and never returns a password field', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/users')
      .set(...asOwner)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(valid.email);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});

describe('GET /api/products', () => {
  it('requires a session', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services)).get('/api/products');

    expect(res.status).toBe(401);
  });

  it('lists products without any stock figure (blind count)', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/products')
      .set(...asCounter);

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([
      {
        id: '14',
        name: 'Carne suave',
        code: '51',
        category: 'Empanadas',
        pack: { units: 24, label: 'cajón' },
      },
    ]);
  });
});

describe('PUT /api/product-packs', () => {
  const pack = { productId: '14', units: 24, label: 'cajón' };
  const valid = { packs: [pack] };

  it('answers 401 without a session and 403 to a counter', async () => {
    const { services, created } = makeServices();
    const app = createApp(services);
    expect(
      (await request(app).put('/api/product-packs').send(valid)).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .put('/api/product-packs')
          .set(...asCounter)
          .send(valid)
      ).status
    ).toBe(403);
    expect(created).toHaveLength(0);
  });

  it.each([
    ['units below range', { packs: [{ ...pack, units: 1 }] }],
    ['units above range', { packs: [{ ...pack, units: 1001 }] }],
    ['fractional units', { packs: [{ ...pack, units: 2.5 }] }],
    ['empty label', { packs: [{ ...pack, label: '' }] }],
    ['long label', { packs: [{ ...pack, label: 'x'.repeat(21) }] }],
    ['invalid id', { packs: [{ ...pack, productId: 'abc' }] }],
    ['empty packs', { packs: [] }],
    [
      'too many packs',
      {
        packs: Array.from({ length: 2001 }, (_, i) => ({
          ...pack,
          productId: String(i),
        })),
      },
    ],
    ['duplicated product', { packs: [pack, pack] }],
    ['extra field', { packs: [{ ...pack, stock: 5 }] }],
  ])('answers 400 for %s', async (_name, body) => {
    const { services, created } = makeServices();
    const res = await request(createApp(services))
      .put('/api/product-packs')
      .set(...asOwner)
      .send(body);
    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('saves valid packs for the owner', async () => {
    const { services, created } = makeServices();
    const res = await request(createApp(services))
      .put('/api/product-packs')
      .set(...asOwner)
      .send(valid);
    expect(res.status).toBe(204);
    expect(created).toEqual([[pack]]);
  });
});

describe('DELETE /api/product-packs/:productId', () => {
  it('answers 401 without a session and 403 to a counter', async () => {
    const { services } = makeServices();
    const app = createApp(services);
    expect((await request(app).delete('/api/product-packs/14')).status).toBe(
      401
    );
    expect(
      (
        await request(app)
          .delete('/api/product-packs/14')
          .set(...asCounter)
      ).status
    ).toBe(403);
  });

  it('answers 400 for a malformed product id', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .delete('/api/product-packs/abc')
      .set(...asOwner);
    expect(res.status).toBe(400);
  });

  it('answers 404 when the pack does not exist', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .delete('/api/product-packs/999')
      .set(...asOwner);
    expect(res.status).toBe(404);
  });

  it('removes an existing pack', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .delete('/api/product-packs/14')
      .set(...asOwner);
    expect(res.status).toBe(204);
  });
});

describe('count lists', () => {
  const valid = { name: 'Alto riesgo', productIds: ['14', '16'] };

  it('lets a counter read the lists, to pick what to count', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get('/api/count-lists')
      .set(...asCounter);

    expect(res.status).toBe(200);
    expect(res.body.lists).toEqual([
      { id: LIST_ID, name: 'Diario', productIds: ['14'] },
    ]);
  });

  it('answers 401 without a session', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services)).get('/api/count-lists');

    expect(res.status).toBe(401);
  });

  it.each([
    ['post', '/api/count-lists'],
    ['put', `/api/count-lists/${LIST_ID}`],
    ['delete', `/api/count-lists/${LIST_ID}`],
  ] as const)('%s %s answers 403 to a counter', async (method, path) => {
    const { services, created } = makeServices();
    const agent = request(createApp(services));
    const res = await agent[method](path)
      .set(...asCounter)
      .send(valid);

    expect(res.status).toBe(403);
    expect(created).toHaveLength(0);
  });

  it.each([
    ['an empty name', { ...valid, name: '  ' }],
    ['an over-long name', { ...valid, name: 'x'.repeat(81) }],
    ['no products', { ...valid, productIds: [] }],
    ['a non numeric product id', { ...valid, productIds: ['abc'] }],
    ['a repeated product', { ...valid, productIds: ['14', '14'] }],
    ['unknown keys', { ...valid, owner: 'yo' }],
  ])('rejects %s with 400', async (_name, body) => {
    const { services, created } = makeServices();
    const res = await request(createApp(services))
      .post('/api/count-lists')
      .set(...asOwner)
      .send(body);

    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('answers 409 when the name is taken', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/count-lists')
      .set(...asOwner)
      .send({ ...valid, name: 'Diario' });

    expect(res.status).toBe(409);
  });

  it('creates a list for the owner', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .post('/api/count-lists')
      .set(...asOwner)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body.list).toEqual({ id: LIST_ID, ...valid });
  });

  it('answers 400 for a malformed list id', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .put('/api/count-lists/12')
      .set(...asOwner)
      .send(valid);

    expect(res.status).toBe(400);
  });

  it('answers 404 when updating or deleting a list that does not exist', async () => {
    const { services } = makeServices();
    const app = createApp(services);
    const missing = '66666666-6666-4666-8666-666666666666';

    const put = await request(app)
      .put(`/api/count-lists/${missing}`)
      .set(...asOwner)
      .send(valid);
    const del = await request(app)
      .delete(`/api/count-lists/${missing}`)
      .set(...asOwner);

    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it('updates and deletes a list for the owner', async () => {
    const { services } = makeServices();
    const app = createApp(services);

    const put = await request(app)
      .put(`/api/count-lists/${LIST_ID}`)
      .set(...asOwner)
      .send(valid);
    const del = await request(app)
      .delete(`/api/count-lists/${LIST_ID}`)
      .set(...asOwner);

    expect(put.status).toBe(200);
    expect(put.body.list.name).toBe('Alto riesgo');
    expect(del.status).toBe(204);
  });

  it('accepts a count tied to a list and rejects a malformed list id', async () => {
    const { services, created } = makeServices();
    const app = createApp(services);
    const entries = [{ productId: '14', counted: 10 }];

    const ok = await request(app)
      .post('/api/counts')
      .set(...asCounter)
      .send({ entries, listId: LIST_ID });
    const bad = await request(app)
      .post('/api/counts')
      .set(...asCounter)
      .send({ entries, listId: 'diario' });

    expect(ok.status).toBe(201);
    expect(created).toEqual([{ entries, listId: LIST_ID }]);
    expect(bad.status).toBe(400);
  });

  it('shows the list a count was made with', async () => {
    const { services } = makeServices();
    const res = await request(createApp(services))
      .get(`/api/counts/${COUNT_ID}`)
      .set(...asOwner);

    expect(res.body.count.list).toEqual({ id: LIST_ID, name: 'Diario' });
  });
});
