import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const create = vi.fn();
const remove = vi.fn();

vi.mock('@/lib/api', () => ({
  products: {
    listForCount: async () => [
      { id: '14', name: 'Carne suave', code: '51', category: 'Empanadas' },
      { id: '16', name: 'Pollo', code: '53', category: 'Empanadas' },
    ],
  },
  countLists: {
    list: async () => [{ id: 'list-1', name: 'Diario', productIds: ['14'] }],
    create: (...args: unknown[]) => create(...args),
    update: vi.fn(),
    remove: (...args: unknown[]) => remove(...args),
  },
  errorMessage: () => 'Ya existe una lista con ese nombre.',
}));

import { ListsPage } from './ListsPage';

describe('ListsPage', () => {
  beforeEach(() => {
    create.mockReset();
    remove.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('creates a list with the name and the ticked products', async () => {
    create.mockResolvedValue({
      id: 'list-2',
      name: 'Riesgo',
      productIds: ['16'],
    });
    render(<ListsPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva lista' })
    );
    await userEvent.type(screen.getByLabelText('Nombre de la lista'), 'Riesgo');
    await userEvent.click(screen.getByRole('checkbox', { name: /Pollo/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar lista' })
    );

    expect(create).toHaveBeenCalledWith({ name: 'Riesgo', productIds: ['16'] });
  });

  it('does not save a list without products', async () => {
    render(<ListsPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva lista' })
    );
    await userEvent.type(screen.getByLabelText('Nombre de la lista'), 'Vacía');

    expect(
      screen.getByRole('button', { name: 'Guardar lista' })
    ).toBeDisabled();
  });

  it('shows the error copy when the save fails', async () => {
    create.mockRejectedValue(new Error('409'));
    render(<ListsPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva lista' })
    );
    await userEvent.type(screen.getByLabelText('Nombre de la lista'), 'Diario');
    await userEvent.click(screen.getByRole('checkbox', { name: /Pollo/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar lista' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una lista con ese nombre.'
    );
  });

  it('deletes a list after confirmation', async () => {
    remove.mockResolvedValue(undefined);
    render(<ListsPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Borrar Diario' })
    );

    expect(remove).toHaveBeenCalledWith('list-1');
  });
});
