import { createRateLimiter } from './rateLimit.js';

describe('createRateLimiter', () => {
  it('allows up to max hits per key inside the window, then blocks', () => {
    let now = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 2,
      now: () => now,
    });

    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('b')).toBe(true);
  });

  it('allows the key again once the window has passed', () => {
    let now = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      now: () => now,
    });

    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);
    now = 1001;
    expect(limiter.hit('a')).toBe(true);
  });
});
