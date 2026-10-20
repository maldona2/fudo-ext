import { createHash, randomBytes } from 'crypto';
import type { NewUser, Role, User } from '../domain/types.js';
import { HttpError } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface UsersRepo {
  findByEmail(
    email: string
  ): Promise<{ user: User; passwordHash: string } | null>;
  list(): Promise<User[]>;
  insert(row: {
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
  }): Promise<User>;
  count(): Promise<number>;
}

export interface SessionsRepo {
  insert(row: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void>;
  findUser(tokenHash: string, now: Date): Promise<User | null>;
  delete(tokenHash: string): Promise<void>;
}

// Only a hash of the token is stored: a database leak does not leak sessions.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export function createAuthService({
  users,
  sessions,
  now = () => new Date(),
}: {
  users: UsersRepo;
  sessions: SessionsRepo;
  now?: () => Date;
}) {
  return {
    async login(email: string, password: string) {
      const found = await users.findByEmail(email);
      if (
        !found ||
        !found.user.active ||
        !(await verifyPassword(password, found.passwordHash))
      ) {
        return null;
      }
      const token = randomBytes(32).toString('base64url');
      await sessions.insert({
        tokenHash: hashToken(token),
        userId: found.user.id,
        expiresAt: new Date(now().getTime() + SESSION_TTL_MS),
      });
      return { user: found.user, token };
    },

    userForToken: (token: string) => sessions.findUser(hashToken(token), now()),

    logout: (token: string) => sessions.delete(hashToken(token)),
  };
}

export function createUsersService(users: UsersRepo) {
  return {
    list: () => users.list(),

    async create(input: NewUser) {
      try {
        return await users.insert({
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new HttpError(409, 'Ya existe un usuario con ese email');
        }
        throw err;
      }
    },

    // First deploy: create the owner from env vars when there are no users.
    async bootstrapOwner(email?: string, password?: string, name = 'Dueño') {
      if (!email || !password || (await users.count()) > 0) return false;
      await this.create({
        email: email.trim().toLowerCase(),
        password,
        name,
        role: 'owner',
      });
      return true;
    },
  };
}
