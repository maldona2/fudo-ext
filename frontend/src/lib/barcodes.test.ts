import { describe, it, expect } from 'vitest';
import { normalizeBarcode, resolveBarcode } from './barcodes';

describe('retail barcode normalization', () => {
  it.each([
    [' 2000000000015 ', '2000000000015'],
    ['036000291452', '0036000291452'],
    ['0036000291452', '0036000291452'],
    ['96385074', '96385074'],
    ...[
      '2000000000016',
      '200 0000000015',
      'https://example.com',
      '',
      '1234567',
      '123456789',
      '12345678901',
      '12345678901234',
      'abcdefgh',
      '0'.repeat(65),
    ].map((value) => [value, null]),
  ])('normalizes %s safely', (raw, expected) => {
    expect(normalizeBarcode(raw!)).toBe(expected);
  });
});

describe('barcode resolution', () => {
  const catalog = [
    {
      id: '14',
      name: 'A',
      barcodes: ['0036000291452'],
      code: '2000000000022',
      category: null,
      pack: null,
    },
  ];
  it('resolves UPC through canonical EAN without using internal codes', () => {
    expect(resolveBarcode('036000291452', catalog, null)).toEqual({
      kind: 'match',
      productId: '14',
    });
    expect(resolveBarcode('2000000000022', catalog, null)).toEqual({
      kind: 'unknown',
    });
  });
  it('rejects invalid, unknown, ambiguous and out-of-scope matches', () => {
    expect(resolveBarcode('bad', catalog, null)).toEqual({ kind: 'invalid' });
    expect(resolveBarcode('2000000000015', catalog, null)).toEqual({
      kind: 'unknown',
    });
    expect(
      resolveBarcode(
        '036000291452',
        [...catalog, { ...catalog[0], id: '16' }],
        null
      )
    ).toEqual({ kind: 'ambiguous' });
    expect(resolveBarcode('036000291452', catalog, new Set(['16']))).toEqual({
      kind: 'out-of-scope',
    });
  });
});
