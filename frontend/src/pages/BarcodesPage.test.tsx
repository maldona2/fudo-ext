import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const { save, remove } = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/api', () => ({
  products: {
    listForCount: async () => [
      {
        id: '14',
        name: 'Coca 500',
        code: '51',
        category: null,
        pack: null,
        barcodes: ['2000000000015'],
      },
    ],
  },
  productBarcodes: { save, remove },
  errorMessage: () => 'Algo salió mal.',
}));
vi.mock('@/components/BarcodeScanner', () => ({
  BarcodeScanner: ({ onDetected }: { onDetected: (raw: string) => void }) => (
    <button onClick={() => onDetected('2000000000022')}>
      Detectar ejemplo
    </button>
  ),
}));
import { BarcodesPage } from './BarcodesPage';
describe('barcode configuration', () => {
  beforeEach(() => {
    save.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
  });
  it('requires a chosen product and reviewed barcode before saving', async () => {
    render(<BarcodesPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Coca 500' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Escanear código' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Detectar ejemplo' })
    );
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Código de barras')).toHaveValue(
      '2000000000022'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar asociación' })
    );
    expect(save).toHaveBeenCalledWith({
      productId: '14',
      barcode: '2000000000022',
    });
    expect(await screen.findByText('Código asociado.')).toBeInTheDocument();
  });
  it('rejects invalid codes without sending a request', async () => {
    render(<BarcodesPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Coca 500' })
    );
    await userEvent.type(screen.getByLabelText('Código de barras'), '123');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar asociación' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('válido');
    expect(save).not.toHaveBeenCalled();
  });
  it('shows barcode conflict copy and preserves the input', async () => {
    save.mockRejectedValue({ isAxiosError: true, response: { status: 409 } });
    render(<BarcodesPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Coca 500' })
    );
    await userEvent.type(
      screen.getByLabelText('Código de barras'),
      '2000000000022'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar asociación' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ya está asociado a otro producto'
    );
    expect(screen.getByLabelText('Código de barras')).toHaveValue(
      '2000000000022'
    );
  });
  it('removes only the chosen association', async () => {
    render(<BarcodesPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Coca 500' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Quitar 2000000000015' })
    );
    expect(remove).toHaveBeenCalledWith({
      productId: '14',
      barcode: '2000000000015',
    });
  });
});
