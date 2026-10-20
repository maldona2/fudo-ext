import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { save, remove, listForCount } = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  listForCount: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  products: { listForCount },
  productPacks: { save, remove },
  errorMessage: () => 'Algo salió mal. Probá de nuevo.',
}));
import { PacksPage } from './PacksPage';

describe('PacksPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    save.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    listForCount.mockResolvedValue([
      {
        id: '30',
        name: 'Coca 354',
        code: '30',
        category: 'Bebidas',
        pack: { units: 6, label: 'bulto' },
      },
      { id: '7', name: 'Agua', code: '7', category: null, pack: null },
    ]);
  });

  it('saves the units typed for a product', async () => {
    render(<PacksPage />);
    const row = within(await screen.findByRole('group', { name: 'Coca 354' }));
    const units = row.getByLabelText('Unidades por bulto');
    await userEvent.clear(units);
    await userEvent.type(units, '24');
    const label = row.getByLabelText('Etiqueta');
    await userEvent.clear(label);
    await userEvent.type(label, 'cajón');
    await userEvent.click(row.getByRole('button', { name: 'Guardar' }));
    expect(save).toHaveBeenCalledWith([
      { productId: '30', units: 24, label: 'cajón' },
    ]);
    expect(await screen.findByText('Bulto guardado.')).toBeInTheDocument();
  });

  it('imports a pasted sheet and lists the rows it could not read', async () => {
    render(<PacksPage />);
    const sheet = await screen.findByLabelText('Planilla de bultos');
    await userEvent.click(sheet);
    await userEvent.paste('Coca 354;24;cajón\n7;6;fardo\nInexistente;12');
    expect(screen.getByRole('alert')).toHaveTextContent('Línea 3:');
    await userEvent.click(
      screen.getByRole('button', { name: 'Importar 2 bultos' })
    );
    expect(save).toHaveBeenCalledWith([
      { productId: '30', units: 24, label: 'cajón' },
      { productId: '7', units: 6, label: 'fardo' },
    ]);
    expect(await screen.findByText('Bultos importados.')).toBeInTheDocument();
    expect(sheet).toHaveValue('');
  });

  it('removes a pack', async () => {
    render(<PacksPage />);
    const row = within(await screen.findByRole('group', { name: 'Coca 354' }));
    await userEvent.click(row.getByRole('button', { name: 'Quitar' }));
    expect(remove).toHaveBeenCalledWith('30');
    expect(await screen.findByText('Bulto quitado.')).toBeInTheDocument();
    expect(
      row.queryByRole('button', { name: 'Quitar' })
    ).not.toBeInTheDocument();
  });

  it('rejects invalid units before saving', async () => {
    render(<PacksPage />);
    const row = within(await screen.findByRole('group', { name: 'Coca 354' }));
    const units = row.getByLabelText('Unidades por bulto');
    await userEvent.clear(units);
    await userEvent.type(units, '1');
    await userEvent.click(row.getByRole('button', { name: 'Guardar' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('entre 2 y 1000');
  });

  it('shows a safe error and keeps edits when saving fails', async () => {
    save.mockRejectedValue(new Error('private server data'));
    render(<PacksPage />);
    const row = within(await screen.findByRole('group', { name: 'Coca 354' }));
    await userEvent.click(row.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo salió mal.'
    );
    expect(row.getByLabelText('Unidades por bulto')).toHaveValue('6');
  });

  it('searches products by normalized name or code', async () => {
    render(<PacksPage />);
    await userEvent.type(
      await screen.findByLabelText('Buscar producto'),
      'AGUA'
    );
    expect(screen.getByRole('group', { name: 'Agua' })).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Coca 354' })
    ).not.toBeInTheDocument();
  });

  it('shows a safe error when loading fails', async () => {
    listForCount.mockRejectedValue(new Error('private'));
    render(<PacksPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo salió mal.'
    );
  });
});
