import { describe, it, expect } from 'vitest';
import { draftToEntries, parsePacks, parseQuantity } from './countDraft';

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

describe('parsePacks', () => {
  it('accepts non-negative decimal packs with comma or dot', () => {
    expect(parsePacks(' 3 ')).toBe(3);
    expect(parsePacks('0')).toBe(0);
    expect(parsePacks('1,5')).toBe(1.5);
    expect(parsePacks('1.5')).toBe(1.5);
    expect(parsePacks(' ')).toBeNull();
    for (const value of [
      '-1',
      'abc',
      '1,,5',
      '1e3',
      '9007199254740992',
      '9'.repeat(400),
    ]) {
      expect(parsePacks(value)).toBeNaN();
    }
  });
});

describe('draftToEntries with packs', () => {
  const sizes = new Map([['30', 12]]);

  it('adds closed packs times units per pack to the loose units', () => {
    expect(draftToEntries({ '30': '5' }, { '30': '3' }, sizes)).toEqual({
      entries: [{ productId: '30', counted: 41 }],
      invalid: [],
    });
  });

  it('counts a product with only packs typed', () => {
    expect(draftToEntries({ '30': '' }, { '30': '2' }, sizes).entries).toEqual([
      { productId: '30', counted: 24 },
    ]);
    expect(draftToEntries({}, { '30': '0' }, sizes).entries).toEqual([
      { productId: '30', counted: 0 },
    ]);
  });

  it('marks malformed packs as invalid', () => {
    for (const value of ['1,,5', 'abc']) {
      expect(draftToEntries({ '30': '5' }, { '30': value }, sizes)).toEqual({
        entries: [],
        invalid: ['30'],
      });
    }
  });

  it('rejects pack counts when the product has no pack anymore', () => {
    expect(draftToEntries({ '30': '5' }, { '30': '3' })).toEqual({
      entries: [],
      invalid: ['30'],
    });
  });

  it('rounds the total to three decimals and skips untouched products', () => {
    expect(
      draftToEntries(
        { '30': '0,1236', '14': '' },
        { '30': '1', '14': '' },
        sizes
      )
    ).toEqual({ entries: [{ productId: '30', counted: 12.124 }], invalid: [] });
  });
});

it('converts fractional packs and loose units without integer rounding', () => {
  expect(
    draftToEntries({ '30': '2' }, { '30': '1,5' }, new Map([['30', 6]]))
  ).toEqual({ entries: [{ productId: '30', counted: 11 }], invalid: [] });
});
