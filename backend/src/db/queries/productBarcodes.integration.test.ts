import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { productBarcodesRepo } from './productBarcodes.js';
const connectionString = process.env.BARCODE_TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;
integration('barcode PostgreSQL ownership', () => {
  const schema = `barcode_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({connectionString});
  const pool = new Pool({connectionString, options: `-c search_path=${schema}`});
  const repo = productBarcodesRepo(pool);
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const migration = readFileSync('src/db/migrations/006_product_barcodes.sql', 'utf8');
    await pool.query(migration);
    await pool.query(migration);
  });
  beforeEach(async () => { await pool.query('TRUNCATE product_barcodes'); });
  afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  it('keeps exactly one owner during concurrent assignments', async () => {
    const results = await Promise.all(['14','16'].map(productId => repo.add({productId, barcode:'2000000000015'})));
    expect(results.sort()).toEqual(['conflict','created']);
    const all = await repo.all();
    expect([...all.values()].flat()).toEqual(['2000000000015']);
  });
  it('is idempotent and removes only the requested association', async () => {
    const value = {productId:'14', barcode:'2000000000015'};
    expect(await repo.add(value)).toBe('created');
    expect(await repo.add(value)).toBe('exists');
    expect(await repo.remove({...value,productId:'16'})).toBe(false);
    expect((await repo.all()).get('14')).toEqual([value.barcode]);
    expect(await repo.remove(value)).toBe(true);
    expect(await repo.all()).toEqual(new Map());
  });
});
