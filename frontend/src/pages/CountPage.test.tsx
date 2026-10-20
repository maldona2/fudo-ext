import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const create = vi.fn();
let cocaPack: { units: number; label: string } | null = null;

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
        pack: cocaPack,
      },
    ],
  },
  countLists: {
    list: async () => [
      {
        id: 'list-1',
        name: 'Diario - alto riesgo',
        productIds: ['30', '999', '16'],
      },
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
    cocaPack = { units: 6, label: 'fardo' };
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

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Carne suave/ }),
      '10'
    );
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

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      '3'
    );
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

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      'tres'
    );
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
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      '7'
    );
    first.unmount();

    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('textbox', { name: /Pollo/ })).toHaveValue(
      '7'
    );
  });

  it('shows only the products of the chosen list and saves the count with it', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Carne suave/ }),
      '10'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Diario - alto riesgo' })
    );

    expect(
      screen.queryByRole('textbox', { name: /Carne suave/ })
    ).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /Pollo/ }), '3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    // Carne suave was typed before switching: it is outside the list now.
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '16', counted: 3 }],
      listId: 'list-1',
    });
  });

  it('shows how many products of the list are counted', async () => {
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Diario - alto riesgo' })
    );

    expect(screen.getByText('Llevás 0 de 2')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Sueltas de Coca 1.5L'), '2');
    expect(screen.getByText('Llevás 1 de 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Contado: Coca 1.5L')).toBeInTheDocument();
  });

  it('marks a product as zero with "No hay ninguno"', async () => {
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'No hay ninguno: Pollo' })
    );
    expect(screen.getByRole('textbox', { name: /Pollo/ })).toHaveValue('0');
    expect(screen.getByLabelText('Contado: Pollo')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '16', counted: 0 }],
    });
  });

  it('sets loose to 0 and clears packs for a product with a pack', async () => {
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
    await userEvent.click(
      screen.getByRole('button', { name: 'No hay ninguno: Coca 1.5L' })
    );
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('');
    expect(screen.getByLabelText('Sueltas de Coca 1.5L')).toHaveValue('0');
    expect(screen.getByText('= 0 u.')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '30', counted: 0 }],
    });
  });

  it('lists the products of a list in walking order without category groups', async () => {
    cocaPack = null;
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Diario - alto riesgo' })
    );
    expect(screen.getAllByRole('textbox').map((input) => input.id)).toEqual([
      'q-30',
      'q-16',
    ]);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    ).toEqual(['Diario - alto riesgo']);
    await userEvent.type(screen.getByRole('searchbox'), 'Pollo');
    expect(screen.getAllByRole('textbox').map((input) => input.id)).toEqual([
      'q-16',
    ]);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Todos los productos' })
    );
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    ).toEqual(['Empanadas', 'Bebidas']);
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

  it('lets the counter discard stale packs explicitly and submit preserved loose units', async () => {
    cocaPack = null;
    create.mockResolvedValue({ id: 'c1' });
    localStorage.setItem('count-draft-packs', '{"30":"3"}');
    localStorage.setItem('count-draft', '{"30":"2"}');
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    const loose = await screen.findByRole('textbox', { name: /Coca 1.5L/ });
    expect(loose).toHaveValue('2');
    expect(
      screen.getByText(/Ya no hay un bulto configurado/)
    ).toHaveTextContent('3');
    expect(localStorage.getItem('count-draft-packs')).toBe('{"30":"3"}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar bultos de Coca 1.5L' })
    );
    expect(loose).toHaveValue('2');
    expect(localStorage.getItem('count-draft-packs')).toBe('{}');
    expect(localStorage.getItem('count-draft')).toBe('{"30":"2"}');
    expect(
      screen.queryByText(/Ya no hay un bulto configurado/)
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '30', counted: 2 }],
    });
  });
});
