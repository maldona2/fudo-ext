import { describe, it, expect } from 'vitest';
import { draftToEntries, parseQuantity } from './countDraft';

describe('parseQuantity', () => {
  it('accepts integers and decimals with comma or dot', () => {
    expect(parseQuantity('10')).toBe(10);
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity(' 2.25 ')).toBe(2.25);
  });

  it('returns null for empty input: the product was not counted', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('   ')).toBeNull();
  });

  it('returns NaN for anything that is not a non-negative number', () => {
    expect(parseQuantity('-1')).toBeNaN();
    expect(parseQuantity('abc')).toBeNaN();
    expect(parseQuantity('1,2,3')).toBeNaN();
  });
});

describe('draftToEntries', () => {
  it('sends only counted products, zero included', () => {
    expect(draftToEntries({ '14': '10', '15': '', '16': '0' })).toEqual({
      entries: [
        { productId: '14', counted: 10 },
        { productId: '16', counted: 0 },
      ],
      invalid: [],
    });
  });

  it('reports the products whose quantity cannot be read', () => {
    expect(draftToEntries({ '14': 'diez', '15': '3' })).toEqual({
      entries: [{ productId: '15', counted: 3 }],
      invalid: ['14'],
    });
  });
});
