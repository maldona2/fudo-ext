import type { User } from '../domain/types.js';

// Explicit serialization: never spread a row or a domain object into a reply.
export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});
