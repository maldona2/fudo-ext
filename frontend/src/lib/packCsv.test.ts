import { describe, expect, it } from 'vitest';
import type { CountProduct } from '@/types/api';
import { parsePackCsv } from './packCsv';

const products: CountProduct[] = [
  { id: '30', name: 'Cóca 354', code: '30', category: 'Bebidas', pack: null },
  { id: '7', name: 'Agua', code: '7', category: 'Bebidas', pack: null },
];

describe('parsePackCsv', () => {
  it('matches by code or by name ignoring accents and case', () => {
    expect(parsePackCsv('COCA 354;24;cajón\n7\t6\tfardo', products)).toEqual({
      packs: [
        { productId: '30', units: 24, label: 'cajón' },
        { productId: '7', units: 6, label: 'fardo' },
      ],
      errors: [],
    });
  });

  it('skips a header row and blank lines and defaults the label', () => {
    expect(
      parsePackCsv('\nproducto;unidades;etiqueta\n\n7,2\n', products)
    ).toEqual({
      packs: [{ productId: '7', units: 2, label: 'bulto' }],
      errors: [],
    });
  });

  it('reports unknown products, invalid units and ambiguous names with their line number', () => {
    const result = parsePackCsv(
      'Inexistente;10\nCoca 354;1\nAgua;6\n30;1001\n30;2.5\n30;abc',
      [...products, { ...products[1], id: '8', code: '8' }]
    );
    expect(result.packs).toEqual([]);
    expect(result.errors.map((error) => error.line)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(result.errors.every((error) => error.text.length > 0)).toBe(true);
  });

  it('accepts the upper boundary and resolves an exact code before a name', () => {
    expect(
      parsePackCsv('7;1000', [...products, { ...products[0], name: '7' }]).packs
    ).toEqual([{ productId: '7', units: 1000, label: 'bulto' }]);
  });

  it('reports duplicate products and malformed rows instead of submitting invalid batches', () => {
    const result = parsePackCsv(
      '7;6\nAgua;12\n30;24;cajón;extra\n30;24;' + 'a'.repeat(21),
      products
    );
    expect(result.packs).toEqual([
      { productId: '7', units: 6, label: 'bulto' },
    ]);
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 4]);
  });
});
