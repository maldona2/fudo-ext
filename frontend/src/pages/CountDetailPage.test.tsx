import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const get = vi.fn();
let role: 'owner' | 'counter' = 'owner';

vi.mock('@/lib/api', () => ({
  counts: { get: (...args: unknown[]) => get(...args) },
  errorMessage: () => 'No se pudo cargar.',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', email: 'owner@example.com', name: 'Dueño', role },
  }),
}));

import { CountDetailPage } from './CountDetailPage';

const count = {
  id: 'count-1',
  countedAt: '2026-10-20T12:00:00.000Z',
  createdBy: { id: 'counter-1', name: 'Contador' },
  note: null,
  list: null,
  summary: {
    products: 1,
    withDifference: 0,
    missingUnits: 0,
    missingValue: 0,
    surplusUnits: 0,
    surplusValue: 0,
  },
  lines: [
    {
      productId: '16',
      name: 'Pollo',
      counted: 4,
      firstCounted: 3,
      systemStock: 4,
      cost: 10,
      basis: 'system' as const,
      previous: null,
      bought: 0,
      sold: 0,
      expected: 4,
      difference: 0,
      differenceValue: null,
    },
  ],
};

describe('CountDetailPage', () => {
  beforeEach(() => {
    role = 'owner';
    get.mockReset().mockResolvedValue(count);
  });

  it('shows the first count only to the owner', async () => {
    render(
      <MemoryRouter initialEntries={['/panel/conteos/count-1']}>
        <Routes>
          <Route path="/panel/conteos/:id" element={<CountDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const line = await screen.findByText('Pollo: 4');
    expect(line.closest('li')).toHaveTextContent('1er conteo: 3');
  });

  it('does not show the first count to a counter', async () => {
    role = 'counter';
    render(
      <MemoryRouter initialEntries={['/panel/conteos/count-1']}>
        <Routes>
          <Route path="/panel/conteos/:id" element={<CountDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Pollo: 4');
    expect(screen.queryByText(/1er conteo/)).not.toBeInTheDocument();
  });
});
