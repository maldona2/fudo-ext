export type ScannerError =
  | 'permission'
  | 'unavailable'
  | 'insecure'
  | 'failure';

export async function startBarcodeScanner({
  video,
  signal,
  onCode,
  onError,
}: {
  video: HTMLVideoElement;
  signal: AbortSignal;
  onCode(raw: string): void;
  onError(error: ScannerError): void;
}): Promise<{ stop(): void }> {
  let stopped = false;
  let stream: MediaStream | undefined;
  let controls: { stop(): void } | undefined;
  const stop = () => {
    stopped = true;
    controls?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    signal.removeEventListener('abort', stop);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', stop);
  };
  const hidden = () => {
    if (document.hidden) stop();
  };
  if (signal.aborted) return { stop };
  signal.addEventListener('abort', stop, { once: true });
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', stop);
  try {
    if (!window.isSecureContext) {
      onError('insecure');
      stop();
      return { stop };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('unavailable');
      stop();
      return { stop };
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    if (stopped) {
      stop();
      return { stop };
    }
    const [
      { BrowserMultiFormatReader },
      {
        BarcodeFormat,
        DecodeHintType,
        NotFoundException,
        ChecksumException,
        FormatException,
      },
    ] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    if (stopped) {
      stop();
      return { stop };
    }
    const hints = new Map([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A],
      ],
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    controls = await reader.decodeFromStream(stream, video, (result, error) => {
      if (stopped) return;
      if (
        error &&
        !(
          error instanceof NotFoundException ||
          error instanceof ChecksumException ||
          error instanceof FormatException
        )
      ) {
        stop();
        onError('failure');
        return;
      }
      if (!result) return;
      const raw = result.getText();
      stop();
      onCode(raw);
    });
    if (stopped) stop();
  } catch (error) {
    if (!stopped) {
      const name = error instanceof Error ? error.name : '';
      onError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'permission'
          : name === 'NotFoundError' ||
              name === 'NotReadableError' ||
              name === 'OverconstrainedError'
            ? 'unavailable'
            : 'failure'
      );
    }
    stop();
  }
  return { stop };
}
