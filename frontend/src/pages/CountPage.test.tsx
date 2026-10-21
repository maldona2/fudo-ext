import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const create = vi.fn();
const check = vi.fn();
const errorMessage = vi.fn(() => 'Algo salió mal. Probá de nuevo.');
let countListProductIds = ['30', '999', '16'];
let unavailableProductIds: string[] = [];
let detectedCode = '2000000000015';
vi.mock('@/components/BarcodeScanner',()=>({BarcodeScanner:({onDetected,onClose}:{onDetected:(raw:string)=>void;onClose:()=>void})=><div><button onClick={()=>{onDetected(detectedCode);onDetected(detectedCode);}}>Detectar</button><button onClick={onClose}>Cancelar cámara</button></div>}));
let cocaPack: { units: number; label: string } | null = null;

vi.mock('@/lib/api', () => ({
  products: {
    listForCount: async () =>
      [
        { barcodes:['2000000000039'], id: '14', name: 'Carne suave', code: '51', category: 'Empanadas' },
        { barcodes:['2000000000022'], id: '16', name: 'Pollo', code: '53', category: 'Empanadas' },
        {
          id: '30',
          barcodes:['2000000000015'],
          name: 'Coca 1.5L',
          code: '7',
          category: 'Bebidas',
          pack: cocaPack,
        },
      ].filter((product) => !unavailableProductIds.includes(product.id)),
  },
  countLists: {
    list: async () => [
      {
        id: 'list-1',
        name: 'Diario - alto riesgo',
        productIds: countListProductIds,
      },
    ],
  },
  counts: {
    check: (...args: unknown[]) => check(...args),
    create: (...args: unknown[]) => create(...args),
  },
  errorMessage: (...args: unknown[]) => errorMessage(...args),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u', email: 'v@x.com', name: 'Vanessa', role: 'counter' },
  }),
}));

import { CountPage } from './CountPage';

