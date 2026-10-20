import type { CountLine, CountSummary } from '../services/reconcile.js';

export type Role = 'owner' | 'counter';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface CountProduct {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
}

export interface CountRecord {
  id: string;
  countedAt: Date;
  createdBy: { id: string; name: string };
  note: string | null;
  summary: CountSummary;
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
  lastCountedAt: Date;
}

export interface NewCount {
  entries: { productId: string; counted: number }[];
  note?: string;
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: Role;
}

// What the HTTP layer needs from the services. Implemented in services/,
// faked in route tests.
export interface Services {
  auth: {
    login(
      email: string,
      password: string
    ): Promise<{ user: User; token: string } | null>;
    userForToken(token: string): Promise<User | null>;
    logout(token: string): Promise<void>;
  };
  users: {
    list(): Promise<User[]>;
    create(input: NewUser): Promise<User>;
  };
  products: {
    listForCount(): Promise<CountProduct[]>;
  };
  counts: {
    create(
      user: User,
      input: NewCount
    ): Promise<{ id: string; summary: CountSummary }>;
    list(limit: number): Promise<CountRecord[]>;
    get(id: string): Promise<CountDetail | null>;
    shrinkage(days: number): Promise<ShrinkageRow[]>;
  };
  health(): Promise<void>;
}
