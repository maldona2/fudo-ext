import { normalize } from '@/lib/format';
import type { CountProduct } from '@/types/api';

export interface PackInput {
  productId: string;
  units: number;
  label: string;
}

export function parsePackCsv(text: string, products: CountProduct[]) {
  const packs: PackInput[] = [];
  const errors: { line: number; text: string }[] = [];
  const seen = new Set<string>();
  let firstRow = true;
  for (const [index, row] of text.split(/\r?\n/).entries()) {
    if (!row.trim()) continue;
    const fields = row.split(/[;,\t]/).map((field) => field.trim());
    const [identifier, quantity, rawLabel] = fields;
    if (
      firstRow &&
      normalize(identifier) === 'producto' &&
      normalize(quantity ?? '') === 'unidades'
    ) {
      firstRow = false;
      continue;
    }
    firstRow = false;
    const codes = products.filter((product) => product.code === identifier);
    const matches = codes.length
      ? codes
      : products.filter(
          (product) => normalize(product.name) === normalize(identifier)
        );
    const units = Number(quantity);
    const label = rawLabel || 'bulto';
    let error: string | null = null;
    if (fields.length < 2 || fields.length > 3)
      error = 'Usá producto;unidades;etiqueta.';
    else if (!matches.length)
      error = `No se encontró el producto “${identifier}”.`;
    else if (matches.length > 1)
      error = `El nombre “${identifier}” es ambiguo. Usá el código FUDO.`;
    else if (
      !/^\d+$/.test(quantity) ||
      !Number.isInteger(units) ||
      units < 2 ||
      units > 1000
    )
      error = 'Las unidades deben ser un entero entre 2 y 1000.';
    else if (label.length > 20)
      error = 'La etiqueta debe tener hasta 20 caracteres.';
    else if (seen.has(matches[0].id))
      error = `El producto “${identifier}” ya aparece en la planilla.`;
    else if (packs.length >= 2000) error = 'Importá hasta 2000 bultos por vez.';
    if (error) errors.push({ line: index + 1, text: error });
    else {
      packs.push({ productId: matches[0].id, units, label });
      seen.add(matches[0].id);
    }
  }
  return { packs, errors };
}
