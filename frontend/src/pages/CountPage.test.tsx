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
      {
        id: '30',
        name: 'Coca 1.5L',
        code: '7',
        category: 'Bebidas',
        pack: { units: 6, label: 'fardo' },
      },
    ],
  },
  countLists: {
    list: async () => [
      { id: 'list-1', name: 'Diario - alto riesgo', productIds: ['16', '30'] },
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

  it('shows only the products of the chosen list and saves the count with it', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText(/Carne suave/), '10');
    await userEvent.click(
      screen.getByRole('button', { name: 'Diario - alto riesgo' })
    );

    expect(screen.queryByLabelText(/Carne suave/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Pollo/), '3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    // Carne suave was typed before switching: it is outside the list now.
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '16', counted: 3 }],
      listId: 'list-1',
    });
  });

  it('shows packs and loose fields for products with a pack and sends the total', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    await userEvent.type(
      await screen.findByLabelText('Fardos de Coca 1.5L'),
      '3'
    );
    await userEvent.type(screen.getByLabelText('Sueltas de Coca 1.5L'), '2');
    expect(screen.getByText('= 20 u.')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '30', counted: 20 }],
    });
    expect(localStorage.getItem('count-draft-packs')).toBe('{}');
    expect(localStorage.getItem('count-draft')).toBe('{}');
  });

  it('adds one pack with the +1 button', async () => {
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    const button = await screen.findByRole('button', { name: '+1 fardo' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('2');
    expect(screen.getByText('= 12 u.')).toBeInTheDocument();
  });

  it('keeps packs typed after a reload', async () => {
    const first = render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    await userEvent.type(
      await screen.findByLabelText('Fardos de Coca 1.5L'),
      '3'
    );
    expect(localStorage.getItem('count-draft-packs')).toBe('{"30":"3"}');
    first.unmount();
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Fardos de Coca 1.5L')).toHaveValue(
      '3'
    );
  });

  it('marks invalid packs and blocks saving without displaying a false total', async () => {
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    const packs = await screen.findByLabelText('Fardos de Coca 1.5L');
    await userEvent.type(packs, '1,5');
    expect(packs).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/= .* u\./)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('no se entienden');
  });

  it('keeps old loose drafts readable for a product that now has a pack', async () => {
    localStorage.setItem('count-draft', '{"30":"5"}');
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Sueltas de Coca 1.5L')).toHaveValue(
      '5'
    );
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('');
    expect(screen.getByText('= 5 u.')).toBeInTheDocument();
  });
});
