// What the counter typed, by product id. Empty means "not counted".
export type CountDraft = Record<string, string>;
export type PackDraft = Record<string, string>;

const QUANTITY = /^\d+([.,]\d+)?$/;

export function parseQuantity(text: string): number | null {
  const value = text.trim();
  if (value === '') return null;
  if (!QUANTITY.test(value)) return NaN;
  return Number(value.replace(',', '.'));
}

export function parsePacks(text: string): number | null {
  const parsed = parseQuantity(text);
  if (parsed === null) return null;
  return Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER
    ? parsed
    : NaN;
}

export function draftToEntries(
  draft: CountDraft,
  packs: PackDraft = {},
  unitsPerPack: Map<string, number> = new Map()
) {
  const entries: { productId: string; counted: number }[] = [];
  const invalid: string[] = [];
  for (const productId of new Set([
    ...Object.keys(draft),
    ...Object.keys(packs),
  ])) {
    const loose = parseQuantity(draft[productId] ?? '');
    const closed = parsePacks(packs[productId] ?? '');
    if (loose === null && closed === null) continue;
    const size = unitsPerPack.get(productId);
    const counted = (loose ?? 0) + (closed ?? 0) * (size ?? 0);
    if (
      !Number.isFinite(counted) ||
      Number.isNaN(closed) ||
      (closed !== null && size === undefined)
    )
      invalid.push(productId);
    else entries.push({ productId, counted: Number(counted.toFixed(3)) });
  }
  return { entries, invalid };
}
