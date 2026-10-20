import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse battery');

    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(
      true
    );
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse battery');

    await expect(verifyPassword('correct horse batterx', hash)).resolves.toBe(
      false
    );
  });

  it('never stores the password in clear and salts every hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');

    expect(a).not.toContain('same password');
    expect(a).not.toBe(b);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});
