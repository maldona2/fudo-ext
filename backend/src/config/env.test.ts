import { loadConfig } from './env.js';

describe('recount threshold configuration', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env = {
      ...original,
      FUDO_API_KEY: 'test-key',
      FUDO_API_SECRET: 'test-secret',
    };
    delete process.env.RECOUNT_MIN_DIFFERENCE;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to one unit', () => {
    expect(loadConfig().recountMinDifference).toBe(1);
  });
  it('accepts a positive fractional threshold', () => {
    process.env.RECOUNT_MIN_DIFFERENCE = '0.5';
    expect(loadConfig().recountMinDifference).toBe(0.5);
  });
  it.each(['0', '-1', 'NaN', 'abc', 'Infinity', ' '])(
    'fails closed for %s',
    (value) => {
      process.env.RECOUNT_MIN_DIFFERENCE = value;
      expect(loadConfig).toThrow(
        'RECOUNT_MIN_DIFFERENCE must be a positive number'
      );
    }
  );
});
