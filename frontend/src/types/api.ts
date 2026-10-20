export type Role = 'owner' | 'counter';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active?: boolean;
}

export interface CountProduct {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
}

export interface CountSummary {
  products: number;
  withDifference: number;
  missingUnits: number;
  missingValue: number;
  surplusUnits: number;
  surplusValue: number;
}

export interface CountRecord {
  id: string;
  countedAt: string;
  createdBy: { id: string; name: string };
  note: string | null;
  summary: CountSummary;
}

export interface CountLine {
  productId: string;
  name: string;
  counted: number;
  systemStock: number;
  cost: number | null;
  basis: 'previous_count' | 'system';
  previous: { counted: number; countedAt: string } | null;
  bought: number;
  sold: number;
  expected: number;
  difference: number;
  differenceValue: number | null;
}

export interface CountDetail extends CountRecord {
  lines: CountLine[];
}

export interface ShrinkageRow {
  productId: string;
  name: string;
  counts: number;
  missingUnits: number;
  missingValue: number;
  lastCountedAt: string;
}
