// Validate retail identifiers without losing leading zeroes.
export function normalizeBarcode(raw: string): string | null {
  if (raw.length > 64) return null;
  const value = raw.trim();
  if (!/^(?:[0-9]{8}|[0-9]{12}|[0-9]{13})$/.test(value)) return null;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0
    );
  if ((10 - (sum % 10)) % 10 !== check) return null;
  return value.length === 12 ? `0${value}` : value;
}
