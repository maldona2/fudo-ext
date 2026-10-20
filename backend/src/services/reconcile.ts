// Stock count reconciliation. Pure: no I/O.
//
// For each counted product:
//   - with a previous count: expected = previous count + purchases − sales
//     recorded in FUDO strictly after the previous count and up to `now`;
//   - without one: expected = the stock FUDO reports right now.
// difference = counted − expected (negative = shortage).

export interface CountEntry {
  productId: string;
  counted: number;
}

export interface ProductInfo {
  name: string;
  cost: number | null;
  systemStock: number;
}

export interface PreviousCount {
  counted: number;
  countedAt: Date;
}

export interface StockMovement {
  productId: string;
  kind: 'sale' | 'purchase';
  quantity: number;
  at: Date;
}

export interface ReconcileInput {
  now: Date;
  entries: CountEntry[];
  products: Map<string, ProductInfo>;
  previous: Map<string, PreviousCount>;
  movements: StockMovement[];
}

export interface CountLine {
  productId: string;
  name: string;
  counted: number;
  firstCounted: number | null;
  systemStock: number;
  cost: number | null;
  basis: 'previous_count' | 'system';
  previous: PreviousCount | null;
  bought: number;
  sold: number;
  expected: number;
  difference: number;
  differenceValue: number | null;
}

export interface CountSummary {
  products: number;
  withDifference: number;
  missingUnits: number;
  missingValue: number;
  surplusUnits: number;
  surplusValue: number;
}

// Quantities may be fractional (kg, litres); keep 3 decimals.
const round = (n: number) => Math.round(n * 1000) / 1000;

export function reconcileCount(input: ReconcileInput): CountLine[] {
  return input.entries.map(({ productId, counted }) => {
    const product = input.products.get(productId);
    if (!product) {
      throw new Error(`Unknown product ${productId}`);
    }
    const previous = input.previous.get(productId) ?? null;

    let bought = 0;
    let sold = 0;
    if (previous) {
      for (const m of input.movements) {
        if (
          m.productId !== productId ||
          m.at <= previous.countedAt ||
          m.at > input.now
        ) {
          continue;
        }
        if (m.kind === 'purchase') bought += m.quantity;
        else sold += m.quantity;
      }
    }

    const expected = round(
      previous ? previous.counted + bought - sold : product.systemStock
    );
    const difference = round(counted - expected);

    return {
      productId,
      name: product.name,
      counted,
      firstCounted: null,
      systemStock: product.systemStock,
      cost: product.cost,
      basis: previous ? 'previous_count' : 'system',
      previous,
      bought: round(bought),
      sold: round(sold),
      expected,
      difference,
      differenceValue:
        product.cost === null ? null : round(difference * product.cost),
    };
  });
}

export function summarizeLines(lines: CountLine[]): CountSummary {
  const summary: CountSummary = {
    products: lines.length,
    withDifference: 0,
    missingUnits: 0,
    missingValue: 0,
    surplusUnits: 0,
    surplusValue: 0,
  };
  for (const line of lines) {
    if (line.difference === 0) continue;
    summary.withDifference += 1;
    const value = Math.abs(line.differenceValue ?? 0);
    if (line.difference < 0) {
      summary.missingUnits = round(summary.missingUnits - line.difference);
      summary.missingValue = round(summary.missingValue + value);
    } else {
      summary.surplusUnits = round(summary.surplusUnits + line.difference);
      summary.surplusValue = round(summary.surplusValue + value);
    }
  }
  return summary;
}
