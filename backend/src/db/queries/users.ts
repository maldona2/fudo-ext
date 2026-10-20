import type { Pool } from 'pg';
import type { Role, User } from '../../domain/types.js';
import type { SessionsRepo, UsersRepo } from '../../services/auth.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  active: r.active,
});

export function usersRepo(pool: Pool): UsersRepo {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query<UserRow & { password_hash: string }>(
        `SELECT id, email, name, role, active, password_hash
           FROM users WHERE email = $1`,
        [email]
      );
      return rows[0]
        ? { user: toUser(rows[0]), passwordHash: rows[0].password_hash }
        : null;
    },
    async list() {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, name, role, active FROM users ORDER BY name`
      );
      return rows.map(toUser);
    },
    async insert({ email, name, passwordHash, role }) {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, active`,
        [email, name, passwordHash, role]
      );
      return toUser(rows[0]);
    },
    async count() {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM users`
      );
      return Number(rows[0].n);
    },
  };
}

export function sessionsRepo(pool: Pool): SessionsRepo {
  return {
    async insert({ tokenHash, userId, expiresAt }) {
      await pool.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)`,
        [tokenHash, userId, expiresAt]
      );
    },
    async findUser(tokenHash, now) {
      const { rows } = await pool.query<UserRow>(
        `SELECT u.id, u.email, u.name, u.role, u.active
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now]
      );
      return rows[0] ? toUser(rows[0]) : null;
    },
    async delete(tokenHash) {
      await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [
        tokenHash,
      ]);
    },
  };
}
