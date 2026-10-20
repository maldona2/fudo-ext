import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { countsRepo } from './counts.js';
import type { NewCountRow } from '../../services/counts.js';
import { reconcileCount, summarizeLines } from '../../services/reconcile.js';

// Opt in with an isolated test database; never use the application DATABASE_URL.
const connectionString = process.env.COUNT_CHECK_TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration('count check PostgreSQL transactions', () => {
  const schema = `recount_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const repo = countsRepo(pool);
  const userId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    // Identifier is generated locally above, never taken from input.
    await admin.query(`CREATE SCHEMA ${schema}`);
    const migrations = join(process.cwd(), 'src/db/migrations');
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await pool.query(readFileSync(join(migrations, file), 'utf8'));
    }
    await pool.query(
      readFileSync(join(migrations, '005_count_checks.sql'), 'utf8')
    );
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE users, count_lists CASCADE');
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role)
      VALUES ($1, 'counter@test.local', 'Counter', 'unused', 'counter'),
             ($2, 'owner@test.local', 'Owner', 'unused', 'owner')`,
      [userId, otherUserId]
    );
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  const newCheck = () =>
    repo.insertCheck({
      userId,
      listId: null,
      entries: [{ productId: '14', counted: 8 }],
      recountIds: ['14'],
    });
  const row = (checkId: string | null): NewCountRow => {
    const countedAt = new Date();
    const lines = reconcileCount({
      now: countedAt,
      entries: [{ productId: '14', counted: 10 }],
      products: new Map([
        ['14', { name: 'Carne suave', cost: 700, systemStock: 12 }],
      ]),
      previous: new Map(),
      movements: [],
    });
    lines[0].firstCounted = checkId ? 8 : null;
    return {
      checkId,
      createdBy: userId,
      countedAt,
      note: null,
      list: null,
      lines,
      summary: summarizeLines(lines),
    };
  };

  it('retains check entries and reads nullable first counts from saved lines', async () => {
    const checkId = await newCheck();
    expect(await repo.getCheck(checkId)).toMatchObject({
      id: checkId,
      userId,
      usedAt: null,
      entries: [{ productId: '14', counted: 8 }],
      recountIds: ['14'],
    });
    expect(await repo.getCheck(randomUUID())).toBeNull();
    const id = await repo.insert(row(checkId));
    expect((await repo.get(id))!.lines[0]).toMatchObject({
      counted: 10,
      firstCounted: 8,
    });
    expect((await repo.getCheck(checkId))!.usedAt).toBeInstanceOf(Date);
    const freeId = await repo.insert(row(null));
    expect((await repo.get(freeId))!.lines[0].firstCounted).toBeNull();
  });

  it('allows exactly one of two concurrent insertions to consume a check', async () => {
    const checkId = await newCheck();
    const results = await Promise.allSettled([
      repo.insert(row(checkId)),
      repo.insert(row(checkId)),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({
      reason: {
        statusCode: 400,
        message: 'El recuento venció. Volvé a empezar.',
      },
    });
    expect(await repo.list(50)).toHaveLength(1);
  });

  it.each(['another user', 'already used', 'expired', 'missing'])(
    'rejects %s at the atomic insertion boundary',
    async (invalid) => {
      const checkId = await newCheck();
      if (invalid === 'another user')
        await pool.query('UPDATE count_checks SET user_id = $2 WHERE id = $1', [
          checkId,
          otherUserId,
        ]);
      if (invalid === 'already used')
        await pool.query(
          'UPDATE count_checks SET used_at = now() WHERE id = $1',
          [checkId]
        );
      if (invalid === 'expired')
        await pool.query(
          "UPDATE count_checks SET created_at = now() - interval '2 hours 1 second' WHERE id = $1",
          [checkId]
        );
      if (invalid === 'missing')
        await pool.query('DELETE FROM count_checks WHERE id = $1', [checkId]);
      await expect(repo.insert(row(checkId))).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(await repo.list(50)).toHaveLength(0);
    }
  );

  it('rolls check consumption back when saving a count line fails', async () => {
    const checkId = await newCheck();
    const invalid = row(checkId);
    invalid.lines[0].name = 'x'.repeat(256);
    await expect(repo.insert(invalid)).rejects.toMatchObject({ code: '22001' });
    expect((await repo.getCheck(checkId))!.usedAt).toBeNull();
    expect(await repo.list(50)).toHaveLength(0);
    await expect(repo.insert(row(checkId))).resolves.toEqual(
      expect.any(String)
    );
  });
});
