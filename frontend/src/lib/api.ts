import axios, { isAxiosError } from 'axios';
import type {
  ProductBarcode,
  CountDetail,
  CountList,
  CountProduct,
  CountRecord,
  CountSummary,
  Role,
  ShrinkageRow,
  User,
} from '@/types/api';

// Same origin in production: nginx proxies /api to the backend, so the
// httpOnly session cookie travels without any cross-site setup.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Auth: prefer httpOnly cookies issued by the backend, and set
// `withCredentials: true` above. Do not read tokens from localStorage —
// see .ai/global/rules/40-frontend-security.md.

// Server error text is never rendered: map status codes to our own copy.
export function errorMessage(err: unknown): string {
  const status = isAxiosError(err) ? err.response?.status : undefined;
  switch (status) {
    case 400:
      if (
        isAxiosError(err) &&
        err.response?.data?.error?.message ===
          'El recuento venció. Volvé a empezar.'
      ) {
        return 'El recuento venció. Volvé a empezar.';
      }
      return 'Revisá los datos ingresados.';
    case 401:
      return 'Tu sesión venció. Volvé a ingresar.';
    case 403:
      return 'No tenés permiso para ver esto.';
    case 404:
      return 'No se encontró lo que buscabas.';
    case 409:
      return 'Ya existe un usuario con ese email.';
    case 429:
      return 'Demasiados intentos. Esperá unos minutos.';
    case 502:
      return 'No se pudo leer FUDO. Probá de nuevo en un rato.';
    default:
      return 'Algo salió mal. Probá de nuevo.';
  }
}

export const isUnauthorized = (err: unknown) =>
  isAxiosError(err) && err.response?.status === 401;

export const auth = {
  login: (email: string, password: string) =>
    api
      .post<{ user: User }>('/auth/login', { email, password })
      .then((r) => r.data.user),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user),
  logout: () => api.post('/auth/logout').then(() => undefined),
};

export const products = {
  listForCount: () =>
    api
      .get<{ products: CountProduct[] }>('/products')
      .then((r) => r.data.products),
};

export const productBarcodes = {
  save: (value: ProductBarcode) =>
    api.put('/product-barcodes', value).then(() => undefined),
  remove: ({ productId, barcode }: ProductBarcode) =>
    api
      .delete(
        `/product-barcodes/${encodeURIComponent(productId)}/${encodeURIComponent(barcode)}`
      )
      .then(() => undefined),
};

export const productPacks = {
  save: (packs: { productId: string; units: number; label: string }[]) =>
    api.put('/product-packs', { packs }).then(() => undefined),
  remove: (productId: string) =>
    api
      .delete(`/product-packs/${encodeURIComponent(productId)}`)
      .then(() => undefined),
};

export const counts = {
  check: (input: {
    entries: { productId: string; counted: number }[];
    listId?: string;
  }) =>
    api
      .post<{ checkId: string; recount: string[] }>('/counts/check', input)
      .then((r) => r.data),
  create: (input: {
    entries: { productId: string; counted: number }[];
    note?: string;
    listId?: string;
    checkId?: string;
  }) =>
    api
      .post<{ id: string; summary?: CountSummary }>('/counts', input)
      .then((r) => r.data),
  list: (limit = 50) =>
    api
      .get<{ counts: CountRecord[] }>('/counts', { params: { limit } })
      .then((r) => r.data.counts),
  get: (id: string) =>
    api
      .get<{ count: CountDetail }>(`/counts/${encodeURIComponent(id)}`)
      .then((r) => r.data.count),
  shrinkage: (days = 30) =>
    api
      .get<{ days: number; products: ShrinkageRow[] }>('/reports/shrinkage', {
        params: { days },
      })
      .then((r) => r.data.products),
};

export const countLists = {
  list: () =>
    api.get<{ lists: CountList[] }>('/count-lists').then((r) => r.data.lists),
  create: (input: { name: string; productIds: string[] }) =>
    api
      .post<{ list: CountList }>('/count-lists', input)
      .then((r) => r.data.list),
  update: (id: string, input: { name: string; productIds: string[] }) =>
    api
      .put<{ list: CountList }>(`/count-lists/${encodeURIComponent(id)}`, input)
      .then((r) => r.data.list),
  remove: (id: string) =>
    api.delete(`/count-lists/${encodeURIComponent(id)}`).then(() => undefined),
};

export const users = {
  list: () => api.get<{ users: User[] }>('/users').then((r) => r.data.users),
  create: (input: {
    email: string;
    name: string;
    password: string;
    role: Role;
  }) => api.post<{ user: User }>('/users', input).then((r) => r.data.user),
};

export default api;