describe('CountPage', () => {
  beforeEach(() => {
    detectedCode = '2000000000015';
    cocaPack = { units: 6, label: 'fardo' };
    localStorage.clear();
    countListProductIds = ['30', '999', '16'];
    unavailableProductIds = [];
    create.mockReset();
    check.mockReset().mockResolvedValue({ checkId: 'check-1', recount: [] });
    errorMessage.mockReset().mockReturnValue('Algo salió mal. Probá de nuevo.');
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
      checkId: 'check-1',
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
      checkId: 'check-1',
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
      checkId: 'check-1',
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
      checkId: 'check-1',
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
      checkId: 'check-1',
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
      checkId: 'check-1',
    });
  });

  it('asks to recount flagged products without saying if there is more or less', async () => {
    check.mockResolvedValue({ checkId: 'check-2', recount: ['16'] });
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Carne suave/ }),
      '8'
    );
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      '123'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(check).toHaveBeenCalledWith({
      entries: [
        { productId: '14', counted: 8 },
        { productId: '16', counted: 123 },
      ],
    });
    expect(
      await screen.findByText(
        'Volvé a contar 1 producto. Contalos de nuevo con calma.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Pollo/ })).toHaveValue('');
    expect(
      screen.queryByRole('textbox', { name: /Carne suave/ })
    ).not.toBeInTheDocument();
    const visibleText = document.body.textContent?.toLowerCase() ?? '';
    expect(visibleText).not.toMatch(/falta|sobra|sistema/);
    expect(visibleText).not.toContain('123');
    expect(localStorage.getItem('count-recount')).toBe(
      JSON.stringify({
        checkId: 'check-2',
        ids: ['16'],
        phase: 'active',
        entryIds: ['14', '16'],
      })
    );
    expect(localStorage.getItem('count-draft')).toBe('{"14":"8"}');
    expect(create).not.toHaveBeenCalled();
  });

  it('saves with the check id after the recount', async () => {
    check.mockResolvedValue({ checkId: 'check-2', recount: ['16'] });
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
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      '4'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(check).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '16', counted: 4 }],
      checkId: 'check-2',
    });
    expect(localStorage.getItem('count-recount')).toBeNull();
  });

  it('saves right away when nothing needs a recount', async () => {
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

    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '16', counted: 3 }],
      checkId: 'check-1',
    });
    expect(screen.queryByText(/Volvé a contar/)).not.toBeInTheDocument();
  });

  it('resumes the recount after a reload', async () => {
    localStorage.setItem(
      'count-recount',
      JSON.stringify({
        checkId: 'check-2',
        ids: ['16'],
        phase: 'active',
        entryIds: ['16'],
      })
    );
    localStorage.setItem(
      'count-draft',
      JSON.stringify({ '14': '8', '16': '' })
    );
    const first = render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('textbox', { name: /Pollo/ })).toHaveValue(
      ''
    );
    expect(
      screen.queryByRole('textbox', { name: /Carne suave/ })
    ).not.toBeInTheDocument();
    first.unmount();

    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('textbox', { name: /Pollo/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /Carne suave/ })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('count-recount')).toBe(
      JSON.stringify({
        checkId: 'check-2',
        ids: ['16'],
        phase: 'active',
        entryIds: ['16'],
      })
    );
  });

  it('clears flagged loose and pack drafts while hydrating a recount', async () => {
    localStorage.setItem(
      'count-recount',
      JSON.stringify({
        checkId: 'check-2',
        ids: ['30'],
        phase: 'resetting',
        entryIds: ['30'],
      })
    );
    localStorage.setItem(
      'count-draft',
      JSON.stringify({ '14': '8', '30': '2' })
    );
    localStorage.setItem('count-draft-packs', JSON.stringify({ '30': '3' }));
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Sueltas de Coca 1.5L')).toHaveValue(
      ''
    );
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('');
    expect(screen.getByText('Llevás 0 de 1')).toBeInTheDocument();
    expect(localStorage.getItem('count-draft')).not.toContain('"30"');
    expect(localStorage.getItem('count-draft-packs')).not.toContain('"30"');
    expect(
      JSON.parse(localStorage.getItem('count-recount') ?? '{}')
    ).toMatchObject({
      phase: 'active',
      entryIds: ['30'],
    });
    expect(
      screen.getByRole('button', { name: 'Guardar conteo' })
    ).toBeDisabled();
  });

  it('preserves second loose and pack recount values after a reload', async () => {
    check.mockResolvedValue({ checkId: 'check-2', recount: ['30'] });
    create.mockResolvedValue({ id: 'c1' });
    const first = render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(
      await screen.findByLabelText('Sueltas de Coca 1.5L'),
      '2'
    );
    await userEvent.type(screen.getByLabelText('Fardos de Coca 1.5L'), '1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    await userEvent.clear(await screen.findByLabelText('Sueltas de Coca 1.5L'));
    await userEvent.type(screen.getByLabelText('Sueltas de Coca 1.5L'), '3');
    await userEvent.type(screen.getByLabelText('Fardos de Coca 1.5L'), '2');
    first.unmount();

    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Sueltas de Coca 1.5L')).toHaveValue(
      '3'
    );
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );
    expect(create).toHaveBeenCalledWith({
      entries: [{ productId: '30', counted: 15 }],
      checkId: 'check-2',
    });
  });

  it('requires a fresh check for legacy recount state without an entry scope', async () => {
    localStorage.setItem('count-list', 'list-1');
    localStorage.setItem(
      'count-recount',
      JSON.stringify({ checkId: 'check-2', ids: ['16'] })
    );
    localStorage.setItem(
      'count-draft',
      JSON.stringify({ '14': '8', '16': '4' })
    );
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        'El recuento anterior no se puede retomar con seguridad. Empezá de nuevo para revisar todos los productos.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar conteo' })
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Empezar de nuevo' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(check).toHaveBeenCalledWith({
      entries: [
        { productId: '14', counted: 8 },
        { productId: '16', counted: 4 },
      ],
    });
    expect(create).toHaveBeenCalledWith({
      entries: [
        { productId: '14', counted: 8 },
        { productId: '16', counted: 4 },
      ],
      checkId: 'check-1',
    });
  });

  it('keeps a required recount product visible and included when list membership changes', async () => {
    countListProductIds = ['30', '16'];
    localStorage.setItem('count-list', 'list-1');
    localStorage.setItem(
      'count-recount',
      JSON.stringify({
        checkId: 'check-2',
        ids: ['14'],
        entryIds: ['30', '14', '16'],
      })
    );
    localStorage.setItem(
      'count-draft',
      JSON.stringify({ '14': '', '16': '7', '30': '5' })
    );
    create.mockResolvedValue({ id: 'c1' });
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    const carne = await screen.findByRole('textbox', { name: /Carne suave/ });
    expect(carne).toHaveValue('');
    expect(
      screen.queryByRole('textbox', { name: /Pollo/ })
    ).not.toBeInTheDocument();
    await userEvent.type(carne, '4');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(create).toHaveBeenCalledWith({
      entries: expect.arrayContaining([
        { productId: '30', counted: 5 },
        { productId: '14', counted: 4 },
        { productId: '16', counted: 7 },
      ]),
      checkId: 'check-2',
      listId: 'list-1',
    });
    expect(create.mock.calls[0][0].entries).toHaveLength(3);
  });

  it('offers a safe restart when a required product is no longer countable', async () => {
    countListProductIds = ['30', '16'];
    unavailableProductIds = ['14'];
    localStorage.setItem('count-list', 'list-1');
    localStorage.setItem(
      'count-recount',
      JSON.stringify({ checkId: 'check-2', ids: ['14'], entryIds: ['14'] })
    );
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        'Algunos productos que necesitabas volver a contar ya no están disponibles. Empezá de nuevo para continuar.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar conteo' })
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Empezar de nuevo' })
    );
    expect(localStorage.getItem('count-recount')).toBeNull();
  });

  it('shows the server message for an expired recount and lets the counter start again', async () => {
    localStorage.setItem(
      'count-recount',
      JSON.stringify({
        checkId: 'expired-check',
        ids: ['16'],
        phase: 'active',
        entryIds: ['16'],
      })
    );
    create.mockRejectedValue(new Error('expired'));
    errorMessage.mockReturnValue('El recuento venció. Volvé a empezar.');
    render(
      <MemoryRouter>
        <CountPage />
      </MemoryRouter>
    );

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Pollo/ }),
      '4'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar conteo' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El recuento venció. Volvé a empezar.'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Empezar de nuevo' })
    );
    expect(localStorage.getItem('count-recount')).toBeNull();
    expect(
      await screen.findByRole('textbox', { name: /Carne suave/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Pollo/ })).toHaveValue('4');
  });
  it('selects a scanned product after search without changing pack or loose drafts',async()=>{
    render(<MemoryRouter><CountPage/></MemoryRouter>);
    await userEvent.type(await screen.findByLabelText('Sueltas de Coca 1.5L'),'3');
    await userEvent.type(screen.getByLabelText('Fardos de Coca 1.5L'),'2');
    await userEvent.type(screen.getByRole('searchbox'),'Pollo');
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Detectar'}));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByLabelText('Sueltas de Coca 1.5L')).toHaveValue('3');
    expect(screen.getByLabelText('Fardos de Coca 1.5L')).toHaveValue('2');
    expect(screen.getByText('= 15 u.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sueltas de Coca 1.5L')).toHaveFocus();
  });
  it('does not include an out-of-list scan or unknown code in the draft',async()=>{
    render(<MemoryRouter><CountPage/></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button',{name:'Diario - alto riesgo'}));
    detectedCode='2000000000039';
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Detectar'}));
    expect(screen.getByRole('alert')).toHaveTextContent('no pertenece a esta lista');
    expect(screen.queryByRole('textbox', {name: /Carne suave/})).not.toBeInTheDocument();
    expect(localStorage.getItem('count-draft')).toBe('{}');
    detectedCode='2000000000046';
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Detectar'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Código no asociado');
  });
  it('scans only required recount products and preserves original non-recounted entries',async()=>{
    check.mockResolvedValue({checkId:'check-scan',recount:['16']}); create.mockResolvedValue({id:'c1'});
    render(<MemoryRouter><CountPage/></MemoryRouter>);
    await userEvent.type(await screen.findByRole('textbox', {name: /Carne suave/}),'8');
    await userEvent.type(screen.getByRole('textbox', {name: /Pollo/}),'123');
    await userEvent.click(screen.getByRole('button',{name:'Guardar conteo'}));
    await screen.findByText(/Volvé a contar 1 producto/);
    expect(screen.getByRole('textbox', {name: /Pollo/})).toHaveValue('');
    expect(document.body.textContent).not.toMatch(/123|Faltan|Sobran|esperado/);
    detectedCode='2000000000015';
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Detectar'}));
    expect(screen.getByRole('alert')).toHaveTextContent('no está entre los que tenés que volver a contar');
    detectedCode='2000000000022';
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Detectar'}));
    await userEvent.type(screen.getByRole('textbox', {name: /Pollo/}),'4');
    await userEvent.click(screen.getByRole('button',{name:'Guardar conteo'}));
    expect(create).toHaveBeenCalledWith({checkId:'check-scan',entries:[{productId:'14',counted:8},{productId:'16',counted:4}]});
  });
  it('keeps quantities when camera is cancelled',async()=>{
    render(<MemoryRouter><CountPage/></MemoryRouter>);
    await userEvent.type(await screen.findByRole('textbox', {name: /Pollo/}),'7');
    await userEvent.click(screen.getByRole('button',{name:'Escanear'}));
    await userEvent.click(screen.getByRole('button',{name:'Cancelar cámara'}));
    expect(screen.getByRole('textbox', {name: /Pollo/})).toHaveValue('7');
  });

});
