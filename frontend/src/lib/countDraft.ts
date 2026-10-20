// What the counter typed, by product id. Empty means "not counted".
export type CountDraft = Record<string, string>;

const QUANTITY = /^\d+([.,]\d+)?$/;

export function parseQuantity(text: string): number | null {
  const value = text.trim();
  if (value === '') return null;
  if (!QUANTITY.test(value)) return NaN;
  return Number(value.replace(',', '.'));
}

export function draftToEntries(draft: CountDraft) {
  const entries: { productId: string; counted: number }[] = [];
  const invalid: string[] = [];
  for (const [productId, text] of Object.entries(draft)) {
    const counted = parseQuantity(text);
    if (counted === null) continue;
    if (Number.isNaN(counted)) invalid.push(productId);
    else entries.push({ productId, counted });
  }
  return { entries, invalid };
}
