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
  // List used for the count, as it was named then (null: free count).
  list: { id: string | null; name: string } | null;
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
  listId?: string;
}

// A saved selection of products to count together (e.g. daily high-risk).
export interface CountList {
  id: string;
  name: string;
  productIds: string[];
}

export interface CountListInput {
  name: string;
  productIds: string[];
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
  countLists: {
    list(): Promise<CountList[]>;
    create(input: CountListInput): Promise<CountList>;
    update(id: string, input: CountListInput): Promise<CountList | null>;
    remove(id: string): Promise<boolean>;
  };
  health(): Promise<void>;
}
