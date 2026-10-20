import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const create = vi.fn();

vi.mock('@/lib/api', () => ({
  products: {
    listForCount: async () => [
      { id: '14', name: 'Carne suave', code: '51', category: 'Empanadas' },
      { id: '16', name: 'Pollo', code: '53', category: 'Empanadas' },
    ],
  },
  counts: { create: (...args: unknown[]) => create(...args) },
  errorMessage: () => 'Algo salió mal. Probá de nuevo.',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u', email: 'v@x.com', name: 'Vanessa', role: 'counter' },
  }),
}));

import { CountPage } from './CountPage';

describe('CountPage', () => {
  beforeEach(() => {
    localStorage.clear();
    create.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('sends only the products that were counted', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText(/Carne suave/), '10');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '14', counted: 10 }],
    });
  });

  it('confirms the save to a counter without showing any result', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText(/Pollo/), '3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(await screen.findByText('Conteo guardado ✓')).toBeInTheDocument();
    expect(screen.queryByText(/Faltan|Sobran|sistema/)).not.toBeInTheDocument();
  });

  it('does not save while a quantity cannot be read', async () => {
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText(/Pollo/), 'tres');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('no se entienden');
  });

  it('keeps the typed quantities after a reload', async () => {
    const first = render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    await userEvent.type(await screen.findByLabelText(/Pollo/), '7');
    first.unmount();

    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText(/Pollo/)).toHaveValue('7');
  });
});
