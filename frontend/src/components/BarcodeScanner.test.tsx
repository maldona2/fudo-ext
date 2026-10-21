import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const { start, stop } = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/barcodeScanner', () => ({ startBarcodeScanner: start }));
import { BarcodeScanner } from './BarcodeScanner';
describe('BarcodeScanner', () => {
  beforeEach(() => {
    start.mockReset().mockResolvedValue({ stop });
    stop.mockReset();
  });
  it('offers manual search and retry after permission is denied', async () => {
    start.mockImplementation(async (options) => {
      options.onError('permission');
      return { stop };
    });
    const close = vi.fn();
    render(<BarcodeScanner onDetected={vi.fn()} onClose={close} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('permiso');
    expect(
      screen.getByRole('button', { name: 'Reintentar' })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Buscar por nombre' })
    );
    expect(close).toHaveBeenCalled();
  });
  it('aborts and stops when unmounted', async () => {
    const view = render(
      <BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />
    );
    await waitFor(() => expect(start).toHaveBeenCalled());
    const signal = start.mock.calls[0][0].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(stop).toHaveBeenCalled();
  });
  it('requires explicit retry after leaving the page', async () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(start).toHaveBeenCalled());
    fireEvent(window, new Event('pagehide'));
    expect(
      await screen.findByRole('button', { name: 'Reintentar' })
    ).toBeInTheDocument();
    expect(start.mock.calls[0][0].signal.aborted).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(start).toHaveBeenCalledTimes(2);
  });
  it('isolates each retry video from a cancelled attempt that settles late', async () => {
    let settleOld!: (session: { stop(): void }) => void;
    let oldVideo!: HTMLVideoElement;
    const newStream = {} as MediaStream;
    start
      .mockImplementationOnce((options) => {
        oldVideo = options.video;
        return new Promise((resolve) => {
          settleOld = resolve;
        });
      })
      .mockImplementationOnce(async (options) => {
        options.video.srcObject = newStream;
        return { stop: vi.fn() };
      });
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    fireEvent(window, new Event('pagehide'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reintentar' })
    );
    const activeVideo = screen.getByLabelText(
      'Vista de la cámara'
    ) as HTMLVideoElement;
    expect(activeVideo.srcObject).toBe(newStream);
    await act(async () =>
      settleOld({
        stop: () => {
          oldVideo.srcObject = null;
        },
      })
    );
    expect(activeVideo.srcObject).toBe(newStream);
    expect(activeVideo).not.toBe(oldVideo);
  });
});
