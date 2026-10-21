import { beforeEach, describe, expect, it, vi } from 'vitest';
const { decode, stopReader } = vi.hoisted(() => ({
  decode: vi.fn(),
  stopReader: vi.fn(),
}));
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = decode;
  },
}));
import { startBarcodeScanner } from './barcodeScanner';

describe('camera lifecycle', () => {
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn();
  beforeEach(() => {
    stopTrack.mockReset();
    stopReader.mockReset();
    getUserMedia.mockReset().mockResolvedValue(stream);
    decode.mockReset().mockResolvedValue({ stop: stopReader });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
  });
  const options = () => ({
    video: document.createElement('video'),
    signal: new AbortController().signal,
    onCode: vi.fn(),
    onError: vi.fn(),
  });
  it('stops tracks when cancelled before permission resolves', async () => {
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((r) => {
        resolve = r;
      })
    );
    const controller = new AbortController();
    const settings = { ...options(), signal: controller.signal };
    const pending = startBarcodeScanner(settings);
    controller.abort();
    resolve(stream);
    await pending;
    expect(stopTrack).toHaveBeenCalled();
    expect(settings.onCode).not.toHaveBeenCalled();
  });
  it('emits one result and releases the camera even on repeated frames', async () => {
    const settings = options();
    const controls = await startBarcodeScanner(settings);
    const callback = decode.mock.calls[0][2];
    callback({ getText: () => '2000000000015' });
    callback({ getText: () => '2000000000015' });
    expect(settings.onCode).toHaveBeenCalledTimes(1);
    expect(settings.onCode).toHaveBeenCalledWith('2000000000015');
    expect(stopTrack).toHaveBeenCalled();
    controls.stop();
  });
  it.each([
    ['NotAllowedError', 'permission'],
    ['NotFoundError', 'unavailable'],
    ['NotReadableError', 'unavailable'],
    ['Error', 'failure'],
  ])('maps %s safely', async (name, code) => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('private browser text'), { name })
    );
    const settings = options();
    await startBarcodeScanner(settings);
    expect(settings.onError).toHaveBeenCalledWith(code);
  });
  it('cleans up when decoder startup fails after camera acquisition', async () => {
    decode.mockRejectedValue(new Error('decoder failed'));
    const settings = options();
    await startBarcodeScanner(settings);
    expect(settings.onError).toHaveBeenCalledWith('failure');
    expect(stopTrack).toHaveBeenCalled();
  });
  it('does not request media on insecure pages', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });
    const settings = options();
    await startBarcodeScanner(settings);
    expect(settings.onError).toHaveBeenCalledWith('insecure');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it('releases camera on pagehide and ignores late decoder results', async () => {
    const settings = options();
    await startBarcodeScanner(settings);
    window.dispatchEvent(new Event('pagehide'));
    decode.mock.calls[0][2]({ getText: () => '2000000000015' });
    expect(stopTrack).toHaveBeenCalled();
    expect(settings.onCode).not.toHaveBeenCalled();
  });
});
