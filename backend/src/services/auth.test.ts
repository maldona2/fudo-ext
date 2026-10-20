import { createHash } from 'crypto';
import { createAuthService, createUsersService } from './auth.js';
import type { SessionsRepo, UsersRepo } from './auth.js';
import { hashPassword } from './password.js';
import type { User } from '../domain/types.js';

const NOW = new Date('2026-10-22T10:00:00Z');

const owner: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'evaristo@loshornos.com',
  name: 'Evaristo',
  role: 'owner',
  active: true,
};

const setup = async (user: User = owner) => {
  const passwordHash = await hashPassword('secreto123');
  const sessions: { tokenHash: string; userId: string; expiresAt: Date }[] = [];
  const users: UsersRepo = {
    findByEmail: async (email) =>
      email === user.email ? { user, passwordHash } : null,
    list: async () => [user],
    insert: async () => user,
    count: async () => 1,
  };
  const sessionsRepo: SessionsRepo = {
    insert: async (s) => {
      sessions.push(s);
    },
    findUser: async (tokenHash, now) => {
      const s = sessions.find((x) => x.tokenHash === tokenHash);
      return s && s.expiresAt > now ? user : null;
    },
    delete: async (tokenHash) => {
      const i = sessions.findIndex((x) => x.tokenHash === tokenHash);
      if (i >= 0) sessions.splice(i, 1);
    },
  };
  let now = NOW;
  const service = createAuthService({
    users,
    sessions: sessionsRepo,
    now: () => now,
  });
  return {
    service,
    sessions,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
};

describe('auth service', () => {
  it('returns null for an unknown email', async () => {
    const { service } = await setup();
    await expect(service.login('otro@x.com', 'secreto123')).resolves.toBeNull();
  });

  it('returns null for a wrong password', async () => {
    const { service, sessions } = await setup();
    await expect(service.login(owner.email, 'incorrecta')).resolves.toBeNull();
    expect(sessions).toHaveLength(0);
  });

  it('returns null for a deactivated user even with the right password', async () => {
    const { service } = await setup({ ...owner, active: false });
    await expect(service.login(owner.email, 'secreto123')).resolves.toBeNull();
  });

  it('stores only a hash of the session token, valid for 30 days', async () => {
    const { service, sessions } = await setup();

    const result = await service.login(owner.email, 'secreto123');

    expect(result?.user.id).toBe(owner.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(result?.token);
    expect(sessions[0].tokenHash).toBe(
      createHash('sha256').update(result!.token).digest('hex')
    );
    expect(sessions[0].expiresAt).toEqual(
      new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000)
    );
  });

  it('resolves the user from the token until the session expires', async () => {
    const { service, advance } = await setup();
    const { token } = (await service.login(owner.email, 'secreto123'))!;

    await expect(service.userForToken(token)).resolves.toEqual(owner);
    advance(31 * 24 * 60 * 60 * 1000);
    await expect(service.userForToken(token)).resolves.toBeNull();
  });

  it('forgets the session on logout', async () => {
    const { service } = await setup();
    const { token } = (await service.login(owner.email, 'secreto123'))!;

    await service.logout(token);

    await expect(service.userForToken(token)).resolves.toBeNull();
  });
});

describe('users service', () => {
  it('answers 409 when the email already exists', async () => {
    const service = createUsersService({
      findByEmail: async () => null,
      list: async () => [],
      count: async () => 0,
      insert: async () => {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      },
    });

    await expect(
      service.create({
        email: owner.email,
        name: 'X',
        password: 'una-clave-larga',
        role: 'counter',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('stores a hash, never the password', async () => {
    let stored = '';
    const service = createUsersService({
      findByEmail: async () => null,
      list: async () => [],
      count: async () => 0,
      insert: async (row) => {
        stored = row.passwordHash;
        return owner;
      },
    });

    await service.create({
      email: owner.email,
      name: 'X',
      password: 'una-clave-larga',
      role: 'owner',
    });

    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toContain('una-clave-larga');
  });
});
