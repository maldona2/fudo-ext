import { describe, expect, it } from 'vitest';
import { reorderProducts } from './reorderProducts';

describe('reorderProducts', () => {
  it('moves items across multiple positions in either direction', () => {
    expect(reorderProducts(['14', '16', '30'], '30', '14')).toEqual([
      '30',
      '14',
      '16',
    ]);
    expect(reorderProducts(['14', '16', '30'], '14', '30')).toEqual([
      '16',
      '30',
      '14',
    ]);
  });

  it('preserves the order for cancelled, same, or unknown targets', () => {
    for (const overId of [null, '14', 'missing']) {
      expect(reorderProducts(['14', '16', '30'], '14', overId)).toEqual([
        '14',
        '16',
        '30',
      ]);
    }
    expect(reorderProducts(['14', '16'], 'missing', '14')).toEqual([
      '14',
      '16',
    ]);
  });
});
