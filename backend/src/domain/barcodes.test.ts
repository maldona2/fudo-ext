import { normalizeBarcode } from './barcodes.js';

describe('retail barcode normalization', () => {
  it.each([
    [' 2000000000015 ', '2000000000015'],
    ['036000291452', '0036000291452'],
    ['0036000291452', '0036000291452'],
    ['96385074', '96385074'],
    ...['2000000000016', '200 0000000015', 'https://example.com', '', '1234567', '123456789', '12345678901', '12345678901234', 'abcdefgh', '0'.repeat(65)].map(value => [value, null]),
  ])('normalizes %s safely', (raw, expected) => {
    expect(normalizeBarcode(raw!)).toBe(expected);
  });
});
